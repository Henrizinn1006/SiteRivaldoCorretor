<?php
declare(strict_types=1);

namespace App\Core;

use App\Repositories\UserRepository;

defined('APP_ROOT') || exit;

/**
 * Autenticação e autorização. TODA verificação de permissão acontece aqui,
 * no servidor — o JavaScript do painel apenas reflete o resultado.
 */
final class Auth
{
    /**
     * Hash bcrypt válido de uma senha aleatória descartada.
     * Usado quando o e-mail não existe, para que o tempo de resposta seja
     * o mesmo (impede descobrir quais e-mails estão cadastrados).
     */
    private const DUMMY_HASH = '$2y$12$r7caas.Iz.WhziRSUS0vo.15yNPuYxKMZIbe9EBk3T6s9TD1g6yT2';

    private static ?array $user = null;
    private static bool $resolved = false;

    /**
     * Tenta autenticar por nome de usuário OU e-mail.
     * Lança 401/429 em falha; retorna o usuário público em sucesso.
     */
    public static function attempt(string $login, string $password): array
    {
        // Chave usada no limite de tentativas (sem diferenciar maiúsculas).
        $key = mb_strtolower(trim($login));
        $ip = Request::ip();

        self::guardAgainstBruteForce($key, $ip);

        $user = UserRepository::findForLogin($login);
        $hash = $user['password_hash'] ?? self::DUMMY_HASH;
        $valid = password_verify($password, $hash) && $user !== null && (int) $user['active'] === 1;

        self::recordAttempt($key, $ip, $valid);

        if (!$valid) {
            ActivityLog::record('login_failed', 'user', $user ? (int) $user['id'] : null, ['login' => $key], $user ? (int) $user['id'] : null);
            throw new HttpException(401, 'Usuário ou senha incorretos.');
        }

        // Atualiza o hash se o PHP passou a usar um algoritmo/custo mais forte.
        if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
            UserRepository::updatePassword((int) $user['id'], $password);
        }

        // Nova sessão limpa → impede fixação de sessão.
        Session::regenerate();
        $_SESSION = [];
        $_SESSION['user_id']       = (int) $user['id'];
        $_SESSION['role']          = $user['role'];
        $_SESSION['login_at']      = time();
        $_SESSION['last_activity'] = time();
        Csrf::regenerate();

        UserRepository::touchLogin((int) $user['id']);
        ActivityLog::record('login', 'user', (int) $user['id']);

        self::$user = UserRepository::find((int) $user['id']);
        self::$resolved = true;

        return UserRepository::toPublic($user);
    }

    /** Usuário logado (conferido no banco a cada requisição) ou null. */
    public static function user(): ?array
    {
        if (self::$resolved) {
            return self::$user;
        }
        self::$resolved = true;

        $id = (int) ($_SESSION['user_id'] ?? 0);
        if ($id <= 0) {
            return self::$user = null;
        }

        $user = UserRepository::find($id);
        if (!$user || (int) $user['active'] !== 1) {
            // Usuário removido/desativado: encerra a sessão imediatamente.
            Session::destroy();
            return self::$user = null;
        }
        $_SESSION['role'] = $user['role']; // mudanças de papel valem na hora
        return self::$user = $user;
    }

    public static function id(): ?int
    {
        $user = self::user();
        return $user ? (int) $user['id'] : null;
    }

    /**
     * Exige login. 401 caso contrário.
     * Quem ainda não criou a senha pessoal (1º acesso) só acessa os endpoints que
     * definem ALLOW_PENDING_PASSWORD (me, logout, troca de senha) → 403 nos demais.
     */
    public static function requireUser(): array
    {
        $user = self::user();
        if (!$user) {
            throw Session::wasExpired()
                ? new HttpException(401, 'Sua sessão expirou por inatividade. Entre novamente.', ['session' => 'expired'])
                : HttpException::unauthorized('Faça login para continuar.');
        }
        if (!empty($user['must_change_password']) && !defined('ALLOW_PENDING_PASSWORD')) {
            throw new HttpException(403, 'Crie sua senha pessoal antes de continuar.', ['password_change' => 'required']);
        }
        return $user;
    }

    /** Só o provedor (Vortexis): gerencia usuários e libera trocas de senha. */
    public static function requireProvider(): array
    {
        $user = self::requireUser();
        if (empty($user['is_provider'])) {
            throw HttpException::forbidden('Somente o provedor do sistema pode fazer isso.');
        }
        return $user;
    }

    /** Exige um dos papéis informados. 403 caso contrário. */
    public static function requireRole(string ...$roles): array
    {
        $user = self::requireUser();
        if (!in_array($user['role'], $roles, true)) {
            throw HttpException::forbidden();
        }
        return $user;
    }

    /** Atalho para qualquer operação de escrita do painel. */
    public static function requireWrite(string ...$roles): array
    {
        Request::verifySameOrigin();
        $user = $roles ? self::requireRole(...$roles) : self::requireUser();
        Csrf::verify();
        return $user;
    }

    public static function logout(): void
    {
        if ($id = self::id()) {
            ActivityLog::record('logout', 'user', $id, null, $id);
        }
        Session::destroy();
        self::$user = null;
    }

    // ------------------------------------------------------------------ //

    private static function guardAgainstBruteForce(string $email, string $ip): void
    {
        $max = (int) Config::get('login.max_attempts', 5);
        $window = (int) Config::get('login.window_minutes', 15);

        $row = Database::fetch(
            'SELECT
                SUM(email = :email) AS by_email,
                COUNT(*)            AS by_ip
             FROM login_attempts
             WHERE success = 0
               AND attempted_at > (NOW() - INTERVAL :window MINUTE)
               AND (email = :email2 OR ip_address = :ip)',
            ['email' => $email, 'email2' => $email, 'ip' => $ip, 'window' => $window]
        );

        // Limite por conta (usuário/e-mail digitado) e um limite mais largo por IP.
        if ((int) ($row['by_email'] ?? 0) >= $max || (int) ($row['by_ip'] ?? 0) >= $max * 4) {
            throw new HttpException(
                429,
                "Muitas tentativas de login. Aguarde {$window} minutos e tente novamente.",
                [],
                ['Retry-After' => (string) ($window * 60)]
            );
        }
    }

    private static function recordAttempt(string $email, string $ip, bool $success): void
    {
        Database::run(
            'INSERT INTO login_attempts (email, ip_address, success) VALUES (:email, :ip, :success)',
            ['email' => mb_substr($email, 0, 190), 'ip' => $ip, 'success' => $success ? 1 : 0]
        );

        if ($success) {
            // Login correto zera o contador de falhas desta conta.
            Database::run('DELETE FROM login_attempts WHERE email = :email AND success = 0', ['email' => $email]);
        }

        // Limpeza ocasional (1% das requisições) para a tabela não crescer sem fim.
        if (random_int(1, 100) === 1) {
            Database::run('DELETE FROM login_attempts WHERE attempted_at < (NOW() - INTERVAL 30 DAY)');
        }
    }
}

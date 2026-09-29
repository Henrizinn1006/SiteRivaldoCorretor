<?php
declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;
use App\Core\Str;

defined('APP_ROOT') || exit;

/** Acesso à tabela users. Nunca retorna password_hash para fora (exceto findForLogin). */
final class UserRepository
{
    private const PUBLIC_COLUMNS = 'id, name, username, email, role, is_provider, active, must_change_password,
        password_change_allowed, last_login_at, created_at, updated_at';

    /** Nome de usuário: letras, números, ponto, hífen e sublinhado (3 a 40). */
    public const USERNAME_PATTERN = '/^[A-Za-z0-9._-]{3,40}$/';

    /** Busca pelo nome de usuário (sem diferenciar maiúsculas) ou pelo e-mail. */
    public static function findForLogin(string $login): ?array
    {
        $login = trim($login);
        return Database::fetch(
            'SELECT id, name, username, email, role, is_provider, active, must_change_password, password_change_allowed, password_hash
               FROM users
              WHERE username = :username OR email = :email
              LIMIT 1',
            ['username' => $login, 'email' => Str::normalizeEmail($login)]
        );
    }

    public static function find(int $id): ?array
    {
        return Database::fetch('SELECT ' . self::PUBLIC_COLUMNS . ' FROM users WHERE id = :id', ['id' => $id]);
    }

    public static function emailExists(string $email, ?int $ignoreId = null): bool
    {
        return (bool) Database::value(
            'SELECT 1 FROM users WHERE email = :email AND id <> :ignore LIMIT 1',
            ['email' => Str::normalizeEmail($email), 'ignore' => $ignoreId ?? 0]
        );
    }

    public static function usernameExists(string $username, ?int $ignoreId = null): bool
    {
        return (bool) Database::value(
            'SELECT 1 FROM users WHERE username = :username AND id <> :ignore LIMIT 1',
            ['username' => trim($username), 'ignore' => $ignoreId ?? 0]
        );
    }

    public static function count(): int
    {
        return (int) Database::value('SELECT COUNT(*) FROM users');
    }

    /**
     * Cria um usuário. $mustChange = true obriga a criar a senha pessoal no 1º acesso.
     */
    public static function create(
        string $name,
        ?string $email,
        string $password,
        string $role = 'editor',
        ?string $username = null,
        bool $mustChange = false,
        bool $isProvider = false
    ): int {
        $email = self::cleanEmail($email);
        $username = self::cleanUsername($username);
        return Database::insert(
            'INSERT INTO users (name, username, email, password_hash, role, is_provider, active, must_change_password, password_change_allowed)
             VALUES (:name, :username, :email, :hash, :role, :provider, 1, :must, 0)',
            [
                'name'     => trim($name),
                'username' => $username,
                'email'    => $email,
                'hash'     => password_hash($password, PASSWORD_DEFAULT),
                'role'     => in_array($role, ['admin', 'editor'], true) ? $role : 'editor',
                'provider' => $isProvider ? 1 : 0,
                'must'     => $mustChange ? 1 : 0,
            ]
        );
    }

    public static function updatePassword(int $id, string $password): void
    {
        Database::run(
            'UPDATE users SET password_hash = :hash WHERE id = :id',
            ['hash' => password_hash($password, PASSWORD_DEFAULT), 'id' => $id]
        );
    }

    /** Depois que a pessoa troca a senha: sai do "primeiro acesso" e a liberação é consumida. */
    public static function completePasswordChange(int $id): void
    {
        Database::run(
            'UPDATE users SET must_change_password = 0, password_change_allowed = 0 WHERE id = :id',
            ['id' => $id]
        );
    }

    /** Provedor redefiniu a senha: a pessoa cria a própria senha no próximo acesso. */
    public static function requirePasswordChange(int $id): void
    {
        Database::run('UPDATE users SET must_change_password = 1, password_change_allowed = 0 WHERE id = :id', ['id' => $id]);
    }

    public static function setPasswordChangeAllowed(int $id, bool $allowed): void
    {
        Database::run(
            'UPDATE users SET password_change_allowed = :allowed WHERE id = :id',
            ['allowed' => $allowed ? 1 : 0, 'id' => $id]
        );
    }

    public static function touchLogin(int $id): void
    {
        Database::run('UPDATE users SET last_login_at = NOW() WHERE id = :id', ['id' => $id]);
    }

    public static function all(): array
    {
        $rows = Database::fetchAll('SELECT ' . self::PUBLIC_COLUMNS . ' FROM users ORDER BY is_provider, active DESC, name');
        return array_map(static fn(array $u): array => self::toPublic($u) + [
            'active'        => (bool) $u['active'],
            'last_login_at' => $u['last_login_at'],
            'created_at'    => $u['created_at'],
        ], $rows);
    }

    public static function update(int $id, array $fields): void
    {
        $allowed = array_intersect_key($fields, array_flip(['name', 'username', 'email', 'role', 'active']));
        if (array_key_exists('email', $allowed)) {
            $allowed['email'] = self::cleanEmail($allowed['email']);
        }
        if (array_key_exists('username', $allowed)) {
            $allowed['username'] = self::cleanUsername($allowed['username']);
        }
        if (isset($allowed['active'])) {
            $allowed['active'] = $allowed['active'] ? 1 : 0;
        }
        if (!$allowed) {
            return;
        }
        $sets = implode(', ', array_map(static fn($c) => "{$c} = :{$c}", array_keys($allowed)));
        Database::run("UPDATE users SET {$sets} WHERE id = :id", $allowed + ['id' => $id]);
    }

    public static function passwordHash(int $id): ?string
    {
        $hash = Database::value('SELECT password_hash FROM users WHERE id = :id', ['id' => $id]);
        return $hash ? (string) $hash : null;
    }

    /** Administradores ativos, opcionalmente ignorando um usuário. */
    public static function activeAdminCount(int $ignoreId = 0): int
    {
        return (int) Database::value(
            "SELECT COUNT(*) FROM users WHERE role = 'admin' AND active = 1 AND id <> :id",
            ['id' => $ignoreId]
        );
    }

    public static function delete(int $id): void
    {
        Database::run('DELETE FROM users WHERE id = :id', ['id' => $id]);
    }

    /** O provedor sempre pode trocar a própria senha; os demais, só no 1º acesso ou com liberação. */
    public static function canChangePassword(array $user): bool
    {
        return !empty($user['is_provider'])
            || !empty($user['must_change_password'])
            || !empty($user['password_change_allowed']);
    }

    /** Formato seguro para enviar ao front-end. */
    public static function toPublic(array $user): array
    {
        return [
            'id'                      => (int) $user['id'],
            'name'                    => $user['name'],
            'username'                => $user['username'] ?? null,
            'email'                   => $user['email'] ?? null,
            'role'                    => $user['role'],
            'is_provider'             => !empty($user['is_provider']),
            'must_change_password'    => !empty($user['must_change_password']),
            'password_change_allowed' => !empty($user['password_change_allowed']),
            'can_change_password'     => self::canChangePassword($user),
        ];
    }

    private static function cleanEmail(?string $email): ?string
    {
        $email = $email === null ? '' : Str::normalizeEmail($email);
        return $email === '' ? null : $email;
    }

    private static function cleanUsername(?string $username): ?string
    {
        $username = trim((string) $username);
        return $username === '' ? null : $username;
    }
}

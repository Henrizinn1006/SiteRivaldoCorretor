<?php
declare(strict_types=1);

namespace App\Core;

defined('APP_ROOT') || exit;

/**
 * Sessão PHP com cookie seguro e expiração por inatividade/tempo absoluto.
 */
final class Session
{
    private static bool $expired = false;

    public static function start(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }

        ini_set('session.use_strict_mode', '1');   // rejeita IDs de sessão inventados
        ini_set('session.use_only_cookies', '1');
        ini_set('session.use_trans_sid', '0');
        ini_set('session.cookie_httponly', '1');
        ini_set('session.gc_maxlifetime', (string) Config::get('session.absolute_timeout', 43200));

        session_name((string) Config::get('session.name', 'rv_admin'));
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'secure'   => Request::isHttps(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();

        self::enforceTimeouts();
    }

    private static function enforceTimeouts(): void
    {
        if (empty($_SESSION['user_id'])) {
            return;
        }
        $now = time();
        $idle = (int) Config::get('session.idle_timeout', 7200);
        $absolute = (int) Config::get('session.absolute_timeout', 43200);

        $lastActivity = (int) ($_SESSION['last_activity'] ?? 0);
        $loginAt = (int) ($_SESSION['login_at'] ?? 0);

        if (($now - $lastActivity) > $idle || ($now - $loginAt) > $absolute) {
            self::destroy();
            self::$expired = true;
            self::start(); // sessão nova e vazia
            return;
        }
        $_SESSION['last_activity'] = $now;
    }

    public static function wasExpired(): bool
    {
        return self::$expired;
    }

    /** Novo ID após login (evita fixação de sessão). */
    public static function regenerate(): void
    {
        session_regenerate_id(true);
    }

    public static function destroy(): void
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            return;
        }
        $_SESSION = [];
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires'  => time() - 42000,
            'path'     => $params['path'],
            'domain'   => $params['domain'],
            'secure'   => $params['secure'],
            'httponly' => $params['httponly'],
            'samesite' => $params['samesite'] ?? 'Lax',
        ]);
        session_destroy();
    }
}

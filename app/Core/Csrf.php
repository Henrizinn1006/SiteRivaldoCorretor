<?php
declare(strict_types=1);

namespace App\Core;

defined('APP_ROOT') || exit;

/**
 * Token CSRF por sessão (synchronizer token).
 * O painel recebe o token em /api/auth/me.php, guarda só em memória
 * e o envia no cabeçalho X-CSRF-Token em toda operação de escrita.
 */
final class Csrf
{
    private const KEY = '_csrf';

    public static function token(): string
    {
        if (empty($_SESSION[self::KEY])) {
            $_SESSION[self::KEY] = bin2hex(random_bytes(32));
        }
        return $_SESSION[self::KEY];
    }

    public static function regenerate(): string
    {
        $_SESSION[self::KEY] = bin2hex(random_bytes(32));
        return $_SESSION[self::KEY];
    }

    /** Valida o token do cabeçalho (ou campo _csrf em formulários multipart). */
    public static function verify(): void
    {
        $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_POST['_csrf'] ?? '');
        $expected = $_SESSION[self::KEY] ?? '';
        if (!is_string($sent) || $expected === '' || !hash_equals($expected, $sent)) {
            // 403 (e não 419): Apache/LiteSpeed transformam códigos não-padrão em erro 500.
            throw new HttpException(403, 'Sua sessão de segurança expirou. Recarregue a página e tente novamente.', ['csrf' => 'invalid']);
        }
    }
}

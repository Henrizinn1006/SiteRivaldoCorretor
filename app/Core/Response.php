<?php
declare(strict_types=1);

namespace App\Core;

defined('APP_ROOT') || exit;

/**
 * Respostas JSON padronizadas:
 *   { "success": true,  "message": "...", "data": {...} }
 *   { "success": false, "message": "...", "errors": {...} }
 */
final class Response
{
    private static int $cacheSeconds = 0;

    /** Endpoints públicos podem ser cacheados pelo navegador por alguns segundos. */
    public static function cacheFor(int $seconds): void
    {
        self::$cacheSeconds = max(0, $seconds);
    }

    public static function success(string $message = '', mixed $data = null, int $status = 200): void
    {
        self::json(['success' => true, 'message' => $message, 'data' => $data ?? new \stdClass()], $status);
    }

    public static function error(string $message, int $status = 400, array $errors = [], array $headers = []): void
    {
        foreach ($headers as $name => $value) {
            header($name . ': ' . $value);
        }
        self::json([
            'success' => false,
            'message' => $message,
            'errors'  => $errors ?: new \stdClass(),
        ], $status);
    }

    public static function json(array $payload, int $status = 200): void
    {
        if (!headers_sent()) {
            http_response_code($status);
            header('Content-Type: application/json; charset=utf-8');
            self::securityHeaders();
        }
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        exit;
    }

    /** Cabeçalhos aplicados a toda resposta da API. */
    public static function securityHeaders(): void
    {
        if (self::$cacheSeconds > 0) {
            header('Cache-Control: public, max-age=' . self::$cacheSeconds);
        } else {
            header('Cache-Control: no-store, no-cache, must-revalidate, private');
            header('Pragma: no-cache');
        }
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header('Referrer-Policy: same-origin');
        header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
    }
}

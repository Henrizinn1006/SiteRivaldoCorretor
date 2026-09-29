<?php
declare(strict_types=1);

namespace App\Core;

defined('APP_ROOT') || exit;

/** Leitura segura da requisição. */
final class Request
{
    private const MAX_JSON_BYTES = 1_048_576; // 1 MB

    private static ?array $json = null;

    public static function method(): string
    {
        return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    }

    /** Garante o método HTTP; senão 405. */
    public static function requireMethod(string ...$allowed): void
    {
        $allowed = array_map('strtoupper', $allowed);
        if (!in_array(self::method(), $allowed, true)) {
            throw new HttpException(405, 'Método não permitido.', [], ['Allow' => implode(', ', $allowed)]);
        }
    }

    /** Corpo JSON como array (400 se inválido). */
    public static function json(): array
    {
        if (self::$json !== null) {
            return self::$json;
        }
        $type = $_SERVER['CONTENT_TYPE'] ?? '';
        if (stripos($type, 'application/json') === false) {
            throw new HttpException(415, 'Envie os dados em formato JSON.');
        }
        $raw = file_get_contents('php://input', false, null, 0, self::MAX_JSON_BYTES + 1);
        if ($raw === false || strlen($raw) > self::MAX_JSON_BYTES) {
            throw new HttpException(413, 'Requisição muito grande.');
        }
        if ($raw === '') {
            return self::$json = [];
        }
        try {
            $data = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new HttpException(400, 'JSON inválido.');
        }
        if (!is_array($data)) {
            throw new HttpException(400, 'JSON inválido.');
        }
        return self::$json = $data;
    }

    public static function query(string $key, mixed $default = null): mixed
    {
        $value = $_GET[$key] ?? $default;
        return is_string($value) ? trim($value) : $value;
    }

    /** IP do cliente (REMOTE_ADDR — cabeçalhos de proxy podem ser forjados). */
    public static function ip(): string
    {
        $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
        return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '0.0.0.0';
    }

    public static function isHttps(): bool
    {
        return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (int) ($_SERVER['SERVER_PORT'] ?? 0) === 443
            || strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    }

    /**
     * Para operações de escrita: se o navegador informar Origin/Referer,
     * ele precisa ser o mesmo host do site (camada extra contra CSRF).
     */
    public static function verifySameOrigin(): void
    {
        $source = $_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? '');
        if ($source === '' || $source === 'null') {
            return; // alguns navegadores/PWA não enviam; o token CSRF continua obrigatório
        }
        $sourceHost = parse_url($source, PHP_URL_HOST);
        $sourcePort = parse_url($source, PHP_URL_PORT);
        $host = $_SERVER['HTTP_HOST'] ?? '';
        $expected = $sourceHost . ($sourcePort ? ':' . $sourcePort : '');
        if (!$sourceHost || strcasecmp($expected, $host) !== 0) {
            throw HttpException::forbidden('Origem da requisição não permitida.');
        }
    }
}

<?php
declare(strict_types=1);

namespace App\Core;

defined('APP_ROOT') || exit;

/**
 * Leitor mínimo de arquivo .env (sem dependências / sem Composer).
 *
 * Procura, nesta ordem, e usa o PRIMEIRO que existir:
 *   1. uma pasta ACIMA do site  (ex.: /domains/rivaldoduarte.com.br/.env) — mais seguro
 *   2. na pasta config do site  (ex.: /public_html/config/.env) — pasta bloqueada para a web
 *   3. na raiz do site          (ex.: /public_html/.env) — protegido pelo .htaccess
 *
 * Formato:  CHAVE=valor   ·  aspas "..." ou '...' opcionais  ·  linhas com # são comentários.
 * Os valores ficam só em memória: não vão para getenv()/$_SERVER (não aparecem no phpinfo).
 */
final class Env
{
    private static array $vars = [];
    private static ?string $file = null;

    public static function load(array $candidates): void
    {
        foreach ($candidates as $path) {
            if (@is_file($path) && @is_readable($path)) {   // @: hospedagem pode bloquear pastas fora do site
                self::$file = $path;
                self::$vars = self::parse((string) file_get_contents($path));
                return;
            }
        }
    }

    public static function file(): ?string
    {
        return self::$file;
    }

    public static function has(string $key): bool
    {
        return array_key_exists($key, self::$vars) && self::$vars[$key] !== '';
    }

    public static function get(string $key, ?string $default = null): ?string
    {
        return self::has($key) ? self::$vars[$key] : $default;
    }

    public static function bool(string $key, bool $default = false): bool
    {
        if (!self::has($key)) {
            return $default;
        }
        return in_array(strtolower(self::$vars[$key]), ['1', 'true', 'on', 'yes', 'sim'], true);
    }

    /** Situação do .env para o código de diagnóstico (sem revelar caminhos nem valores). */
    public static function status(): string
    {
        if (self::$file === null) {
            return 'env_nao_encontrado';
        }
        return self::$vars ? 'env_ok' : 'env_vazio_ou_ilegivel';
    }

    private static function parse(string $content): array
    {
        $vars = [];
        // Arquivo salvo em UTF-16 (alguns editores do Windows) → converte para UTF-8
        if (strncmp($content, "\xFF\xFE", 2) === 0 || strncmp($content, "\xFE\xFF", 2) === 0) {
            $from = $content[0] === "\xFF" ? 'UTF-16LE' : 'UTF-16BE';
            $content = function_exists('mb_convert_encoding')
                ? (string) mb_convert_encoding(substr($content, 2), 'UTF-8', $from)
                : (string) @iconv($from, 'UTF-8', substr($content, 2));
        }
        $content = preg_replace('/^\xEF\xBB\xBF/', '', $content); // BOM do Bloco de Notas
        foreach (preg_split('/\R/', (string) $content) as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#') {
                continue;
            }
            if (str_starts_with($line, 'export ')) {
                $line = substr($line, 7);
            }
            $pos = strpos($line, '=');
            if ($pos === false) {
                continue;
            }
            $key = trim(substr($line, 0, $pos));
            if (!preg_match('/^[A-Z][A-Z0-9_]*$/i', $key)) {
                continue;
            }
            $value = trim(substr($line, $pos + 1));
            $quote = $value[0] ?? '';
            if (($quote === '"' || $quote === "'") && ($end = strrpos($value, $quote)) > 0) {
                $value = substr($value, 1, $end - 1);
                if ($quote === '"') {
                    $value = str_replace('\\"', '"', $value);
                }
            } else {
                // Sem aspas: " #" inicia comentário no fim da linha
                $value = rtrim((string) preg_replace('/\s+#.*$/', '', $value));
            }
            $vars[$key] = $value;
        }
        return $vars;
    }
}

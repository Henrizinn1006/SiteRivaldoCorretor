<?php
declare(strict_types=1);

namespace App\Core;

defined('APP_ROOT') || exit;

final class Str
{
    /** "Apartamento Alto Padrão Jardins" → "apartamento-alto-padrao-jardins" */
    public static function slug(string $text, int $maxLength = 160): string
    {
        $map = [
            'á'=>'a','à'=>'a','ã'=>'a','â'=>'a','ä'=>'a','é'=>'e','è'=>'e','ê'=>'e','ë'=>'e',
            'í'=>'i','ì'=>'i','î'=>'i','ï'=>'i','ó'=>'o','ò'=>'o','õ'=>'o','ô'=>'o','ö'=>'o',
            'ú'=>'u','ù'=>'u','û'=>'u','ü'=>'u','ç'=>'c','ñ'=>'n',
        ];
        $text = mb_strtolower(trim($text));
        $text = strtr($text, $map);
        $text = preg_replace('/[^a-z0-9]+/', '-', $text) ?? '';
        $text = trim($text, '-');
        if (strlen($text) > $maxLength) {
            $text = rtrim(substr($text, 0, $maxLength), '-');
        }
        return $text !== '' ? $text : 'item';
    }

    public static function normalizeEmail(string $email): string
    {
        return mb_strtolower(trim($email));
    }

    /** UUID v4 aleatório (nomes de arquivo, tokens públicos). */
    public static function uuid(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
    }
}

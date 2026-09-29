<?php
declare(strict_types=1);

namespace App\Core;

defined('APP_ROOT') || exit;

/**
 * Normalização de valores vindos do cliente (sempre validar depois).
 * Strings vazias viram null; números aceitam "1.234,56" e 1234.56.
 */
final class Input
{
    public static function str(mixed $value, int $max = 0): ?string
    {
        if ($value === null || is_array($value) || is_object($value)) {
            return null;
        }
        $value = trim((string) $value);
        // remove caracteres de controle (exceto quebra de linha e tab)
        $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value) ?? '';
        if ($value === '') {
            return null;
        }
        return $max > 0 ? mb_substr($value, 0, $max) : $value;
    }

    public static function int(mixed $value): ?int
    {
        if ($value === null || $value === '' || is_array($value) || is_bool($value)) {
            return null;
        }
        $int = filter_var($value, FILTER_VALIDATE_INT);
        return $int === false ? null : (int) $int;
    }

    /** Aceita 1234.5, "1234.5", "1.234,50", "R$ 1.234,50". */
    public static function decimal(mixed $value): ?float
    {
        if ($value === null || $value === '' || is_array($value) || is_bool($value)) {
            return null;
        }
        if (is_int($value) || is_float($value)) {
            return (float) $value;
        }
        $s = preg_replace('/[^\d,.\-]/', '', (string) $value) ?? '';
        if ($s === '' || $s === '-') {
            return null;
        }
        if (str_contains($s, ',')) {
            $s = str_replace('.', '', $s);
            $s = str_replace(',', '.', $s);
        }
        return is_numeric($s) ? (float) $s : null;
    }

    public static function bool(mixed $value): bool
    {
        return filter_var($value, FILTER_VALIDATE_BOOLEAN) === true;
    }

    /** Lista de inteiros positivos únicos. */
    public static function intList(mixed $value): array
    {
        if (!is_array($value)) {
            return [];
        }
        $ids = [];
        foreach ($value as $v) {
            $int = self::int($v);
            if ($int !== null && $int > 0) {
                $ids[$int] = $int;
            }
        }
        return array_values($ids);
    }

    public static function digits(mixed $value): ?string
    {
        $s = self::str($value);
        if ($s === null) {
            return null;
        }
        $d = preg_replace('/\D+/', '', $s) ?? '';
        return $d === '' ? null : $d;
    }
}

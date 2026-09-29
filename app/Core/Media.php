<?php
declare(strict_types=1);

namespace App\Core;

defined('APP_ROOT') || exit;

/**
 * Caminhos das imagens de imóveis.
 * Retorna caminhos RELATIVOS à raiz do site (sem barra inicial), para
 * funcionar tanto em domínio próprio quanto em subpasta.
 */
final class Media
{
    public const SIZES = ['lg', 'md', 'sm'];

    public static function dir(int $propertyId): string
    {
        return APP_ROOT . '/uploads/properties/' . $propertyId;
    }

    public static function path(int $propertyId, string $fileKey, string $size): string
    {
        return self::dir($propertyId) . '/' . $fileKey . '-' . $size . '.webp';
    }

    public static function url(int $propertyId, string $fileKey, string $size = 'md'): string
    {
        return 'uploads/properties/' . $propertyId . '/' . rawurlencode($fileKey) . '-' . $size . '.webp';
    }

    /** { lg, md, sm } de uma imagem, ou null. */
    public static function urls(?int $propertyId, ?string $fileKey): ?array
    {
        if (!$propertyId || !$fileKey) {
            return null;
        }
        $urls = [];
        foreach (self::SIZES as $size) {
            $urls[$size] = self::url($propertyId, $fileKey, $size);
        }
        return $urls;
    }
}

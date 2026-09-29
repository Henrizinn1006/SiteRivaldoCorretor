<?php
declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;
use App\Core\Media;

defined('APP_ROOT') || exit;

/** Fotos dos imóveis (metadados; os arquivos ficam em uploads/properties/{id}/). */
final class PropertyImageRepository
{
    public static function forProperty(int $propertyId): array
    {
        $rows = Database::fetchAll(
            'SELECT id, property_id, file_key, width, height, size_bytes, alt_text, sort_order, original_name
               FROM property_images WHERE property_id = :id ORDER BY sort_order, id',
            ['id' => $propertyId]
        );
        return array_map([self::class, 'map'], $rows);
    }

    public static function map(array $r): array
    {
        return [
            'id'            => (int) $r['id'],
            'width'         => $r['width'] !== null ? (int) $r['width'] : null,
            'height'        => $r['height'] !== null ? (int) $r['height'] : null,
            'alt_text'      => $r['alt_text'],
            'sort_order'    => (int) $r['sort_order'],
            'original_name' => $r['original_name'],
            'urls'          => Media::urls((int) $r['property_id'], $r['file_key']),
        ];
    }

    public static function find(int $id): ?array
    {
        return Database::fetch('SELECT * FROM property_images WHERE id = :id', ['id' => $id]);
    }

    public static function count(int $propertyId): int
    {
        return (int) Database::value('SELECT COUNT(*) FROM property_images WHERE property_id = :id', ['id' => $propertyId]);
    }

    public static function create(int $propertyId, string $fileKey, array $meta): int
    {
        $order = (int) Database::value(
            'SELECT COALESCE(MAX(sort_order), -1) + 1 FROM property_images WHERE property_id = :id',
            ['id' => $propertyId]
        );
        return Database::insert(
            'INSERT INTO property_images (property_id, file_key, original_name, mime_type, width, height, size_bytes, sort_order)
             VALUES (:pid, :key, :name, :mime, :w, :h, :size, :ord)',
            [
                'pid'  => $propertyId,
                'key'  => $fileKey,
                'name' => $meta['original_name'] ?? null,
                'mime' => 'image/webp',
                'w'    => $meta['width'] ?? null,
                'h'    => $meta['height'] ?? null,
                'size' => $meta['size'] ?? null,
                'ord'  => $order,
            ]
        );
    }

    public static function delete(int $id): void
    {
        Database::run('DELETE FROM property_images WHERE id = :id', ['id' => $id]);
    }

    /** Grava a nova ordem. $ids precisa conter exatamente as fotos do imóvel. */
    public static function reorder(int $propertyId, array $ids): void
    {
        Database::transaction(static function () use ($propertyId, $ids): void {
            foreach (array_values($ids) as $position => $id) {
                Database::run(
                    'UPDATE property_images SET sort_order = :ord WHERE id = :id AND property_id = :pid',
                    ['ord' => $position, 'id' => (int) $id, 'pid' => $propertyId]
                );
            }
        });
    }

    public static function idsFor(int $propertyId): array
    {
        return array_map('intval', array_column(
            Database::fetchAll('SELECT id FROM property_images WHERE property_id = :id', ['id' => $propertyId]),
            'id'
        ));
    }
}

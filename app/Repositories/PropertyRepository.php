<?php
declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;
use App\Core\Media;

defined('APP_ROOT') || exit;

/** Consultas da tabela properties (listagem, detalhe, estatísticas). */
final class PropertyRepository
{
    public const STATUSES = ['disponivel', 'reservado', 'vendido', 'alugado', 'indisponivel', 'rascunho'];
    public const PUBLIC_STATUSES = ['disponivel', 'reservado'];
    public const TRANSACTIONS = ['venda', 'aluguel'];

    /** Foto de capa: a escolhida ou, na falta dela, a primeira da ordem. */
    public const COVER_JOIN = '
        LEFT JOIN property_images cover ON cover.id = COALESCE(
            p.cover_image_id,
            (SELECT pi.id FROM property_images pi WHERE pi.property_id = p.id ORDER BY pi.sort_order, pi.id LIMIT 1)
        )';

    private const LIST_SELECT = '
        SELECT p.id, p.code, p.title, p.slug, p.transaction_type, p.property_type_id, p.price, p.price_from, p.old_price,
               p.city_id, p.neighborhood_id, p.bedrooms, p.suites, p.bathrooms, p.parking_spaces,
               p.total_area, p.usable_area, p.status, p.featured, p.published_at, p.created_at, p.updated_at,
               t.name AS type_name, c.name AS city_name, c.state AS city_state, n.name AS neighborhood_name,
               n.zone AS neighborhood_zone, cover.file_key AS cover_key,
               (SELECT COUNT(*) FROM property_images ic WHERE ic.property_id = p.id) AS images_count
          FROM properties p
          LEFT JOIN property_types t ON t.id = p.property_type_id
          LEFT JOIN cities c         ON c.id = p.city_id
          LEFT JOIN neighborhoods n  ON n.id = p.neighborhood_id';

    private const SORTS = [
        'recent'     => 'p.created_at DESC, p.id DESC',
        'updated'    => 'p.updated_at DESC, p.id DESC',
        'price_asc'  => 'p.price IS NULL, p.price ASC, p.id DESC',
        'price_desc' => 'p.price DESC, p.id DESC',
        'area_desc'  => 'COALESCE(p.usable_area, p.total_area) DESC, p.id DESC',
        'title'      => 'p.title ASC',
    ];

    /**
     * Listagem paginada.
     * $public = true → só imóveis publicados e com status visível.
     */
    public static function list(array $f, int $page = 1, int $limit = 20, bool $public = false): array
    {
        $where = ['p.deleted_at IS NULL'];
        $params = [];

        if ($public) {
            $where[] = 'p.published_at IS NOT NULL';
            $statuses = in_array($f['status'] ?? '', self::PUBLIC_STATUSES, true) ? [$f['status']] : self::PUBLIC_STATUSES;
            $marks = [];
            foreach ($statuses as $i => $s) {
                $marks[] = ':pst' . $i;
                $params['pst' . $i] = $s;
            }
            $where[] = 'p.status IN (' . implode(',', $marks) . ')';
        } elseif (!empty($f['status']) && in_array($f['status'], self::STATUSES, true)) {
            $where[] = 'p.status = :status';
            $params['status'] = $f['status'];
        }

        if (!empty($f['q'])) {
            $like = '%' . addcslashes((string) $f['q'], '%_\\') . '%';
            $where[] = '(p.code LIKE :q1 OR p.title LIKE :q2 OR n.name LIKE :q3 OR c.name LIKE :q4)';
            $params += ['q1' => $like, 'q2' => $like, 'q3' => $like, 'q4' => $like];
        }
        if (!empty($f['transaction_type']) && in_array($f['transaction_type'], self::TRANSACTIONS, true)) {
            $where[] = 'p.transaction_type = :tt';
            $params['tt'] = $f['transaction_type'];
        }
        foreach (['property_type_id' => 'p.property_type_id', 'city_id' => 'p.city_id', 'neighborhood_id' => 'p.neighborhood_id'] as $key => $col) {
            if (!empty($f[$key])) {
                $where[] = "{$col} = :{$key}";
                $params[$key] = (int) $f[$key];
            }
        }
        if (!empty($f['zone']) && ($zone = LocationRepository::zone($f['zone']))) {
            $where[] = 'n.zone = :zone';
            $params['zone'] = $zone;
        }
        if (isset($f['featured']) && $f['featured'] !== null && $f['featured'] !== '') {
            $where[] = 'p.featured = :featured';
            $params['featured'] = (int) (bool) $f['featured'];
        }
        if (isset($f['min_price']) && $f['min_price'] !== null) {
            $where[] = 'p.price >= :min_price';
            $params['min_price'] = (float) $f['min_price'];
        }
        if (isset($f['max_price']) && $f['max_price'] !== null) {
            $where[] = 'p.price <= :max_price';
            $params['max_price'] = (float) $f['max_price'];
        }
        foreach (['bedrooms' => 'p.bedrooms', 'suites' => 'p.suites', 'bathrooms' => 'p.bathrooms', 'parking_spaces' => 'p.parking_spaces'] as $key => $col) {
            if (!empty($f[$key])) {
                $where[] = "{$col} >= :{$key}";
                $params[$key] = (int) $f[$key];
            }
        }
        if (!empty($f['min_area'])) {
            $where[] = 'COALESCE(p.usable_area, p.total_area) >= :min_area';
            $params['min_area'] = (float) $f['min_area'];
        }

        $whereSql = 'WHERE ' . implode(' AND ', $where);
        $order = self::SORTS[$f['sort'] ?? 'recent'] ?? self::SORTS['recent'];

        $total = (int) Database::value(
            'SELECT COUNT(*) FROM properties p
               LEFT JOIN cities c ON c.id = p.city_id
               LEFT JOIN neighborhoods n ON n.id = p.neighborhood_id ' . $whereSql,
            $params
        );

        $page = max(1, $page);
        $offset = ($page - 1) * $limit;
        $rows = Database::fetchAll(
            self::LIST_SELECT . ' ' . self::COVER_JOIN . " {$whereSql} ORDER BY {$order} LIMIT :limit OFFSET :offset",
            $params + ['limit' => $limit, 'offset' => $offset]
        );

        return [
            'items' => array_map([self::class, 'mapListRow'], $rows),
            'meta'  => [
                'page'  => $page,
                'limit' => $limit,
                'total' => $total,
                'pages' => max(1, (int) ceil($total / $limit)),
            ],
        ];
    }

    public static function mapListRow(array $r): array
    {
        return [
            'id'               => (int) $r['id'],
            'code'             => $r['code'],
            'title'            => $r['title'],
            'slug'             => $r['slug'],
            'transaction_type' => $r['transaction_type'],
            'type'             => $r['property_type_id'] ? ['id' => (int) $r['property_type_id'], 'name' => $r['type_name']] : null,
            'city'             => $r['city_id'] ? ['id' => (int) $r['city_id'], 'name' => $r['city_name'], 'state' => $r['city_state']] : null,
            'neighborhood'     => $r['neighborhood_id'] ? ['id' => (int) $r['neighborhood_id'], 'name' => $r['neighborhood_name'], 'zone' => $r['neighborhood_zone']] : null,
            'price'            => self::num($r['price']),
            'price_from'       => (bool) $r['price_from'],
            'old_price'        => self::num($r['old_price']),
            'bedrooms'         => (int) $r['bedrooms'],
            'suites'           => (int) $r['suites'],
            'bathrooms'        => (int) $r['bathrooms'],
            'parking_spaces'   => (int) $r['parking_spaces'],
            'total_area'       => self::num($r['total_area']),
            'usable_area'      => self::num($r['usable_area']),
            'status'           => $r['status'],
            'featured'         => (bool) $r['featured'],
            'published'        => $r['status'] !== 'rascunho' && $r['published_at'] !== null,
            'published_at'     => $r['published_at'],
            'created_at'       => $r['created_at'],
            'updated_at'       => $r['updated_at'],
            'images_count'     => (int) $r['images_count'],
            'cover'            => Media::urls((int) $r['id'], $r['cover_key']),
        ];
    }

    /** Registro cru (para edição/validação). */
    public static function raw(int $id, bool $includeDeleted = false): ?array
    {
        return Database::fetch(
            'SELECT * FROM properties WHERE id = :id' . ($includeDeleted ? '' : ' AND deleted_at IS NULL'),
            ['id' => $id]
        );
    }

    /** Detalhe completo: dados + características + fotos. */
    public static function find(int $id, bool $public = false): ?array
    {
        $extra = $public
            ? " AND p.published_at IS NOT NULL AND p.status IN ('" . implode("','", self::PUBLIC_STATUSES) . "','vendido','alugado')"
            : '';
        $row = Database::fetch(
            'SELECT p.*, t.name AS type_name, c.name AS city_name, c.state AS city_state, n.name AS neighborhood_name,
                    n.zone AS neighborhood_zone
               FROM properties p
               LEFT JOIN property_types t ON t.id = p.property_type_id
               LEFT JOIN cities c         ON c.id = p.city_id
               LEFT JOIN neighborhoods n  ON n.id = p.neighborhood_id
              WHERE p.id = :id AND p.deleted_at IS NULL' . $extra,
            ['id' => $id]
        );
        if (!$row) {
            return null;
        }

        $featureRows = Database::fetchAll(
            'SELECT f.id, f.name FROM property_features pf JOIN features f ON f.id = pf.feature_id
              WHERE pf.property_id = :id ORDER BY f.sort_order, f.name',
            ['id' => $id]
        );
        $images = PropertyImageRepository::forProperty($id);
        $coverId = $row['cover_image_id'] ? (int) $row['cover_image_id'] : ($images[0]['id'] ?? null);

        $data = [
            'id'               => (int) $row['id'],
            'code'             => $row['code'],
            'title'            => $row['title'],
            'slug'             => $row['slug'],
            'transaction_type' => $row['transaction_type'],
            'property_type_id' => $row['property_type_id'] ? (int) $row['property_type_id'] : null,
            'type'             => $row['type_name'],
            'price'            => self::num($row['price']),
            'price_from'       => (bool) $row['price_from'],
            'old_price'        => self::num($row['old_price']),
            'condominium_fee'  => self::num($row['condominium_fee']),
            'property_tax'     => self::num($row['property_tax']),
            'city_id'          => $row['city_id'] ? (int) $row['city_id'] : null,
            'city'             => $row['city_name'],
            'state'            => $row['city_state'],
            'neighborhood_id'  => $row['neighborhood_id'] ? (int) $row['neighborhood_id'] : null,
            'neighborhood'     => $row['neighborhood_name'],
            'zone'             => $row['neighborhood_zone'],
            'address'          => $row['address'],
            'number'           => $row['number'],
            'complement'       => $row['complement'],
            'zip_code'         => $row['zip_code'],
            'latitude'         => self::num($row['latitude']),
            'longitude'        => self::num($row['longitude']),
            'show_address'     => (bool) $row['show_address'],
            'total_area'       => self::num($row['total_area']),
            'usable_area'      => self::num($row['usable_area']),
            'bedrooms'         => (int) $row['bedrooms'],
            'suites'           => (int) $row['suites'],
            'bathrooms'        => (int) $row['bathrooms'],
            'parking_spaces'   => (int) $row['parking_spaces'],
            'description'      => $row['description'],
            'status'           => $row['status'],
            'featured'         => (bool) $row['featured'],
            'published'        => $row['status'] !== 'rascunho' && $row['published_at'] !== null,
            'published_at'     => $row['published_at'],
            'created_at'       => $row['created_at'],
            'updated_at'       => $row['updated_at'],
            'features'         => array_map(static fn($f) => ['id' => (int) $f['id'], 'name' => $f['name']], $featureRows),
            'cover_image_id'   => $coverId,
            'images'           => array_map(static fn($img) => $img + ['is_cover' => $img['id'] === $coverId], $images),
        ];

        if ($public) {
            // Endereço exato só se o corretor autorizar; dados internos fora.
            if (!$data['show_address']) {
                $data['address'] = $data['number'] = $data['complement'] = $data['zip_code'] = null;
                $data['latitude'] = $data['longitude'] = null;
            }
            unset($data['published_at'], $data['property_type_id']);
            // Nome original do arquivo enviado não vai para o site público
            $data['images'] = array_map(static function (array $img): array {
                unset($img['original_name']);
                return $img;
            }, $data['images']);
        }
        return $data;
    }

    public static function idBySlug(string $slug): ?int
    {
        $id = Database::value('SELECT id FROM properties WHERE slug = :slug AND deleted_at IS NULL', ['slug' => $slug]);
        return $id ? (int) $id : null;
    }

    public static function slugExists(string $slug, int $ignoreId = 0): bool
    {
        return (bool) Database::value('SELECT 1 FROM properties WHERE slug = :slug AND id <> :id', ['slug' => $slug, 'id' => $ignoreId]);
    }

    /** Recentes para o dashboard. */
    public static function recent(int $limit = 6): array
    {
        return self::list(['sort' => 'recent'], 1, max(1, min($limit, 50)))['items'];
    }

    public static function featureIds(int $id): array
    {
        return array_map('intval', array_column(
            Database::fetchAll('SELECT feature_id FROM property_features WHERE property_id = :id', ['id' => $id]),
            'feature_id'
        ));
    }

    public static function syncFeatures(int $id, array $featureIds): void
    {
        Database::run('DELETE FROM property_features WHERE property_id = :id', ['id' => $id]);
        foreach ($featureIds as $fid) {
            Database::run('INSERT INTO property_features (property_id, feature_id) VALUES (:p, :f)', ['p' => $id, 'f' => (int) $fid]);
        }
    }

    private static function num(mixed $value): ?float
    {
        return $value === null ? null : (float) $value;
    }
}

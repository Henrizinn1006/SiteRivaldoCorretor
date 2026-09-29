<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\ActivityLog;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\Input;
use App\Core\Str;
use App\Core\Validator;
use App\Repositories\CatalogRepository;
use App\Repositories\LocationRepository;
use App\Repositories\PropertyImageRepository;
use App\Repositories\PropertyRepository;

defined('APP_ROOT') || exit;

/**
 * Regras de negócio dos imóveis: validação, rascunho x publicação,
 * slug e código únicos, bairro, características, ações rápidas e duplicação.
 */
final class PropertyService
{
    /** Status aceitos quando o imóvel está publicado. */
    public const LIVE_STATUSES = ['disponivel', 'reservado', 'vendido', 'alugado', 'indisponivel'];

    /** Colunas gravadas a partir do formulário. */
    private const COLUMNS = [
        'title', 'slug', 'transaction_type', 'property_type_id', 'price', 'price_from', 'old_price', 'condominium_fee',
        'property_tax', 'city_id', 'neighborhood_id', 'address', 'number', 'complement', 'zip_code',
        'latitude', 'longitude', 'show_address', 'total_area', 'usable_area', 'bedrooms', 'suites',
        'bathrooms', 'parking_spaces', 'description', 'status', 'featured', 'published_at',
    ];

    /** Rótulos para mensagens de "campos obrigatórios para publicar". */
    private const REQUIRED_TO_PUBLISH = [
        'title'             => 'Título',
        'transaction_type'  => 'Tipo de negociação',
        'property_type_id'  => 'Tipo do imóvel',
        'price'             => 'Preço',
        'city_id'           => 'Cidade',
        'neighborhood_name' => 'Bairro',
    ];

    /**
     * Cria ($id = null) ou atualiza um imóvel.
     * $in['action']: 'draft' (salvar rascunho) | 'publish' (publicar/salvar publicado).
     */
    public static function save(?int $id, array $in, array $user): array
    {
        $existing = null;
        if ($id) {
            $existing = PropertyRepository::raw($id);
            if (!$existing) {
                throw HttpException::notFound('Imóvel não encontrado.');
            }
        }

        $action = ($in['action'] ?? 'draft') === 'publish' ? 'publish' : 'draft';
        $data = self::normalize($in);
        self::validate($data, $action === 'publish');

        // Bairro: usa o id informado ou cria/acha pelo nome dentro da cidade.
        $data['neighborhood_id'] = null;
        if ($data['city_id'] && $data['neighborhood_name']) {
            $data['neighborhood_id'] = LocationRepository::findOrCreateNeighborhood($data['city_id'], $data['neighborhood_name'], $data['zone']);
        }

        // Status e publicação
        if ($action === 'publish') {
            $status = in_array($data['status'], self::LIVE_STATUSES, true) ? $data['status'] : null;
            if (!$status) {
                $status = ($existing && in_array($existing['status'], self::LIVE_STATUSES, true)) ? $existing['status'] : 'disponivel';
            }
            $data['status'] = $status;
            $data['published_at'] = $existing['published_at'] ?? date('Y-m-d H:i:s');
        } else {
            $data['status'] = 'rascunho';
            $data['published_at'] = $existing['published_at'] ?? null;
        }

        // Slug: informado > mantém o atual (se já publicado) > gerado do título
        $wasPublished = $existing && $existing['status'] !== 'rascunho' && $existing['published_at'];
        $base = $data['slug'] ? Str::slug($data['slug']) : (($wasPublished && $existing['slug']) ? $existing['slug'] : Str::slug($data['title']));
        $data['slug'] = self::uniqueSlug($base, $id ?? 0);

        $featureIds = CatalogRepository::existingIds('features', $data['features']);

        $row = array_intersect_key($data, array_flip(self::COLUMNS));
        $row['show_address'] = $row['show_address'] ? 1 : 0;
        $row['featured'] = $row['featured'] ? 1 : 0;
        $row['price_from'] = $row['price_from'] ? 1 : 0;

        $propertyId = Database::transaction(static function () use ($id, $row, $featureIds, $user): int {
            if ($id) {
                $sets = implode(', ', array_map(static fn($c) => "{$c} = :{$c}", array_keys($row)));
                Database::run("UPDATE properties SET {$sets}, updated_by = :uid WHERE id = :id", $row + ['uid' => (int) $user['id'], 'id' => $id]);
            } else {
                $cols = implode(', ', array_keys($row));
                $marks = implode(', ', array_map(static fn($c) => ':' . $c, array_keys($row)));
                $id = Database::insert(
                    "INSERT INTO properties ({$cols}, created_by, updated_by) VALUES ({$marks}, :uid, :uid2)",
                    $row + ['uid' => (int) $user['id'], 'uid2' => (int) $user['id']]
                );
                // Código único derivado do id (nunca repete)
                Database::run('UPDATE properties SET code = :code WHERE id = :id', ['code' => self::code($id), 'id' => $id]);
            }
            PropertyRepository::syncFeatures($id, $featureIds);
            return $id;
        });

        $changed = $existing ? self::diff($existing, $row) : null;
        ActivityLog::record($id ? ($action === 'publish' && !$wasPublished ? 'publish' : 'update') : ($action === 'publish' ? 'create_publish' : 'create_draft'),
            'property', $propertyId, $changed ? ['fields' => $changed] : null);

        return PropertyRepository::find($propertyId);
    }

    /** Ações rápidas da listagem. */
    public static function action(int $id, string $action, array $user): array
    {
        $p = PropertyRepository::raw($id);
        if (!$p) {
            throw HttpException::notFound('Imóvel não encontrado.');
        }
        $isLive = $p['status'] !== 'rascunho' && $p['published_at'] !== null;

        $statusActions = [
            'mark_available'   => 'disponivel',
            'mark_reserved'    => 'reservado',
            'mark_sold'        => 'vendido',
            'mark_rented'      => 'alugado',
            'mark_unavailable' => 'indisponivel',
        ];

        $set = [];
        switch (true) {
            case $action === 'publish':
                self::assertPublishable($p);
                $set = [
                    'status'       => $isLive ? $p['status'] : 'disponivel',
                    'published_at' => $p['published_at'] ?? date('Y-m-d H:i:s'),
                ];
                break;
            case $action === 'unpublish':
                $set = ['status' => 'rascunho'];
                break;
            case $action === 'feature':
                $set = ['featured' => 1];
                break;
            case $action === 'unfeature':
                $set = ['featured' => 0];
                break;
            case isset($statusActions[$action]):
                if (!$isLive) {
                    throw new HttpException(422, 'Publique o imóvel antes de alterar o status de negociação.');
                }
                $set = ['status' => $statusActions[$action]];
                break;
            default:
                throw new HttpException(422, 'Ação inválida.');
        }

        $sets = implode(', ', array_map(static fn($c) => "{$c} = :{$c}", array_keys($set)));
        Database::run("UPDATE properties SET {$sets}, updated_by = :uid WHERE id = :id", $set + ['uid' => (int) $user['id'], 'id' => $id]);
        ActivityLog::record($action, 'property', $id);

        return PropertyRepository::find($id);
    }

    /** Exclusão lógica (soft delete) — pode ser recuperada pelo banco se necessário. */
    public static function delete(int $id, array $user): void
    {
        if (!PropertyRepository::raw($id)) {
            throw HttpException::notFound('Imóvel não encontrado.');
        }
        Database::run(
            'UPDATE properties SET deleted_at = NOW(), featured = 0, updated_by = :uid WHERE id = :id',
            ['uid' => (int) $user['id'], 'id' => $id]
        );
        ActivityLog::record('delete', 'property', $id);
    }

    /** Duplica dados, características e fotos. A cópia nasce como rascunho. */
    public static function duplicate(int $id, array $user): array
    {
        $p = PropertyRepository::raw($id);
        if (!$p) {
            throw HttpException::notFound('Imóvel não encontrado.');
        }

        $row = array_intersect_key($p, array_flip(self::COLUMNS));
        $row['title'] = mb_substr($p['title'] . ' (cópia)', 0, 160);
        $row['slug'] = self::uniqueSlug(Str::slug($row['title']));
        $row['status'] = 'rascunho';
        $row['featured'] = 0;
        $row['published_at'] = null;

        $newId = Database::transaction(static function () use ($row, $id, $user): int {
            $cols = implode(', ', array_keys($row));
            $marks = implode(', ', array_map(static fn($c) => ':' . $c, array_keys($row)));
            $newId = Database::insert(
                "INSERT INTO properties ({$cols}, created_by, updated_by) VALUES ({$marks}, :uid, :uid2)",
                $row + ['uid' => (int) $user['id'], 'uid2' => (int) $user['id']]
            );
            Database::run('UPDATE properties SET code = :code WHERE id = :id', ['code' => self::code($newId), 'id' => $newId]);
            PropertyRepository::syncFeatures($newId, PropertyRepository::featureIds($id));
            return $newId;
        });

        // Fotos (fora da transação: envolve arquivos)
        $coverOld = $p['cover_image_id'] ? (int) $p['cover_image_id'] : null;
        $coverNew = null;
        foreach (Database::fetchAll('SELECT * FROM property_images WHERE property_id = :id ORDER BY sort_order, id', ['id' => $id]) as $img) {
            $newKey = ImageService::copyVariants($id, $img['file_key'], $newId);
            if (!$newKey) {
                continue;
            }
            $newImgId = PropertyImageRepository::create($newId, $newKey, [
                'original_name' => $img['original_name'], 'width' => $img['width'], 'height' => $img['height'], 'size' => $img['size_bytes'],
            ]);
            if ($coverOld === (int) $img['id']) {
                $coverNew = $newImgId;
            }
        }
        if ($coverNew) {
            Database::run('UPDATE properties SET cover_image_id = :c WHERE id = :id', ['c' => $coverNew, 'id' => $newId]);
        }

        ActivityLog::record('duplicate', 'property', $newId, ['from' => $id]);
        return PropertyRepository::find($newId);
    }

    // ------------------------------------------------------------------ //

    public static function code(int $id): string
    {
        return 'IMO-' . str_pad((string) $id, 4, '0', STR_PAD_LEFT);
    }

    private static function uniqueSlug(string $base, int $ignoreId = 0): string
    {
        $base = $base !== '' ? mb_substr($base, 0, 170) : 'imovel';
        $slug = $base;
        $n = 2;
        while (PropertyRepository::slugExists($slug, $ignoreId)) {
            $slug = $base . '-' . $n++;
        }
        return $slug;
    }

    private static function normalize(array $in): array
    {
        $zip = Input::digits($in['zip_code'] ?? null);
        return [
            'title'             => Input::str($in['title'] ?? null, 200),
            'slug'              => Input::str($in['slug'] ?? null, 200),
            'transaction_type'  => Input::str($in['transaction_type'] ?? null) ?? 'venda',
            'property_type_id'  => Input::int($in['property_type_id'] ?? null),
            'price'             => Input::decimal($in['price'] ?? null),
            'price_from'        => Input::bool($in['price_from'] ?? false),
            'old_price'         => Input::decimal($in['old_price'] ?? null),
            'condominium_fee'   => Input::decimal($in['condominium_fee'] ?? null),
            'property_tax'      => Input::decimal($in['property_tax'] ?? null),
            'city_id'           => Input::int($in['city_id'] ?? null),
            'neighborhood_name' => Input::str($in['neighborhood_name'] ?? null, 200),
            'zone'              => LocationRepository::zone($in['zone'] ?? null),
            'address'           => Input::str($in['address'] ?? null, 250),
            'number'            => Input::str($in['number'] ?? null, 40),
            'complement'        => Input::str($in['complement'] ?? null, 200),
            'zip_code'          => $zip,
            'latitude'          => Input::decimal($in['latitude'] ?? null),
            'longitude'         => Input::decimal($in['longitude'] ?? null),
            'show_address'      => Input::bool($in['show_address'] ?? false),
            'total_area'        => Input::decimal($in['total_area'] ?? null),
            'usable_area'       => Input::decimal($in['usable_area'] ?? null),
            'bedrooms'          => Input::int($in['bedrooms'] ?? null) ?? 0,
            'suites'            => Input::int($in['suites'] ?? null) ?? 0,
            'bathrooms'         => Input::int($in['bathrooms'] ?? null) ?? 0,
            'parking_spaces'    => Input::int($in['parking_spaces'] ?? null) ?? 0,
            'description'       => Input::str($in['description'] ?? null, 25000),
            'status'            => Input::str($in['status'] ?? null),
            'featured'          => Input::bool($in['featured'] ?? false),
            'features'          => Input::intList($in['features'] ?? []),
        ];
    }

    private static function validate(array &$d, bool $publish): void
    {
        $v = new Validator($d);
        $v->required('title', 'Informe o título do imóvel.')
          ->minLength('title', 3, 'O título precisa ter pelo menos 3 caracteres.')
          ->maxLength('title', 160)
          ->maxLength('slug', 170)
          ->in('transaction_type', PropertyRepository::TRANSACTIONS, 'Escolha venda ou aluguel.')
          ->numeric('price', 0, 999999999999, 'Informe um preço válido.')
          ->numeric('old_price', 0, 999999999999, 'Informe um valor válido.')
          ->numeric('condominium_fee', 0, 9999999999, 'Informe um valor válido.')
          ->numeric('property_tax', 0, 9999999999, 'Informe um valor válido.')
          ->numeric('total_area', 0, 99999999, 'Informe uma área válida.')
          ->numeric('usable_area', 0, 99999999, 'Informe uma área válida.')
          ->integer('bedrooms', 0, 99, 'Entre 0 e 99.')
          ->integer('suites', 0, 99, 'Entre 0 e 99.')
          ->integer('bathrooms', 0, 99, 'Entre 0 e 99.')
          ->integer('parking_spaces', 0, 99, 'Entre 0 e 99.')
          ->numeric('latitude', -90, 90, 'Latitude entre -90 e 90.')
          ->numeric('longitude', -180, 180, 'Longitude entre -180 e 180.')
          ->maxLength('address', 190)
          ->maxLength('number', 20)
          ->maxLength('complement', 120)
          ->maxLength('neighborhood_name', 120)
          ->maxLength('description', 20000, 'A descrição pode ter no máximo 20.000 caracteres.')
          ->rule('zip_code', static fn($z) => $z === null || strlen($z) === 8, 'CEP deve ter 8 dígitos.')
          ->rule('suites', static fn($s) => $s <= $d['bedrooms'], 'Suítes não pode ser maior que o número de quartos.');

        if ($d['property_type_id'] && !CatalogRepository::exists('types', $d['property_type_id'])) {
            $v->addError('property_type_id', 'Tipo de imóvel inválido.');
        }
        if ($d['city_id'] && !LocationRepository::findCity($d['city_id'])) {
            $v->addError('city_id', 'Cidade inválida.');
        }
        if ($d['neighborhood_name'] && !$d['city_id']) {
            $v->addError('city_id', 'Selecione a cidade do bairro.');
        }
        if ($d['status'] !== null && !in_array($d['status'], PropertyRepository::STATUSES, true)) {
            $v->addError('status', 'Status inválido.');
        }

        if ($publish) {
            foreach (self::REQUIRED_TO_PUBLISH as $field => $label) {
                if ($d[$field] === null || $d[$field] === '' || ($field === 'price' && (float) $d[$field] <= 0)) {
                    $v->addError($field, "{$label} é obrigatório para publicar.");
                }
            }
        }

        $v->validate($publish ? 'Preencha os campos obrigatórios para publicar.' : 'Verifique os campos destacados.');

        if ($d['zip_code']) {
            $d['zip_code'] = substr($d['zip_code'], 0, 5) . '-' . substr($d['zip_code'], 5);
        }
    }

    /** Publicação rápida pela listagem: confere o que está gravado. */
    private static function assertPublishable(array $p): void
    {
        $missing = [];
        if (!$p['title']) $missing[] = 'título';
        if (!$p['property_type_id']) $missing[] = 'tipo do imóvel';
        if (!$p['price'] || (float) $p['price'] <= 0) $missing[] = 'preço';
        if (!$p['city_id']) $missing[] = 'cidade';
        if (!$p['neighborhood_id']) $missing[] = 'bairro';
        if ($missing) {
            throw new HttpException(422, 'Para publicar, complete: ' . implode(', ', $missing) . '.');
        }
    }

    private static function diff(array $old, array $new): array
    {
        $changed = [];
        foreach ($new as $key => $value) {
            $before = $old[$key] ?? null;
            if (is_numeric($before) && is_numeric($value) ? (float) $before !== (float) $value : (string) $before !== (string) $value) {
                $changed[] = $key;
            }
        }
        return $changed;
    }
}

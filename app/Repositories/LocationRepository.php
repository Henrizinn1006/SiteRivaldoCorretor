<?php
declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;
use App\Core\HttpException;
use App\Core\Str;

defined('APP_ROOT') || exit;

/** Cidades (com UF) e bairros. */
final class LocationRepository
{
    public const STATES = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

    /** Zonas de São Paulo (filtro do site). A ordem é a exibida no site. */
    public const ZONES = ['sul' => 'Zona Sul', 'oeste' => 'Zona Oeste', 'norte' => 'Zona Norte', 'leste' => 'Zona Leste', 'centro' => 'Centro'];

    /** Aceita só códigos válidos; qualquer outra coisa vira "sem zona". */
    public static function zone(mixed $value): ?string
    {
        $value = is_string($value) ? strtolower(trim($value)) : '';
        return isset(self::ZONES[$value]) ? $value : null;
    }

    public static function cities(bool $onlyActive = false, bool $withCounts = false): array
    {
        $counts = $withCounts
            ? ', (SELECT COUNT(*) FROM neighborhoods n WHERE n.city_id = c.id) AS neighborhoods_count,
                 (SELECT COUNT(*) FROM properties p WHERE p.city_id = c.id AND p.deleted_at IS NULL) AS properties_count'
            : '';
        $rows = Database::fetchAll(
            'SELECT c.id, c.name, c.state, c.slug, c.active' . $counts . '
               FROM cities c ' . ($onlyActive ? 'WHERE c.active = 1' : '') . '
              ORDER BY c.name'
        );
        return array_map(static fn(array $r): array => [
            'id'     => (int) $r['id'],
            'name'   => $r['name'],
            'state'  => $r['state'],
            'slug'   => $r['slug'],
            'active' => (bool) $r['active'],
        ] + ($withCounts ? [
            'neighborhoods_count' => (int) $r['neighborhoods_count'],
            'properties_count'    => (int) $r['properties_count'],
        ] : []), $rows);
    }

    public static function neighborhoods(?int $cityId = null, bool $onlyActive = false, bool $withCounts = false): array
    {
        $where = [];
        $params = [];
        if ($cityId) {
            $where[] = 'n.city_id = :city';
            $params['city'] = $cityId;
        }
        if ($onlyActive) {
            $where[] = 'n.active = 1';
        }
        $counts = $withCounts
            ? ', (SELECT COUNT(*) FROM properties p WHERE p.neighborhood_id = n.id AND p.deleted_at IS NULL) AS properties_count'
            : '';
        $rows = Database::fetchAll(
            'SELECT n.id, n.city_id, n.name, n.zone, n.slug, n.active' . $counts . '
               FROM neighborhoods n ' . ($where ? 'WHERE ' . implode(' AND ', $where) : '') . '
              ORDER BY n.name',
            $params
        );
        return array_map(static fn(array $r): array => [
            'id'      => (int) $r['id'],
            'city_id' => (int) $r['city_id'],
            'name'    => $r['name'],
            'zone'    => $r['zone'],
            'slug'    => $r['slug'],
            'active'  => (bool) $r['active'],
        ] + ($withCounts ? ['properties_count' => (int) $r['properties_count']] : []), $rows);
    }

    public static function findCity(int $id): ?array
    {
        return Database::fetch('SELECT id, name, state, active FROM cities WHERE id = :id', ['id' => $id]);
    }

    public static function findNeighborhood(int $id): ?array
    {
        return Database::fetch('SELECT id, city_id, name, zone, active FROM neighborhoods WHERE id = :id', ['id' => $id]);
    }

    public static function saveCity(?int $id, string $name, string $state, bool $active): array
    {
        $slug = Str::slug($name . '-' . $state, 130);
        $dup = Database::value('SELECT id FROM cities WHERE slug = :slug AND id <> :id', ['slug' => $slug, 'id' => $id ?? 0]);
        if ($dup) {
            throw HttpException::validation(['name' => 'Esta cidade já está cadastrada.']);
        }
        if ($id) {
            if (!self::findCity($id)) {
                throw HttpException::notFound('Cidade não encontrada.');
            }
            Database::run(
                'UPDATE cities SET name = :name, state = :state, slug = :slug, active = :active WHERE id = :id',
                ['name' => $name, 'state' => $state, 'slug' => $slug, 'active' => $active ? 1 : 0, 'id' => $id]
            );
        } else {
            $id = Database::insert(
                'INSERT INTO cities (name, state, slug, active) VALUES (:name, :state, :slug, :active)',
                ['name' => $name, 'state' => $state, 'slug' => $slug, 'active' => $active ? 1 : 0]
            );
        }
        return ['id' => $id, 'name' => $name, 'state' => $state, 'slug' => $slug, 'active' => $active];
    }

    public static function deleteCity(int $id): void
    {
        if (!self::findCity($id)) {
            throw HttpException::notFound('Cidade não encontrada.');
        }
        $props = (int) Database::value('SELECT COUNT(*) FROM properties WHERE city_id = :id AND deleted_at IS NULL', ['id' => $id]);
        if ($props > 0) {
            throw new HttpException(409, "Não é possível excluir: há {$props} imóve" . ($props === 1 ? 'l' : 'is') . ' nesta cidade. Você pode desativá-la.');
        }
        $hoods = (int) Database::value('SELECT COUNT(*) FROM neighborhoods WHERE city_id = :id', ['id' => $id]);
        if ($hoods > 0) {
            throw new HttpException(409, 'Exclua ou mova os bairros desta cidade antes de excluí-la.');
        }
        Database::run('DELETE FROM cities WHERE id = :id', ['id' => $id]);
    }

    public static function saveNeighborhood(?int $id, int $cityId, string $name, bool $active, ?string $zone = null): array
    {
        $zone = self::zone($zone);
        if (!self::findCity($cityId)) {
            throw HttpException::validation(['city_id' => 'Selecione uma cidade válida.']);
        }
        $slug = Str::slug($name, 130);
        $dup = Database::value(
            'SELECT id FROM neighborhoods WHERE city_id = :city AND slug = :slug AND id <> :id',
            ['city' => $cityId, 'slug' => $slug, 'id' => $id ?? 0]
        );
        if ($dup) {
            throw HttpException::validation(['name' => 'Este bairro já existe nesta cidade.']);
        }
        if ($id) {
            if (!self::findNeighborhood($id)) {
                throw HttpException::notFound('Bairro não encontrado.');
            }
            Database::run(
                'UPDATE neighborhoods SET city_id = :city, name = :name, zone = :zone, slug = :slug, active = :active WHERE id = :id',
                ['city' => $cityId, 'name' => $name, 'zone' => $zone, 'slug' => $slug, 'active' => $active ? 1 : 0, 'id' => $id]
            );
            // Imóveis do bairro acompanham a cidade dele
            Database::run('UPDATE properties SET city_id = :city WHERE neighborhood_id = :id', ['city' => $cityId, 'id' => $id]);
        } else {
            $id = Database::insert(
                'INSERT INTO neighborhoods (city_id, name, zone, slug, active) VALUES (:city, :name, :zone, :slug, :active)',
                ['city' => $cityId, 'name' => $name, 'zone' => $zone, 'slug' => $slug, 'active' => $active ? 1 : 0]
            );
        }
        return ['id' => $id, 'city_id' => $cityId, 'name' => $name, 'zone' => $zone, 'slug' => $slug, 'active' => $active];
    }

    public static function deleteNeighborhood(int $id): void
    {
        if (!self::findNeighborhood($id)) {
            throw HttpException::notFound('Bairro não encontrado.');
        }
        $props = (int) Database::value('SELECT COUNT(*) FROM properties WHERE neighborhood_id = :id AND deleted_at IS NULL', ['id' => $id]);
        if ($props > 0) {
            throw new HttpException(409, "Não é possível excluir: há {$props} imóve" . ($props === 1 ? 'l' : 'is') . ' neste bairro. Você pode desativá-lo.');
        }
        Database::run('DELETE FROM neighborhoods WHERE id = :id', ['id' => $id]);
    }

    /**
     * Usado pelo formulário do imóvel: digitou um bairro novo → cria na cidade.
     * Se a zona vier preenchida, ela é gravada no bairro (vale para todos os imóveis dele).
     */
    public static function findOrCreateNeighborhood(int $cityId, string $name, ?string $zone = null): int
    {
        $zone = self::zone($zone);
        $slug = Str::slug($name, 130);
        $id = Database::value('SELECT id FROM neighborhoods WHERE city_id = :city AND slug = :slug', ['city' => $cityId, 'slug' => $slug]);
        if ($id) {
            if ($zone) {
                Database::run('UPDATE neighborhoods SET zone = :zone WHERE id = :id', ['zone' => $zone, 'id' => (int) $id]);
            }
            return (int) $id;
        }
        return Database::insert(
            'INSERT INTO neighborhoods (city_id, name, zone, slug, active) VALUES (:city, :name, :zone, :slug, 1)',
            ['city' => $cityId, 'name' => $name, 'zone' => $zone, 'slug' => $slug]
        );
    }
}

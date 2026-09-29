<?php
declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;
use App\Core\HttpException;
use App\Core\Str;

defined('APP_ROOT') || exit;

/**
 * Cadastros simples com o mesmo formato (nome, slug, ordem, ativo):
 *   'types'    → property_types (categorias / tipos de imóvel)
 *   'features' → features (características)
 */
final class CatalogRepository
{
    private const TABLES = [
        'types'    => 'property_types',
        'features' => 'features',
    ];

    private const USAGE = [
        'types'    => 'SELECT COUNT(*) FROM properties WHERE property_type_id = :id AND deleted_at IS NULL',
        'features' => 'SELECT COUNT(*) FROM property_features pf
                         JOIN properties p ON p.id = pf.property_id AND p.deleted_at IS NULL
                        WHERE pf.feature_id = :id',
    ];

    private static function table(string $kind): string
    {
        if (!isset(self::TABLES[$kind])) {
            throw new \InvalidArgumentException('Catálogo inválido.');
        }
        return self::TABLES[$kind];
    }

    public static function all(string $kind, bool $onlyActive = false, bool $withUsage = false): array
    {
        $table = self::table($kind);
        $usage = $withUsage
            ? ', (' . str_replace(':id', 't.id', self::USAGE[$kind]) . ') AS usage_count'
            : '';
        $where = $onlyActive ? 'WHERE t.active = 1' : '';
        $rows = Database::fetchAll(
            "SELECT t.id, t.name, t.slug, t.sort_order, t.active{$usage}
               FROM {$table} t {$where}
              ORDER BY t.sort_order, t.name"
        );
        return array_map(static fn(array $r): array => [
            'id'         => (int) $r['id'],
            'name'       => $r['name'],
            'slug'       => $r['slug'],
            'sort_order' => (int) $r['sort_order'],
            'active'     => (bool) $r['active'],
        ] + ($withUsage ? ['usage_count' => (int) $r['usage_count']] : []), $rows);
    }

    public static function find(string $kind, int $id): ?array
    {
        $table = self::table($kind);
        return Database::fetch("SELECT id, name, slug, sort_order, active FROM {$table} WHERE id = :id", ['id' => $id]);
    }

    public static function exists(string $kind, int $id, bool $mustBeActive = false): bool
    {
        $table = self::table($kind);
        $sql = "SELECT 1 FROM {$table} WHERE id = :id" . ($mustBeActive ? ' AND active = 1' : '');
        return (bool) Database::value($sql, ['id' => $id]);
    }

    /** Todos os ids existentes dentro da lista informada. */
    public static function existingIds(string $kind, array $ids): array
    {
        if (!$ids) {
            return [];
        }
        $table = self::table($kind);
        $params = [];
        $marks = [];
        foreach (array_values($ids) as $i => $id) {
            $marks[] = ':id' . $i;
            $params['id' . $i] = (int) $id;
        }
        $rows = Database::fetchAll("SELECT id FROM {$table} WHERE id IN (" . implode(',', $marks) . ')', $params);
        return array_map(static fn($r) => (int) $r['id'], $rows);
    }

    public static function save(string $kind, ?int $id, string $name, bool $active, ?int $sortOrder): array
    {
        $table = self::table($kind);
        $slug = Str::slug($name, 80);

        $dup = Database::value(
            "SELECT id FROM {$table} WHERE slug = :slug AND id <> :id LIMIT 1",
            ['slug' => $slug, 'id' => $id ?? 0]
        );
        if ($dup) {
            throw HttpException::validation(['name' => 'Já existe um cadastro com este nome.']);
        }

        if ($id) {
            if (!self::find($kind, $id)) {
                throw HttpException::notFound();
            }
            Database::run(
                "UPDATE {$table} SET name = :name, slug = :slug, active = :active,
                        sort_order = COALESCE(:sort, sort_order) WHERE id = :id",
                ['name' => $name, 'slug' => $slug, 'active' => $active ? 1 : 0, 'sort' => $sortOrder, 'id' => $id]
            );
        } else {
            $sortOrder ??= (int) Database::value("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM {$table}");
            $id = Database::insert(
                "INSERT INTO {$table} (name, slug, active, sort_order) VALUES (:name, :slug, :active, :sort)",
                ['name' => $name, 'slug' => $slug, 'active' => $active ? 1 : 0, 'sort' => $sortOrder]
            );
        }
        $row = self::find($kind, $id);
        return ['id' => (int) $row['id'], 'name' => $row['name'], 'slug' => $row['slug'],
                'sort_order' => (int) $row['sort_order'], 'active' => (bool) $row['active']];
    }

    public static function usage(string $kind, int $id): int
    {
        return (int) Database::value(self::USAGE[$kind] ?? 'SELECT 0', ['id' => $id]);
    }

    /** Exclui se não estiver em uso; caso contrário 409 (sugere desativar). */
    public static function delete(string $kind, int $id): void
    {
        $table = self::table($kind);
        if (!self::find($kind, $id)) {
            throw HttpException::notFound();
        }
        $count = self::usage($kind, $id);
        if ($count > 0) {
            throw new HttpException(409, "Não é possível excluir: está em uso por {$count} imóve" . ($count === 1 ? 'l' : 'is') . '. Você pode desativá-lo.');
        }
        Database::run("DELETE FROM {$table} WHERE id = :id", ['id' => $id]);
    }
}

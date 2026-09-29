<?php
/** GET /api/public/filters.php — opções dos filtros do site (tipos, cidades e bairros ativos). */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{Api, Response};
use App\Repositories\{CatalogRepository, LocationRepository};

Api::publicRead(300);
Response::success('', [
    'types'         => array_map(static fn($t) => ['id' => $t['id'], 'name' => $t['name'], 'slug' => $t['slug']], CatalogRepository::all('types', true)),
    'cities'        => array_map(static fn($c) => ['id' => $c['id'], 'name' => $c['name'], 'state' => $c['state']], LocationRepository::cities(true)),
    'neighborhoods' => array_map(static fn($n) => ['id' => $n['id'], 'city_id' => $n['city_id'], 'name' => $n['name'], 'zone' => $n['zone']], LocationRepository::neighborhoods(null, true)),
    'zones'         => LocationRepository::ZONES,
]);

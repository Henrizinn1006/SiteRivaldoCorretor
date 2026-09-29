<?php
/** GET /api/catalogs/index.php — opções do formulário de imóvel (tipos, cidades, bairros, características). */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{Api, Response};
use App\Repositories\{CatalogRepository, LocationRepository, PropertyRepository};

Api::read();

Response::success('', [
    'types'         => CatalogRepository::all('types', true),
    'features'      => CatalogRepository::all('features', true),
    'cities'        => LocationRepository::cities(true),
    'neighborhoods' => LocationRepository::neighborhoods(null, true),
    'statuses'      => PropertyRepository::STATUSES,
    'zones'         => LocationRepository::ZONES,
]);

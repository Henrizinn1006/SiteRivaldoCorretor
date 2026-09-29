<?php
/** GET /api/locations/index.php — cidades e bairros (com contagem de imóveis). */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{Api, Response};
use App\Repositories\LocationRepository;

Api::read();
Response::success('', [
    'cities'        => LocationRepository::cities(false, true),
    'neighborhoods' => LocationRepository::neighborhoods(null, false, true),
    'states'        => LocationRepository::STATES,
    'zones'         => LocationRepository::ZONES,
]);

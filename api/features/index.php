<?php
/** GET /api/features/index.php — lista (com quantidade de imóveis que usam cada item). */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

App\Controllers\CatalogController::index('features');

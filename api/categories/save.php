<?php
/** POST /api/categories/save.php — { id?, name, active?, sort_order? } (admin ou editor). */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

App\Controllers\CatalogController::save('types');

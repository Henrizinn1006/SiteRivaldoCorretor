<?php
/** POST /api/categories/delete.php — { id } (admin). Bloqueia se estiver em uso. */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

App\Controllers\CatalogController::delete('types');

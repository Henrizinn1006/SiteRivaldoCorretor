<?php
/** /api/properties/images/delete.php · POST — { id } */
declare(strict_types=1);

require dirname(__DIR__, 3) . '/app/bootstrap.php';

App\Controllers\ImageController::delete();

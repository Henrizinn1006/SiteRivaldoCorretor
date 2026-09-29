<?php
/** /api/properties/images/reorder.php · POST — { property_id, order: [ids] } */
declare(strict_types=1);

require dirname(__DIR__, 3) . '/app/bootstrap.php';

App\Controllers\ImageController::reorder();

<?php
/** /api/properties/images/cover.php · POST — { property_id, image_id } · define a foto de capa */
declare(strict_types=1);

require dirname(__DIR__, 3) . '/app/bootstrap.php';

App\Controllers\ImageController::cover();

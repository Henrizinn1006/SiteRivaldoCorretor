<?php
/** /api/properties/images/upload.php · POST multipart — property_id + files[] (JPG, PNG, WEBP · até 10 MB cada) */
declare(strict_types=1);

require dirname(__DIR__, 3) . '/app/bootstrap.php';

App\Controllers\ImageController::upload();

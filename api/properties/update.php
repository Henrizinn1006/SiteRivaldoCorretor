<?php
/** POST /api/properties/update.php — { id, ...campos, action: draft|publish } */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{Api, Request, Response};
use App\Services\PropertyService;

$user = Api::write();
$data = Request::json();
$property = PropertyService::save(Api::id($data['id'] ?? null), $data, $user);

Response::success(
    ($data['action'] ?? '') === 'publish' ? 'Imóvel salvo com sucesso.' : 'Rascunho salvo.',
    $property
);

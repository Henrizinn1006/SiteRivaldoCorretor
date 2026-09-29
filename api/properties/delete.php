<?php
/** POST /api/properties/delete.php — { id } · exclusão lógica (deleted_at). */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{Api, Request, Response};
use App\Services\PropertyService;

$user = Api::write();
PropertyService::delete(Api::id(Request::json()['id'] ?? null), $user);
Response::success('Imóvel excluído.');

<?php
/** POST /api/properties/duplicate.php — { id } · cria uma cópia em rascunho (com fotos). */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{Api, Request, Response};
use App\Services\PropertyService;

$user = Api::write();
$copy = PropertyService::duplicate(Api::id(Request::json()['id'] ?? null), $user);
Response::success('Imóvel duplicado. A cópia foi salva como rascunho.', $copy, 201);

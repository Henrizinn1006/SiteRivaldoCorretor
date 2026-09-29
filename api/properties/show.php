<?php
/** GET /api/properties/show.php?id=1 — dados completos para edição. */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{Api, HttpException, Request, Response};
use App\Repositories\PropertyRepository;

Api::read();
$property = PropertyRepository::find(Api::id(Request::query('id')));
if (!$property) {
    throw HttpException::notFound('Imóvel não encontrado.');
}
Response::success('', $property);

<?php
/** GET /api/public/property.php?id=1  ou  ?slug=apartamento-alto-padrao — detalhe publicado. */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{Api, HttpException, Input, Request, Response};
use App\Repositories\PropertyRepository;

Api::publicRead(60);
$id = Input::int(Request::query('id'));
$slug = Input::str(Request::query('slug'), 180);
if (!$id && $slug) {
    $id = PropertyRepository::idBySlug($slug);
}
$property = $id ? PropertyRepository::find($id, true) : null;
if (!$property) {
    throw HttpException::notFound('Imóvel não encontrado ou indisponível.');
}
Response::success('', $property);

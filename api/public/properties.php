<?php
/**
 * GET /api/public/properties.php — imóveis PUBLICADOS para o site (sem login).
 * Filtros: transaction_type, property_type (id), city (id), neighborhood (id), zone (sul|oeste|norte|leste|centro),
 *          min_price, max_price, bedrooms, suites, parking_spaces, min_area,
 *          featured=1, q, sort (recent|price_asc|price_desc|area_desc), page, limit
 * featured=1 retorna apenas destaques DISPONÍVEIS (carrossel da Home).
 */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{Api, Input, Request, Response};
use App\Repositories\PropertyRepository;

Api::publicRead(60);
[$page, $limit] = Api::pagination();

$featured = Request::query('featured') === '1';
$filters = [
    'q'                => Input::str(Request::query('q'), 100),
    'transaction_type' => Input::str(Request::query('transaction_type')),
    'property_type_id' => Input::int(Request::query('property_type')),
    'city_id'          => Input::int(Request::query('city')),
    'neighborhood_id'  => Input::int(Request::query('neighborhood')),
    'zone'             => Input::str(Request::query('zone'), 10),
    'min_price'        => Input::decimal(Request::query('min_price')),
    'max_price'        => Input::decimal(Request::query('max_price')),
    'bedrooms'         => Input::int(Request::query('bedrooms')),
    'suites'           => Input::int(Request::query('suites')),
    'parking_spaces'   => Input::int(Request::query('parking_spaces')),
    'min_area'         => Input::decimal(Request::query('min_area')),
    'featured'         => $featured ? 1 : null,
    'status'           => $featured ? 'disponivel' : Input::str(Request::query('status')),
    'sort'             => in_array(Request::query('sort'), ['recent', 'price_asc', 'price_desc', 'area_desc'], true) ? Request::query('sort') : 'recent',
];

$result = PropertyRepository::list($filters, $page, $limit, true);
// Campos internos não vão para o site
$result['items'] = array_map(static function (array $p): array {
    unset($p['published'], $p['published_at'], $p['updated_at'], $p['images_count']);
    return $p;
}, $result['items']);

Response::success('', $result);

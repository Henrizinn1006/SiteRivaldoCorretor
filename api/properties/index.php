<?php
/**
 * GET /api/properties/index.php
 * Filtros: q, status, transaction_type, property_type_id, city_id, neighborhood_id,
 *          featured (0|1), sort (recent|updated|price_asc|price_desc|title), page, limit
 */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{Api, Input, Request, Response};
use App\Repositories\PropertyRepository;

Api::read();
[$page, $limit] = Api::pagination();

$featured = Request::query('featured');
$filters = [
    'q'                => Input::str(Request::query('q'), 100),
    'status'           => Input::str(Request::query('status')),
    'transaction_type' => Input::str(Request::query('transaction_type')),
    'property_type_id' => Input::int(Request::query('property_type_id')),
    'city_id'          => Input::int(Request::query('city_id')),
    'neighborhood_id'  => Input::int(Request::query('neighborhood_id')),
    'featured'         => ($featured === '0' || $featured === '1') ? (int) $featured : null,
    'sort'             => Input::str(Request::query('sort')) ?? 'recent',
];

Response::success('', PropertyRepository::list($filters, $page, $limit));

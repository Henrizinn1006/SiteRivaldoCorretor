<?php
/** POST /api/locations/save-neighborhood.php — { id?, city_id, name, zone?, active? } */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{ActivityLog, Api, HttpException, Input, Request, Response, Validator};
use App\Repositories\LocationRepository;

Api::write();
$data = Request::json();
(new Validator($data))
    ->required('city_id', 'Selecione a cidade.')->integer('city_id', 1)
    ->required('name', 'Informe o nome do bairro.')->string('name')->minLength('name', 2)->maxLength('name', 120)
    ->validate();

$id = Input::int($data['id'] ?? null);
if (($data['zone'] ?? '') !== '' && ($data['zone'] ?? null) !== null && !LocationRepository::zone($data['zone'])) {
    throw HttpException::validation(['zone' => 'Zona inválida.']);
}
$item = LocationRepository::saveNeighborhood(
    $id,
    (int) $data['city_id'],
    Input::str($data['name'], 120),
    array_key_exists('active', $data) ? Input::bool($data['active']) : true,
    LocationRepository::zone($data['zone'] ?? null)
);
ActivityLog::record($id ? 'update' : 'create', 'neighborhood', (int) $item['id']);
Response::success($id ? 'Bairro atualizado.' : 'Bairro cadastrado.', $item, $id ? 200 : 201);

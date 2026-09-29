<?php
/** POST /api/locations/save-city.php — { id?, name, state, active? } */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{ActivityLog, Api, Input, Request, Response, Validator};
use App\Repositories\LocationRepository;

Api::write();
$data = Request::json();
if (isset($data['state']) && is_string($data['state'])) {
    $data['state'] = strtoupper(trim($data['state']));
}
(new Validator($data))
    ->required('name', 'Informe o nome da cidade.')->string('name')->minLength('name', 2)->maxLength('name', 120)
    ->required('state', 'Selecione o estado (UF).')->in('state', LocationRepository::STATES, 'UF inválida.')
    ->validate();

$id = Input::int($data['id'] ?? null);
$city = LocationRepository::saveCity($id, Input::str($data['name'], 120), $data['state'], array_key_exists('active', $data) ? Input::bool($data['active']) : true);
ActivityLog::record($id ? 'update' : 'create', 'city', (int) $city['id']);
Response::success($id ? 'Cidade atualizada.' : 'Cidade cadastrada.', $city, $id ? 200 : 201);

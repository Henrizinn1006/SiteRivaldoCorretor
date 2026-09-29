<?php
/** POST /api/locations/delete-city.php — { id } (admin) */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{ActivityLog, Api, Request, Response};
use App\Repositories\LocationRepository;

Api::write('admin');
$id = Api::id(Request::json()['id'] ?? null);
LocationRepository::deleteCity($id);
ActivityLog::record('delete', 'city', $id);
Response::success('Cidade excluída.');

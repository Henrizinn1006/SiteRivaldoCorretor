<?php
/** POST /api/locations/delete-neighborhood.php — { id } (admin) */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{ActivityLog, Api, Request, Response};
use App\Repositories\LocationRepository;

Api::write('admin');
$id = Api::id(Request::json()['id'] ?? null);
LocationRepository::deleteNeighborhood($id);
ActivityLog::record('delete', 'neighborhood', $id);
Response::success('Bairro excluído.');

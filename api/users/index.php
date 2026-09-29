<?php
/** GET /api/users/index.php — usuários do painel (somente o provedor). */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{Api, Auth, Response};
use App\Repositories\UserRepository;

Api::read();
Auth::requireProvider();
Response::success('', ['items' => UserRepository::all()]);

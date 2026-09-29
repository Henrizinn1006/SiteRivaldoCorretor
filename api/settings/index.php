<?php
/** GET /api/settings/index.php — configurações do site (admin). */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{Api, Response};
use App\Repositories\SettingsRepository;

Api::read('admin');
Response::success('', SettingsRepository::all());

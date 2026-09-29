<?php
/** POST /api/settings/remove-asset.php — { kind: logo|favicon } (admin). */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{ActivityLog, Api, HttpException, Request, Response};
use App\Repositories\SettingsRepository;
use App\Services\ImageService;

$user = Api::write('admin');
$kind = Request::json()['kind'] ?? '';
if (!in_array($kind, ['logo', 'favicon'], true)) {
    throw new HttpException(422, 'Tipo de arquivo inválido.');
}
$key = $kind . '_path';
ImageService::deleteSiteAsset(SettingsRepository::get($key));
SettingsRepository::set($key, '', (int) $user['id']);
ActivityLog::record('remove', 'settings', null, ['kind' => $kind]);
Response::success($kind === 'logo' ? 'Logo removida.' : 'Favicon removido.', SettingsRepository::all());

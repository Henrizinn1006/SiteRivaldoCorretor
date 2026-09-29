<?php
/** POST /api/settings/upload.php — multipart: kind=logo|favicon + file (admin). */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{ActivityLog, Api, HttpException, Response};
use App\Repositories\SettingsRepository;
use App\Services\ImageService;

$user = Api::write('admin');
$kind = $_POST['kind'] ?? '';
if (!in_array($kind, ['logo', 'favicon'], true)) {
    throw new HttpException(422, 'Tipo de arquivo inválido.');
}
$files = ImageService::filesFrom('file');
if (!$files) {
    throw new HttpException(422, 'Selecione uma imagem.');
}

$key = $kind . '_path';
$old = SettingsRepository::get($key);
$path = ImageService::storeSiteAsset($files[0], $kind);
SettingsRepository::set($key, $path, (int) $user['id']);
ImageService::deleteSiteAsset($old);
ActivityLog::record('upload', 'settings', null, ['kind' => $kind]);

Response::success($kind === 'logo' ? 'Logo atualizada.' : 'Favicon atualizado.', SettingsRepository::all());

<?php
/** POST /api/users/delete.php — { id } (somente o provedor). */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{ActivityLog, Api, Auth, HttpException, Request, Response};
use App\Repositories\UserRepository;

Api::write();
$provider = Auth::requireProvider();
$id = Api::id(Request::json()['id'] ?? null);
$user = UserRepository::find($id);
if (!$user) {
    throw HttpException::notFound('Usuário não encontrado.');
}
if ($id === (int) $provider['id']) {
    throw new HttpException(422, 'Você não pode excluir o seu próprio usuário.');
}
if (!empty($user['is_provider'])) {
    throw new HttpException(422, 'O usuário do provedor não pode ser excluído pelo painel.');
}
if ($user['role'] === 'admin' && UserRepository::activeAdminCount($id) === 0) {
    throw new HttpException(422, 'É preciso manter pelo menos um administrador ativo.');
}
UserRepository::delete($id);
ActivityLog::record('delete', 'user', $id, ['username' => $user['username'], 'email' => $user['email']]);
Response::success('Usuário excluído.');

<?php
/**
 * POST /api/users/password-permission.php — { id, allow: true|false } (somente o provedor)
 * Libera (uma vez) ou bloqueia a troca de senha de um usuário.
 */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{ActivityLog, Api, Auth, HttpException, Input, Request, Response};
use App\Repositories\UserRepository;

Api::write();
$provider = Auth::requireProvider();
$data = Request::json();
$id = Api::id($data['id'] ?? null);
$allow = Input::bool($data['allow'] ?? true);

$user = UserRepository::find($id);
if (!$user) {
    throw HttpException::notFound('Usuário não encontrado.');
}
if (!empty($user['is_provider'])) {
    throw new HttpException(422, 'O provedor já pode trocar a própria senha a qualquer momento.');
}

UserRepository::setPasswordChangeAllowed($id, $allow);
ActivityLog::record($allow ? 'allow_password_change' : 'block_password_change', 'user', $id);

$user = UserRepository::find($id);
Response::success(
    $allow ? "Troca de senha liberada para {$user['name']}." : "Troca de senha bloqueada para {$user['name']}.",
    UserRepository::toPublic($user) + ['active' => (bool) $user['active']]
);

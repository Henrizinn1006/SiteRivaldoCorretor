<?php
/**
 * POST /api/profile/password.php — { current_password, password, password_confirmation }
 *
 * Quem pode trocar a própria senha:
 *   • no primeiro acesso (senha temporária criada pelo provedor);
 *   • quando o provedor liberar a troca (vale uma vez);
 *   • o provedor, sempre.
 */
declare(strict_types=1);

const ALLOW_PENDING_PASSWORD = true;

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{ActivityLog, Api, Csrf, HttpException, Request, Response, Session, Validator};
use App\Repositories\UserRepository;

$user = Api::write();
$id = (int) $user['id'];

if (!UserRepository::canChangePassword($user)) {
    throw new HttpException(403, 'A troca de senha está bloqueada. Peça ao provedor (Vortexis) para liberar.', ['password_change' => 'locked']);
}

$data = Request::json();
$hash = UserRepository::passwordHash($id);

$v = (new Validator($data))
    ->required('current_password', 'Informe sua senha atual.')
    ->required('password', 'Informe a nova senha.')->password('password')
    ->required('password_confirmation', 'Confirme a nova senha.')
    ->matches('password_confirmation', 'password', 'As senhas não conferem.');

if (is_string($data['current_password'] ?? null) && $data['current_password'] !== '' && (!$hash || !password_verify($data['current_password'], $hash))) {
    $v->addError('current_password', 'Senha atual incorreta.');
}
if (is_string($data['password'] ?? null) && $hash && password_verify($data['password'], $hash)) {
    $v->addError('password', 'A nova senha precisa ser diferente da atual.');
}
$v->validate();

UserRepository::updatePassword($id, (string) $data['password']);
UserRepository::completePasswordChange($id);
Session::regenerate();
$token = Csrf::regenerate();
ActivityLog::record(!empty($user['must_change_password']) ? 'first_password' : 'change_password', 'user', $id);

Response::success('Senha alterada com sucesso.', [
    'csrf_token' => $token,
    'user'       => UserRepository::toPublic(UserRepository::find($id)),
]);

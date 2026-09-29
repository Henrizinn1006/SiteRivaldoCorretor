<?php
/** POST /api/profile/update.php — { name, email (opcional), current_password (obrigatória se trocar o e-mail) } */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{ActivityLog, Api, Input, Request, Response, Validator};
use App\Repositories\UserRepository;

$user = Api::write();
$data = Request::json();
$id = (int) $user['id'];

$v = (new Validator($data))
    ->required('name', 'Informe seu nome.')->string('name')->maxLength('name', 120)
    ->string('email')->email('email')->maxLength('email', 190);

$newEmail = is_string($data['email'] ?? null) ? mb_strtolower(trim($data['email'])) : '';
$emailChanged = $newEmail !== (string) ($user['email'] ?? '');
if ($emailChanged) {
    if ($newEmail !== '' && UserRepository::emailExists($newEmail, $id)) {
        $v->addError('email', 'Este e-mail já está em uso.');
    }
    $hash = UserRepository::passwordHash($id);
    if (!is_string($data['current_password'] ?? null) || !$hash || !password_verify($data['current_password'], $hash)) {
        $v->addError('current_password', 'Confirme sua senha atual para trocar o e-mail.');
    }
}
$v->validate();

UserRepository::update($id, ['name' => Input::str($data['name'], 120), 'email' => $newEmail]);
ActivityLog::record('update_profile', 'user', $id, $emailChanged ? ['email_changed' => true] : null);
Response::success('Perfil atualizado.', ['user' => UserRepository::toPublic(UserRepository::find($id))]);

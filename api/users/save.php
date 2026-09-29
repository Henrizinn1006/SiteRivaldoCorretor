<?php
/**
 * POST /api/users/save.php (somente o provedor)
 * Criar:  { name, username, email?, role, password, active? }
 *         → a senha é TEMPORÁRIA: a pessoa cria a senha pessoal no 1º acesso.
 * Editar: { id, name, username, email?, role, active, password? (só para redefinir) }
 *         → redefinir a senha de outra pessoa obriga nova troca no próximo acesso.
 */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{ActivityLog, Api, Auth, HttpException, Input, Request, Response, Validator};
use App\Repositories\UserRepository;

Api::write();
$provider = Auth::requireProvider();
$data = Request::json();
$id = Input::int($data['id'] ?? null);
$existing = $id ? UserRepository::find($id) : null;
if ($id && !$existing) {
    throw HttpException::notFound('Usuário não encontrado.');
}

$username = is_string($data['username'] ?? null) ? trim($data['username']) : '';
$email = is_string($data['email'] ?? null) ? trim($data['email']) : '';

$v = (new Validator($data))
    ->required('name', 'Informe o nome.')->string('name')->maxLength('name', 120)
    ->string('username')->string('email')->email('email')->maxLength('email', 190)
    ->required('role', 'Selecione o perfil de acesso.')->in('role', ['admin', 'editor'], 'Perfil inválido.')
    ->password('password');
if (!$id) {
    $v->required('password', 'Defina uma senha temporária.');
}
if ($username === '' && $email === '') {
    $v->addError('username', 'Informe o nome de usuário (ou um e-mail) para o login.');
}
if ($username !== '' && !preg_match(UserRepository::USERNAME_PATTERN, $username)) {
    $v->addError('username', 'Use de 3 a 40 letras, números, ponto, hífen ou sublinhado (sem espaços).');
} elseif ($username !== '' && UserRepository::usernameExists($username, $id)) {
    $v->addError('username', 'Já existe um usuário com este nome.');
}
if ($email !== '' && UserRepository::emailExists($email, $id)) {
    $v->addError('email', 'Já existe um usuário com este e-mail.');
}
$v->validate();

$active = array_key_exists('active', $data) ? Input::bool($data['active']) : true;
$role = $data['role'];
$self = $id === (int) $provider['id'];

// Proteções: o provedor não tira o próprio acesso e o sistema nunca fica sem administrador
if ($self && (!$active || $role !== 'admin')) {
    throw new HttpException(422, 'Você não pode desativar nem rebaixar o seu próprio usuário.');
}
if ($existing && $existing['role'] === 'admin' && ($role !== 'admin' || !$active) && UserRepository::activeAdminCount($id) === 0) {
    throw new HttpException(422, 'É preciso manter pelo menos um administrador ativo.');
}

$passwordReset = !empty($data['password']);
if ($id) {
    UserRepository::update($id, [
        'name'     => Input::str($data['name'], 120),
        'username' => $username,
        'email'    => $email,
        'role'     => $role,
        'active'   => $active,
    ]);
    if ($passwordReset) {
        UserRepository::updatePassword($id, (string) $data['password']);
        if (!$self) {
            UserRepository::requirePasswordChange($id);
        }
    }
} else {
    $id = UserRepository::create(Input::str($data['name'], 120), $email, (string) $data['password'], $role, $username, true);
    if (!$active) {
        UserRepository::update($id, ['active' => false]);
    }
}
ActivityLog::record($existing ? 'update' : 'create', 'user', $id, $passwordReset && $existing ? ['password_reset' => true] : null);

$user = UserRepository::find($id);
Response::success(
    $existing ? 'Usuário atualizado.' : 'Usuário criado. No primeiro acesso ele vai criar a própria senha.',
    UserRepository::toPublic($user) + ['active' => (bool) $user['active']],
    $existing ? 200 : 201
);

<?php
/**
 * POST /api/auth/login.php
 * Body JSON: { "login": "RivaldoAdmin" (usuário ou e-mail), "password": "..." }
 * (aceita também "email" no lugar de "login", por compatibilidade)
 */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{Auth, Csrf, Request, Response, Session, Validator};

Request::requireMethod('POST');
Request::verifySameOrigin();
Session::start();

$data = Request::json();
if (!isset($data['login']) && isset($data['email'])) {
    $data['login'] = $data['email'];
}

(new Validator($data))
    ->required('login', 'Informe seu usuário ou e-mail.')
    ->string('login')
    ->maxLength('login', 190)
    ->required('password', 'Informe sua senha.')
    ->string('password')
    ->maxLength('password', 200)
    ->validate();

$user = Auth::attempt((string) $data['login'], (string) $data['password']);

Response::success('Login realizado com sucesso.', [
    'user'       => $user,
    'csrf_token' => Csrf::token(),
]);

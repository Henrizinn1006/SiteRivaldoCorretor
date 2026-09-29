<?php
/**
 * GET /api/auth/me.php
 * Retorna o usuário logado + token CSRF. 401 se não houver sessão válida.
 * Chamado por todas as páginas do painel ao abrir.
 */
declare(strict_types=1);

const ALLOW_PENDING_PASSWORD = true; // funciona antes de criar a senha pessoal

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{Auth, Csrf, Request, Response, Session};
use App\Repositories\UserRepository;

Request::requireMethod('GET');
Session::start();

$user = Auth::requireUser();

Response::success('', [
    'user'       => UserRepository::toPublic($user),
    'csrf_token' => Csrf::token(),
]);

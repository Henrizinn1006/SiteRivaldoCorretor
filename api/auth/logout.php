<?php
/**
 * POST /api/auth/logout.php   (header X-CSRF-Token)
 * Encerra a sessão. Idempotente: sem sessão, apenas confirma.
 */
declare(strict_types=1);

const ALLOW_PENDING_PASSWORD = true; // funciona antes de criar a senha pessoal

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{Auth, Request, Response, Session};

Request::requireMethod('POST');
Session::start();

if (Auth::user()) {
    Auth::requireWrite();   // mesma origem + CSRF: ninguém desloga o usuário por um link externo
    Auth::logout();
}

Response::success('Você saiu do painel.');

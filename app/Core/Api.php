<?php
declare(strict_types=1);

namespace App\Core;

defined('APP_ROOT') || exit;

/**
 * Atalhos usados no topo de cada endpoint:
 *   $user = Api::read();            GET  + login obrigatório
 *   $user = Api::read('admin');     GET  + só administradores
 *   $user = Api::write();           POST + login + mesma origem + CSRF
 *   $user = Api::write('admin');    POST + … + só administradores
 *   Api::publicRead(60);            GET público (site), cache de 60 s
 */
final class Api
{
    public static function read(string ...$roles): array
    {
        Request::requireMethod('GET');
        Session::start();
        return $roles ? Auth::requireRole(...$roles) : Auth::requireUser();
    }

    public static function write(string ...$roles): array
    {
        Request::requireMethod('POST');
        Session::start();
        return Auth::requireWrite(...$roles);
    }

    public static function publicRead(int $cacheSeconds = 60): void
    {
        Request::requireMethod('GET');
        Response::cacheFor($cacheSeconds);
    }

    /** Id positivo obrigatório (422 caso contrário). */
    public static function id(mixed $value, string $field = 'id'): int
    {
        $id = Input::int($value);
        if (!$id || $id < 1) {
            throw HttpException::validation([$field => 'Identificador inválido.'], 'Registro inválido.');
        }
        return $id;
    }

    /** Página e limite seguros para listagens. */
    public static function pagination(): array
    {
        $default = (int) Config::get('pagination.default_limit', 20);
        $max = (int) Config::get('pagination.max_limit', 100);
        $page = max(1, Input::int(Request::query('page')) ?? 1);
        $limit = Input::int(Request::query('limit')) ?? $default;
        return [$page, max(1, min($limit, $max))];
    }
}

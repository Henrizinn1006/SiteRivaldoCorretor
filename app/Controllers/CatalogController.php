<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\{ActivityLog, Api, Input, Request, Response, Validator};
use App\Repositories\CatalogRepository;

defined('APP_ROOT') || exit;

/**
 * Mesmo fluxo para Categorias (tipos de imóvel) e Características.
 * Editores podem consultar, criar e editar; excluir exige administrador.
 */
final class CatalogController
{
    private const LABELS = ['types' => 'Categoria', 'features' => 'Característica'];

    public static function index(string $kind): void
    {
        Api::read();
        Response::success('', ['items' => CatalogRepository::all($kind, false, true)]);
    }

    public static function save(string $kind): void
    {
        Api::write();
        $data = Request::json();
        (new Validator($data))
            ->required('name', 'Informe o nome.')
            ->string('name')
            ->minLength('name', 2)
            ->maxLength('name', 80)
            ->integer('sort_order', 0, 9999)
            ->validate();

        $id = Input::int($data['id'] ?? null);
        $item = CatalogRepository::save(
            $kind,
            $id,
            Input::str($data['name'], 80),
            array_key_exists('active', $data) ? Input::bool($data['active']) : true,
            Input::int($data['sort_order'] ?? null)
        );
        ActivityLog::record($id ? 'update' : 'create', $kind, $item['id']);
        Response::success(self::LABELS[$kind] . ($id ? ' atualizada.' : ' cadastrada.'), $item, $id ? 200 : 201);
    }

    public static function delete(string $kind): void
    {
        Api::write('admin');
        $id = Api::id(Request::json()['id'] ?? null);
        CatalogRepository::delete($kind, $id);
        ActivityLog::record('delete', $kind, $id);
        Response::success(self::LABELS[$kind] . ' excluída.');
    }
}

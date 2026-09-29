<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\{ActivityLog, Api, Config, Database, HttpException, Input, Request, Response};
use App\Repositories\{PropertyImageRepository, PropertyRepository};
use App\Services\ImageService;

defined('APP_ROOT') || exit;

/** Galeria de fotos do imóvel. */
final class ImageController
{
    /** POST multipart: property_id + files[] (uma ou várias imagens). */
    public static function upload(): void
    {
        Api::write();
        $propertyId = Api::id($_POST['property_id'] ?? null, 'property_id');
        if (!PropertyRepository::raw($propertyId)) {
            throw HttpException::notFound('Imóvel não encontrado.');
        }

        $files = ImageService::filesFrom('files');
        if (!$files) {
            // post_max_size estourado faz o PHP descartar tudo silenciosamente
            throw new HttpException(422, 'Nenhuma imagem recebida. Se as fotos forem muito grandes, envie menos de cada vez.');
        }

        $max = (int) Config::get('uploads.max_per_property', 40);
        $current = PropertyImageRepository::count($propertyId);
        if ($current + count($files) > $max) {
            throw new HttpException(422, "Limite de {$max} fotos por imóvel. Este imóvel já tem {$current}.");
        }

        $saved = [];
        $errors = [];
        foreach ($files as $i => $file) {
            try {
                [$key, $meta] = ImageService::storePropertyImage($file, $propertyId);
                $id = PropertyImageRepository::create($propertyId, $key, $meta);
                $saved[] = $id;
            } catch (HttpException $e) {
                $errors[(string) ($file['name'] ?? "arquivo {$i}")] = $e->getMessage();
            }
        }

        if (!$saved) {
            throw new HttpException(422, reset($errors) ?: 'Não foi possível enviar as imagens.', $errors);
        }
        Database::run('UPDATE properties SET updated_at = NOW() WHERE id = :id', ['id' => $propertyId]);
        ActivityLog::record('upload_images', 'property', $propertyId, ['count' => count($saved)]);

        $property = PropertyRepository::find($propertyId);
        Response::success(
            count($saved) === 1 ? 'Imagem enviada.' : count($saved) . ' imagens enviadas.',
            ['images' => $property['images'], 'cover_image_id' => $property['cover_image_id'], 'errors' => $errors],
            201
        );
    }

    /** { id } */
    public static function delete(): void
    {
        Api::write();
        $image = self::image(Api::id(Request::json()['id'] ?? null));
        $propertyId = (int) $image['property_id'];

        PropertyImageRepository::delete((int) $image['id']);   // FK zera a capa, se era ela
        ImageService::deleteVariants($propertyId, $image['file_key']);
        ActivityLog::record('delete_image', 'property', $propertyId, ['image' => (int) $image['id']]);

        self::respondGallery($propertyId, 'Imagem excluída.');
    }

    /** { property_id, order: [ids…] } */
    public static function reorder(): void
    {
        Api::write();
        $data = Request::json();
        $propertyId = Api::id($data['property_id'] ?? null, 'property_id');
        $order = Input::intList($data['order'] ?? []);
        $current = PropertyImageRepository::idsFor($propertyId);

        sort($current);
        $check = $order;
        sort($check);
        if ($check !== $current) {
            throw new HttpException(422, 'A lista de fotos está desatualizada. Recarregue a página.');
        }
        PropertyImageRepository::reorder($propertyId, $order);
        self::respondGallery($propertyId, 'Ordem das fotos atualizada.');
    }

    /** { property_id, image_id } */
    public static function cover(): void
    {
        Api::write();
        $data = Request::json();
        $image = self::image(Api::id($data['image_id'] ?? null, 'image_id'));
        $propertyId = Api::id($data['property_id'] ?? null, 'property_id');
        if ((int) $image['property_id'] !== $propertyId) {
            throw HttpException::forbidden('Esta foto não pertence ao imóvel.');
        }
        Database::run('UPDATE properties SET cover_image_id = :img WHERE id = :id', ['img' => (int) $image['id'], 'id' => $propertyId]);
        ActivityLog::record('set_cover', 'property', $propertyId, ['image' => (int) $image['id']]);
        self::respondGallery($propertyId, 'Foto de capa definida.');
    }

    private static function image(int $id): array
    {
        $image = PropertyImageRepository::find($id);
        if (!$image || !PropertyRepository::raw((int) $image['property_id'])) {
            throw HttpException::notFound('Imagem não encontrada.');
        }
        return $image;
    }

    private static function respondGallery(int $propertyId, string $message): void
    {
        $property = PropertyRepository::find($propertyId);
        Response::success($message, ['images' => $property['images'], 'cover_image_id' => $property['cover_image_id']]);
    }
}

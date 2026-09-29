<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Config;
use App\Core\HttpException;
use App\Core\Media;
use App\Core\Str;

defined('APP_ROOT') || exit;

/**
 * Upload seguro de imagens.
 *
 * - Nunca usa o nome enviado pelo usuário (nome = UUID).
 * - Valida o MIME REAL (finfo) e se o arquivo é mesmo uma imagem (getimagesize).
 * - Recodifica tudo com GD → o arquivo original nunca é salvo como veio,
 *   o que elimina scripts/código escondidos dentro de "imagens".
 * - Gera 3 variantes WebP: lg (original otimizada), md (card), sm (miniatura).
 */
final class ImageService
{
    private const MAX_PIXELS = 50_000_000; // ~50 MP: protege a memória do servidor

    private const UPLOAD_ERRORS = [
        UPLOAD_ERR_INI_SIZE   => 'A imagem é maior que o limite permitido pelo servidor.',
        UPLOAD_ERR_FORM_SIZE  => 'A imagem é maior que o limite permitido.',
        UPLOAD_ERR_PARTIAL    => 'O envio foi interrompido. Tente novamente.',
        UPLOAD_ERR_NO_FILE    => 'Nenhum arquivo foi enviado.',
        UPLOAD_ERR_NO_TMP_DIR => 'Servidor sem pasta temporária para uploads.',
        UPLOAD_ERR_CANT_WRITE => 'O servidor não conseguiu gravar o arquivo.',
        UPLOAD_ERR_EXTENSION  => 'Upload bloqueado pelo servidor.',
    ];

    /** Normaliza $_FILES['campo'] (simples ou múltiplo) em uma lista. */
    public static function filesFrom(string $field): array
    {
        $f = $_FILES[$field] ?? null;
        if (!$f || !isset($f['error'])) {
            return [];
        }
        if (!is_array($f['error'])) {
            return [$f];
        }
        $list = [];
        foreach ($f['error'] as $i => $error) {
            $list[] = [
                'name'     => $f['name'][$i] ?? '',
                'type'     => $f['type'][$i] ?? '',
                'tmp_name' => $f['tmp_name'][$i] ?? '',
                'error'    => $error,
                'size'     => $f['size'][$i] ?? 0,
            ];
        }
        return $list;
    }

    /** Valida o upload e retorna [mime, largura, altura]. Lança 422 com mensagem clara. */
    public static function validate(array $file): array
    {
        $error = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($error !== UPLOAD_ERR_OK) {
            throw new HttpException(422, self::UPLOAD_ERRORS[$error] ?? 'Falha no envio da imagem.');
        }
        $tmp = (string) ($file['tmp_name'] ?? '');
        if ($tmp === '' || !is_uploaded_file($tmp)) {
            throw new HttpException(422, 'Arquivo de upload inválido.');
        }

        $max = (int) Config::get('uploads.max_bytes', 10 * 1024 * 1024);
        $size = (int) filesize($tmp);
        if ($size <= 0 || $size > $max) {
            throw new HttpException(422, sprintf('Cada imagem pode ter no máximo %d MB.', (int) round($max / 1048576)));
        }

        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($tmp) ?: '';
        $allowed = (array) Config::get('uploads.allowed_mimes', ['image/jpeg', 'image/png', 'image/webp']);
        if (!in_array($mime, $allowed, true)) {
            throw new HttpException(422, 'Formato não permitido. Envie JPG, PNG ou WEBP.');
        }

        $info = @getimagesize($tmp);
        if ($info === false || $info[0] < 1 || $info[1] < 1) {
            throw new HttpException(422, 'O arquivo não é uma imagem válida.');
        }
        if ($info[0] * $info[1] > self::MAX_PIXELS) {
            throw new HttpException(422, 'Resolução da imagem muito alta. Reduza o tamanho e envie novamente.');
        }
        return [$mime, (int) $info[0], (int) $info[1]];
    }

    /** Processa uma foto de imóvel. Retorna [file_key, meta]. */
    public static function storePropertyImage(array $file, int $propertyId): array
    {
        self::assertGd();
        [$mime] = self::validate($file);

        $image = self::load((string) $file['tmp_name'], $mime);
        $dir = Media::dir($propertyId);
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new \RuntimeException('Não foi possível criar a pasta de uploads.');
        }

        $key = Str::uuid();
        $quality = (int) Config::get('uploads.webp_quality', 82);
        $sizes = [
            'lg' => (int) Config::get('uploads.max_dimension', 1920),
            'md' => (int) Config::get('uploads.card_dimension', 900),
            'sm' => (int) Config::get('uploads.thumb_dimension', 400),
        ];

        $meta = [];
        try {
            foreach ($sizes as $variant => $maxSide) {
                $resized = self::fit($image, $maxSide);
                $path = Media::path($propertyId, $key, $variant);
                self::saveWebp($resized, $path, $variant === 'sm' ? 78 : $quality);
                if ($variant === 'lg') {
                    $meta = ['width' => imagesx($resized), 'height' => imagesy($resized), 'size' => (int) filesize($path)];
                }
                if ($resized !== $image) {
                    imagedestroy($resized);
                }
            }
        } catch (\Throwable $e) {
            self::deleteVariants($propertyId, $key);
            throw $e;
        } finally {
            imagedestroy($image);
        }

        $meta['original_name'] = self::cleanName((string) ($file['name'] ?? ''));
        return [$key, $meta];
    }

    /** Logo (WebP até 800px, mantém transparência) ou favicon (PNG 180×180). Retorna caminho relativo. */
    public static function storeSiteAsset(array $file, string $kind): string
    {
        self::assertGd();
        [$mime] = self::validate($file);
        $image = self::load((string) $file['tmp_name'], $mime);

        $dir = APP_ROOT . '/uploads/site';
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new \RuntimeException('Não foi possível criar a pasta de uploads.');
        }
        $name = $kind . '-' . bin2hex(random_bytes(6));

        try {
            if ($kind === 'favicon') {
                $square = self::squareCrop($image, 180);
                $relative = "uploads/site/{$name}.png";
                imagepng($square, APP_ROOT . '/' . $relative, 6);
                imagedestroy($square);
            } else {
                $resized = self::fit($image, 800);
                $relative = "uploads/site/{$name}.webp";
                self::saveWebp($resized, APP_ROOT . '/' . $relative, 90);
                if ($resized !== $image) {
                    imagedestroy($resized);
                }
            }
        } finally {
            imagedestroy($image);
        }
        return $relative;
    }

    /** Remove um arquivo de uploads/site com segurança (só dentro da pasta). */
    public static function deleteSiteAsset(?string $relative): void
    {
        if (!$relative || !preg_match('#^uploads/site/[a-z]+-[a-f0-9]{12}\.(png|webp)$#', $relative)) {
            return;
        }
        $path = APP_ROOT . '/' . $relative;
        if (is_file($path)) {
            @unlink($path);
        }
    }

    public static function deleteVariants(int $propertyId, string $key): void
    {
        foreach (Media::SIZES as $size) {
            $path = Media::path($propertyId, $key, $size);
            if (is_file($path)) {
                @unlink($path);
            }
        }
    }

    /** Copia as 3 variantes para outro imóvel (duplicação). Retorna a nova chave. */
    public static function copyVariants(int $fromId, string $key, int $toId): ?string
    {
        $dir = Media::dir($toId);
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
            return null;
        }
        $newKey = Str::uuid();
        foreach (Media::SIZES as $size) {
            $src = Media::path($fromId, $key, $size);
            if (!is_file($src) || !copy($src, Media::path($toId, $newKey, $size))) {
                self::deleteVariants($toId, $newKey);
                return null;
            }
        }
        return $newKey;
    }

    // ------------------------------------------------------------------ //

    private static function assertGd(): void
    {
        if (!function_exists('imagecreatetruecolor') || !function_exists('imagewebp')) {
            throw new HttpException(500, 'O servidor não tem a extensão GD com suporte a WebP. Ative-a no painel da hospedagem.');
        }
        @ini_set('memory_limit', '256M');
    }

    private static function load(string $path, string $mime): \GdImage
    {
        $image = match ($mime) {
            'image/jpeg' => @imagecreatefromjpeg($path),
            'image/png'  => @imagecreatefrompng($path),
            'image/webp' => @imagecreatefromwebp($path),
            default      => false,
        };
        if (!$image instanceof \GdImage) {
            throw new HttpException(422, 'Não foi possível ler a imagem (arquivo corrompido ou WebP animado).');
        }
        if (!imageistruecolor($image)) {
            imagepalettetotruecolor($image);
        }
        imagealphablending($image, false);
        imagesavealpha($image, true);

        // Fotos de celular: aplica a rotação salva no EXIF
        if ($mime === 'image/jpeg' && function_exists('exif_read_data')) {
            $exif = @exif_read_data($path);
            $angle = match ((int) ($exif['Orientation'] ?? 1)) {
                3 => 180,
                6 => -90,
                8 => 90,
                default => 0,
            };
            if ($angle !== 0) {
                $rotated = imagerotate($image, $angle, 0);
                if ($rotated instanceof \GdImage) {
                    imagedestroy($image);
                    $image = $rotated;
                }
            }
        }
        return $image;
    }

    /** Reduz para caber em $maxSide (nunca amplia). */
    private static function fit(\GdImage $src, int $maxSide): \GdImage
    {
        $w = imagesx($src);
        $h = imagesy($src);
        $scale = min(1, $maxSide / max($w, $h));
        if ($scale >= 1) {
            return $src;
        }
        $nw = max(1, (int) round($w * $scale));
        $nh = max(1, (int) round($h * $scale));
        $dst = imagecreatetruecolor($nw, $nh);
        imagealphablending($dst, false);
        imagesavealpha($dst, true);
        imagefill($dst, 0, 0, imagecolorallocatealpha($dst, 0, 0, 0, 127));
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
        return $dst;
    }

    private static function squareCrop(\GdImage $src, int $size): \GdImage
    {
        $w = imagesx($src);
        $h = imagesy($src);
        $side = min($w, $h);
        $dst = imagecreatetruecolor($size, $size);
        imagealphablending($dst, false);
        imagesavealpha($dst, true);
        imagefill($dst, 0, 0, imagecolorallocatealpha($dst, 0, 0, 0, 127));
        imagecopyresampled($dst, $src, 0, 0, (int) (($w - $side) / 2), (int) (($h - $side) / 2), $size, $size, $side, $side);
        return $dst;
    }

    private static function saveWebp(\GdImage $image, string $path, int $quality): void
    {
        if (!imagewebp($image, $path, $quality)) {
            throw new \RuntimeException('Falha ao gravar imagem WebP.');
        }
        @chmod($path, 0644);
    }

    private static function cleanName(string $name): string
    {
        $name = basename(str_replace('\\', '/', $name));
        $name = preg_replace('/[^\pL\pN ._()-]+/u', '', $name) ?? '';
        return mb_substr(trim($name), 0, 190);
    }
}

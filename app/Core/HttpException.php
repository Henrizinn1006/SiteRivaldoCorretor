<?php
declare(strict_types=1);

namespace App\Core;

defined('APP_ROOT') || exit;

/**
 * Exceção que vira uma resposta HTTP padronizada.
 * Ex.: throw new HttpException(422, 'Verifique os campos.', ['email' => 'E-mail inválido.']);
 */
final class HttpException extends \RuntimeException
{
    public function __construct(
        private int $status,
        string $message,
        private array $errors = [],
        private array $headers = []
    ) {
        parent::__construct($message, $status);
    }

    public function getStatus(): int { return $this->status; }
    public function getErrors(): array { return $this->errors; }
    public function getHeaders(): array { return $this->headers; }

    public static function unauthorized(string $message = 'Sessão expirada. Faça login novamente.'): self
    {
        return new self(401, $message);
    }

    public static function forbidden(string $message = 'Você não tem permissão para esta ação.'): self
    {
        return new self(403, $message);
    }

    public static function notFound(string $message = 'Registro não encontrado.'): self
    {
        return new self(404, $message);
    }

    public static function validation(array $errors, string $message = 'Verifique os campos destacados.'): self
    {
        return new self(422, $message, $errors);
    }
}

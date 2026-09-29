<?php
declare(strict_types=1);

namespace App\Core;

defined('APP_ROOT') || exit;

/**
 * Validação server-side encadeável. Guarda a 1ª mensagem de erro de cada campo.
 *
 *   (new Validator($data))
 *       ->required('email', 'Informe o e-mail.')
 *       ->email('email')
 *       ->validate();   // lança 422 com { errors: { email: "..." } }
 */
final class Validator
{
    private array $errors = [];

    public function __construct(private array $data) {}

    public function value(string $field): mixed
    {
        $value = $this->data[$field] ?? null;
        return is_string($value) ? trim($value) : $value;
    }

    private function fail(string $field, string $message): self
    {
        if (!isset($this->errors[$field])) {
            $this->errors[$field] = $message;
        }
        return $this;
    }

    private function isEmpty(mixed $value): bool
    {
        return $value === null || $value === '' || (is_array($value) && $value === []);
    }

    public function required(string $field, string $message = 'Campo obrigatório.'): self
    {
        return $this->isEmpty($this->value($field)) ? $this->fail($field, $message) : $this;
    }

    public function string(string $field, string $message = 'Valor inválido.'): self
    {
        $v = $this->value($field);
        return ($v !== null && !is_string($v)) ? $this->fail($field, $message) : $this;
    }

    public function email(string $field, string $message = 'Informe um e-mail válido.'): self
    {
        $v = $this->value($field);
        if ($this->isEmpty($v)) return $this;
        return (!is_string($v) || !filter_var($v, FILTER_VALIDATE_EMAIL)) ? $this->fail($field, $message) : $this;
    }

    public function minLength(string $field, int $min, ?string $message = null): self
    {
        $v = $this->value($field);
        if ($this->isEmpty($v)) return $this;
        return (!is_string($v) || mb_strlen($v) < $min)
            ? $this->fail($field, $message ?? "Mínimo de {$min} caracteres.") : $this;
    }

    public function maxLength(string $field, int $max, ?string $message = null): self
    {
        $v = $this->value($field);
        if ($this->isEmpty($v)) return $this;
        return (!is_string($v) || mb_strlen($v) > $max)
            ? $this->fail($field, $message ?? "Máximo de {$max} caracteres.") : $this;
    }

    public function in(string $field, array $allowed, string $message = 'Opção inválida.'): self
    {
        $v = $this->value($field);
        if ($this->isEmpty($v)) return $this;
        return !in_array($v, $allowed, true) ? $this->fail($field, $message) : $this;
    }

    public function integer(string $field, ?int $min = null, ?int $max = null, string $message = 'Informe um número inteiro válido.'): self
    {
        $v = $this->value($field);
        if ($this->isEmpty($v)) return $this;
        $int = filter_var($v, FILTER_VALIDATE_INT);
        if ($int === false || ($min !== null && $int < $min) || ($max !== null && $int > $max)) {
            return $this->fail($field, $message);
        }
        return $this;
    }

    public function numeric(string $field, ?float $min = null, ?float $max = null, string $message = 'Informe um valor numérico válido.'): self
    {
        $v = $this->value($field);
        if ($this->isEmpty($v)) return $this;
        if (!is_numeric($v) || ($min !== null && $v < $min) || ($max !== null && $v > $max)) {
            return $this->fail($field, $message);
        }
        return $this;
    }

    public function matches(string $field, string $otherField, string $message = 'Os valores não conferem.'): self
    {
        return $this->value($field) !== $this->value($otherField) ? $this->fail($field, $message) : $this;
    }

    /** Senha: tamanho mínimo + pelo menos uma letra e um número. */
    public function password(string $field, ?string $message = null): self
    {
        $v = $this->value($field);
        if ($this->isEmpty($v)) return $this;
        $min = (int) Config::get('password.min_length', 10);
        if (!is_string($v) || mb_strlen($v) < $min || !preg_match('/\pL/u', $v) || !preg_match('/\d/', $v)) {
            return $this->fail($field, $message ?? "A senha precisa ter pelo menos {$min} caracteres, com letras e números.");
        }
        return $this;
    }

    /** Regra personalizada: callback retorna true quando válido. */
    public function rule(string $field, callable $check, string $message): self
    {
        return $check($this->value($field)) ? $this : $this->fail($field, $message);
    }

    public function addError(string $field, string $message): self
    {
        return $this->fail($field, $message);
    }

    public function fails(): bool
    {
        return $this->errors !== [];
    }

    public function errors(): array
    {
        return $this->errors;
    }

    public function validate(string $message = 'Verifique os campos destacados.'): void
    {
        if ($this->fails()) {
            throw HttpException::validation($this->errors, $message);
        }
    }
}

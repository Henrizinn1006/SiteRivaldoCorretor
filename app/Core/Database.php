<?php
declare(strict_types=1);

namespace App\Core;

use PDO;
use PDOStatement;

defined('APP_ROOT') || exit;

/**
 * Conexão PDO única + atalhos com prepared statements.
 * Nunca concatene valores do usuário em SQL: use sempre os parâmetros.
 */
final class Database
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo !== null) {
            return self::$pdo;
        }

        // 1º o .env (padrão); config/database.php continua aceito como alternativa.
        if (Env::has('DB_NAME')) {
            $cfg = [
                'DB_HOST'     => Env::get('DB_HOST', 'localhost'),
                'DB_PORT'     => Env::get('DB_PORT', '3306'),
                'DB_NAME'     => Env::get('DB_NAME'),
                'DB_USER'     => Env::get('DB_USER', ''),
                'DB_PASSWORD' => Env::get('DB_PASSWORD', ''),
                'DB_CHARSET'  => Env::get('DB_CHARSET', 'utf8mb4'),
            ];
        } elseif (is_file(APP_ROOT . '/config/database.php')) {
            $cfg = require APP_ROOT . '/config/database.php';
        } else {
            throw new \RuntimeException('Credenciais do banco não encontradas: crie o arquivo .env na raiz do site (veja o README).');
        }

        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=%s',
            $cfg['DB_HOST'] ?? 'localhost',
            (int) ($cfg['DB_PORT'] ?? 3306),
            $cfg['DB_NAME'] ?? '',
            $cfg['DB_CHARSET'] ?? 'utf8mb4'
        );

        self::$pdo = new PDO($dsn, $cfg['DB_USER'] ?? '', $cfg['DB_PASSWORD'] ?? '', [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,   // prepared statements reais no servidor
            PDO::ATTR_STRINGIFY_FETCHES  => false,
        ]);

        // Mesmo fuso do PHP, para NOW() e datas baterem.
        $offset = (new \DateTimeImmutable())->format('P');
        self::$pdo->exec("SET time_zone = '{$offset}'");

        return self::$pdo;
    }

    public static function run(string $sql, array $params = []): PDOStatement
    {
        $stmt = self::pdo()->prepare($sql);
        foreach ($params as $key => $value) {
            $name = is_int($key) ? $key + 1 : (str_starts_with((string) $key, ':') ? $key : ':' . $key);
            $type = match (true) {
                is_int($value)  => PDO::PARAM_INT,
                is_bool($value) => PDO::PARAM_BOOL,
                $value === null => PDO::PARAM_NULL,
                default         => PDO::PARAM_STR,
            };
            $stmt->bindValue($name, $value, $type);
        }
        $stmt->execute();
        return $stmt;
    }

    /** Uma linha ou null. */
    public static function fetch(string $sql, array $params = []): ?array
    {
        $row = self::run($sql, $params)->fetch();
        return $row === false ? null : $row;
    }

    public static function fetchAll(string $sql, array $params = []): array
    {
        return self::run($sql, $params)->fetchAll();
    }

    public static function value(string $sql, array $params = []): mixed
    {
        $value = self::run($sql, $params)->fetchColumn();
        return $value === false ? null : $value;
    }

    /** INSERT e retorna o id gerado. */
    public static function insert(string $sql, array $params = []): int
    {
        self::run($sql, $params);
        return (int) self::pdo()->lastInsertId();
    }

    /** Executa o callback dentro de uma transação (rollback automático em erro). */
    public static function transaction(callable $callback): mixed
    {
        $pdo = self::pdo();
        $pdo->beginTransaction();
        try {
            $result = $callback($pdo);
            $pdo->commit();
            return $result;
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }
}

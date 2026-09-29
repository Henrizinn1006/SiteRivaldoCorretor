<?php
/**
 * Ponto de entrada comum de todo PHP da aplicação.
 *
 * Uso nos endpoints:
 *   require dirname(__DIR__, 2) . '/app/bootstrap.php';
 *
 * Para páginas HTML (instalador) ou CLI, defina antes do require:
 *   const APP_CONTEXT = 'html';   // ou 'cli'
 */
declare(strict_types=1);

if (!defined('APP_ROOT')) {
    define('APP_ROOT', dirname(__DIR__));
}
if (!defined('APP_CONTEXT')) {
    define('APP_CONTEXT', 'api');
}

if (PHP_VERSION_ID < 80000) {
    http_response_code(500);
    exit('Este sistema requer PHP 8.0 ou superior.');
}

// Autoload simples: App\Core\Auth → app/Core/Auth.php
spl_autoload_register(static function (string $class): void {
    $prefix = 'App\\';
    if (strncmp($class, $prefix, strlen($prefix)) !== 0) {
        return;
    }
    $file = __DIR__ . '/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

use App\Core\Config;
use App\Core\Env;
use App\Core\HttpException;
use App\Core\Response;

// .env: fora do site (melhor) → config/.env (pasta bloqueada) → raiz do site (bloqueado pelo .htaccess).
// Algumas hospedagens não deixam o PHP ler fora da public_html; por isso as opções de dentro.
Env::load([dirname(APP_ROOT) . '/.env', APP_ROOT . '/config/.env', APP_ROOT . '/.env']);

Config::load(require APP_ROOT . '/config/config.php');

date_default_timezone_set((string) Config::get('timezone', 'America/Sao_Paulo'));
mb_internal_encoding('UTF-8');

error_reporting(E_ALL);
ini_set('display_errors', Config::get('debug') ? '1' : '0');
ini_set('log_errors', '1');

// Avisos do PHP viram exceções → nada "passa batido" silenciosamente.
set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
    if (!(error_reporting() & $severity)) {
        return false;
    }
    // Depreciações só vão para o log: uma atualização de PHP na hospedagem não derruba o painel.
    if ($severity === E_DEPRECATED || $severity === E_USER_DEPRECATED) {
        error_log("[deprecated] {$message} in {$file}:{$line}");
        return true;
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
});

set_exception_handler(static function (Throwable $e): void {
    if ($e instanceof HttpException) {
        if (APP_CONTEXT === 'api') {
            Response::error($e->getMessage(), $e->getStatus(), $e->getErrors(), $e->getHeaders());
        }
        http_response_code($e->getStatus());
        echo htmlspecialchars($e->getMessage(), ENT_QUOTES, 'UTF-8');
        exit;
    }

    // Erro inesperado: registra detalhes no log do servidor, mas NUNCA os expõe ao navegador.
    error_log(sprintf('[%s] %s in %s:%d', get_class($e), $e->getMessage(), $e->getFile(), $e->getLine()));

    if (APP_CONTEXT === 'cli') {
        fwrite(STDERR, 'Erro: ' . $e->getMessage() . PHP_EOL);
        exit(1);
    }

    $message = Config::get('debug') ? $e->getMessage() : 'Erro interno. Tente novamente em instantes.';
    if (APP_CONTEXT === 'api') {
        // Código curto para diagnóstico (não revela senha, usuário, caminho nem mensagem do banco)
        $code = 'erro_app';
        if (!Env::has('DB_NAME')) {
            $code = Env::status() === 'env_ok' ? 'env_sem_DB_NAME' : Env::status();
        } elseif ($e instanceof PDOException) {
            $map = [1045 => 'banco_usuario_ou_senha', 1044 => 'banco_sem_permissao', 1049 => 'banco_nome_inexistente', 2002 => 'banco_host', 2005 => 'banco_host', 1146 => 'banco_tabela_faltando', 1054 => 'banco_coluna_faltando'];
            $num = (int) (($e->errorInfo[1] ?? 0) ?: (preg_match('/\[(\d{4})\]/', $e->getMessage(), $m) ? $m[1] : 0));
            $code = $map[$num] ?? 'banco_' . ($num ?: 'erro');
        }
        Response::error($message, 500, ['codigo' => $code]);
    }
    http_response_code(500);
    echo htmlspecialchars($message, ENT_QUOTES, 'UTF-8');
    exit;
});

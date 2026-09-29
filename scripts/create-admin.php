<?php
/**
 * Cria (ou redefine a senha de) um administrador pelo TERMINAL.
 *
 *   php scripts/create-admin.php
 *   php scripts/create-admin.php --reset-password      (usuário existente)
 *   php scripts/create-admin.php --role=editor
 *   php scripts/create-admin.php --provider            (usuário do provedor: gerencia usuários)
 *
 * Nada é gravado em texto puro: a senha vira hash com password_hash().
 * A pasta /scripts é bloqueada para acesso via navegador.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Disponível apenas pelo terminal.');
}

const APP_CONTEXT = 'cli';
require dirname(__DIR__) . '/app/bootstrap.php';

use App\Core\{Str, Validator};
use App\Repositories\UserRepository;

$options = getopt('', ['reset-password', 'role:', 'name:', 'email:', 'provider']);
$reset = isset($options['reset-password']);
$role = $options['role'] ?? 'admin';

function ask(string $label, bool $hidden = false): string
{
    fwrite(STDOUT, $label);
    if ($hidden && DIRECTORY_SEPARATOR === '/' && function_exists('shell_exec')) {
        shell_exec('stty -echo');
        $value = fgets(STDIN);
        shell_exec('stty echo');
        fwrite(STDOUT, PHP_EOL);
    } else {
        $value = fgets(STDIN);
    }
    return trim((string) $value);
}

function fail(array $errors): void
{
    foreach ($errors as $message) {
        fwrite(STDERR, "  ✗ {$message}" . PHP_EOL);
    }
    exit(1);
}

echo PHP_EOL . ($reset ? '== Redefinir senha ==' : '== Novo usuário do painel ==') . PHP_EOL . PHP_EOL;

$data = [];
if (!$reset) {
    $data['name'] = $options['name'] ?? ask('Nome: ');
}
$data['email'] = $options['email'] ?? ask('E-mail: ');
$data['password'] = ask('Senha: ', true);
$data['password_confirmation'] = ask('Confirme a senha: ', true);
$data['role'] = $role;

$v = (new Validator($data))
    ->required('email', 'Informe o e-mail.')
    ->email('email')
    ->required('password', 'Informe a senha.')
    ->password('password')
    ->matches('password_confirmation', 'password', 'As senhas não conferem.');

if (!$reset) {
    $v->required('name', 'Informe o nome.')->maxLength('name', 120)->in('role', ['admin', 'editor']);
}
if ($v->fails()) {
    fail($v->errors());
}

if ($reset) {
    $user = UserRepository::findForLogin($data['email']);
    if (!$user) {
        fail(['Nenhum usuário com este e-mail.']);
    }
    UserRepository::updatePassword((int) $user['id'], $data['password']);
    echo PHP_EOL . "  ✓ Senha redefinida para {$user['email']}." . PHP_EOL . PHP_EOL;
    exit(0);
}

if (UserRepository::emailExists($data['email'])) {
    fail(['Já existe um usuário com este e-mail. Use --reset-password para trocar a senha.']);
}

$id = UserRepository::create($data['name'], $data['email'], $data['password'], $role, null, false, isset($options['provider']));
echo PHP_EOL . '  ✓ Usuário criado (#' . $id . ', ' . $role . '): ' . Str::normalizeEmail($data['email']) . PHP_EOL . PHP_EOL;

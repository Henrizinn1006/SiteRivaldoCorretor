<?php
/**
 * INSTALADOR DE USO ÚNICO — cria o primeiro administrador pelo navegador.
 * Use apenas se a hospedagem não oferecer terminal (SSH).
 *
 * Só funciona quando:
 *   1. o .env tem SETUP_TOKEN preenchido; e
 *   2. ainda NÃO existe nenhum usuário no banco.
 *
 * Depois de criar o administrador:
 *   → apague a pasta /install
 *   → apague a linha SETUP_TOKEN do .env (ou deixe vazia)
 */
declare(strict_types=1);

const APP_CONTEXT = 'html';
require dirname(__DIR__) . '/app/bootstrap.php';

use App\Core\{ActivityLog, Config, Csrf, Session, Validator};
use App\Repositories\UserRepository;

header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');

function e(?string $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

$setupToken = (string) Config::get('setup_token', '');
$state = 'form';
$message = '';
$errors = [];
$old = ['name' => '', 'email' => ''];

try {
    $usersExist = UserRepository::count() > 0;
} catch (Throwable $e) {
    $state = 'db_error';
    $message = 'Não foi possível conectar ao banco. Confira os dados DB_ do arquivo .env e se o database.sql foi importado.';
    $usersExist = false;
}

if ($state !== 'db_error') {
    if ($setupToken === '') {
        $state = 'disabled';
    } elseif ($usersExist) {
        $state = 'done_before';
    }
}

if ($state === 'form') {
    Session::start();

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        try {
            Csrf::verify();
        } catch (Throwable) {
            $errors['_'] = 'Formulário expirado. Recarregue a página.';
        }

        $data = [
            'token'                 => (string) ($_POST['token'] ?? ''),
            'name'                  => (string) ($_POST['name'] ?? ''),
            'email'                 => (string) ($_POST['email'] ?? ''),
            'password'              => (string) ($_POST['password'] ?? ''),
            'password_confirmation' => (string) ($_POST['password_confirmation'] ?? ''),
        ];
        $old = ['name' => $data['name'], 'email' => $data['email']];

        $v = (new Validator($data))
            ->rule('token', fn($t) => is_string($t) && hash_equals($setupToken, $t), 'Token de instalação incorreto.')
            ->required('name', 'Informe o nome.')->maxLength('name', 120)
            ->required('email', 'Informe o e-mail.')->email('email')->maxLength('email', 190)
            ->required('password', 'Crie uma senha.')->password('password')
            ->matches('password_confirmation', 'password', 'As senhas não conferem.');

        $errors += $v->errors();

        if (!$errors) {
            // O 1º usuário é o provedor: único que gerencia usuários e libera trocas de senha.
            $id = UserRepository::create($data['name'], $data['email'], $data['password'], 'admin', null, false, true);
            ActivityLog::record('install_admin', 'user', $id, null, $id);
            Csrf::regenerate();
            $state = 'success';
        }
    }
}
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Instalação — Painel</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500&family=Manrope:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../admin/css/admin.css">
</head>
<body class="auth-page">
  <main class="auth">
    <div class="auth__card">
      <div class="auth__brand">
        <span class="brand-mark" aria-hidden="true"><span>R</span></span>
        <div>
          <p class="auth__title">Instalação do painel</p>
          <p class="auth__subtitle">Criar o primeiro administrador</p>
        </div>
      </div>

      <?php if ($state === 'db_error'): ?>
        <div class="notice notice--error" role="alert"><?= e($message) ?></div>

      <?php elseif ($state === 'disabled'): ?>
        <div class="notice" role="status">
          O instalador está desativado. Para usá-lo, preencha temporariamente
          <code>SETUP_TOKEN</code> no arquivo <code>.env</code>.
        </div>

      <?php elseif ($state === 'done_before'): ?>
        <div class="notice" role="status">
          Já existe um usuário cadastrado, então o instalador foi bloqueado.<br>
          <strong>Apague a pasta <code>/install</code></strong> e deixe <code>SETUP_TOKEN</code> vazio no <code>.env</code>.
        </div>
        <a class="btn btn--gold btn--block" href="../admin/login.html">Ir para o login</a>

      <?php elseif ($state === 'success'): ?>
        <div class="notice notice--success" role="status">
          Administrador criado com sucesso.<br>
          Agora <strong>apague a pasta <code>/install</code></strong> do servidor e
          deixe <code>SETUP_TOKEN</code> vazio no <code>.env</code>.
        </div>
        <a class="btn btn--gold btn--block" href="../admin/login.html">Ir para o login</a>

      <?php else: ?>
        <?php if (isset($errors['_'])): ?>
          <div class="notice notice--error" role="alert"><?= e($errors['_']) ?></div>
        <?php endif; ?>

        <form class="auth__form" method="post" autocomplete="off" novalidate>
          <input type="hidden" name="_csrf" value="<?= e(Csrf::token()) ?>">

          <?php
          $fields = [
              ['token', 'Token de instalação', 'password', ''],
              ['name', 'Nome', 'text', $old['name']],
              ['email', 'E-mail', 'email', $old['email']],
              ['password', 'Senha', 'password', ''],
              ['password_confirmation', 'Confirmar senha', 'password', ''],
          ];
          foreach ($fields as [$name, $label, $type, $value]): ?>
            <div class="form-field<?= isset($errors[$name]) ? ' has-error' : '' ?>">
              <label for="f-<?= e($name) ?>"><?= e($label) ?></label>
              <input class="input" id="f-<?= e($name) ?>" name="<?= e($name) ?>" type="<?= e($type) ?>"
                     value="<?= e($value) ?>" required
                     <?= isset($errors[$name]) ? 'aria-invalid="true" aria-describedby="err-' . e($name) . '"' : '' ?>>
              <?php if (isset($errors[$name])): ?>
                <p class="form-error" id="err-<?= e($name) ?>"><?= e($errors[$name]) ?></p>
              <?php endif; ?>
            </div>
          <?php endforeach; ?>

          <p class="form-hint">Mínimo de <?= (int) Config::get('password.min_length', 10) ?> caracteres, com letras e números.</p>
          <button class="btn btn--gold btn--block" type="submit">Criar administrador</button>
        </form>
      <?php endif; ?>
    </div>
  </main>
</body>
</html>

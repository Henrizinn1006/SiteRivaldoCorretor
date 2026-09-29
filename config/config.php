<?php
/**
 * Configurações gerais da aplicação.
 * NÃO coloque credenciais aqui — elas ficam no arquivo .env (veja o README, seção 3).
 */
declare(strict_types=1);

defined('APP_ROOT') || exit;

use App\Core\Env;

return [
    // 'production' desliga mensagens de erro detalhadas. Use 'local' só na sua máquina.
    'env'       => Env::get('APP_ENV', 'production'),
    'debug'     => Env::bool('APP_DEBUG', false),
    'timezone'  => 'America/Sao_Paulo',

    'session' => [
        'name'             => 'rv_admin',
        'idle_timeout'     => 60 * 60 * 2,   // 2 h sem atividade → sai
        'absolute_timeout' => 60 * 60 * 12,  // 12 h no máximo por login
    ],

    'login' => [
        'max_attempts'   => 5,    // falhas permitidas…
        'window_minutes' => 15,   // …dentro desta janela (por e-mail + IP)
    ],

    'password' => [
        'min_length' => 10,
    ],

    'uploads' => [
        'max_bytes'      => 10 * 1024 * 1024,                 // 10 MB por imagem
        'allowed_mimes'  => ['image/jpeg', 'image/png', 'image/webp'],
        'max_dimension'  => 1920,                             // variante "lg"
        'card_dimension' => 900,                              // variante "md"
        'thumb_dimension'=> 400,                              // variante "sm"
        'webp_quality'   => 82,
        'max_per_property' => 40,
    ],

    'pagination' => [
        'default_limit' => 20,
        'max_limit'     => 100,
    ],

    // Token para o instalador web (install/index.php) criar o 1º admin.
    // Defina SETUP_TOKEN no .env só na hora de instalar; depois deixe vazio.
    'setup_token' => Env::get('SETUP_TOKEN', ''),
];

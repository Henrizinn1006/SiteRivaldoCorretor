<?php
/**
 * ALTERNATIVA ao .env (o recomendado é usar o arquivo .env — veja o README, seção 3).
 * Só é lido se o .env não tiver DB_NAME.
 *
 * 1. Copie este arquivo para  config/database.php
 * 2. Preencha com os dados criados no painel da hospedagem (cPanel → MySQL Databases)
 * 3. NUNCA envie config/database.php para o GitHub (já está no .gitignore)
 */
declare(strict_types=1);

defined('APP_ROOT') || exit;

return [
    'DB_HOST'     => 'localhost',   // quase sempre "localhost" em hospedagem compartilhada
    'DB_PORT'     => 3306,
    'DB_NAME'     => 'usuario_rivaldo',
    'DB_USER'     => 'usuario_rivaldo',
    'DB_PASSWORD' => 'COLOQUE_A_SENHA_AQUI',
    'DB_CHARSET'  => 'utf8mb4',
];

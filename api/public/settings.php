<?php
/** GET /api/public/settings.php — contatos, redes sociais, CRECI, logo (site). */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{Api, Response};
use App\Repositories\SettingsRepository;

Api::publicRead(300);
$s = SettingsRepository::all(true);
$s['whatsapp_url'] = $s['whatsapp'] !== ''
    ? 'https://wa.me/' . $s['whatsapp'] . ($s['whatsapp_message'] !== '' ? '?text=' . rawurlencode($s['whatsapp_message']) : '')
    : '';
Response::success('', $s);

<?php
/** POST /api/settings/save.php — { company_name, phone, whatsapp, … } (admin). */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{ActivityLog, Api, Input, Request, Response, Validator};
use App\Repositories\SettingsRepository;

$user = Api::write('admin');
$data = Request::json();

$v = new Validator($data);
$v->required('company_name', 'Informe o nome da imobiliária.');
$values = [];

foreach (SettingsRepository::FIELDS as $key => [$type, $max]) {
    if ($type === 'file' || !array_key_exists($key, $data)) {
        continue; // logo/favicon têm endpoint próprio
    }
    $v->string($key)->maxLength($key, $max);
    $value = Input::str($data[$key], $max) ?? '';

    switch ($type) {
        case 'phone':
            $value = Input::digits($value) ?? '';
            $v->rule($key, static fn() => $value === '' || (strlen($value) >= 10 && strlen($value) <= 13),
                'Informe DDD + número (ex.: 11 99999-9999).');
            // WhatsApp sempre com código do país
            if ($key === 'whatsapp' && $value !== '' && strlen($value) <= 11) {
                $value = '55' . $value;
            }
            break;
        case 'email':
            $v->email($key);
            break;
        case 'url':
            $v->rule($key, static fn() => $value === '' || (bool) preg_match('#^https://[^\s<>"]+$#i', $value),
                'Use um endereço completo começando com https://');
            break;
    }
    $values[$key] = $value;
}
$v->validate();

SettingsRepository::saveMany($values, (int) $user['id']);
ActivityLog::record('update', 'settings', null, ['fields' => array_keys($values)]);
Response::success('Configurações salvas. O site já usa as novas informações.', SettingsRepository::all());

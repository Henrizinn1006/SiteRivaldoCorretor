<?php
declare(strict_types=1);

namespace App\Repositories;

use App\Core\Database;

defined('APP_ROOT') || exit;

/**
 * Configurações do site (tabela chave/valor).
 * Só as chaves listadas em FIELDS podem ser lidas/gravadas pelo painel.
 */
final class SettingsRepository
{
    /** chave => [tipo, tamanho máximo, pública?] */
    public const FIELDS = [
        'company_name'     => ['text',  120, true],
        'tagline'          => ['text',  120, true],
        'about_short'      => ['text',  400, true],
        'phone'            => ['phone', 20,  true],
        'whatsapp'         => ['phone', 20,  true],
        'whatsapp_message' => ['text',  300, true],
        'email'            => ['email', 190, true],
        'address'          => ['text',  255, true],
        'creci'            => ['text',  40,  true],
        'instagram_url'    => ['url',   255, true],
        'facebook_url'     => ['url',   255, true],
        'youtube_url'      => ['url',   255, true],
        'tiktok_url'       => ['url',   255, true],
        'linkedin_url'     => ['url',   255, true],
        'logo_path'        => ['file',  255, true],
        'favicon_path'     => ['file',  255, true],
    ];

    public static function all(bool $onlyPublic = false): array
    {
        $rows = Database::fetchAll('SELECT setting_key, setting_value FROM site_settings');
        $values = array_fill_keys(array_keys(self::FIELDS), '');
        foreach ($rows as $r) {
            if (array_key_exists($r['setting_key'], $values)) {
                $values[$r['setting_key']] = (string) $r['setting_value'];
            }
        }
        if ($onlyPublic) {
            $values = array_filter($values, static fn($k) => self::FIELDS[$k][2], ARRAY_FILTER_USE_KEY);
        }
        return $values;
    }

    public static function get(string $key): string
    {
        return (string) Database::value('SELECT setting_value FROM site_settings WHERE setting_key = :k', ['k' => $key]);
    }

    public static function set(string $key, ?string $value, ?int $userId): void
    {
        if (!isset(self::FIELDS[$key])) {
            throw new \InvalidArgumentException('Configuração desconhecida: ' . $key);
        }
        Database::run(
            'INSERT INTO site_settings (setting_key, setting_value, updated_by) VALUES (:k, :v, :u)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)',
            ['k' => $key, 'v' => $value ?? '', 'u' => $userId]
        );
    }

    public static function saveMany(array $values, ?int $userId): void
    {
        Database::transaction(static function () use ($values, $userId): void {
            foreach ($values as $key => $value) {
                self::set($key, $value, $userId);
            }
        });
    }
}

<?php
declare(strict_types=1);

namespace App\Core;

defined('APP_ROOT') || exit;

/**
 * Registro de atividades (quem fez o quê, em qual registro, quando).
 * Falhas no log nunca interrompem a operação principal.
 */
final class ActivityLog
{
    public static function record(
        string $action,
        ?string $entity = null,
        ?int $entityId = null,
        ?array $details = null,
        ?int $userId = null
    ): void {
        try {
            $userId ??= isset($_SESSION['user_id']) ? (int) $_SESSION['user_id'] : null;
            Database::run(
                'INSERT INTO activity_logs (user_id, action, entity, entity_id, details, ip_address)
                 VALUES (:user_id, :action, :entity, :entity_id, :details, :ip)',
                [
                    'user_id'   => $userId,
                    'action'    => $action,
                    'entity'    => $entity,
                    'entity_id' => $entityId,
                    'details'   => $details ? json_encode($details, JSON_UNESCAPED_UNICODE) : null,
                    'ip'        => Request::ip(),
                ]
            );
        } catch (\Throwable $e) {
            error_log('[activity_log] ' . $e->getMessage());
        }
    }
}

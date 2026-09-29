<?php
/**
 * GET /api/dashboard/stats.php
 * Números do dashboard + imóveis cadastrados recentemente.
 */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{Auth, Database, Request, Response, Session};
use App\Repositories\PropertyRepository;

Request::requireMethod('GET');
Session::start();
Auth::requireUser();

$counts = Database::fetch(
    "SELECT
        COUNT(*)                                             AS total,
        COALESCE(SUM(status = 'disponivel'), 0)              AS available,
        COALESCE(SUM(status = 'vendido'), 0)                 AS sold,
        COALESCE(SUM(status = 'alugado'), 0)                 AS rented,
        COALESCE(SUM(status = 'rascunho'), 0)                AS drafts,
        COALESCE(SUM(featured = 1 AND status <> 'rascunho'), 0) AS featured,
        COALESCE(SUM(created_at >= (NOW() - INTERVAL 30 DAY)), 0) AS recent
     FROM properties
     WHERE deleted_at IS NULL"
);

Response::success('', [
    'counts' => array_map('intval', $counts ?? []),
    'recent' => PropertyRepository::recent(6),
]);

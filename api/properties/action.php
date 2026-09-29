<?php
/**
 * POST /api/properties/action.php — { id, action }
 * action: publish | unpublish | feature | unfeature |
 *         mark_available | mark_reserved | mark_sold | mark_rented | mark_unavailable
 */
declare(strict_types=1);

require dirname(__DIR__, 2) . '/app/bootstrap.php';

use App\Core\{Api, Input, Request, Response};
use App\Services\PropertyService;

$user = Api::write();
$data = Request::json();
$action = (string) Input::str($data['action'] ?? '');
$property = PropertyService::action(Api::id($data['id'] ?? null), $action, $user);

$messages = [
    'publish'          => 'Imóvel publicado.',
    'unpublish'        => 'Imóvel despublicado (voltou para rascunho).',
    'feature'          => 'Imóvel marcado como destaque.',
    'unfeature'        => 'Imóvel removido dos destaques.',
    'mark_available'   => 'Imóvel marcado como disponível.',
    'mark_reserved'    => 'Imóvel marcado como reservado.',
    'mark_sold'        => 'Imóvel marcado como vendido.',
    'mark_rented'      => 'Imóvel marcado como alugado.',
    'mark_unavailable' => 'Imóvel marcado como indisponível.',
];
Response::success($messages[$action] ?? 'Alterações salvas.', $property);

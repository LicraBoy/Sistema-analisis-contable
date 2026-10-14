/**
 * SemanticBadge — centralizes the status→color mapping that today gets
 * re-derived ad-hoc on every page (e.g. `color={estado === 'encontrado' ?
 * 'teal' : 'red'}`). Not yet wired into existing pages (Fase 1 scope is the
 * shell + Dashboard) — available for Fase 2 to adopt in Pagos/Conciliación/
 * Facturación/Catálogo de Productos without re-deriving the mapping there.
 */

import { Badge, type MantineSize } from '@mantine/core';

import { SEMANTIC_COLORS, type SemanticColorKey } from '../../theme/tokens';

export interface SemanticBadgeProps {
  status: SemanticColorKey;
  label: string;
  size?: MantineSize;
}

export function SemanticBadge({ status, label, size = 'sm' }: SemanticBadgeProps) {
  return (
    <Badge color={SEMANTIC_COLORS[status]} variant="light" size={size}>
      {label}
    </Badge>
  );
}

/**
 * Mapeo estado de Pago -> color/label, antes duplicado por separado en
 * PagosPage.tsx (`estadoBadgeConfig`) y ConciliacionPage.tsx
 * (`estadoConfig`) con los mismos 3 colores. Centralizado aquí para que
 * ambas páginas (y cualquier otra que liste `Pago.estado`) usen la misma
 * fuente de verdad.
 */

import { EstadoPago } from '../types';
import { SEMANTIC_COLORS } from './tokens';

export const ESTADO_PAGO_CONFIG: Record<EstadoPago, { color: string; label: string }> = {
  [EstadoPago.ENCONTRADO]: { color: SEMANTIC_COLORS.success, label: 'Encontrado' },
  [EstadoPago.NO_PAGADO]: { color: SEMANTIC_COLORS.error, label: 'No Pagado' },
  [EstadoPago.DUPLICADO]: { color: SEMANTIC_COLORS.warning, label: 'Duplicado' },
};

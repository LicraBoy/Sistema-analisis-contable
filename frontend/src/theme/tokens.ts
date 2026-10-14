/**
 * Design tokens — the single source of truth for the visual language shared
 * across the app (theme/index.ts, AppLayout, and shared components under
 * components/ui/). Values match the corporate ERP/SaaS-financiero brief
 * (sidebar azul marino, header gradiente violeta/azul, paleta semántica
 * exacta en hex). Pages keep using Mantine's own spacing props ("sm"/"md"/
 * "lg") — these constants exist for the handful of values that aren't
 * already a Mantine default.
 */

/**
 * Semantic color vocabulary already implicit across the app (Pagos,
 * Conciliación, Facturación, Catálogo de Productos all use this same
 * teal/red/orange/blue/grape/gray convention). The color *names* below map
 * to Mantine color keys whose underlying arrays are overridden in
 * theme/index.ts to land on the brief's exact hex values (teal→#14B8A6,
 * red→#EF4444, orange→#F59E0B, blue→#3B82F6) — so every existing call site
 * that already reads `SEMANTIC_COLORS.<key>` picks up the new palette with
 * zero changes elsewhere.
 */
export const SEMANTIC_COLORS = {
  success: 'teal', // pagado, conciliado, encontrado, dentro de objetivo
  error: 'red', // no pagado, error, crítico, acción destructiva
  warning: 'orange', // duplicado, requiere revisión, inconsistencia
  info: 'blue', // PUE, carga de archivos, informativo
  secondary: 'grape', // PPD, categorías especiales
  neutral: 'gray', // conteos secundarios, auxiliar
  brand: 'violet', // acciones primarias, navegación activa
} as const;

export type SemanticColorKey = keyof typeof SEMANTIC_COLORS;

/** Exact hex behind each semantic name — for places that need a raw CSS color string (SVG/recharts fills, inline styles) instead of a Mantine `color` prop. */
export const SEMANTIC_HEX: Record<SemanticColorKey, string> = {
  success: '#14B8A6',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
  secondary: '#8B5CF6',
  neutral: '#64748B',
  brand: '#4F46E5',
};

/** KPI left-accent colors — one per Dashboard stat family, per brief §6. */
export const KPI_ACCENTS = {
  facturas: '#4F46E5',
  pagos: '#14B8A6',
  pendientes: '#F59E0B',
  errores: '#EF4444',
  conciliacion: '#8B5CF6',
  costeo: '#64748B',
} as const;

/** Brand gradient for buttons/icons/small accents (2-stop, usable with Mantine's `gradient` prop). */
export const BRAND_GRADIENT = { from: 'violet.5', to: 'violet.7', deg: 135 } as const;

/** Header background — 3-stop gradient, raw CSS since Mantine's `gradient` prop only supports 2 stops. */
export const HEADER_GRADIENT = 'linear-gradient(90deg, #4F46E5 0%, #6366F1 55%, #7C3AED 100%)';

/** Sidebar — a fixed dark-navy surface, independent of the light/dark content toggle (like Stripe/Linear's persistent dark rail). Two very-close tones so it still nods to the app's active color scheme. */
export const SIDEBAR_BG = { light: '#0B1739', dark: '#081225' } as const;
export const SIDEBAR_GRADIENT = 'linear-gradient(180deg, #0F1F4A 0%, #09152F 100%)';
export const SIDEBAR_ACTIVE_GRADIENT = 'linear-gradient(90deg, #5B5BD6 0%, #7C4DFF 100%)';

/** Main content background (outside cards) — never pure white/black. */
export const CONTENT_BG = { light: '#F6F8FC', dark: '#0B1120' } as const;

export const RADIUS_SCALE = { xs: 6, sm: 8, md: 10, lg: 14, xl: 20 } as const;

/** Mantine's spacing tokens already follow a 4px/8px scale (xs=10px, sm=12px, md=16px, lg=20px, xl=32px) — documented here, not reinvented. */
export const SPACING_SCALE = { xs: 'xs', sm: 'sm', md: 'md', lg: 'lg', xl: 'xl' } as const;

export const SHADOW_LEVELS = { flat: 'none', low: 'xs', medium: 'sm', high: 'md' } as const;

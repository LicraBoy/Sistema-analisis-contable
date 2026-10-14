import {
  Badge,
  Button,
  Card,
  Modal,
  NumberInput,
  PasswordInput,
  Select,
  Table,
  Tabs,
  TextInput,
  createTheme,
  type CSSVariablesResolver,
  type MantineColorsTuple,
} from '@mantine/core';

import { DARK_PALETTE } from './darkPalette';
import { CONTENT_BG } from './tokens';

/**
 * Brand violet/indigo — index 6 (#4F46E5) is the primary interactive shade
 * (buttons, active states); index 5 (#6366F1) is used for lighter accents
 * (dark-mode buttons, gradient starts). #7C3AED (the brief's 3rd brand hue)
 * isn't a shade of this array — it's only used as the 3rd stop of the raw
 * header/sidebar gradients in tokens.ts, since Mantine shade arrays are
 * monochromatic ramps and a 2-hue array would break every other component
 * that reads e.g. violet.2 for a light tint.
 */
const violet: MantineColorsTuple = [
  '#EEF0FF',
  '#DEE1FE',
  '#C3C6FD',
  '#A5A8FC',
  '#8A8DF9',
  '#6366F1',
  '#4F46E5',
  '#4338CA',
  '#362FA0',
  '#241F6B',
];

/** Éxito — pagado/conciliado/encontrado. Index 6 = #14B8A6 (brief exact value). */
const teal: MantineColorsTuple = [
  '#E6FBF8',
  '#C7F5EE',
  '#9FEEE0',
  '#70E3CE',
  '#3ED0B8',
  '#22C3AC',
  '#14B8A6',
  '#0F9384',
  '#0B6F63',
  '#073F38',
];

/** Error — no pagado/crítico. Index 6 = #EF4444. */
const red: MantineColorsTuple = [
  '#FEECEC',
  '#FDD3D3',
  '#FBADAD',
  '#F98787',
  '#F66161',
  '#F35252',
  '#EF4444',
  '#D93636',
  '#B32B2B',
  '#7A1D1D',
];

/** Advertencia — duplicados/revisión. Index 6 = #F59E0B. */
const orange: MantineColorsTuple = [
  '#FFF6E5',
  '#FFE8B8',
  '#FFD684',
  '#FFC454',
  '#FDB02E',
  '#F9A616',
  '#F59E0B',
  '#DB8A05',
  '#B06E04',
  '#7A4B03',
];

/** Información — PUE/carga de archivos. Index 6 = #3B82F6. */
const blue: MantineColorsTuple = [
  '#EAF2FE',
  '#CFE2FD',
  '#A8CBFB',
  '#7FB2F9',
  '#5B9BF8',
  '#4A8DF7',
  '#3B82F6',
  '#2E68D6',
  '#2251AD',
  '#163570',
];

const FONT_FAMILY = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

export const theme = createTheme({
  primaryColor: 'violet',
  primaryShade: { light: 6, dark: 5 },
  fontFamily: FONT_FAMILY,
  headings: {
    fontFamily: FONT_FAMILY,
    sizes: {
      h1: { fontSize: '32px', fontWeight: '700', lineHeight: '1.25' },
      h2: { fontSize: '24px', fontWeight: '700', lineHeight: '1.3' },
      h3: { fontSize: '20px', fontWeight: '600', lineHeight: '1.35' },
      h4: { fontSize: '18px', fontWeight: '600', lineHeight: '1.4' },
    },
  },
  // xs=6 (badges), sm=8 (inputs/buttons/tabs), lg=14 (cards/modals) — per brief §20.
  radius: { xs: '6px', sm: '8px', md: '10px', lg: '14px', xl: '20px' },
  defaultRadius: 'sm',
  colors: {
    violet,
    teal,
    red,
    orange,
    blue,
    dark: DARK_PALETTE,
  },
  components: {
    // Centralizes shadow/radius/border so pages no longer need to repeat
    // them on every Card instance. Shadow kept subtle (xs ≈ the brief's
    // "0 1px 2px rgba(0,0,0,.04)") — explicit props on existing Cards still
    // win, so nothing already in the app breaks.
    Card: Card.extend({
      defaultProps: { shadow: 'xs', radius: 'lg', withBorder: true, padding: 'lg' },
    }),
    Modal: Modal.extend({
      defaultProps: { radius: 'lg' },
    }),
    Table: Table.extend({
      defaultProps: { verticalSpacing: 'sm', horizontalSpacing: 'md' },
    }),
    Tabs: Tabs.extend({
      defaultProps: { radius: 'sm' },
    }),
    Badge: Badge.extend({
      defaultProps: { radius: 'sm' },
    }),
    Button: Button.extend({
      defaultProps: { radius: 'sm' },
    }),
    TextInput: TextInput.extend({ defaultProps: { radius: 'sm' } }),
    NumberInput: NumberInput.extend({ defaultProps: { radius: 'sm' } }),
    PasswordInput: PasswordInput.extend({ defaultProps: { radius: 'sm' } }),
    Select: Select.extend({ defaultProps: { radius: 'sm' } }),
  },
});

/**
 * Pins the exact page-body and default-border hex from the brief regardless
 * of which shade a given component happens to read from theme.colors.dark —
 * more precise than relying solely on the dark[] array above.
 */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    '--mantine-color-body': CONTENT_BG.light,
    '--mantine-color-default-border': '#E7ECF5',
  },
  dark: {
    '--mantine-color-body': CONTENT_BG.dark,
    '--mantine-color-default-border': '#1F2937',
  },
});

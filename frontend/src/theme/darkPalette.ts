import type { MantineColorsTuple } from '@mantine/core';

/**
 * Custom dark-mode surface palette (replaces Mantine's default gray "dark"
 * array). Mantine resolves most dark-mode surfaces — Card background,
 * borders, input backgrounds — from `theme.colors.dark`, so overriding this
 * one array covers most of it; the exact page-body/border hex from the
 * brief are additionally pinned via the `cssVariablesResolver` in
 * theme/index.ts so they don't depend on which array index a given
 * component happens to read.
 *
 * Values match the brief exactly: card #111827 (index 6, Mantine's default
 * Card surface), page body #0B1120 (index 7, `--mantine-color-body`),
 * borders #1F2937 (index 4), primary text #F8FAFC (index 0), secondary/
 * dimmed text #94A3B8 (index 2) — inspired by Linear/GitHub/Vercel dark.
 */
export const DARK_PALETTE: MantineColorsTuple = [
  '#F8FAFC', // 0 - primary text on dark
  '#CBD5E1', // 1
  '#94A3B8', // 2 - dimmed/secondary text
  '#64748B', // 3
  '#1F2937', // 4 - borders / dividers
  '#17202E', // 5 - hover surfaces
  '#111827', // 6 - card / panel background
  '#0B1120', // 7 - page body background
  '#080D16', // 8
  '#05080D', // 9 - deepest background
];

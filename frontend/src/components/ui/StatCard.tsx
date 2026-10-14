/**
 * StatCard — reusable KPI tile. Extracted from DashboardPage's local
 * component so future pages (Facturación, Pagos de Recepción, Catálogo de
 * Productos analytics panels, etc.) can reuse the same look instead of each
 * redefining its own. Left accent bar + optional trend indicator per the
 * corporate-dashboard brief (§6).
 */

import { Card, Group, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconArrowDownRight, IconArrowUpRight } from '@tabler/icons-react';

import { SEMANTIC_COLORS, type SemanticColorKey } from '../../theme/tokens';

export interface StatCardTrend {
  /** Signed or unsigned percentage — the sign of the *value* decides the arrow/color, not this prop. */
  value: number;
  /** Label shown after the percentage, e.g. "vs. mes anterior". */
  label?: string;
}

export interface StatCardProps {
  title: string;
  value: number;
  icon: React.ElementType;
  /** One of the semantic status keys (success/error/warning/info/secondary/neutral/brand) — see theme/tokens.ts. */
  color: SemanticColorKey;
  description: string;
  /** Optional left-border accent color (raw CSS color). Defaults to the semantic color's hex. */
  accentColor?: string;
  /** Optional variation indicator (e.g. { value: 12 } → "+12% vs. mes anterior" in teal, { value: -4 } in red). */
  trend?: StatCardTrend;
  /** Formats the value differently than the default es-MX thousands separator (e.g. currency, percentage). */
  formatValue?: (value: number) => string;
}

export function StatCard({
  title,
  value,
  icon: Icon,
  color,
  description,
  accentColor,
  trend,
  formatValue,
}: StatCardProps) {
  const mantineColor = SEMANTIC_COLORS[color];
  const trendPositive = trend ? trend.value >= 0 : null;

  return (
    <Card
      style={{
        borderLeft: `3px solid ${accentColor ?? `var(--mantine-color-${mantineColor}-6)`}`,
      }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={4}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            {title}
          </Text>
          <Text style={{ fontSize: 28 }} fw={700} lh={1.2}>
            {formatValue ? formatValue(value) : value.toLocaleString('es-MX')}
          </Text>
          {trend && (
            <Group gap={4} wrap="nowrap">
              {trendPositive ? (
                <IconArrowUpRight size={14} color={`var(--mantine-color-${SEMANTIC_COLORS.success}-6)`} />
              ) : (
                <IconArrowDownRight size={14} color={`var(--mantine-color-${SEMANTIC_COLORS.error}-6)`} />
              )}
              <Text size="xs" fw={600} c={trendPositive ? SEMANTIC_COLORS.success : SEMANTIC_COLORS.error}>
                {trendPositive ? '+' : ''}
                {trend.value}%
              </Text>
              {trend.label && (
                <Text size="xs" c="dimmed">
                  {trend.label}
                </Text>
              )}
            </Group>
          )}
          <Text size="xs" c="dimmed">
            {description}
          </Text>
        </Stack>
        <ThemeIcon size={48} radius="md" variant="light" color={mantineColor}>
          <Icon size={24} stroke={1.5} />
        </ThemeIcon>
      </Group>
    </Card>
  );
}

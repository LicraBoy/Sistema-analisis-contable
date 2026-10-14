/**
 * DashboardPage — Summary metrics overview. All data below is placeholder
 * (see comment on `stats`/mock arrays) — will be replaced with real API
 * calls; only the visual structure/hierarchy is final.
 */

import {
  Badge,
  Card,
  Grid,
  Group,
  RingProgress,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import {
  IconAlertTriangle,
  IconChecklist,
  IconChefHat,
  IconClock,
  IconCoin,
  IconDotsVertical,
  IconFileInvoice,
} from '@tabler/icons-react';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';

import { StatCard } from '../components/ui/StatCard';
import { KPI_ACCENTS, SEMANTIC_COLORS } from '../theme/tokens';

// Placeholder data — will be replaced with API calls
const stats = {
  facturas_cfdi: { value: 1248, trend: 4.2 },
  pagos_recibidos: { value: 3_487_210, trend: 8.1 },
  pendientes_pago: { value: 186, trend: -2.5 },
  conciliacion_pct: { value: 92, trend: 1.3 },
  recetas_costeo: { value: 48, trend: 0 },
};

const ingresosVsPagos = [
  { mes: 'Abr', ingresos: 612_000, pagos: 548_000 },
  { mes: 'May', ingresos: 701_500, pagos: 664_200 },
  { mes: 'Jun', ingresos: 658_900, pagos: 601_400 },
  { mes: 'Jul', ingresos: 742_300, pagos: 715_100 },
  { mes: 'Ago', ingresos: 789_600, pagos: 733_900 },
  { mes: 'Sep', ingresos: 823_400, pagos: 780_200 },
];

const formaPago = [
  { label: 'Encontrados', value: 982, color: SEMANTIC_COLORS.success },
  { label: 'No pagados', value: 143, color: SEMANTIC_COLORS.error },
  { label: 'Pendientes', value: 122, color: SEMANTIC_COLORS.warning },
];
const formaPagoTotal = formaPago.reduce((sum, item) => sum + item.value, 0);

const alertas = [
  { label: 'Facturas sin pago', count: 143, color: SEMANTIC_COLORS.error, icon: IconAlertTriangle },
  { label: 'Duplicados detectados', count: 12, color: SEMANTIC_COLORS.warning, icon: IconAlertTriangle },
  { label: 'Registros que requieren revisión', count: 27, color: SEMANTIC_COLORS.warning, icon: IconAlertTriangle },
  { label: 'Procesos completados hoy', count: 8, color: SEMANTIC_COLORS.success, icon: IconChecklist },
];

const ultimosMovimientos = [
  { fecha: '12/09/2026', folio: 'A-4471', proveedor: 'Distribuidora del Golfo', tipo: 'Ingreso', monto: 24_580, estado: 'encontrado' },
  { fecha: '12/09/2026', folio: '8F2C…91AB', proveedor: 'Mariscos La Ola', tipo: 'Pago', monto: 8_120, estado: 'no_pagado' },
  { fecha: '11/09/2026', folio: 'B-1029', proveedor: 'Suministros Hoteleros SA', tipo: 'Ingreso', monto: 61_340, estado: 'duplicado' },
  { fecha: '11/09/2026', folio: 'A-4468', proveedor: 'Café y Cía', tipo: 'Ingreso', monto: 3_275, estado: 'encontrado' },
  { fecha: '10/09/2026', folio: '11D7…4CE0', proveedor: 'Lácteos del Puerto', tipo: 'Pago', monto: 15_900, estado: 'encontrado' },
];

const currency = (v: number) => `$${v.toLocaleString('es-MX')}`;
const estadoLabel: Record<string, { label: string; color: string }> = {
  encontrado: { label: 'Encontrado', color: SEMANTIC_COLORS.success },
  no_pagado: { label: 'No pagado', color: SEMANTIC_COLORS.error },
  duplicado: { label: 'Duplicado', color: SEMANTIC_COLORS.warning },
};

export default function DashboardPage() {
  const [rango, setRango] = useState<[Date | null, Date | null]>([null, null]);

  return (
    <Stack gap="lg">
      {/* ── Encabezado ──────────────────────────────── */}
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <div>
          <Title order={2}>Dashboard</Title>
          <Text c="dimmed" size="sm">
            Resumen general del sistema contable
          </Text>
        </div>
        <DatePickerInput
          type="range"
          placeholder="Seleccionar periodo"
          value={rango}
          onChange={(value) => setRango(value as [Date | null, Date | null])}
          valueFormat="DD/MM/YYYY"
          clearable
          w={260}
        />
      </Group>

      {/* ── KPIs ────────────────────────────────────── */}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }}>
        <StatCard
          title="Facturas CFDI"
          value={stats.facturas_cfdi.value}
          icon={IconFileInvoice}
          color="brand"
          accentColor={KPI_ACCENTS.facturas}
          description="Comprobantes procesados"
          trend={{ value: stats.facturas_cfdi.trend, label: 'vs. mes anterior' }}
        />
        <StatCard
          title="Pagos recibidos"
          value={stats.pagos_recibidos.value}
          icon={IconCoin}
          color="success"
          accentColor={KPI_ACCENTS.pagos}
          description="Monto total conciliado"
          formatValue={currency}
          trend={{ value: stats.pagos_recibidos.trend, label: 'vs. mes anterior' }}
        />
        <StatCard
          title="Pendientes de pago"
          value={stats.pendientes_pago.value}
          icon={IconClock}
          color="warning"
          accentColor={KPI_ACCENTS.pendientes}
          description="Requieren seguimiento"
          trend={{ value: stats.pendientes_pago.trend, label: 'vs. mes anterior' }}
        />
        <StatCard
          title="Conciliación"
          value={stats.conciliacion_pct.value}
          icon={IconChecklist}
          color="secondary"
          accentColor={KPI_ACCENTS.conciliacion}
          description="Ingresos conciliados"
          formatValue={(v) => `${v}%`}
          trend={{ value: stats.conciliacion_pct.trend, label: 'vs. mes anterior' }}
        />
        <StatCard
          title="Recetas / Costeo"
          value={stats.recetas_costeo.value}
          icon={IconChefHat}
          color="neutral"
          accentColor={KPI_ACCENTS.costeo}
          description="Productos costeados"
          trend={{ value: stats.recetas_costeo.trend, label: 'vs. mes anterior' }}
        />
      </SimpleGrid>

      {/* ── Gráficas ────────────────────────────────── */}
      <Grid>
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Card h="100%">
            <Title order={4} mb="md">
              Ingresos vs. Pagos
            </Title>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={ingresosVsPagos}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--mantine-color-default-border)" />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} stroke="var(--mantine-color-dimmed)" />
                <YAxis tick={{ fontSize: 12 }} stroke="var(--mantine-color-dimmed)" tickFormatter={(v) => `${v / 1000}k`} />
                <RechartsTooltip formatter={(v) => currency(Number(v))} />
                <Legend />
                <Bar dataKey="ingresos" name="Ingresos" fill={`var(--mantine-color-${SEMANTIC_COLORS.brand}-6)`} radius={[4, 4, 0, 0]} />
                <Bar dataKey="pagos" name="Pagos" fill={`var(--mantine-color-${SEMANTIC_COLORS.success}-6)`} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Card h="100%">
            <Title order={4} mb="md">
              Forma de pago
            </Title>
            <Group justify="center">
              <RingProgress
                size={170}
                thickness={16}
                roundCaps
                label={
                  <Text ta="center" fw={700} size="lg">
                    {Math.round((formaPago[0].value / formaPagoTotal) * 100)}%
                  </Text>
                }
                sections={formaPago.map((item) => ({
                  value: (item.value / formaPagoTotal) * 100,
                  color: item.color,
                  tooltip: `${item.label}: ${item.value}`,
                }))}
              />
            </Group>
            <Stack gap={6} mt="md">
              {formaPago.map((item) => (
                <Group key={item.label} justify="space-between">
                  <Group gap={6}>
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 3,
                        backgroundColor: `var(--mantine-color-${item.color}-6)`,
                      }}
                    />
                    <Text size="xs" c="dimmed">
                      {item.label}
                    </Text>
                  </Group>
                  <Text size="xs" fw={600}>
                    {item.value}
                  </Text>
                </Group>
              ))}
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>

      {/* ── Alertas y pendientes / Últimos movimientos ─ */}
      <Grid>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Card h="100%">
            <Title order={4} mb="md">
              Alertas y pendientes
            </Title>
            <Stack gap="sm">
              {alertas.map((a) => (
                <Group key={a.label} justify="space-between" wrap="nowrap">
                  <Group gap="sm" wrap="nowrap">
                    <ThemeIcon size={32} radius="md" variant="light" color={a.color}>
                      <a.icon size={16} />
                    </ThemeIcon>
                    <Text size="sm">{a.label}</Text>
                  </Group>
                  <Badge color={a.color} variant="light">
                    {a.count}
                  </Badge>
                </Group>
              ))}
            </Stack>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Card h="100%" padding={0} style={{ overflow: 'hidden' }}>
            <Title order={4} p="lg" pb="sm">
              Últimos movimientos
            </Title>
            <Table.ScrollContainer minWidth={640}>
              <Table highlightOnHover verticalSpacing="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Fecha</Table.Th>
                    <Table.Th>Folio / UUID</Table.Th>
                    <Table.Th>Proveedor</Table.Th>
                    <Table.Th>Tipo</Table.Th>
                    <Table.Th ta="right">Monto</Table.Th>
                    <Table.Th>Estado</Table.Th>
                    <Table.Th w={40}></Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {ultimosMovimientos.map((mov) => {
                    const estado = estadoLabel[mov.estado];
                    return (
                      <Table.Tr key={`${mov.fecha}-${mov.folio}`}>
                        <Table.Td>
                          <Text size="xs" c="dimmed">
                            {mov.fecha}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" ff="monospace">
                            {mov.folio}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" truncate maw={180}>
                            {mov.proveedor}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" c="dimmed">
                            {mov.tipo}
                          </Text>
                        </Table.Td>
                        <Table.Td ta="right">
                          <Text size="sm" fw={500}>
                            {currency(mov.monto)}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge color={estado.color} variant="light" size="sm">
                            {estado.label}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <ThemeIcon variant="subtle" color="gray" size="sm">
                            <IconDotsVertical size={14} />
                          </ThemeIcon>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

/**
 * PanelResumenFiesta (pestaña "Resumen") — dos vistas sobre el mismo corte "Al día":
 *  · Resumen: la hoja Resumen del Excel tal cual, para el ingeniero (`ResumenIngeniero`).
 *  · Resumen detallado: boletos por tipo, ocupación, estado de pago, preventa contra normal, dinero y desglose
 *    fiscal, y el comparativo contra el año pasado (cierre, mismo día y gráfica por día).
 */

import { ActionIcon, Alert, Badge, Button, Group, Loader, NumberInput, Paper, Progress, SegmentedControl, SimpleGrid, Stack, Table, Text, Title, Tooltip as TooltipMantine } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconCalendarEvent, IconCheck, IconPencil, IconX } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useMemo, useState } from 'react';
import { CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import {
  mensajeErrorFiesta,
  useFiestaCobros,
  useFiestaGuardarCierreHistorico,
  useFiestaHistorico,
  useFiestaResumen,
  useFiestaSembrarHistorico,
  type FiestaHistoricoFila,
  type FiestaResumen,
  type FiestaVariacion,
} from '../../api/fiestaHooks';
import ResumenIngeniero from './ResumenIngeniero';
import { dateAIso, dinero, entero, ESTADO_SILLA_CONFIG, fechaCorta, filaDelAnioPasado, hoyISO, isoADate, porcentaje } from './fiestaUtils';

export default function PanelResumenFiesta() {
  const [fechaCorte, setFechaCorte] = useState(hoyISO());
  const [vista, setVista] = useState<'resumen' | 'detallado'>('resumen');
  const { data, isLoading, isError, error } = useFiestaResumen(fechaCorte || undefined);

  if (isLoading) return <Loader />;
  if (isError || !data) return <Alert color="red">{mensajeErrorFiesta(error)}</Alert>;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <div>
          <Title order={4}>Resumen</Title>
          <Text size="sm" c="dimmed">
            {vista === 'resumen' ? 'Comparativo contra el año pasado.' : 'Todo el detalle del evento y del comparativo.'}
          </Text>
        </div>
        <Group align="flex-end" gap="md">
          <SegmentedControl
            value={vista}
            onChange={(v) => setVista(v as 'resumen' | 'detallado')}
            data={[
              { value: 'resumen', label: 'Resumen' },
              { value: 'detallado', label: 'Resumen detallado' },
            ]}
          />
          <DateInput
            label="Al día"
            placeholder="Elige una fecha"
            leftSection={<IconCalendarEvent size={16} />}
            value={isoADate(fechaCorte)}
            onChange={(d) => d && setFechaCorte(dateAIso(d))}
            valueFormat="DD/MM/YYYY"
            firstDayOfWeek={1}
            highlightToday
            clearable={false}
            w={190}
            rightSectionPointerEvents="auto"
            rightSection={
              fechaCorte !== hoyISO() ? (
                <TooltipMantine label="Ir a hoy">
                  <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Ir a hoy" onClick={() => setFechaCorte(hoyISO())}>
                    <IconX size={14} />
                  </ActionIcon>
                </TooltipMantine>
              ) : undefined
            }
          />
        </Group>
      </Group>

      {vista === 'resumen' ? <ResumenIngeniero data={data} fechaCorte={fechaCorte} /> : <ResumenDetallado data={data} fechaCorte={fechaCorte} />}
    </Stack>
  );
}

function ResumenDetallado({ data, fechaCorte }: { data: FiestaResumen; fechaCorte: string }) {
  const { reservas, estado, ocupacion, dinero: money, preventa, normal, fiscal, conciliacion, comparativo, cortesias_tarifa } = data;
  const cap = data.capacidad_total || 1;
  const pctCap = (n: number) => (n / cap) * 100;
  const totalBoletos = estado.pagadas + estado.anticipos + estado.sin_anticipo_con_cortesias;

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 2, md: 4 }}>
        <Kpi etiqueta="Boletos reservados" valor={entero(reservas.total)} detalle={`${data.reservaciones} reservaciones`} />
        <Kpi etiqueta="Adultos" valor={entero(reservas.adultos)} />
        <Kpi etiqueta="Niños" valor={entero(reservas.ninos)} />
        <Kpi etiqueta="Cortesías" valor={entero(reservas.cortesias)} />
      </SimpleGrid>

      <Paper withBorder p="md">
        <Group justify="space-between" mb="xs">
          <Text fw={600}>Ocupación</Text>
          <Text size="sm">
            {entero(ocupacion.ocupadas)} de {entero(data.capacidad_total)} sillas · {porcentaje(ocupacion.pct)} ·{' '}
            <b>{entero(ocupacion.disponibles)} disponibles</b>
          </Text>
        </Group>
        <Progress.Root size="xl" radius="xl">
          <Progress.Section value={pctCap(ocupacion.adultos)} color="violet" />
          <Progress.Section value={pctCap(ocupacion.ninos)} color="cyan" />
          <Progress.Section value={pctCap(ocupacion.cortesias)} color="grape" />
        </Progress.Root>
        <Group gap="lg" mt="xs">
          <LeyendaOcupacion color="violet" etiqueta="Adultos" valor={ocupacion.adultos} />
          <LeyendaOcupacion color="cyan" etiqueta="Niños" valor={ocupacion.ninos} />
          <LeyendaOcupacion color="grape" etiqueta="Cortesías" valor={ocupacion.cortesias} />
        </Group>
      </Paper>

      <Paper withBorder p="md">
        <Text fw={600} mb="xs">
          Estado de pago de los boletos
        </Text>
        <Progress.Root size="xl" radius="xl" mb="sm">
          <Progress.Section value={estado.pct_pagadas ?? 0} color={ESTADO_SILLA_CONFIG.pagada.mantine} />
          <Progress.Section value={estado.pct_anticipos ?? 0} color={ESTADO_SILLA_CONFIG.anticipo.mantine} />
          <Progress.Section value={estado.pct_sin_anticipo ?? 0} color={ESTADO_SILLA_CONFIG.sin_pago.mantine} />
        </Progress.Root>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <EstadoPago color="green" etiqueta="Pagados" cantidad={estado.pagadas} pct={estado.pct_pagadas} />
          <EstadoPago color="blue" etiqueta="Con anticipo" cantidad={estado.anticipos} pct={estado.pct_anticipos} />
          <EstadoPago color="orange" etiqueta="Sin anticipo (incluye cortesías)" cantidad={estado.sin_anticipo_con_cortesias} pct={estado.pct_sin_anticipo} />
        </SimpleGrid>
        {totalBoletos === 0 && (
          <Text size="sm" c="dimmed" mt="xs">
            Aún no hay boletos reservados.
          </Text>
        )}
      </Paper>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Paper withBorder p="md">
          <Text fw={600} mb="xs">
            Preventa vs normal
          </Text>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th />
                <Table.Th ta="right">Cantidad</Table.Th>
                <Table.Th ta="right">Importe</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <FilaTarifa etiqueta="Preventa · adultos" d={preventa.adultos} />
              <FilaTarifa etiqueta="Preventa · niños" d={preventa.ninos} />
              <FilaTarifa etiqueta="Normal · adultos" d={normal.adultos} />
              <FilaTarifa etiqueta="Normal · niños" d={normal.ninos} />
              <FilaTarifa etiqueta="Cortesías (sin costo)" d={cortesias_tarifa} />
              <Table.Tr>
                <Table.Td fw={700}>Total de boletos</Table.Td>
                <Table.Td ta="right" fw={700}>
                  {entero(preventa.adultos.cantidad + preventa.ninos.cantidad + normal.adultos.cantidad + normal.ninos.cantidad + cortesias_tarifa.cantidad)}
                </Table.Td>
                <Table.Td ta="right" fw={700}>
                  {dinero(preventa.adultos.importe + preventa.ninos.importe + normal.adultos.importe + normal.ninos.importe + cortesias_tarifa.importe)}
                </Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Paper>

        <Paper withBorder p="md">
          <Text fw={600} mb="xs">
            Dinero
          </Text>
          <Table>
            <Table.Tbody>
              <FilaDinero etiqueta="Importe de las reservaciones" valor={money.importe_total} />
              <FilaDinero etiqueta="Pagado" valor={money.pagado} color="green" />
              <FilaDinero etiqueta="Saldo pendiente" valor={money.saldo_pendiente} color={money.saldo_pendiente > 0 ? 'red' : undefined} />
              {money.excedente > 0 && <FilaDinero etiqueta="Pagado de más" valor={money.excedente} color="orange" />}
            </Table.Tbody>
          </Table>
          <Text fw={600} mt="md" mb={4} size="sm">
            Desglose de lo cobrado
          </Text>
          <Table>
            <Table.Tbody>
              <FilaDinero etiqueta="Subtotal" valor={fiscal.subtotal} />
              <FilaDinero etiqueta="IVA" valor={fiscal.iva} />
              <FilaDinero etiqueta="Propina" valor={fiscal.propina} />
              <FilaDinero etiqueta="Total" valor={fiscal.total} negrita />
            </Table.Tbody>
          </Table>
          {conciliacion.diferencia !== null && (
            <Alert color={Math.abs(conciliacion.diferencia) < 0.01 ? 'green' : 'yellow'} mt="sm" p="xs">
              Contra contabilidad: {dinero(conciliacion.total_contabilidad)} — diferencia {dinero(conciliacion.diferencia)}
            </Alert>
          )}
        </Paper>
      </SimpleGrid>

      <ComparativoAnioPasado
        actual={{
          reservados: reservas.total,
          pagados: estado.pagadas,
          cortesias: reservas.cortesias,
          adultos: reservas.adultos,
          ninos: reservas.ninos,
        }}
        anio={data.anio_comparativo}
        fechaCorte={fechaCorte}
        comparativo={comparativo}
        fechaReferencia={comparativo?.fecha_referencia}
      />
    </Stack>
  );
}

/** Comparativo contra la edición del año pasado: tabla al día de corte + sillas reservadas por día. */
function ComparativoAnioPasado({
  actual,
  anio,
  fechaCorte,
  comparativo,
  fechaReferencia,
}: {
  actual: TotalesAvance;
  anio: number;
  fechaCorte: string;
  comparativo: {
    reservados: FiestaVariacion;
    pagadas: FiestaVariacion;
    anticipos: FiestaVariacion;
    sin_anticipo: FiestaVariacion;
    cortesias: FiestaVariacion;
  } | null;
  fechaReferencia?: string;
}) {
  const { data: hist } = useFiestaHistorico(anio);
  const { data: cobros } = useFiestaCobros();
  const sembrar = useFiestaSembrarHistorico();
  const filasHist = hist?.filas ?? [];

  // Una línea por día del evento: sillas reservadas este año (hasta hoy) y las del mismo día del año pasado.
  const serie = useMemo(() => {
    if (!cobros || filasHist.length === 0) return [];
    const hoy = hoyISO();
    return cobros.dias.map((d) => {
      const [, mes, dia] = d.fecha.split('-');
      return {
        dia: `${dia}/${mes}`,
        actual: d.fecha <= hoy ? d.reservas.reservados : null,
        anterior: filaDelAnioPasado(filasHist, d.fecha, anio)?.fila.reservados ?? null,
      };
    });
  }, [cobros, filasHist, anio]);

  const cargar = async () => {
    try {
      const r = await sembrar.mutateAsync(anio);
      notifications.show({ color: 'green', message: `Histórico ${r.anio}: ${r.cargadas} días cargados.` });
    } catch (e) {
      notifications.show({ color: 'red', title: 'No se pudo cargar', message: mensajeErrorFiesta(e) });
    }
  };

  if (filasHist.length === 0) {
    return (
      <Paper withBorder p="md">
        <Group justify="space-between" wrap="wrap">
          <div>
            <Text fw={600}>Comparativo contra {anio}</Text>
            <Text size="sm" c="dimmed">
              Todavía no hay datos de {anio}. {hist?.disponible_para_cargar ? 'Se pueden cargar del Excel (hoja Cobros, RESERVAS 2025).' : ''}
            </Text>
          </div>
          {hist?.disponible_para_cargar && (
            <Button onClick={cargar} loading={sembrar.isPending}>
              Cargar datos de {anio}
            </Button>
          )}
        </Group>
      </Paper>
    );
  }

  const primera = filasHist[0].fecha;
  const cierre = filasHist[filasHist.length - 1];
  return (
    <Stack gap="md">
      <ContraElCierre actual={actual} anio={anio} cierre={cierre} />

      <Paper withBorder p="md">
        <Group justify="space-between" mb="xs" wrap="wrap">
          <Text fw={600}>Mismo día de {anio}</Text>
          {comparativo && fechaReferencia && (
            <Badge variant="light" color="gray">
              mismo día del año pasado: {fechaCorta(fechaReferencia)}
            </Badge>
          )}
        </Group>
        {comparativo ? (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th />
                <Table.Th ta="right">Este año</Table.Th>
                <Table.Th ta="right">{anio}</Table.Th>
                <Table.Th ta="right">Variación</Table.Th>
                <Table.Th ta="right">%</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <FilaComparativo etiqueta="Reservados" v={comparativo.reservados} />
              <FilaComparativo etiqueta="Pagados" v={comparativo.pagadas} />
              <FilaComparativo etiqueta="Con anticipo" v={comparativo.anticipos} />
              <FilaComparativo etiqueta="Sin anticipo" v={comparativo.sin_anticipo} />
              <FilaComparativo etiqueta="Cortesías" v={comparativo.cortesias} />
            </Table.Tbody>
          </Table>
        ) : (
          <Alert color="gray" p="xs">
            La captura de {anio} empieza el {fechaCorta(primera)}: antes de esa fecha no hay con qué comparar el día {fechaCorta(fechaCorte)}.
          </Alert>
        )}
      </Paper>

      {serie.length > 0 && (
        <Paper withBorder p="md">
          <Text fw={600} mb="xs">
            Sillas reservadas por día
          </Text>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <ComposedChart data={serie} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="dia" interval="preserveStartEnd" minTickGap={28} tickLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={40} />
                <Tooltip />
                <Legend />
                <Line dataKey="anterior" name={`${anio}`} stroke="#adb5bd" strokeWidth={2} dot={false} connectNulls />
                <Line dataKey="actual" name="Este año" stroke="#7048e8" strokeWidth={3} dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <Text size="xs" c="dimmed">
            El año pasado se capturó a partir del {fechaCorta(primera)}; los días intermedios toman el último dato anterior.
          </Text>
        </Paper>
      )}
    </Stack>
  );
}

function LeyendaOcupacion({ color, etiqueta, valor }: { color: string; etiqueta: string; valor: number }) {
  return (
    <Group gap={6} wrap="nowrap">
      <span style={{ width: 10, height: 10, borderRadius: 3, background: `var(--mantine-color-${color}-filled)` }} />
      <Text size="sm">
        {etiqueta} <b>{entero(valor)}</b>
      </Text>
    </Group>
  );
}

type TotalesAvance = { reservados: number; pagados: number; cortesias: number; adultos: number; ninos: number };
type ClaveTotal = keyof TotalesAvance;

const CONCEPTOS_CIERRE: { clave: ClaveTotal; etiqueta: string }[] = [
  { clave: 'reservados', etiqueta: 'Reservados (total de sillas)' },
  { clave: 'pagados', etiqueta: 'Pagados' },
  { clave: 'cortesias', etiqueta: 'Cortesías' },
  { clave: 'adultos', etiqueta: 'Adultos' },
  { clave: 'ninos', etiqueta: 'Niños' },
];

/** Avance de este año contra el TOTAL FINAL de la edición anterior (reservados, pagados, cortesías, adultos y niños). */
function ContraElCierre({ actual, anio, cierre }: { actual: TotalesAvance; anio: number; cierre: FiestaHistoricoFila }) {
  const guardar = useFiestaGuardarCierreHistorico();
  const [editando, setEditando] = useState<ClaveTotal | null>(null);
  const [valor, setValor] = useState<number | string>('');

  const valorCierre = (k: ClaveTotal): number | null => cierre[k];

  const confirmar = async (k: ClaveTotal) => {
    const nuevo = valor === '' ? null : Number(valor);
    setEditando(null);
    if (nuevo === null || nuevo === valorCierre(k)) return;
    try {
      await guardar.mutateAsync({ anio, cambios: { [k]: nuevo } });
      notifications.show({ color: 'green', message: 'Cierre actualizado.' });
    } catch (e) {
      notifications.show({ color: 'red', title: 'No se pudo guardar', message: mensajeErrorFiesta(e) });
    }
  };

  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb={4} wrap="wrap">
        <Text fw={600}>Contra el cierre de {anio}</Text>
        <Badge variant="light" color="gray">
          total final de {anio} · {fechaCorta(cierre.fecha)}
        </Badge>
      </Group>
      <Text size="xs" c="dimmed" mb="xs">
        Lo que llevamos hoy comparado con lo que se vendió en total el año pasado. Si falta un dato de {anio} (por ejemplo los niños),
        captúralo con el lápiz.
      </Text>
      <Table verticalSpacing={7}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th />
            <Table.Th ta="right">Este año (hoy)</Table.Th>
            <Table.Th ta="right">Cierre {anio}</Table.Th>
            <Table.Th ta="right">Falta para igualarlo</Table.Th>
            <Table.Th w={150}>Avance</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {CONCEPTOS_CIERRE.map(({ clave, etiqueta }) => {
            const ant = valorCierre(clave);
            const hoy = actual[clave];
            const avance = ant && ant > 0 ? Math.min(Math.round((hoy / ant) * 100), 999) : null;
            const falta = ant === null ? null : ant - hoy;
            return (
              <Table.Tr key={clave}>
                <Table.Td fw={600}>{etiqueta}</Table.Td>
                <Table.Td ta="right" fw={700}>
                  {entero(hoy)}
                </Table.Td>
                <Table.Td ta="right">
                  {editando === clave ? (
                    <Group gap={4} justify="flex-end" wrap="nowrap">
                      <NumberInput
                        size="xs"
                        w={90}
                        hideControls
                        min={0}
                        allowDecimal={false}
                        value={valor}
                        onChange={setValor}
                        onKeyDown={(e) => e.key === 'Enter' && confirmar(clave)}
                        data-autofocus
                      />
                      <ActionIcon size="sm" variant="subtle" color="green" aria-label="Guardar" onClick={() => confirmar(clave)}>
                        <IconCheck size={14} />
                      </ActionIcon>
                      <ActionIcon size="sm" variant="subtle" color="gray" aria-label="Cancelar" onClick={() => setEditando(null)}>
                        <IconX size={14} />
                      </ActionIcon>
                    </Group>
                  ) : (
                    <Group gap={4} justify="flex-end" wrap="nowrap">
                      {ant === null ? (
                        <Text size="sm" c="dimmed">
                          sin dato
                        </Text>
                      ) : (
                        <Text span>{entero(ant)}</Text>
                      )}
                      <TooltipMantine label={`Capturar o corregir ${etiqueta.toLowerCase()} de ${anio}`}>
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="gray"
                          aria-label={`Editar ${etiqueta} de ${anio}`}
                          onClick={() => {
                            setValor(ant ?? '');
                            setEditando(clave);
                          }}
                        >
                          <IconPencil size={14} />
                        </ActionIcon>
                      </TooltipMantine>
                    </Group>
                  )}
                </Table.Td>
                <Table.Td ta="right" c={falta === null ? 'dimmed' : falta > 0 ? 'orange' : 'green'} fw={600}>
                  {falta === null ? '—' : falta > 0 ? `faltan ${entero(falta)}` : falta === 0 ? 'igual' : `+${entero(-falta)} más`}
                </Table.Td>
                <Table.Td>
                  {avance === null ? (
                    <Text size="xs" c="dimmed">
                      —
                    </Text>
                  ) : (
                    <Group gap={6} wrap="nowrap">
                      <Progress value={Math.min(avance, 100)} color={avance >= 100 ? 'green' : 'violet'} size="md" radius="xl" style={{ flex: 1 }} />
                      <Text size="xs" w={34} ta="right">
                        {avance}%
                      </Text>
                    </Group>
                  )}
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Paper>
  );
}

function Kpi({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle?: string }) {
  return (
    <Paper withBorder p="md">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {etiqueta}
      </Text>
      <Text size="1.8rem" fw={700} lh={1.2}>
        {valor}
      </Text>
      {detalle && (
        <Text size="xs" c="dimmed">
          {detalle}
        </Text>
      )}
    </Paper>
  );
}

function EstadoPago({ color, etiqueta, cantidad, pct }: { color: string; etiqueta: string; cantidad: number; pct: number | null }) {
  return (
    <Group gap="xs" wrap="nowrap">
      <Badge color={color} variant="filled" size="lg">
        {porcentaje(pct)}
      </Badge>
      <div>
        <Text fw={700}>{entero(cantidad)}</Text>
        <Text size="xs" c="dimmed">
          {etiqueta}
        </Text>
      </div>
    </Group>
  );
}

function FilaTarifa({ etiqueta, d }: { etiqueta: string; d: { cantidad: number; importe: number } }) {
  return (
    <Table.Tr>
      <Table.Td>{etiqueta}</Table.Td>
      <Table.Td ta="right">{entero(d.cantidad)}</Table.Td>
      <Table.Td ta="right">{dinero(d.importe)}</Table.Td>
    </Table.Tr>
  );
}

function FilaDinero({ etiqueta, valor, color, negrita }: { etiqueta: string; valor: number; color?: string; negrita?: boolean }) {
  return (
    <Table.Tr>
      <Table.Td fw={negrita ? 700 : undefined}>{etiqueta}</Table.Td>
      <Table.Td ta="right" c={color} fw={negrita ? 700 : undefined}>
        {dinero(valor)}
      </Table.Td>
    </Table.Tr>
  );
}

function FilaComparativo({ etiqueta, v }: { etiqueta: string; v: FiestaVariacion }) {
  const color = v.variacion > 0 ? 'green' : v.variacion < 0 ? 'red' : undefined;
  return (
    <Table.Tr>
      <Table.Td>{etiqueta}</Table.Td>
      <Table.Td ta="right">{entero(v.actual)}</Table.Td>
      <Table.Td ta="right">{entero(v.anterior)}</Table.Td>
      <Table.Td ta="right" c={color}>
        {v.variacion > 0 ? '+' : ''}
        {entero(v.variacion)}
      </Table.Td>
      <Table.Td ta="right" c={color}>
        {v.pct === null ? '—' : `${v.pct > 0 ? '+' : ''}${porcentaje(v.pct)}`}
      </Table.Td>
    </Table.Tr>
  );
}

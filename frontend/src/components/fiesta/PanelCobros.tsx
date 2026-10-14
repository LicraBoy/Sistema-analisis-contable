/**
 * PanelCobros — cómo vamos de cobranza, en tres vistas:
 *  · Cobranza: cuánto se ha cobrado y cuánto falta, el avance de las sillas (pagadas / anticipo / sin anticipo),
 *    la gráfica por día y el reparto por forma de pago.
 *  · Día a día: la hoja Cobros del Excel (Pago 1/2/3, total, acumulado y las reservas de cada día).
 *  · Contabilidad: sin IVA, total según póliza por día, diferencia, desglose de IVA/propina y la conciliación global.
 */

import {
  Alert,
  Badge,
  Box,
  Button,
  Chip,
  Group,
  Loader,
  NumberInput,
  Paper,
  Progress,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCash, IconChairDirector, IconReceipt2, IconTable } from '@tabler/icons-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import {
  mensajeErrorFiesta,
  useFiestaActualizarEvento,
  useFiestaCobros,
  useFiestaEvento,
  useFiestaGuardarPoliza,
  useFiestaHistorico,
  useFiestaSembrarHistorico,
  type FiestaCobroDia,
  type FiestaCobros,
  type FiestaHistoricoFila,
} from '../../api/fiestaHooks';
import { dinero, entero, fechaCorta, filaDelAnioPasado, hoyISO } from './fiestaUtils';

type Vista = 'cobranza' | 'dias' | 'contabilidad';

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const diaSemana = (iso: string) => DIAS[new Date(`${iso}T12:00:00`).getDay()];
const esFinDeSemana = (iso: string) => [0, 6].includes(new Date(`${iso}T12:00:00`).getDay());
const dineroONada = (v: number) => (Math.abs(v) < 0.005 ? '—' : dinero(v));
const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0);

// Colores de las sillas: los mismos que en el croquis, para que se lea igual en todo el módulo.
const COLOR = { pagadas: 'green', anticipos: 'blue', sin_anticipo: 'orange', cortesias: 'violet' } as const;

export default function PanelCobros() {
  const { data, isLoading, isError, error } = useFiestaCobros();
  const [vista, setVista] = useState<Vista>('cobranza');

  if (isLoading) return <Loader />;
  if (isError || !data) return <Alert color="red">{mensajeErrorFiesta(error)}</Alert>;

  const h = data.hoy;
  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <div>
          <Title order={3}>Cobros</Title>
          <Text size="sm" c="dimmed">
            {h
              ? `${h.es_hoy ? 'Hoy' : 'Último día del evento'}, ${diaSemana(h.fecha)} ${fechaCorta(h.fecha)}`
              : 'Todavía no hay ventas ni pagos'}
          </Text>
        </div>
        <SegmentedControl
          value={vista}
          onChange={(v) => setVista(v as Vista)}
          data={[
            { value: 'cobranza', label: <Etiqueta icono={<IconCash size={16} />} texto="Cobranza" /> },
            { value: 'dias', label: <Etiqueta icono={<IconTable size={16} />} texto="Día a día" /> },
            { value: 'contabilidad', label: <Etiqueta icono={<IconReceipt2 size={16} />} texto="Contabilidad" /> },
          ]}
        />
      </Group>

      {vista === 'cobranza' && <VistaCobranza data={data} />}
      {vista === 'dias' && <VistaDias data={data} />}
      {vista === 'contabilidad' && <VistaContabilidad data={data} />}
    </Stack>
  );
}

function Etiqueta({ icono, texto }: { icono: ReactNode; texto: string }) {
  return (
    <Group gap={6} wrap="nowrap" justify="center">
      {icono}
      <span>{texto}</span>
    </Group>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Resumen
// ───────────────────────────────────────────────────────────────────────────

function VistaCobranza({ data }: { data: FiestaCobros }) {
  const h = data.hoy;
  const porCobrar = h?.por_cobrar ?? 0;
  const vendido = data.total + porCobrar;
  const avance = pct(data.total, vendido);
  const r = h?.reservas;

  const serie = data.dias.map((d) => ({ dia: fechaCorta(d.fecha).slice(0, 5), cobrado: d.total, acumulado: d.acumulado }));
  const hayMovimiento = data.dias.some((d) => d.total > 0);

  return (
    <Stack gap="lg">
      {/* Cobranza: lo primero que se pregunta */}
      <Paper withBorder radius="lg" p="lg" style={{ background: 'linear-gradient(135deg, var(--mantine-color-violet-light), transparent 70%)' }}>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg">
          <Cifra etiqueta="Cobrado" valor={dinero(data.total)} color="green" grande />
          <Cifra etiqueta="Por cobrar" valor={dinero(porCobrar)} color={porCobrar > 0 ? 'red' : undefined} grande />
          <Cifra etiqueta="Cobrado hoy" valor={dinero(h?.cobrado_hoy ?? 0)} grande />
        </SimpleGrid>
        <Box mt="lg">
          <Group justify="space-between" mb={6}>
            <Text size="sm" fw={600}>
              Avance de cobranza
            </Text>
            <Text size="sm" c="dimmed">
              {dinero(data.total)} de {dinero(vendido)} · <b>{avance} %</b>
            </Text>
          </Group>
          <Progress value={avance} color="green" size="xl" radius="xl" striped animated={avance > 0 && avance < 100} />
        </Box>
      </Paper>

      {/* Sillas: cuántas llevamos y en qué estado */}
      {r && (
        <Paper withBorder radius="lg" p="lg">
          <Group justify="space-between" align="center" mb="sm" wrap="wrap">
            <Group gap="sm">
              <ThemeIcon variant="light" size="lg" radius="md">
                <IconChairDirector size={20} />
              </ThemeIcon>
              <div>
                <Text fw={700} size="lg" lh={1.1}>
                  {entero(r.reservados)} sillas reservadas
                </Text>
                <Text size="xs" c="dimmed">
                  al cierre de {h && fechaCorta(h.fecha)}
                </Text>
              </div>
            </Group>
          </Group>
          <Progress.Root size={28} radius="xl">
            {(['pagadas', 'anticipos', 'sin_anticipo', 'cortesias'] as const).map((k) => (
              <Progress.Section key={k} value={pct(r[k], r.reservados)} color={COLOR[k]}>
                {pct(r[k], r.reservados) >= 8 && <Progress.Label>{r[k]}</Progress.Label>}
              </Progress.Section>
            ))}
          </Progress.Root>
          <SimpleGrid cols={{ base: 2, sm: 4 }} mt="md" spacing="sm">
            <Leyenda color="green" etiqueta="Pagadas" valor={r.pagadas} nota="liquidadas" />
            <Leyenda color="blue" etiqueta="Con anticipo" valor={r.anticipos} nota="pagaron una parte" />
            <Leyenda color="orange" etiqueta="Sin anticipo" valor={r.sin_anticipo} nota="apartadas, sin pago" />
            <Leyenda color="violet" etiqueta="Cortesías" valor={r.cortesias} nota="sin costo" />
          </SimpleGrid>
        </Paper>
      )}

      <SimpleGrid cols={{ base: 1, md: 5 }} spacing="lg">
        <Paper withBorder radius="lg" p="lg" style={{ gridColumn: 'span 3' }}>
          <Text fw={700} mb="sm">
            Cobrado por día
          </Text>
          {hayMovimiento ? (
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <ComposedChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="gradCobros" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7048e8" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#7048e8" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--mantine-color-gray-3)" />
                  <XAxis dataKey="dia" interval="preserveStartEnd" minTickGap={28} tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} tickLine={false} axisLine={false} fontSize={12} width={48} />
                  <Tooltip formatter={(valor, nombre) => [dinero(Number(valor)), nombre === 'cobrado' ? 'Cobrado ese día' : 'Acumulado']} />
                  <Area dataKey="cobrado" stroke="#7048e8" strokeWidth={2} fill="url(#gradCobros)" />
                  <Line dataKey="acumulado" stroke="#2f9e44" strokeWidth={2} dot={false} strokeDasharray="5 4" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Text c="dimmed" size="sm">
              Aún no hay cobros: la gráfica aparece con el primer pago.
            </Text>
          )}
          <Group gap="md" mt="xs">
            <Group gap={6}>
              <span style={{ width: 14, height: 4, borderRadius: 2, background: '#7048e8' }} />
              <Text size="xs" c="dimmed">
                Cobrado ese día
              </Text>
            </Group>
            <Group gap={6}>
              <span style={{ width: 14, height: 0, borderTop: '2px dashed #2f9e44' }} />
              <Text size="xs" c="dimmed">
                Acumulado
              </Text>
            </Group>
          </Group>
        </Paper>

        <Paper withBorder radius="lg" p="lg" style={{ gridColumn: 'span 2' }}>
          <Text fw={700} mb="sm">
            Cómo pagan
          </Text>
          {data.por_forma_pago.length === 0 ? (
            <Text c="dimmed" size="sm">
              Sin pagos todavía.
            </Text>
          ) : (
            <Stack gap="sm">
              {data.por_forma_pago
                .slice()
                .sort((a, b) => b.importe - a.importe)
                .map((f) => (
                  <div key={f.forma_pago}>
                    <Group justify="space-between" mb={2}>
                      <Text size="sm" fw={600}>
                        {f.forma_pago}
                      </Text>
                      <Text size="sm">
                        {dinero(f.importe)} <Text span c="dimmed" size="xs">· {pct(f.importe, data.total)} %</Text>
                      </Text>
                    </Group>
                    <Progress value={pct(f.importe, data.total)} color="violet" size="md" radius="xl" />
                  </div>
                ))}
            </Stack>
          )}
        </Paper>
      </SimpleGrid>
    </Stack>
  );
}

function Cifra({ etiqueta, valor, color, grande }: { etiqueta: string; valor: string; color?: string; grande?: boolean }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: 0.4 }}>
        {etiqueta}
      </Text>
      <Text fw={800} c={color} lh={1.15} style={{ fontSize: grande ? '2rem' : '1.4rem' }}>
        {valor}
      </Text>
    </div>
  );
}

function Leyenda({ color, etiqueta, valor, nota }: { color: string; etiqueta: string; valor: number; nota: string }) {
  return (
    <Group gap="xs" wrap="nowrap" align="flex-start">
      <span style={{ width: 10, height: 10, borderRadius: 3, marginTop: 6, background: `var(--mantine-color-${color}-filled)`, flexShrink: 0 }} />
      <div>
        <Text size="xl" fw={800} lh={1}>
          {entero(valor)}
        </Text>
        <Text size="sm" fw={600} lh={1.3}>
          {etiqueta}
        </Text>
        <Text size="xs" c="dimmed" lh={1.2}>
          {nota}
        </Text>
      </div>
    </Group>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Día a día (hoja Cobros del Excel)
// ───────────────────────────────────────────────────────────────────────────

function VistaDias({ data }: { data: FiestaCobros }) {
  const [soloMovimiento, setSoloMovimiento] = useState(false);
  const [verPagos, setVerPagos] = useState(true);
  const [verReservas, setVerReservas] = useState(true);
  const [verTipos, setVerTipos] = useState(true);
  const [verAnioPasado, setVerAnioPasado] = useState(true);
  const { data: hist } = useFiestaHistorico();
  const sembrar = useFiestaSembrarHistorico();
  const anioPasado = hist?.anio ?? new Date().getFullYear() - 1;
  const filasHist = hist?.filas ?? [];
  const hayHistorico = filasHist.length > 0;
  const mostrarAnioPasado = verAnioPasado && hayHistorico;
  const hoy = data.hoy?.fecha ?? hoyISO();

  const cargarHistorico = async () => {
    try {
      const r = await sembrar.mutateAsync(anioPasado);
      notifications.show({ color: 'green', message: `Histórico ${r.anio}: ${r.cargadas} días cargados.` });
    } catch (e) {
      notifications.show({ color: 'red', title: 'No se pudo cargar', message: mensajeErrorFiesta(e) });
    }
  };
  const filas = useMemo(() => (soloMovimiento ? data.dias.filter((d) => d.movimiento) : data.dias), [data.dias, soloMovimiento]);
  const t = data.totales;

  if (data.dias.length === 0) {
    return (
      <Paper withBorder radius="lg" p="xl" ta="center">
        <Text c="dimmed">Todavía no hay ventas ni pagos registrados.</Text>
      </Paper>
    );
  }

  return (
    <Paper withBorder radius="lg" style={{ overflow: 'hidden' }}>
      <Group justify="space-between" p="md" wrap="wrap" gap="sm">
        <Group gap="xs">
          <Chip size="xs" checked={verPagos} onChange={setVerPagos} variant="light">
            Pago 1 / 2 / 3
          </Chip>
          <Chip size="xs" checked={verReservas} onChange={setVerReservas} variant="light">
            Sillas por día
          </Chip>
          <Chip size="xs" checked={verTipos} onChange={setVerTipos} variant="light" color="teal">
            Tipo de boleto
          </Chip>
          {hayHistorico ? (
            <Chip size="xs" checked={verAnioPasado} onChange={setVerAnioPasado} variant="light" color="gray">
              Mismo día de {anioPasado}
            </Chip>
          ) : (
            <Button size="compact-xs" variant="light" color="gray" onClick={cargarHistorico} loading={sembrar.isPending}>
              Cargar datos de {anioPasado}
            </Button>
          )}
        </Group>
        <Switch size="sm" label="Ocultar días sin movimiento" checked={soloMovimiento} onChange={(e) => setSoloMovimiento(e.currentTarget.checked)} />
      </Group>

      <Table.ScrollContainer minWidth={760} mah={620}>
        <Table stickyHeader verticalSpacing={7} horizontalSpacing="md" fz="sm" highlightOnHover>
          <Table.Thead style={{ background: 'var(--mantine-color-body)' }}>
            <Table.Tr>
              <Table.Th>Fecha</Table.Th>
              {verPagos && (
                <>
                  <Table.Th ta="right">Pago 1</Table.Th>
                  <Table.Th ta="right">Pago 2</Table.Th>
                  <Table.Th ta="right">Pago 3</Table.Th>
                </>
              )}
              <Table.Th ta="right">Cobrado</Table.Th>
              <Table.Th ta="right">Acumulado</Table.Th>
              {verTipos && (
                <>
                  <Table.Th ta="right" c="teal" style={{ borderLeft: '2px solid var(--mantine-color-gray-4)' }}>Vendidos hoy · Adulto</Table.Th>
                  <Table.Th ta="right" c="teal">Niño</Table.Th>
                  <Table.Th ta="right" c="teal">Cortesía</Table.Th>
                  <Table.Th ta="right" c="dimmed">Acum. Adultos</Table.Th>
                  <Table.Th ta="right" c="dimmed">Niños</Table.Th>
                  <Table.Th ta="right" c="dimmed">Cortesías</Table.Th>
                </>
              )}
              {verReservas && (
                <>
                  <Table.Th ta="right">Reservadas</Table.Th>
                  <Table.Th ta="right" c="green">Pagadas</Table.Th>
                  <Table.Th ta="right" c="blue">Anticipo</Table.Th>
                  <Table.Th ta="right" c="orange">Sin anticipo</Table.Th>
                  <Table.Th ta="right" c="violet">Cortesías</Table.Th>
                </>
              )}
              {mostrarAnioPasado && (
                <>
                  <Table.Th ta="right" style={{ borderLeft: '2px solid var(--mantine-color-gray-4)' }}>{anioPasado} · Reservadas</Table.Th>
                  <Table.Th ta="right" c="green">Pagadas</Table.Th>
                  <Table.Th ta="right" c="blue">Anticipo</Table.Th>
                  <Table.Th ta="right" c="orange">Sin anticipo</Table.Th>
                  <Table.Th ta="right" c="violet">Cortesías</Table.Th>
                  <Table.Th ta="right">Diferencia</Table.Th>
                </>
              )}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filas.map((d) => (
              <FilaDia key={d.fecha} d={d} esHoy={d.fecha === hoy} verPagos={verPagos} verReservas={verReservas} verTipos={verTipos} anioPasado={mostrarAnioPasado ? { anio: anioPasado, filas: filasHist } : null} />
            ))}
            {filas.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={19} ta="center" c="dimmed">
                  No hay días con movimiento.
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
          <Table.Tfoot style={{ background: 'var(--mantine-color-gray-1)', position: 'sticky', bottom: 0 }}>
            <Table.Tr>
              <Table.Th>Total</Table.Th>
              {verPagos && (
                <>
                  <Table.Th ta="right">{dinero(t.pago1)}</Table.Th>
                  <Table.Th ta="right">{dinero(t.pago2)}</Table.Th>
                  <Table.Th ta="right">{dinero(t.pago3)}</Table.Th>
                </>
              )}
              <Table.Th ta="right">{dinero(t.total)}</Table.Th>
              <Table.Th />
              {verTipos && (
                <>
                  <Table.Th ta="right">{data.dias.reduce((a, d) => a + d.vendidas.adulto, 0)}</Table.Th>
                  <Table.Th ta="right">{data.dias.reduce((a, d) => a + d.vendidas.nino, 0)}</Table.Th>
                  <Table.Th ta="right">{data.dias.reduce((a, d) => a + d.vendidas.cortesia, 0)}</Table.Th>
                  <Table.Th colSpan={3} />
                </>
              )}
              {verReservas && <Table.Th colSpan={5} />}
              {mostrarAnioPasado && <Table.Th colSpan={6} />}
            </Table.Tr>
          </Table.Tfoot>
        </Table>
      </Table.ScrollContainer>
      <Text size="xs" c="dimmed" p="md" pt="xs">
        "Vendidos hoy" son los boletos reservados ese día por tipo (adulto, niño o cortesía; sin contar cancelados) y "Acum." el total de cada
        tipo reservado hasta esa fecha. Pago 1, 2 y 3 son el 1.º, 2.º y 3.º abono de cada reservación (el 3.º incluye los siguientes). Las sillas por día se calculan con
        los pagos hasta el cierre de cada fecha. "Mismo día de {anioPasado}" son las sillas acumuladas que se capturaron entonces en el Excel
        (captura parcial): los números atenuados y en cursiva son el último dato anterior, porque ese día no se capturó; la diferencia compara
        las sillas reservadas de este año contra esa cifra.
      </Text>
    </Paper>
  );
}

function FilaDia({
  d,
  esHoy,
  verPagos,
  verReservas,
  verTipos,
  anioPasado,
}: {
  d: FiestaCobroDia;
  esHoy: boolean;
  verPagos: boolean;
  verReservas: boolean;
  verTipos: boolean;
  anioPasado: { anio: number; filas: FiestaHistoricoFila[] } | null;
}) {
  const finde = esFinDeSemana(d.fecha);
  const previo = anioPasado ? filaDelAnioPasado(anioPasado.filas, d.fecha, anioPasado.anio) : null;
  const celdaPrevio = (valor: number | undefined) =>
    previo ? (
      <Table.Td ta="right" style={previo.exacta ? undefined : { opacity: 0.55, fontStyle: 'italic' }} title={previo.exacta ? undefined : `dato del ${fechaCorta(previo.fila.fecha)}`}>
        {valor}
      </Table.Td>
    ) : (
      <Table.Td ta="right" c="dimmed">
        ·
      </Table.Td>
    );
  const dif = previo ? d.reservas.reservados - previo.fila.reservados : null;
  return (
    <Table.Tr
      style={{
        background: esHoy ? 'var(--mantine-color-violet-light)' : undefined,
        opacity: d.movimiento || esHoy ? 1 : 0.5,
      }}
    >
      <Table.Td style={{ whiteSpace: 'nowrap' }}>
        <Text span fw={600} c={finde ? 'dimmed' : undefined}>
          {fechaCorta(d.fecha)}
        </Text>{' '}
        <Text span size="xs" c="dimmed">
          {diaSemana(d.fecha)}
        </Text>
        {esHoy && (
          <Badge ml={6} size="xs" variant="filled" color="violet">
            hoy
          </Badge>
        )}
      </Table.Td>
      {verPagos && (
        <>
          <Table.Td ta="right">{dineroONada(d.pago1)}</Table.Td>
          <Table.Td ta="right">{dineroONada(d.pago2)}</Table.Td>
          <Table.Td ta="right">{dineroONada(d.pago3)}</Table.Td>
        </>
      )}
      <Table.Td ta="right" fw={d.total > 0 ? 700 : undefined}>
        {dineroONada(d.total)}
      </Table.Td>
      <Table.Td ta="right" c="dimmed">
        {dinero(d.acumulado)}
      </Table.Td>
      {verTipos && (
        <>
          <Table.Td ta="right" fw={d.vendidas.adulto > 0 ? 700 : undefined} style={{ borderLeft: '2px solid var(--mantine-color-gray-4)' }}>{d.vendidas.adulto || <Text span c="dimmed">·</Text>}</Table.Td>
          <Table.Td ta="right" fw={d.vendidas.nino > 0 ? 700 : undefined}>{d.vendidas.nino || <Text span c="dimmed">·</Text>}</Table.Td>
          <Table.Td ta="right" fw={d.vendidas.cortesia > 0 ? 700 : undefined}>{d.vendidas.cortesia || <Text span c="dimmed">·</Text>}</Table.Td>
          <Table.Td ta="right" c="dimmed">{d.reservas.tipos.adulto}</Table.Td>
          <Table.Td ta="right" c="dimmed">{d.reservas.tipos.nino}</Table.Td>
          <Table.Td ta="right" c="dimmed">{d.reservas.tipos.cortesia}</Table.Td>
        </>
      )}
      {verReservas && (
        <>
          <Table.Td ta="right" fw={700}>{d.reservas.reservados}</Table.Td>
          <Table.Td ta="right">{d.reservas.pagadas || <Text span c="dimmed">·</Text>}</Table.Td>
          <Table.Td ta="right">{d.reservas.anticipos || <Text span c="dimmed">·</Text>}</Table.Td>
          <Table.Td ta="right">{d.reservas.sin_anticipo || <Text span c="dimmed">·</Text>}</Table.Td>
          <Table.Td ta="right">{d.reservas.cortesias || <Text span c="dimmed">·</Text>}</Table.Td>
        </>
      )}
      {anioPasado && (
        <>
          {celdaPrevio(previo?.fila.reservados)}
          {celdaPrevio(previo?.fila.pagados)}
          {celdaPrevio(previo?.fila.anticipos)}
          {celdaPrevio(previo?.fila.sin_anticipo)}
          {celdaPrevio(previo?.fila.cortesias)}
          <Table.Td ta="right" fw={600} c={dif === null ? 'dimmed' : dif > 0 ? 'green' : dif < 0 ? 'red' : undefined}>
            {dif === null ? '·' : `${dif > 0 ? '+' : ''}${dif}`}
          </Table.Td>
        </>
      )}
    </Table.Tr>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Contabilidad
// ───────────────────────────────────────────────────────────────────────────

function VistaContabilidad({ data }: { data: FiestaCobros }) {
  const { data: evento } = useFiestaEvento();
  const actualizarEvento = useFiestaActualizarEvento();
  const [contabilidad, setContabilidad] = useState<number | string | null>(null);
  const [soloMovimiento, setSoloMovimiento] = useState(true);
  const hoy = data.hoy?.fecha ?? hoyISO();
  const t = data.totales;
  const dif = data.conciliacion.diferencia;
  const valorContabilidad = contabilidad ?? evento?.total_contabilidad_al_dia ?? '';
  const filas = soloMovimiento ? data.dias.filter((d) => d.movimiento || d.poliza !== null) : data.dias;

  const guardarContabilidad = async () => {
    const monto = typeof valorContabilidad === 'number' ? valorContabilidad : Number(valorContabilidad);
    try {
      await actualizarEvento.mutateAsync(
        valorContabilidad === '' ? { limpiar_contabilidad: true } : { total_contabilidad_al_dia: monto },
      );
      setContabilidad(null);
      notifications.show({ color: 'green', message: 'Total de contabilidad guardado.' });
    } catch (e) {
      notifications.show({ color: 'red', message: mensajeErrorFiesta(e) });
    }
  };

  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
        <Paper withBorder radius="lg" p="md">
          <Cifra etiqueta="Total cobrado (con IVA)" valor={dinero(data.total)} />
        </Paper>
        <Paper withBorder radius="lg" p="md">
          <Cifra etiqueta="Sin IVA" valor={dinero(data.total_sin_iva)} />
        </Paper>
        <Paper withBorder radius="lg" p="md">
          <Cifra etiqueta="Según pólizas" valor={t.dias_con_poliza > 0 ? dinero(t.poliza) : '—'} />
          <Text size="xs" c="dimmed">
            {t.dias_con_poliza} {t.dias_con_poliza === 1 ? 'día capturado' : 'días capturados'}
          </Text>
        </Paper>
        <Paper withBorder radius="lg" p="md">
          <Cifra
            etiqueta="Diferencia"
            valor={t.dias_con_poliza > 0 ? dinero(t.diferencia) : '—'}
            color={t.dias_con_poliza > 0 ? (Math.abs(t.diferencia) < 0.01 ? 'green' : 'red') : undefined}
          />
          <Text size="xs" c="dimmed">
            sin IVA − póliza
          </Text>
        </Paper>
      </SimpleGrid>

      <Paper withBorder radius="lg" style={{ overflow: 'hidden' }}>
        <Group justify="space-between" p="md" wrap="wrap">
          <div>
            <Text fw={700}>Póliza contable por día</Text>
            <Text size="xs" c="dimmed">
              Captura en la celda lo que contabilidad registró ese día (sin IVA). La diferencia se calcula sola.
            </Text>
          </div>
          <Switch size="sm" label="Solo días con movimiento" checked={soloMovimiento} onChange={(e) => setSoloMovimiento(e.currentTarget.checked)} />
        </Group>
        {filas.length === 0 ? (
          <Text c="dimmed" p="md" pt={0}>
            Todavía no hay cobros para conciliar.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={620} mah={460}>
            <Table stickyHeader verticalSpacing={6} horizontalSpacing="md" fz="sm" highlightOnHover>
              <Table.Thead style={{ background: 'var(--mantine-color-body)' }}>
                <Table.Tr>
                  <Table.Th>Fecha</Table.Th>
                  <Table.Th ta="right">Cobrado</Table.Th>
                  <Table.Th ta="right">Sin IVA</Table.Th>
                  <Table.Th ta="right">Según póliza</Table.Th>
                  <Table.Th ta="right">Diferencia</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filas.map((d) => (
                  <Table.Tr key={d.fecha} style={{ background: d.fecha === hoy ? 'var(--mantine-color-violet-light)' : undefined }}>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>
                      <Text span fw={600}>{fechaCorta(d.fecha)}</Text>{' '}
                      <Text span size="xs" c="dimmed">{diaSemana(d.fecha)}</Text>
                    </Table.Td>
                    <Table.Td ta="right">{dineroONada(d.total)}</Table.Td>
                    <Table.Td ta="right">{dineroONada(d.sin_iva)}</Table.Td>
                    <Table.Td ta="right" w={170}>
                      <CeldaPoliza d={d} />
                    </Table.Td>
                    <Table.Td ta="right" c={d.diferencia !== null && Math.abs(d.diferencia) > 0.01 ? 'red' : d.diferencia !== null ? 'green' : 'dimmed'} fw={d.diferencia !== null ? 700 : undefined}>
                      {d.diferencia === null ? '—' : Math.abs(d.diferencia) < 0.01 ? '✓ cuadra' : dinero(d.diferencia)}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
              <Table.Tfoot style={{ background: 'var(--mantine-color-gray-1)', position: 'sticky', bottom: 0 }}>
                <Table.Tr>
                  <Table.Th>Total</Table.Th>
                  <Table.Th ta="right">{dinero(t.total)}</Table.Th>
                  <Table.Th ta="right">{dinero(t.sin_iva)}</Table.Th>
                  <Table.Th ta="right">{t.dias_con_poliza > 0 ? dinero(t.poliza) : '—'}</Table.Th>
                  <Table.Th ta="right" c={t.dias_con_poliza > 0 && Math.abs(t.diferencia) > 0.01 ? 'red' : undefined}>
                    {t.dias_con_poliza > 0 ? dinero(t.diferencia) : '—'}
                  </Table.Th>
                </Table.Tr>
              </Table.Tfoot>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Paper withBorder radius="lg" p="lg">
          <Text fw={700} mb="xs">
            De qué se compone lo cobrado
          </Text>
          <Text size="xs" c="dimmed" mb="sm">
            El precio del boleto incluye IVA y propina.
          </Text>
          <Table verticalSpacing={6}>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td>Ingreso (sin IVA ni propina)</Table.Td>
                <Table.Td ta="right" fw={700}>{dinero(data.fiscal.subtotal)}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>IVA</Table.Td>
                <Table.Td ta="right">{dinero(data.fiscal.iva)}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>Propina</Table.Td>
                <Table.Td ta="right">{dinero(data.fiscal.propina)}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td fw={700}>Total</Table.Td>
                <Table.Td ta="right" fw={800}>{dinero(data.fiscal.total)}</Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Paper>

        <Paper withBorder radius="lg" p="lg">
          <Text fw={700} mb="xs">
            Conciliación global
          </Text>
          <Text size="xs" c="dimmed" mb="sm">
            Un solo total pagado según contabilidad, comparado contra lo cobrado en el sistema.
          </Text>
          <Group align="flex-end">
            <NumberInput
              label="Total pagado según contabilidad (al día)"
              value={valorContabilidad}
              onChange={setContabilidad}
              decimalScale={2}
              prefix="$"
              thousandSeparator=","
              style={{ flex: 1 }}
            />
            <Button onClick={guardarContabilidad} loading={actualizarEvento.isPending} disabled={contabilidad === null}>
              Guardar
            </Button>
          </Group>
          {dif !== null && (
            <Alert color={Math.abs(dif) < 0.01 ? 'green' : 'yellow'} mt="sm" p="xs">
              Sistema {dinero(data.conciliacion.total_sistema)} − contabilidad {dinero(data.conciliacion.total_contabilidad)} ={' '}
              <b>{dinero(dif)}</b>
            </Alert>
          )}
        </Paper>
      </SimpleGrid>
    </Stack>
  );
}

/** Total que contabilidad registró en póliza ese día (sin IVA): se guarda al salir de la celda o con Enter. */
function CeldaPoliza({ d }: { d: FiestaCobroDia }) {
  const guardar = useFiestaGuardarPoliza();
  const [valor, setValor] = useState<number | string>(d.poliza ?? '');

  const confirmar = async () => {
    const nuevo = valor === '' ? null : Number(valor);
    if (nuevo === d.poliza) return;
    try {
      await guardar.mutateAsync({ fecha: d.fecha, importe: nuevo });
    } catch (e) {
      notifications.show({ color: 'red', title: 'No se pudo guardar la póliza', message: mensajeErrorFiesta(e) });
      setValor(d.poliza ?? '');
    }
  };

  return (
    <NumberInput
      size="xs"
      hideControls
      value={valor}
      onChange={setValor}
      onBlur={confirmar}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      decimalScale={2}
      prefix="$"
      thousandSeparator=","
      placeholder="capturar"
      styles={{ input: { textAlign: 'right' } }}
      aria-label={`Total según póliza del ${fechaCorta(d.fecha)}`}
    />
  );
}

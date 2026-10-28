/**
 * ResumenIngeniero — la hoja "Resumen" del Excel tal como es, para quien solo necesita ver el comparativo:
 * COMPARATIVO este año contra el año pasado (adultos, niños, cortesías, total; pagadas, anticipos, sin anticipo),
 * preventa / normal, capacidad total y la gráfica "Reservas". El año pasado sale del cierre de esa edición.
 */

import { Group, Paper, SimpleGrid, Stack, Table, Text } from '@mantine/core';
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { useFiestaCobros, useFiestaHistorico, useFiestaHistoricoPagos, type FiestaHistoricoFila, type FiestaResumen } from '../../api/fiestaHooks';
import { entero, fechaCorta, filaDelAnioPasado, hoyISO, porcentaje, variacionDiariaHistorico } from './fiestaUtils';

const NUM: CSSProperties = { fontVariantNumeric: 'tabular-nums', textAlign: 'right' };
const BANDA: CSSProperties = { background: 'var(--mantine-color-violet-filled)', color: '#fff' };

const aPct = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${porcentaje(v * 100)}`);

export default function ResumenIngeniero({ data, fechaCorte }: { data: FiestaResumen; fechaCorte: string }) {
  const { data: hist } = useFiestaHistorico(data.anio_comparativo);
  const filas = hist?.filas ?? [];
  const cierre: FiestaHistoricoFila | null = filas.length > 0 ? filas[filas.length - 1] : null;
  const anioActual = data.anio_comparativo + 1;
  const anioPasado = data.anio_comparativo;

  const { reservas, estado } = data;
  const sinAnticipoActual = estado.sin_anticipo_con_cortesias; // Resumen!E16 = sin anticipo + cortesías
  const parte = (n: number) => (reservas.total > 0 ? n / reservas.total : 0); // % de cada tipo sobre el total reservado
  const subtotalPago = estado.pagadas + estado.anticipos + sinAnticipoActual;

  // Año pasado AL MISMO DÍA que el corte elegido: va sumándose día con día hasta llegar al cierre.
  //  · niños: acumulado de la lista de boletos de niño hasta ese día (mes/día; es por fecha de PAGO, puede ser
  //    un mínimo si hay niños reservados que todavía no pagan nada);
  //  · total, pagadas, anticipos y cortesías: última captura del Excel hasta ese día (confiable);
  //  · adultos: NO viene de su propia lista de pagos (esa lista solo trae boletos con algún pago capturado y
  //    deja fuera las reservas "sin anticipo", que sí cuentan en el Total real) — se calcula como el restante
  //    hasta completar el Total (Total − Niños − Cortesías), así el desglose por tipo siempre cuadra exacto.
  //  · de la fecha del cierre en adelante se usa el cierre tal cual (ahí sí hay adultos/niños reales del Excel).
  const { data: pagosHist } = useFiestaHistoricoPagos(data.anio_comparativo);
  const [, mesCorte, diaCorte] = fechaCorte.split('-');
  const corteAnterior = `${anioPasado}-${mesCorte}-${diaCorte}`;
  const enElCierre = !!cierre && corteAnterior >= cierre.fecha;
  const captura = filaDelAnioPasado(filas, fechaCorte, anioPasado)?.fila ?? null;
  const acumulado = (tipo: 'adulto' | 'nino'): number | null => {
    const dias = pagosHist?.dias ?? [];
    if (!pagosHist?.tipos[tipo].disponible || dias.length === 0) return null;
    if (corteAnterior < dias[0].fecha) return null; // antes del primer pago de la lista: sin dato
    return dias.filter((d) => d.fecha <= corteAnterior).reduce((t, d) => t + (d[tipo]?.reservados ?? 0), 0);
  };
  let prev: {
    adultos: number | null; ninos: number | null; cortesias: number | null; total: number | null;
    pagadas: number | null; anticipos: number | null; sinAntic: number | null; subtotal: number | null;
  };
  if (enElCierre || !cierre) {
    prev = {
      adultos: cierre?.adultos ?? null,
      ninos: cierre?.ninos ?? null,
      cortesias: cierre ? cierre.cortesias : null,
      // Como en la hoja (TOTAL = adultos + niños + cortesías); sin el desglose, el total de reservados del cierre.
      total: cierre && cierre.adultos !== null && cierre.ninos !== null ? cierre.adultos + cierre.ninos + cierre.cortesias : cierre ? cierre.reservados : null,
      pagadas: cierre ? cierre.pagados : null,
      anticipos: cierre ? cierre.anticipos : null,
      sinAntic: cierre ? cierre.sin_anticipo + cierre.cortesias : null,
      subtotal: cierre ? cierre.pagados + cierre.anticipos + cierre.sin_anticipo + cierre.cortesias : null,
    };
  } else {
    const ninos = acumulado('nino');
    const cortesias = captura ? captura.cortesias : null;
    const total = captura ? captura.reservados : null;
    // Adultos = lo que sobra del Total real tras Niños y Cortesías (ver comentario de arriba).
    const adultos = total !== null && ninos !== null && cortesias !== null ? Math.max(0, total - ninos - cortesias) : null;
    prev = {
      adultos,
      ninos,
      cortesias,
      total,
      pagadas: captura ? captura.pagados : null,
      anticipos: captura ? captura.anticipos : null,
      sinAntic: captura ? captura.reservados - captura.pagados - captura.anticipos : null,
      subtotal: captura ? captura.reservados : null,
    };
  }

  const grafica = [
    { nombre: 'ADULTOS', actual: reservas.adultos, anterior: prev.adultos },
    { nombre: 'NIÑOS', actual: reservas.ninos, anterior: prev.ninos },
    { nombre: 'CORTESÍAS', actual: reservas.cortesias, anterior: prev.cortesias },
  ];

  return (
    <Stack gap="lg">
    <SimpleGrid cols={{ base: 1, lg: 5 }} spacing="lg" style={{ alignItems: 'start' }}>
      <Paper withBorder radius="md" style={{ gridColumn: 'span 3', overflow: 'hidden' }}>
        <Table.ScrollContainer minWidth={560}>
          <Table verticalSpacing={5} horizontalSpacing="md" fz="sm" withColumnBorders>
            <Table.Thead>
              <Table.Tr style={BANDA}>
                <Table.Th colSpan={2} style={{ color: '#fff' }}>
                  COMPARATIVO
                </Table.Th>
                <Table.Th style={{ ...NUM, color: '#fff' }}>{anioActual}</Table.Th>
                <Table.Th style={{ ...NUM, color: '#fff' }}>%</Table.Th>
                <Table.Th style={{ ...NUM, color: '#fff', whiteSpace: 'nowrap' }}>{anioPasado}{enElCierre ? ' (cierre)' : ` al ${diaCorte}/${mesCorte}`}</Table.Th>
                <Table.Th style={{ ...NUM, color: '#fff' }}>Variación</Table.Th>
                <Table.Th style={{ ...NUM, color: '#fff' }}>%</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {/* RESERVAS AL: fecha · total */}
              <Fila etiqueta="RESERVAS AL:" extra={fechaCorta(fechaCorte)} actual={reservas.total} anterior={prev.total} negrita compartido={data.capacidad_total > 0 ? reservas.total / data.capacidad_total : 0} tituloPct="Ocupación: reservas entre la capacidad total del salón" />
              <Separador />

              <Fila etiqueta="ADULTOS" actual={reservas.adultos} anterior={prev.adultos} compartido={parte(reservas.adultos)} />
              <Fila etiqueta="+NIÑOS" actual={reservas.ninos} anterior={prev.ninos} compartido={parte(reservas.ninos)} />
              <Fila etiqueta="+CORTESIAS" actual={reservas.cortesias} anterior={prev.cortesias} compartido={parte(reservas.cortesias)} />
              <Fila etiqueta="TOTAL" actual={reservas.total} anterior={prev.total} negrita total compartido={reservas.total > 0 ? 1 : 0} />
              <Separador />

              <Fila etiqueta="R.PAGADAS" actual={estado.pagadas} anterior={prev.pagadas} compartido={estado.pagadas / (subtotalPago || 1)} />
              <Fila etiqueta="+ANTICIPOS" actual={estado.anticipos} anterior={prev.anticipos} compartido={estado.anticipos / (subtotalPago || 1)} />
              <Fila etiqueta="+R.SIN ANTIC" actual={sinAnticipoActual} anterior={prev.sinAntic} compartido={sinAnticipoActual / (subtotalPago || 1)} />
              <Fila etiqueta="SUBTOTAL" actual={subtotalPago} anterior={prev.subtotal} negrita total compartido={subtotalPago > 0 ? 1 : 0} />
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>

        {cierre && !enElCierre && (
          <Text size="xs" c="dimmed" p="sm" data-testid="nota-acumulado">
            {anioPasado} se muestra AL MISMO DÍA ({diaCorte}/{mesCorte}) y va sumándose hasta el cierre. Niños sale de la lista de boletos por fecha de pago (puede ser un mínimo si hay niños reservados que todavía no pagan nada); Adultos es lo que falta para completar el Total real de esa fecha, así el desglose siempre cuadra exacto.
          </Text>
        )}
        {!cierre && (
          <Text size="xs" c="dimmed" p="sm">
            Todavía no hay datos de {anioPasado}: aparecerán aquí cuando se carguen.
          </Text>
        )}
        {cierre && enElCierre && (prev.adultos === null || prev.ninos === null) && (
          <Text size="xs" c="dimmed" p="sm">
            Los adultos y niños de {anioPasado} no están en el Excel; se capturan en “Resumen detallado” (lápiz de “Contra el cierre de {anioPasado}”).
          </Text>
        )}

        <Text fw={700} size="sm" px="md" pt="sm" pb={4}>
          BOLETOS POR TIPO DE PRECIO
        </Text>
        <Table verticalSpacing={5} horizontalSpacing="md" fz="sm" withColumnBorders data-testid="tabla-tipo-precio">
          <Table.Thead>
            <Table.Tr>
              <Table.Th />
              <Table.Th style={NUM}>Preventa</Table.Th>
              <Table.Th style={NUM}>Normal</Table.Th>
              <Table.Th style={NUM}>Cortesía (sin costo)</Table.Th>
              <Table.Th style={NUM}>Total</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td>Adultos</Table.Td>
              <Table.Td style={NUM}>{entero(data.preventa.adultos.cantidad)}</Table.Td>
              <Table.Td style={NUM}>{entero(data.normal.adultos.cantidad)}</Table.Td>
              <Table.Td style={NUM} c="dimmed">—</Table.Td>
              <Table.Td style={NUM} fw={600}>{entero(data.preventa.adultos.cantidad + data.normal.adultos.cantidad)}</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Niños</Table.Td>
              <Table.Td style={NUM}>{entero(data.preventa.ninos.cantidad)}</Table.Td>
              <Table.Td style={NUM}>{entero(data.normal.ninos.cantidad)}</Table.Td>
              <Table.Td style={NUM} c="dimmed">—</Table.Td>
              <Table.Td style={NUM} fw={600}>{entero(data.preventa.ninos.cantidad + data.normal.ninos.cantidad)}</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Cortesías</Table.Td>
              <Table.Td style={NUM} c="dimmed">—</Table.Td>
              <Table.Td style={NUM} c="dimmed">—</Table.Td>
              <Table.Td style={NUM}>{entero(data.cortesias_tarifa.cantidad)}</Table.Td>
              <Table.Td style={NUM} fw={600}>{entero(data.cortesias_tarifa.cantidad)}</Table.Td>
            </Table.Tr>
            <Table.Tr style={{ background: 'var(--mantine-color-violet-light)' }}>
              <Table.Td fw={700}>TOTAL</Table.Td>
              <Table.Td style={NUM} fw={700}>{entero(data.preventa.adultos.cantidad + data.preventa.ninos.cantidad)}</Table.Td>
              <Table.Td style={NUM} fw={700}>{entero(data.normal.adultos.cantidad + data.normal.ninos.cantidad)}</Table.Td>
              <Table.Td style={NUM} fw={700}>{entero(data.cortesias_tarifa.cantidad)}</Table.Td>
              <Table.Td style={NUM} fw={700}>
                {entero(
                  data.preventa.adultos.cantidad + data.preventa.ninos.cantidad + data.normal.adultos.cantidad + data.normal.ninos.cantidad + data.cortesias_tarifa.cantidad,
                )}
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>

        <Group justify="space-between" p="sm" style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}>
          <Text size="sm" fw={600}>
            Capacidad total del salón
          </Text>
          <Text size="sm" fw={700} style={NUM}>
            {entero(data.capacidad_total)}
          </Text>
        </Group>
        <Group justify="space-between" px="sm" pb="sm">
          <Text size="sm" fw={600}>
            Lugares todavía libres
          </Text>
          <Text size="sm" fw={700} style={NUM}>
            {entero(Math.max(data.capacidad_total - reservas.total, 0))}
          </Text>
        </Group>
      </Paper>

      <Paper withBorder radius="md" p="md" style={{ gridColumn: 'span 2' }}>
        <Text fw={700} ta="center" mb="xs">
          Reservas
        </Text>
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <BarChart data={grafica} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="nombre" tickLine={false} fontSize={12} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} width={36} />
              <Tooltip />
              <Legend />
              <Bar dataKey="actual" name={`${anioActual}`} fill="#7048e8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="anterior" name={`${anioPasado}`} fill="#adb5bd" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Paper>
    </SimpleGrid>
    <DiaADia filasHist={filas} anioPasado={anioPasado} anioActual={anioActual} />
    </Stack>
  );
}

/** Reservas de UN día (no acumuladas) este año contra el mismo día del año pasado. */
function DiaADia({
  filasHist,
  anioPasado,
  anioActual,
}: {
  filasHist: FiestaHistoricoFila[];
  anioPasado: number;
  anioActual: number;
}) {
  const { data: cobros } = useFiestaCobros();
  const { data: pagosHist } = useFiestaHistoricoPagos(anioPasado);
  const hayNinosHist = pagosHist?.tipos.nino.disponible ?? false;
  const hayAdultosHist = pagosHist?.tipos.adulto.disponible ?? false;

  const filas = useMemo(() => {
    if (!cobros) return [];
    const hoy = hoyISO();
    const dias = cobros.dias.filter((d) => d.fecha <= hoy);
    const ninosHist = new Map((pagosHist?.dias ?? []).map((x) => [x.fecha, x.nino]));
    const primeraLista = (pagosHist?.dias ?? []).map((x) => x.fecha).sort()[0] ?? null;
    const adultosHist = new Map((pagosHist?.dias ?? []).map((x) => [x.fecha, x.adulto]));
    return dias.map((d, i) => {
      const previo = i > 0 ? dias[i - 1].reservas : null;
      const [, mes, dia] = d.fecha.split('-');
      const antes = variacionDiariaHistorico(filasHist, d.fecha, anioPasado);
      const fAnt = filasHist.find((f) => f.fecha === `${anioPasado}-${mes}-${dia}`);
      // Niños de la edición anterior ese mismo día (lista de boletos con fecha y monto): 0 si ese día no hubo pagos.
      const nHist = ninosHist.get(`${anioPasado}-${mes}-${dia}`);
      // Antes de la primera fecha de las listas de 2025 no hay dato (no es "0 vendidos").
      const enListas = primeraLista !== null && `${anioPasado}-${mes}-${dia}` >= primeraLista;
      return {
        antesAdultos: hayAdultosHist && enListas ? (adultosHist.get(`${anioPasado}-${mes}-${dia}`)?.reservados ?? 0) : null,
        antesNinos: hayNinosHist && enListas ? (nHist?.reservados ?? 0) : null,
        cobradoNinosAntes: hayNinosHist && enListas ? (nHist?.cobrado ?? 0) : null,
        cobradoNinos: d.cobrado_por_tipo?.nino ?? 0,
        fecha: d.fecha,
        etiqueta: `${dia}/${mes}`,
        reservadas: d.reservas.reservados - (previo?.reservados ?? 0),
        pagadas: d.reservas.pagadas - (previo?.pagadas ?? 0),
        // Desglose del día por tipo de boleto (acumulado del día − acumulado del día anterior)
        adultos: d.reservas.tipos.adulto - (previo?.tipos.adulto ?? 0),
        ninos: d.reservas.tipos.nino - (previo?.tipos.nino ?? 0),
        cortesias: d.reservas.tipos.cortesia - (previo?.tipos.cortesia ?? 0),
        antesCortesias: antes ? antes.cortesias : null,
        antesReservadas: antes ? antes.reservados : null,
        antesPagadas: antes ? antes.pagados : null,
        acumActual: d.reservas.reservados,
        acumAntes: fAnt ? fAnt.reservados : null,
      };
    });
  }, [cobros, filasHist, anioPasado, pagosHist, hayNinosHist, hayAdultosHist]);

  if (filasHist.length === 0 || !cobros) return null;

  const grafica = filas.filter((f) => f.antesReservadas !== null).map((f) => ({ dia: f.etiqueta, actual: f.reservadas, anterior: f.antesReservadas }));
  if (grafica.length === 0) return null; // sin días comparables con el año pasado no se muestra nada

  return (
    <Paper withBorder radius="md" p="md">
      <Text fw={700}>Reservas por día · {anioActual} contra {anioPasado}</Text>
      <Text size="xs" c="dimmed" mb="sm">
        Sillas reservadas SOLO ese día (no el acumulado), únicamente en los días en que {anioPasado} tiene captura. El detalle por tipo de boleto y el dinero está en Cobros → Día a día.
      </Text>



      {grafica.length > 0 && (
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={grafica} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="dia" tickLine={false} fontSize={12} interval="preserveStartEnd" minTickGap={20} />
              <YAxis tickLine={false} axisLine={false} fontSize={12} width={36} />
              <Tooltip />
              <Legend />
              <Bar dataKey="actual" name={`${anioActual}`} fill="#7048e8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="anterior" name={`${anioPasado}`} fill="#adb5bd" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

    </Paper>
  );
}

function Separador() {
  return (
    <Table.Tr>
      <Table.Td colSpan={7} p={2} style={{ background: 'var(--mantine-color-gray-1)' }} />
    </Table.Tr>
  );
}

/** Una fila de la hoja: concepto, valor de este año, % del subtotal, valor del año pasado, variación y %. */
function Fila({
  etiqueta,
  extra,
  actual,
  anterior,
  compartido,
  tituloPct,
  negrita,
  total,
}: {
  etiqueta: string;
  extra?: ReactNode;
  actual: number;
  anterior: number | null;
  compartido?: number;
  tituloPct?: string;
  negrita?: boolean;
  total?: boolean;
}) {
  const variacion = anterior === null ? null : actual - anterior;
  const pct = anterior !== null && anterior > 0 && variacion !== null ? variacion / anterior : null;
  const color = variacion === null ? 'dimmed' : variacion > 0 ? 'green' : variacion < 0 ? 'red' : undefined;
  return (
    <Table.Tr style={total ? { background: 'var(--mantine-color-violet-light)' } : undefined}>
      <Table.Td fw={negrita ? 700 : 500} style={{ whiteSpace: 'nowrap' }}>
        {etiqueta}
      </Table.Td>
      <Table.Td style={{ ...NUM, whiteSpace: 'nowrap' }} c="dimmed">
        {extra ?? ''}
      </Table.Td>
      <Table.Td style={NUM} fw={negrita ? 700 : undefined}>
        {entero(actual)}
      </Table.Td>
      <Table.Td style={NUM} c="dimmed" title={tituloPct}>
        {compartido === undefined ? '' : porcentaje(compartido * 100)}
      </Table.Td>
      <Table.Td style={NUM} fw={negrita ? 700 : undefined}>
        {anterior === null ? '—' : entero(anterior)}
      </Table.Td>
      <Table.Td style={NUM} c={color} fw={600}>
        {variacion === null ? '—' : `${variacion > 0 ? '+' : ''}${entero(variacion)}`}
      </Table.Td>
      <Table.Td style={NUM} c={color}>
        {aPct(pct)}
      </Table.Td>
    </Table.Tr>
  );
}

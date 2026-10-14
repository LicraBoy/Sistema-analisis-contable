/**
 * ResumenIngeniero — la hoja "Resumen" del Excel tal como es, para quien solo necesita ver el comparativo:
 * COMPARATIVO este año contra el año pasado (adultos, niños, cortesías, total; pagadas, anticipos, sin anticipo),
 * preventa / normal, capacidad total y la gráfica "Reservas". El año pasado sale del cierre de esa edición.
 */

import { Group, Paper, SimpleGrid, Table, Text } from '@mantine/core';
import type { CSSProperties, ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { useFiestaHistorico, type FiestaHistoricoFila, type FiestaResumen } from '../../api/fiestaHooks';
import { entero, fechaCorta, porcentaje } from './fiestaUtils';

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
  const subtotalPago = estado.pagadas + estado.anticipos + sinAnticipoActual;

  // Año pasado (columna I del Excel); "null" = sin dato todavía.
  const prev = {
    adultos: cierre?.adultos ?? null,
    ninos: cierre?.ninos ?? null,
    cortesias: cierre ? cierre.cortesias : null,
    // Como en la hoja (TOTAL = adultos + niños + cortesías); sin el desglose, el total de reservados del cierre.
    total:
      cierre && cierre.adultos !== null && cierre.ninos !== null ? cierre.adultos + cierre.ninos + cierre.cortesias : cierre ? cierre.reservados : null,
    pagadas: cierre ? cierre.pagados : null,
    anticipos: cierre ? cierre.anticipos : null,
    sinAntic: cierre ? cierre.sin_anticipo + cierre.cortesias : null,
    subtotal: cierre ? cierre.pagados + cierre.anticipos + cierre.sin_anticipo + cierre.cortesias : null,
  };

  const grafica = [
    { nombre: 'ADULTOS', actual: reservas.adultos, anterior: prev.adultos },
    { nombre: 'NIÑOS', actual: reservas.ninos, anterior: prev.ninos },
    { nombre: 'CORTESÍAS', actual: reservas.cortesias, anterior: prev.cortesias },
  ];

  return (
    <SimpleGrid cols={{ base: 1, lg: 5 }} spacing="lg">
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
                <Table.Th style={{ ...NUM, color: '#fff' }}>{anioPasado}</Table.Th>
                <Table.Th style={{ ...NUM, color: '#fff' }}>Variación</Table.Th>
                <Table.Th style={{ ...NUM, color: '#fff' }}>%</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {/* RESERVAS AL: fecha · total */}
              <Fila etiqueta="RESERVAS AL:" extra={fechaCorta(fechaCorte)} actual={reservas.total} anterior={prev.total} negrita />
              <Separador />

              <Fila etiqueta="ADULTOS" actual={reservas.adultos} anterior={prev.adultos} />
              <Fila etiqueta="+NIÑOS" actual={reservas.ninos} anterior={prev.ninos} />
              <Fila etiqueta="+CORTESIAS" actual={reservas.cortesias} anterior={prev.cortesias} />
              <Fila etiqueta="TOTAL" actual={reservas.total} anterior={prev.total} negrita total />
              <Separador />

              <Fila etiqueta="R.PAGADAS" actual={estado.pagadas} anterior={prev.pagadas} compartido={estado.pagadas / (subtotalPago || 1)} />
              <Fila etiqueta="+ANTICIPOS" actual={estado.anticipos} anterior={prev.anticipos} compartido={estado.anticipos / (subtotalPago || 1)} />
              <Fila etiqueta="+R.SIN ANTIC" actual={sinAnticipoActual} anterior={prev.sinAntic} compartido={sinAnticipoActual / (subtotalPago || 1)} />
              <Fila etiqueta="SUBTOTAL" actual={subtotalPago} anterior={prev.subtotal} negrita total compartido={subtotalPago > 0 ? 1 : 0} />
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>

        {!cierre && (
          <Text size="xs" c="dimmed" p="sm">
            Todavía no hay datos de {anioPasado}: aparecerán aquí cuando se carguen.
          </Text>
        )}
        {cierre && (prev.adultos === null || prev.ninos === null) && (
          <Text size="xs" c="dimmed" p="sm">
            Los adultos y niños de {anioPasado} no están en el Excel; se capturan en “Resumen detallado” (lápiz de “Contra el cierre de {anioPasado}”).
          </Text>
        )}

        <Table verticalSpacing={5} horizontalSpacing="md" fz="sm" withColumnBorders style={{ borderTop: '2px solid var(--mantine-color-gray-4)' }}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th />
              <Table.Th style={NUM}>PREVENTA</Table.Th>
              <Table.Th style={NUM}>NORMAL</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td fw={700}>SUBTOTAL</Table.Td>
              <Table.Td style={NUM} fw={700}>{entero(data.preventa.adultos.cantidad + data.preventa.ninos.cantidad)}</Table.Td>
              <Table.Td style={NUM} fw={700}>{entero(data.normal.adultos.cantidad + data.normal.ninos.cantidad)}</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>ADULTOS</Table.Td>
              <Table.Td style={NUM}>{entero(data.preventa.adultos.cantidad)}</Table.Td>
              <Table.Td style={NUM}>{entero(data.normal.adultos.cantidad)}</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>+NIÑOS</Table.Td>
              <Table.Td style={NUM}>{entero(data.preventa.ninos.cantidad)}</Table.Td>
              <Table.Td style={NUM}>{entero(data.normal.ninos.cantidad)}</Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>

        <Group justify="space-between" p="sm" style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}>
          <Text size="sm" fw={600}>
            CAPACIDAD TOTAL EN GRÁFICO
          </Text>
          <Text size="sm" fw={700} style={NUM}>
            {entero(data.capacidad_total)}
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
  negrita,
  total,
}: {
  etiqueta: string;
  extra?: ReactNode;
  actual: number;
  anterior: number | null;
  compartido?: number;
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
      <Table.Td style={NUM} c="dimmed">
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

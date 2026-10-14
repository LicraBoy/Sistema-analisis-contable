/**
 * PagosRecepcionPage — gastos que hace un huésped durante su estancia.
 * Módulo independiente (como Facturación): extrae columnas fijas del Excel
 * subido y calcula, por cuenta, sus montos (Tabla 1/Tabla 2); concilia
 * contra el archivo de Movimiento para llenar la forma de pago; y acumula
 * los resultados ya conciliados de cada día en "Pagos del Mes".
 */

import { Accordion, ActionIcon, Alert, Badge, Button, Card, Collapse, Group, Modal, NumberInput, ScrollArea, Select, SimpleGrid, Stack, Table, Text, TextInput, ThemeIcon, Title, Tooltip, UnstyledButton } from '@mantine/core';
import { Calendar, DateInput, MonthPickerInput } from '@mantine/dates';
import { Dropzone, MS_EXCEL_MIME_TYPE } from '@mantine/dropzone';
import { notifications } from '@mantine/notifications';
import {
  IconArrowLeft,
  IconBellRinging,
  IconCalendarStats,
  IconChartLine,
  IconChevronDown,
  IconChevronUp,
  IconDownload,
  IconFileSpreadsheet,
  IconFileUpload,
  IconInfoCircle,
  IconRefreshAlert,
  IconTrash,
  IconUpload,
  IconUserDollar,
  IconX,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { SemanticBadge } from '../components/ui/SemanticBadge';
import { SEMANTIC_COLORS } from '../theme/tokens';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  useActualizarPagoRecepcionDia,
  useAgregarFilaManualPagosDelMes,
  useAnaliticaPagosRecepcion,
  useConciliarFormaPago,
  useActualizarCapturaSaldoCuentaHuesped,
  useDiasPagosDelMes,
  useEliminarFilaPagosDelMes,
  useEliminarSaldoCuentaHuesped,
  useExportarSaldoCuentaHuesped,
  useSaldoCuentaHuesped,
  useUploadSaldoCuentaHuesped,
  useEliminarDiaPagosDelMes,
  useExportarPagosDelMes,
  useGuardarPagosDelMes,
  useObtenerPagosDelMes,
  useUploadMovimientoPagosRecepcion,
  useUploadMovimientosPeriodoPagosRecepcion,
  useUploadPagosRecepcion,
  type BloquePagosRecepcion,
  type CamposEditablesPagosDelMes,
  type ConciliarFormaPagoResponse,
  type NoConciliadoPagosRecepcion,
  type FilaPagosDelMes,
  type FilaTabla1PagosRecepcion,
  type FilaTabla2PagosRecepcion,
  type SerieDiariaPagosRecepcion,
  type UploadMovimientoPagosRecepcionResponse,
  type UploadMovimientosPeriodoPagosRecepcionResponse,
  type UploadPagosRecepcionResponse,
} from '../api/hooks';

const formatoMoneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

function fechaAIso(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

function isoAFecha(texto: string): Date | null {
  return texto ? new Date(`${texto}T00:00:00`) : null;
}

/**
 * true si "Totales" (forma de pago) no cuadra con "Total" (monto real de
 * la cuenta) — no se rechaza nada automáticamente en la conciliación (una
 * habitación puede tener varios pagos legítimos que exceden su Total, ej.
 * estadías largas), así que esto es solo una alerta visual para que el
 * usuario revise/corrija a mano si hace falta.
 */
function noCuadra(fila: { totales: number; total: number }): boolean {
  return Math.abs(fila.totales - fila.total) > 0.05;
}

function ArchivoDropzone({
  archivo,
  onArchivo,
  texto,
}: {
  archivo: File | null;
  onArchivo: (file: File | null) => void;
  texto: string;
}) {
  if (archivo) {
    return (
      <Group justify="space-between" p="xs" style={{ border: '1px solid var(--mantine-color-gray-4)', borderRadius: 8 }}>
        <Group gap="xs">
          <IconFileSpreadsheet size={18} />
          <Text size="sm">{archivo.name}</Text>
        </Group>
        <Button variant="subtle" color="red" size="compact-xs" onClick={() => onArchivo(null)}>
          Quitar
        </Button>
      </Group>
    );
  }

  return (
    <Dropzone accept={MS_EXCEL_MIME_TYPE} onDrop={(files) => onArchivo(files[0] ?? null)} maxFiles={1}>
      <Group justify="center" gap="md" mih={70} style={{ pointerEvents: 'none' }}>
        <Dropzone.Accept>
          <IconUpload size={28} />
        </Dropzone.Accept>
        <Dropzone.Reject>
          <IconX size={28} />
        </Dropzone.Reject>
        <Dropzone.Idle>
          <IconFileSpreadsheet size={28} />
        </Dropzone.Idle>
        <Text size="sm" c="dimmed">
          {texto}
        </Text>
      </Group>
    </Dropzone>
  );
}

function TablaBloque({ columnas, bloque }: { columnas: string[]; bloque: BloquePagosRecepcion }) {
  return (
    <ScrollArea>
      <Table striped highlightOnHover withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            {columnas.map((columna) => (
              <Table.Th key={columna}>{columna}</Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {bloque.filas.map((fila, idx) => (
            <Table.Tr key={idx}>
              {columnas.map((columna) => (
                <Table.Td key={columna}>{fila[columna] ?? ''}</Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  );
}

function TablaCalculos({ filas }: { filas: FilaTabla1PagosRecepcion[] }) {
  return (
    <Stack gap="sm">
      <Text fw={600} size="sm" tt="uppercase" c="dimmed">
        Cálculos por cuenta
      </Text>
      <ScrollArea>
        <Table striped highlightOnHover withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Cuenta</Table.Th>
              <Table.Th>SUBTOTAL1</Table.Th>
              <Table.Th>IVA 16%</Table.Th>
              <Table.Th>ISH 3%</Table.Th>
              <Table.Th>SUBTOTAL2</Table.Th>
              <Table.Th>GRAVADO</Table.Th>
              <Table.Th>TASA 0%</Table.Th>
              <Table.Th>PROPINA</Table.Th>
              <Table.Th>TOTAL</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filas.map((fila) => (
              <Table.Tr key={fila.consecutivo}>
                <Table.Td>{fila.consecutivo}</Table.Td>
                <Table.Td>{formatoMoneda.format(fila.subtotal1)}</Table.Td>
                <Table.Td>{formatoMoneda.format(fila.iva16)}</Table.Td>
                <Table.Td>{formatoMoneda.format(fila.ish3)}</Table.Td>
                <Table.Td>{formatoMoneda.format(fila.subtotal2)}</Table.Td>
                <Table.Td>{formatoMoneda.format(fila.gravado)}</Table.Td>
                <Table.Td>{formatoMoneda.format(fila.tasa0)}</Table.Td>
                <Table.Td>{formatoMoneda.format(fila.propina)}</Table.Td>
                <Table.Td>{formatoMoneda.format(fila.total)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Stack>
  );
}

function TablaCuentas({ filas }: { filas: FilaTabla2PagosRecepcion[] }) {
  return (
    <Stack gap="sm">
      <Text fw={600} size="sm" tt="uppercase" c="dimmed">
        Cuentas por huésped
      </Text>
      <ScrollArea>
        <Table striped highlightOnHover withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Cuenta</Table.Th>
              <Table.Th>Hab.</Table.Th>
              <Table.Th>Huésped</Table.Th>
              <Table.Th>Fecha Emisión</Table.Th>
              <Table.Th>Efectivo</Table.Th>
              <Table.Th>Amex</Table.Th>
              <Table.Th>Visa</Table.Th>
              <Table.Th>M.Card</Table.Th>
              <Table.Th>Crédito</Table.Th>
              <Table.Th>Totales</Table.Th>
              <Table.Th>SUBTOTAL1</Table.Th>
              <Table.Th>IVA 16%</Table.Th>
              <Table.Th>ISH 3%</Table.Th>
              <Table.Th>SUBTOTAL2</Table.Th>
              <Table.Th>GRAVADO</Table.Th>
              <Table.Th>TASA 0%</Table.Th>
              <Table.Th>PROPINA</Table.Th>
              <Table.Th>TOTAL</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filas.map((fila) => (
              <Table.Tr key={fila.cuenta} bg={noCuadra(fila) ? 'red.0' : undefined}>
                <Table.Td>{fila.cuenta}</Table.Td>
                <Table.Td>{fila.habitacion ?? ''}</Table.Td>
                <Table.Td>{fila.huesped ?? ''}</Table.Td>
                <Table.Td>{fila.fecha_emision ?? ''}</Table.Td>
                <Table.Td>{formatoMoneda.format(fila.efectivo)}</Table.Td>
                <Table.Td>{formatoMoneda.format(fila.amex)}</Table.Td>
                <Table.Td>{formatoMoneda.format(fila.visa)}</Table.Td>
                <Table.Td>{formatoMoneda.format(fila.mcard)}</Table.Td>
                <Table.Td>{formatoMoneda.format(fila.credito)}</Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    {formatoMoneda.format(fila.totales)}
                    {noCuadra(fila) && <SemanticBadge status="error" label="no cuadra" size="xs" />}
                  </Group>
                </Table.Td>
                <Table.Td>{formatoMoneda.format(fila.subtotal1)}</Table.Td>
                <Table.Td>{formatoMoneda.format(fila.iva16)}</Table.Td>
                <Table.Td>{formatoMoneda.format(fila.ish3)}</Table.Td>
                <Table.Td>{formatoMoneda.format(fila.subtotal2)}</Table.Td>
                <Table.Td>{formatoMoneda.format(fila.gravado)}</Table.Td>
                <Table.Td>{formatoMoneda.format(fila.tasa0)}</Table.Td>
                <Table.Td>{formatoMoneda.format(fila.propina)}</Table.Td>
                <Table.Td>{formatoMoneda.format(fila.total)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Stack>
  );
}

function TablaMovimientoVistaPrevia({ resultado }: { resultado: UploadMovimientoPagosRecepcionResponse }) {
  return (
    <Stack gap="sm">
      <Group gap="xs">
        <Text fw={600} size="sm" tt="uppercase" c="dimmed">
          Vista previa
        </Text>
        <Badge variant="light">{resultado.total} fila(s)</Badge>
      </Group>
      <ScrollArea>
        <Table striped highlightOnHover withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              {resultado.columnas.map((columna) => (
                <Table.Th key={columna}>{columna}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {resultado.filas.map((fila, idx) => (
              <Table.Tr key={idx}>
                {resultado.columnas.map((columna) => (
                  <Table.Td key={columna}>{fila[columna] ?? ''}</Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Stack>
  );
}

function ResumenConciliacion({
  resultado,
  onAgregarNoConciliado,
  agregandoFilaManual,
}: {
  resultado: ConciliarFormaPagoResponse;
  onAgregarNoConciliado?: (item: NoConciliadoPagosRecepcion, idx: number) => Promise<boolean>;
  agregandoFilaManual?: boolean;
}) {
  const [agregados, setAgregados] = useState<Set<number>>(new Set());
  const cuadra = Math.abs(resultado.diferencia) < 0.01;
  return (
    <Stack gap="sm">
      <Alert
        icon={<IconInfoCircle size={18} />}
        color={cuadra ? SEMANTIC_COLORS.success : SEMANTIC_COLORS.error}
        variant="light"
        title={cuadra ? 'La conciliación cuadra' : 'La conciliación NO cuadra'}
      >
        <Group gap="lg">
          <Text size="sm">Suma Tabla 1: {formatoMoneda.format(resultado.suma_tabla1)}</Text>
          <Text size="sm">Suma Tabla 2: {formatoMoneda.format(resultado.suma_tabla2)}</Text>
          <Text size="sm" fw={600}>
            Diferencia: {formatoMoneda.format(resultado.diferencia)}
          </Text>
        </Group>
      </Alert>

      {resultado.no_conciliados.length > 0 && (
        <Alert icon={<IconInfoCircle size={18} />} color={SEMANTIC_COLORS.warning} variant="light" title="Montos sin conciliar">
          <Stack gap={4}>
            {resultado.no_conciliados.map((item, idx) => (
              <Group key={idx} justify="space-between" gap="sm" wrap="nowrap">
                <Text size="sm">
                  [{item.forma_pago}] Hab. {item.habitacion} — {item.huesped}: {formatoMoneda.format(item.monto)}
                </Text>
                {onAgregarNoConciliado && (
                  agregados.has(idx) ? (
                    <Text size="xs" c="dimmed">
                      Agregado ✓
                    </Text>
                  ) : (
                    <Button
                      size="compact-xs"
                      variant="light"
                      loading={agregandoFilaManual}
                      onClick={async () => {
                        const exito = await onAgregarNoConciliado(item, idx);
                        if (exito) {
                          setAgregados((prev) => new Set(prev).add(idx));
                        }
                      }}
                    >
                      Agregar como fila manual
                    </Button>
                  )
                )}
              </Group>
            ))}
          </Stack>
        </Alert>
      )}

      {resultado.amex_sin_match.length > 0 && (
        <Alert
          icon={<IconInfoCircle size={18} />}
          color={SEMANTIC_COLORS.warning}
          variant="light"
          title="Filas de American Express sin un Crédito correspondiente"
        >
          <Stack gap={4}>
            {resultado.amex_sin_match.map((item, idx) => (
              <Text size="sm" key={idx}>
                Folio {item.folio} — {item.huesped}: {formatoMoneda.format(item.monto)}
              </Text>
            ))}
          </Stack>
        </Alert>
      )}
    </Stack>
  );
}

const BORDE_SEPARADOR = { borderRight: '2px solid var(--mantine-color-gray-5)' };

const CAMPOS_NUMERICOS_PAGOS_DEL_MES = [
  'efectivo',
  'amex',
  'visa',
  'mcard',
  'credito',
  'totales',
  'subtotal1',
  'iva16',
  'ish3',
  'subtotal2',
  'gravado',
  'tasa0',
  'propina',
  'total',
] as const;

const CAMPOS_EDITABLES_PAGOS_DEL_MES = [
  'efectivo',
  'amex',
  'visa',
  'mcard',
  'credito',
  'subtotal1',
  'iva16',
  'ish3',
  'propina',
] as const satisfies readonly (keyof CamposEditablesPagosDelMes)[];

/** Mismas fórmulas que `calcular_metricas_desde_valores` en el backend. */
function recalcularFilaPagosDelMes(
  fila: FilaPagosDelMes,
  edicion: Partial<CamposEditablesPagosDelMes> | undefined,
): FilaPagosDelMes {
  if (!edicion) return fila;
  const valores = { ...fila, ...edicion };
  const totales = valores.efectivo + valores.amex + valores.visa + valores.mcard + valores.credito;
  const subtotal2 = valores.subtotal1 + valores.iva16;
  const gravado = valores.iva16 / 0.16 + valores.iva16;
  const tasa0 = subtotal2 - gravado;
  const total = valores.subtotal1 + valores.iva16 + valores.ish3 + valores.propina;
  return { ...valores, totales, subtotal2, gravado, tasa0, total };
}

function CeldaEditable({
  valor,
  onChange,
}: {
  valor: number;
  onChange: (valor: number) => void;
}) {
  const [texto, setTexto] = useState(String(valor));

  useEffect(() => {
    if (Number(texto) !== valor) {
      setTexto(String(valor));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

  return (
    <TextInput
      value={texto}
      onChange={(e) => {
        const raw = e.currentTarget.value;
        if (!/^-?\d*\.?\d*$/.test(raw)) return;
        setTexto(raw);
        const num = Number(raw);
        onChange(Number.isNaN(num) ? 0 : num);
      }}
      size="xs"
      w={72}
      styles={{ input: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' } }}
    />
  );
}

function TablaPagosDelMes({
  filas,
  ediciones,
  onEditarCelda,
  propinasPorCuenta,
  onEliminarFila,
}: {
  filas: FilaPagosDelMes[];
  ediciones: Record<number, Partial<CamposEditablesPagosDelMes>>;
  onEditarCelda: (id: number, campo: keyof CamposEditablesPagosDelMes, valor: number) => void;
  propinasPorCuenta: Map<number, number>;
  onEliminarFila: (id: number) => void;
}) {
  if (filas.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Todavía no hay días guardados en Pagos del Mes.
      </Text>
    );
  }

  const filasEfectivas = filas.map((fila) => recalcularFilaPagosDelMes(fila, ediciones[fila.id]));

  const handleAutocorregirSubtotal1 = (fila: FilaPagosDelMes) => {
    const propinaFresca = propinasPorCuenta.get(fila.cuenta) ?? fila.propina;
    const nuevoSubtotal1 = fila.totales - fila.iva16 - fila.ish3 - propinaFresca;
    if (propinaFresca !== fila.propina) {
      onEditarCelda(fila.id, 'propina', propinaFresca);
    }
    onEditarCelda(fila.id, 'subtotal1', nuevoSubtotal1);
  };

  const totales = CAMPOS_NUMERICOS_PAGOS_DEL_MES.reduce(
    (acc, campo) => {
      acc[campo] = filasEfectivas.reduce((suma, fila) => suma + fila[campo], 0);
      return acc;
    },
    {} as Record<(typeof CAMPOS_NUMERICOS_PAGOS_DEL_MES)[number], number>,
  );

  return (
    <ScrollArea h={520} type="auto" offsetScrollbars>
      <Table
        striped
        stripedColor="gray.0"
        highlightOnHover
        withTableBorder
        withColumnBorders
        miw={1150}
        fz="xs"
        horizontalSpacing="xs"
        verticalSpacing={6}
        stickyHeader
      >
        <Table.Thead>
          <Table.Tr>
            <Table.Th colSpan={4} ta="center" bg="gray.1" fw={700} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: 0.3 }}>
              Identificación
            </Table.Th>
            <Table.Th colSpan={6} ta="center" bg="blue.1" fw={700} c="blue.9" style={{ ...BORDE_SEPARADOR, textTransform: 'uppercase', letterSpacing: 0.3 }}>
              Forma de Pago
            </Table.Th>
            <Table.Th colSpan={8} ta="center" bg="teal.1" fw={700} c="teal.9" style={{ textTransform: 'uppercase', letterSpacing: 0.3 }}>
              Cálculos
            </Table.Th>
            <Table.Th bg="gray.1" />
          </Table.Tr>
          <Table.Tr>
            <Table.Th bg="gray.0">Fecha</Table.Th>
            <Table.Th bg="gray.0">Cuenta</Table.Th>
            <Table.Th bg="gray.0">Hab.</Table.Th>
            <Table.Th bg="gray.0">Huésped</Table.Th>
            <Table.Th bg="blue.0" ta="right">Efectivo</Table.Th>
            <Table.Th bg="blue.0" ta="right">Amex</Table.Th>
            <Table.Th bg="blue.0" ta="right">Visa</Table.Th>
            <Table.Th bg="blue.0" ta="right">M.Card</Table.Th>
            <Table.Th bg="blue.0" ta="right">Crédito</Table.Th>
            <Table.Th bg="blue.0" ta="right" style={BORDE_SEPARADOR}>Totales</Table.Th>
            <Table.Th bg="teal.0" ta="right">SUBTOTAL1</Table.Th>
            <Table.Th bg="teal.0" ta="right">IVA 16%</Table.Th>
            <Table.Th bg="teal.0" ta="right">ISH 3%</Table.Th>
            <Table.Th bg="teal.0" ta="right">SUBTOTAL2</Table.Th>
            <Table.Th bg="teal.0" ta="right">GRAVADO</Table.Th>
            <Table.Th bg="teal.0" ta="right">TASA 0%</Table.Th>
            <Table.Th bg="teal.0" ta="right">PROPINA</Table.Th>
            <Table.Th bg="teal.0" ta="right">TOTAL</Table.Th>
            <Table.Th bg="gray.0" />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {filasEfectivas.map((fila) => (
            <Table.Tr
              key={fila.id}
              bg={noCuadra(fila) ? 'red.0' : undefined}
              style={noCuadra(fila) ? { boxShadow: 'inset 3px 0 0 var(--mantine-color-red-5)' } : undefined}
            >
              <Table.Td>{fila.fecha}</Table.Td>
              <Table.Td fw={600}>{fila.cuenta}</Table.Td>
              <Table.Td>{fila.habitacion ?? ''}</Table.Td>
              <Table.Td>
                <Group gap={4} wrap="nowrap">
                  {fila.huesped ?? ''}
                  {fila.es_sin_cuenta ? (
                    <Tooltip label="Pago de Movimiento que no amarró con ninguna cuenta de Tabla 2 — revísalo">
                      <Badge size="xs" variant="light" color="orange">
                        sin cuenta
                      </Badge>
                    </Tooltip>
                  ) : fila.es_manual ? (
                    <Badge size="xs" variant="light" color="gray">
                      manual
                    </Badge>
                  ) : null}
                </Group>
              </Table.Td>
              {CAMPOS_EDITABLES_PAGOS_DEL_MES.filter((c) => ['efectivo', 'amex', 'visa', 'mcard', 'credito'].includes(c)).map(
                (campo) => (
                  <Table.Td key={campo} ta="right">
                    <CeldaEditable valor={fila[campo]} onChange={(valor) => onEditarCelda(fila.id, campo, valor)} />
                  </Table.Td>
                ),
              )}
              <Table.Td style={BORDE_SEPARADOR} ta="right">
                <Stack gap={4} align="flex-end">
                  <Group gap={4} wrap="nowrap">
                    <Text fz="xs" fw={600}>
                      {formatoMoneda.format(fila.totales)}
                    </Text>
                    {noCuadra(fila) && <SemanticBadge status="error" label="no cuadra" size="xs" />}
                  </Group>
                  {noCuadra(fila) && (
                    <Button size="compact-xs" variant="light" color="red" onClick={() => handleAutocorregirSubtotal1(fila)}>
                      Autocorregir Subtotal1
                    </Button>
                  )}
                </Stack>
              </Table.Td>
              <Table.Td ta="right">
                <CeldaEditable valor={fila.subtotal1} onChange={(valor) => onEditarCelda(fila.id, 'subtotal1', valor)} />
              </Table.Td>
              <Table.Td ta="right">
                <CeldaEditable valor={fila.iva16} onChange={(valor) => onEditarCelda(fila.id, 'iva16', valor)} />
              </Table.Td>
              <Table.Td ta="right">
                <CeldaEditable valor={fila.ish3} onChange={(valor) => onEditarCelda(fila.id, 'ish3', valor)} />
              </Table.Td>
              <Table.Td ta="right">{formatoMoneda.format(fila.subtotal2)}</Table.Td>
              <Table.Td ta="right">{formatoMoneda.format(fila.gravado)}</Table.Td>
              <Table.Td ta="right">{formatoMoneda.format(fila.tasa0)}</Table.Td>
              <Table.Td ta="right">
                <CeldaEditable valor={fila.propina} onChange={(valor) => onEditarCelda(fila.id, 'propina', valor)} />
              </Table.Td>
              <Table.Td ta="right" fw={600}>{formatoMoneda.format(fila.total)}</Table.Td>
              <Table.Td ta="center">
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size="sm"
                  title="Eliminar fila"
                  onClick={() => onEliminarFila(fila.id)}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
        <Table.Tfoot>
          <Table.Tr fw={700} bg="gray.2" style={{ borderTop: '2px solid var(--mantine-color-gray-6)' }}>
            <Table.Td>Total</Table.Td>
            <Table.Td />
            <Table.Td />
            <Table.Td />
            <Table.Td ta="right">{formatoMoneda.format(totales.efectivo)}</Table.Td>
            <Table.Td ta="right">{formatoMoneda.format(totales.amex)}</Table.Td>
            <Table.Td ta="right">{formatoMoneda.format(totales.visa)}</Table.Td>
            <Table.Td ta="right">{formatoMoneda.format(totales.mcard)}</Table.Td>
            <Table.Td ta="right">{formatoMoneda.format(totales.credito)}</Table.Td>
            <Table.Td style={BORDE_SEPARADOR} ta="right">{formatoMoneda.format(totales.totales)}</Table.Td>
            <Table.Td ta="right">{formatoMoneda.format(totales.subtotal1)}</Table.Td>
            <Table.Td ta="right">{formatoMoneda.format(totales.iva16)}</Table.Td>
            <Table.Td ta="right">{formatoMoneda.format(totales.ish3)}</Table.Td>
            <Table.Td ta="right">{formatoMoneda.format(totales.subtotal2)}</Table.Td>
            <Table.Td ta="right">{formatoMoneda.format(totales.gravado)}</Table.Td>
            <Table.Td ta="right">{formatoMoneda.format(totales.tasa0)}</Table.Td>
            <Table.Td ta="right">{formatoMoneda.format(totales.propina)}</Table.Td>
            <Table.Td ta="right">{formatoMoneda.format(totales.total)}</Table.Td>
            <Table.Td />
          </Table.Tr>
        </Table.Tfoot>
      </Table>
    </ScrollArea>
  );
}

function VistaBloques({ resultado }: { resultado: UploadPagosRecepcionResponse }) {
  return (
    <Accordion variant="separated">
      <Accordion.Item value="depuracion">
        <Accordion.Control>
          <Group gap="xs">
            <Text fw={500} size="sm">
              Detalle técnico (depuración)
            </Text>
            <Badge variant="light" size="sm">
              {resultado.total_bloques} bloque(s)
            </Badge>
            <Badge variant="light" color="gray" size="sm">
              {resultado.total_filas} fila(s)
            </Badge>
          </Group>
        </Accordion.Control>
        <Accordion.Panel>
          <Accordion variant="separated" multiple>
            {resultado.bloques.map((bloque) => (
              <Accordion.Item key={bloque.consecutivo} value={String(bloque.consecutivo)}>
                <Accordion.Control>
                  <Group gap="xs">
                    <Text fw={500} size="sm">
                      Folio {bloque.consecutivo}
                    </Text>
                    <Badge size="sm" variant="light" color="gray">
                      {bloque.filas.length} fila(s)
                    </Badge>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <TablaBloque columnas={resultado.columnas} bloque={bloque} />
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}

function TarjetaKpi({ titulo, valor, color }: { titulo: string; valor: string; color?: string }) {
  return (
    <Card withBorder padding="md">
      <Stack gap={4}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          {titulo}
        </Text>
        <Text size="xl" fw={700} c={color}>
          {valor}
        </Text>
      </Stack>
    </Card>
  );
}

const COLOR_FORMA_PAGO: Record<string, string> = {
  efectivo: 'var(--mantine-color-green-7)',
  amex: 'var(--mantine-color-blue-8)',
  visa: 'var(--mantine-color-orange-8)',
  mcard: 'var(--mantine-color-grape-8)',
  credito: 'var(--mantine-color-yellow-7)',
};

const FORMAS_PAGO_ANALITICA = ['efectivo', 'amex', 'visa', 'mcard', 'credito'] as const;

function resumenMensualDe(dias: SerieDiariaPagosRecepcion[]) {
  const total = dias.reduce((acc, d) => acc + d.total, 0);
  const propinaTotal = dias.reduce((acc, d) => acc + d.propina, 0);
  const distribucion = Object.fromEntries(
    FORMAS_PAGO_ANALITICA.map((forma) => [forma, dias.reduce((acc, d) => acc + d[forma], 0)]),
  ) as Record<(typeof FORMAS_PAGO_ANALITICA)[number], number>;
  return {
    dias: dias.length,
    total,
    promedioDiario: dias.length ? total / dias.length : 0,
    propinaTotal,
    distribucion,
  };
}

function etiquetaMes(mes: string) {
  const [anio, mesNum] = mes.split('-').map(Number);
  const fecha = new Date(anio, mesNum - 1, 1);
  const etiqueta = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(fecha);
  return etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1);
}

/**
 * Días del 1 hasta el último día del mes (o hasta hoy, si es el mes en
 * curso) que no tienen ningún registro en `fechasConDatos`. No distingue
 * "no hubo pagos ese día" de "faltó procesarlo" — solo señala el hueco.
 */
function diasFaltantesDelMes(mes: string, fechasConDatos: Set<string>): number[] {
  const [anio, mesNum] = mes.split('-').map(Number);
  const hoy = new Date();
  const esMesActual = mes === hoy.toISOString().slice(0, 7);
  const ultimoDia = esMesActual ? hoy.getDate() : new Date(anio, mesNum, 0).getDate();
  const faltantes: number[] = [];
  for (let dia = 1; dia <= ultimoDia; dia++) {
    const iso = `${mes}-${String(dia).padStart(2, '0')}`;
    if (!fechasConDatos.has(iso)) faltantes.push(dia);
  }
  return faltantes;
}

function PanelAnalitica() {
  const analitica = useAnaliticaPagosRecepcion();
  const serie = analitica.data?.serie_diaria ?? [];
  const kpis = analitica.data?.kpis;

  const mesActual = new Date().toISOString().slice(0, 7);
  const [mesSeleccionado, setMesSeleccionado] = useState(mesActual);

  if (analitica.isLoading) {
    return <Text size="sm" c="dimmed">Cargando analítica...</Text>;
  }

  if (!kpis || kpis.dias_registrados === 0) {
    return (
      <Alert icon={<IconInfoCircle size={18} />} color={SEMANTIC_COLORS.info}>
        Aún no hay días guardados en Pagos del Mes — la analítica aparecerá aquí conforme se vaya guardando el
        resultado de cada día conciliado.
      </Alert>
    );
  }

  const mesesConDatos = Array.from(new Set(serie.map((d) => d.fecha.slice(0, 7))));
  const mesesDisponibles = Array.from(new Set([mesActual, ...mesesConDatos])).sort().reverse();

  const diasDelMes = serie.filter((dia) => dia.fecha.slice(0, 7) === mesSeleccionado);
  const resumenMes = resumenMensualDe(diasDelMes);
  const totalDistribucionMes = Object.values(resumenMes.distribucion).reduce((acc, v) => acc + v, 0);
  const diasFaltantes = diasFaltantesDelMes(mesSeleccionado, new Set(diasDelMes.map((d) => d.fecha)));
  const cuentasPendientes = analitica.data?.cuentas_pendientes ?? [];

  const totalesPorMes = mesesConDatos
    .sort()
    .map((mes) => ({
      mes: etiquetaMes(mes),
      total: serie.filter((d) => d.fecha.slice(0, 7) === mes).reduce((acc, d) => acc + d.total, 0),
    }));

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Text size="sm" c="dimmed">
          Histórico completo: {formatoMoneda.format(kpis.total_historico)} en {kpis.dias_registrados} día(s)
          guardado(s)
        </Text>
        <Select
          label="Mes"
          value={mesSeleccionado}
          onChange={(valor) => valor && setMesSeleccionado(valor)}
          data={mesesDisponibles.map((mes) => ({ value: mes, label: etiquetaMes(mes) }))}
          w={220}
          allowDeselect={false}
        />
      </Group>

      {diasDelMes.length === 0 ? (
        <Alert icon={<IconInfoCircle size={18} />} color={SEMANTIC_COLORS.info}>
          Aún no hay días guardados para {etiquetaMes(mesSeleccionado)} — se irán agregando conforme guardes cada
          día en "Pagos del Mes".
        </Alert>
      ) : (
        <>
          {diasFaltantes.length > 0 && (
            <Group gap={6} wrap="nowrap" title="Puede ser que ese día no hubo pagos, o que falte procesarlo">
              <IconInfoCircle size={14} color="var(--mantine-color-orange-6)" style={{ flexShrink: 0 }} />
              <Text size="xs" c="dimmed">
                Sin datos en {etiquetaMes(mesSeleccionado)}: día(s) {diasFaltantes.join(', ')}
              </Text>
            </Group>
          )}
          {resumenMes.dias < 3 && (
            <Alert icon={<IconInfoCircle size={18} />} color={SEMANTIC_COLORS.info} variant="light">
              Aún hay poco historial en {etiquetaMes(mesSeleccionado)} ({resumenMes.dias} día(s) guardado(s)) — las
              tendencias serán más claras conforme avance el mes.
            </Alert>
          )}

          <SimpleGrid cols={{ base: 2, sm: 4 }}>
            <TarjetaKpi titulo={`Total ${etiquetaMes(mesSeleccionado)}`} valor={formatoMoneda.format(resumenMes.total)} />
            <TarjetaKpi titulo="Días guardados" valor={String(resumenMes.dias)} />
            <TarjetaKpi titulo="Promedio diario" valor={formatoMoneda.format(resumenMes.promedioDiario)} />
            <TarjetaKpi
              titulo="Propina del mes"
              valor={formatoMoneda.format(resumenMes.propinaTotal)}
              color={SEMANTIC_COLORS.success}
            />
          </SimpleGrid>

          <Card withBorder padding="lg">
            <Stack gap="sm">
              <Text fw={600} size="sm" tt="uppercase" c="dimmed">
                Tendencia diaria (Total) — {etiquetaMes(mesSeleccionado)}
              </Text>
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <LineChart data={diasDelMes}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="fecha" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} width={80} tickFormatter={(v) => formatoMoneda.format(v)} />
                    <RechartsTooltip formatter={(value) => formatoMoneda.format(Number(value))} />
                    <Line type="monotone" dataKey="total" name="Total" stroke="var(--mantine-color-blue-8)" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Stack>
          </Card>

          <Card withBorder padding="lg">
            <Stack gap="sm">
              <Text fw={600} size="sm" tt="uppercase" c="dimmed">
                Desglose por forma de pago (por día) — {etiquetaMes(mesSeleccionado)}
              </Text>
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <BarChart data={diasDelMes}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="fecha" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} width={80} tickFormatter={(v) => formatoMoneda.format(v)} />
                    <RechartsTooltip formatter={(value) => formatoMoneda.format(Number(value))} />
                    <Legend />
                    {FORMAS_PAGO_ANALITICA.map((forma) => (
                      <Bar key={forma} dataKey={forma} stackId="forma-pago" fill={COLOR_FORMA_PAGO[forma]} name={forma} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Stack>
          </Card>

          <Card withBorder padding="lg">
            <Stack gap="sm">
              <Text fw={600} size="sm" tt="uppercase" c="dimmed">
                Distribución por forma de pago — {etiquetaMes(mesSeleccionado)}
              </Text>
              <Stack gap={6}>
                {FORMAS_PAGO_ANALITICA.map((forma) => {
                  const monto = resumenMes.distribucion[forma];
                  const porcentaje = totalDistribucionMes > 0 ? (monto / totalDistribucionMes) * 100 : 0;
                  return (
                    <Group key={forma} justify="space-between" gap="sm">
                      <Text size="sm" tt="capitalize" w={90}>
                        {forma}
                      </Text>
                      <div style={{ flex: 1, background: 'var(--mantine-color-gray-1)', borderRadius: 4, height: 10 }}>
                        <div
                          style={{
                            width: `${porcentaje}%`,
                            background: COLOR_FORMA_PAGO[forma],
                            height: '100%',
                            borderRadius: 4,
                          }}
                        />
                      </div>
                      <Text size="sm" w={140} ta="right">
                        {formatoMoneda.format(monto)} ({porcentaje.toFixed(1)}%)
                      </Text>
                    </Group>
                  );
                })}
              </Stack>
            </Stack>
          </Card>
        </>
      )}

      {totalesPorMes.length > 1 && (
        <Card withBorder padding="lg">
          <Stack gap="sm">
            <Text fw={600} size="sm" tt="uppercase" c="dimmed">
              Comparación entre meses
            </Text>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={totalesPorMes}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} width={80} tickFormatter={(v) => formatoMoneda.format(v)} />
                  <RechartsTooltip formatter={(value) => formatoMoneda.format(Number(value))} />
                  <Bar dataKey="total" name="Total" fill="var(--mantine-color-blue-8)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Stack>
        </Card>
      )}

      <Card withBorder padding="lg">
        <Stack gap="sm">
          <Text fw={600} size="sm" tt="uppercase" c="dimmed">
            Cuentas pendientes de cobro
          </Text>
          {cuentasPendientes.length === 0 ? (
            <Text size="sm" c="dimmed">
              No hay cuentas pendientes de cobro registradas.
            </Text>
          ) : (
            <ScrollArea>
              <Table striped highlightOnHover withTableBorder withColumnBorders fz="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Cuenta</Table.Th>
                    <Table.Th>Hab.</Table.Th>
                    <Table.Th>Huésped</Table.Th>
                    <Table.Th>Último registro</Table.Th>
                    <Table.Th ta="right">Cobrado</Table.Th>
                    <Table.Th ta="right">Factura</Table.Th>
                    <Table.Th ta="right">Pendiente</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {cuentasPendientes.map((c) => (
                    <Table.Tr key={c.cuenta}>
                      <Table.Td fw={600}>{c.cuenta}</Table.Td>
                      <Table.Td>{c.habitacion ?? ''}</Table.Td>
                      <Table.Td>{c.huesped ?? ''}</Table.Td>
                      <Table.Td>{c.fecha}</Table.Td>
                      <Table.Td ta="right">{formatoMoneda.format(c.totales)}</Table.Td>
                      <Table.Td ta="right">{formatoMoneda.format(c.total)}</Table.Td>
                      <Table.Td ta="right" fw={700} c="red">
                        {formatoMoneda.format(c.pendiente)}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}

type SeccionPagosRecepcionClave = 'gastos' | 'movimiento' | 'mes' | 'analitica' | 'saldo-cuenta-huesped';

const SECCIONES_PAGOS_RECEPCION_MENU: {
  clave: SeccionPagosRecepcionClave;
  nombre: string;
  descripcion: string;
  icono: typeof IconFileUpload;
  color: string;
}[] = [
  {
    clave: 'gastos',
    nombre: 'Gastos de Recepción',
    descripcion: 'Subir el Excel de gastos y calcular Tabla 1/Tabla 2 por cuenta',
    icono: IconFileUpload,
    color: 'blue',
  },
  {
    clave: 'movimiento',
    nombre: 'Movimiento y Conciliación',
    descripcion: 'Cruzar contra Movimiento para llenar la forma de pago',
    icono: IconRefreshAlert,
    color: 'orange',
  },
  {
    clave: 'mes',
    nombre: 'Pagos del Mes',
    descripcion: 'Historial guardado por día, edición y exportación',
    icono: IconCalendarStats,
    color: 'teal',
  },
  {
    clave: 'analitica',
    nombre: 'Analítica',
    descripcion: 'KPIs y series diarias del historial guardado',
    icono: IconChartLine,
    color: 'grape',
  },
  {
    clave: 'saldo-cuenta-huesped',
    nombre: 'Saldo Cuenta Huésped',
    descripcion: 'Saldo por cuenta de huésped (en desarrollo)',
    icono: IconUserDollar,
    color: 'cyan',
  },
];

function CeldaCapturaSaldo({
  valor,
  onGuardar,
}: {
  valor: number;
  onGuardar: (nuevo: number) => void;
}) {
  const [texto, setTexto] = useState<string | number>(valor);
  useEffect(() => setTexto(valor), [valor]);
  return (
    <NumberInput
      size="xs"
      w={84}
      styles={{
        input: {
          height: 22,
          minHeight: 22,
          fontSize: 11,
          padding: '0 6px',
          textAlign: 'right',
          background: 'var(--mantine-color-yellow-0)',
          borderColor: 'var(--mantine-color-yellow-3)',
          fontVariantNumeric: 'tabular-nums',
        },
      }}
      hideControls
      min={0}
      decimalScale={2}
      thousandSeparator=","
      fixedDecimalScale
      value={texto}
      onChange={setTexto}
      onBlur={() => {
        const nuevo = Number(texto) || 0;
        if (nuevo !== valor) onGuardar(nuevo);
      }}
    />
  );
}

function PanelSaldoCuentaHuesped() {
  const [mes, setMes] = useState<Date | null>(new Date());
  const [archivo, setArchivo] = useState<File | null>(null);
  const [verTabla, setVerTabla] = useState(false); // el detalle arranca oculto: pantalla limpia
  const [verCarga, setVerCarga] = useState(false);
  const periodo = mes ? `${mes.getFullYear()}-${String(mes.getMonth() + 1).padStart(2, '0')}` : null;

  const { data, isLoading } = useSaldoCuentaHuesped(periodo);
  const subir = useUploadSaldoCuentaHuesped();
  const actualizar = useActualizarCapturaSaldoCuentaHuesped();
  const eliminar = useEliminarSaldoCuentaHuesped();
  const exportar = useExportarSaldoCuentaHuesped();

  const filas = data?.filas ?? [];
  const totales = data?.totales;
  const grupoPorFila = filas.reduce<number[]>((acc, f, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + (f.es_primera_linea ? 1 : 0));
    return acc;
  }, []);
  const resumenFilas = {
    habitaciones: filas.filter((f) => f.es_primera_linea).length,
    capturadas: filas.filter((f) => f.subtotal !== 0 || f.iva !== 0 || f.propina !== 0).length,
  };

  const avisoError = (title: string) => (error: unknown) =>
    notifications.show({ title, message: error instanceof Error ? error.message : 'Error desconocido', color: 'red' });

  const [avisoPeriodo, setAvisoPeriodo] = useState<{ periodoArchivo: string; file: File } | null>(null);

  const guardarArchivo = (file: File, confirmarPeriodo = false) => {
    if (!periodo) return;
    subir.mutate(
      { periodo, file, confirmarPeriodo },
      {
        onSuccess: (r) => {
          if ('requiere_confirmacion' in r) {
            setAvisoPeriodo({ periodoArchivo: r.periodo_archivo, file });
            return;
          }
          setAvisoPeriodo(null);
          setArchivo(null);
          const origen = r.origen === 'excel_editado' ? 'Excel editado' : 'RCP170';
          notifications.show({
            title: `${origen} guardado`,
            message:
              `${r.filas.length} líneas` +
              (r.excluidas_sin_garantia.length ? ` · sin garantía (excluidas): ${r.excluidas_sin_garantia.join(', ')}` : '') +
              (r.capturas_conservadas && r.origen === 'rcp170' ? ` · capturas conservadas: ${r.capturas_conservadas}` : ''),
            color: 'green',
          });
        },
        onError: (error) => {
          const detalle = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail;
          notifications.show({
            title: 'Error al subir el archivo',
            message: detalle ?? (error instanceof Error ? error.message : 'Error desconocido'),
            color: 'red',
            autoClose: false,
          });
        },
      },
    );
  };

  const handleSubir = () => {
    if (archivo) guardarArchivo(archivo);
  };

  const handleExportar = () => {
    if (!periodo) return;
    exportar.mutate(periodo, {
      onSuccess: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Saldo_Cuenta_Huesped_${periodo}.xlsx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      },
      onError: avisoError('Error al exportar'),
    });
  };

  const guardar = (id: number, campo: 'gravado' | 'tasa0' | 'subtotal' | 'iva' | 'propina' | 'ieps' | 'ish', valor: number) => {
    if (!periodo) return;
    actualizar.mutate({ periodo, lineaId: id, campos: { [campo]: valor } }, { onError: avisoError('No se pudo guardar') });
  };

  return (
    <Stack gap="lg">
      <Collapse in={filas.length === 0 || verCarga}>
      <Card withBorder padding="md" radius="md">
        <Stack gap="sm">
          <Group gap="sm">
            <ThemeIcon variant="light" color="teal" size="lg" radius="md">
              <IconUserDollar size={20} />
            </ThemeIcon>
            <div>
              <Text fw={700}>Saldo Cuenta Huésped</Text>
              <Text size="xs" c="dimmed">Reporte RCP170 de Novohit · una carga al mes</Text>
            </div>
          </Group>
          <Group align="flex-end">
            <MonthPickerInput label="Periodo" value={mes} onChange={(v) => setMes(v as Date | null)} w={200} />
            <div style={{ flex: 1, minWidth: 260 }}>
              <ArchivoDropzone archivo={archivo} onArchivo={setArchivo} texto="RCP170 de Novohit o el Excel de este módulo ya editado" />
            </div>
            <Button onClick={handleSubir} disabled={!archivo || !periodo} loading={subir.isPending}>
              Cargar
            </Button>
          </Group>
          <Text size="xs" c="dimmed">
            Solo habitaciones con garantía y folios de Varios. Volver a cargar el mes reemplaza las líneas y conserva lo capturado.
          </Text>
        </Stack>
      </Card>
      </Collapse>

      {isLoading ? null : filas.length === 0 ? (
        <Alert icon={<IconInfoCircle size={16} />} color="gray">
          No hay datos para este periodo. Sube el RCP170.
        </Alert>
      ) : (
        <Stack gap="sm">
          <SimpleGrid cols={{ base: 2, md: 4 }} spacing="xs">
            {[
              { titulo: 'Saldo total', valor: formatoMoneda.format(totales?.monto ?? 0), color: 'teal.8' },
              { titulo: 'Habitaciones / folios', valor: `${resumenFilas.habitaciones}`, color: 'blue.8' },
              { titulo: 'Líneas capturadas', valor: `${resumenFilas.capturadas} de ${filas.length}`, color: 'teal.8' },
              {
                titulo: 'Diferencia (DIF)',
                valor: formatoMoneda.format(totales?.dif ?? 0),
                color: Math.abs(totales?.dif ?? 0) <= 0.05 ? 'green.8' : 'orange.8',
              },
            ].map((k) => (
              <Card key={k.titulo} withBorder padding="xs" radius="md">
                <Text fz={10} c="dimmed" tt="uppercase" fw={600}>
                  {k.titulo}
                </Text>
                <Text fz="lg" fw={700} c={k.color}>
                  {k.valor}
                </Text>
              </Card>
            ))}
          </SimpleGrid>

          <Card withBorder padding="xs" radius="md">
            <Group justify="space-between" gap="xs">
              <Button
                size="compact-sm"
                variant={verTabla ? 'light' : 'filled'}
                color="teal"
                leftSection={verTabla ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                onClick={() => setVerTabla((v) => !v)}
              >
                {verTabla ? 'Ocultar detalle' : `Ver detalle (${filas.length} líneas)`}
              </Button>
              <Group gap="xs">
              <Button size="compact-sm" variant="default" leftSection={<IconUpload size={14} />} onClick={() => setVerCarga((v) => !v)}>
                Recargar RCP170
              </Button>
              <Button size="compact-sm" color="teal" leftSection={<IconDownload size={14} />} onClick={handleExportar} loading={exportar.isPending}>
                Exportar Excel
              </Button>
              <Button
                size="compact-sm"
                variant="subtle"
                color="red"
                leftSection={<IconTrash size={14} />}
                loading={eliminar.isPending}
                onClick={() => {
                  if (periodo && window.confirm(`¿Eliminar todas las líneas de ${periodo}?`)) eliminar.mutate(periodo);
                }}
              >
                Eliminar periodo
              </Button>
              </Group>
            </Group>
            <Collapse in={verTabla}>
            <ScrollArea h={520} mt="xs">
              <Table
                stickyHeader
                fz="xs"
                verticalSpacing={2}
                horizontalSpacing={6}
                style={{ minWidth: 1150, fontVariantNumeric: 'tabular-nums' }}
              >
                <Table.Thead>
                  <Table.Tr>
                    {['Hab.', 'Huésped', 'Llegada', 'Salida', 'Garantía', 'Cuenta'].map((t) => (
                      <Table.Th key={t} bg="teal.8" c="white">{t}</Table.Th>
                    ))}
                    <Table.Th bg="teal.8" c="white" ta="right">TOTAL</Table.Th>
                    {['GRAVADO', 'TASA 0', 'SUBTOTAL', 'IVA', 'PROPINA', 'IEPS', 'ISH'].map((t) => (
                      <Table.Th
                        key={t}
                        bg="teal.8"
                        c="yellow.2"
                        ta="right"
                        style={{ borderBottom: '3px solid var(--mantine-color-yellow-4)' }}
                      >
                        {t}
                      </Table.Th>
                    ))}
                    <Table.Th bg="teal.8" c="white" ta="right">TOTAL</Table.Th>
                    <Table.Th bg="teal.8" c="white" ta="right">DIF</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filas.map((f, idx) => {
                    const cuadra = Math.abs(f.dif) <= 0.05;
                    const fondo = f.tipo === 'varios' ? 'grape.0' : grupoPorFila[idx] % 2 === 0 ? 'teal.0' : undefined;
                    return (
                      <Table.Tr
                        key={f.id}
                        bg={fondo}
                        style={f.es_primera_linea && idx > 0 ? { borderTop: '1px solid var(--mantine-color-gray-4)' } : undefined}
                      >
                        <Table.Td fw={700}>{f.es_primera_linea ? f.habitacion : ''}</Table.Td>
                        <Table.Td maw={170}>
                          <Text fz="xs" truncate>{f.es_primera_linea ? f.huesped : ''}</Text>
                        </Table.Td>
                        <Table.Td c="dimmed">{f.es_primera_linea ? f.llegada.slice(0, 5) : ''}</Table.Td>
                        <Table.Td c="dimmed">{f.es_primera_linea ? f.salida.slice(0, 5) : ''}</Table.Td>
                        <Table.Td>
                          {f.es_primera_linea ? (
                            <Badge variant="light" color={f.tipo === 'varios' ? 'grape' : 'teal'} size="xs">
                              {f.tipo === 'varios' ? 'Varios' : f.garantia}
                            </Badge>
                          ) : null}
                        </Table.Td>
                        <Table.Td maw={170}>
                          <Text fz="xs" truncate c={f.es_primera_linea ? undefined : 'dimmed'}>{f.linea_nombre}</Text>
                        </Table.Td>
                        <Table.Td ta="right" fw={700}>{formatoMoneda.format(f.monto)}</Table.Td>
                        <Table.Td ta="right" c="dimmed">{formatoMoneda.format(f.gravado)}</Table.Td>
                        <Table.Td ta="right" c="dimmed">{formatoMoneda.format(f.tasa0)}</Table.Td>
                        {(['subtotal', 'iva', 'propina', 'ieps', 'ish'] as const).map((campo) => (
                          <Table.Td key={campo}>
                            <CeldaCapturaSaldo valor={f[campo]} onGuardar={(v) => guardar(f.id, campo, v)} />
                          </Table.Td>
                        ))}
                        <Table.Td ta="right" c="dimmed">{formatoMoneda.format(f.total2)}</Table.Td>
                        <Table.Td ta="right" c={cuadra ? 'dimmed' : 'orange.8'} fw={cuadra ? undefined : 700}>
                          {formatoMoneda.format(f.dif)}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
                {totales && (
                  <Table.Tfoot>
                    <Table.Tr bg="teal.1" style={{ borderTop: '2px solid var(--mantine-color-teal-7)' }}>
                      <Table.Th colSpan={6} c="teal.9">Saldo Total</Table.Th>
                      <Table.Th ta="right" c="teal.9">{formatoMoneda.format(totales.monto)}</Table.Th>
                      {(['gravado', 'tasa0', 'subtotal', 'iva', 'propina', 'ieps', 'ish'] as const).map((campo) => (
                        <Table.Th key={campo} ta="right" c="teal.9">{formatoMoneda.format(totales[campo])}</Table.Th>
                      ))}
                      <Table.Th ta="right" c="teal.9">{formatoMoneda.format(totales.total2)}</Table.Th>
                      <Table.Th ta="right" c="teal.9">{formatoMoneda.format(totales.dif)}</Table.Th>
                    </Table.Tr>
                  </Table.Tfoot>
                )}
              </Table>
            </ScrollArea>
            </Collapse>
          </Card>
        </Stack>
      )}

      <Modal
        opened={avisoPeriodo !== null}
        onClose={() => setAvisoPeriodo(null)}
        title={<Text fw={600}>Periodo distinto</Text>}
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            El Excel dice <b>{avisoPeriodo?.periodoArchivo}</b> en su título, pero estás guardando en <b>{periodo}</b>.
            ¿Quieres guardarlo en {periodo} de todos modos?
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAvisoPeriodo(null)}>Cancelar</Button>
            <Button
              color="teal"
              loading={subir.isPending}
              onClick={() => avisoPeriodo && guardarArchivo(avisoPeriodo.file, true)}
            >
              Guardar en {periodo}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

function PanelMenuSeccionesPagosRecepcion({ onSeleccionar }: { onSeleccionar: (sec: SeccionPagosRecepcionClave) => void }) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="lg">
      {SECCIONES_PAGOS_RECEPCION_MENU.map((sec) => (
        <UnstyledButton key={sec.clave} onClick={() => onSeleccionar(sec.clave)}>
          <Card
            withBorder
            radius="md"
            p="lg"
            style={{ borderLeft: `4px solid var(--mantine-color-${sec.color}-6)`, height: '100%' }}
          >
            <Stack gap="sm" align="flex-start">
              <ThemeIcon size={44} radius="md" variant="light" color={sec.color}>
                <sec.icono size={24} />
              </ThemeIcon>
              <Text fw={600}>{sec.nombre}</Text>
              <Text size="xs" c="dimmed">
                {sec.descripcion}
              </Text>
            </Stack>
          </Card>
        </UnstyledButton>
      ))}
    </SimpleGrid>
  );
}

export default function PagosRecepcionPage() {
  const [vista, setVista] = useState<SeccionPagosRecepcionClave | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [resultado, setResultado] = useState<UploadPagosRecepcionResponse | null>(null);
  const uploadPagosRecepcion = useUploadPagosRecepcion();

  const [archivoMovimiento, setArchivoMovimiento] = useState<File | null>(null);
  const [resultadoMovimiento, setResultadoMovimiento] = useState<UploadMovimientoPagosRecepcionResponse | null>(
    null,
  );
  const uploadMovimientoPagosRecepcion = useUploadMovimientoPagosRecepcion();

  const [archivoMovimientosPeriodo, setArchivoMovimientosPeriodo] = useState<File | null>(null);
  const [resultadoMovimientosPeriodo, setResultadoMovimientosPeriodo] =
    useState<UploadMovimientosPeriodoPagosRecepcionResponse | null>(null);
  const uploadMovimientosPeriodoPagosRecepcion = useUploadMovimientosPeriodoPagosRecepcion();

  const [resultadoConciliacion, setResultadoConciliacion] = useState<ConciliarFormaPagoResponse | null>(null);
  const conciliarFormaPago = useConciliarFormaPago();

  const [fechaPagosDelMes, setFechaPagosDelMes] = useState('');
  const guardarPagosDelMes = useGuardarPagosDelMes();
  const pagosDelMes = useObtenerPagosDelMes();
  const diasPagosDelMes = useDiasPagosDelMes();
  const exportarPagosDelMes = useExportarPagosDelMes();
  const eliminarDiaPagosDelMes = useEliminarDiaPagosDelMes();
  const agregarFilaManualPagosDelMes = useAgregarFilaManualPagosDelMes();
  const eliminarFilaPagosDelMes = useEliminarFilaPagosDelMes();

  const [modalReemplazoAbierto, setModalReemplazoAbierto] = useState(false);
  const [cuentasExistentesReemplazo, setCuentasExistentesReemplazo] = useState(0);
  const [modalEliminarAbierto, setModalEliminarAbierto] = useState(false);
  const [modalFilaManualAbierto, setModalFilaManualAbierto] = useState(false);
  const [filaManual, setFilaManual] = useState({
    cuenta: '',
    habitacion: '',
    huesped: '',
    efectivo: '',
    amex: '',
    visa: '',
    mcard: '',
    credito: '',
  });

  const [filtroFechaPagosDelMes, setFiltroFechaPagosDelMes] = useState('');
  const [calendarioVisible, setCalendarioVisible] = useState(false);
  const filasPagosDelMes = (pagosDelMes.data?.filas ?? []).filter(
    (fila) => !filtroFechaPagosDelMes || fila.fecha === filtroFechaPagosDelMes,
  );

  const handleEliminarDiaPagosDelMes = () => {
    if (!filtroFechaPagosDelMes) return;
    eliminarDiaPagosDelMes.mutate(
      { fecha: filtroFechaPagosDelMes },
      {
        onSuccess: (data) => {
          setModalEliminarAbierto(false);
          notifications.show({
            title: 'Día eliminado',
            message: `${data.fecha}: ${data.eliminados} cuenta(s) eliminada(s)`,
            color: 'green',
          });
          setFiltroFechaPagosDelMes('');
        },
        onError: (error) => {
          notifications.show({
            title: 'Error al eliminar el día',
            message: error instanceof Error ? error.message : 'Error desconocido',
            color: 'red',
          });
        },
      },
    );
  };

  const handleAgregarFilaManual = () => {
    if (!filtroFechaPagosDelMes) return;
    const aNumero = (texto: string) => (texto.trim() === '' ? 0 : Number(texto));
    agregarFilaManualPagosDelMes.mutate(
      {
        fecha: filtroFechaPagosDelMes,
        cuenta: aNumero(filaManual.cuenta),
        habitacion: filaManual.habitacion.trim() || undefined,
        huesped: filaManual.huesped.trim() || undefined,
        efectivo: aNumero(filaManual.efectivo),
        amex: aNumero(filaManual.amex),
        visa: aNumero(filaManual.visa),
        mcard: aNumero(filaManual.mcard),
        credito: aNumero(filaManual.credito),
      },
      {
        onSuccess: () => {
          setModalFilaManualAbierto(false);
          setFilaManual({ cuenta: '', habitacion: '', huesped: '', efectivo: '', amex: '', visa: '', mcard: '', credito: '' });
          notifications.show({ title: 'Fila agregada', message: 'Se agregó la fila manual a Pagos del Mes', color: 'green' });
        },
        onError: (error) => {
          notifications.show({
            title: 'Error al agregar la fila',
            message: error instanceof Error ? error.message : 'Error desconocido',
            color: 'red',
          });
        },
      },
    );
  };

  const handleAgregarNoConciliadoComoFilaManual = (item: NoConciliadoPagosRecepcion): Promise<boolean> => {
    if (!fechaPagosDelMes) {
      notifications.show({
        title: 'Falta la fecha',
        message: 'Elige la fecha para Pagos del Mes antes de agregar',
        color: 'red',
      });
      return Promise.resolve(false);
    }
    const FORMAS_VALIDAS = ['efectivo', 'amex', 'visa', 'mcard', 'credito'] as const;
    const camposForma: Partial<Record<(typeof FORMAS_VALIDAS)[number], number>> = {};
    if ((FORMAS_VALIDAS as readonly string[]).includes(item.forma_pago)) {
      camposForma[item.forma_pago as (typeof FORMAS_VALIDAS)[number]] = item.monto;
    }
    return new Promise((resolve) => {
      agregarFilaManualPagosDelMes.mutate(
        {
          fecha: fechaPagosDelMes,
          habitacion: item.habitacion || undefined,
          huesped: item.huesped || undefined,
          ...camposForma,
        },
        {
          onSuccess: () => {
            setFiltroFechaPagosDelMes(fechaPagosDelMes);
            notifications.show({
              title: 'Fila agregada',
              message: `Se agregó a Pagos del Mes (${item.forma_pago}: ${formatoMoneda.format(item.monto)}). Ve a la pestaña "Pagos del Mes" para verla.`,
              color: 'green',
            });
            resolve(true);
          },
          onError: (error) => {
            notifications.show({
              title: 'Error al agregar la fila',
              message: error instanceof Error ? error.message : 'Error desconocido',
              color: 'red',
            });
            resolve(false);
          },
        },
      );
    });
  };

  const handleEliminarFilaPagosDelMes = (id: number) => {
    eliminarFilaPagosDelMes.mutate(
      { id },
      {
        onSuccess: () => {
          notifications.show({ title: 'Fila eliminada', message: 'La fila se eliminó de Pagos del Mes', color: 'green' });
        },
        onError: (error) => {
          notifications.show({
            title: 'Error al eliminar la fila',
            message: error instanceof Error ? error.message : 'Error desconocido',
            color: 'red',
          });
        },
      },
    );
  };

  // Propina "fresca" por cuenta, tomada de la Tabla 1 recién calculada de
  // los bloques (si el archivo de esa cuenta está cargado en esta sesión)
  // — el botón "Autocorregir Subtotal1" la usa en vez de la ya guardada.
  const propinasPorCuenta = new Map(
    (resultado?.tabla1 ?? []).map((fila) => [fila.consecutivo, fila.propina]),
  );

  const [edicionesPagosDelMes, setEdicionesPagosDelMes] = useState<
    Record<number, Partial<CamposEditablesPagosDelMes>>
  >({});
  const actualizarPagoRecepcionDia = useActualizarPagoRecepcionDia();

  const handleEditarCeldaPagosDelMes = (id: number, campo: keyof CamposEditablesPagosDelMes, valor: number) => {
    setEdicionesPagosDelMes((prev) => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }));
  };

  const handleGuardarCambiosPagosDelMes = async () => {
    const entradas = Object.entries(edicionesPagosDelMes);
    if (entradas.length === 0) return;

    let errores = 0;
    for (const [idTexto, edicion] of entradas) {
      const id = Number(idTexto);
      const filaOriginal = (pagosDelMes.data?.filas ?? []).find((f) => f.id === id);
      if (!filaOriginal) continue;
      const campos: CamposEditablesPagosDelMes = {
        efectivo: edicion.efectivo ?? filaOriginal.efectivo,
        amex: edicion.amex ?? filaOriginal.amex,
        visa: edicion.visa ?? filaOriginal.visa,
        mcard: edicion.mcard ?? filaOriginal.mcard,
        credito: edicion.credito ?? filaOriginal.credito,
        subtotal1: edicion.subtotal1 ?? filaOriginal.subtotal1,
        iva16: edicion.iva16 ?? filaOriginal.iva16,
        ish3: edicion.ish3 ?? filaOriginal.ish3,
        propina: edicion.propina ?? filaOriginal.propina,
      };
      try {
        await actualizarPagoRecepcionDia.mutateAsync({ id, campos });
      } catch {
        errores += 1;
      }
    }

    if (errores === 0) {
      setEdicionesPagosDelMes({});
      notifications.show({ title: 'Cambios guardados', message: `${entradas.length} cuenta(s) actualizada(s)`, color: 'green' });
    } else {
      notifications.show({
        title: 'Algunos cambios no se guardaron',
        message: `${errores} de ${entradas.length} cuenta(s) fallaron`,
        color: 'red',
      });
    }
  };

  const handleSubir = () => {
    if (!archivo) return;
    uploadPagosRecepcion.mutate(archivo, {
      onSuccess: (data) => {
        setResultado(data);
        notifications.show({
          title: 'Archivo recibido',
          message: `${data.filename}: ${data.total_bloques} bloque(s), ${data.total_filas} fila(s)`,
          color: 'green',
        });
      },
      onError: (error) => {
        notifications.show({
          title: 'Error al subir el archivo',
          message: error instanceof Error ? error.message : 'Error desconocido',
          color: 'red',
        });
      },
    });
  };

  const handleSubirMovimiento = () => {
    if (!archivoMovimiento) return;
    uploadMovimientoPagosRecepcion.mutate(archivoMovimiento, {
      onSuccess: (data) => {
        setResultadoMovimiento(data);
        notifications.show({
          title: 'Archivo de Movimiento recibido',
          message: `${data.filename}: ${data.total} fila(s) leída(s)`,
          color: 'green',
        });
      },
      onError: (error) => {
        notifications.show({
          title: 'Error al subir el archivo de Movimiento',
          message: error instanceof Error ? error.message : 'Error desconocido',
          color: 'red',
        });
      },
    });
  };

  const handleSubirMovimientosPeriodo = () => {
    if (!archivoMovimientosPeriodo) return;
    uploadMovimientosPeriodoPagosRecepcion.mutate(archivoMovimientosPeriodo, {
      onSuccess: (data) => {
        setResultadoMovimientosPeriodo(data);
        notifications.show({
          title: 'Archivo de Movimientos por Periodo recibido',
          message: `${data.filename}: ${data.total} fila(s) de American Express encontradas`,
          color: 'green',
        });
      },
      onError: (error) => {
        notifications.show({
          title: 'Error al subir el archivo de Movimientos por Periodo',
          message: error instanceof Error ? error.message : 'Error desconocido',
          color: 'red',
        });
      },
    });
  };

  const handleConciliar = () => {
    if (!resultado || !resultadoMovimiento) return;
    conciliarFormaPago.mutate(
      {
        tabla1: resultado.tabla1,
        tabla2: resultado.tabla2,
        movimientoFilas: resultadoMovimiento.filas,
        filasAmexPeriodo: resultadoMovimientosPeriodo?.filas_amex,
      },
      {
        onSuccess: (data) => {
          setResultadoConciliacion(data);
          const mensajeReclasificacion =
            data.credito_reclasificado_a_amex > 0
              ? ` · ${data.credito_reclasificado_a_amex} pago(s) de Crédito identificados como American Express`
              : '';
          notifications.show({
            title: 'Conciliación completada',
            message: `Diferencia: ${formatoMoneda.format(data.diferencia)}${mensajeReclasificacion}`,
            color: Math.abs(data.diferencia) < 0.01 ? 'green' : 'red',
          });
        },
        onError: (error) => {
          notifications.show({
            title: 'Error al conciliar',
            message: error instanceof Error ? error.message : 'Error desconocido',
            color: 'red',
          });
        },
      },
    );
  };

  const handleGuardarPagosDelMes = (confirmarReemplazo = false) => {
    if (!resultadoConciliacion || !fechaPagosDelMes) return;
    guardarPagosDelMes.mutate(
      {
        fecha: fechaPagosDelMes,
        tabla2: resultadoConciliacion.tabla2,
        noConciliados: resultadoConciliacion.no_conciliados,
        confirmarReemplazo,
      },
      {
        onSuccess: (data) => {
          if ('requiere_confirmacion' in data) {
            setCuentasExistentesReemplazo(data.cuentas_existentes);
            setModalReemplazoAbierto(true);
            return;
          }
          setModalReemplazoAbierto(false);
          notifications.show({
            title: 'Guardado en Pagos del Mes',
            message: `${data.fecha}: ${data.total} cuenta(s) guardada(s)`,
            color: 'green',
          });
        },
        onError: (error) => {
          notifications.show({
            title: 'Error al guardar en Pagos del Mes',
            message: error instanceof Error ? error.message : 'Error desconocido',
            color: 'red',
          });
        },
      },
    );
  };

  const handleExportarPagosDelMes = (fecha?: string) => {
    exportarPagosDelMes.mutate(
      { fecha },
      {
        onSuccess: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = fecha ? `Pagos_Del_Mes_${fecha}.xlsx` : 'Pagos_Del_Mes.xlsx';
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.URL.revokeObjectURL(url);
        },
        onError: (error) => {
          notifications.show({
            title: 'Error al exportar',
            message: error instanceof Error ? error.message : 'Error desconocido',
            color: 'red',
          });
        },
      },
    );
  };

  return (
    <Stack gap="lg">
      <Group gap="xs">
        <IconBellRinging size={28} />
        <Title order={2}>Pagos de Recepción</Title>
      </Group>

      {vista === null ? (
        <PanelMenuSeccionesPagosRecepcion onSeleccionar={setVista} />
      ) : (
        <Stack gap="lg">
          <Button
            variant="subtle"
            size="sm"
            leftSection={<IconArrowLeft size={16} />}
            onClick={() => setVista(null)}
            style={{ alignSelf: 'flex-start' }}
          >
            Volver al menú
          </Button>

          {vista === 'gastos' && (
          <Stack gap="lg">
            <Card withBorder padding="md">
              <Stack gap="sm">
                <Text fw={600} size="sm" tt="uppercase" c="dimmed">
                  Archivo de gastos de recepción
                </Text>
                <ArchivoDropzone
                  archivo={archivo}
                  onArchivo={setArchivo}
                  texto="Arrastra el Excel de gastos de recepción o haz clic para seleccionarlo"
                />
                <Group justify="flex-end">
                  <Button size="sm" onClick={handleSubir} disabled={!archivo} loading={uploadPagosRecepcion.isPending}>
                    Subir archivo
                  </Button>
                </Group>
              </Stack>
            </Card>

            {resultado && (
              <>
                <Accordion variant="separated">
                  <Accordion.Item value="tabla1">
                    <Accordion.Control>
                      <Group gap="xs">
                        <Text fw={500} size="sm">
                          Tabla 1 — Cálculos por cuenta
                        </Text>
                        <Badge variant="light" size="sm">
                          {resultado.tabla1.length} cuenta(s)
                        </Badge>
                      </Group>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <TablaCalculos filas={resultado.tabla1} />
                    </Accordion.Panel>
                  </Accordion.Item>
                </Accordion>

                <Accordion variant="separated">
                  <Accordion.Item value="tabla2">
                    <Accordion.Control>
                      <Group gap="xs">
                        <Text fw={500} size="sm">
                          Tabla 2 — Cuentas y forma de pago
                        </Text>
                        <Badge variant="light" size="sm">
                          {(resultadoConciliacion?.tabla2 ?? resultado.tabla2).length} cuenta(s)
                        </Badge>
                      </Group>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <TablaCuentas filas={resultadoConciliacion?.tabla2 ?? resultado.tabla2} />
                    </Accordion.Panel>
                  </Accordion.Item>
                </Accordion>

                <VistaBloques resultado={resultado} />
              </>
            )}
          </Stack>
          )}

          {vista === 'movimiento' && (
          <Stack gap="lg">
            <Card withBorder padding="md">
              <Stack gap="sm">
                <Text fw={600} size="sm" tt="uppercase" c="dimmed">
                  Archivo de Movimiento
                </Text>
                <ArchivoDropzone
                  archivo={archivoMovimiento}
                  onArchivo={setArchivoMovimiento}
                  texto="Arrastra el Excel de Movimiento o haz clic para seleccionarlo"
                />
                <Group justify="flex-end">
                  <Button
                    size="sm"
                    onClick={handleSubirMovimiento}
                    disabled={!archivoMovimiento}
                    loading={uploadMovimientoPagosRecepcion.isPending}
                  >
                    Subir archivo
                  </Button>
                </Group>
              </Stack>
            </Card>

            {resultadoMovimiento && (
              <Accordion variant="separated">
                <Accordion.Item value="movimiento-vista-previa">
                  <Accordion.Control>
                    <Group gap="xs">
                      <Text fw={500} size="sm">
                        Vista previa del archivo de Movimiento
                      </Text>
                      <Badge variant="light" size="sm">
                        {resultadoMovimiento.total} fila(s)
                      </Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <TablaMovimientoVistaPrevia resultado={resultadoMovimiento} />
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            )}

            <Card withBorder padding="md">
              <Stack gap="sm">
                <Text fw={600} size="sm" tt="uppercase" c="dimmed">
                  Archivo de Movimientos por Periodo (opcional — para identificar pagos American Express)
                </Text>
                <ArchivoDropzone
                  archivo={archivoMovimientosPeriodo}
                  onArchivo={setArchivoMovimientosPeriodo}
                  texto="Arrastra el Excel de Movimientos por Periodo o haz clic para seleccionarlo"
                />
                <Group justify="flex-end">
                  <Button
                    size="sm"
                    onClick={handleSubirMovimientosPeriodo}
                    disabled={!archivoMovimientosPeriodo}
                    loading={uploadMovimientosPeriodoPagosRecepcion.isPending}
                  >
                    Subir archivo
                  </Button>
                </Group>
              </Stack>
            </Card>

            {resultadoMovimientosPeriodo && (
              <Accordion variant="separated">
                <Accordion.Item value="movimientos-periodo-vista-previa">
                  <Accordion.Control>
                    <Group gap="xs">
                      <Text fw={500} size="sm">
                        Pagos American Express detectados
                      </Text>
                      <Badge variant="light" size="sm">
                        {resultadoMovimientosPeriodo.total} fila(s)
                      </Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <ScrollArea>
                      <Table striped highlightOnHover withTableBorder withColumnBorders>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>Folio</Table.Th>
                            <Table.Th>Fecha</Table.Th>
                            <Table.Th>Huésped</Table.Th>
                            <Table.Th>Monto</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {resultadoMovimientosPeriodo.filas_amex.map((fila, idx) => (
                            <Table.Tr key={idx}>
                              <Table.Td>{fila.folio}</Table.Td>
                              <Table.Td>{fila.fecha}</Table.Td>
                              <Table.Td>{fila.huesped}</Table.Td>
                              <Table.Td>{formatoMoneda.format(fila.monto)}</Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </ScrollArea>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            )}

            {resultado && resultadoMovimiento && (
              <Card withBorder padding="lg">
                <Stack gap="md">
                  <Group justify="space-between">
                    <Text fw={600} size="sm" tt="uppercase" c="dimmed">
                      Conciliar forma de pago
                    </Text>
                    <Button size="sm" onClick={handleConciliar} loading={conciliarFormaPago.isPending}>
                      Conciliar
                    </Button>
                  </Group>
                  {resultadoConciliacion && (
                    <>
                      <ResumenConciliacion
                        resultado={resultadoConciliacion}
                        onAgregarNoConciliado={handleAgregarNoConciliadoComoFilaManual}
                        agregandoFilaManual={agregarFilaManualPagosDelMes.isPending}
                      />
                      <Group align="flex-end" gap="sm">
                        <DateInput
                          label="Fecha para Pagos del Mes"
                          locale="es"
                          valueFormat="DD/MM/YYYY"
                          placeholder="Selecciona una fecha"
                          value={isoAFecha(fechaPagosDelMes)}
                          onChange={(fecha) => setFechaPagosDelMes(fecha ? fechaAIso(fecha) : '')}
                          clearable
                          w={220}
                        />
                        <Button
                          size="sm"
                          onClick={() => handleGuardarPagosDelMes()}
                          disabled={!fechaPagosDelMes}
                          loading={guardarPagosDelMes.isPending}
                        >
                          Guardar en Pagos del Mes
                        </Button>
                      </Group>
                    </>
                  )}
                </Stack>
              </Card>
            )}
          </Stack>
          )}

          {vista === 'mes' && (
          <Card withBorder padding="lg">
            <Stack gap="md">
              <Group justify="space-between" align="center">
                <div>
                  <Title order={4}>Pagos del Mes</Title>
                  <Text size="xs" c="dimmed">
                    Consulta las cuentas ya guardadas, agrupadas por día.
                  </Text>
                </div>
                <Group gap="xs">
                  <Button
                    variant="default"
                    size="xs"
                    onClick={() => handleExportarPagosDelMes()}
                    loading={exportarPagosDelMes.isPending}
                  >
                    Exportar todo
                  </Button>
                  <Button
                    variant="subtle"
                    size="xs"
                    leftSection={<IconCalendarStats size={14} />}
                    onClick={() => setCalendarioVisible((v) => !v)}
                  >
                    {calendarioVisible ? 'Ocultar calendario' : 'Ver calendario de días guardados'}
                  </Button>
                </Group>
              </Group>

              {(diasPagosDelMes.data?.length ?? 0) === 0 && (
                <Text size="sm" c="dimmed">
                  Todavía no hay ningún día guardado.
                </Text>
              )}

              {calendarioVisible && (diasPagosDelMes.data?.length ?? 0) > 0 && (
                <Calendar
                  static
                  defaultDate={
                    isoAFecha(
                      [...diasPagosDelMes.data!].sort((a, b) => b.fecha.localeCompare(a.fecha))[0]?.fecha ?? '',
                    ) ?? new Date()
                  }
                  getDayProps={(date) => {
                    const iso = fechaAIso(date);
                    const dia = diasPagosDelMes.data!.find((d) => d.fecha === iso);
                    return {
                      selected: filtroFechaPagosDelMes === iso,
                      onClick: () => dia && setFiltroFechaPagosDelMes(iso),
                      style: dia ? { fontWeight: 700 } : undefined,
                    };
                  }}
                  renderDay={(date) => {
                    const iso = fechaAIso(date);
                    const dia = diasPagosDelMes.data!.find((d) => d.fecha === iso);
                    return (
                      <div style={{ position: 'relative' }}>
                        {date.getDate()}
                        {dia && (
                          <div
                            title={`${dia.total} cuenta(s)`}
                            style={{
                              position: 'absolute',
                              bottom: -2,
                              left: '50%',
                              transform: 'translateX(-50%)',
                              width: 5,
                              height: 5,
                              borderRadius: '50%',
                              background: 'var(--mantine-color-blue-6)',
                            }}
                          />
                        )}
                      </div>
                    );
                  }}
                />
              )}

              {filtroFechaPagosDelMes && (
                <Stack gap="sm">
                  <Group justify="space-between" align="center">
                    <Text size="sm" fw={500}>
                      Día: {filtroFechaPagosDelMes}
                    </Text>
                    <Group gap="xs">
                      <Button
                        variant="default"
                        size="xs"
                        onClick={() => handleExportarPagosDelMes(filtroFechaPagosDelMes)}
                        loading={exportarPagosDelMes.isPending}
                      >
                        Exportar día
                      </Button>
                      <Button
                        variant="outline"
                        color="red"
                        size="xs"
                        leftSection={<IconTrash size={14} />}
                        onClick={() => setModalEliminarAbierto(true)}
                      >
                        Eliminar día
                      </Button>
                      <Button
                        variant="default"
                        size="xs"
                        onClick={() => setModalFilaManualAbierto(true)}
                      >
                        Agregar fila manual
                      </Button>
                      {Object.keys(edicionesPagosDelMes).length > 0 && (
                        <Button size="xs" onClick={handleGuardarCambiosPagosDelMes} loading={actualizarPagoRecepcionDia.isPending}>
                          Guardar cambios
                        </Button>
                      )}
                    </Group>
                  </Group>
                  <TablaPagosDelMes
                    filas={filasPagosDelMes}
                    ediciones={edicionesPagosDelMes}
                    onEditarCelda={handleEditarCeldaPagosDelMes}
                    propinasPorCuenta={propinasPorCuenta}
                    onEliminarFila={handleEliminarFilaPagosDelMes}
                  />
                </Stack>
              )}
            </Stack>
          </Card>
          )}

          {vista === 'analitica' && <PanelAnalitica />}

          {vista === 'saldo-cuenta-huesped' && <PanelSaldoCuentaHuesped />}
        </Stack>
      )}

      <Modal
        opened={modalReemplazoAbierto}
        onClose={() => setModalReemplazoAbierto(false)}
        title={<Text fw={600} c="red">Confirmar reemplazo</Text>}
      >
        <Stack gap="md">
          <Text size="sm">
            Ya existen {cuentasExistentesReemplazo} cuenta(s) guardadas para el día {fechaPagosDelMes}. Si continúas,
            se reemplazarán por el resultado de la conciliación actual.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setModalReemplazoAbierto(false)}>
              Cancelar
            </Button>
            <Button color="red" loading={guardarPagosDelMes.isPending} onClick={() => handleGuardarPagosDelMes(true)}>
              Reemplazar
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={modalEliminarAbierto}
        onClose={() => setModalEliminarAbierto(false)}
        title={<Text fw={600} c="red">Confirmar eliminación</Text>}
      >
        <Stack gap="md">
          <Text size="sm">
            Se eliminarán {filasPagosDelMes.length} cuenta(s) guardadas para el día {filtroFechaPagosDelMes}. Esta
            acción no se puede deshacer.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setModalEliminarAbierto(false)}>
              Cancelar
            </Button>
            <Button color="red" loading={eliminarDiaPagosDelMes.isPending} onClick={handleEliminarDiaPagosDelMes}>
              Eliminar
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={modalFilaManualAbierto}
        onClose={() => setModalFilaManualAbierto(false)}
        title={<Text fw={600}>Agregar fila manual — {filtroFechaPagosDelMes}</Text>}
      >
        <Stack gap="sm">
          <Text size="xs" c="dimmed">
            Para capturar un monto real cobrado ese día (ej. un subtotal del archivo de Movimiento) que no amarra
            contra ninguna factura de huésped. No cuadrará contra Subtotal1/IVA/Total — es esperado.
          </Text>
          <Group grow>
            <TextInput
              label="Cuenta"
              placeholder="0"
              value={filaManual.cuenta}
              onChange={(e) => setFilaManual((f) => ({ ...f, cuenta: e.currentTarget.value }))}
            />
            <TextInput
              label="Habitación"
              value={filaManual.habitacion}
              onChange={(e) => setFilaManual((f) => ({ ...f, habitacion: e.currentTarget.value }))}
            />
          </Group>
          <TextInput
            label="Huésped / Descripción"
            placeholder="Ajuste Movimiento — Visa"
            value={filaManual.huesped}
            onChange={(e) => setFilaManual((f) => ({ ...f, huesped: e.currentTarget.value }))}
          />
          <SimpleGrid cols={2}>
            <TextInput
              label="Efectivo"
              placeholder="0"
              value={filaManual.efectivo}
              onChange={(e) => setFilaManual((f) => ({ ...f, efectivo: e.currentTarget.value }))}
            />
            <TextInput
              label="Amex"
              placeholder="0"
              value={filaManual.amex}
              onChange={(e) => setFilaManual((f) => ({ ...f, amex: e.currentTarget.value }))}
            />
            <TextInput
              label="Visa"
              placeholder="0"
              value={filaManual.visa}
              onChange={(e) => setFilaManual((f) => ({ ...f, visa: e.currentTarget.value }))}
            />
            <TextInput
              label="M.Card"
              placeholder="0"
              value={filaManual.mcard}
              onChange={(e) => setFilaManual((f) => ({ ...f, mcard: e.currentTarget.value }))}
            />
            <TextInput
              label="Crédito"
              placeholder="0"
              value={filaManual.credito}
              onChange={(e) => setFilaManual((f) => ({ ...f, credito: e.currentTarget.value }))}
            />
          </SimpleGrid>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setModalFilaManualAbierto(false)}>
              Cancelar
            </Button>
            <Button loading={agregarFilaManualPagosDelMes.isPending} onClick={handleAgregarFilaManual}>
              Agregar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

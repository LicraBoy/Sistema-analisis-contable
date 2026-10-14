import {
  Accordion,
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Divider,
  Grid,
  Group,
  Modal,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { Calendar, DateInput } from '@mantine/dates';
import { Dropzone, MS_EXCEL_MIME_TYPE } from '@mantine/dropzone';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconArrowLeft,
  IconCalendarStats,
  IconChartLine,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconDatabase,
  IconDownload,
  IconFileInvoice,
  IconFileSpreadsheet,
  IconFileTypePdf,
  IconFileTypeXml,
  IconInfoCircle,
  IconScale,
  IconSearch,
  IconTable,
  IconTrash,
  IconUpload,
  IconX,
} from '@tabler/icons-react';
import { Fragment, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  LabelList,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  useAgregarPuePpd,
  useAnaliticaTablasFormaPago,
  useBuscarTablasFormaPago,
  useExportarCategoriaTablaFormaPago,
  useDescargarFacturaDia,
  useDuplicadosPreview,
  useEliminarFacturaDia,
  useEliminarPeriodoTablasFormaPago,
  useDetalleBalanzaPuntoVenta,
  useExportarTablasFormaPago,
  useGenerarFacturacion,
  useGuardarBalanza,
  useGuardarTablasFormaPago,
  useListarFacturasDia,
  useListarPeriodosTablasFormaPago,
  useObtenerBalanza,
  useObtenerTablasFormaPagoGuardadas,
  useSubirFacturaDia,
  useVentasPorPosFacturacion,
  type CuentaBalanza,
  type DuplicadoFacturacion,
  type EdicionFacturacion,
  type DetalleBalanzaPuntoVenta,
  type FacturaAdjuntaDia,
  type FilaFacturacionTablaFormaPago,
  type GrupoDetalleBalanzaPuntoVenta,
  type SerieDiariaFacturacionAnalitica,
  type TipoAdjuntoFactura,
} from '../api/hooks';
import { SEMANTIC_COLORS } from '../theme/tokens';

// Mismo orden que TABLAS_FACTURACION en services/facturacion.py — el
// backend no lo expone en la respuesta, así que se replica aquí para
// agrupar/ordenar las 7 tablas al mostrar lo guardado.
const ORDEN_TABLAS_FORMA_PAGO = [
  'EFECTIVO',
  'VISA / MASTERCARD',
  'AMERICAN EXPRESS',
  'FUNCIONARIOS Y EMPLEADOS',
  'HUÉSPED',
  'TUSOSA',
  'CORTESÍA',
];

// Borde grueso para marcar visualmente el límite entre grupos de columnas —
// mismo valor que BORDE_SEPARADOR en PagosRecepcionPage.tsx.
const BORDE_SEPARADOR_TABLA_GUARDADA = { borderRight: '2px solid var(--mantine-color-gray-5)' };

// Color de acento por tabla — azul para las 4 que caen en PUE, uva para
// Huésped (PPD), gris para TUSOSA/Cortesía (no aplican a PUE/PPD). Mismo
// criterio que CATEGORIA_PUE_PPD_POR_TABLA en services/facturacion.py.
const COLOR_TABLA_FORMA_PAGO: Record<string, string> = {
  EFECTIVO: SEMANTIC_COLORS.info,
  'VISA / MASTERCARD': SEMANTIC_COLORS.info,
  'AMERICAN EXPRESS': SEMANTIC_COLORS.info,
  'FUNCIONARIOS Y EMPLEADOS': SEMANTIC_COLORS.info,
  'HUÉSPED': SEMANTIC_COLORS.secondary,
  TUSOSA: SEMANTIC_COLORS.neutral,
  'CORTESÍA': SEMANTIC_COLORS.neutral,
};

// Mismas 15 columnas de COLUMNAS_TABLA_FACTURACION en services/facturacion.py,
// agrupadas visualmente igual que TablaPagosDelMes en PagosRecepcionPage.tsx
// (encabezado de 2 filas: grupo con color + columna individual).
const GRUPOS_COLUMNAS_TABLA_GUARDADA: {
  titulo: string;
  color: string;
  columnas: { clave: keyof FilaFacturacionTablaFormaPago; etiqueta: string }[];
}[] = [
  {
    titulo: 'Identificación',
    color: 'gray',
    columnas: [
      { clave: 'cuenta', etiqueta: 'Cuenta' },
      { clave: 'fecha_texto', etiqueta: 'Fecha' },
      { clave: 'pos', etiqueta: 'POS' },
      { clave: 'forma_de_pago', etiqueta: 'Forma de Pago' },
    ],
  },
  {
    titulo: 'Montos',
    color: 'green',
    columnas: [
      { clave: 'subtotal', etiqueta: 'Subtotal' },
      { clave: 'descuento', etiqueta: 'Descuento' },
      { clave: 'gravado', etiqueta: 'GRAVADO' },
    ],
  },
  {
    titulo: 'Tasa 0%',
    color: 'yellow',
    columnas: [
      { clave: 'ingtasa_0', etiqueta: 'INGTASA 0' },
      { clave: 'desc_tasa_0', etiqueta: 'DESC TASA 0' },
      { clave: 'subtasa_0', etiqueta: 'SUBTASA 0' },
    ],
  },
  {
    titulo: 'Cálculos',
    color: 'teal',
    columnas: [
      { clave: 'iva', etiqueta: 'IVA' },
      { clave: 'propina', etiqueta: 'Propina' },
      { clave: 'pago_proveedor', etiqueta: 'PAGO PROVEDOR' },
      { clave: 'total', etiqueta: 'TOTAL' },
    ],
  },
];

const COLUMNAS_TABLA_GUARDADA = GRUPOS_COLUMNAS_TABLA_GUARDADA.flatMap((grupo) => grupo.columnas);

const COLUMNAS_NUMERICAS_TABLA_GUARDADA = new Set<keyof FilaFacturacionTablaFormaPago>([
  'subtotal', 'descuento', 'gravado', 'ingtasa_0', 'desc_tasa_0', 'subtasa_0', 'iva', 'propina',
  'pago_proveedor', 'total',
]);

// Última columna de cada grupo (salvo el último) — ahí se dibuja el borde
// grueso que separa visualmente Identificación / Montos / Tasa 0% / Cálculos.
const COLUMNAS_CON_SEPARADOR_TABLA_GUARDADA = new Set<keyof FilaFacturacionTablaFormaPago>(
  GRUPOS_COLUMNAS_TABLA_GUARDADA.slice(0, -1).map((grupo) => grupo.columnas[grupo.columnas.length - 1].clave),
);

const formatoMonedaTablaGuardada = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

function formatoTamanoBytes(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function TablaFormaPagoGuardada({ filas }: { filas: FilaFacturacionTablaFormaPago[] }) {
  const totales: Record<string, number> = {};
  for (const columna of COLUMNAS_NUMERICAS_TABLA_GUARDADA) {
    totales[columna] = filas.reduce((suma, fila) => suma + (Number(fila[columna]) || 0), 0);
  }

  return (
    <ScrollArea.Autosize mah={420} type="auto" offsetScrollbars>
      <Table
        striped
        stripedColor="gray.0"
        highlightOnHover
        withTableBorder
        withColumnBorders
        fz="xs"
        horizontalSpacing="xs"
        verticalSpacing={6}
        stickyHeader
      >
        <Table.Thead>
          <Table.Tr>
            {GRUPOS_COLUMNAS_TABLA_GUARDADA.map((grupo, indice) => (
              <Table.Th
                key={grupo.titulo}
                colSpan={grupo.columnas.length}
                ta="center"
                bg={`${grupo.color}.1`}
                fw={700}
                c={`${grupo.color}.9`}
                style={{
                  textTransform: 'uppercase',
                  letterSpacing: 0.3,
                  ...(indice < GRUPOS_COLUMNAS_TABLA_GUARDADA.length - 1 ? BORDE_SEPARADOR_TABLA_GUARDADA : {}),
                }}
              >
                {grupo.titulo}
              </Table.Th>
            ))}
          </Table.Tr>
          <Table.Tr>
            {GRUPOS_COLUMNAS_TABLA_GUARDADA.flatMap((grupo) =>
              grupo.columnas.map((columna) => (
                <Table.Th
                  key={columna.clave}
                  bg={`${grupo.color}.0`}
                  ta={COLUMNAS_NUMERICAS_TABLA_GUARDADA.has(columna.clave) ? 'right' : 'left'}
                  style={
                    COLUMNAS_CON_SEPARADOR_TABLA_GUARDADA.has(columna.clave)
                      ? BORDE_SEPARADOR_TABLA_GUARDADA
                      : undefined
                  }
                >
                  {columna.etiqueta}
                </Table.Th>
              )),
            )}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {filas.map((fila) => (
            <Table.Tr key={fila.id}>
              {COLUMNAS_TABLA_GUARDADA.map((columna) => {
                const valor = fila[columna.clave];
                const esNumerica = COLUMNAS_NUMERICAS_TABLA_GUARDADA.has(columna.clave);
                return (
                  <Table.Td
                    key={columna.clave}
                    ta={esNumerica ? 'right' : 'left'}
                    style={
                      COLUMNAS_CON_SEPARADOR_TABLA_GUARDADA.has(columna.clave)
                        ? BORDE_SEPARADOR_TABLA_GUARDADA
                        : undefined
                    }
                  >
                    {esNumerica ? formatoMonedaTablaGuardada.format(Number(valor) || 0) : (valor ?? '')}
                  </Table.Td>
                );
              })}
            </Table.Tr>
          ))}
        </Table.Tbody>
        <Table.Tfoot>
          <Table.Tr fw={700} bg="gray.2" style={{ borderTop: '2px solid var(--mantine-color-gray-6)' }}>
            {COLUMNAS_TABLA_GUARDADA.map((columna, indice) => (
              <Table.Td
                key={columna.clave}
                ta={COLUMNAS_NUMERICAS_TABLA_GUARDADA.has(columna.clave) ? 'right' : 'left'}
                style={
                  COLUMNAS_CON_SEPARADOR_TABLA_GUARDADA.has(columna.clave)
                    ? BORDE_SEPARADOR_TABLA_GUARDADA
                    : undefined
                }
              >
                {indice === 0
                  ? 'TOTAL'
                  : COLUMNAS_NUMERICAS_TABLA_GUARDADA.has(columna.clave)
                    ? formatoMonedaTablaGuardada.format(totales[columna.clave] ?? 0)
                    : ''}
              </Table.Td>
            ))}
          </Table.Tr>
        </Table.Tfoot>
      </Table>
    </ScrollArea.Autosize>
  );
}

// ── Balanza contable ────────────────────────────────────────────────

// Catálogo de cuentas mexicano: el primer dígito del Código Cuenta indica
// su categoría raíz. "otros" (digito: null) es el bucket de respaldo para
// cualquier código que no empiece en 1-8 — mismo criterio "exhaustivo con
// respaldo" que PUNTOS_VENTA_ANALITICA en services/facturacion.py, aquí en
// frontend porque es una clasificación puramente de presentación.
const CATEGORIAS_BALANZA: { clave: string; etiqueta: string; color: string; digito: string | null }[] = [
  { clave: 'activo', etiqueta: 'Activo', color: 'blue', digito: '1' },
  { clave: 'pasivo', etiqueta: 'Pasivo', color: 'red', digito: '2' },
  { clave: 'capital', etiqueta: 'Capital', color: 'grape', digito: '3' },
  { clave: 'ingresos', etiqueta: 'Ingresos', color: 'teal', digito: '4' },
  { clave: 'costos', etiqueta: 'Costos', color: 'yellow', digito: '5' },
  { clave: 'gastos', etiqueta: 'Gastos', color: 'pink', digito: '6' },
  { clave: 'rif', etiqueta: 'Result. Integral de Financiamiento', color: 'indigo', digito: '7' },
  { clave: 'otros_ing_gastos', etiqueta: 'Otros Ingresos y Gastos', color: 'cyan', digito: '8' },
  { clave: 'otros', etiqueta: 'Otros', color: 'gray', digito: null },
];

function categoriaBalanza(codigo: string): string {
  const primerDigito = codigo.trim().charAt(0);
  return CATEGORIAS_BALANZA.find((c) => c.digito === primerDigito)?.clave ?? 'otros';
}

// Cuenta "mayor" (resumen/padre en la jerarquía, ej. "1", "10", "1000") vs.
// cuenta de detalle (ej. "1000001.001") — se distinguen visualmente para
// que la jerarquía se lea más fácil en una tabla larga.
function esCuentaMayorBalanza(codigo: string): boolean {
  return !codigo.includes('.') && codigo.trim().length <= 4;
}

const GRUPOS_COLUMNAS_BALANZA: { titulo: string; columnas: { clave: keyof CuentaBalanza; etiqueta: string }[] }[] = [
  {
    titulo: 'Identificación',
    columnas: [
      { clave: 'codigo_cuenta', etiqueta: 'Código Cuenta' },
      { clave: 'descripcion', etiqueta: 'Descripción' },
    ],
  },
  {
    titulo: 'Montos',
    columnas: [
      { clave: 'saldo_anterior', etiqueta: 'Saldo Anterior' },
      { clave: 'debitos_mes', etiqueta: 'Débitos Mes' },
      { clave: 'creditos_mes', etiqueta: 'Créditos Mes' },
      { clave: 'saldo_mes', etiqueta: 'Saldo Mes' },
      { clave: 'saldo_actual', etiqueta: 'Saldo Actual' },
    ],
  },
];

const COLUMNAS_BALANZA = GRUPOS_COLUMNAS_BALANZA.flatMap((grupo) => grupo.columnas);

const COLUMNAS_NUMERICAS_BALANZA = new Set<keyof CuentaBalanza>([
  'saldo_anterior', 'debitos_mes', 'creditos_mes', 'saldo_mes', 'saldo_actual',
]);

// Borde grueso entre la identificación de la cuenta y sus montos — mismo
// valor que BORDE_SEPARADOR_TABLA_GUARDADA, constante propia para no acoplar
// dos tablas sin relación entre sí.
const BORDE_SEPARADOR_BALANZA = { borderRight: '2px solid var(--mantine-color-gray-5)' };

const COLUMNAS_CON_SEPARADOR_BALANZA = new Set<keyof CuentaBalanza>(
  GRUPOS_COLUMNAS_BALANZA.slice(0, -1).map((grupo) => grupo.columnas[grupo.columnas.length - 1].clave),
);

function TablaBalanza({ cuentas, colorAcento }: { cuentas: CuentaBalanza[]; colorAcento: string }) {
  const totales: Record<string, number> = {};
  for (const columna of COLUMNAS_NUMERICAS_BALANZA) {
    totales[columna] = cuentas.reduce((suma, c) => suma + (Number(c[columna]) || 0), 0);
  }

  return (
    <ScrollArea.Autosize mah={480} type="auto" offsetScrollbars>
      <Table
        striped
        stripedColor="gray.0"
        highlightOnHover
        withTableBorder
        withColumnBorders
        fz="xs"
        horizontalSpacing="xs"
        verticalSpacing={6}
        stickyHeader
      >
        <Table.Thead>
          <Table.Tr>
            <Table.Th
              colSpan={2}
              ta="center"
              bg="gray.1"
              fw={700}
              c="gray.9"
              style={{ textTransform: 'uppercase', letterSpacing: 0.3, ...BORDE_SEPARADOR_BALANZA }}
            >
              Identificación
            </Table.Th>
            <Table.Th
              colSpan={5}
              ta="center"
              bg={`${colorAcento}.1`}
              fw={700}
              c={`${colorAcento}.9`}
              style={{ textTransform: 'uppercase', letterSpacing: 0.3 }}
            >
              Montos
            </Table.Th>
          </Table.Tr>
          <Table.Tr>
            {COLUMNAS_BALANZA.map((columna) => {
              const esNumerica = COLUMNAS_NUMERICAS_BALANZA.has(columna.clave);
              return (
                <Table.Th
                  key={columna.clave}
                  bg={esNumerica ? `${colorAcento}.0` : 'gray.0'}
                  ta={esNumerica ? 'right' : 'left'}
                  style={COLUMNAS_CON_SEPARADOR_BALANZA.has(columna.clave) ? BORDE_SEPARADOR_BALANZA : undefined}
                >
                  {columna.etiqueta}
                </Table.Th>
              );
            })}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {cuentas.map((c) => {
            const esMayor = esCuentaMayorBalanza(c.codigo_cuenta);
            return (
              <Table.Tr key={c.id} fw={esMayor ? 700 : undefined} bg={esMayor ? 'gray.1' : undefined}>
                {COLUMNAS_BALANZA.map((columna) => {
                  const valor = c[columna.clave];
                  const esNumerica = COLUMNAS_NUMERICAS_BALANZA.has(columna.clave);
                  return (
                    <Table.Td
                      key={columna.clave}
                      ta={esNumerica ? 'right' : 'left'}
                      style={COLUMNAS_CON_SEPARADOR_BALANZA.has(columna.clave) ? BORDE_SEPARADOR_BALANZA : undefined}
                    >
                      {esNumerica ? formatoMonedaTablaGuardada.format(Number(valor) || 0) : (valor ?? '')}
                    </Table.Td>
                  );
                })}
              </Table.Tr>
            );
          })}
        </Table.Tbody>
        <Table.Tfoot>
          <Table.Tr fw={700} bg="gray.2" style={{ borderTop: '2px solid var(--mantine-color-gray-6)' }}>
            {COLUMNAS_BALANZA.map((columna, indice) => {
              const esNumerica = COLUMNAS_NUMERICAS_BALANZA.has(columna.clave);
              return (
                <Table.Td
                  key={columna.clave}
                  ta={esNumerica ? 'right' : 'left'}
                  style={COLUMNAS_CON_SEPARADOR_BALANZA.has(columna.clave) ? BORDE_SEPARADOR_BALANZA : undefined}
                >
                  {indice === 0 ? 'TOTAL' : esNumerica ? formatoMonedaTablaGuardada.format(totales[columna.clave] ?? 0) : ''}
                </Table.Td>
              );
            })}
          </Table.Tr>
        </Table.Tfoot>
      </Table>
    </ScrollArea.Autosize>
  );
}

// Empareja XML y PDF por nombre base (A123.xml + A123.pdf = 1 factura); un
// archivo sin pareja, o un duplicado del mismo tipo, queda como factura
// propia. Ignora cualquier archivo que no sea .xml/.pdf.
function agruparArchivosFactura(archivos: File[]): { xml?: File; pdf?: File }[] {
  const porNombre = new Map<string, { xml?: File; pdf?: File }>();
  const sueltos: { xml?: File; pdf?: File }[] = [];
  for (const archivo of archivos) {
    const ext = archivo.name.split('.').pop()?.toLowerCase();
    if (ext !== 'xml' && ext !== 'pdf') continue;
    const base = archivo.name.replace(/\.[^.]+$/, '').toLowerCase();
    const grupo = porNombre.get(base) ?? {};
    if (grupo[ext]) {
      sueltos.push({ [ext]: archivo });
    } else {
      grupo[ext] = archivo;
      porNombre.set(base, grupo);
    }
  }
  return [...porNombre.values(), ...sueltos];
}

// Sección "Facturas del día": registro suelto de XML/PDF por día, sin
// amarrarlo a ninguna cuenta de las 7 tablas — solo como constancia de que
// ese día se facturó algo (normalmente hasta 4, a veces solo 1).
function SeccionFacturasDia({ periodo }: { periodo: string }) {
  const facturasDia = useListarFacturasDia(periodo);
  const subirFacturaDia = useSubirFacturaDia();
  const descargarFacturaDia = useDescargarFacturaDia();
  const eliminarFacturaDia = useEliminarFacturaDia();

  const [archivosNuevos, setArchivosNuevos] = useState<File[]>([]);
  const [modalAgregarAbierto, setModalAgregarAbierto] = useState(false);
  const [facturaAEliminar, setFacturaAEliminar] = useState<FacturaAdjuntaDia | null>(null);
  const [listaVisible, setListaVisible] = useState(true);
  const archivosInputRef = useRef<HTMLInputElement>(null);

  const gruposNuevos = agruparArchivosFactura(archivosNuevos);

  const agregarArchivos = (seleccion: FileList | null) => {
    if (!seleccion) return;
    setArchivosNuevos((prev) => {
      const yaAgregados = new Set(prev.map((f) => `${f.name}|${f.size}`));
      return [...prev, ...Array.from(seleccion).filter((f) => !yaAgregados.has(`${f.name}|${f.size}`))];
    });
  };

  const cerrarModalAgregar = () => {
    setModalAgregarAbierto(false);
    setArchivosNuevos([]);
  };

  const handleAgregar = async () => {
    if (gruposNuevos.length === 0) return;
    let subidas = 0;
    let fallidas = 0;
    let ultimoError = '';
    for (const grupo of gruposNuevos) {
      try {
        await subirFacturaDia.mutateAsync({ periodo, xml: grupo.xml, pdf: grupo.pdf });
        subidas += 1;
      } catch (err: any) {
        fallidas += 1;
        ultimoError = err.response?.data?.detail || 'Ocurrió un error al subir el archivo.';
      }
    }
    if (fallidas === 0) {
      cerrarModalAgregar();
    } else {
      setArchivosNuevos([]);
    }
    notifications.show({
      title: fallidas === 0 ? 'Facturas registradas' : 'Carga con errores',
      message:
        fallidas === 0
          ? `Se agregaron ${subidas} factura(s) al registro del día.`
          : `${subidas} subida(s), ${fallidas} con error: ${ultimoError}`,
      color: fallidas === 0 ? 'green' : 'red',
      icon: fallidas === 0 ? <IconCheck size={16} /> : <IconX size={16} />,
    });
  };

  const handleDescargar = (id: number, tipo: TipoAdjuntoFactura, nombreOriginal: string | null) => {
    descargarFacturaDia.mutate(
      { id, tipo },
      {
        onSuccess: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = nombreOriginal || `factura.${tipo}`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.URL.revokeObjectURL(url);
        },
        onError: (err: any) => {
          notifications.show({
            title: 'Error al descargar',
            message: err.response?.data?.detail || 'Ocurrió un error al descargar el archivo.',
            color: 'red',
            icon: <IconX size={16} />,
          });
        },
      },
    );
  };

  const handleEliminar = () => {
    if (!facturaAEliminar) return;
    eliminarFacturaDia.mutate(
      { id: facturaAEliminar.id, periodo },
      {
        onSuccess: () => setFacturaAEliminar(null),
        onError: (err: any) => {
          notifications.show({
            title: 'Error al eliminar',
            message: err.response?.data?.detail || 'Ocurrió un error al eliminar la factura.',
            color: 'red',
            icon: <IconX size={16} />,
          });
        },
      },
    );
  };

  const facturas = facturasDia.data?.facturas ?? [];

  return (
    <Card withBorder padding="sm" radius="md" bg="gray.0">
      <Stack gap="xs">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <Text size="sm" fw={600}>
              Facturas del día
            </Text>
            {facturas.length > 0 && (
              <Badge size="xs" variant="light" color="gray">
                {facturas.length}
              </Badge>
            )}
            {facturas.length > 0 && (
              <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => setListaVisible((v) => !v)}>
                {listaVisible ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
              </ActionIcon>
            )}
          </Group>
          <Button size="xs" variant="light" onClick={() => setModalAgregarAbierto(true)}>
            + Agregar factura
          </Button>
        </Group>

        {!facturasDia.isLoading && facturas.length === 0 && (
          <Text size="xs" c="dimmed">
            Sin facturas registradas para este día.
          </Text>
        )}

        {facturas.length > 0 && !listaVisible && (
          <Text size="xs" c="dimmed">
            {facturas.length} factura(s) ocultas — clic en la flecha para mostrarlas.
          </Text>
        )}

        {facturas.length > 0 && listaVisible && (
          <Stack gap={6}>
            {facturas.map((factura) => (
              <Group key={factura.id} justify="space-between" gap="xs" wrap="nowrap">
                <Group gap={6} wrap="nowrap">
                  {factura.xml_nombre_original && (
                    <Tooltip label={`${factura.xml_nombre_original} (${formatoTamanoBytes(factura.xml_tamano_bytes)})`}>
                      <ActionIcon
                        variant="light"
                        color="blue"
                        size="sm"
                        onClick={() => handleDescargar(factura.id, 'xml', factura.xml_nombre_original)}
                      >
                        <IconFileTypeXml size={14} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  {factura.pdf_nombre_original && (
                    <Tooltip label={`${factura.pdf_nombre_original} (${formatoTamanoBytes(factura.pdf_tamano_bytes)})`}>
                      <ActionIcon
                        variant="light"
                        color="red"
                        size="sm"
                        onClick={() => handleDescargar(factura.id, 'pdf', factura.pdf_nombre_original)}
                      >
                        <IconFileTypePdf size={14} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  <Text size="xs" c="dimmed">
                    {factura.xml_nombre_original || factura.pdf_nombre_original}
                  </Text>
                </Group>
                <ActionIcon variant="subtle" color="red" size="sm" onClick={() => setFacturaAEliminar(factura)}>
                  <IconX size={12} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>
        )}
      </Stack>

      <Modal
        opened={modalAgregarAbierto}
        onClose={cerrarModalAgregar}
        title={<Text fw={600}>Agregar facturas del día</Text>}
      >
        <Stack gap="md">
          <Text size="xs" c="dimmed">
            Elige todos los XML y PDF que quieras a la vez. Los que tengan el mismo nombre (ej. A123.xml y
            A123.pdf) se registran como una sola factura.
          </Text>
          <Group gap="sm">
            <Button variant="default" size="xs" onClick={() => archivosInputRef.current?.click()}>
              {archivosNuevos.length > 0 ? 'Agregar más archivos' : 'Elegir archivos'}
            </Button>
            <input
              ref={archivosInputRef}
              type="file"
              accept=".xml,.pdf"
              multiple
              hidden
              onChange={(e) => {
                agregarArchivos(e.target.files);
                e.target.value = '';
              }}
            />
          </Group>
          {gruposNuevos.length > 0 && (
            <ScrollArea.Autosize mah={240}>
              <Stack gap={4}>
                {gruposNuevos.map((grupo, indice) => (
                  <Group key={indice} gap={6} wrap="nowrap">
                    {grupo.xml && <IconFileTypeXml size={14} color="var(--mantine-color-blue-6)" />}
                    {grupo.pdf && <IconFileTypePdf size={14} color="var(--mantine-color-red-6)" />}
                    <Text size="xs" truncate>
                      {(grupo.xml ?? grupo.pdf)!.name}
                    </Text>
                  </Group>
                ))}
              </Stack>
            </ScrollArea.Autosize>
          )}
          <Group justify="space-between" gap="sm">
            <Text size="xs" c="dimmed">
              {gruposNuevos.length > 0 ? `${gruposNuevos.length} factura(s) por registrar` : ''}
            </Text>
            <Group gap="sm">
              <Button variant="default" onClick={cerrarModalAgregar}>
                Cancelar
              </Button>
              <Button
                disabled={gruposNuevos.length === 0}
                loading={subirFacturaDia.isPending}
                onClick={handleAgregar}
              >
                Guardar
              </Button>
            </Group>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={!!facturaAEliminar}
        onClose={() => setFacturaAEliminar(null)}
        title={<Text fw={600} c="red">Eliminar factura</Text>}
      >
        <Stack gap="md">
          <Text size="sm">
            ¿Eliminar esta factura del registro del día? Esta acción no se puede deshacer.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setFacturaAEliminar(null)}>
              Cancelar
            </Button>
            <Button color="red" loading={eliminarFacturaDia.isPending} onClick={handleEliminar}>
              Eliminar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}

// Réplica, en el frontend, de los 4 bloques que agrega_pue_ppd_tablas_forma_pago
// (excel_processor.py) escribe en el Excel del Paso 2 — Cuenta + 2 columnas
// numéricas, con fila TOTAL. Se calculan aquí porque cada fila guardada ya
// trae su categoria_pue_ppd (calculado al guardar), sin necesidad de tocar
// el backend.
function TablaResumenPuePpd({
  titulo,
  color,
  filas,
  columnas,
}: {
  titulo: string;
  color: string;
  filas: FilaFacturacionTablaFormaPago[];
  columnas: { clave: keyof FilaFacturacionTablaFormaPago; etiqueta: string }[];
}) {
  const totales = columnas.map((columna) =>
    filas.reduce((suma, fila) => suma + (Number(fila[columna.clave]) || 0), 0),
  );

  return (
    <Stack gap={6}>
      <Group gap="xs">
        <Text size="sm" fw={700} c={`${color}.8`}>
          {titulo}
        </Text>
        <Badge size="xs" variant="light" color={color}>
          {filas.length} cuenta(s)
        </Badge>
      </Group>
      {filas.length === 0 ? (
        <Text size="xs" c="dimmed">
          Sin filas.
        </Text>
      ) : (
        <ScrollArea.Autosize mah={280} type="auto" offsetScrollbars>
          <Table
            striped
            stripedColor="gray.0"
            highlightOnHover
            withColumnBorders
            withTableBorder
            fz="xs"
            horizontalSpacing="xs"
            verticalSpacing={6}
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th bg={`${color}.0`}>Cuenta</Table.Th>
                {columnas.map((columna) => (
                  <Table.Th key={columna.clave} bg={`${color}.0`} ta="right">
                    {columna.etiqueta}
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filas.map((fila) => (
                <Table.Tr key={fila.id}>
                  <Table.Td>{fila.cuenta ?? ''}</Table.Td>
                  {columnas.map((columna) => (
                    <Table.Td key={columna.clave} ta="right">
                      {formatoMonedaTablaGuardada.format(Number(fila[columna.clave]) || 0)}
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr fw={700} bg="gray.2" style={{ borderTop: '2px solid var(--mantine-color-gray-6)' }}>
                <Table.Td>TOTAL</Table.Td>
                {totales.map((total, indice) => (
                  <Table.Td key={columnas[indice].clave} ta="right">
                    {formatoMonedaTablaGuardada.format(total)}
                  </Table.Td>
                ))}
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        </ScrollArea.Autosize>
      )}
    </Stack>
  );
}

// Resultados del buscador de "Base de Datos": filas de cualquier día que
// coincidan con el texto buscado (ver useBuscarTablasFormaPago), listadas
// con su fecha ya que pueden venir de días distintos — a diferencia de
// TablaFormaPagoGuardada (una sola tabla de un día ya elegido), aquí la
// fecha es el dato que hay que mostrar para ubicar cada coincidencia.
function TablaResultadosBusqueda({ filas }: { filas: FilaFacturacionTablaFormaPago[] }) {
  const total = filas.reduce((acc, f) => acc + f.total, 0);

  return (
    <ScrollArea.Autosize mah={420} type="auto" offsetScrollbars>
      <Table striped stripedColor="gray.0" highlightOnHover withTableBorder withColumnBorders fz="xs" verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th bg="gray.1">Fecha</Table.Th>
            <Table.Th bg="gray.1">Tabla de origen</Table.Th>
            <Table.Th bg="gray.1">Cuenta</Table.Th>
            <Table.Th bg="gray.1">POS</Table.Th>
            <Table.Th bg="gray.1">Forma de Pago</Table.Th>
            <Table.Th bg="gray.1" ta="right">Total</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {filas.map((fila) => (
            <Table.Tr key={fila.id}>
              <Table.Td>{fila.periodo}</Table.Td>
              <Table.Td>
                <Badge variant="light" color={COLOR_TABLA_FORMA_PAGO[fila.tabla_origen] ?? 'gray'}>
                  {fila.tabla_origen}
                </Badge>
              </Table.Td>
              <Table.Td>{fila.cuenta ?? ''}</Table.Td>
              <Table.Td>{fila.pos ?? ''}</Table.Td>
              <Table.Td>{fila.forma_de_pago ?? ''}</Table.Td>
              <Table.Td ta="right">{formatoMonedaTablaGuardada.format(fila.total)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
        <Table.Tfoot>
          <Table.Tr fw={700} bg="gray.2" style={{ borderTop: '2px solid var(--mantine-color-gray-6)' }}>
            <Table.Td colSpan={5}>TOTAL</Table.Td>
            <Table.Td ta="right">{formatoMonedaTablaGuardada.format(total)}</Table.Td>
          </Table.Tr>
        </Table.Tfoot>
      </Table>
    </ScrollArea.Autosize>
  );
}

function fechaAIso(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

function isoAFecha(texto: string): Date | null {
  return texto ? new Date(`${texto}T00:00:00`) : null;
}

// Valor tal como se muestra/edita en la tabla: string en el input, se
// convierte a número al armar el payload de ediciones si aplica.
type FilaEditable = Record<string, string>;

function valorACelda(valor: string | number | null): string {
  if (valor === null || valor === undefined) return '';
  return String(valor);
}

function valorParaEnviar(texto: string): string | number {
  const texto_trim = texto.trim();
  if (texto_trim !== '' && !Number.isNaN(Number(texto_trim))) {
    return Number(texto_trim);
  }
  return texto;
}

// Calculadora aritmética simple tipo Excel para las celdas de la tabla
// editable: soporta +, -, *, /, paréntesis, decimales y negativos. No es un
// motor de fórmulas de Excel (no hay referencias entre celdas tipo "=G2*0.16"
// — no se pidió eso), solo evalúa la expresión aritmética que el usuario
// escribió para no tener que sacar la cuenta aparte. No usa eval() de
// JavaScript: parser recursivo-descendente propio, así que una cadena
// inválida simplemente no calza con la gramática y devuelve null en vez de
// ejecutar código arbitrario.
function evaluarFormula(texto: string): number | null {
  let expresion = texto.trim();
  if (expresion.startsWith('=')) {
    expresion = expresion.slice(1).trim();
  }
  if (expresion === '') return null;

  let pos = 0;

  const error = (): null => null;

  function saltarEspacios() {
    while (pos < expresion.length && expresion[pos] === ' ') pos++;
  }

  function parseNumero(): number | null {
    saltarEspacios();
    const inicio = pos;
    if (expresion[pos] === '+' || expresion[pos] === '-') pos++;
    let tieneDigitos = false;
    while (pos < expresion.length && /[0-9]/.test(expresion[pos])) {
      pos++;
      tieneDigitos = true;
    }
    if (expresion[pos] === '.') {
      pos++;
      while (pos < expresion.length && /[0-9]/.test(expresion[pos])) {
        pos++;
        tieneDigitos = true;
      }
    }
    if (!tieneDigitos) {
      pos = inicio;
      return null;
    }
    return Number(expresion.slice(inicio, pos));
  }

  function parseFactor(): number | null {
    saltarEspacios();
    if (expresion[pos] === '(') {
      pos++;
      const valor = parseExpresion();
      if (valor === null) return null;
      saltarEspacios();
      if (expresion[pos] !== ')') return null;
      pos++;
      return valor;
    }
    if (expresion[pos] === '-') {
      pos++;
      const valor = parseFactor();
      return valor === null ? null : -valor;
    }
    if (expresion[pos] === '+') {
      pos++;
      return parseFactor();
    }
    return parseNumero();
  }

  function parseTermino(): number | null {
    let valor = parseFactor();
    if (valor === null) return null;
    saltarEspacios();
    while (expresion[pos] === '*' || expresion[pos] === '/') {
      const operador = expresion[pos];
      pos++;
      const siguiente = parseFactor();
      if (siguiente === null) return null;
      valor = operador === '*' ? valor * siguiente : valor / siguiente;
      saltarEspacios();
    }
    return valor;
  }

  function parseExpresion(): number | null {
    let valor = parseTermino();
    if (valor === null) return null;
    saltarEspacios();
    while (expresion[pos] === '+' || expresion[pos] === '-') {
      const operador = expresion[pos];
      pos++;
      const siguiente = parseTermino();
      if (siguiente === null) return null;
      valor = operador === '+' ? valor + siguiente : valor - siguiente;
      saltarEspacios();
    }
    return valor;
  }

  const resultado = parseExpresion();
  saltarEspacios();
  if (resultado === null || pos !== expresion.length || !Number.isFinite(resultado)) {
    return error();
  }
  return resultado;
}

// Heurística para decidir si vale la pena intentar evaluar: empieza con "="
// (convención Excel) o tiene al menos un operador aritmético entre números.
function pareceFormula(texto: string): boolean {
  const texto_trim = texto.trim();
  if (texto_trim === '') return false;
  if (texto_trim.startsWith('=')) return true;
  return /[0-9)][\s]*[+\-*/][\s]*[0-9(.-]/.test(texto_trim) && /^[0-9+\-*/().\s]+$/.test(texto_trim);
}

// Solo para mostrar en el encabezado de la tabla — "PAGO PROVEDOR" se ve
// como "Pago Provedor". No toca la clave real (se sigue usando tal cual en
// valoresEditados/ediciones).
function formatearEncabezado(nombre: string): string {
  return nombre
    .toLowerCase()
    .split(' ')
    .map((palabra) => (palabra ? palabra.charAt(0).toUpperCase() + palabra.slice(1) : palabra))
    .join(' ');
}

const estiloCeldaInput: CSSProperties = {
  width: '100%',
  minWidth: 90,
  border: '1px solid var(--mantine-color-gray-4)',
  borderRadius: 4,
  background: 'var(--mantine-color-body)',
  padding: '3px 6px',
  fontFamily: 'inherit',
  fontSize: 13,
  color: 'inherit',
  outline: 'none',
  transition: 'border-color 120ms ease, box-shadow 120ms ease',
};

interface ArchivoDropzoneProps {
  titulo: string;
  descripcion: string;
  file: File | null;
  onDrop: (file: File) => void;
  onRemove: () => void;
}

function ArchivoDropzone({ titulo, descripcion, file, onDrop, onRemove }: ArchivoDropzoneProps) {
  return (
    <Stack gap={6}>
      <div>
        <Text size="sm" fw={600}>
          {titulo}
        </Text>
        <Text size="xs" c="dimmed">
          {descripcion}
        </Text>
      </div>

      {file ? (
        <Group
          justify="space-between"
          wrap="nowrap"
          p="xs"
          style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}
        >
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            <IconFileInvoice size={18} color="var(--mantine-color-blue-6)" style={{ flexShrink: 0 }} />
            <Text size="sm" fw={500} truncate>
              {file.name}
            </Text>
          </Group>
          <Button variant="subtle" color="red" size="xs" onClick={onRemove}>
            Quitar
          </Button>
        </Group>
      ) : (
        <Dropzone
          onDrop={(files) => onDrop(files[0])}
          accept={MS_EXCEL_MIME_TYPE}
          maxSize={50 * 1024 * 1024}
          maxFiles={1}
          p="xs"
        >
          <Group justify="center" gap="sm" mih={64} style={{ pointerEvents: 'none' }}>
            <Dropzone.Accept>
              <IconUpload size={22} stroke={1.5} color="var(--mantine-color-blue-6)" />
            </Dropzone.Accept>
            <Dropzone.Reject>
              <IconX size={22} stroke={1.5} color="var(--mantine-color-red-6)" />
            </Dropzone.Reject>
            <Dropzone.Idle>
              <IconFileSpreadsheet size={22} stroke={1.5} color="var(--mantine-color-dimmed)" />
            </Dropzone.Idle>
            <Text size="sm" c="dimmed" inline>
              Arrastra el archivo o haz clic
            </Text>
          </Group>
        </Dropzone>
      )}
    </Stack>
  );
}

interface EncabezadoPasoProps {
  numero: number;
  color: string;
  titulo: string;
  descripcion: string;
}

function EncabezadoPaso({ numero, color, titulo, descripcion }: EncabezadoPasoProps) {
  return (
    <Group gap="sm" wrap="nowrap" align="flex-start">
      <ThemeIcon size={32} radius="xl" color={color} variant="filled" style={{ flexShrink: 0 }}>
        <Text fw={700} size="sm">
          {numero}
        </Text>
      </ThemeIcon>
      <div>
        <Title order={3}>{titulo}</Title>
        <Text c="dimmed" size="sm">
          {descripcion}
        </Text>
      </div>
    </Group>
  );
}

function TarjetaKpiFacturacion({ titulo, valor, color }: { titulo: string; valor: string; color?: string }) {
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

function etiquetaMesFacturacion(mes: string) {
  const [anio, mesNum] = mes.split('-').map(Number);
  const fecha = new Date(anio, mesNum - 1, 1);
  const etiqueta = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(fecha);
  return etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1);
}

// Un color distinto por categoría (no agrupado por PUE/PPD como
// COLOR_TABLA_FORMA_PAGO) — en una gráfica de barras apiladas/leyenda,
// colores repetidos entre categorías las vuelve indistinguibles.
// "tituloTabla" es el nombre canónico guardado en tabla_origen (BD) —
// necesario para exportar por categoría (/export-categoria), ya que la
// "etiqueta" mostrada es una versión corta/bonita que no coincide 1:1.
const CLAVES_TABLA_ANALITICA: {
  clave: keyof SerieDiariaFacturacionAnalitica;
  etiqueta: string;
  color: string;
  tituloTabla: string;
}[] = [
  { clave: 'efectivo', etiqueta: 'Efectivo', color: 'var(--mantine-color-green-7)', tituloTabla: 'EFECTIVO' },
  { clave: 'visa_mastercard', etiqueta: 'Visa/Mastercard', color: 'var(--mantine-color-blue-7)', tituloTabla: 'VISA / MASTERCARD' },
  { clave: 'american_express', etiqueta: 'American Express', color: 'var(--mantine-color-cyan-7)', tituloTabla: 'AMERICAN EXPRESS' },
  { clave: 'funcionarios_y_empleados', etiqueta: 'Funcionarios', color: 'var(--mantine-color-indigo-6)', tituloTabla: 'FUNCIONARIOS Y EMPLEADOS' },
  { clave: 'huesped', etiqueta: 'Huésped', color: 'var(--mantine-color-grape-6)', tituloTabla: 'HUÉSPED' },
  { clave: 'tusosa', etiqueta: 'TUSOSA', color: 'var(--mantine-color-orange-7)', tituloTabla: 'TUSOSA' },
  { clave: 'cortesia', etiqueta: 'Cortesía', color: 'var(--mantine-color-pink-6)', tituloTabla: 'CORTESÍA' },
];

// Colores por punto de venta — mismas claves que PUNTOS_VENTA_ANALITICA en
// services/facturacion.py (backend), paleta distinta a CLAVES_TABLA_ANALITICA
// de arriba para no confundir ambas gráficas.
const COLOR_PUNTO_VENTA: Record<string, string> = {
  hacienda: 'var(--mantine-color-blue-7)',
  cafeteria: 'var(--mantine-color-orange-6)',
  carreta: 'var(--mantine-color-teal-6)',
  agencia: `var(--mantine-color-${SEMANTIC_COLORS.brand}-6)`,
  palapa: 'var(--mantine-color-orange-8)',
  sobrante: `var(--mantine-color-${SEMANTIC_COLORS.neutral}-6)`,
  recepcion: `var(--mantine-color-${SEMANTIC_COLORS.secondary}-6)`,
};

// Color por grupo del desglose "Balanza vs Ventas por punto de venta" —
// mismo criterio que GRUPOS_COLUMNAS_TABLA_GUARDADA (verde=Montos/Gravado,
// amarillo=Tasa 0%), gris para "Otros".
const COLOR_GRUPO_DETALLE_BALANZA: Record<string, string> = {
  Gravado: 'green',
  Ingresos: 'green',
  Alimentos: 'green',
  Restaurante: 'green',
  'Boletos Tours': 'green',
  'Tasa 0%': 'yellow',
  Descuentos: 'red',
  Bar: 'indigo',
  'Actividades Especiales': 'teal',
  Otros: 'gray',
};

// Solo los 4 puntos de venta ya mapeados en MAPEO_BALANZA_POR_PUNTO_VENTA
// (backend, services/facturacion.py) se muestran en "Desglose contable
// (Balanza)" — Sobrante/Recepción no se necesitan ahí, por pedido
// explícito del usuario (ni siquiera como "no configurado").
const PUNTOS_VENTA_CON_DESGLOSE_BALANZA = new Set(['hacienda', 'cafeteria', 'carreta_palapa', 'agencia']);

// Tolerancia para considerar "conciliado" un punto de venta — mismo
// criterio ya usado en todo este desglose: unos cuantos pesos de
// diferencia son esperados (montos compartidos entre puntos de venta,
// redondeos), no un error real.
const TOLERANCIA_DIFERENCIA_BALANZA = 5;

// Tabla agrupada por color (Gravado/Ingresos/Bar/etc.) de un desglose ya
// resuelto — separada del Accordion.Item para que este último pueda
// mostrar el resumen (calculado/balanza/diferencia) directamente en su
// Control, sin depender de que el panel esté expandido.
function TablaGruposDetalleBalanza({ grupos, total }: { grupos: GrupoDetalleBalanzaPuntoVenta[]; total: number }) {
  return (
    <ScrollArea.Autosize mah={360} type="auto" offsetScrollbars>
      <Table striped stripedColor="gray.0" fz="xs" horizontalSpacing="sm" verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Código Cuenta</Table.Th>
            <Table.Th>Cuenta</Table.Th>
            <Table.Th ta="right">Saldo Mes (Balanza)</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {grupos.map((grupo) => {
            const color = COLOR_GRUPO_DETALLE_BALANZA[grupo.grupo] ?? 'gray';
            return (
              <Fragment key={grupo.grupo}>
                <Table.Tr style={{ borderLeft: `4px solid var(--mantine-color-${color}-6)` }}>
                  <Table.Td colSpan={2} fw={700}>
                    <Group gap={8} wrap="nowrap">
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: `var(--mantine-color-${color}-6)`,
                          flexShrink: 0,
                        }}
                      />
                      {grupo.grupo}
                    </Group>
                  </Table.Td>
                  <Table.Td ta="right" fw={700}>
                    {formatoMonedaTablaGuardada.format(grupo.subtotal)}
                  </Table.Td>
                </Table.Tr>
                {grupo.cuentas.map((c) => (
                  <Table.Tr key={c.codigo_cuenta}>
                    <Table.Td c="dimmed">{c.codigo_cuenta}</Table.Td>
                    <Table.Td>
                      {c.etiqueta}
                      {!c.encontrada && (
                        <Text span size="xs" c="red">
                          {' '}
                          (no encontrada en la balanza actual)
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td ta="right">
                      {c.saldo_mes != null ? formatoMonedaTablaGuardada.format(c.saldo_mes) : '—'}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Fragment>
            );
          })}
          <Table.Tr bg="gray.1" style={{ borderTop: '2px solid var(--mantine-color-gray-6)' }}>
            <Table.Td colSpan={2} fw={700}>
              TOTAL (Balanza)
            </Table.Td>
            <Table.Td ta="right" fw={700}>
              {formatoMonedaTablaGuardada.format(total)}
            </Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>
    </ScrollArea.Autosize>
  );
}

// Pequeña etiqueta+valor apilados — usado para "Calculado"/"Balanza" en la
// tarjeta de reconciliación de cada punto de venta.
function MiniEstadisticaBalanza({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <Stack gap={0} align="flex-end">
      <Text size="9px" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: 0.3 }}>
        {etiqueta}
      </Text>
      <Text size="sm" fw={600}>
        {valor}
      </Text>
    </Stack>
  );
}

// Un punto de venta del desglose "Balanza vs Ventas por punto de venta" —
// tarjeta de reconciliación (ícono + nombre + calculado/balanza/diferencia,
// siempre visibles en el Control) que expande a la tabla agrupada por
// cuenta. Componente de presentación puro: `detalle`/`isLoading` se
// resuelven en PanelAnaliticaFacturacion (los 4 hooks de detalle se
// llaman ahí, una vez cada uno, para poder calcular también la alerta
// agregada de "diferencia alta" sin duplicar las consultas).
function AccordionItemDetalleBalanza({
  clave,
  etiqueta,
  montoCalculado,
  detalle,
  isLoading,
}: {
  clave: string;
  etiqueta: string;
  montoCalculado: number;
  detalle: DetalleBalanzaPuntoVenta | undefined;
  isLoading: boolean;
}) {
  const data = detalle;
  const disponible = data?.disponible === true;
  const total = data?.disponible ? data.total : null;
  const diferencia = total != null ? montoCalculado - total : null;
  const dentroDeTolerancia = diferencia != null && Math.abs(diferencia) <= TOLERANCIA_DIFERENCIA_BALANZA;
  const colorEstado = disponible
    ? dentroDeTolerancia
      ? SEMANTIC_COLORS.success
      : SEMANTIC_COLORS.warning
    : SEMANTIC_COLORS.neutral;

  return (
    <Accordion.Item value={clave} style={{ borderLeft: `4px solid var(--mantine-color-${colorEstado}-6)` }}>
      <Accordion.Control>
        <Group justify="space-between" wrap="wrap" pr="sm" gap="md">
          <Group gap={10} wrap="nowrap">
            {disponible ? (
              dentroDeTolerancia ? (
                <IconCheck size={18} color={`var(--mantine-color-${colorEstado}-6)`} />
              ) : (
                <IconAlertTriangle size={18} color={`var(--mantine-color-${colorEstado}-6)`} />
              )
            ) : (
              <IconInfoCircle size={18} color="var(--mantine-color-gray-5)" />
            )}
            <Text fw={700} size="sm">
              {etiqueta}
            </Text>
          </Group>
          {disponible && total != null && diferencia != null ? (
            <Group gap="lg" wrap="wrap">
              <MiniEstadisticaBalanza etiqueta="Calculado" valor={formatoMonedaTablaGuardada.format(montoCalculado)} />
              <MiniEstadisticaBalanza etiqueta="Balanza" valor={formatoMonedaTablaGuardada.format(total)} />
              <Badge color={colorEstado} variant="light" radius="sm">
                Diferencia: {formatoMonedaTablaGuardada.format(diferencia)}
              </Badge>
            </Group>
          ) : (
            <Text size="xs" c="dimmed">
              {isLoading ? 'Cargando...' : 'Sin desglose configurado'}
            </Text>
          )}
        </Group>
      </Accordion.Control>
      <Accordion.Panel>
        {data?.disponible ? (
          <TablaGruposDetalleBalanza grupos={data.grupos} total={data.total} />
        ) : (
          <Text size="xs" c="dimmed">
            Este desglose todavía no está configurado.
          </Text>
        )}
      </Accordion.Panel>
    </Accordion.Item>
  );
}

// Réplica, para Facturación, de PanelAnalitica en PagosRecepcionPage.tsx —
// mismo patrón: selector de mes, KPIs, tendencia diaria, desglose por
// categoría y comparación entre meses.
function PanelAnaliticaFacturacion() {
  const analitica = useAnaliticaTablasFormaPago();
  const exportarCategoria = useExportarCategoriaTablaFormaPago();
  const serie = analitica.data?.serie_diaria ?? [];
  const kpis = analitica.data?.kpis;

  const mesActual = new Date().toISOString().slice(0, 7);
  const [mesSeleccionado, setMesSeleccionado] = useState(mesActual);
  const ventasPorPos = useVentasPorPosFacturacion(mesSeleccionado);
  const balanza = useObtenerBalanza();
  const detalleHacienda = useDetalleBalanzaPuntoVenta('hacienda');
  const detalleCafeteria = useDetalleBalanzaPuntoVenta('cafeteria');
  const detalleCarretaPalapa = useDetalleBalanzaPuntoVenta('carreta_palapa');
  const detalleAgencia = useDetalleBalanzaPuntoVenta('agencia');
  const detallesPorClaveBalanza: Record<string, ReturnType<typeof useDetalleBalanzaPuntoVenta>> = {
    hacienda: detalleHacienda,
    cafeteria: detalleCafeteria,
    carreta_palapa: detalleCarretaPalapa,
    agencia: detalleAgencia,
  };
  const [categoriasOcultas, setCategoriasOcultas] = useState<Set<string>>(new Set());
  const [categoriaExportando, setCategoriaExportando] = useState<string | null>(null);

  const toggleCategoriaOculta = (clave: string) => {
    setCategoriasOcultas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(clave)) siguiente.delete(clave);
      else siguiente.add(clave);
      return siguiente;
    });
  };

  const executeExportarCategoria = (tituloTabla: string, mes: string) => {
    setCategoriaExportando(tituloTabla);
    exportarCategoria.mutate(
      { mes, tablaOrigen: tituloTabla },
      {
        onSuccess: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `Tablas_Forma_Pago_${tituloTabla}_${mes}.xlsx`.replace(/ /g, '_').replace(/\//g, '-');
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.URL.revokeObjectURL(url);
          setCategoriaExportando(null);
          notifications.show({
            title: 'Exportado',
            message: `Se descargó el Excel de ${tituloTabla}.`,
            color: 'green',
            icon: <IconCheck size={16} />,
          });
        },
        onError: (err: any) => {
          setCategoriaExportando(null);
          notifications.show({
            title: 'Error al exportar',
            message: err.response?.data?.detail || 'Ocurrió un error al generar el Excel.',
            color: 'red',
            icon: <IconX size={16} />,
          });
        },
      },
    );
  };

  if (analitica.isLoading) {
    return (
      <Text size="sm" c="dimmed">
        Cargando analítica...
      </Text>
    );
  }

  if (!kpis || kpis.dias_registrados === 0) {
    return (
      <Alert icon={<IconInfoCircle size={18} />} color="blue">
        Aún no hay días guardados en "Base de Datos" — la analítica aparecerá aquí conforme se vaya guardando el
        detalle de Tablas_Forma_Pago de cada día.
      </Alert>
    );
  }

  const mesesConDatos = Array.from(new Set(serie.map((d) => d.periodo.slice(0, 7))));
  const mesesDisponibles = Array.from(new Set([mesActual, ...mesesConDatos])).sort().reverse();

  const diasDelMes = serie.filter((dia) => dia.periodo.slice(0, 7) === mesSeleccionado);
  const totalMes = diasDelMes.reduce((acc, d) => acc + d.total, 0);
  const ivaMes = diasDelMes.reduce((acc, d) => acc + d.iva, 0);
  const promedioDiarioMes = diasDelMes.length ? totalMes / diasDelMes.length : 0;
  const pueMes = diasDelMes.reduce((acc, d) => acc + d.pue, 0);
  const ppdMes = diasDelMes.reduce((acc, d) => acc + d.ppd, 0);
  const totalPuePpdMes = pueMes + ppdMes;

  const resumenPorTabla = CLAVES_TABLA_ANALITICA.map((tabla) => ({
    ...tabla,
    total: diasDelMes.reduce((acc, d) => acc + (Number(d[tabla.clave]) || 0), 0),
    cuentas: diasDelMes.reduce(
      (acc, d) => acc + (Number(d[`${tabla.clave}_cuentas` as keyof SerieDiariaFacturacionAnalitica]) || 0),
      0,
    ),
  }));
  const totalTablasMes = resumenPorTabla.reduce((acc, t) => acc + t.total, 0);

  const totalesPorMes = mesesConDatos
    .sort()
    .map((mes) => ({
      mes: etiquetaMesFacturacion(mes),
      total: serie.filter((d) => d.periodo.slice(0, 7) === mes).reduce((acc, d) => acc + d.total, 0),
    }));

  const pueYPpdPorMes = mesesConDatos
    .sort()
    .map((mes) => {
      const diasMes = serie.filter((d) => d.periodo.slice(0, 7) === mes);
      return {
        mes: etiquetaMesFacturacion(mes),
        pue: diasMes.reduce((acc, d) => acc + d.pue, 0),
        ppd: diasMes.reduce((acc, d) => acc + d.ppd, 0),
      };
    });

  // La Carreta y Restaurant La Palapa comparten la cuenta de Bar en la
  // Balanza — se muestran juntos en un solo item del desglose (clave
  // sintética "carreta_palapa" en MAPEO_BALANZA_POR_PUNTO_VENTA) para que
  // no se vea la diferencia de ~$265 que cada uno tiene por separado.
  const puntosVentaParaDesgloseBalanza = (() => {
    const puntos = ventasPorPos.data?.puntos_venta ?? [];
    const carreta = puntos.find((p) => p.clave === 'carreta');
    const palapa = puntos.find((p) => p.clave === 'palapa');
    const resultado: { clave: string; etiqueta: string; monto: number }[] = [];
    for (const punto of puntos) {
      if (punto.clave === 'palapa') continue;
      if (punto.clave === 'carreta') {
        resultado.push({
          clave: 'carreta_palapa',
          etiqueta: 'La Carreta Mariscos + Restaurant La Palapa',
          monto: (carreta?.monto ?? 0) + (palapa?.monto ?? 0),
        });
        continue;
      }
      resultado.push(punto);
    }
    return resultado;
  })();

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Text size="sm" c="dimmed">
          Histórico completo: {formatoMonedaTablaGuardada.format(kpis.total_historico)} en {kpis.dias_registrados}{' '}
          día(s) guardado(s)
        </Text>
        <Select
          label="Mes"
          value={mesSeleccionado}
          onChange={(valor) => valor && setMesSeleccionado(valor)}
          data={mesesDisponibles.map((mes) => ({ value: mes, label: etiquetaMesFacturacion(mes) }))}
          w={220}
          allowDeselect={false}
        />
      </Group>

      {diasDelMes.length === 0 ? (
        <Alert icon={<IconInfoCircle size={18} />} color="blue">
          Aún no hay días guardados para {etiquetaMesFacturacion(mesSeleccionado)}.
        </Alert>
      ) : (
        <>
          <SimpleGrid cols={{ base: 2, sm: 4 }}>
            <TarjetaKpiFacturacion
              titulo={`Total ${etiquetaMesFacturacion(mesSeleccionado)}`}
              valor={formatoMonedaTablaGuardada.format(totalMes)}
            />
            <TarjetaKpiFacturacion titulo="Días guardados" valor={String(diasDelMes.length)} />
            <TarjetaKpiFacturacion titulo="Promedio diario" valor={formatoMonedaTablaGuardada.format(promedioDiarioMes)} />
            <TarjetaKpiFacturacion titulo="IVA del mes" valor={formatoMonedaTablaGuardada.format(ivaMes)} color="teal" />
          </SimpleGrid>

          <Card withBorder padding="lg">
            <Stack gap="sm">
              <Text fw={600} size="sm" tt="uppercase" c="dimmed">
                Ventas por punto de venta — {etiquetaMesFacturacion(mesSeleccionado)}
              </Text>
              <Group justify="space-between" align="flex-end" wrap="wrap">
                <Text size="xs" c="dimmed">
                  Ingresos reales por punto de venta.
                </Text>
                <Text size="sm" fw={700}>
                  Total:{' '}
                  {formatoMonedaTablaGuardada.format(
                    (ventasPorPos.data?.puntos_venta ?? []).reduce((acc, p) => acc + p.monto, 0),
                  )}
                </Text>
              </Group>
              {ventasPorPos.isLoading ? (
                <Text size="sm" c="dimmed">
                  Cargando...
                </Text>
              ) : (
                <div style={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer>
                    <BarChart data={ventasPorPos.data?.puntos_venta ?? []} margin={{ top: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} interval={0} />
                      <YAxis tick={{ fontSize: 12 }} width={80} tickFormatter={(v) => formatoMonedaTablaGuardada.format(v)} />
                      <RechartsTooltip formatter={(value) => formatoMonedaTablaGuardada.format(Number(value))} />
                      <Bar dataKey="monto">
                        {(ventasPorPos.data?.puntos_venta ?? []).map((punto) => (
                          <Cell key={punto.clave} fill={COLOR_PUNTO_VENTA[punto.clave] ?? `var(--mantine-color-${SEMANTIC_COLORS.neutral}-6)`} />
                        ))}
                        <LabelList
                          dataKey="monto"
                          position="top"
                          formatter={(value: unknown) => formatoMonedaTablaGuardada.format(Number(value) || 0)}
                          style={{ fontSize: 11, fill: 'var(--mantine-color-dimmed)' }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Stack>
          </Card>

          <Card withBorder padding="lg">
            <Stack gap="sm">
              <Group gap={8}>
                <IconScale size={16} color="var(--mantine-color-dimmed)" />
                <Text fw={600} size="sm" tt="uppercase" c="dimmed">
                  Desglose contable (Balanza) — {etiquetaMesFacturacion(mesSeleccionado)}
                </Text>
              </Group>
              <Text size="xs" c="dimmed">
                Conciliación contra la Balanza, cuenta por cuenta.
              </Text>
              {(() => {
                const puntosVisibles = puntosVentaParaDesgloseBalanza.filter((punto) =>
                  PUNTOS_VENTA_CON_DESGLOSE_BALANZA.has(punto.clave),
                );
                const hayDiferenciaAlta = puntosVisibles.some((punto) => {
                  const data = detallesPorClaveBalanza[punto.clave]?.data;
                  if (!data?.disponible) return false;
                  return Math.abs(punto.monto - data.total) > TOLERANCIA_DIFERENCIA_BALANZA;
                });

                return (
                  <>
                    {hayDiferenciaAlta && (
                      <Alert icon={<IconAlertTriangle size={16} />} color="orange" variant="light">
                        Alguna diferencia es alta — antes de investigar cuenta por cuenta, confirma que la Balanza
                        cargada corresponda a este mes.
                        {balanza.data?.actualizado_en && (
                          <> Última actualización: {new Date(balanza.data.actualizado_en).toLocaleString('es-MX')}.</>
                        )}
                      </Alert>
                    )}
                    <Accordion variant="separated" radius="md">
                      {puntosVisibles.map((punto) => (
                        <AccordionItemDetalleBalanza
                          key={punto.clave}
                          clave={punto.clave}
                          etiqueta={punto.etiqueta}
                          montoCalculado={punto.monto}
                          detalle={detallesPorClaveBalanza[punto.clave]?.data}
                          isLoading={detallesPorClaveBalanza[punto.clave]?.isLoading ?? false}
                        />
                      ))}
                    </Accordion>
                  </>
                );
              })()}
            </Stack>
          </Card>

          <Card withBorder padding="lg">
            <Stack gap="sm">
              <Text fw={600} size="sm" tt="uppercase" c="dimmed">
                Tendencia diaria (Total) — {etiquetaMesFacturacion(mesSeleccionado)}
              </Text>
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <LineChart data={diasDelMes}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="periodo" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} width={80} tickFormatter={(v) => formatoMonedaTablaGuardada.format(v)} />
                    <RechartsTooltip formatter={(value) => formatoMonedaTablaGuardada.format(Number(value))} />
                    <Line
                      type="monotone"
                      dataKey="total"
                      name="Total"
                      stroke={`var(--mantine-color-${SEMANTIC_COLORS.info}-6)`}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Stack>
          </Card>

          <Card withBorder padding="lg">
            <Stack gap="sm">
              <Text fw={600} size="sm" tt="uppercase" c="dimmed">
                Desglose por tabla de origen (por día) — {etiquetaMesFacturacion(mesSeleccionado)}
              </Text>
              <Text size="xs" c="dimmed">
                Pasa el mouse sobre una categoría para ver su total del mes; haz clic para ocultarla/mostrarla en la
                gráfica.
              </Text>
              <Group gap="xs" justify="center">
                {resumenPorTabla.map((tabla) => {
                  const oculta = categoriasOcultas.has(tabla.clave);
                  const porcentaje = totalTablasMes > 0 ? (tabla.total / totalTablasMes) * 100 : 0;
                  return (
                    <Tooltip
                      key={tabla.clave}
                      label={`${formatoMonedaTablaGuardada.format(tabla.total)} (${porcentaje.toFixed(1)}%) · ${tabla.cuentas} cuenta(s)`}
                    >
                      <UnstyledButton
                        onClick={() => toggleCategoriaOculta(tabla.clave)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 10px',
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 600,
                          color: oculta ? 'var(--mantine-color-dimmed)' : 'var(--mantine-color-white)',
                          background: oculta ? 'transparent' : tabla.color,
                          border: `1.5px solid ${tabla.color}`,
                          textDecoration: oculta ? 'line-through' : 'none',
                          opacity: oculta ? 0.6 : 1,
                        }}
                      >
                        {tabla.etiqueta}
                      </UnstyledButton>
                    </Tooltip>
                  );
                })}
              </Group>
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <BarChart data={diasDelMes}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="periodo" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} width={80} tickFormatter={(v) => formatoMonedaTablaGuardada.format(v)} />
                    <RechartsTooltip formatter={(value) => formatoMonedaTablaGuardada.format(Number(value))} />
                    {CLAVES_TABLA_ANALITICA.map((tabla) => (
                      <Bar
                        key={tabla.clave}
                        dataKey={tabla.clave}
                        stackId="tabla-origen"
                        fill={tabla.color}
                        name={tabla.etiqueta}
                        hide={categoriasOcultas.has(tabla.clave)}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Stack>
          </Card>

          <Card withBorder padding="lg">
            <Stack gap="sm">
              <Text fw={600} size="sm" tt="uppercase" c="dimmed">
                Resumen por categoría — {etiquetaMesFacturacion(mesSeleccionado)}
              </Text>
              <ScrollArea>
                <Table verticalSpacing="sm" highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Categoría</Table.Th>
                      <Table.Th ta="right">Total</Table.Th>
                      <Table.Th>Distribución</Table.Th>
                      <Table.Th ta="right">Cuentas</Table.Th>
                      <Table.Th ta="center">Exportar</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {[...resumenPorTabla]
                      .sort((a, b) => b.total - a.total)
                      .map((tabla) => {
                        const porcentaje = totalTablasMes > 0 ? (tabla.total / totalTablasMes) * 100 : 0;
                        return (
                          <Table.Tr key={tabla.clave} style={{ borderLeft: `4px solid ${tabla.color}` }}>
                            <Table.Td>
                              <Group gap={8} wrap="nowrap">
                                <div
                                  style={{
                                    width: 12,
                                    height: 12,
                                    borderRadius: '50%',
                                    background: tabla.color,
                                    flexShrink: 0,
                                  }}
                                />
                                <Text size="sm" fw={600}>
                                  {tabla.etiqueta}
                                </Text>
                              </Group>
                            </Table.Td>
                            <Table.Td ta="right">
                              <Text size="sm" fw={700}>
                                {formatoMonedaTablaGuardada.format(tabla.total)}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <Group gap={8} wrap="nowrap">
                                <div
                                  style={{
                                    flex: 1,
                                    minWidth: 60,
                                    background: 'var(--mantine-color-gray-1)',
                                    borderRadius: 4,
                                    height: 8,
                                  }}
                                >
                                  <div
                                    style={{
                                      width: `${porcentaje}%`,
                                      background: tabla.color,
                                      height: '100%',
                                      borderRadius: 4,
                                      transition: 'width 0.3s ease',
                                    }}
                                  />
                                </div>
                                <Text size="xs" c="dimmed" w={42} ta="right">
                                  {porcentaje.toFixed(1)}%
                                </Text>
                              </Group>
                            </Table.Td>
                            <Table.Td ta="right">
                              <Badge variant="light" color="gray" radius="sm">
                                {tabla.cuentas}
                              </Badge>
                            </Table.Td>
                            <Table.Td ta="center">
                              <Tooltip label={`Exportar cuentas de ${tabla.etiqueta}`}>
                                <ActionIcon
                                  variant="light"
                                  color="gray"
                                  size="sm"
                                  loading={categoriaExportando === tabla.tituloTabla}
                                  onClick={() => executeExportarCategoria(tabla.tituloTabla, mesSeleccionado)}
                                >
                                  <IconDownload size={14} />
                                </ActionIcon>
                              </Tooltip>
                            </Table.Td>
                          </Table.Tr>
                        );
                      })}
                  </Table.Tbody>
                  <Table.Tfoot>
                    <Table.Tr style={{ borderTop: '2px solid var(--mantine-color-gray-4)' }}>
                      <Table.Td>
                        <Text size="sm" fw={700}>
                          Total
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text size="sm" fw={700}>
                          {formatoMonedaTablaGuardada.format(totalTablasMes)}
                        </Text>
                      </Table.Td>
                      <Table.Td />
                      <Table.Td ta="right">
                        <Text size="sm" fw={700}>
                          {resumenPorTabla.reduce((acc, t) => acc + t.cuentas, 0)}
                        </Text>
                      </Table.Td>
                      <Table.Td />
                    </Table.Tr>
                  </Table.Tfoot>
                </Table>
              </ScrollArea>
            </Stack>
          </Card>

          <Card withBorder padding="lg">
            <Stack gap="sm">
              <Text fw={600} size="sm" tt="uppercase" c="dimmed">
                PUE vs PPD — {etiquetaMesFacturacion(mesSeleccionado)}
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <TarjetaKpiFacturacion
                  titulo="PUE del mes"
                  valor={formatoMonedaTablaGuardada.format(pueMes)}
                  color={SEMANTIC_COLORS.info}
                />
                <TarjetaKpiFacturacion
                  titulo="PPD del mes"
                  valor={formatoMonedaTablaGuardada.format(ppdMes)}
                  color={SEMANTIC_COLORS.secondary}
                />
              </SimpleGrid>
              <Stack gap={6}>
                {[
                  { etiqueta: 'PUE', monto: pueMes, color: `var(--mantine-color-${SEMANTIC_COLORS.info}-6)` },
                  { etiqueta: 'PPD', monto: ppdMes, color: `var(--mantine-color-${SEMANTIC_COLORS.secondary}-6)` },
                ].map(({ etiqueta, monto, color }) => {
                  const porcentaje = totalPuePpdMes > 0 ? (monto / totalPuePpdMes) * 100 : 0;
                  return (
                    <Group key={etiqueta} justify="space-between" gap="sm">
                      <Text size="sm" w={50}>
                        {etiqueta}
                      </Text>
                      <div style={{ flex: 1, background: 'var(--mantine-color-gray-1)', borderRadius: 4, height: 10 }}>
                        <div style={{ width: `${porcentaje}%`, background: color, height: '100%', borderRadius: 4 }} />
                      </div>
                      <Text size="sm" w={140} ta="right">
                        {formatoMonedaTablaGuardada.format(monto)} ({porcentaje.toFixed(1)}%)
                      </Text>
                    </Group>
                  );
                })}
              </Stack>
            </Stack>
          </Card>
        </>
      )}

      {pueYPpdPorMes.length > 1 && (
        <Card withBorder padding="lg">
          <Stack gap="sm">
            <Text fw={600} size="sm" tt="uppercase" c="dimmed">
              Tendencia PUE vs PPD por mes
            </Text>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={pueYPpdPorMes}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} width={80} tickFormatter={(v) => formatoMonedaTablaGuardada.format(v)} />
                  <RechartsTooltip formatter={(value) => formatoMonedaTablaGuardada.format(Number(value))} />
                  <Legend />
                  <Bar dataKey="pue" name="PUE" fill={`var(--mantine-color-${SEMANTIC_COLORS.info}-6)`} />
                  <Bar dataKey="ppd" name="PPD" fill={`var(--mantine-color-${SEMANTIC_COLORS.secondary}-6)`} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Stack>
        </Card>
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
                  <YAxis tick={{ fontSize: 12 }} width={80} tickFormatter={(v) => formatoMonedaTablaGuardada.format(v)} />
                  <RechartsTooltip formatter={(value) => formatoMonedaTablaGuardada.format(Number(value))} />
                  <Bar dataKey="total" name="Total" fill={`var(--mantine-color-${SEMANTIC_COLORS.info}-6)`} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

type SeccionFacturacionClave = 'generar' | 'base-datos' | 'balanza' | 'analisis';

const SECCIONES_FACTURACION_MENU: {
  clave: SeccionFacturacionClave;
  nombre: string;
  descripcion: string;
  icono: typeof IconFileSpreadsheet;
  color: string;
}[] = [
  {
    clave: 'generar',
    nombre: 'Generar Reporte',
    descripcion: 'Formas de Pago + Recibos Emitidos → Tablas_Forma_Pago',
    icono: IconFileSpreadsheet,
    color: 'blue',
  },
  {
    clave: 'base-datos',
    nombre: 'Base de Datos',
    descripcion: 'Tablas guardadas por día, búsqueda y exportación',
    icono: IconDatabase,
    color: 'violet',
  },
  {
    clave: 'balanza',
    nombre: 'Balanza',
    descripcion: 'Balanza de comprobación vigente por punto de venta',
    icono: IconScale,
    color: 'orange',
  },
  {
    clave: 'analisis',
    nombre: 'Análisis',
    descripcion: 'KPIs, ventas por punto de venta y comparación PUE/PPD',
    icono: IconChartLine,
    color: 'teal',
  },
];

function PanelMenuSeccionesFacturacion({ onSeleccionar }: { onSeleccionar: (sec: SeccionFacturacionClave) => void }) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="lg">
      {SECCIONES_FACTURACION_MENU.map((sec) => (
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

export default function FacturacionPage() {
  const [vista, setVista] = useState<SeccionFacturacionClave | null>(null);
  const generarFacturacion = useGenerarFacturacion();
  const duplicadosPreview = useDuplicadosPreview();
  const agregarPuePpd = useAgregarPuePpd();
  const guardarTablasFormaPago = useGuardarTablasFormaPago();
  const periodosGuardados = useListarPeriodosTablasFormaPago();
  const eliminarPeriodoTablasFormaPago = useEliminarPeriodoTablasFormaPago();
  const exportarTablasFormaPago = useExportarTablasFormaPago();
  const [formasPagoFile, setFormasPagoFile] = useState<File | null>(null);
  const [recibosEmitidosFile, setRecibosEmitidosFile] = useState<File | null>(null);
  const [movimientosPeriodoFile, setMovimientosPeriodoFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [duplicadosCombinados, setDuplicadosCombinados] = useState<DuplicadoFacturacion[] | null>(null);
  const [duplicadosOriginales, setDuplicadosOriginales] = useState<DuplicadoFacturacion[] | null>(null);
  const [valoresEditados, setValoresEditados] = useState<Record<string, FilaEditable>>({});
  const [tablasFormaPagoFile, setTablasFormaPagoFile] = useState<File | null>(null);
  const [isProcesandoPuePpd, setIsProcesandoPuePpd] = useState(false);
  const [mostrarMovimientos, setMostrarMovimientos] = useState(false);
  const [periodoGuardado, setPeriodoGuardado] = useState('');
  const [modalReemplazoTablasAbierto, setModalReemplazoTablasAbierto] = useState(false);
  const [filasExistentesReemplazo, setFilasExistentesReemplazo] = useState(0);
  const [mostrarVisorBaseDatos, setMostrarVisorBaseDatos] = useState(false);
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState<string | null>(null);
  const [modalEliminarPeriodoAbierto, setModalEliminarPeriodoAbierto] = useState(false);
  const [busquedaTexto, setBusquedaTexto] = useState('');
  const [busquedaMes, setBusquedaMes] = useState<string | null>(null);
  const [archivoBalanza, setArchivoBalanza] = useState<File | null>(null);
  const [filtroBalanza, setFiltroBalanza] = useState('');
  const [categoriaBalanzaActiva, setCategoriaBalanzaActiva] = useState<string | null>(null);
  const [mostrarVisorBalanza, setMostrarVisorBalanza] = useState(false);

  const guardarBalanza = useGuardarBalanza();
  const balanza = useObtenerBalanza();

  const tablasGuardadas = useObtenerTablasFormaPagoGuardadas(periodoSeleccionado);
  const busquedaTablasFormaPago = useBuscarTablasFormaPago({ q: busquedaTexto.trim(), mes: busquedaMes ?? undefined });

  const ambosArchivosListos = formasPagoFile && recibosEmitidosFile;

  const executeVerDuplicados = () => {
    if (!formasPagoFile || !recibosEmitidosFile) return;

    duplicadosPreview.mutate(
      {
        formasPago: formasPagoFile,
        recibosEmitidos: recibosEmitidosFile,
        movimientosPeriodo: movimientosPeriodoFile ?? undefined,
      },
      {
        onSuccess: (data) => {
          setDuplicadosCombinados(data.duplicadosCombinados);
          setDuplicadosOriginales(data.duplicadosSegundaLimpieza);
          const inicial: Record<string, FilaEditable> = {};
          for (const fila of data.duplicadosSegundaLimpieza) {
            const clave = String(fila._clave ?? '');
            const filaEditable: FilaEditable = {};
            for (const [columna, valor] of Object.entries(fila)) {
              if (columna === '_clave') continue;
              filaEditable[columna] = valorACelda(valor);
            }
            inicial[clave] = filaEditable;
          }
          setValoresEditados(inicial);
        },
        onError: (err: any) => {
          notifications.show({
            title: 'Error',
            message: err.response?.data?.detail || 'Ocurrió un error al buscar duplicados.',
            color: 'red',
            icon: <IconX size={16} />,
          });
        },
      },
    );
  };

  const actualizarCelda = (clave: string, columna: string, valor: string) => {
    setValoresEditados((prev) => ({
      ...prev,
      [clave]: { ...prev[clave], [columna]: valor },
    }));
  };

  // Si el texto actual de la celda es una fórmula (=291.96*0.16, 101+202,
  // etc.), la calcula y reemplaza el valor de la celda al instante — se
  // llama tanto al presionar Enter como al salir de la celda (blur), para
  // que se sienta como Excel sin importar cómo confirme el usuario.
  const confirmarFormulaCelda = (clave: string, columna: string) => {
    const textoActual = valoresEditados[clave]?.[columna] ?? '';
    if (pareceFormula(textoActual)) {
      const resultado = evaluarFormula(textoActual);
      if (resultado !== null) {
        actualizarCelda(clave, columna, String(Math.round(resultado * 100) / 100));
      }
    }
  };

  // Para cuentas de AGENCIA DE VIAJES: al capturar PAGO PROVEDOR, deriva
  // Subtotal/Iva automáticamente a partir de TOTAL de esa misma fila
  // (GRAVADO_NETO = TOTAL - PAGO PROVEDOR; Subtotal = GRAVADO_NETO/1.16;
  // Iva = GRAVADO_NETO - Subtotal) — no aplica a otras filas de la tabla
  // (ej. cuentas de pago mixto de LA HACIENDA).
  const recalcularSubtotalIvaAgencia = (clave: string, filaOriginal: DuplicadoFacturacion) => {
    const pos = (valoresEditados[clave]?.['POS'] ?? valorACelda(filaOriginal['POS'])).trim().toUpperCase();
    if (pos !== 'AGENCIA DE VIAJES') return;

    const total = Number(valoresEditados[clave]?.['TOTAL'] ?? valorACelda(filaOriginal['TOTAL']));
    const pagoProveedor = Number(valoresEditados[clave]?.['PAGO PROVEDOR'] ?? '');
    if (!Number.isFinite(total) || !Number.isFinite(pagoProveedor)) return;

    const gravadoNeto = total - pagoProveedor;
    const subtotal = Math.round((gravadoNeto / 1.16) * 100) / 100;
    const iva = Math.round((gravadoNeto - subtotal) * 100) / 100;
    actualizarCelda(clave, 'Subtotal', String(subtotal));
    actualizarCelda(clave, 'Iva', String(iva));
  };

  const construirEdiciones = (): EdicionFacturacion[] => {
    if (!duplicadosOriginales) return [];
    const ediciones: EdicionFacturacion[] = [];
    for (const filaOriginal of duplicadosOriginales) {
      const clave = String(filaOriginal._clave ?? '');
      const filaEditada = valoresEditados[clave];
      if (!filaEditada) continue;
      const cambios: Record<string, string | number> = {};
      for (const [columna, valorEditado] of Object.entries(filaEditada)) {
        const valorOriginal = valorACelda(filaOriginal[columna]);
        if (valorEditado !== valorOriginal) {
          cambios[columna] = valorParaEnviar(valorEditado);
        }
      }
      if (Object.keys(cambios).length > 0) {
        ediciones.push({ clave, cambios });
      }
    }
    return ediciones;
  };

  const executeGenerar = () => {
    if (!formasPagoFile || !recibosEmitidosFile) return;
    setIsProcessing(true);

    generarFacturacion.mutate(
      {
        formasPago: formasPagoFile,
        recibosEmitidos: recibosEmitidosFile,
        movimientosPeriodo: movimientosPeriodoFile ?? undefined,
        ediciones: construirEdiciones(),
      },
      {
        onSuccess: (blob) => {
          notifications.show({
            title: '¡Reporte generado!',
            message: 'El archivo de Facturación combinada se ha descargado.',
            color: 'teal',
            icon: <IconCheck size={16} />,
          });

          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'Facturacion.xlsx';
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.URL.revokeObjectURL(url);

          setIsProcessing(false);
        },
        onError: (err: any) => {
          notifications.show({
            title: 'Error',
            message: err.response?.data?.detail || 'Ocurrió un error al procesar los archivos.',
            color: 'red',
            icon: <IconX size={16} />,
          });
          setIsProcessing(false);
        },
      },
    );
  };

  const executeAgregarPuePpd = () => {
    if (!tablasFormaPagoFile) return;
    setIsProcesandoPuePpd(true);

    agregarPuePpd.mutate(tablasFormaPagoFile, {
      onSuccess: (blob) => {
        notifications.show({
          title: '¡PUE/PPD agregado!',
          message: 'El archivo con las tablas PUE y PPD se ha descargado.',
          color: 'teal',
          icon: <IconCheck size={16} />,
        });

        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'Tablas_Forma_Pago_PUE_PPD.xlsx';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);

        setIsProcesandoPuePpd(false);
      },
      onError: (err: any) => {
        notifications.show({
          title: 'Error',
          message: err.response?.data?.detail || 'Ocurrió un error al procesar el archivo.',
          color: 'red',
          icon: <IconX size={16} />,
        });
        setIsProcesandoPuePpd(false);
      },
    });
  };

  const executeGuardarBalanza = () => {
    if (!archivoBalanza) return;

    guardarBalanza.mutate(archivoBalanza, {
      onSuccess: (data) => {
        notifications.show({
          title: 'Balanza guardada',
          message: `${data.total} cuenta(s) guardada(s).`,
          color: 'green',
          icon: <IconCheck size={16} />,
        });
        setArchivoBalanza(null);
      },
      onError: (err: any) => {
        notifications.show({
          title: 'Error',
          message: err.response?.data?.detail || 'Ocurrió un error al procesar el archivo.',
          color: 'red',
          icon: <IconX size={16} />,
        });
      },
    });
  };

  const [filtroBalanzaDebounced] = useDebouncedValue(filtroBalanza.trim(), 300);

  // Con texto de búsqueda se ignoran las pestañas por categoría y se busca
  // en toda la balanza (mismo criterio que el buscador de "Base de Datos",
  // que también ignora el día seleccionado).
  const cuentasBalanzaFiltradas = useMemo(() => {
    const texto = filtroBalanzaDebounced.toLowerCase();
    if (!texto) return [];
    return (balanza.data?.cuentas ?? []).filter(
      (c) => c.codigo_cuenta.toLowerCase().includes(texto) || c.descripcion.toLowerCase().includes(texto),
    );
  }, [balanza.data?.cuentas, filtroBalanzaDebounced]);

  // Agrupar por categoría raíz solo se usa cuando no hay búsqueda activa —
  // así cada pestaña monta únicamente su propio subconjunto de cuentas en
  // vez de renderizar la balanza completa de golpe.
  const cuentasPorCategoriaBalanza = useMemo(() => {
    const mapa = new Map<string, CuentaBalanza[]>();
    for (const c of balanza.data?.cuentas ?? []) {
      const clave = categoriaBalanza(c.codigo_cuenta);
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave)!.push(c);
    }
    return mapa;
  }, [balanza.data?.cuentas]);

  const categoriasBalanzaConDatos = CATEGORIAS_BALANZA.filter(
    (cat) => (cuentasPorCategoriaBalanza.get(cat.clave)?.length ?? 0) > 0,
  );

  const categoriaBalanzaMostrada =
    categoriaBalanzaActiva && categoriasBalanzaConDatos.some((cat) => cat.clave === categoriaBalanzaActiva)
      ? categoriaBalanzaActiva
      : (categoriasBalanzaConDatos[0]?.clave ?? null);

  const executeGuardarTablasFormaPago = (confirmarReemplazo = false) => {
    if (!tablasFormaPagoFile || !periodoGuardado.trim()) return;

    guardarTablasFormaPago.mutate(
      { file: tablasFormaPagoFile, periodo: periodoGuardado.trim(), confirmarReemplazo },
      {
        onSuccess: (data) => {
          if ('requiere_confirmacion' in data) {
            setFilasExistentesReemplazo(data.filas_existentes);
            setModalReemplazoTablasAbierto(true);
            return;
          }
          setModalReemplazoTablasAbierto(false);
          notifications.show({
            title: 'Guardado en base de datos',
            message: `Periodo "${data.periodo}": ${data.total} cuenta(s) guardada(s).`,
            color: 'green',
            icon: <IconCheck size={16} />,
          });
        },
        onError: (err: any) => {
          notifications.show({
            title: 'Error al guardar en base de datos',
            message: err.response?.data?.detail || 'Ocurrió un error al procesar el archivo.',
            color: 'red',
            icon: <IconX size={16} />,
          });
        },
      },
    );
  };

  const executeEliminarPeriodoTablasFormaPago = () => {
    if (!periodoSeleccionado) return;
    eliminarPeriodoTablasFormaPago.mutate(
      { periodo: periodoSeleccionado },
      {
        onSuccess: (data) => {
          setModalEliminarPeriodoAbierto(false);
          setPeriodoSeleccionado(null);
          notifications.show({
            title: 'Día eliminado',
            message: `Se eliminaron ${data.eliminados} fila(s) guardadas para "${data.periodo}".`,
            color: 'teal',
            icon: <IconCheck size={16} />,
          });
        },
        onError: (err: any) => {
          notifications.show({
            title: 'Error al eliminar',
            message: err.response?.data?.detail || 'Ocurrió un error al eliminar el día.',
            color: 'red',
            icon: <IconX size={16} />,
          });
        },
      },
    );
  };

  const executeExportarTablasFormaPago = (modo: 'dia' | 'mes') => {
    if (!periodoSeleccionado) return;
    const params = modo === 'dia' ? { periodo: periodoSeleccionado } : { mes: periodoSeleccionado.slice(0, 7) };
    exportarTablasFormaPago.mutate(params, {
      onSuccess: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Tablas_Forma_Pago_${modo === 'dia' ? periodoSeleccionado : params.mes}.xlsx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        notifications.show({
          title: 'Exportado',
          message: modo === 'dia' ? 'Se descargó el Excel del día.' : 'Se descargó el Excel del mes.',
          color: 'green',
          icon: <IconCheck size={16} />,
        });
      },
      onError: (err: any) => {
        notifications.show({
          title: 'Error al exportar',
          message: err.response?.data?.detail || 'Ocurrió un error al generar el Excel.',
          color: 'red',
          icon: <IconX size={16} />,
        });
      },
    });
  };

  return (
    <Stack gap="lg">
      <Title order={2}>Facturación</Title>

      {vista === null ? (
        <PanelMenuSeccionesFacturacion onSeleccionar={setVista} />
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

          {vista === 'generar' && (
          <Stack gap="lg">
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Stack gap="md">
          <EncabezadoPaso
            numero={1}
            color="blue"
            titulo="Generar reporte de Facturación"
            descripcion="Sube Formas de Pago y Recibos Emitidos para generar el Excel."
          />

          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <ArchivoDropzone
                titulo="Formas de Pago"
                descripcion="Debe contener la columna 'Recibo'"
                file={formasPagoFile}
                onDrop={setFormasPagoFile}
                onRemove={() => setFormasPagoFile(null)}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <ArchivoDropzone
                titulo="Recibos Emitidos"
                descripcion="Debe contener la columna 'Cuenta'"
                file={recibosEmitidosFile}
                onDrop={setRecibosEmitidosFile}
                onRemove={() => setRecibosEmitidosFile(null)}
              />
            </Grid.Col>
          </Grid>

          {mostrarMovimientos || movimientosPeriodoFile ? (
            <ArchivoDropzone
              titulo="Movimientos por Periodo (opcional)"
              descripcion="Completa Segmento y Forma de Pago (Funcionarios&Emplea, TUSOSA, American Express, Cortesía)"
              file={movimientosPeriodoFile}
              onDrop={setMovimientosPeriodoFile}
              onRemove={() => setMovimientosPeriodoFile(null)}
            />
          ) : (
            <Anchor size="xs" onClick={() => setMostrarMovimientos(true)}>
              + Agregar Movimientos por Periodo (opcional)
            </Anchor>
          )}

          {ambosArchivosListos && (
            <Group justify="flex-end">
              <Button
                onClick={executeVerDuplicados}
                variant="light"
                color="orange"
                leftSection={<IconSearch size={16} />}
                loading={duplicadosPreview.isPending}
              >
                Ver duplicados
              </Button>
              <Button onClick={executeGenerar} color="blue" disabled={isProcessing} loading={isProcessing}>
                Generar Reporte
              </Button>
            </Group>
          )}

          {(duplicadosCombinados !== null || duplicadosOriginales !== null) && (
            <Divider label="Resultado" labelPosition="left" my={2} />
          )}

          {duplicadosCombinados !== null && duplicadosCombinados.length === 0 && (
            <Alert icon={<IconAlertCircle size={16} />} color="teal" variant="light">
              No se encontraron cuentas duplicadas con forma de pago mixta.
            </Alert>
          )}

          {duplicadosCombinados !== null && duplicadosCombinados.length > 0 && (
            <Accordion variant="separated">
              <Accordion.Item value="combinado">
                <Accordion.Control>
                  <Group justify="space-between" pr="sm" wrap="nowrap">
                    <Group gap={6} wrap="nowrap">
                      <IconTable size={16} color="var(--mantine-color-dimmed)" />
                      <Text size="sm" fw={600}>
                        Combinación cruda (referencia, solo lectura)
                      </Text>
                    </Group>
                    <Badge color="gray" variant="light">
                      {duplicadosCombinados.length} {duplicadosCombinados.length === 1 ? 'fila' : 'filas'}
                    </Badge>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <ScrollArea>
                    <Table striped highlightOnHover withTableBorder withColumnBorders bg="white" fz="xs" verticalSpacing="xs">
                      <Table.Thead>
                        <Table.Tr>
                          {Object.keys(duplicadosCombinados[0]).map((columna) => (
                            <Table.Th key={columna} bg="gray.1" fw={700}>
                              {formatearEncabezado(columna)}
                            </Table.Th>
                          ))}
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {duplicadosCombinados.map((fila, idx) => (
                          <Table.Tr key={idx}>
                            {Object.keys(duplicadosCombinados[0]).map((columna) => (
                              <Table.Td key={columna}>{fila[columna] ?? ''}</Table.Td>
                            ))}
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          )}

          {duplicadosOriginales !== null && (
            <Card padding="lg" radius="md" withBorder bg="var(--mantine-color-orange-0)">
              <Stack gap="md">
                <Group justify="space-between">
                  <Group gap={6} wrap="nowrap">
                    <IconAlertTriangle size={18} color="var(--mantine-color-orange-6)" />
                    <div>
                      <Text fw={600}>Cuentas duplicadas con forma de pago mixta</Text>
                      <Text size="xs" c="dimmed">
                        Edita cualquier celda para corregir la fila — los cambios se aplican al generar el reporte.
                      </Text>
                    </div>
                  </Group>
                  <Badge color="orange" variant="light">
                    {duplicadosOriginales.length} {duplicadosOriginales.length === 1 ? 'fila' : 'filas'}
                  </Badge>
                </Group>

                {duplicadosOriginales.length === 0 ? (
                  <Alert icon={<IconAlertCircle size={16} />} color="teal" variant="light">
                    No se encontraron cuentas duplicadas con forma de pago mixta.
                  </Alert>
                ) : (
                  <ScrollArea>
                    <Table striped highlightOnHover withTableBorder withColumnBorders bg="white" fz="xs" verticalSpacing="xs">
                      <Table.Thead>
                        <Table.Tr>
                          {Object.keys(duplicadosOriginales[0])
                            .filter((columna) => columna !== '_clave')
                            .map((columna) => (
                              <Table.Th key={columna} bg="gray.1" fw={700}>
                                {formatearEncabezado(columna)}
                              </Table.Th>
                            ))}
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {duplicadosOriginales.map((filaOriginal) => {
                          const clave = String(filaOriginal._clave ?? '');
                          const columnas = Object.keys(filaOriginal).filter((c) => c !== '_clave');
                          return (
                            <Table.Tr key={clave}>
                              {columnas.map((columna) => (
                                <Table.Td key={columna} p={2}>
                                  <input
                                    value={valoresEditados[clave]?.[columna] ?? ''}
                                    onChange={(e) => actualizarCelda(clave, columna, e.target.value)}
                                    style={estiloCeldaInput}
                                    onFocus={(e) => {
                                      e.currentTarget.style.borderColor = 'var(--mantine-color-blue-5)';
                                      e.currentTarget.style.boxShadow = '0 0 0 2px var(--mantine-color-blue-1)';
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        confirmarFormulaCelda(clave, columna);
                                        if (columna === 'PAGO PROVEDOR') {
                                          recalcularSubtotalIvaAgencia(clave, filaOriginal);
                                        }
                                      }
                                    }}
                                    onBlur={(e) => {
                                      e.currentTarget.style.borderColor = 'var(--mantine-color-gray-4)';
                                      e.currentTarget.style.boxShadow = 'none';
                                      confirmarFormulaCelda(clave, columna);
                                      if (columna === 'PAGO PROVEDOR') {
                                        recalcularSubtotalIvaAgencia(clave, filaOriginal);
                                      }
                                    }}
                                  />
                                </Table.Td>
                              ))}
                            </Table.Tr>
                          );
                        })}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea>
                )}
              </Stack>
            </Card>
          )}
        </Stack>
      </Card>

      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Stack gap="md">
          <EncabezadoPaso
            numero={2}
            color="violet"
            titulo="Agregar PUE / PPD"
            descripcion="Sube el Tablas_Forma_Pago ya revisado para agregarle los bloques PUE y PPD."
          />

          <ArchivoDropzone
            titulo="Tablas_Forma_Pago"
            descripcion="El Excel generado en el paso 1, ya corregido si aplica"
            file={tablasFormaPagoFile}
            onDrop={setTablasFormaPagoFile}
            onRemove={() => setTablasFormaPagoFile(null)}
          />

          <Group justify="flex-end">
            <Button
              onClick={executeAgregarPuePpd}
              color="violet"
              disabled={!tablasFormaPagoFile || isProcesandoPuePpd}
              loading={isProcesandoPuePpd}
            >
              Agregar PUE/PPD
            </Button>
          </Group>

          <Card withBorder padding="sm" radius="md" bg="gray.0">
            <Stack gap="xs">
              <Text size="sm" fw={600}>
                Guardar en base de datos
              </Text>
              <Text size="xs" c="dimmed">
                Guarda el detalle completo de esta cuenta ya cuadrada, para análisis futuro — usa el mismo archivo
                subido arriba.
              </Text>
              <Group align="flex-end" wrap="wrap">
                <DateInput
                  label="Periodo"
                  locale="es"
                  valueFormat="DD/MM/YYYY"
                  placeholder="Selecciona una fecha"
                  value={isoAFecha(periodoGuardado)}
                  onChange={(fecha) => setPeriodoGuardado(fecha ? fechaAIso(fecha) : '')}
                  clearable
                  w={220}
                />
                <Button
                  onClick={() => executeGuardarTablasFormaPago(false)}
                  color="teal"
                  leftSection={<IconDatabase size={16} />}
                  disabled={!tablasFormaPagoFile || !periodoGuardado.trim() || guardarTablasFormaPago.isPending}
                  loading={guardarTablasFormaPago.isPending}
                >
                  Guardar en base de datos
                </Button>
              </Group>
            </Stack>
          </Card>
        </Stack>
      </Card>
          </Stack>
          )}

          {vista === 'base-datos' && (
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <div>
              <Title order={4}>Ver base de datos guardada</Title>
              <Text size="xs" c="dimmed">
                Consulta las tablas de cuentas ya guardadas, agrupadas por día.
              </Text>
            </div>
            <Button
              variant="subtle"
              size="xs"
              leftSection={<IconCalendarStats size={14} />}
              onClick={() => setMostrarVisorBaseDatos((v) => !v)}
            >
              {mostrarVisorBaseDatos ? 'Ocultar base de datos guardada' : 'Ver base de datos guardada'}
            </Button>
          </Group>

          <Card withBorder padding="sm" radius="md" bg="gray.0">
            <Stack gap="xs">
              <Group gap={6}>
                <IconSearch size={16} color="var(--mantine-color-dimmed)" />
                <Text size="sm" fw={600}>
                  Buscar en la base de datos
                </Text>
              </Group>
              <Group align="flex-end" wrap="wrap">
                <TextInput
                  value={busquedaTexto}
                  onChange={(e) => setBusquedaTexto(e.currentTarget.value)}
                  style={{ flex: 1, minWidth: 220 }}
                />
                <Select
                  placeholder="Todos los meses"
                  clearable
                  value={busquedaMes}
                  onChange={setBusquedaMes}
                  data={Array.from(new Set((periodosGuardados.data ?? []).map((d) => d.periodo.slice(0, 7))))
                    .sort()
                    .reverse()
                    .map((mes) => ({ value: mes, label: etiquetaMesFacturacion(mes) }))}
                  w={200}
                />
              </Group>

              {busquedaTexto.trim() !== '' && busquedaTablasFormaPago.isLoading && (
                <Text size="xs" c="dimmed">
                  Buscando...
                </Text>
              )}

              {busquedaTexto.trim() !== '' &&
                !busquedaTablasFormaPago.isLoading &&
                (busquedaTablasFormaPago.data?.total ?? 0) === 0 && (
                  <Text size="xs" c="dimmed">
                    Sin coincidencias para "{busquedaTexto.trim()}".
                  </Text>
                )}

              {busquedaTexto.trim() !== '' && (busquedaTablasFormaPago.data?.total ?? 0) > 0 && (
                <Stack gap={6}>
                  <Badge variant="light" color="gray" style={{ alignSelf: 'flex-start' }}>
                    {busquedaTablasFormaPago.data!.total} coincidencia(s)
                  </Badge>
                  <TablaResultadosBusqueda filas={busquedaTablasFormaPago.data!.filas} />
                </Stack>
              )}
            </Stack>
          </Card>

          {mostrarVisorBaseDatos && (periodosGuardados.data?.length ?? 0) === 0 && (
            <Text size="sm" c="dimmed">
              Todavía no hay ningún día guardado.
            </Text>
          )}

          {mostrarVisorBaseDatos && (periodosGuardados.data?.length ?? 0) > 0 && (
            <Calendar
              static
              defaultDate={
                isoAFecha(
                  [...periodosGuardados.data!].sort((a, b) => b.periodo.localeCompare(a.periodo))[0]?.periodo ?? '',
                ) ?? new Date()
              }
              getDayProps={(date) => {
                const iso = fechaAIso(date);
                const dia = periodosGuardados.data!.find((d) => d.periodo === iso);
                return {
                  selected: periodoSeleccionado === iso,
                  onClick: () => dia && setPeriodoSeleccionado(iso),
                  style: dia ? { fontWeight: 700 } : undefined,
                };
              }}
              renderDay={(date) => {
                const iso = fechaAIso(date);
                const dia = periodosGuardados.data!.find((d) => d.periodo === iso);
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

          {mostrarVisorBaseDatos && periodoSeleccionado && (
            <Stack gap="sm">
              <Group justify="space-between" align="center">
                <Text size="sm" fw={500}>
                  Día: {periodoSeleccionado}
                </Text>
                <Group gap="xs">
                  <Button
                    variant="default"
                    size="xs"
                    leftSection={<IconDownload size={14} />}
                    loading={exportarTablasFormaPago.isPending}
                    onClick={() => executeExportarTablasFormaPago('dia')}
                  >
                    Exportar día
                  </Button>
                  <Button
                    variant="default"
                    size="xs"
                    leftSection={<IconDownload size={14} />}
                    loading={exportarTablasFormaPago.isPending}
                    onClick={() => executeExportarTablasFormaPago('mes')}
                  >
                    Exportar mes
                  </Button>
                  <Button
                    variant="outline"
                    color="red"
                    size="xs"
                    leftSection={<IconTrash size={14} />}
                    onClick={() => setModalEliminarPeriodoAbierto(true)}
                  >
                    Eliminar día
                  </Button>
                </Group>
              </Group>

              <SeccionFacturasDia periodo={periodoSeleccionado} />

              {tablasGuardadas.isLoading && (
                <Text size="sm" c="dimmed">
                  Cargando...
                </Text>
              )}

              {!tablasGuardadas.isLoading && (tablasGuardadas.data?.total ?? 0) === 0 && (
                <Text size="sm" c="dimmed">
                  No hay datos guardados para este día.
                </Text>
              )}

              {!tablasGuardadas.isLoading && (tablasGuardadas.data?.total ?? 0) > 0 && (
                <Accordion variant="separated" multiple>
                  {ORDEN_TABLAS_FORMA_PAGO.map((tabla) => {
                    const filasTabla = tablasGuardadas.data!.filas.filter((f) => f.tabla_origen === tabla);
                    if (filasTabla.length === 0) return null;
                    const colorTabla = COLOR_TABLA_FORMA_PAGO[tabla] ?? 'gray';
                    return (
                      <Accordion.Item key={tabla} value={tabla}>
                        <Accordion.Control>
                          <Group gap="sm">
                            <Text fw={600} c={`${colorTabla}.8`}>
                              {tabla}
                            </Text>
                            <Badge variant="light" color={colorTabla}>
                              {filasTabla.length} cuenta(s)
                            </Badge>
                          </Group>
                        </Accordion.Control>
                        <Accordion.Panel>
                          <TablaFormaPagoGuardada filas={filasTabla} />
                        </Accordion.Panel>
                      </Accordion.Item>
                    );
                  })}
                </Accordion>
              )}

              {!tablasGuardadas.isLoading && (tablasGuardadas.data?.total ?? 0) > 0 && (
                <Accordion variant="separated">
                  <Accordion.Item value="pue-ppd">
                    <Accordion.Control>
                      <Group gap="sm">
                        <Text fw={600}>PUE / PPD</Text>
                        <Badge variant="light" color="gray">
                          resumen combinado
                        </Badge>
                      </Group>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <SimpleGrid cols={{ base: 1, md: 2 }}>
                        <TablaResumenPuePpd
                          titulo="PUE GRAVADA"
                          color={SEMANTIC_COLORS.info}
                          filas={tablasGuardadas.data!.filas.filter(
                            (f) => f.categoria_pue_ppd === 'PUE' && f.subtotal > 0,
                          )}
                          columnas={[
                            { clave: 'subtotal', etiqueta: 'Subtotal' },
                            { clave: 'descuento', etiqueta: 'Descuento' },
                          ]}
                        />
                        <TablaResumenPuePpd
                          titulo="PUE TASA 0"
                          color={SEMANTIC_COLORS.info}
                          filas={tablasGuardadas.data!.filas.filter(
                            (f) => f.categoria_pue_ppd === 'PUE' && f.ingtasa_0 > 0,
                          )}
                          columnas={[
                            { clave: 'ingtasa_0', etiqueta: 'INGTASA 0' },
                            { clave: 'desc_tasa_0', etiqueta: 'DESC TASA 0' },
                          ]}
                        />
                        <TablaResumenPuePpd
                          titulo="PPD GRAVADA"
                          color={SEMANTIC_COLORS.secondary}
                          filas={tablasGuardadas.data!.filas.filter(
                            (f) => f.categoria_pue_ppd === 'PPD' && f.subtotal > 0,
                          )}
                          columnas={[
                            { clave: 'subtotal', etiqueta: 'Subtotal' },
                            { clave: 'descuento', etiqueta: 'Descuento' },
                          ]}
                        />
                        <TablaResumenPuePpd
                          titulo="PPD TASA 0"
                          color={SEMANTIC_COLORS.secondary}
                          filas={tablasGuardadas.data!.filas.filter(
                            (f) => f.categoria_pue_ppd === 'PPD' && f.ingtasa_0 > 0,
                          )}
                          columnas={[
                            { clave: 'ingtasa_0', etiqueta: 'INGTASA 0' },
                            { clave: 'desc_tasa_0', etiqueta: 'DESC TASA 0' },
                          ]}
                        />
                      </SimpleGrid>
                    </Accordion.Panel>
                  </Accordion.Item>
                </Accordion>
              )}
            </Stack>
          )}
        </Stack>
      </Card>
          )}

          {vista === 'balanza' && (
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Stack gap="md">
              <Group gap={8}>
                <IconScale size={18} color="var(--mantine-color-dimmed)" />
                <div>
                  <Title order={4}>Balanza contable</Title>
                  <Text size="xs" c="dimmed">
                    Sube la balanza para consultarla aquí. Cada subida reemplaza por completo la anterior.
                  </Text>
                </div>
              </Group>

              <ArchivoDropzone
                titulo="Balanza"
                descripcion="Columnas: Código Cuenta, Descripción, Saldo Ant, Débitos Mes, Créditos Mes, Saldo Mes, Saldo Actual"
                file={archivoBalanza}
                onDrop={setArchivoBalanza}
                onRemove={() => setArchivoBalanza(null)}
              />

              {archivoBalanza && (
                <Group justify="flex-end">
                  <Button onClick={executeGuardarBalanza} color="blue" loading={guardarBalanza.isPending}>
                    Guardar Balanza
                  </Button>
                </Group>
              )}

              <Divider my={2} />

              <Group justify="space-between" align="center" wrap="wrap">
                <div>
                  <Title order={4}>Ver Balanza guardada</Title>
                  <Text size="xs" c="dimmed">
                    {balanza.data?.actualizado_en
                      ? `Última actualización: ${new Date(balanza.data.actualizado_en).toLocaleString('es-MX')}`
                      : 'Todavía no se ha guardado ninguna balanza.'}
                  </Text>
                </div>
                <Button
                  variant="subtle"
                  size="xs"
                  leftSection={<IconCalendarStats size={14} />}
                  onClick={() => setMostrarVisorBalanza((v) => !v)}
                >
                  {mostrarVisorBalanza ? 'Ocultar Balanza guardada' : 'Ver Balanza guardada'}
                </Button>
              </Group>

              <Card withBorder padding="sm" radius="md" bg="gray.0">
                <Stack gap="xs">
                  <Group gap={6}>
                    <IconSearch size={16} color="var(--mantine-color-dimmed)" />
                    <Text size="sm" fw={600}>
                      Buscar en la Balanza
                    </Text>
                  </Group>
                  <TextInput
                    placeholder="Buscar por código o descripción (en toda la balanza)"
                    value={filtroBalanza}
                    onChange={(e) => setFiltroBalanza(e.currentTarget.value)}
                    disabled={(balanza.data?.total ?? 0) === 0}
                  />

                  {filtroBalanzaDebounced !== '' && (
                    <Stack gap={6}>
                      <Badge variant="light" color="gray" style={{ alignSelf: 'flex-start' }}>
                        {cuentasBalanzaFiltradas.length} coincidencia(s)
                      </Badge>
                      <TablaBalanza cuentas={cuentasBalanzaFiltradas} colorAcento="blue" />
                    </Stack>
                  )}
                </Stack>
              </Card>

              {mostrarVisorBalanza && filtroBalanzaDebounced === '' && categoriasBalanzaConDatos.length > 0 && (
                <Tabs value={categoriaBalanzaMostrada} onChange={setCategoriaBalanzaActiva} variant="pills">
                  <Tabs.List>
                    {categoriasBalanzaConDatos.map((cat) => (
                      <Tabs.Tab key={cat.clave} value={cat.clave} color={cat.color}>
                        <Group gap={6} wrap="nowrap">
                          <span>{cat.etiqueta}</span>
                          <Badge size="xs" variant="light" color={cat.color}>
                            {cuentasPorCategoriaBalanza.get(cat.clave)?.length ?? 0}
                          </Badge>
                        </Group>
                      </Tabs.Tab>
                    ))}
                  </Tabs.List>
                  {categoriasBalanzaConDatos.map((cat) => (
                    <Tabs.Panel key={cat.clave} value={cat.clave} pt="sm">
                      <TablaBalanza cuentas={cuentasPorCategoriaBalanza.get(cat.clave) ?? []} colorAcento={cat.color} />
                    </Tabs.Panel>
                  ))}
                </Tabs>
              )}
            </Stack>
          </Card>
          )}

          {vista === 'analisis' && <PanelAnaliticaFacturacion />}
        </Stack>
      )}

      <Text size="xs" c="dimmed" ta="center">
        Proceso independiente del Flujo de Trabajo y de Reporte 601 — cada paso descarga un Excel; el detalle de
        Tablas_Forma_Pago solo se guarda en la base de datos si presionas "Guardar en base de datos" en el Paso 2.
      </Text>

      <Modal
        opened={modalReemplazoTablasAbierto}
        onClose={() => setModalReemplazoTablasAbierto(false)}
        title={<Text fw={600} c="red">Confirmar reemplazo</Text>}
      >
        <Stack gap="md">
          <Text size="sm">
            Ya existen {filasExistentesReemplazo} fila(s) guardadas para el periodo "{periodoGuardado}". Si
            continúas, se reemplazarán por el detalle del archivo actual.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setModalReemplazoTablasAbierto(false)}>
              Cancelar
            </Button>
            <Button
              color="red"
              loading={guardarTablasFormaPago.isPending}
              onClick={() => executeGuardarTablasFormaPago(true)}
            >
              Reemplazar
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={modalEliminarPeriodoAbierto}
        onClose={() => setModalEliminarPeriodoAbierto(false)}
        title={<Text fw={600} c="red">Confirmar eliminación</Text>}
      >
        <Stack gap="md">
          <Text size="sm">
            Esto eliminará todas las filas guardadas para el día "{periodoSeleccionado}". Esta acción no se puede
            deshacer.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setModalEliminarPeriodoAbierto(false)}>
              Cancelar
            </Button>
            <Button
              color="red"
              loading={eliminarPeriodoTablasFormaPago.isPending}
              onClick={executeEliminarPeriodoTablasFormaPago}
            >
              Eliminar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

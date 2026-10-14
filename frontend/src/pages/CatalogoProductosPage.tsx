/**
 * CatalogoProductosPage — Catálogo de Productos (módulo independiente de
 * Ingresos/Pagos/Conciliación/Facturación/Pagos de Recepción).
 *
 * Por ahora solo cubre el catálogo maestro: subir el Excel de catálogo y
 * verlo agrupado por categoría. Costeo por receta e histórico de ventas se
 * construirán sobre esta misma tabla en una siguiente iteración.
 */

import {
  Accordion,
  ActionIcon,
  Badge,
  Button,
  Card,
  Collapse,
  Divider,
  Group,
  List,
  Modal,
  NumberInput,
  Textarea,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Skeleton,
  Table,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { DateInput, DatePickerInput, MonthPickerInput } from '@mantine/dates';
import { Dropzone, MS_EXCEL_MIME_TYPE } from '@mantine/dropzone';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import ReporteProduccionPanel from '../components/ReporteProduccionPanel';
import {
  IconAdjustmentsHorizontal,
  IconAlertTriangle,
  IconApple,
  IconArrowLeft,
  IconBolt,
  IconBrain,
  IconBuildingStore,
  IconClipboardCheck,
  IconBulb,
  IconCalculator,
  IconCalendarWeek,
  IconCategory,
  IconChartInfographic,
  IconReportMoney,
  IconChartPie,
  IconChefHat,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconCoffee,
  IconCup,
  IconDeviceFloppy,
  IconEdit,
  IconFileInvoice,
  IconFileSpreadsheet,
  IconFish,
  IconFlame,
  IconGift,
  IconGlassCocktail,
  IconListDetails,
  IconReceiptTax,
  IconRefresh,
  IconSearch,
  IconShieldExclamation,
  IconShoppingCart,
  IconStack2,
  IconStar,
  IconSunrise,
  IconTag,
  IconToolsKitchen2,
  IconTrash,
  IconTrendingUp,
  IconTrendingDown,
  IconUpload,
  IconX,
} from '@tabler/icons-react';
import { useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';

import { SEMANTIC_COLORS } from '../theme/tokens';
import {
  useActualizarConfiguracionCosteo,
  useActualizarConfiguracionCosteoCafeteria,
  useActualizarConfiguracionCosteoCarretaMariscos,
  useActualizarIncrementoGrupo,
  useActualizarIncrementoGrupoCafeteria,
  useActualizarIncrementoGrupoCarretaMariscos,
  useActualizarPrecioSugerido,
  useActualizarPrecioSugeridoCafeteria,
  useActualizarPrecioSugeridoCarretaMariscos,
  useCatalogoProductos,
  useCatalogoProductosCafeteria,
  useCatalogoProductosCarretaMariscos,
  useConfiguracionCosteo,
  useConfiguracionCosteoCafeteria,
  useConfiguracionCosteoCarretaMariscos,
  useCosteoProductos,
  useCosteoProductosCafeteria,
  useCosteoProductosCarretaMariscos,
  useEliminarPrecioSugerido,
  useEliminarPrecioSugeridoCafeteria,
  useEliminarPrecioSugeridoCarretaMariscos,
  useExportarCosteo,
  useExportarCosteoCafeteria,
  useExportarCosteoCarretaMariscos,
  useExportarCosteoCompleto,
  useCortesiasProductosVendidos,
  useCortesiasProductosVendidosCafeteria,
  useCortesiasProductosVendidosCarretaMariscos,
  useEliminarProductosVendidos,
  useEliminarProductosVendidosCafeteria,
  useEliminarProductosVendidosCarretaMariscos,
  useExportarProductosVendidos,
  useExportarProductosVendidosCafeteria,
  useExportarProductosVendidosCarretaMariscos,
  useGuardarCatalogoProductos,
  useGuardarCatalogoProductosCafeteria,
  useGuardarCatalogoProductosCarretaMariscos,
  useLotesProductosVendidos,
  usePeriodosProductosVendidosCafeteria,
  usePeriodosProductosVendidosCarretaMariscos,
  useProductosVendidos,
  useProductosVendidosCafeteria,
  useProductosVendidosCarretaMariscos,
  useSubirProductosVendidos,
  useSubirProductosVendidosCafeteria,
  useSubirProductosVendidosCarretaMariscos,
  type ProductoCatalogo,
  type ProductoCatalogoCafeteria,
  type ProductoCatalogoCarretaMariscos,
  type ProductoCosteo,
  type ProductoCosteoCafeteria,
  type ProductoCosteoCarretaMariscos,
  type ProductoVendido,
  type ProductoVendidoCafeteria,
  type ProductoVendidoCarretaMariscos,
  type LoteProductosVendidosConflicto,
  type FilaCortesiaProductoVendido,
  type FilaCortesiaProductoVendidoCafeteria,
  type FilaCortesiaProductoVendidoCarretaMariscos,
  useSubirComandasEmitidas,
  useDiasComandasEmitidas,
  useComandasEmitidas,
  useEliminarComandasEmitidas,
  useSubirRecibosEmitidos,
  useDiasRecibosEmitidos,
  useRecibosEmitidos,
  useEliminarRecibosEmitidos,
  useConciliacionVentasDiarias,
  useResumenEjecutivo,
  type ConciliacionVentasResumen,
  type CortesiasRecibos,
  type ResumenEjecutivoInsight,
  useTendenciaMensual,
  useHeatmapVentas,
  useGuardarNotaHeatmap,
  type HeatmapTopProducto,
  useRankingProductos,
  type RankingProductoFila,
  usePanelTurnos,
  useCortesiasDashboard,
  useOportunidadesComerciales,
  type OportunidadComercial,
  useMenuEngineering,
  type MenuEngineeringProductoFila,
  useMixVentas,
  type MixVentasFila,
  useDependenciaProductos,
  useAlertasRiesgo,
  type AlertaRiesgo,
  useDesempenoComercial,
  type ProductoComparadoDesempeno,
  type ComparativoDimensionDesempeno,
  type HallazgoDesempeno,
  type ComparacionKpiDesempeno,
  useOptimizacionPrecios,
  type ProductoCosteoAnalisis,
  type ResumenNivelCosteo,
  type ComparacionHoraFeliz,
  type HallazgoCosteoProductos,
  type CuentaConciliacion,
  type ProductoCuentaConciliacion,
  type FilaProductoConciliacion,
  type ComandaEmitida,
  type ReciboEmitido,
  type RequiereConfirmacionLote,
} from '../api/hooks';
import { StatCard } from '../components/ui/StatCard';

const formatoMoneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

function formatoPorcentaje(costo: number | null, precioVenta: number | null): string {
  if (costo === null || precioVenta === null || precioVenta === 0) return '—';
  return `${((costo / precioVenta) * 100).toFixed(1)}%`;
}

// Orden y estilo fijos de las 5 secciones de menú — cualquier `seccion_menu`
// que el backend no liste aquí (no debería pasar, ya que
// clasificar_seccion_menu solo produce estos 5 valores) simplemente no
// tendría pestaña propia.
const SECCIONES_MENU: { clave: string; color: string; icono: typeof IconApple }[] = [
  { clave: 'Desayuno', color: 'orange', icono: IconSunrise },
  { clave: 'Comida-Cena', color: 'red', icono: IconChefHat },
  { clave: 'Bar', color: 'grape', icono: IconGlassCocktail },
  { clave: 'Extra', color: 'violet', icono: IconStar },
  { clave: 'Otros', color: 'gray', icono: IconCategory },
];

// Orden y estilo fijos de las 3 secciones de categoría — cualquier
// `categoria_tipo` que el backend no liste aquí (no debería pasar, ya que
// clasificar_tipo_producto solo produce estos 3 valores) simplemente no
// tendría pestaña propia. `etiqueta` es lo que se muestra (puede diferir de
// `clave`, que es el valor real usado para filtrar/como value de la Tabs).
const CATEGORIAS_TIPO: { clave: string; etiqueta: string; color: string; icono: typeof IconApple }[] = [
  { clave: 'Alimentos', etiqueta: 'Alimentos', color: 'green', icono: IconApple },
  { clave: 'Bebidas', etiqueta: 'Bebidas', color: 'blue', icono: IconCup },
  { clave: 'Otros', etiqueta: 'Otros', color: 'gray', icono: IconToolsKitchen2 },
];

// Color propio por evento anual — "que representen esa fecha", no el color
// genérico de la categoría. Clave = el texto que ya devuelve el backend
// (clasificar_evento_especial), usado solo para estilo de tarjeta.
const EVENTOS_ESPECIALES: { clave: string; color: string }[] = [
  { clave: 'San Valentín', color: 'pink' },
  { clave: 'Súper Bowl', color: 'indigo' },
  { clave: 'Acción de Gracias', color: 'orange' },
  { clave: 'Nochebuena', color: 'red' },
  { clave: 'Navidad', color: 'green' },
];

function sumaCampo(productos: ProductoCatalogo[], campo: 'costo' | 'precio_venta'): number {
  return productos.reduce((acc, p) => acc + (p[campo] ?? 0), 0);
}

// Semáforo visual del % de costo — referencia general de la industria
// restaurantera (≤30% saludable, 30–40% para vigilar, >40% alerta), solo
// para ayudar a detectar de un vistazo qué productos conviene revisar. No
// es una regla de negocio del backend, es puramente indicativo en UI.
function colorPorcentajeCosto(costo: number | null, precioVenta: number | null): string | undefined {
  if (costo === null || precioVenta === null || precioVenta === 0) return undefined;
  const pct = (costo / precioVenta) * 100;
  if (pct <= 30) return SEMANTIC_COLORS.success;
  if (pct <= 40) return SEMANTIC_COLORS.warning;
  return SEMANTIC_COLORS.error;
}

// Semáforo de % de margen (Ranking de Productos) — lógica invertida a la de
// % de costo: aquí un número ALTO es bueno. Umbrales de referencia, no una
// regla de negocio del backend, solo indicativo en UI.
function colorMargenPct(margenPct: number | null): string | undefined {
  if (margenPct === null) return undefined;
  if (margenPct >= 50) return SEMANTIC_COLORS.success;
  if (margenPct >= 30) return SEMANTIC_COLORS.warning;
  return SEMANTIC_COLORS.error;
}

// Color de badge para un estado de costeo binario (dentro/fuera del % de
// costo objetivo) — mismo semáforo simplificado usado en los resúmenes
// globales y por grupo de las 3 pestañas de punto de venta.
const colorPorEstadoCosteo = (dentroDeObjetivo: boolean) =>
  dentroDeObjetivo ? SEMANTIC_COLORS.success : SEMANTIC_COLORS.error;

// % costo de un producto vendido usando el Costo/Precio de Venta del
// CATÁLOGO (no los de la fila de ventas), mismo criterio que
// calcular_costeo del backend (Costo ÷ (Precio de Venta ÷ IVA)) — para
// saber qué productos vendidos generan pérdida contra su estándar de
// receta, sin el ruido mes a mes del costo real reportado en ventas.
function pctCostoCatalogo(costoCatalogo: number | null, precioVentaCatalogo: number | null, ivaFactor: number): number | null {
  if (costoCatalogo === null || precioVentaCatalogo === null || precioVentaCatalogo === 0) return null;
  return costoCatalogo / (precioVentaCatalogo / ivaFactor);
}

// Tabla de productos de un solo subgrupo — encabezado con tipografía
// compacta en mayúsculas, cifras con numerales tabulares para que alineen
// en columna, filas con más aire, y un semáforo de color en % costo.
function TablaProductos({ productos, color }: { productos: ProductoCatalogo[]; color: string }) {
  return (
    <Card withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
      <Table.ScrollContainer minWidth={640}>
        <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
          <Table.Thead
            style={{
              background: 'var(--mantine-color-default-hover)',
              borderBottom: '2px solid var(--mantine-color-default-border)',
            }}
          >
            <Table.Tr>
              <Table.Th style={{ fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--mantine-color-dimmed)' }}>
                Producto
              </Table.Th>
              <Table.Th style={{ fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--mantine-color-dimmed)' }}>
                Tipo
              </Table.Th>
              <Table.Th ta="right" style={{ fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--mantine-color-dimmed)' }}>
                Costo
              </Table.Th>
              <Table.Th ta="right" style={{ fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--mantine-color-dimmed)' }}>
                Precio de venta
              </Table.Th>
              <Table.Th ta="right" style={{ fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--mantine-color-dimmed)' }}>
                % costo
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {productos.map((p) => (
              <Table.Tr key={p.id}>
                <Table.Td>
                  <Text size="sm" fw={500}>
                    {p.nombre_producto}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {p.tipo ?? '—'}
                  </Text>
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.costo !== null ? formatoMoneda.format(p.costo) : '—'}
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.precio_venta !== null ? formatoMoneda.format(p.precio_venta) : '—'}
                </Table.Td>
                <Table.Td ta="right">
                  {formatoPorcentaje(p.costo, p.precio_venta) === '—' ? (
                    <Text size="sm" c="dimmed" ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      —
                    </Text>
                  ) : (
                    <Badge
                      size="sm"
                      variant="light"
                      color={colorPorcentajeCosto(p.costo, p.precio_venta)}
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {formatoPorcentaje(p.costo, p.precio_venta)}
                    </Badge>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
          <Table.Tfoot>
            <Table.Tr style={{ borderTop: `2px solid var(--mantine-color-${color}-6)`, background: 'var(--mantine-color-default-hover)' }}>
              <Table.Th>TOTAL</Table.Th>
              <Table.Th />
              <Table.Th ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatoMoneda.format(sumaCampo(productos, 'costo'))}
              </Table.Th>
              <Table.Th ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatoMoneda.format(sumaCampo(productos, 'precio_venta'))}
              </Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Tfoot>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );
}

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
        <Dropzone onDrop={(files) => onDrop(files[0])} accept={MS_EXCEL_MIME_TYPE} maxSize={50 * 1024 * 1024} maxFiles={1} p="xs">
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

// Orden fijo Lunes-Domingo para la franja de noches temáticas — no depende
// del orden en que lleguen los datos.
const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function agruparPor<K extends keyof ProductoCatalogo>(productos: ProductoCatalogo[], campo: K): Map<string, ProductoCatalogo[]> {
  const mapa = new Map<string, ProductoCatalogo[]>();
  for (const producto of productos) {
    const clave = String(producto[campo]);
    const lista = mapa.get(clave) ?? [];
    lista.push(producto);
    mapa.set(clave, lista);
  }
  return mapa;
}

// Tercer nivel: cuadrícula de tarjetas de subgrupo (una por `grupo`) — al
// hacer clic se muestra solo la tabla de ese subgrupo, nunca varias a la
// vez, para no renderizar de golpe cientos de filas de toda la categoría.
function PanelSubgrupos({ productos, color }: { productos: ProductoCatalogo[]; color: string }) {
  const [grupoActivo, setGrupoActivo] = useState<string | null>(null);

  const productosPorGrupo = useMemo(() => agruparPor(productos, 'grupo'), [productos]);

  // Subgrupos que son noches temáticas de la rotación semanal o días
  // especiales de una vez al año (todos los productos de ese grupo
  // comparten el mismo dia_tematica/evento_especial, calculado por grupo en
  // el backend) van en su propia franja en vez de la cuadrícula alfabética
  // normal de subgrupos.
  const gruposTematicosPorDia = new Map<string, string>(); // dia -> grupo
  const gruposEspecialesPorEvento = new Map<string, string>(); // evento -> grupo
  const gruposRegulares: string[] = [];
  for (const [grupo, productosGrupo] of productosPorGrupo) {
    const dia = productosGrupo[0]?.dia_tematica;
    const evento = productosGrupo[0]?.evento_especial;
    if (dia) {
      gruposTematicosPorDia.set(dia, grupo);
    } else if (evento) {
      gruposEspecialesPorEvento.set(evento, grupo);
    } else {
      gruposRegulares.push(grupo);
    }
  }
  const diasConDatos = DIAS_SEMANA.filter((dia) => gruposTematicosPorDia.has(dia));
  const eventosConDatos = EVENTOS_ESPECIALES.filter((ev) => gruposEspecialesPorEvento.has(ev.clave));
  const grupos = gruposRegulares.sort((a, b) => a.localeCompare(b));

  if (grupoActivo && productosPorGrupo.has(grupoActivo)) {
    const productosGrupo = productosPorGrupo.get(grupoActivo)!;
    return (
      <Stack gap="sm">
        <UnstyledButton onClick={() => setGrupoActivo(null)} style={{ alignSelf: 'flex-start' }}>
          <Group gap={6}>
            <IconArrowLeft size={16} />
            <Text size="sm" fw={500}>
              Volver a subgrupos
            </Text>
          </Group>
        </UnstyledButton>

        <Group gap="xs">
          <div style={{ width: 4, height: 16, borderRadius: 2, background: `var(--mantine-color-${color}-6)` }} />
          <Text fw={700} size="sm">
            {grupoActivo}
          </Text>
          <Badge size="sm" variant="light" color="gray">
            {productosGrupo.length}
          </Badge>
        </Group>

        <TablaProductos productos={productosGrupo} color={color} />
      </Stack>
    );
  }

  if (grupos.length === 0 && diasConDatos.length === 0 && eventosConDatos.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Ningún producto coincide aquí.
      </Text>
    );
  }

  return (
    <Stack gap="xl">
      {diasConDatos.length > 0 && (
        <Stack gap="sm">
          <Group gap={6}>
            <IconCalendarWeek size={16} color={`var(--mantine-color-${color}-6)`} />
            <Text size="sm" fw={700}>
              Noches Temáticas de la Semana
            </Text>
          </Group>
          <SimpleGrid cols={{ base: 2, xs: 3, sm: 4, md: 7 }} spacing="sm">
            {diasConDatos.map((dia) => {
              const grupo = gruposTematicosPorDia.get(dia)!;
              const productosGrupo = productosPorGrupo.get(grupo)!;
              return (
                <Card
                  key={dia}
                  radius="md"
                  p="md"
                  component="button"
                  onClick={() => setGrupoActivo(grupo)}
                  style={{
                    textAlign: 'left',
                    cursor: 'pointer',
                    border: `1px solid var(--mantine-color-${color}-4)`,
                    background: `linear-gradient(160deg, var(--mantine-color-${color}-light) 0%, transparent 70%)`,
                  }}
                >
                  <Stack gap={4}>
                    <Text size="xs" fw={700} tt="uppercase" c={color} style={{ letterSpacing: 0.5 }}>
                      {dia}
                    </Text>
                    <Text size="sm" fw={600}>
                      {grupo.replace(/\s*CENA$/i, '')}
                    </Text>
                    <Badge size="xs" variant="light" color={color} style={{ alignSelf: 'flex-start' }}>
                      {productosGrupo.length}
                    </Badge>
                  </Stack>
                </Card>
              );
            })}
          </SimpleGrid>
        </Stack>
      )}

      {eventosConDatos.length > 0 && (
        <Stack gap="sm">
          <Group gap={6}>
            <IconGift size={16} color="var(--mantine-color-dimmed)" />
            <Text size="sm" fw={700}>
              Días Especiales
            </Text>
          </Group>
          <SimpleGrid cols={{ base: 2, xs: 3, sm: 4, md: 5 }} spacing="sm">
            {eventosConDatos.map((ev) => {
              const grupo = gruposEspecialesPorEvento.get(ev.clave)!;
              const productosGrupo = productosPorGrupo.get(grupo)!;
              return (
                <Card
                  key={ev.clave}
                  radius="md"
                  p="md"
                  component="button"
                  onClick={() => setGrupoActivo(grupo)}
                  style={{
                    textAlign: 'left',
                    cursor: 'pointer',
                    border: `1px solid var(--mantine-color-${ev.color}-4)`,
                    background: `linear-gradient(160deg, var(--mantine-color-${ev.color}-light) 0%, transparent 70%)`,
                  }}
                >
                  <Stack gap={4}>
                    <Text size="xs" fw={700} tt="uppercase" c={ev.color} style={{ letterSpacing: 0.5 }}>
                      {ev.clave}
                    </Text>
                    <Text size="sm" fw={600}>
                      {grupo.replace(/\s*CENA$/i, '')}
                    </Text>
                    <Badge size="xs" variant="light" color={ev.color} style={{ alignSelf: 'flex-start' }}>
                      {productosGrupo.length}
                    </Badge>
                  </Stack>
                </Card>
              );
            })}
          </SimpleGrid>
        </Stack>
      )}

      {grupos.length > 0 && (
        <Stack gap="sm">
          {(diasConDatos.length > 0 || eventosConDatos.length > 0) && (
            <Text size="sm" fw={700} c="dimmed">
              Otros subgrupos
            </Text>
          )}
          <SimpleGrid cols={{ base: 1, xs: 2, sm: 3, md: 4 }} spacing="sm">
            {grupos.map((grupo) => {
              const productosGrupo = productosPorGrupo.get(grupo)!;
              return (
                <Card
                  key={grupo}
                  withBorder
                  radius="md"
                  p="md"
                  component="button"
                  onClick={() => setGrupoActivo(grupo)}
                  style={{ textAlign: 'left', cursor: 'pointer' }}
                >
                  <Stack gap={6}>
                    <div style={{ width: 28, height: 4, borderRadius: 2, background: `var(--mantine-color-${color}-6)` }} />
                    <Group justify="space-between" wrap="nowrap" align="flex-start">
                      <Text size="sm" fw={600} style={{ flex: 1 }}>
                        {grupo}
                      </Text>
                      <IconChevronRight size={16} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0, marginTop: 2 }} />
                    </Group>
                    <Badge size="sm" variant="light" color={color}>
                      {productosGrupo.length} producto{productosGrupo.length === 1 ? '' : 's'}
                    </Badge>
                  </Stack>
                </Card>
              );
            })}
          </SimpleGrid>
        </Stack>
      )}
    </Stack>
  );
}

// ── Cafetería (módulo independiente, sin categoria_tipo/seccion_menu
// todavía — ver docstring de models/catalogo_producto_cafeteria.py) ──────

function sumaCampoCafeteria(productos: ProductoCatalogoCafeteria[], campo: 'costo' | 'precio_venta'): number {
  return productos.reduce((acc, p) => acc + (p[campo] ?? 0), 0);
}

function TablaProductosCafeteria({ productos, color }: { productos: ProductoCatalogoCafeteria[]; color: string }) {
  return (
    <Card withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
      <Table.ScrollContainer minWidth={640}>
        <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
          <Table.Thead
            style={{
              background: 'var(--mantine-color-default-hover)',
              borderBottom: '2px solid var(--mantine-color-default-border)',
            }}
          >
            <Table.Tr>
              <Table.Th style={ESTILO_ENCABEZADO_TABLA}>Producto</Table.Th>
              <Table.Th style={ESTILO_ENCABEZADO_TABLA}>Tipo</Table.Th>
              <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Costo</Table.Th>
              <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Precio de venta</Table.Th>
              <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>% costo</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {productos.map((p) => (
              <Table.Tr key={p.id}>
                <Table.Td>
                  <Text size="sm" fw={500}>
                    {p.nombre_producto}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {p.tipo ?? '—'}
                  </Text>
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.costo !== null ? formatoMoneda.format(p.costo) : '—'}
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.precio_venta !== null ? formatoMoneda.format(p.precio_venta) : '—'}
                </Table.Td>
                <Table.Td ta="right">
                  {formatoPorcentaje(p.costo, p.precio_venta) === '—' ? (
                    <Text size="sm" c="dimmed" ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      —
                    </Text>
                  ) : (
                    <Badge
                      size="sm"
                      variant="light"
                      color={colorPorcentajeCosto(p.costo, p.precio_venta)}
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {formatoPorcentaje(p.costo, p.precio_venta)}
                    </Badge>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
          <Table.Tfoot>
            <Table.Tr style={{ borderTop: `2px solid var(--mantine-color-${color}-6)`, background: 'var(--mantine-color-default-hover)' }}>
              <Table.Th>TOTAL</Table.Th>
              <Table.Th />
              <Table.Th ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatoMoneda.format(sumaCampoCafeteria(productos, 'costo'))}
              </Table.Th>
              <Table.Th ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatoMoneda.format(sumaCampoCafeteria(productos, 'precio_venta'))}
              </Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Tfoot>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );
}

// Cuadrícula de tarjetas de grupo (un solo nivel — todavía no hay
// categoria_tipo/seccion_menu para dividir en pestañas como en el
// restaurante) — al hacer clic se muestra la tabla de ese grupo.
function PanelGruposCafeteria({ productos, color }: { productos: ProductoCatalogoCafeteria[]; color: string }) {
  const [grupoActivo, setGrupoActivo] = useState<string | null>(null);

  const productosPorGrupo = useMemo(() => {
    const mapa = new Map<string, ProductoCatalogoCafeteria[]>();
    for (const p of productos) {
      const lista = mapa.get(p.grupo) ?? [];
      lista.push(p);
      mapa.set(p.grupo, lista);
    }
    return mapa;
  }, [productos]);

  const grupos = Array.from(productosPorGrupo.keys()).sort((a, b) => a.localeCompare(b));

  if (grupoActivo && productosPorGrupo.has(grupoActivo)) {
    const productosGrupo = productosPorGrupo.get(grupoActivo)!;
    return (
      <Stack gap="sm">
        <UnstyledButton onClick={() => setGrupoActivo(null)} style={{ alignSelf: 'flex-start' }}>
          <Group gap={6}>
            <IconArrowLeft size={16} />
            <Text size="sm" fw={500}>
              Volver a grupos
            </Text>
          </Group>
        </UnstyledButton>

        <Group gap="xs">
          <div style={{ width: 4, height: 16, borderRadius: 2, background: `var(--mantine-color-${color}-6)` }} />
          <Text fw={700} size="sm">
            {grupoActivo}
          </Text>
          <Badge size="sm" variant="light" color="gray">
            {productosGrupo.length}
          </Badge>
        </Group>

        <TablaProductosCafeteria productos={productosGrupo} color={color} />
      </Stack>
    );
  }

  if (grupos.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Todavía no hay productos guardados. Sube el catálogo de Cafetería arriba.
      </Text>
    );
  }

  return (
    <SimpleGrid cols={{ base: 1, xs: 2, sm: 3, md: 4 }} spacing="sm">
      {grupos.map((grupo) => {
        const productosGrupo = productosPorGrupo.get(grupo)!;
        return (
          <Card
            key={grupo}
            withBorder
            radius="md"
            p="md"
            component="button"
            onClick={() => setGrupoActivo(grupo)}
            style={{ textAlign: 'left', cursor: 'pointer' }}
          >
            <Stack gap={6}>
              <div style={{ width: 28, height: 4, borderRadius: 2, background: `var(--mantine-color-${color}-6)` }} />
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Text size="sm" fw={600} style={{ flex: 1 }}>
                  {grupo}
                </Text>
                <IconChevronRight size={16} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0, marginTop: 2 }} />
              </Group>
              <Badge size="sm" variant="light" color={color}>
                {productosGrupo.length} producto{productosGrupo.length === 1 ? '' : 's'}
              </Badge>
            </Stack>
          </Card>
        );
      })}
    </SimpleGrid>
  );
}

function PanelCafeteria() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [modalReemplazoAbierto, setModalReemplazoAbierto] = useState(false);
  const [totalExistentesReemplazo, setTotalExistentesReemplazo] = useState(0);
  const [filtro, setFiltro] = useState('');
  const [filtroDebounced] = useDebouncedValue(filtro.trim(), 300);
  const [mostrarSubirManual, setMostrarSubirManual] = useState<boolean | null>(null);
  const [vistaActiva, setVistaActiva] = useState<SeccionPosClave | null>(null);

  const guardarCatalogo = useGuardarCatalogoProductosCafeteria();
  const catalogo = useCatalogoProductosCafeteria();

  const hayCatalogo = (catalogo.data?.total ?? 0) > 0;
  const mostrarSubir = mostrarSubirManual ?? !hayCatalogo;

  const executeGuardarCatalogo = (confirmarReemplazo = false) => {
    if (!archivo) return;

    guardarCatalogo.mutate(
      { file: archivo, confirmarReemplazo },
      {
        onSuccess: (data) => {
          if ('requiere_confirmacion' in data) {
            setTotalExistentesReemplazo(data.total_existentes);
            setModalReemplazoAbierto(true);
            return;
          }
          setModalReemplazoAbierto(false);
          setArchivo(null);
          setMostrarSubirManual(false);
          notifications.show({
            title: 'Catálogo de Cafetería guardado',
            message: `${data.total} producto(s) guardado(s) en ${Object.keys(data.por_grupo).length} grupo(s).`,
            color: 'green',
            icon: <IconCheck size={16} />,
          });
        },
        onError: (err: any) => {
          notifications.show({
            title: 'Error al guardar el catálogo',
            message: err.response?.data?.detail || 'Ocurrió un error al procesar el archivo.',
            color: 'red',
            icon: <IconX size={16} />,
          });
        },
      },
    );
  };

  const productosFiltrados = useMemo(() => {
    const productos = catalogo.data?.productos ?? [];
    if (!filtroDebounced) return productos;
    const texto = filtroDebounced.toLowerCase();
    return productos.filter((p) => p.nombre_producto.toLowerCase().includes(texto));
  }, [catalogo.data?.productos, filtroDebounced]);

  return (
    <Stack gap="lg">
      {vistaActiva === null ? (
        <PanelMenuSeccionesPos color="teal" onSeleccionar={setVistaActiva} />
      ) : (
        <Stack gap="lg">
          <Button
            variant="subtle"
            size="sm"
            leftSection={<IconArrowLeft size={16} />}
            onClick={() => setVistaActiva(null)}
            style={{ alignSelf: 'flex-start' }}
          >
            Volver a secciones
          </Button>

          {vistaActiva === 'catalogo' && (
            <Stack gap="lg">
              <Card withBorder radius="md" p={mostrarSubir ? 'lg' : 'sm'}>
                <Stack gap={mostrarSubir ? 'md' : 0}>
                  <UnstyledButton onClick={() => setMostrarSubirManual(!mostrarSubir)}>
                    <Group justify="space-between">
                      <Text fw={600} size={mostrarSubir ? 'md' : 'sm'}>
                        {mostrarSubir ? 'Subir catálogo' : 'Actualizar catálogo'}
                      </Text>
                      <ActionIcon variant="subtle" color="gray" size="sm">
                        {mostrarSubir ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                      </ActionIcon>
                    </Group>
                  </UnstyledButton>
                  <Collapse in={mostrarSubir}>
                    <Stack gap="md" pt="xs">
                      <ArchivoDropzone
                        titulo="Catálogo de productos — Cafetería"
                        descripcion="Excel de catálogo (columnas B, C, G, K, O, Q desde la fila 6) — mismo formato que el del restaurante."
                        file={archivo}
                        onDrop={setArchivo}
                        onRemove={() => setArchivo(null)}
                      />
                      {archivo && (
                        <Group justify="flex-end">
                          <Button onClick={() => executeGuardarCatalogo(false)} loading={guardarCatalogo.isPending}>
                            Guardar catálogo
                          </Button>
                        </Group>
                      )}
                    </Stack>
                  </Collapse>
                </Stack>
              </Card>

              <Card withBorder radius="md" p="lg">
                <Stack gap="md">
                  <Group justify="space-between">
                    <Title order={4}>Catálogo guardado</Title>
                    <Badge variant="light" color="teal">
                      {catalogo.data?.total ?? 0} producto(s)
                    </Badge>
                  </Group>

                  <TextInput
                    placeholder="Buscar producto por nombre"
                    leftSection={<IconSearch size={16} />}
                    value={filtro}
                    onChange={(e) => setFiltro(e.currentTarget.value)}
                  />

                  {catalogo.isLoading && <Text size="sm" c="dimmed">Cargando...</Text>}

                  {!catalogo.isLoading && <PanelGruposCafeteria productos={productosFiltrados} color="teal" />}
                </Stack>
              </Card>
            </Stack>
          )}

          {vistaActiva === 'costeo' && <PanelCosteoCafeteria />}
          {vistaActiva === 'productos-vendidos' && <PanelProductosVendidosCafeteria />}
          {vistaActiva === 'cortesia' && <PanelComparacionIvaCafeteria />}
          {vistaActiva === 'analisis' && <PanelAnalisisVentasCafeteria />}
        </Stack>
      )}

      <Modal
        opened={modalReemplazoAbierto}
        onClose={() => setModalReemplazoAbierto(false)}
        title={<Text fw={600} c="red">Confirmar reemplazo</Text>}
      >
        <Stack gap="md">
          <Text size="sm">
            Ya existen {totalExistentesReemplazo} producto(s) guardados en el catálogo de Cafetería. Si continúas, se
            reemplazarán todos por el contenido del archivo actual.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setModalReemplazoAbierto(false)}>
              Cancelar
            </Button>
            <Button color="red" loading={guardarCatalogo.isPending} onClick={() => executeGuardarCatalogo(true)}>
              Reemplazar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

// ── La Carreta de Mariscos (módulo independiente, mismo criterio que
// Cafetería — ver docstring de models/catalogo_producto_carreta_mariscos.py) ──

function sumaCampoCarretaMariscos(productos: ProductoCatalogoCarretaMariscos[], campo: 'costo' | 'precio_venta'): number {
  return productos.reduce((acc, p) => acc + (p[campo] ?? 0), 0);
}

function TablaProductosCarretaMariscos({ productos, color }: { productos: ProductoCatalogoCarretaMariscos[]; color: string }) {
  return (
    <Card withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
      <Table.ScrollContainer minWidth={640}>
        <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
          <Table.Thead
            style={{
              background: 'var(--mantine-color-default-hover)',
              borderBottom: '2px solid var(--mantine-color-default-border)',
            }}
          >
            <Table.Tr>
              <Table.Th style={ESTILO_ENCABEZADO_TABLA}>Producto</Table.Th>
              <Table.Th style={ESTILO_ENCABEZADO_TABLA}>Tipo</Table.Th>
              <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Costo</Table.Th>
              <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Precio de venta</Table.Th>
              <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>% costo</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {productos.map((p) => (
              <Table.Tr key={p.id}>
                <Table.Td>
                  <Text size="sm" fw={500}>
                    {p.nombre_producto}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs" c="dimmed">
                    {p.tipo ?? '—'}
                  </Text>
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.costo !== null ? formatoMoneda.format(p.costo) : '—'}
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.precio_venta !== null ? formatoMoneda.format(p.precio_venta) : '—'}
                </Table.Td>
                <Table.Td ta="right">
                  {formatoPorcentaje(p.costo, p.precio_venta) === '—' ? (
                    <Text size="sm" c="dimmed" ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      —
                    </Text>
                  ) : (
                    <Badge
                      size="sm"
                      variant="light"
                      color={colorPorcentajeCosto(p.costo, p.precio_venta)}
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {formatoPorcentaje(p.costo, p.precio_venta)}
                    </Badge>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
          <Table.Tfoot>
            <Table.Tr style={{ borderTop: `2px solid var(--mantine-color-${color}-6)`, background: 'var(--mantine-color-default-hover)' }}>
              <Table.Th>TOTAL</Table.Th>
              <Table.Th />
              <Table.Th ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatoMoneda.format(sumaCampoCarretaMariscos(productos, 'costo'))}
              </Table.Th>
              <Table.Th ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatoMoneda.format(sumaCampoCarretaMariscos(productos, 'precio_venta'))}
              </Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Tfoot>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );
}

// Cuadrícula de tarjetas de grupo (un solo nivel — todavía no hay
// categoria_tipo/seccion_menu para dividir en pestañas como en el
// restaurante) — al hacer clic se muestra la tabla de ese grupo.
function PanelGruposCarretaMariscos({ productos, color }: { productos: ProductoCatalogoCarretaMariscos[]; color: string }) {
  const [grupoActivo, setGrupoActivo] = useState<string | null>(null);

  const productosPorGrupo = useMemo(() => {
    const mapa = new Map<string, ProductoCatalogoCarretaMariscos[]>();
    for (const p of productos) {
      const lista = mapa.get(p.grupo) ?? [];
      lista.push(p);
      mapa.set(p.grupo, lista);
    }
    return mapa;
  }, [productos]);

  const grupos = Array.from(productosPorGrupo.keys()).sort((a, b) => a.localeCompare(b));

  if (grupoActivo && productosPorGrupo.has(grupoActivo)) {
    const productosGrupo = productosPorGrupo.get(grupoActivo)!;
    return (
      <Stack gap="sm">
        <UnstyledButton onClick={() => setGrupoActivo(null)} style={{ alignSelf: 'flex-start' }}>
          <Group gap={6}>
            <IconArrowLeft size={16} />
            <Text size="sm" fw={500}>
              Volver a grupos
            </Text>
          </Group>
        </UnstyledButton>

        <Group gap="xs">
          <div style={{ width: 4, height: 16, borderRadius: 2, background: `var(--mantine-color-${color}-6)` }} />
          <Text fw={700} size="sm">
            {grupoActivo}
          </Text>
          <Badge size="sm" variant="light" color="gray">
            {productosGrupo.length}
          </Badge>
        </Group>

        <TablaProductosCarretaMariscos productos={productosGrupo} color={color} />
      </Stack>
    );
  }

  if (grupos.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Todavía no hay productos guardados. Sube el catálogo de La Carreta de Mariscos arriba.
      </Text>
    );
  }

  return (
    <SimpleGrid cols={{ base: 1, xs: 2, sm: 3, md: 4 }} spacing="sm">
      {grupos.map((grupo) => {
        const productosGrupo = productosPorGrupo.get(grupo)!;
        return (
          <Card
            key={grupo}
            withBorder
            radius="md"
            p="md"
            component="button"
            onClick={() => setGrupoActivo(grupo)}
            style={{ textAlign: 'left', cursor: 'pointer' }}
          >
            <Stack gap={6}>
              <div style={{ width: 28, height: 4, borderRadius: 2, background: `var(--mantine-color-${color}-6)` }} />
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Text size="sm" fw={600} style={{ flex: 1 }}>
                  {grupo}
                </Text>
                <IconChevronRight size={16} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0, marginTop: 2 }} />
              </Group>
              <Badge size="sm" variant="light" color={color}>
                {productosGrupo.length} producto{productosGrupo.length === 1 ? '' : 's'}
              </Badge>
            </Stack>
          </Card>
        );
      })}
    </SimpleGrid>
  );
}

// Segundo nivel de pestañas (Alimentos/Bebidas/Otros) — calcado de
// PanelPorCategoria (restaurante) pero simplificado: sin la lógica de
// Noches Temáticas/Días Especiales, que no aplica a La Carreta de
// Mariscos. Reusa CATEGORIAS_TIPO (arreglo genérico, no específico del
// restaurante) para colores/íconos/orden.
function PanelPorCategoriaCarretaMariscos({ productos }: { productos: ProductoCatalogoCarretaMariscos[] }) {
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null);

  const productosPorCategoria = useMemo(() => {
    const mapa = new Map<string, ProductoCatalogoCarretaMariscos[]>();
    for (const p of productos) {
      const lista = mapa.get(p.categoria_tipo) ?? [];
      lista.push(p);
      mapa.set(p.categoria_tipo, lista);
    }
    return mapa;
  }, [productos]);

  const categoriasConDatos = CATEGORIAS_TIPO.filter((cat) => (productosPorCategoria.get(cat.clave)?.length ?? 0) > 0);

  const categoriaMostrada =
    categoriaActiva && categoriasConDatos.some((cat) => cat.clave === categoriaActiva)
      ? categoriaActiva
      : (categoriasConDatos[0]?.clave ?? null);

  if (categoriasConDatos.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Todavía no hay productos guardados. Sube el catálogo de La Carreta de Mariscos arriba.
      </Text>
    );
  }

  return (
    <Tabs value={categoriaMostrada} onChange={setCategoriaActiva} variant="pills" keepMounted={false}>
      <Tabs.List>
        {categoriasConDatos.map((cat) => (
          <Tabs.Tab
            key={cat.clave}
            value={cat.clave}
            color={cat.color}
            leftSection={<cat.icono size={16} />}
            rightSection={
              <Badge size="sm" variant="light" color={cat.clave === categoriaMostrada ? 'white' : cat.color}>
                {productosPorCategoria.get(cat.clave)?.length ?? 0}
              </Badge>
            }
          >
            {cat.etiqueta}
          </Tabs.Tab>
        ))}
      </Tabs.List>

      {categoriasConDatos.map((cat) => (
        <Tabs.Panel key={cat.clave} value={cat.clave} pt="md">
          <PanelGruposCarretaMariscos productos={productosPorCategoria.get(cat.clave) ?? []} color={cat.color} />
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}

function PanelCarretaMariscos() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [modalReemplazoAbierto, setModalReemplazoAbierto] = useState(false);
  const [totalExistentesReemplazo, setTotalExistentesReemplazo] = useState(0);
  const [filtro, setFiltro] = useState('');
  const [filtroDebounced] = useDebouncedValue(filtro.trim(), 300);
  const [mostrarSubirManual, setMostrarSubirManual] = useState<boolean | null>(null);
  const [vistaActiva, setVistaActiva] = useState<SeccionPosClave | null>(null);

  const guardarCatalogo = useGuardarCatalogoProductosCarretaMariscos();
  const catalogo = useCatalogoProductosCarretaMariscos();

  const hayCatalogo = (catalogo.data?.total ?? 0) > 0;
  const mostrarSubir = mostrarSubirManual ?? !hayCatalogo;

  const executeGuardarCatalogo = (confirmarReemplazo = false) => {
    if (!archivo) return;

    guardarCatalogo.mutate(
      { file: archivo, confirmarReemplazo },
      {
        onSuccess: (data) => {
          if ('requiere_confirmacion' in data) {
            setTotalExistentesReemplazo(data.total_existentes);
            setModalReemplazoAbierto(true);
            return;
          }
          setModalReemplazoAbierto(false);
          setArchivo(null);
          setMostrarSubirManual(false);
          notifications.show({
            title: 'Catálogo de La Carreta de Mariscos guardado',
            message: `${data.total} producto(s) guardado(s) en ${Object.keys(data.por_grupo).length} grupo(s).`,
            color: 'green',
            icon: <IconCheck size={16} />,
          });
        },
        onError: (err: any) => {
          notifications.show({
            title: 'Error al guardar el catálogo',
            message: err.response?.data?.detail || 'Ocurrió un error al procesar el archivo.',
            color: 'red',
            icon: <IconX size={16} />,
          });
        },
      },
    );
  };

  const productosFiltrados = useMemo(() => {
    const productos = catalogo.data?.productos ?? [];
    if (!filtroDebounced) return productos;
    const texto = filtroDebounced.toLowerCase();
    return productos.filter((p) => p.nombre_producto.toLowerCase().includes(texto));
  }, [catalogo.data?.productos, filtroDebounced]);

  return (
    <Stack gap="lg">
      {vistaActiva === null ? (
        <PanelMenuSeccionesPos color="cyan" onSeleccionar={setVistaActiva} />
      ) : (
        <Stack gap="lg">
          <Button
            variant="subtle"
            size="sm"
            leftSection={<IconArrowLeft size={16} />}
            onClick={() => setVistaActiva(null)}
            style={{ alignSelf: 'flex-start' }}
          >
            Volver a secciones
          </Button>

          {vistaActiva === 'catalogo' && (
            <Stack gap="lg">
              <Card withBorder radius="md" p={mostrarSubir ? 'lg' : 'sm'}>
                <Stack gap={mostrarSubir ? 'md' : 0}>
                  <UnstyledButton onClick={() => setMostrarSubirManual(!mostrarSubir)}>
                    <Group justify="space-between">
                      <Text fw={600} size={mostrarSubir ? 'md' : 'sm'}>
                        {mostrarSubir ? 'Subir catálogo' : 'Actualizar catálogo'}
                      </Text>
                      <ActionIcon variant="subtle" color="gray" size="sm">
                        {mostrarSubir ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                      </ActionIcon>
                    </Group>
                  </UnstyledButton>
                  <Collapse in={mostrarSubir}>
                    <Stack gap="md" pt="xs">
                      <ArchivoDropzone
                        titulo="Catálogo de productos — La Carreta de Mariscos"
                        descripcion="Excel de catálogo (columnas B, C, G, K, O, Q desde la fila 6) — mismo formato que el del restaurante."
                        file={archivo}
                        onDrop={setArchivo}
                        onRemove={() => setArchivo(null)}
                      />
                      {archivo && (
                        <Group justify="flex-end">
                          <Button onClick={() => executeGuardarCatalogo(false)} loading={guardarCatalogo.isPending}>
                            Guardar catálogo
                          </Button>
                        </Group>
                      )}
                    </Stack>
                  </Collapse>
                </Stack>
              </Card>

              <Card withBorder radius="md" p="lg">
                <Stack gap="md">
                  <Group justify="space-between">
                    <Title order={4}>Catálogo guardado</Title>
                    <Badge variant="light" color="cyan">
                      {catalogo.data?.total ?? 0} producto(s)
                    </Badge>
                  </Group>

                  <TextInput
                    placeholder="Buscar producto por nombre"
                    leftSection={<IconSearch size={16} />}
                    value={filtro}
                    onChange={(e) => setFiltro(e.currentTarget.value)}
                  />

                  {catalogo.isLoading && <Text size="sm" c="dimmed">Cargando...</Text>}

                  {!catalogo.isLoading && <PanelPorCategoriaCarretaMariscos productos={productosFiltrados} />}
                </Stack>
              </Card>
            </Stack>
          )}

          {vistaActiva === 'costeo' && <PanelCosteoCarretaMariscosTabs />}
          {vistaActiva === 'productos-vendidos' && <PanelProductosVendidosCarretaMariscos />}
          {vistaActiva === 'cortesia' && <PanelComparacionIvaCarretaMariscos />}
          {vistaActiva === 'analisis' && <PanelAnalisisVentasCarretaMariscos />}
        </Stack>
      )}

      <Modal
        opened={modalReemplazoAbierto}
        onClose={() => setModalReemplazoAbierto(false)}
        title={<Text fw={600} c="red">Confirmar reemplazo</Text>}
      >
        <Stack gap="md">
          <Text size="sm">
            Ya existen {totalExistentesReemplazo} producto(s) guardados en el catálogo de La Carreta de Mariscos. Si
            continúas, se reemplazarán todos por el contenido del archivo actual.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setModalReemplazoAbierto(false)}>
              Cancelar
            </Button>
            <Button color="red" loading={guardarCatalogo.isPending} onClick={() => executeGuardarCatalogo(true)}>
              Reemplazar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

// Segundo nivel de pestañas (Alimentos/Bebidas/Otros) — dentro de cada una
// vive PanelSubgrupos, operando solo sobre el subconjunto de productos de
// esa sección+categoría.
function PanelPorCategoria({ productos }: { productos: ProductoCatalogo[] }) {
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null);

  const productosPorCategoria = useMemo(() => agruparPor(productos, 'categoria_tipo'), [productos]);

  // El bucket "Otros" de categoría puede terminar siendo, dentro de
  // Comida-Cena, exclusivamente noches temáticas de la semana y/o días
  // especiales del año (su `tipo` de Excel no dice Alimento/Bebida) — en ese
  // caso se muestra con su propia identidad en vez del "Otros" genérico, que
  // ahí resultaría confuso.
  const categoriasConDatos = CATEGORIAS_TIPO.map((cat) => {
    const productosCat = productosPorCategoria.get(cat.clave) ?? [];
    if (productosCat.length === 0) return null;
    if (cat.clave === 'Otros' && productosCat.every((p) => p.dia_tematica || p.evento_especial)) {
      return { ...cat, etiqueta: 'Eventos Especiales', color: 'pink', icono: IconGift };
    }
    return cat;
  }).filter((cat): cat is (typeof CATEGORIAS_TIPO)[number] => cat !== null);

  const categoriaMostrada =
    categoriaActiva && categoriasConDatos.some((cat) => cat.clave === categoriaActiva)
      ? categoriaActiva
      : (categoriasConDatos[0]?.clave ?? null);

  if (categoriasConDatos.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Ningún producto coincide aquí.
      </Text>
    );
  }

  return (
    <Tabs value={categoriaMostrada} onChange={setCategoriaActiva} variant="pills" keepMounted={false}>
      <Tabs.List>
        {categoriasConDatos.map((cat) => (
          <Tabs.Tab
            key={cat.clave}
            value={cat.clave}
            color={cat.color}
            leftSection={<cat.icono size={16} />}
            rightSection={
              <Badge size="sm" variant="light" color={cat.clave === categoriaMostrada ? 'white' : cat.color}>
                {productosPorCategoria.get(cat.clave)?.length ?? 0}
              </Badge>
            }
          >
            {cat.etiqueta}
          </Tabs.Tab>
        ))}
      </Tabs.List>

      {categoriasConDatos.map((cat) => (
        <Tabs.Panel key={cat.clave} value={cat.clave} pt="md">
          <PanelSubgrupos productos={productosPorCategoria.get(cat.clave) ?? []} color={cat.color} />
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}

// ── Costeo de Recetas ────────────────────────────────────────────
// Arrancó como piloto solo para Desayuno; ahora es un panel genérico
// parametrizado por sección (ver PanelCosteoSeccion/SECCIONES_COSTEO más
// abajo) — agregar una sección nueva es una entrada en ese arreglo.

interface CosteoCalculado {
  pct_costo: number | null;
  pct_costo_desc5: number | null;
  precio_sugerido: number | null;
  pct_incremento_resultante: number | null;
  pct_costo_sugerido: number | null;
  pct_costo_sugerido_desc5: number | null;
  estado: 'OK' | 'REQ AJUSTE' | null;
  precio_sugerido_editado: boolean;
}

// Réplica exacta de `calcular_costeo` en services/costeo_recetas.py — usada
// solo para el simulador en vivo (mientras el usuario edita % incremento/
// IVA/descuento/objetivo antes de guardar). Una vez guardado, se vuelve a
// pedir el costeo real al backend. `precioSugeridoOverride`, si viene
// (producto con ajuste manual guardado), reemplaza el precio sugerido
// calculado — igual que en el backend, para que el simulador lo siga
// respetando mientras se editan los demás parámetros.
function calcularCosteoLocal(
  costo: number | null,
  precioVenta: number | null,
  pctIncremento: number,
  ivaFactor: number,
  descuentoPct: number,
  pctCostoObjetivo: number,
  precioSugeridoOverride?: number,
): CosteoCalculado {
  if (costo === null || precioVenta === null || precioVenta === 0) {
    return {
      pct_costo: null,
      pct_costo_desc5: null,
      precio_sugerido: null,
      pct_incremento_resultante: null,
      pct_costo_sugerido: null,
      pct_costo_sugerido_desc5: null,
      estado: null,
      precio_sugerido_editado: false,
    };
  }
  const descFactor = 1 - descuentoPct;
  const pctCosto = costo / (precioVenta / ivaFactor);
  const pctCostoDesc5 = costo / ((precioVenta * descFactor) / ivaFactor);
  const precioSugerido = precioSugeridoOverride ?? Math.round(precioVenta * (1 + pctIncremento));
  const pctIncrementoResultante = precioSugerido / precioVenta - 1;
  const pctCostoSugerido = costo / (precioSugerido / ivaFactor);
  const pctCostoSugeridoDesc5 = costo / ((precioSugerido * descFactor) / ivaFactor);
  return {
    pct_costo: pctCosto,
    pct_costo_desc5: pctCostoDesc5,
    precio_sugerido: precioSugerido,
    pct_incremento_resultante: pctIncrementoResultante,
    pct_costo_sugerido: pctCostoSugerido,
    pct_costo_sugerido_desc5: pctCostoSugeridoDesc5,
    estado: pctCosto <= pctCostoObjetivo ? 'OK' : 'REQ AJUSTE',
    precio_sugerido_editado: precioSugeridoOverride !== undefined,
  };
}

function formatoPct(valor: number | null): string {
  if (valor === null) return '—';
  return `${(valor * 100).toFixed(1)}%`;
}

// Mismo estilo de encabezado de tabla que ya usa `TablaProductos` (Catálogo)
// — mayúsculas compactas, letter-spacing, color dimmed — para que Costeo se
// vea igual, no una tabla distinta dentro de la misma página.
const ESTILO_ENCABEZADO_TABLA = {
  fontSize: 11,
  letterSpacing: 0.4,
  textTransform: 'uppercase' as const,
  color: 'var(--mantine-color-dimmed)',
};

interface PanelCosteoSeccionProps {
  seccionMenu: string;
  categoriaTipo?: string;
  color: string;
  etiqueta: string;
}

// Panel de Costeo para UNA sección (+ categoría opcional) — parametrizado
// para poder repetir exactamente el mismo panel (KPI, parámetros editables,
// resumen por grupo, cuadrícula de grupos, exportar a Excel) en cada
// sección que se vaya habilitando, sin duplicar código.
function PanelCosteoSeccion({ seccionMenu, categoriaTipo, color, etiqueta }: PanelCosteoSeccionProps) {
  const configQuery = useConfiguracionCosteo();
  const costeoQuery = useCosteoProductos({ seccionMenu, categoriaTipo });
  const actualizarConfig = useActualizarConfiguracionCosteo();
  const actualizarIncremento = useActualizarIncrementoGrupo();
  const actualizarPrecioSugerido = useActualizarPrecioSugerido();
  const eliminarPrecioSugerido = useEliminarPrecioSugerido();
  const exportarCosteo = useExportarCosteo();

  const executeExportarCosteo = () => {
    exportarCosteo.mutate(
      { seccionMenu, categoriaTipo },
      {
        onSuccess: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `Costeo_${etiqueta.replace(/\s+/g, '_')}.xlsx`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.URL.revokeObjectURL(url);
        },
        onError: (err: any) => {
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

  // `null` = campo no tocado todavía (se muestra/usa el valor del servidor).
  // Una vez tocado, el estado guarda literalmente lo que hay en el input —
  // incluido '' mientras está vacío a medio escribir — para no "regresarse
  // solo" al valor anterior apenas se borra (bug real: antes se usaba
  // `undefined` tanto para "no tocado" como resultado de un campo vacío, así
  // que borrar el campo disparaba el fallback al valor del servidor de
  // inmediato, antes de que el usuario alcanzara a escribir el nuevo).
  // Tipo `number | string` para que coincida exactamente con lo que emite
  // `NumberInput.onChange` (Mantine no distingue `''` en el tipo, solo en
  // tiempo de ejecución) — la validación de "¿es un número real?" se hace
  // con `typeof x === 'number'` en los puntos donde importa.
  const [ivaPctLocal, setIvaPctLocal] = useState<number | string | null>(null);
  const [descuentoPctLocal, setDescuentoPctLocal] = useState<number | string | null>(null);
  const [objetivoPctLocal, setObjetivoPctLocal] = useState<number | string | null>(null);
  const [cambiosIncremento, setCambiosIncremento] = useState<Record<string, number | string>>({});
  const [grupoActivoCosteo, setGrupoActivoCosteo] = useState<string | null>(null);
  const [precioSugeridoDraft, setPrecioSugeridoDraft] = useState<Record<string, number | string>>({});
  const [incrementoMasivo, setIncrementoMasivo] = useState<number | string>('');

  const configServer = configQuery.data?.configuracion;
  const ivaPctServer = configServer ? (configServer.iva_factor - 1) * 100 : undefined;
  const descuentoPctServer = configServer ? configServer.descuento_pct * 100 : undefined;
  const objetivoPctServer = configServer ? configServer.pct_costo_objetivo * 100 : undefined;

  // Lo que se muestra en cada input (puede ser '' mientras se está escribiendo).
  const ivaPctInput = ivaPctLocal !== null ? ivaPctLocal : (ivaPctServer ?? 16);
  const descuentoPctInput = descuentoPctLocal !== null ? descuentoPctLocal : (descuentoPctServer ?? 5);
  const objetivoPctInput = objetivoPctLocal !== null ? objetivoPctLocal : (objetivoPctServer ?? 28);

  // Valor "efectivo" para cálculos: siempre un número, cayendo al del
  // servidor solo si el input sigue vacío en este instante (nunca mientras
  // el usuario está a medio escribir un valor válido).
  const ivaPct = typeof ivaPctInput === 'number' ? ivaPctInput : (ivaPctServer ?? 16);
  const descuentoPct = typeof descuentoPctInput === 'number' ? descuentoPctInput : (descuentoPctServer ?? 5);
  const objetivoPct = typeof objetivoPctInput === 'number' ? objetivoPctInput : (objetivoPctServer ?? 28);

  const incrementoOriginalPct = (grupo: string): number => {
    const original = configQuery.data?.incrementos_por_grupo.find((i) => i.grupo === grupo);
    return original ? original.pct_incremento * 100 : 3;
  };
  const incrementoInputPct = (grupo: string): number | string => cambiosIncremento[grupo] ?? incrementoOriginalPct(grupo);
  const incrementoEfectivoPct = (grupo: string): number => {
    const v = incrementoInputPct(grupo);
    return typeof v === 'number' ? v : incrementoOriginalPct(grupo);
  };

  const hayCambiosSinGuardar =
    Object.keys(cambiosIncremento).length > 0 ||
    ivaPctLocal !== null ||
    descuentoPctLocal !== null ||
    objetivoPctLocal !== null;

  const descartarCambios = () => {
    setIvaPctLocal(null);
    setDescuentoPctLocal(null);
    setObjetivoPctLocal(null);
    setCambiosIncremento({});
    setIncrementoMasivo('');
  };

  // Suma `incrementoMasivo` puntos porcentuales al incremento ACTUAL en
  // pantalla de cada grupo (el borrador si ya fue editado a mano, si no el
  // valor guardado) — aditivo, no reemplaza: un grupo en 4% con +2% queda en
  // 6%. Solo actualiza `cambiosIncremento` (mismo estado de "cambio sin
  // guardar" que la edición manual por grupo); el guardado real sigue siendo
  // el botón "Guardar configuración" de siempre.
  const aplicarIncrementoATodos = () => {
    if (typeof incrementoMasivo !== 'number' || incrementoMasivo === 0) return;
    setCambiosIncremento((prev) => {
      const siguiente = { ...prev };
      for (const grupo of gruposOrdenados) {
        const actual = incrementoEfectivoPct(grupo);
        siguiente[grupo] = Math.round((actual + incrementoMasivo) * 100) / 100;
      }
      return siguiente;
    });
    setIncrementoMasivo('');
  };

  const guardarCambios = async () => {
    const cambiosConfig: Record<string, number> = {};
    if (typeof ivaPctLocal === 'number') cambiosConfig.iva_factor = 1 + ivaPctLocal / 100;
    if (typeof descuentoPctLocal === 'number') cambiosConfig.descuento_pct = descuentoPctLocal / 100;
    if (typeof objetivoPctLocal === 'number') cambiosConfig.pct_costo_objetivo = objetivoPctLocal / 100;

    try {
      if (Object.keys(cambiosConfig).length > 0) {
        await actualizarConfig.mutateAsync(cambiosConfig);
      }
      for (const [grupo, pct] of Object.entries(cambiosIncremento)) {
        if (typeof pct === 'number') {
          await actualizarIncremento.mutateAsync({ grupo, pctIncremento: pct / 100 });
        }
      }
      descartarCambios();
      notifications.show({
        title: 'Configuración guardada',
        message: 'El costeo se recalculó con los nuevos parámetros.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    } catch (err: any) {
      notifications.show({
        title: 'Error al guardar la configuración',
        message: err.response?.data?.detail || 'Ocurrió un error al guardar los cambios.',
        color: 'red',
        icon: <IconX size={16} />,
      });
    }
  };

  const guardarPrecioSugerido = async (nombreProducto: string) => {
    const draft = precioSugeridoDraft[nombreProducto];
    const limpiar = () =>
      setPrecioSugeridoDraft((prev) => {
        const copia = { ...prev };
        delete copia[nombreProducto];
        return copia;
      });

    if (typeof draft !== 'number') {
      // Vacío/ inválido al perder foco: se descarta el borrador y se vuelve
      // a mostrar el valor anterior (calculado o el override que ya había).
      limpiar();
      return;
    }
    try {
      await actualizarPrecioSugerido.mutateAsync({ nombreProducto, precioSugerido: draft });
      limpiar();
      notifications.show({
        title: 'Precio sugerido actualizado',
        message: `${nombreProducto}: ${formatoMoneda.format(draft)}`,
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    } catch (err: any) {
      notifications.show({
        title: 'Error al guardar el precio sugerido',
        message: err.response?.data?.detail || 'Ocurrió un error al guardar el ajuste.',
        color: 'red',
        icon: <IconX size={16} />,
      });
    }
  };

  const resetearPrecioSugerido = async (nombreProducto: string) => {
    try {
      await eliminarPrecioSugerido.mutateAsync(nombreProducto);
      notifications.show({
        title: 'Precio sugerido restablecido',
        message: `${nombreProducto} vuelve al precio calculado automáticamente.`,
        color: 'teal',
        icon: <IconCheck size={16} />,
      });
    } catch (err: any) {
      notifications.show({
        title: 'Error al restablecer',
        message: err.response?.data?.detail || 'Ocurrió un error.',
        color: 'red',
        icon: <IconX size={16} />,
      });
    }
  };

  const productos = costeoQuery.data?.productos ?? [];

  // Con cambios sin guardar, se recalcula todo en el cliente (simulador);
  // sin cambios, se usa tal cual lo que ya calculó el backend. Un producto
  // con ajuste manual de precio sugerido guardado sigue respetándose durante
  // la simulación (no se recalcula desde el % de incremento).
  const costeoPorProducto = new Map<number, CosteoCalculado>();
  if (hayCambiosSinGuardar) {
    const ivaFactor = 1 + ivaPct / 100;
    for (const p of productos) {
      const override = p.precio_sugerido_editado && p.precio_sugerido !== null ? p.precio_sugerido : undefined;
      costeoPorProducto.set(
        p.id,
        calcularCosteoLocal(
          p.costo,
          p.precio_venta,
          incrementoEfectivoPct(p.grupo) / 100,
          ivaFactor,
          descuentoPct / 100,
          objetivoPct / 100,
          override,
        ),
      );
    }
  } else {
    for (const p of productos) {
      costeoPorProducto.set(p.id, p);
    }
  }

  const pctCostoGlobal = (() => {
    if (!hayCambiosSinGuardar) return costeoQuery.data?.pct_costo_global ?? null;
    const validos = productos.filter((p) => p.costo !== null && p.precio_venta !== null);
    if (validos.length === 0) return null;
    const sumaCosto = validos.reduce((acc, p) => acc + (p.costo ?? 0), 0);
    const sumaPrecio = validos.reduce((acc, p) => acc + (p.precio_venta ?? 0), 0);
    if (sumaPrecio === 0) return null;
    return sumaCosto / (sumaPrecio / (1 + ivaPct / 100));
  })();

  // Mismo % de costo pero contra el PRECIO SUGERIDO (con el % de incremento
  // aplicado) en vez del precio de venta actual — para poder ver de un
  // vistazo el efecto del incremento a nivel global/por grupo, sin tener que
  // entrar al detalle de cada producto. Ponderado igual que pctCostoGlobal.
  const pctCostoSugeridoGlobal = (() => {
    const ivaFactor = 1 + ivaPct / 100;
    let sumaCosto = 0;
    let sumaPrecioSugerido = 0;
    for (const p of productos) {
      const c = costeoPorProducto.get(p.id);
      if (p.costo === null || !c || c.precio_sugerido === null) continue;
      sumaCosto += p.costo;
      sumaPrecioSugerido += c.precio_sugerido;
    }
    if (sumaPrecioSugerido === 0) return null;
    return sumaCosto / (sumaPrecioSugerido / ivaFactor);
  })();

  const productosPorGrupoCosteo = useMemo(() => {
    const mapa = new Map<string, ProductoCosteo[]>();
    for (const p of productos) {
      const lista = mapa.get(p.grupo) ?? [];
      lista.push(p);
      mapa.set(p.grupo, lista);
    }
    return mapa;
  }, [productos]);

  const gruposOrdenados = Array.from(productosPorGrupoCosteo.keys()).sort((a, b) => a.localeCompare(b));

  if (costeoQuery.isLoading || configQuery.isLoading) {
    return <Text size="sm" c="dimmed">Cargando...</Text>;
  }

  if (productos.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No hay productos de {etiqueta} guardados todavía. Sube el catálogo desde la pestaña "Catálogo".
      </Text>
    );
  }

  return (
    <Stack gap="lg">
      <Group gap="sm" align="stretch">
        <Card withBorder radius="md" p="md" style={{ flex: 1 }}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: 0.4 }}>
            % Costo global — {etiqueta}
          </Text>
          <Group gap="xs" align="baseline">
            <Text size="xl" fw={700}>
              {formatoPct(pctCostoGlobal)}
            </Text>
            {pctCostoGlobal !== null && (
              <Badge color={colorPorEstadoCosteo(pctCostoGlobal <= objetivoPct / 100)} variant="light">
                {pctCostoGlobal <= objetivoPct / 100 ? 'OK' : 'REQ AJUSTE'}
              </Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed">
            Ponderado: suma de costo / (suma de precio de venta / IVA), {productos.length} producto(s).
          </Text>
        </Card>
        <Card withBorder radius="md" p="md" style={{ flex: 1 }}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: 0.4 }}>
            % Costo sugerido global
          </Text>
          <Group gap="xs" align="baseline">
            <Text size="xl" fw={700}>
              {formatoPct(pctCostoSugeridoGlobal)}
            </Text>
            {pctCostoSugeridoGlobal !== null && (
              <Badge color={colorPorEstadoCosteo(pctCostoSugeridoGlobal <= objetivoPct / 100)} variant="light">
                {pctCostoSugeridoGlobal <= objetivoPct / 100 ? 'OK' : 'REQ AJUSTE'}
              </Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed">
            Mismo cálculo pero contra el precio sugerido (con el % de incremento aplicado).
          </Text>
        </Card>
        <Button
          variant="light"
          color={color}
          leftSection={<IconFileSpreadsheet size={18} />}
          onClick={executeExportarCosteo}
          loading={exportarCosteo.isPending}
        >
          Exportar a Excel
        </Button>
      </Group>

      <Accordion variant="separated" radius="md" multiple defaultValue={[]}>
        <Accordion.Item value="parametros">
          <Accordion.Control icon={<IconAdjustmentsHorizontal size={18} color={`var(--mantine-color-${color}-6)`} />}>
            <Group justify="space-between" pr="sm" wrap="wrap" gap="xs">
              <Text fw={600} size="sm">Parámetros de costeo</Text>
              {hayCambiosSinGuardar && (
                <Badge color="yellow" variant="light">
                  Cambios sin guardar
                </Badge>
              )}
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
        <Stack gap="lg">
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
            <NumberInput
              label="IVA (%)"
              value={ivaPctInput}
              onChange={(v) => setIvaPctLocal(v)}
              decimalScale={2}
              min={0}
            />
            <NumberInput
              label="% Descuento / promoción"
              value={descuentoPctInput}
              onChange={(v) => setDescuentoPctLocal(v)}
              decimalScale={2}
              min={0}
              max={100}
            />
            <NumberInput
              label="% Costo objetivo (OK / REQ AJUSTE)"
              value={objetivoPctInput}
              onChange={(v) => setObjetivoPctLocal(v)}
              decimalScale={2}
              min={0}
              max={100}
            />
          </SimpleGrid>

          <Divider label="Incremento por grupo" labelPosition="left" />

          <Group justify="space-between" align="flex-end" wrap="wrap" gap="md">
            <Group gap="sm" wrap="nowrap" align="flex-start">
              <ThemeIcon size={32} radius="xl" color={color} variant="light" style={{ flexShrink: 0 }}>
                <IconTrendingUp size={18} />
              </ThemeIcon>
              <div>
                <Text fw={600} size="sm">% Incremento sugerido por grupo</Text>
                <Text size="xs" c="dimmed">
                  Define cuánto sube el precio sugerido sobre el precio de venta actual, por grupo.
                </Text>
              </div>
            </Group>
            <Group gap="xs" align="flex-end" wrap="nowrap">
              <NumberInput
                label="Incrementar todos"
                description="Se suma a lo que ya tiene cada grupo"
                placeholder="ej. 2"
                size="sm"
                w={160}
                value={incrementoMasivo}
                onChange={setIncrementoMasivo}
                decimalScale={2}
                suffix="%"
              />
              <Button
                variant="light"
                color={color}
                size="sm"
                leftSection={<IconBolt size={16} />}
                onClick={aplicarIncrementoATodos}
                disabled={typeof incrementoMasivo !== 'number' || incrementoMasivo === 0}
              >
                Aplicar a todos
              </Button>
            </Group>
          </Group>

          <SimpleGrid cols={{ base: 2, xs: 3, sm: 4, md: 6 }} spacing="sm">
            {gruposOrdenados.map((grupo) => (
              <Card key={grupo} withBorder radius="md" p="xs">
                <Stack gap={6}>
                  <div style={{ width: 24, height: 4, borderRadius: 2, background: `var(--mantine-color-${color}-6)` }} />
                  <Text size="xs" fw={600} lineClamp={2} style={{ minHeight: '2.4em' }}>
                    {grupo}
                  </Text>
                  <NumberInput
                    size="xs"
                    value={incrementoInputPct(grupo)}
                    onChange={(v) => setCambiosIncremento((prev) => ({ ...prev, [grupo]: v }))}
                    decimalScale={2}
                    min={0}
                    suffix="%"
                  />
                </Stack>
              </Card>
            ))}
          </SimpleGrid>

          <Group justify="flex-end" gap="sm">
            {hayCambiosSinGuardar && (
              <Button variant="default" leftSection={<IconRefresh size={16} />} onClick={descartarCambios}>
                Descartar cambios
              </Button>
            )}
            <Button
              leftSection={<IconDeviceFloppy size={16} />}
              onClick={guardarCambios}
              disabled={!hayCambiosSinGuardar}
              loading={actualizarConfig.isPending || actualizarIncremento.isPending}
            >
              Guardar configuración
            </Button>
          </Group>
        </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="resumen">
          <Accordion.Control icon={<IconListDetails size={18} color={`var(--mantine-color-${color}-6)`} />}>
            <Group gap="xs">
              <Text fw={600} size="sm">Resumen por grupo</Text>
              <Badge size="sm" variant="light" color="gray">{gruposOrdenados.length} grupo(s)</Badge>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
          <Card withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
            <Table verticalSpacing="xs" horizontalSpacing="md">
              <Table.Thead
                style={{
                  background: 'var(--mantine-color-default-hover)',
                  borderBottom: '2px solid var(--mantine-color-default-border)',
                }}
              >
                <Table.Tr>
                  <Table.Th style={ESTILO_ENCABEZADO_TABLA}>Grupo</Table.Th>
                  <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>% Costo promedio</Table.Th>
                  <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>% Costo sugerido</Table.Th>
                  <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Estado</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {gruposOrdenados.map((grupo) => {
                  const productosGrupo = productosPorGrupoCosteo.get(grupo) ?? [];
                  const calculados = productosGrupo
                    .map((p) => costeoPorProducto.get(p.id)?.pct_costo)
                    .filter((v): v is number => v !== null && v !== undefined);
                  const promedio = calculados.length > 0 ? calculados.reduce((a, b) => a + b, 0) / calculados.length : null;
                  const calculadosSugerido = productosGrupo
                    .map((p) => costeoPorProducto.get(p.id)?.pct_costo_sugerido)
                    .filter((v): v is number => v !== null && v !== undefined);
                  const promedioSugerido =
                    calculadosSugerido.length > 0
                      ? calculadosSugerido.reduce((a, b) => a + b, 0) / calculadosSugerido.length
                      : null;
                  const estado = promedio !== null ? (promedio <= objetivoPct / 100 ? 'OK' : 'REQ AJUSTE') : null;
                  return (
                    <Table.Tr key={grupo}>
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          {grupo}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatoPct(promedio)}
                      </Table.Td>
                      <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        <Text size="sm" c="dimmed">{formatoPct(promedioSugerido)}</Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        {estado && (
                          <Badge size="sm" variant="light" color={colorPorEstadoCosteo(estado === 'OK')}>
                            {estado}
                          </Badge>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Card>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      {grupoActivoCosteo && productosPorGrupoCosteo.has(grupoActivoCosteo) ? (
        <Stack gap="sm">
          <UnstyledButton onClick={() => setGrupoActivoCosteo(null)} style={{ alignSelf: 'flex-start' }}>
            <Group gap={6}>
              <IconArrowLeft size={16} />
              <Text size="sm" fw={500}>
                Volver a grupos
              </Text>
            </Group>
          </UnstyledButton>

          <Group gap="xs">
            <div style={{ width: 4, height: 16, borderRadius: 2, background: `var(--mantine-color-${color}-6)` }} />
            <Text fw={700} size="sm">
              {grupoActivoCosteo}
            </Text>
            <Badge size="sm" variant="light" color="gray">
              {productosPorGrupoCosteo.get(grupoActivoCosteo)?.length ?? 0}
            </Badge>
          </Group>

          <Card withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
            <Table.ScrollContainer minWidth={800}>
              <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
                <Table.Thead
                  style={{
                    background: 'var(--mantine-color-default-hover)',
                    borderBottom: '2px solid var(--mantine-color-default-border)',
                  }}
                >
                  <Table.Tr>
                    <Table.Th style={ESTILO_ENCABEZADO_TABLA}>Producto</Table.Th>
                    <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Costo</Table.Th>
                    <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Precio actual</Table.Th>
                    <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>% Costo</Table.Th>
                    <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Precio sugerido</Table.Th>
                    <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>% Costo sugerido</Table.Th>
                    <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Estado</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(productosPorGrupoCosteo.get(grupoActivoCosteo) ?? []).map((p) => {
                    const c = costeoPorProducto.get(p.id);
                    return (
                      <Table.Tr key={p.id}>
                        <Table.Td>
                          <Text size="sm" fw={500}>
                            {p.nombre_producto}
                          </Text>
                        </Table.Td>
                        <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {p.costo !== null ? formatoMoneda.format(p.costo) : '—'}
                        </Table.Td>
                        <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {p.precio_venta !== null ? formatoMoneda.format(p.precio_venta) : '—'}
                        </Table.Td>
                        <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatoPct(c?.pct_costo ?? null)}
                        </Table.Td>
                        <Table.Td ta="right">
                          {c?.precio_sugerido === null || c?.precio_sugerido === undefined ? (
                            <Text ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                              —
                            </Text>
                          ) : (
                            <Group gap={4} justify="flex-end" wrap="nowrap">
                              <NumberInput
                                value={precioSugeridoDraft[p.nombre_producto] ?? c.precio_sugerido}
                                onChange={(v) => setPrecioSugeridoDraft((prev) => ({ ...prev, [p.nombre_producto]: v }))}
                                onBlur={() => guardarPrecioSugerido(p.nombre_producto)}
                                decimalScale={2}
                                min={0}
                                size="xs"
                                w={100}
                                prefix="$"
                                styles={{ input: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' } }}
                              />
                              {c.precio_sugerido_editado && (
                                <ActionIcon
                                  size="sm"
                                  variant="subtle"
                                  color={color}
                                  title="Editado a mano — clic para volver al calculado por fórmula"
                                  onClick={() => resetearPrecioSugerido(p.nombre_producto)}
                                >
                                  <IconEdit size={14} />
                                </ActionIcon>
                              )}
                            </Group>
                          )}
                        </Table.Td>
                        <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatoPct(c?.pct_costo_sugerido ?? null)}
                        </Table.Td>
                        <Table.Td ta="right">
                          {c?.estado && (
                            <Badge size="sm" variant="light" color={colorPorEstadoCosteo(c.estado === 'OK')}>
                              {c.estado}
                            </Badge>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Card>
        </Stack>
      ) : (
        <SimpleGrid cols={{ base: 1, xs: 2, sm: 3, md: 4 }} spacing="sm">
          {gruposOrdenados.map((grupo) => {
            const productosGrupo = productosPorGrupoCosteo.get(grupo) ?? [];
            return (
              <Card
                key={grupo}
                withBorder
                radius="md"
                p="md"
                component="button"
                onClick={() => setGrupoActivoCosteo(grupo)}
                style={{ textAlign: 'left', cursor: 'pointer' }}
              >
                <Stack gap={6}>
                  <div style={{ width: 28, height: 4, borderRadius: 2, background: `var(--mantine-color-${color}-6)` }} />
                  <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <Text size="sm" fw={600} style={{ flex: 1 }}>
                      {grupo}
                    </Text>
                    <IconChevronRight size={16} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0, marginTop: 2 }} />
                  </Group>
                  <Badge size="sm" variant="light" color={color}>
                    {productosGrupo.length} producto{productosGrupo.length === 1 ? '' : 's'}
                  </Badge>
                </Stack>
              </Card>
            );
          })}
        </SimpleGrid>
      )}
    </Stack>
  );
}

const COLOR_COSTEO_CAFETERIA = 'teal';

// Costeo de Cafetería — calcado de PanelCosteoSeccion, pero sin
// seccionMenu/categoriaTipo (Cafetería es un solo catálogo plano, un solo
// panel) y usando los hooks/tipos/endpoints propios de Cafetería
// (configuración independiente de la del restaurante, ver
// models/costeo_config_cafeteria.py).
function PanelCosteoCafeteria() {
  const color = COLOR_COSTEO_CAFETERIA;
  const configQuery = useConfiguracionCosteoCafeteria();
  const costeoQuery = useCosteoProductosCafeteria();
  const actualizarConfig = useActualizarConfiguracionCosteoCafeteria();
  const actualizarIncremento = useActualizarIncrementoGrupoCafeteria();
  const actualizarPrecioSugerido = useActualizarPrecioSugeridoCafeteria();
  const eliminarPrecioSugerido = useEliminarPrecioSugeridoCafeteria();
  const exportarCosteo = useExportarCosteoCafeteria();

  const executeExportarCosteo = () => {
    exportarCosteo.mutate(undefined, {
      onSuccess: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'Costeo_Cafeteria.xlsx';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
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

  // Mismo patrón "null = no tocado" que PanelCosteoSeccion (ver comentario
  // extenso ahí) para evitar el bug de bounce-back al editar/borrar un input.
  const [ivaPctLocal, setIvaPctLocal] = useState<number | string | null>(null);
  const [descuentoPctLocal, setDescuentoPctLocal] = useState<number | string | null>(null);
  const [objetivoPctLocal, setObjetivoPctLocal] = useState<number | string | null>(null);
  const [cambiosIncremento, setCambiosIncremento] = useState<Record<string, number | string>>({});
  const [grupoActivoCosteo, setGrupoActivoCosteo] = useState<string | null>(null);
  const [precioSugeridoDraft, setPrecioSugeridoDraft] = useState<Record<string, number | string>>({});
  const [incrementoMasivo, setIncrementoMasivo] = useState<number | string>('');

  const configServer = configQuery.data?.configuracion;
  const ivaPctServer = configServer ? (configServer.iva_factor - 1) * 100 : undefined;
  const descuentoPctServer = configServer ? configServer.descuento_pct * 100 : undefined;
  const objetivoPctServer = configServer ? configServer.pct_costo_objetivo * 100 : undefined;

  const ivaPctInput = ivaPctLocal !== null ? ivaPctLocal : (ivaPctServer ?? 16);
  const descuentoPctInput = descuentoPctLocal !== null ? descuentoPctLocal : (descuentoPctServer ?? 5);
  const objetivoPctInput = objetivoPctLocal !== null ? objetivoPctLocal : (objetivoPctServer ?? 28);

  const ivaPct = typeof ivaPctInput === 'number' ? ivaPctInput : (ivaPctServer ?? 16);
  const descuentoPct = typeof descuentoPctInput === 'number' ? descuentoPctInput : (descuentoPctServer ?? 5);
  const objetivoPct = typeof objetivoPctInput === 'number' ? objetivoPctInput : (objetivoPctServer ?? 28);

  const incrementoOriginalPct = (grupo: string): number => {
    const original = configQuery.data?.incrementos_por_grupo.find((i) => i.grupo === grupo);
    return original ? original.pct_incremento * 100 : 3;
  };
  const incrementoInputPct = (grupo: string): number | string => cambiosIncremento[grupo] ?? incrementoOriginalPct(grupo);
  const incrementoEfectivoPct = (grupo: string): number => {
    const v = incrementoInputPct(grupo);
    return typeof v === 'number' ? v : incrementoOriginalPct(grupo);
  };

  const hayCambiosSinGuardar =
    Object.keys(cambiosIncremento).length > 0 ||
    ivaPctLocal !== null ||
    descuentoPctLocal !== null ||
    objetivoPctLocal !== null;

  const descartarCambios = () => {
    setIvaPctLocal(null);
    setDescuentoPctLocal(null);
    setObjetivoPctLocal(null);
    setCambiosIncremento({});
    setIncrementoMasivo('');
  };

  const aplicarIncrementoATodos = () => {
    if (typeof incrementoMasivo !== 'number' || incrementoMasivo === 0) return;
    setCambiosIncremento((prev) => {
      const siguiente = { ...prev };
      for (const grupo of gruposOrdenados) {
        const actual = incrementoEfectivoPct(grupo);
        siguiente[grupo] = Math.round((actual + incrementoMasivo) * 100) / 100;
      }
      return siguiente;
    });
    setIncrementoMasivo('');
  };

  const guardarCambios = async () => {
    const cambiosConfig: Record<string, number> = {};
    if (typeof ivaPctLocal === 'number') cambiosConfig.iva_factor = 1 + ivaPctLocal / 100;
    if (typeof descuentoPctLocal === 'number') cambiosConfig.descuento_pct = descuentoPctLocal / 100;
    if (typeof objetivoPctLocal === 'number') cambiosConfig.pct_costo_objetivo = objetivoPctLocal / 100;

    try {
      if (Object.keys(cambiosConfig).length > 0) {
        await actualizarConfig.mutateAsync(cambiosConfig);
      }
      for (const [grupo, pct] of Object.entries(cambiosIncremento)) {
        if (typeof pct === 'number') {
          await actualizarIncremento.mutateAsync({ grupo, pctIncremento: pct / 100 });
        }
      }
      descartarCambios();
      notifications.show({
        title: 'Configuración guardada',
        message: 'El costeo se recalculó con los nuevos parámetros.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    } catch (err: any) {
      notifications.show({
        title: 'Error al guardar la configuración',
        message: err.response?.data?.detail || 'Ocurrió un error al guardar los cambios.',
        color: 'red',
        icon: <IconX size={16} />,
      });
    }
  };

  const guardarPrecioSugerido = async (nombreProducto: string) => {
    const draft = precioSugeridoDraft[nombreProducto];
    const limpiar = () =>
      setPrecioSugeridoDraft((prev) => {
        const copia = { ...prev };
        delete copia[nombreProducto];
        return copia;
      });

    if (typeof draft !== 'number') {
      limpiar();
      return;
    }
    try {
      await actualizarPrecioSugerido.mutateAsync({ nombreProducto, precioSugerido: draft });
      limpiar();
      notifications.show({
        title: 'Precio sugerido actualizado',
        message: `${nombreProducto}: ${formatoMoneda.format(draft)}`,
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    } catch (err: any) {
      notifications.show({
        title: 'Error al guardar el precio sugerido',
        message: err.response?.data?.detail || 'Ocurrió un error al guardar el ajuste.',
        color: 'red',
        icon: <IconX size={16} />,
      });
    }
  };

  const resetearPrecioSugerido = async (nombreProducto: string) => {
    try {
      await eliminarPrecioSugerido.mutateAsync(nombreProducto);
      notifications.show({
        title: 'Precio sugerido restablecido',
        message: `${nombreProducto} vuelve al precio calculado automáticamente.`,
        color: 'teal',
        icon: <IconCheck size={16} />,
      });
    } catch (err: any) {
      notifications.show({
        title: 'Error al restablecer',
        message: err.response?.data?.detail || 'Ocurrió un error.',
        color: 'red',
        icon: <IconX size={16} />,
      });
    }
  };

  const productos = costeoQuery.data?.productos ?? [];

  const costeoPorProducto = new Map<number, CosteoCalculado>();
  if (hayCambiosSinGuardar) {
    const ivaFactor = 1 + ivaPct / 100;
    for (const p of productos) {
      const override = p.precio_sugerido_editado && p.precio_sugerido !== null ? p.precio_sugerido : undefined;
      costeoPorProducto.set(
        p.id,
        calcularCosteoLocal(
          p.costo,
          p.precio_venta,
          incrementoEfectivoPct(p.grupo) / 100,
          ivaFactor,
          descuentoPct / 100,
          objetivoPct / 100,
          override,
        ),
      );
    }
  } else {
    for (const p of productos) {
      costeoPorProducto.set(p.id, p);
    }
  }

  const pctCostoGlobal = (() => {
    if (!hayCambiosSinGuardar) return costeoQuery.data?.pct_costo_global ?? null;
    const validos = productos.filter((p) => p.costo !== null && p.precio_venta !== null);
    if (validos.length === 0) return null;
    const sumaCosto = validos.reduce((acc, p) => acc + (p.costo ?? 0), 0);
    const sumaPrecio = validos.reduce((acc, p) => acc + (p.precio_venta ?? 0), 0);
    if (sumaPrecio === 0) return null;
    return sumaCosto / (sumaPrecio / (1 + ivaPct / 100));
  })();

  const pctCostoSugeridoGlobal = (() => {
    const ivaFactor = 1 + ivaPct / 100;
    let sumaCosto = 0;
    let sumaPrecioSugerido = 0;
    for (const p of productos) {
      const c = costeoPorProducto.get(p.id);
      if (p.costo === null || !c || c.precio_sugerido === null) continue;
      sumaCosto += p.costo;
      sumaPrecioSugerido += c.precio_sugerido;
    }
    if (sumaPrecioSugerido === 0) return null;
    return sumaCosto / (sumaPrecioSugerido / ivaFactor);
  })();

  const productosPorGrupoCosteo = useMemo(() => {
    const mapa = new Map<string, ProductoCosteoCafeteria[]>();
    for (const p of productos) {
      const lista = mapa.get(p.grupo) ?? [];
      lista.push(p);
      mapa.set(p.grupo, lista);
    }
    return mapa;
  }, [productos]);

  const gruposOrdenados = Array.from(productosPorGrupoCosteo.keys()).sort((a, b) => a.localeCompare(b));

  if (costeoQuery.isLoading || configQuery.isLoading) {
    return <Text size="sm" c="dimmed">Cargando...</Text>;
  }

  if (productos.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No hay productos de Cafetería guardados todavía. Sube el catálogo desde la pestaña "Catálogo".
      </Text>
    );
  }

  return (
    <Stack gap="lg">
      <Group gap="sm" align="stretch">
        <Card withBorder radius="md" p="md" style={{ flex: 1 }}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: 0.4 }}>
            % Costo global — Cafetería
          </Text>
          <Group gap="xs" align="baseline">
            <Text size="xl" fw={700}>
              {formatoPct(pctCostoGlobal)}
            </Text>
            {pctCostoGlobal !== null && (
              <Badge color={colorPorEstadoCosteo(pctCostoGlobal <= objetivoPct / 100)} variant="light">
                {pctCostoGlobal <= objetivoPct / 100 ? 'OK' : 'REQ AJUSTE'}
              </Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed">
            Ponderado: suma de costo / (suma de precio de venta / IVA), {productos.length} producto(s).
          </Text>
        </Card>
        <Card withBorder radius="md" p="md" style={{ flex: 1 }}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: 0.4 }}>
            % Costo sugerido global
          </Text>
          <Group gap="xs" align="baseline">
            <Text size="xl" fw={700}>
              {formatoPct(pctCostoSugeridoGlobal)}
            </Text>
            {pctCostoSugeridoGlobal !== null && (
              <Badge color={colorPorEstadoCosteo(pctCostoSugeridoGlobal <= objetivoPct / 100)} variant="light">
                {pctCostoSugeridoGlobal <= objetivoPct / 100 ? 'OK' : 'REQ AJUSTE'}
              </Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed">
            Mismo cálculo pero contra el precio sugerido (con el % de incremento aplicado).
          </Text>
        </Card>
        <Button
          variant="light"
          color={color}
          leftSection={<IconFileSpreadsheet size={18} />}
          onClick={executeExportarCosteo}
          loading={exportarCosteo.isPending}
        >
          Exportar a Excel
        </Button>
      </Group>

      <Accordion variant="separated" radius="md" multiple defaultValue={[]}>
        <Accordion.Item value="parametros">
          <Accordion.Control icon={<IconAdjustmentsHorizontal size={18} color={`var(--mantine-color-${color}-6)`} />}>
            <Group justify="space-between" pr="sm" wrap="wrap" gap="xs">
              <Text fw={600} size="sm">Parámetros de costeo</Text>
              {hayCambiosSinGuardar && (
                <Badge color="yellow" variant="light">
                  Cambios sin guardar
                </Badge>
              )}
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
        <Stack gap="lg">
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
            <NumberInput
              label="IVA (%)"
              value={ivaPctInput}
              onChange={(v) => setIvaPctLocal(v)}
              decimalScale={2}
              min={0}
            />
            <NumberInput
              label="% Descuento / promoción"
              value={descuentoPctInput}
              onChange={(v) => setDescuentoPctLocal(v)}
              decimalScale={2}
              min={0}
              max={100}
            />
            <NumberInput
              label="% Costo objetivo (OK / REQ AJUSTE)"
              value={objetivoPctInput}
              onChange={(v) => setObjetivoPctLocal(v)}
              decimalScale={2}
              min={0}
              max={100}
            />
          </SimpleGrid>

          <Divider label="Incremento por grupo" labelPosition="left" />

          <Group justify="space-between" align="flex-end" wrap="wrap" gap="md">
            <Group gap="sm" wrap="nowrap" align="flex-start">
              <ThemeIcon size={32} radius="xl" color={color} variant="light" style={{ flexShrink: 0 }}>
                <IconTrendingUp size={18} />
              </ThemeIcon>
              <div>
                <Text fw={600} size="sm">% Incremento sugerido por grupo</Text>
                <Text size="xs" c="dimmed">
                  Define cuánto sube el precio sugerido sobre el precio de venta actual, por grupo.
                </Text>
              </div>
            </Group>
            <Group gap="xs" align="flex-end" wrap="nowrap">
              <NumberInput
                label="Incrementar todos"
                description="Se suma a lo que ya tiene cada grupo"
                placeholder="ej. 2"
                size="sm"
                w={160}
                value={incrementoMasivo}
                onChange={setIncrementoMasivo}
                decimalScale={2}
                suffix="%"
              />
              <Button
                variant="light"
                color={color}
                size="sm"
                leftSection={<IconBolt size={16} />}
                onClick={aplicarIncrementoATodos}
                disabled={typeof incrementoMasivo !== 'number' || incrementoMasivo === 0}
              >
                Aplicar a todos
              </Button>
            </Group>
          </Group>

          <SimpleGrid cols={{ base: 2, xs: 3, sm: 4, md: 6 }} spacing="sm">
            {gruposOrdenados.map((grupo) => (
              <Card key={grupo} withBorder radius="md" p="xs">
                <Stack gap={6}>
                  <div style={{ width: 24, height: 4, borderRadius: 2, background: `var(--mantine-color-${color}-6)` }} />
                  <Text size="xs" fw={600} lineClamp={2} style={{ minHeight: '2.4em' }}>
                    {grupo}
                  </Text>
                  <NumberInput
                    size="xs"
                    value={incrementoInputPct(grupo)}
                    onChange={(v) => setCambiosIncremento((prev) => ({ ...prev, [grupo]: v }))}
                    decimalScale={2}
                    min={0}
                    suffix="%"
                  />
                </Stack>
              </Card>
            ))}
          </SimpleGrid>

          <Group justify="flex-end" gap="sm">
            {hayCambiosSinGuardar && (
              <Button variant="default" leftSection={<IconRefresh size={16} />} onClick={descartarCambios}>
                Descartar cambios
              </Button>
            )}
            <Button
              leftSection={<IconDeviceFloppy size={16} />}
              onClick={guardarCambios}
              disabled={!hayCambiosSinGuardar}
              loading={actualizarConfig.isPending || actualizarIncremento.isPending}
            >
              Guardar configuración
            </Button>
          </Group>
        </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="resumen">
          <Accordion.Control icon={<IconListDetails size={18} color={`var(--mantine-color-${color}-6)`} />}>
            <Group gap="xs">
              <Text fw={600} size="sm">Resumen por grupo</Text>
              <Badge size="sm" variant="light" color="gray">{gruposOrdenados.length} grupo(s)</Badge>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
          <Card withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
            <Table verticalSpacing="xs" horizontalSpacing="md">
              <Table.Thead
                style={{
                  background: 'var(--mantine-color-default-hover)',
                  borderBottom: '2px solid var(--mantine-color-default-border)',
                }}
              >
                <Table.Tr>
                  <Table.Th style={ESTILO_ENCABEZADO_TABLA}>Grupo</Table.Th>
                  <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>% Costo promedio</Table.Th>
                  <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>% Costo sugerido</Table.Th>
                  <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Estado</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {gruposOrdenados.map((grupo) => {
                  const productosGrupo = productosPorGrupoCosteo.get(grupo) ?? [];
                  const calculados = productosGrupo
                    .map((p) => costeoPorProducto.get(p.id)?.pct_costo)
                    .filter((v): v is number => v !== null && v !== undefined);
                  const promedio = calculados.length > 0 ? calculados.reduce((a, b) => a + b, 0) / calculados.length : null;
                  const calculadosSugerido = productosGrupo
                    .map((p) => costeoPorProducto.get(p.id)?.pct_costo_sugerido)
                    .filter((v): v is number => v !== null && v !== undefined);
                  const promedioSugerido =
                    calculadosSugerido.length > 0
                      ? calculadosSugerido.reduce((a, b) => a + b, 0) / calculadosSugerido.length
                      : null;
                  const estado = promedio !== null ? (promedio <= objetivoPct / 100 ? 'OK' : 'REQ AJUSTE') : null;
                  return (
                    <Table.Tr key={grupo}>
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          {grupo}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatoPct(promedio)}
                      </Table.Td>
                      <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        <Text size="sm" c="dimmed">{formatoPct(promedioSugerido)}</Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        {estado && (
                          <Badge size="sm" variant="light" color={colorPorEstadoCosteo(estado === 'OK')}>
                            {estado}
                          </Badge>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Card>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      {grupoActivoCosteo && productosPorGrupoCosteo.has(grupoActivoCosteo) ? (
        <Stack gap="sm">
          <UnstyledButton onClick={() => setGrupoActivoCosteo(null)} style={{ alignSelf: 'flex-start' }}>
            <Group gap={6}>
              <IconArrowLeft size={16} />
              <Text size="sm" fw={500}>
                Volver a grupos
              </Text>
            </Group>
          </UnstyledButton>

          <Group gap="xs">
            <div style={{ width: 4, height: 16, borderRadius: 2, background: `var(--mantine-color-${color}-6)` }} />
            <Text fw={700} size="sm">
              {grupoActivoCosteo}
            </Text>
            <Badge size="sm" variant="light" color="gray">
              {productosPorGrupoCosteo.get(grupoActivoCosteo)?.length ?? 0}
            </Badge>
          </Group>

          <Card withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
            <Table.ScrollContainer minWidth={800}>
              <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
                <Table.Thead
                  style={{
                    background: 'var(--mantine-color-default-hover)',
                    borderBottom: '2px solid var(--mantine-color-default-border)',
                  }}
                >
                  <Table.Tr>
                    <Table.Th style={ESTILO_ENCABEZADO_TABLA}>Producto</Table.Th>
                    <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Costo</Table.Th>
                    <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Precio actual</Table.Th>
                    <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>% Costo</Table.Th>
                    <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Precio sugerido</Table.Th>
                    <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>% Costo sugerido</Table.Th>
                    <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Estado</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(productosPorGrupoCosteo.get(grupoActivoCosteo) ?? []).map((p) => {
                    const c = costeoPorProducto.get(p.id);
                    return (
                      <Table.Tr key={p.id}>
                        <Table.Td>
                          <Text size="sm" fw={500}>
                            {p.nombre_producto}
                          </Text>
                        </Table.Td>
                        <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {p.costo !== null ? formatoMoneda.format(p.costo) : '—'}
                        </Table.Td>
                        <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {p.precio_venta !== null ? formatoMoneda.format(p.precio_venta) : '—'}
                        </Table.Td>
                        <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatoPct(c?.pct_costo ?? null)}
                        </Table.Td>
                        <Table.Td ta="right">
                          {c?.precio_sugerido === null || c?.precio_sugerido === undefined ? (
                            <Text ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                              —
                            </Text>
                          ) : (
                            <Group gap={4} justify="flex-end" wrap="nowrap">
                              <NumberInput
                                value={precioSugeridoDraft[p.nombre_producto] ?? c.precio_sugerido}
                                onChange={(v) => setPrecioSugeridoDraft((prev) => ({ ...prev, [p.nombre_producto]: v }))}
                                onBlur={() => guardarPrecioSugerido(p.nombre_producto)}
                                decimalScale={2}
                                min={0}
                                size="xs"
                                w={100}
                                prefix="$"
                                styles={{ input: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' } }}
                              />
                              {c.precio_sugerido_editado && (
                                <ActionIcon
                                  size="sm"
                                  variant="subtle"
                                  color={color}
                                  title="Editado a mano — clic para volver al calculado por fórmula"
                                  onClick={() => resetearPrecioSugerido(p.nombre_producto)}
                                >
                                  <IconEdit size={14} />
                                </ActionIcon>
                              )}
                            </Group>
                          )}
                        </Table.Td>
                        <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatoPct(c?.pct_costo_sugerido ?? null)}
                        </Table.Td>
                        <Table.Td ta="right">
                          {c?.estado && (
                            <Badge size="sm" variant="light" color={colorPorEstadoCosteo(c.estado === 'OK')}>
                              {c.estado}
                            </Badge>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Card>
        </Stack>
      ) : (
        <SimpleGrid cols={{ base: 1, xs: 2, sm: 3, md: 4 }} spacing="sm">
          {gruposOrdenados.map((grupo) => {
            const productosGrupo = productosPorGrupoCosteo.get(grupo) ?? [];
            return (
              <Card
                key={grupo}
                withBorder
                radius="md"
                p="md"
                component="button"
                onClick={() => setGrupoActivoCosteo(grupo)}
                style={{ textAlign: 'left', cursor: 'pointer' }}
              >
                <Stack gap={6}>
                  <div style={{ width: 28, height: 4, borderRadius: 2, background: `var(--mantine-color-${color}-6)` }} />
                  <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <Text size="sm" fw={600} style={{ flex: 1 }}>
                      {grupo}
                    </Text>
                    <IconChevronRight size={16} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0, marginTop: 2 }} />
                  </Group>
                  <Badge size="sm" variant="light" color={color}>
                    {productosGrupo.length} producto{productosGrupo.length === 1 ? '' : 's'}
                  </Badge>
                </Stack>
              </Card>
            );
          })}
        </SimpleGrid>
      )}
    </Stack>
  );
}

interface PanelCosteoCarretaMariscosProps {
  categoriaTipo: string;
  color: string;
  etiqueta: string;
}

// Costeo de La Carreta de Mariscos — calcado de PanelCosteoSeccion
// (restaurante), parametrizado por categoría (Alimentos/Bebidas/Otros) para
// repetir el mismo panel completo en cada pestaña sin duplicar código.
// Configuración independiente — ver models/costeo_config_carreta_mariscos.py.
function PanelCosteoCarretaMariscos({ categoriaTipo, color, etiqueta }: PanelCosteoCarretaMariscosProps) {
  const configQuery = useConfiguracionCosteoCarretaMariscos();
  const costeoQuery = useCosteoProductosCarretaMariscos({ categoriaTipo });
  const actualizarConfig = useActualizarConfiguracionCosteoCarretaMariscos();
  const actualizarIncremento = useActualizarIncrementoGrupoCarretaMariscos();
  const actualizarPrecioSugerido = useActualizarPrecioSugeridoCarretaMariscos();
  const eliminarPrecioSugerido = useEliminarPrecioSugeridoCarretaMariscos();
  const exportarCosteo = useExportarCosteoCarretaMariscos();

  const executeExportarCosteo = () => {
    exportarCosteo.mutate(categoriaTipo, {
      onSuccess: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Costeo_Carreta_Mariscos_${etiqueta.replace(/\s+/g, '_')}.xlsx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
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

  // Mismo patrón "null = no tocado" que PanelCosteoSeccion (ver comentario
  // extenso ahí) para evitar el bug de bounce-back al editar/borrar un input.
  const [ivaPctLocal, setIvaPctLocal] = useState<number | string | null>(null);
  const [descuentoPctLocal, setDescuentoPctLocal] = useState<number | string | null>(null);
  const [objetivoPctLocal, setObjetivoPctLocal] = useState<number | string | null>(null);
  const [cambiosIncremento, setCambiosIncremento] = useState<Record<string, number | string>>({});
  const [grupoActivoCosteo, setGrupoActivoCosteo] = useState<string | null>(null);
  const [precioSugeridoDraft, setPrecioSugeridoDraft] = useState<Record<string, number | string>>({});
  const [incrementoMasivo, setIncrementoMasivo] = useState<number | string>('');

  const configServer = configQuery.data?.configuracion;
  const ivaPctServer = configServer ? (configServer.iva_factor - 1) * 100 : undefined;
  const descuentoPctServer = configServer ? configServer.descuento_pct * 100 : undefined;
  const objetivoPctServer = configServer ? configServer.pct_costo_objetivo * 100 : undefined;

  const ivaPctInput = ivaPctLocal !== null ? ivaPctLocal : (ivaPctServer ?? 16);
  const descuentoPctInput = descuentoPctLocal !== null ? descuentoPctLocal : (descuentoPctServer ?? 5);
  const objetivoPctInput = objetivoPctLocal !== null ? objetivoPctLocal : (objetivoPctServer ?? 28);

  const ivaPct = typeof ivaPctInput === 'number' ? ivaPctInput : (ivaPctServer ?? 16);
  const descuentoPct = typeof descuentoPctInput === 'number' ? descuentoPctInput : (descuentoPctServer ?? 5);
  const objetivoPct = typeof objetivoPctInput === 'number' ? objetivoPctInput : (objetivoPctServer ?? 28);

  const incrementoOriginalPct = (grupo: string): number => {
    const original = configQuery.data?.incrementos_por_grupo.find((i) => i.grupo === grupo);
    return original ? original.pct_incremento * 100 : 3;
  };
  const incrementoInputPct = (grupo: string): number | string => cambiosIncremento[grupo] ?? incrementoOriginalPct(grupo);
  const incrementoEfectivoPct = (grupo: string): number => {
    const v = incrementoInputPct(grupo);
    return typeof v === 'number' ? v : incrementoOriginalPct(grupo);
  };

  const hayCambiosSinGuardar =
    Object.keys(cambiosIncremento).length > 0 ||
    ivaPctLocal !== null ||
    descuentoPctLocal !== null ||
    objetivoPctLocal !== null;

  const descartarCambios = () => {
    setIvaPctLocal(null);
    setDescuentoPctLocal(null);
    setObjetivoPctLocal(null);
    setCambiosIncremento({});
    setIncrementoMasivo('');
  };

  const aplicarIncrementoATodos = () => {
    if (typeof incrementoMasivo !== 'number' || incrementoMasivo === 0) return;
    setCambiosIncremento((prev) => {
      const siguiente = { ...prev };
      for (const grupo of gruposOrdenados) {
        const actual = incrementoEfectivoPct(grupo);
        siguiente[grupo] = Math.round((actual + incrementoMasivo) * 100) / 100;
      }
      return siguiente;
    });
    setIncrementoMasivo('');
  };

  const guardarCambios = async () => {
    const cambiosConfig: Record<string, number> = {};
    if (typeof ivaPctLocal === 'number') cambiosConfig.iva_factor = 1 + ivaPctLocal / 100;
    if (typeof descuentoPctLocal === 'number') cambiosConfig.descuento_pct = descuentoPctLocal / 100;
    if (typeof objetivoPctLocal === 'number') cambiosConfig.pct_costo_objetivo = objetivoPctLocal / 100;

    try {
      if (Object.keys(cambiosConfig).length > 0) {
        await actualizarConfig.mutateAsync(cambiosConfig);
      }
      for (const [grupo, pct] of Object.entries(cambiosIncremento)) {
        if (typeof pct === 'number') {
          await actualizarIncremento.mutateAsync({ grupo, pctIncremento: pct / 100 });
        }
      }
      descartarCambios();
      notifications.show({
        title: 'Configuración guardada',
        message: 'El costeo se recalculó con los nuevos parámetros.',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    } catch (err: any) {
      notifications.show({
        title: 'Error al guardar la configuración',
        message: err.response?.data?.detail || 'Ocurrió un error al guardar los cambios.',
        color: 'red',
        icon: <IconX size={16} />,
      });
    }
  };

  const guardarPrecioSugerido = async (nombreProducto: string) => {
    const draft = precioSugeridoDraft[nombreProducto];
    const limpiar = () =>
      setPrecioSugeridoDraft((prev) => {
        const copia = { ...prev };
        delete copia[nombreProducto];
        return copia;
      });

    if (typeof draft !== 'number') {
      limpiar();
      return;
    }
    try {
      await actualizarPrecioSugerido.mutateAsync({ nombreProducto, precioSugerido: draft });
      limpiar();
      notifications.show({
        title: 'Precio sugerido actualizado',
        message: `${nombreProducto}: ${formatoMoneda.format(draft)}`,
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    } catch (err: any) {
      notifications.show({
        title: 'Error al guardar el precio sugerido',
        message: err.response?.data?.detail || 'Ocurrió un error al guardar el ajuste.',
        color: 'red',
        icon: <IconX size={16} />,
      });
    }
  };

  const resetearPrecioSugerido = async (nombreProducto: string) => {
    try {
      await eliminarPrecioSugerido.mutateAsync(nombreProducto);
      notifications.show({
        title: 'Precio sugerido restablecido',
        message: `${nombreProducto} vuelve al precio calculado automáticamente.`,
        color: 'teal',
        icon: <IconCheck size={16} />,
      });
    } catch (err: any) {
      notifications.show({
        title: 'Error al restablecer',
        message: err.response?.data?.detail || 'Ocurrió un error.',
        color: 'red',
        icon: <IconX size={16} />,
      });
    }
  };

  const productos = costeoQuery.data?.productos ?? [];

  const costeoPorProducto = new Map<number, CosteoCalculado>();
  if (hayCambiosSinGuardar) {
    const ivaFactor = 1 + ivaPct / 100;
    for (const p of productos) {
      const override = p.precio_sugerido_editado && p.precio_sugerido !== null ? p.precio_sugerido : undefined;
      costeoPorProducto.set(
        p.id,
        calcularCosteoLocal(
          p.costo,
          p.precio_venta,
          incrementoEfectivoPct(p.grupo) / 100,
          ivaFactor,
          descuentoPct / 100,
          objetivoPct / 100,
          override,
        ),
      );
    }
  } else {
    for (const p of productos) {
      costeoPorProducto.set(p.id, p);
    }
  }

  const pctCostoGlobal = (() => {
    if (!hayCambiosSinGuardar) return costeoQuery.data?.pct_costo_global ?? null;
    const validos = productos.filter((p) => p.costo !== null && p.precio_venta !== null);
    if (validos.length === 0) return null;
    const sumaCosto = validos.reduce((acc, p) => acc + (p.costo ?? 0), 0);
    const sumaPrecio = validos.reduce((acc, p) => acc + (p.precio_venta ?? 0), 0);
    if (sumaPrecio === 0) return null;
    return sumaCosto / (sumaPrecio / (1 + ivaPct / 100));
  })();

  const pctCostoSugeridoGlobal = (() => {
    const ivaFactor = 1 + ivaPct / 100;
    let sumaCosto = 0;
    let sumaPrecioSugerido = 0;
    for (const p of productos) {
      const c = costeoPorProducto.get(p.id);
      if (p.costo === null || !c || c.precio_sugerido === null) continue;
      sumaCosto += p.costo;
      sumaPrecioSugerido += c.precio_sugerido;
    }
    if (sumaPrecioSugerido === 0) return null;
    return sumaCosto / (sumaPrecioSugerido / ivaFactor);
  })();

  const productosPorGrupoCosteo = useMemo(() => {
    const mapa = new Map<string, ProductoCosteoCarretaMariscos[]>();
    for (const p of productos) {
      const lista = mapa.get(p.grupo) ?? [];
      lista.push(p);
      mapa.set(p.grupo, lista);
    }
    return mapa;
  }, [productos]);

  const gruposOrdenados = Array.from(productosPorGrupoCosteo.keys()).sort((a, b) => a.localeCompare(b));

  if (costeoQuery.isLoading || configQuery.isLoading) {
    return <Text size="sm" c="dimmed">Cargando...</Text>;
  }

  if (productos.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No hay productos de {etiqueta} en La Carreta de Mariscos guardados todavía. Sube el catálogo desde la pestaña "Catálogo".
      </Text>
    );
  }

  return (
    <Stack gap="lg">
      <Group gap="sm" align="stretch">
        <Card withBorder radius="md" p="md" style={{ flex: 1 }}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: 0.4 }}>
            % Costo global — {etiqueta}
          </Text>
          <Group gap="xs" align="baseline">
            <Text size="xl" fw={700}>
              {formatoPct(pctCostoGlobal)}
            </Text>
            {pctCostoGlobal !== null && (
              <Badge color={colorPorEstadoCosteo(pctCostoGlobal <= objetivoPct / 100)} variant="light">
                {pctCostoGlobal <= objetivoPct / 100 ? 'OK' : 'REQ AJUSTE'}
              </Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed">
            Ponderado: suma de costo / (suma de precio de venta / IVA), {productos.length} producto(s).
          </Text>
        </Card>
        <Card withBorder radius="md" p="md" style={{ flex: 1 }}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: 0.4 }}>
            % Costo sugerido global
          </Text>
          <Group gap="xs" align="baseline">
            <Text size="xl" fw={700}>
              {formatoPct(pctCostoSugeridoGlobal)}
            </Text>
            {pctCostoSugeridoGlobal !== null && (
              <Badge color={colorPorEstadoCosteo(pctCostoSugeridoGlobal <= objetivoPct / 100)} variant="light">
                {pctCostoSugeridoGlobal <= objetivoPct / 100 ? 'OK' : 'REQ AJUSTE'}
              </Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed">
            Mismo cálculo pero contra el precio sugerido (con el % de incremento aplicado).
          </Text>
        </Card>
        <Button
          variant="light"
          color={color}
          leftSection={<IconFileSpreadsheet size={18} />}
          onClick={executeExportarCosteo}
          loading={exportarCosteo.isPending}
        >
          Exportar a Excel
        </Button>
      </Group>

      <Accordion variant="separated" radius="md" multiple defaultValue={[]}>
        <Accordion.Item value="parametros">
          <Accordion.Control icon={<IconAdjustmentsHorizontal size={18} color={`var(--mantine-color-${color}-6)`} />}>
            <Group justify="space-between" pr="sm" wrap="wrap" gap="xs">
              <Text fw={600} size="sm">Parámetros de costeo</Text>
              {hayCambiosSinGuardar && (
                <Badge color="yellow" variant="light">
                  Cambios sin guardar
                </Badge>
              )}
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
        <Stack gap="lg">
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
            <NumberInput
              label="IVA (%)"
              value={ivaPctInput}
              onChange={(v) => setIvaPctLocal(v)}
              decimalScale={2}
              min={0}
            />
            <NumberInput
              label="% Descuento / promoción"
              value={descuentoPctInput}
              onChange={(v) => setDescuentoPctLocal(v)}
              decimalScale={2}
              min={0}
              max={100}
            />
            <NumberInput
              label="% Costo objetivo (OK / REQ AJUSTE)"
              value={objetivoPctInput}
              onChange={(v) => setObjetivoPctLocal(v)}
              decimalScale={2}
              min={0}
              max={100}
            />
          </SimpleGrid>

          <Divider label="Incremento por grupo" labelPosition="left" />

          <Group justify="space-between" align="flex-end" wrap="wrap" gap="md">
            <Group gap="sm" wrap="nowrap" align="flex-start">
              <ThemeIcon size={32} radius="xl" color={color} variant="light" style={{ flexShrink: 0 }}>
                <IconTrendingUp size={18} />
              </ThemeIcon>
              <div>
                <Text fw={600} size="sm">% Incremento sugerido por grupo</Text>
                <Text size="xs" c="dimmed">
                  Define cuánto sube el precio sugerido sobre el precio de venta actual, por grupo.
                </Text>
              </div>
            </Group>
            <Group gap="xs" align="flex-end" wrap="nowrap">
              <NumberInput
                label="Incrementar todos"
                description="Se suma a lo que ya tiene cada grupo"
                placeholder="ej. 2"
                size="sm"
                w={160}
                value={incrementoMasivo}
                onChange={setIncrementoMasivo}
                decimalScale={2}
                suffix="%"
              />
              <Button
                variant="light"
                color={color}
                size="sm"
                leftSection={<IconBolt size={16} />}
                onClick={aplicarIncrementoATodos}
                disabled={typeof incrementoMasivo !== 'number' || incrementoMasivo === 0}
              >
                Aplicar a todos
              </Button>
            </Group>
          </Group>

          <SimpleGrid cols={{ base: 2, xs: 3, sm: 4, md: 6 }} spacing="sm">
            {gruposOrdenados.map((grupo) => (
              <Card key={grupo} withBorder radius="md" p="xs">
                <Stack gap={6}>
                  <div style={{ width: 24, height: 4, borderRadius: 2, background: `var(--mantine-color-${color}-6)` }} />
                  <Text size="xs" fw={600} lineClamp={2} style={{ minHeight: '2.4em' }}>
                    {grupo}
                  </Text>
                  <NumberInput
                    size="xs"
                    value={incrementoInputPct(grupo)}
                    onChange={(v) => setCambiosIncremento((prev) => ({ ...prev, [grupo]: v }))}
                    decimalScale={2}
                    min={0}
                    suffix="%"
                  />
                </Stack>
              </Card>
            ))}
          </SimpleGrid>

          <Group justify="flex-end" gap="sm">
            {hayCambiosSinGuardar && (
              <Button variant="default" leftSection={<IconRefresh size={16} />} onClick={descartarCambios}>
                Descartar cambios
              </Button>
            )}
            <Button
              leftSection={<IconDeviceFloppy size={16} />}
              onClick={guardarCambios}
              disabled={!hayCambiosSinGuardar}
              loading={actualizarConfig.isPending || actualizarIncremento.isPending}
            >
              Guardar configuración
            </Button>
          </Group>
        </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="resumen">
          <Accordion.Control icon={<IconListDetails size={18} color={`var(--mantine-color-${color}-6)`} />}>
            <Group gap="xs">
              <Text fw={600} size="sm">Resumen por grupo</Text>
              <Badge size="sm" variant="light" color="gray">{gruposOrdenados.length} grupo(s)</Badge>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
          <Card withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
            <Table verticalSpacing="xs" horizontalSpacing="md">
              <Table.Thead
                style={{
                  background: 'var(--mantine-color-default-hover)',
                  borderBottom: '2px solid var(--mantine-color-default-border)',
                }}
              >
                <Table.Tr>
                  <Table.Th style={ESTILO_ENCABEZADO_TABLA}>Grupo</Table.Th>
                  <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>% Costo promedio</Table.Th>
                  <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>% Costo sugerido</Table.Th>
                  <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Estado</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {gruposOrdenados.map((grupo) => {
                  const productosGrupo = productosPorGrupoCosteo.get(grupo) ?? [];
                  const calculados = productosGrupo
                    .map((p) => costeoPorProducto.get(p.id)?.pct_costo)
                    .filter((v): v is number => v !== null && v !== undefined);
                  const promedio = calculados.length > 0 ? calculados.reduce((a, b) => a + b, 0) / calculados.length : null;
                  const calculadosSugerido = productosGrupo
                    .map((p) => costeoPorProducto.get(p.id)?.pct_costo_sugerido)
                    .filter((v): v is number => v !== null && v !== undefined);
                  const promedioSugerido =
                    calculadosSugerido.length > 0
                      ? calculadosSugerido.reduce((a, b) => a + b, 0) / calculadosSugerido.length
                      : null;
                  const estado = promedio !== null ? (promedio <= objetivoPct / 100 ? 'OK' : 'REQ AJUSTE') : null;
                  return (
                    <Table.Tr key={grupo}>
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          {grupo}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatoPct(promedio)}
                      </Table.Td>
                      <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        <Text size="sm" c="dimmed">{formatoPct(promedioSugerido)}</Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        {estado && (
                          <Badge size="sm" variant="light" color={colorPorEstadoCosteo(estado === 'OK')}>
                            {estado}
                          </Badge>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Card>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      {grupoActivoCosteo && productosPorGrupoCosteo.has(grupoActivoCosteo) ? (
        <Stack gap="sm">
          <UnstyledButton onClick={() => setGrupoActivoCosteo(null)} style={{ alignSelf: 'flex-start' }}>
            <Group gap={6}>
              <IconArrowLeft size={16} />
              <Text size="sm" fw={500}>
                Volver a grupos
              </Text>
            </Group>
          </UnstyledButton>

          <Group gap="xs">
            <div style={{ width: 4, height: 16, borderRadius: 2, background: `var(--mantine-color-${color}-6)` }} />
            <Text fw={700} size="sm">
              {grupoActivoCosteo}
            </Text>
            <Badge size="sm" variant="light" color="gray">
              {productosPorGrupoCosteo.get(grupoActivoCosteo)?.length ?? 0}
            </Badge>
          </Group>

          <Card withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
            <Table.ScrollContainer minWidth={800}>
              <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
                <Table.Thead
                  style={{
                    background: 'var(--mantine-color-default-hover)',
                    borderBottom: '2px solid var(--mantine-color-default-border)',
                  }}
                >
                  <Table.Tr>
                    <Table.Th style={ESTILO_ENCABEZADO_TABLA}>Producto</Table.Th>
                    <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Costo</Table.Th>
                    <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Precio actual</Table.Th>
                    <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>% Costo</Table.Th>
                    <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Precio sugerido</Table.Th>
                    <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>% Costo sugerido</Table.Th>
                    <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Estado</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(productosPorGrupoCosteo.get(grupoActivoCosteo) ?? []).map((p) => {
                    const c = costeoPorProducto.get(p.id);
                    return (
                      <Table.Tr key={p.id}>
                        <Table.Td>
                          <Text size="sm" fw={500}>
                            {p.nombre_producto}
                          </Text>
                        </Table.Td>
                        <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {p.costo !== null ? formatoMoneda.format(p.costo) : '—'}
                        </Table.Td>
                        <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {p.precio_venta !== null ? formatoMoneda.format(p.precio_venta) : '—'}
                        </Table.Td>
                        <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatoPct(c?.pct_costo ?? null)}
                        </Table.Td>
                        <Table.Td ta="right">
                          {c?.precio_sugerido === null || c?.precio_sugerido === undefined ? (
                            <Text ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                              —
                            </Text>
                          ) : (
                            <Group gap={4} justify="flex-end" wrap="nowrap">
                              <NumberInput
                                value={precioSugeridoDraft[p.nombre_producto] ?? c.precio_sugerido}
                                onChange={(v) => setPrecioSugeridoDraft((prev) => ({ ...prev, [p.nombre_producto]: v }))}
                                onBlur={() => guardarPrecioSugerido(p.nombre_producto)}
                                decimalScale={2}
                                min={0}
                                size="xs"
                                w={100}
                                prefix="$"
                                styles={{ input: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' } }}
                              />
                              {c.precio_sugerido_editado && (
                                <ActionIcon
                                  size="sm"
                                  variant="subtle"
                                  color={color}
                                  title="Editado a mano — clic para volver al calculado por fórmula"
                                  onClick={() => resetearPrecioSugerido(p.nombre_producto)}
                                >
                                  <IconEdit size={14} />
                                </ActionIcon>
                              )}
                            </Group>
                          )}
                        </Table.Td>
                        <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatoPct(c?.pct_costo_sugerido ?? null)}
                        </Table.Td>
                        <Table.Td ta="right">
                          {c?.estado && (
                            <Badge size="sm" variant="light" color={colorPorEstadoCosteo(c.estado === 'OK')}>
                              {c.estado}
                            </Badge>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Card>
        </Stack>
      ) : (
        <SimpleGrid cols={{ base: 1, xs: 2, sm: 3, md: 4 }} spacing="sm">
          {gruposOrdenados.map((grupo) => {
            const productosGrupo = productosPorGrupoCosteo.get(grupo) ?? [];
            return (
              <Card
                key={grupo}
                withBorder
                radius="md"
                p="md"
                component="button"
                onClick={() => setGrupoActivoCosteo(grupo)}
                style={{ textAlign: 'left', cursor: 'pointer' }}
              >
                <Stack gap={6}>
                  <div style={{ width: 28, height: 4, borderRadius: 2, background: `var(--mantine-color-${color}-6)` }} />
                  <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <Text size="sm" fw={600} style={{ flex: 1 }}>
                      {grupo}
                    </Text>
                    <IconChevronRight size={16} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0, marginTop: 2 }} />
                  </Group>
                  <Badge size="sm" variant="light" color={color}>
                    {productosGrupo.length} producto{productosGrupo.length === 1 ? '' : 's'}
                  </Badge>
                </Stack>
              </Card>
            );
          })}
        </SimpleGrid>
      )}
    </Stack>
  );
}

// Wrapper delgado: una pestaña por categoría (Alimentos/Bebidas/Otros),
// cada una con su propio PanelCosteoCarretaMariscos con estado aislado
// (keepMounted={false}, mismo criterio que PanelCosteoRecetas del
// restaurante). Reusa CATEGORIAS_TIPO para colores/íconos/orden.
function PanelCosteoCarretaMariscosTabs() {
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(CATEGORIAS_TIPO[0].clave);

  return (
    <Tabs value={categoriaActiva} onChange={setCategoriaActiva} variant="pills" keepMounted={false}>
      <Tabs.List>
        {CATEGORIAS_TIPO.map((cat) => (
          <Tabs.Tab key={cat.clave} value={cat.clave} color={cat.color} leftSection={<cat.icono size={16} />}>
            {cat.etiqueta}
          </Tabs.Tab>
        ))}
      </Tabs.List>

      {CATEGORIAS_TIPO.map((cat) => (
        <Tabs.Panel key={cat.clave} value={cat.clave} pt="lg">
          <PanelCosteoCarretaMariscos categoriaTipo={cat.clave} color={cat.color} etiqueta={cat.etiqueta} />
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}

// Secciones habilitadas en Costeo — cada una con su propio filtro opcional
// de `categoriaTipo`. `'EventosEspeciales'` es un valor reservado (no un
// categoria_tipo real) que el backend interpreta como "solo Noches
// Temáticas/Días Especiales de esta sección, categorías mezcladas" — ver
// EVENTOS_ESPECIALES_MARCADOR en costeo_recetas.py. El resto de Comida-Cena
// (categoriaTipo: 'Alimentos') ya los excluye automáticamente, así que no
// se duplican entre las dos pestañas. Extender a una sección nueva es
// agregar una entrada aquí, nada más.
const SECCIONES_COSTEO: { clave: string; seccionMenu: string; categoriaTipo?: string; color: string; etiqueta: string; icono: typeof IconApple }[] = [
  { clave: 'Desayuno', seccionMenu: 'Desayuno', color: 'orange', etiqueta: 'Desayuno', icono: IconSunrise },
  { clave: 'Comida-Cena', seccionMenu: 'Comida-Cena', categoriaTipo: 'Alimentos', color: 'red', etiqueta: 'Comida-Cena (Alimentos)', icono: IconChefHat },
  { clave: 'ComidaCenaEventos', seccionMenu: 'Comida-Cena', categoriaTipo: 'EventosEspeciales', color: 'pink', etiqueta: 'Eventos Especiales', icono: IconGift },
  { clave: 'Bar', seccionMenu: 'Bar', color: 'grape', etiqueta: 'Bar', icono: IconGlassCocktail },
  { clave: 'Extra', seccionMenu: 'Extra', color: 'violet', etiqueta: 'Extra', icono: IconStar },
  { clave: 'Otros', seccionMenu: 'Otros', color: 'gray', etiqueta: 'Otros', icono: IconCategory },
];

// Wrapper delgado: un nivel de pestañas por sección de Costeo habilitada,
// cada una renderizando su propio PanelCosteoSeccion con estado aislado
// (keepMounted={false} — al cambiar de pestaña se desmonta la anterior, así
// que los parámetros en edición de una sección nunca se mezclan con los de
// otra).
function PanelCosteoRecetas() {
  const [seccionActiva, setSeccionActiva] = useState<string | null>(SECCIONES_COSTEO[0].clave);
  const exportarTodo = useExportarCosteoCompleto();

  const executeExportarTodo = () => {
    exportarTodo.mutate(
      SECCIONES_COSTEO.map((sec) => ({ seccionMenu: sec.seccionMenu, categoriaTipo: sec.categoriaTipo })),
      {
        onSuccess: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'Costeo_Completo.xlsx';
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.URL.revokeObjectURL(url);
        },
        onError: (err: any) => {
          notifications.show({
            title: 'Error al exportar todo',
            message: err.response?.data?.detail || 'Ocurrió un error al generar el Excel.',
            color: 'red',
            icon: <IconX size={16} />,
          });
        },
      },
    );
  };

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <Button
          variant="filled"
          color="dark"
          leftSection={<IconFileSpreadsheet size={18} />}
          onClick={executeExportarTodo}
          loading={exportarTodo.isPending}
        >
          Exportar todo (todas las secciones)
        </Button>
      </Group>

      <Tabs value={seccionActiva} onChange={setSeccionActiva} variant="pills" keepMounted={false}>
        <Tabs.List>
          {SECCIONES_COSTEO.map((sec) => (
            <Tabs.Tab key={sec.clave} value={sec.clave} color={sec.color} leftSection={<sec.icono size={16} />}>
              {sec.etiqueta}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        {SECCIONES_COSTEO.map((sec) => (
          <Tabs.Panel key={sec.clave} value={sec.clave} pt="lg">
            <PanelCosteoSeccion
              seccionMenu={sec.seccionMenu}
              categoriaTipo={sec.categoriaTipo}
              color={sec.color}
              etiqueta={sec.etiqueta}
            />
          </Tabs.Panel>
        ))}
      </Tabs>
    </Stack>
  );
}

// Tabla de detalle de un grupo de Productos Vendidos — mismo estilo que
// TablaProductos (catálogo), con columnas propias del reporte de ventas y
// badges de clasificación heredada del catálogo + alerta de "no encontrado".
function TablaProductosVendidos({
  productos,
  ivaFactor,
  pctCostoObjetivo,
}: {
  productos: ProductoVendido[];
  ivaFactor: number;
  pctCostoObjetivo: number;
}) {
  const totalCosto = productos.reduce((acc, p) => acc + (p.total_costo ?? 0), 0);
  const totalDescuento = productos.reduce((acc, p) => acc + (p.descuento ?? 0), 0);
  const totalSubtotal = productos.reduce((acc, p) => acc + (p.subtotal ?? 0), 0);
  const totalImpuesto = productos.reduce((acc, p) => acc + (p.impuesto ?? 0), 0);
  const totalGeneral = productos.reduce((acc, p) => acc + (p.total ?? 0), 0);

  return (
    <Card withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
      <Table.ScrollContainer minWidth={860}>
        <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
          <Table.Thead
            style={{
              background: 'var(--mantine-color-default-hover)',
              borderBottom: '2px solid var(--mantine-color-default-border)',
            }}
          >
            <Table.Tr>
              {['Producto', 'Clasificación', '% Costo', 'Costo', 'Venta', 'Cant.', 'Tot. Costo', 'Descuento', 'Subtotal', 'Impuesto', 'TOTAL'].map(
                (encabezado, i) => (
                  <Table.Th
                    key={encabezado}
                    ta={i >= 2 ? 'right' : undefined}
                    style={{ fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--mantine-color-dimmed)' }}
                  >
                    {encabezado}
                  </Table.Th>
                ),
              )}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {productos.map((p) => (
              <Table.Tr key={p.id}>
                <Table.Td>
                  <Text size="sm" fw={500}>
                    {p.nombre_producto}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {p.producto_catalogo_encontrado ? (
                    <Group gap={4} wrap="nowrap">
                      {p.categoria_tipo && (
                        <Badge size="xs" variant="light" color="gray">
                          {p.categoria_tipo}
                        </Badge>
                      )}
                      {p.seccion_menu && (
                        <Badge size="xs" variant="light" color="gray">
                          {p.seccion_menu}
                        </Badge>
                      )}
                    </Group>
                  ) : (
                    <Badge size="xs" variant="light" color="red" leftSection={<IconAlertTriangle size={12} />}>
                      No encontrado en catálogo
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td ta="right">
                  {(() => {
                    const pct = pctCostoCatalogo(p.costo_catalogo, p.precio_venta_catalogo, ivaFactor);
                    return pct !== null ? (
                      <Badge size="sm" variant="light" color={colorPorEstadoCosteo(pct <= pctCostoObjetivo)} style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatoPct(pct)}
                      </Badge>
                    ) : (
                      <Text size="sm" c="dimmed" ta="right">—</Text>
                    );
                  })()}
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.costo !== null ? formatoMoneda.format(p.costo) : '—'}
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.precio_venta !== null ? formatoMoneda.format(p.precio_venta) : '—'}
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.cantidad !== null ? Math.round(p.cantidad) : '—'}
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.total_costo !== null ? formatoMoneda.format(p.total_costo) : '—'}
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.descuento !== null ? formatoMoneda.format(p.descuento) : '—'}
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.subtotal !== null ? formatoMoneda.format(p.subtotal) : '—'}
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.impuesto !== null ? formatoMoneda.format(p.impuesto) : '—'}
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }} fw={600}>
                  {p.total !== null ? formatoMoneda.format(p.total) : '—'}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
          <Table.Tfoot>
            <Table.Tr style={{ borderTop: '2px solid var(--mantine-color-grape-6)', background: 'var(--mantine-color-default-hover)' }}>
              <Table.Th colSpan={6}>TOTAL</Table.Th>
              <Table.Th ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatoMoneda.format(totalCosto)}
              </Table.Th>
              <Table.Th ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatoMoneda.format(totalDescuento)}
              </Table.Th>
              <Table.Th ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatoMoneda.format(totalSubtotal)}
              </Table.Th>
              <Table.Th ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatoMoneda.format(totalImpuesto)}
              </Table.Th>
              <Table.Th ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatoMoneda.format(totalGeneral)}
              </Table.Th>
            </Table.Tr>
          </Table.Tfoot>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );
}

function agruparProductosVendidosPor(productos: ProductoVendido[], campo: 'seccion_menu' | 'categoria_tipo'): Map<string, ProductoVendido[]> {
  const mapa = new Map<string, ProductoVendido[]>();
  for (const p of productos) {
    const clave = p[campo];
    if (!clave) continue;
    const lista = mapa.get(clave) ?? [];
    lista.push(p);
    mapa.set(clave, lista);
  }
  return mapa;
}

// Nivel 1 — mismo criterio que las pestañas de Sección de menú del Catálogo
// (líneas ~4040-4066): una pestaña por seccion_menu con datos ese periodo,
// más una pestaña extra "Sin clasificar" al final para los productos que no
// lograron match contra el catálogo (seccion_menu/categoria_tipo en null) —
// así siguen siendo visibles y revisables sin mezclarse con la estructura
// heredada del catálogo.
function PanelSeccionesProductosVendidos({
  productos,
  ivaFactor,
  pctCostoObjetivo,
}: {
  productos: ProductoVendido[];
  ivaFactor: number;
  pctCostoObjetivo: number;
}) {
  const [seccionActiva, setSeccionActiva] = useState<string | null>(null);

  const productosPorSeccion = useMemo(() => agruparProductosVendidosPor(productos, 'seccion_menu'), [productos]);
  const productosSinClasificar = useMemo(() => productos.filter((p) => !p.producto_catalogo_encontrado), [productos]);

  const seccionesConDatos = SECCIONES_MENU.filter((sec) => (productosPorSeccion.get(sec.clave)?.length ?? 0) > 0);

  const seccionMostrada =
    seccionActiva && (seccionesConDatos.some((sec) => sec.clave === seccionActiva) || seccionActiva === 'sin-clasificar')
      ? seccionActiva
      : (seccionesConDatos[0]?.clave ?? (productosSinClasificar.length > 0 ? 'sin-clasificar' : null));

  if (seccionesConDatos.length === 0 && productosSinClasificar.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No hay productos vendidos guardados para este periodo.
      </Text>
    );
  }

  return (
    <Tabs value={seccionMostrada} onChange={setSeccionActiva} variant="pills" color="dark" keepMounted={false}>
      <Tabs.List>
        {seccionesConDatos.map((sec) => (
          <Tabs.Tab
            key={sec.clave}
            value={sec.clave}
            color={sec.color}
            leftSection={<sec.icono size={16} />}
            rightSection={
              <Badge size="sm" variant="light" color={sec.clave === seccionMostrada ? 'white' : sec.color}>
                {productosPorSeccion.get(sec.clave)?.length ?? 0}
              </Badge>
            }
          >
            {sec.clave}
          </Tabs.Tab>
        ))}
        {productosSinClasificar.length > 0 && (
          <Tabs.Tab
            value="sin-clasificar"
            color="red"
            leftSection={<IconAlertTriangle size={16} />}
            rightSection={
              <Badge size="sm" variant="light" color={seccionMostrada === 'sin-clasificar' ? 'white' : 'red'}>
                {productosSinClasificar.length}
              </Badge>
            }
          >
            Sin clasificar
          </Tabs.Tab>
        )}
      </Tabs.List>

      {seccionesConDatos.map((sec) => (
        <Tabs.Panel key={sec.clave} value={sec.clave} pt="lg">
          <PanelCategoriaProductosVendidos
            productos={productosPorSeccion.get(sec.clave) ?? []}
            ivaFactor={ivaFactor}
            pctCostoObjetivo={pctCostoObjetivo}
          />
        </Tabs.Panel>
      ))}
      {productosSinClasificar.length > 0 && (
        <Tabs.Panel value="sin-clasificar" pt="lg">
          <PanelGruposProductosVendidos productos={productosSinClasificar} ivaFactor={ivaFactor} pctCostoObjetivo={pctCostoObjetivo} />
        </Tabs.Panel>
      )}
    </Tabs>
  );
}

// Nivel 2 — mismo criterio que PanelPorCategoria del catálogo: pestañas por
// categoria_tipo (Alimentos/Bebidas/Otros) dentro de la sección ya filtrada.
function PanelCategoriaProductosVendidos({
  productos,
  ivaFactor,
  pctCostoObjetivo,
}: {
  productos: ProductoVendido[];
  ivaFactor: number;
  pctCostoObjetivo: number;
}) {
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null);

  const productosPorCategoria = useMemo(() => agruparProductosVendidosPor(productos, 'categoria_tipo'), [productos]);

  const categoriasConDatos = CATEGORIAS_TIPO.filter((cat) => (productosPorCategoria.get(cat.clave)?.length ?? 0) > 0);

  const categoriaMostrada =
    categoriaActiva && categoriasConDatos.some((cat) => cat.clave === categoriaActiva)
      ? categoriaActiva
      : (categoriasConDatos[0]?.clave ?? null);

  if (categoriasConDatos.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Ningún producto coincide aquí.
      </Text>
    );
  }

  return (
    <Tabs value={categoriaMostrada} onChange={setCategoriaActiva} variant="pills" keepMounted={false}>
      <Tabs.List>
        {categoriasConDatos.map((cat) => (
          <Tabs.Tab
            key={cat.clave}
            value={cat.clave}
            color={cat.color}
            leftSection={<cat.icono size={16} />}
            rightSection={
              <Badge size="sm" variant="light" color={cat.clave === categoriaMostrada ? 'white' : cat.color}>
                {productosPorCategoria.get(cat.clave)?.length ?? 0}
              </Badge>
            }
          >
            {cat.etiqueta}
          </Tabs.Tab>
        ))}
      </Tabs.List>

      {categoriasConDatos.map((cat) => (
        <Tabs.Panel key={cat.clave} value={cat.clave} pt="md">
          <PanelGruposProductosVendidos
            productos={productosPorCategoria.get(cat.clave) ?? []}
            ivaFactor={ivaFactor}
            pctCostoObjetivo={pctCostoObjetivo}
          />
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}

// Cuadrícula de tarjetas por grupo (mismo criterio que PanelSubgrupos del
// catálogo): al hacer clic se muestra solo la tabla de ese grupo, para no
// renderizar de golpe todas las ventas del periodo.
function PanelGruposProductosVendidos({
  productos,
  ivaFactor,
  pctCostoObjetivo,
}: {
  productos: ProductoVendido[];
  ivaFactor: number;
  pctCostoObjetivo: number;
}) {
  const [grupoActivo, setGrupoActivo] = useState<string | null>(null);

  const porGrupo = useMemo(() => {
    const mapa = new Map<string, ProductoVendido[]>();
    for (const p of productos) {
      const lista = mapa.get(p.grupo) ?? [];
      lista.push(p);
      mapa.set(p.grupo, lista);
    }
    return mapa;
  }, [productos]);

  const grupos = useMemo(() => Array.from(porGrupo.keys()).sort(), [porGrupo]);

  const exportar = useExportarProductosVendidos();

  const executeExportarGrupo = (grupo: string, fechaDesde: string) => {
    exportar.mutate(
      { fechaDesde, grupo },
      {
        onSuccess: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `ProductosVendidos_${fechaDesde}_${grupo}.xlsx`.replace(/\s+/g, '_');
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.URL.revokeObjectURL(url);
        },
        onError: (err: any) => {
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

  if (grupoActivo && porGrupo.has(grupoActivo)) {
    const itemsGrupo = porGrupo.get(grupoActivo) ?? [];
    const fechaDesde = itemsGrupo[0]?.fecha_desde;
    return (
      <Stack gap="md">
        <Group justify="space-between">
          <Button variant="subtle" size="sm" leftSection={<IconArrowLeft size={16} />} onClick={() => setGrupoActivo(null)} style={{ alignSelf: 'flex-start' }}>
            Volver a grupos
          </Button>
          {fechaDesde && (
            <Button
              variant="light"
              size="sm"
              leftSection={<IconFileSpreadsheet size={16} />}
              loading={exportar.isPending}
              onClick={() => executeExportarGrupo(grupoActivo, fechaDesde)}
            >
              Exportar grupo
            </Button>
          )}
        </Group>
        <Title order={5}>{grupoActivo}</Title>
        <TablaProductosVendidos productos={itemsGrupo} ivaFactor={ivaFactor} pctCostoObjetivo={pctCostoObjetivo} />
      </Stack>
    );
  }

  if (grupos.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No hay productos vendidos guardados para este periodo.
      </Text>
    );
  }

  return (
    <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="md">
      {grupos.map((grupo) => {
        const items = porGrupo.get(grupo) ?? [];
        const totalGrupo = items.reduce((acc, p) => acc + (p.total ?? 0), 0);
        const sinMatch = items.filter((p) => !p.producto_catalogo_encontrado).length;

        // Costeo global del grupo: promedio ponderado (no simple) del %
        // costo, mismo criterio que costo_global_ponderado del backend —
        // Σcosto_catalogo / (Σprecio_venta_catalogo / iva), solo sobre los
        // productos que sí tengan ambos datos del catálogo.
        const conCosteo = items.filter((p) => p.costo_catalogo !== null && p.precio_venta_catalogo !== null && p.precio_venta_catalogo !== 0);
        const sumaCosto = conCosteo.reduce((acc, p) => acc + (p.costo_catalogo ?? 0), 0);
        const sumaVenta = conCosteo.reduce((acc, p) => acc + (p.precio_venta_catalogo ?? 0), 0);
        const pctCostoGrupo = conCosteo.length > 0 && sumaVenta > 0 ? sumaCosto / (sumaVenta / ivaFactor) : null;

        return (
          <UnstyledButton key={grupo} onClick={() => setGrupoActivo(grupo)}>
            <Card withBorder radius="md" p="md" style={{ borderLeft: '3px solid var(--mantine-color-grape-6)', height: '100%' }}>
              <Stack gap={6}>
                <Text size="sm" fw={600} lineClamp={2}>
                  {grupo}
                </Text>
                <Text size="xs" c="dimmed">
                  {items.length} producto(s)
                </Text>
                <Text size="sm" fw={700} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatoMoneda.format(totalGrupo)}
                </Text>
                {pctCostoGrupo !== null && (
                  <Badge size="xs" variant="light" color={colorPorEstadoCosteo(pctCostoGrupo <= pctCostoObjetivo)}>
                    % Costo: {formatoPct(pctCostoGrupo)}
                  </Badge>
                )}
                {sinMatch > 0 && (
                  <Badge size="xs" variant="light" color="red" leftSection={<IconAlertTriangle size={12} />}>
                    {sinMatch} sin match
                  </Badge>
                )}
              </Stack>
            </Card>
          </UnstyledButton>
        );
      })}
    </SimpleGrid>
  );
}

// Panel "Productos Vendidos" — Fase 2 de Catálogo de Productos (solo
// Restaurante): subir el reporte mensual de ventas del POS, guardarlo por
// periodo, y revisarlo agrupado igual que el catálogo. La comparación
// contra "Impuestos Generados por Ventas" queda para una etapa posterior.
function PanelProductosVendidos() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [modoFecha, setModoFecha] = useState<'dia' | 'rango'>('dia');
  const [diaArchivo, setDiaArchivo] = useState<Date | null>(null);
  const [rangoArchivo, setRangoArchivo] = useState<[Date | null, Date | null]>([null, null]);
  const [modalReemplazoAbierto, setModalReemplazoAbierto] = useState(false);
  const [lotesConflicto, setLotesConflicto] = useState<LoteProductosVendidosConflicto[]>([]);
  const [modalEliminarAbierto, setModalEliminarAbierto] = useState(false);
  const [fechaDesdeVer, setFechaDesdeVer] = useState<string | null>(null);
  const [mostrarSubirManual, setMostrarSubirManual] = useState<boolean | null>(null);

  const subir = useSubirProductosVendidos();
  const lotes = useLotesProductosVendidos();
  const eliminar = useEliminarProductosVendidos();
  const exportar = useExportarProductosVendidos();
  const configuracionCosteo = useConfiguracionCosteo();
  const ivaFactor = configuracionCosteo.data?.configuracion.iva_factor ?? 1.16;
  const pctCostoObjetivo = configuracionCosteo.data?.configuracion.pct_costo_objetivo ?? 0.28;

  const fechaDesdeActivo = fechaDesdeVer ?? lotes.data?.lotes[0]?.fecha_desde ?? null;
  const etiquetaActiva = lotes.data?.lotes.find((l) => l.fecha_desde === fechaDesdeActivo)?.etiqueta ?? fechaDesdeActivo;
  const datos = useProductosVendidos(fechaDesdeActivo);
  const hayLotes = (lotes.data?.lotes.length ?? 0) > 0;
  const mostrarSubir = mostrarSubirManual ?? !hayLotes;

  const executeExportarTodo = () => {
    if (!fechaDesdeActivo) return;
    exportar.mutate(
      { fechaDesde: fechaDesdeActivo },
      {
        onSuccess: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `ProductosVendidos_${fechaDesdeActivo}.xlsx`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.URL.revokeObjectURL(url);
        },
        onError: (err: any) => {
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

  const fechaISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const [fechaDesdeRango, fechaHastaRango] = rangoArchivo;
  const fechaDesdeArchivoTexto = modoFecha === 'dia' ? (diaArchivo ? fechaISO(diaArchivo) : null) : (fechaDesdeRango ? fechaISO(fechaDesdeRango) : null);
  const fechaHastaArchivoTexto = modoFecha === 'dia' ? fechaDesdeArchivoTexto : (fechaHastaRango ? fechaISO(fechaHastaRango) : null);

  const executeSubir = (confirmarReemplazo = false) => {
    if (!archivo || !fechaDesdeArchivoTexto || !fechaHastaArchivoTexto) return;

    subir.mutate(
      { file: archivo, fechaDesde: fechaDesdeArchivoTexto, fechaHasta: fechaHastaArchivoTexto, confirmarReemplazo },
      {
        onSuccess: (data) => {
          if ('requiere_confirmacion' in data) {
            setLotesConflicto(data.lotes_conflicto);
            setModalReemplazoAbierto(true);
            return;
          }
          setModalReemplazoAbierto(false);
          setArchivo(null);
          setDiaArchivo(null);
          setRangoArchivo([null, null]);
          setFechaDesdeVer(data.fecha_desde);
          setMostrarSubirManual(false);
          notifications.show({
            title: 'Productos Vendidos guardado',
            message: `${data.total} producto(s) guardado(s) en ${Object.keys(data.por_grupo).length} grupo(s)${
              data.sin_match_catalogo > 0 ? ` — ${data.sin_match_catalogo} sin match en catálogo` : ''
            }.`,
            color: data.sin_match_catalogo > 0 ? 'orange' : 'green',
            icon: <IconCheck size={16} />,
          });
        },
        onError: (err: any) => {
          notifications.show({
            title: 'Error al guardar Productos Vendidos',
            message: err.response?.data?.detail || 'Ocurrió un error al procesar el archivo.',
            color: 'red',
            icon: <IconX size={16} />,
          });
        },
      },
    );
  };

  const productos = datos.data?.productos ?? [];
  const totalVentas = productos.reduce((acc, p) => acc + (p.total ?? 0), 0);
  const totalSubtotal = productos.reduce((acc, p) => acc + (p.subtotal ?? 0), 0);
  const totalDescuento = productos.reduce((acc, p) => acc + (p.descuento ?? 0), 0);
  const sinMatchCatalogo = productos.filter((p) => !p.producto_catalogo_encontrado).length;

  return (
    <Stack gap="lg">
      <Card withBorder radius="md" p={mostrarSubir ? 'lg' : 'sm'}>
        <Stack gap={mostrarSubir ? 'md' : 0}>
          <UnstyledButton onClick={() => setMostrarSubirManual(!mostrarSubir)}>
            <Group justify="space-between">
              <Group gap="xs">
                <ThemeIcon size={28} radius="md" variant="light" color="grape">
                  <IconUpload size={16} />
                </ThemeIcon>
                <Text fw={600} size={mostrarSubir ? 'md' : 'sm'}>
                  {mostrarSubir ? 'Subir Productos Vendidos' : 'Actualizar Productos Vendidos'}
                </Text>
              </Group>
              <ActionIcon variant="subtle" color="gray" size="sm">
                {mostrarSubir ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
              </ActionIcon>
            </Group>
          </UnstyledButton>
          <Collapse in={mostrarSubir}>
            <Stack gap="md" pt="xs">
              <Stack gap="xs">
                <SegmentedControl
                  size="xs"
                  value={modoFecha}
                  onChange={(v) => setModoFecha(v as 'dia' | 'rango')}
                  data={[
                    { label: 'Un solo día', value: 'dia' },
                    { label: 'Rango (semana/mes)', value: 'rango' },
                  ]}
                />
                {modoFecha === 'dia' ? (
                  <DateInput
                    label="Día que cubre el archivo"
                    placeholder="Selecciona el día"
                    description="El archivo no trae fecha por fila — indica el día real que exportaste."
                    value={diaArchivo}
                    onChange={setDiaArchivo}
                    valueFormat="DD/MM/YYYY"
                  />
                ) : (
                  <DatePickerInput
                    type="range"
                    label="Rango de fechas que cubre el archivo"
                    placeholder="Selecciona inicio y fin"
                    description="El archivo no trae fecha por fila — indica el rango real que exportaste."
                    value={rangoArchivo}
                    onChange={setRangoArchivo}
                    valueFormat="DD/MM/YYYY"
                  />
                )}
              </Stack>
              <Group align="flex-start" grow>
                <ArchivoDropzone
                  titulo="Reporte de Productos Vendidos"
                  descripcion="Excel exportado del POS (bloques por grupo)."
                  file={archivo}
                  onDrop={setArchivo}
                  onRemove={() => setArchivo(null)}
                />
              </Group>
              {archivo && fechaDesdeArchivoTexto && fechaHastaArchivoTexto && (
                <Group justify="flex-end">
                  <Button onClick={() => executeSubir(false)} loading={subir.isPending}>
                    Guardar Productos Vendidos
                  </Button>
                </Group>
              )}
            </Stack>
          </Collapse>
        </Stack>
      </Card>

      <Card withBorder radius="md" p="lg">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Group gap="xs">
              <ThemeIcon size={28} radius="md" variant="light" color="grape">
                <IconShoppingCart size={16} />
              </ThemeIcon>
              <Title order={4}>Productos Vendidos guardados</Title>
            </Group>
            {fechaDesdeActivo && (
              <Group gap="xs">
                <Button
                  variant="light"
                  size="xs"
                  leftSection={<IconFileSpreadsheet size={14} />}
                  loading={exportar.isPending}
                  onClick={executeExportarTodo}
                >
                  Exportar todo
                </Button>
                <Button
                  variant="subtle"
                  color="red"
                  size="xs"
                  leftSection={<IconTrash size={14} />}
                  onClick={() => setModalEliminarAbierto(true)}
                >
                  Eliminar lote
                </Button>
              </Group>
            )}
          </Group>

          <Divider />

          {lotes.data && lotes.data.lotes.length > 0 ? (
            <SelectorDiasPorMes
              items={lotes.data.lotes.map((l) => ({ clave: l.fecha_desde, fecha: l.fecha_desde, etiqueta: l.etiqueta, total: l.total }))}
              activo={fechaDesdeActivo}
              onSeleccionar={setFechaDesdeVer}
              color="grape"
            />
          ) : (
            <Text size="sm" c="dimmed">
              Todavía no hay ningún lote guardado.
            </Text>
          )}

          {fechaDesdeActivo && (
            <>
              <Divider />

              <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="md">
                <StatCard
                  title="Total vendido"
                  value={totalVentas}
                  icon={IconShoppingCart}
                  color="brand"
                  description={`${etiquetaActiva} · incluye Impuesto`}
                  formatValue={(v) => formatoMoneda.format(v)}
                />
                <StatCard
                  title="Subtotal (ganancia real)"
                  value={totalSubtotal}
                  icon={IconReceiptTax}
                  color="success"
                  description="Total sin Impuesto"
                  formatValue={(v) => formatoMoneda.format(v)}
                />
                <StatCard
                  title="Descuento"
                  value={totalDescuento}
                  icon={IconGift}
                  color="secondary"
                  description="Total del lote"
                  formatValue={(v) => formatoMoneda.format(v)}
                />
                <StatCard
                  title="Productos"
                  value={productos.length}
                  icon={IconListDetails}
                  color="info"
                  description="Filas guardadas"
                />
                <StatCard
                  title="Sin match en catálogo"
                  value={sinMatchCatalogo}
                  icon={IconAlertTriangle}
                  color={sinMatchCatalogo > 0 ? 'error' : 'success'}
                  description="Pendientes de revisar"
                />
              </SimpleGrid>

              <Divider />

              {datos.isLoading ? (
                <Text size="sm" c="dimmed">Cargando...</Text>
              ) : (
                <PanelSeccionesProductosVendidos productos={productos} ivaFactor={ivaFactor} pctCostoObjetivo={pctCostoObjetivo} />
              )}
            </>
          )}
        </Stack>
      </Card>

      <Modal
        opened={modalReemplazoAbierto}
        onClose={() => setModalReemplazoAbierto(false)}
        title={<Text fw={600} c="red">Confirmar reemplazo</Text>}
      >
        <Stack gap="md">
          <Text size="sm">
            {lotesConflicto.length} lote(s) ya guardado(s) se traslapan con el rango que estás subiendo. Si
            continúas, esos lotes se reemplazan completos por el contenido del archivo actual.
          </Text>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Lote</Table.Th>
                <Table.Th ta="right">Filas existentes</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {lotesConflicto.map((l) => (
                <Table.Tr key={l.fecha_desde}>
                  <Table.Td>{l.fecha_desde} - {l.fecha_hasta}</Table.Td>
                  <Table.Td ta="right">{l.total_existentes}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setModalReemplazoAbierto(false)}>
              Cancelar
            </Button>
            <Button color="red" loading={subir.isPending} onClick={() => executeSubir(true)}>
              Reemplazar
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={modalEliminarAbierto}
        onClose={() => setModalEliminarAbierto(false)}
        title={<Text fw={600} c="red">Eliminar lote</Text>}
      >
        <Stack gap="md">
          <Text size="sm">
            ¿Eliminar todos los productos vendidos guardados para el lote {etiquetaActiva}? Esta acción no se puede
            deshacer.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setModalEliminarAbierto(false)}>
              Cancelar
            </Button>
            <Button
              color="red"
              loading={eliminar.isPending}
              onClick={() => {
                if (!fechaDesdeActivo) return;
                eliminar.mutate(fechaDesdeActivo, {
                  onSuccess: () => {
                    setModalEliminarAbierto(false);
                    setFechaDesdeVer(null);
                  },
                });
              }}
            >
              Eliminar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

// Tabla de detalle de un grupo de la Comparación IVA — nivel 4/hoja de la
// jerarquía, misma tabla que antes se mostraba plana.
function TablaComparacionIva({ filas }: { filas: FilaCortesiaProductoVendido[] }) {
  return (
    <Card withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
      <Table.ScrollContainer minWidth={860}>
        <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
          <Table.Thead
            style={{
              background: 'var(--mantine-color-default-hover)',
              borderBottom: '2px solid var(--mantine-color-default-border)',
            }}
          >
            <Table.Tr>
              {['Producto', 'Grupo', 'Subtotal', 'Impuesto', 'Ingreso real', 'Monto cortesía', 'Piezas'].map(
                (encabezado, i) => (
                  <Table.Th
                    key={encabezado}
                    ta={i >= 2 ? 'right' : undefined}
                    style={{ fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--mantine-color-dimmed)' }}
                  >
                    {encabezado}
                  </Table.Th>
                ),
              )}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filas.map((f, i) => {
              const sinDatos = f.monto_cortesia === null;
              const conCortesia = (f.monto_cortesia ?? 0) > 0.01;
              return (
                <Table.Tr
                  key={`${f.nombre_producto}-${i}`}
                  style={conCortesia ? { background: 'var(--mantine-color-red-light)' } : undefined}
                >
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {f.nombre_producto}
                    </Text>
                    {sinDatos && (
                      <Text size="xs" c="dimmed">
                        Falta Impuesto — vuelve a subir este periodo
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      {f.grupo}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {f.subtotal !== null ? formatoMoneda.format(f.subtotal) : '—'}
                  </Table.Td>
                  <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {f.impuesto !== null ? formatoMoneda.format(f.impuesto) : '—'}
                  </Table.Td>
                  <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {f.ingreso_real !== null ? formatoMoneda.format(f.ingreso_real) : '—'}
                  </Table.Td>
                  <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }} fw={600}>
                    <Text c={conCortesia ? SEMANTIC_COLORS.error : undefined} size="sm" fw={600}>
                      {f.monto_cortesia !== null ? formatoMoneda.format(f.monto_cortesia) : '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {f.cantidad_cortesia !== null ? f.cantidad_cortesia : '—'}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );
}

// Nivel 3 — cuadrícula de tarjetas por grupo, mismo criterio que
// PanelGruposProductosVendidos: al hacer clic se muestra solo la tabla de
// ese grupo.
function PanelGruposComparacionIva({ filas }: { filas: FilaCortesiaProductoVendido[] }) {
  const [grupoActivo, setGrupoActivo] = useState<string | null>(null);

  const porGrupo = useMemo(() => {
    const mapa = new Map<string, FilaCortesiaProductoVendido[]>();
    for (const f of filas) {
      const lista = mapa.get(f.grupo) ?? [];
      lista.push(f);
      mapa.set(f.grupo, lista);
    }
    return mapa;
  }, [filas]);

  const grupos = useMemo(() => Array.from(porGrupo.keys()).sort(), [porGrupo]);

  if (grupoActivo && porGrupo.has(grupoActivo)) {
    return (
      <Stack gap="md">
        <Button variant="subtle" size="sm" leftSection={<IconArrowLeft size={16} />} onClick={() => setGrupoActivo(null)} style={{ alignSelf: 'flex-start' }}>
          Volver a grupos
        </Button>
        <Title order={5}>{grupoActivo}</Title>
        <TablaComparacionIva filas={porGrupo.get(grupoActivo) ?? []} />
      </Stack>
    );
  }

  if (grupos.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No hay productos que comparar aquí.
      </Text>
    );
  }

  return (
    <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="md">
      {grupos.map((grupo) => {
        const items = porGrupo.get(grupo) ?? [];
        const montoCortesiaGrupo = items.reduce((acc, f) => acc + (f.monto_cortesia ?? 0), 0);
        const conCortesia = items.filter((f) => (f.monto_cortesia ?? 0) > 0.01).length;
        return (
          <UnstyledButton key={grupo} onClick={() => setGrupoActivo(grupo)}>
            <Card withBorder radius="md" p="md" style={{ borderLeft: '3px solid var(--mantine-color-grape-6)', height: '100%' }}>
              <Stack gap={6}>
                <Text size="sm" fw={600} lineClamp={2}>
                  {grupo}
                </Text>
                <Text size="xs" c="dimmed">
                  {items.length} producto(s)
                </Text>
                <Text size="sm" fw={700} style={{ fontVariantNumeric: 'tabular-nums' }} c={montoCortesiaGrupo > 0.01 ? SEMANTIC_COLORS.error : undefined}>
                  {formatoMoneda.format(montoCortesiaGrupo)}
                </Text>
                {conCortesia > 0 && (
                  <Badge size="xs" variant="light" color="red" leftSection={<IconAlertTriangle size={12} />}>
                    {conCortesia} con cortesía
                  </Badge>
                )}
              </Stack>
            </Card>
          </UnstyledButton>
        );
      })}
    </SimpleGrid>
  );
}

// Nivel 2 — mismo criterio que PanelPorCategoria del catálogo: pestañas por
// categoria_tipo dentro de la sección ya filtrada.
function PanelCategoriaComparacionIva({ filas }: { filas: FilaCortesiaProductoVendido[] }) {
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null);

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, FilaCortesiaProductoVendido[]>();
    for (const f of filas) {
      if (!f.categoria_tipo) continue;
      const lista = mapa.get(f.categoria_tipo) ?? [];
      lista.push(f);
      mapa.set(f.categoria_tipo, lista);
    }
    return mapa;
  }, [filas]);

  const categoriasConDatos = CATEGORIAS_TIPO.filter((cat) => (porCategoria.get(cat.clave)?.length ?? 0) > 0);

  const categoriaMostrada =
    categoriaActiva && categoriasConDatos.some((cat) => cat.clave === categoriaActiva)
      ? categoriaActiva
      : (categoriasConDatos[0]?.clave ?? null);

  if (categoriasConDatos.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Ningún producto coincide aquí.
      </Text>
    );
  }

  return (
    <Tabs value={categoriaMostrada} onChange={setCategoriaActiva} variant="pills" keepMounted={false}>
      <Tabs.List>
        {categoriasConDatos.map((cat) => (
          <Tabs.Tab
            key={cat.clave}
            value={cat.clave}
            color={cat.color}
            leftSection={<cat.icono size={16} />}
            rightSection={
              <Badge size="sm" variant="light" color={cat.clave === categoriaMostrada ? 'white' : cat.color}>
                {porCategoria.get(cat.clave)?.length ?? 0}
              </Badge>
            }
          >
            {cat.etiqueta}
          </Tabs.Tab>
        ))}
      </Tabs.List>

      {categoriasConDatos.map((cat) => (
        <Tabs.Panel key={cat.clave} value={cat.clave} pt="md">
          <PanelGruposComparacionIva filas={porCategoria.get(cat.clave) ?? []} />
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}

// Nivel 1 — mismo criterio que PanelSeccionesProductosVendidos: pestañas
// por seccion_menu, más "Sin clasificar" para las filas sin categoría (sin
// match contra el catálogo, del lado de Productos Vendidos, o que solo
// existen en Impuestos IVA).
function PanelSeccionesComparacionIva({ filas }: { filas: FilaCortesiaProductoVendido[] }) {
  const [seccionActiva, setSeccionActiva] = useState<string | null>(null);

  const porSeccion = useMemo(() => {
    const mapa = new Map<string, FilaCortesiaProductoVendido[]>();
    for (const f of filas) {
      if (!f.seccion_menu) continue;
      const lista = mapa.get(f.seccion_menu) ?? [];
      lista.push(f);
      mapa.set(f.seccion_menu, lista);
    }
    return mapa;
  }, [filas]);

  const sinClasificar = useMemo(() => filas.filter((f) => !f.seccion_menu), [filas]);

  const seccionesConDatos = SECCIONES_MENU.filter((sec) => (porSeccion.get(sec.clave)?.length ?? 0) > 0);

  const seccionMostrada =
    seccionActiva && (seccionesConDatos.some((sec) => sec.clave === seccionActiva) || seccionActiva === 'sin-clasificar')
      ? seccionActiva
      : (seccionesConDatos[0]?.clave ?? (sinClasificar.length > 0 ? 'sin-clasificar' : null));

  if (seccionesConDatos.length === 0 && sinClasificar.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No hay productos que comparar.
      </Text>
    );
  }

  return (
    <Tabs value={seccionMostrada} onChange={setSeccionActiva} variant="pills" color="dark" keepMounted={false}>
      <Tabs.List>
        {seccionesConDatos.map((sec) => (
          <Tabs.Tab
            key={sec.clave}
            value={sec.clave}
            color={sec.color}
            leftSection={<sec.icono size={16} />}
            rightSection={
              <Badge size="sm" variant="light" color={sec.clave === seccionMostrada ? 'white' : sec.color}>
                {porSeccion.get(sec.clave)?.length ?? 0}
              </Badge>
            }
          >
            {sec.clave}
          </Tabs.Tab>
        ))}
        {sinClasificar.length > 0 && (
          <Tabs.Tab
            value="sin-clasificar"
            color="red"
            leftSection={<IconAlertTriangle size={16} />}
            rightSection={
              <Badge size="sm" variant="light" color={seccionMostrada === 'sin-clasificar' ? 'white' : 'red'}>
                {sinClasificar.length}
              </Badge>
            }
          >
            Sin clasificar
          </Tabs.Tab>
        )}
      </Tabs.List>

      {seccionesConDatos.map((sec) => (
        <Tabs.Panel key={sec.clave} value={sec.clave} pt="lg">
          <PanelCategoriaComparacionIva filas={porSeccion.get(sec.clave) ?? []} />
        </Tabs.Panel>
      ))}
      {sinClasificar.length > 0 && (
        <Tabs.Panel value="sin-clasificar" pt="lg">
          <PanelGruposComparacionIva filas={sinClasificar} />
        </Tabs.Panel>
      )}
    </Tabs>
  );
}

// Panel "Comparación IVA" — compara el Subtotal de Productos Vendidos
// contra el de Impuestos Generados por IVA del mismo periodo, por nombre
// de producto, para detectar posibles cortesías (venta registrada sin el
// IVA correspondiente). Mismo patrón de carga por periodo que Productos
// Vendidos, pero con su propia tabla ("impuestos_iva_detalle") y su propio
// endpoint de comparación (no clasifica contra el Catálogo).
function PanelComparacionIva() {
  const [fechaDesdeVer, setFechaDesdeVer] = useState<string | null>(null);
  const [soloConCortesia, setSoloConCortesia] = useState(true);

  // Reutiliza los lotes ya guardados de Productos Vendidos — el cálculo
  // de cortesías sale enteramente de esa tabla (Subtotal/Impuesto), ya no
  // depende de subir ningún archivo aparte.
  const lotes = useLotesProductosVendidos();

  const fechaDesdeActivo = fechaDesdeVer ?? lotes.data?.lotes[0]?.fecha_desde ?? null;
  const cortesias = useCortesiasProductosVendidos(fechaDesdeActivo);

  const filasComparacion = cortesias.data?.comparacion ?? [];
  const filasMostradas = soloConCortesia
    ? filasComparacion.filter((f) => (f.monto_cortesia ?? 0) > 0.01)
    : filasComparacion;

  return (
    <Stack gap="lg">
      <Card withBorder radius="md" p="lg">
        <Stack gap="md">
          <div>
            <Title order={4}>Posibles cortesías</Title>
            <Text size="sm" c="dimmed">
              Calculado directo de Productos Vendidos: Impuesto ÷ 0.16 da el ingreso real implícito — la diferencia
              contra el Subtotal registrado es una posible cortesía, expresada también en piezas usando el Costo.
              No hace falta subir ningún archivo aquí.
            </Text>
          </div>

          {lotes.data && lotes.data.lotes.length > 0 ? (
            <Group>
              {lotes.data.lotes.map((l) => (
                <Button
                  key={l.fecha_desde}
                  size="xs"
                  variant={l.fecha_desde === fechaDesdeActivo ? 'filled' : 'default'}
                  color="grape"
                  onClick={() => setFechaDesdeVer(l.fecha_desde)}
                >
                  {l.etiqueta} ({l.total})
                </Button>
              ))}
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              Todavía no hay ningún lote de Productos Vendidos guardado.
            </Text>
          )}

          {fechaDesdeActivo && (
            <>
              <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="md">
                <StatCard
                  title="Monto total de cortesía"
                  value={cortesias.data?.total_monto_cortesia ?? 0}
                  icon={IconReceiptTax}
                  color={(cortesias.data?.total_monto_cortesia ?? 0) > 0.01 ? 'warning' : 'success'}
                  description={lotes.data?.lotes.find((l) => l.fecha_desde === fechaDesdeActivo)?.etiqueta ?? fechaDesdeActivo}
                  formatValue={(v) => formatoMoneda.format(v)}
                />
                <StatCard
                  title="Piezas de cortesía"
                  value={cortesias.data?.total_cantidad_cortesia ?? 0}
                  icon={IconAlertTriangle}
                  color={(cortesias.data?.total_cantidad_cortesia ?? 0) > 0 ? 'warning' : 'success'}
                  description="Estimado (monto ÷ costo)"
                />
                <StatCard
                  title="Productos con cortesía"
                  value={cortesias.data?.productos_con_cortesia ?? 0}
                  icon={IconListDetails}
                  color="info"
                  description={`De ${filasComparacion.length} en total`}
                />
              </SimpleGrid>

              <Group justify="space-between">
                <Text size="sm" fw={600}>
                  Detalle por producto
                </Text>
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={() => setSoloConCortesia((v) => !v)}
                >
                  {soloConCortesia ? 'Mostrar todos' : 'Mostrar solo con cortesía'}
                </Button>
              </Group>

              {cortesias.isLoading ? (
                <Text size="sm" c="dimmed">Cargando...</Text>
              ) : filasMostradas.length === 0 ? (
                <Text size="sm" c="dimmed">
                  {soloConCortesia ? 'No hay indicios de cortesía — todo cuadra.' : 'No hay productos que mostrar.'}
                </Text>
              ) : (
                <PanelSeccionesComparacionIva filas={filasMostradas} />
              )}
            </>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}

// ════════════════════════════════════════════════════════════════════
// Productos Vendidos + Comparación IVA — Cafetería (2 niveles: Grupo →
// Tabla, sin categoria_tipo/seccion_menu porque ese catálogo no los
// tiene). Mismo criterio y componentes que Restaurante, aplanados.
// ════════════════════════════════════════════════════════════════════

function TablaProductosVendidosCafeteria({
  productos,
  ivaFactor,
  pctCostoObjetivo,
}: {
  productos: ProductoVendidoCafeteria[];
  ivaFactor: number;
  pctCostoObjetivo: number;
}) {
  const totalCosto = productos.reduce((acc, p) => acc + (p.total_costo ?? 0), 0);
  const totalDescuento = productos.reduce((acc, p) => acc + (p.descuento ?? 0), 0);
  const totalSubtotal = productos.reduce((acc, p) => acc + (p.subtotal ?? 0), 0);
  const totalImpuesto = productos.reduce((acc, p) => acc + (p.impuesto ?? 0), 0);
  const totalGeneral = productos.reduce((acc, p) => acc + (p.total ?? 0), 0);

  return (
    <Card withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
      <Table.ScrollContainer minWidth={820}>
        <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
          <Table.Thead
            style={{
              background: 'var(--mantine-color-default-hover)',
              borderBottom: '2px solid var(--mantine-color-default-border)',
            }}
          >
            <Table.Tr>
              {['Producto', 'Catálogo', '% Costo', 'Costo', 'Venta', 'Cant.', 'Tot. Costo', 'Descuento', 'Subtotal', 'Impuesto', 'TOTAL'].map(
                (encabezado, i) => (
                  <Table.Th
                    key={encabezado}
                    ta={i >= 2 ? 'right' : undefined}
                    style={{ fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--mantine-color-dimmed)' }}
                  >
                    {encabezado}
                  </Table.Th>
                ),
              )}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {productos.map((p) => (
              <Table.Tr key={p.id}>
                <Table.Td>
                  <Text size="sm" fw={500}>
                    {p.nombre_producto}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {p.producto_catalogo_encontrado ? (
                    <Badge size="xs" variant="light" color="teal">
                      Encontrado
                    </Badge>
                  ) : (
                    <Badge size="xs" variant="light" color="red" leftSection={<IconAlertTriangle size={12} />}>
                      No encontrado en catálogo
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td ta="right">
                  {(() => {
                    const pct = pctCostoCatalogo(p.costo_catalogo, p.precio_venta_catalogo, ivaFactor);
                    return pct !== null ? (
                      <Badge size="sm" variant="light" color={colorPorEstadoCosteo(pct <= pctCostoObjetivo)} style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatoPct(pct)}
                      </Badge>
                    ) : (
                      <Text size="sm" c="dimmed" ta="right">—</Text>
                    );
                  })()}
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.costo !== null ? formatoMoneda.format(p.costo) : '—'}
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.precio_venta !== null ? formatoMoneda.format(p.precio_venta) : '—'}
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.cantidad !== null ? Math.round(p.cantidad) : '—'}
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.total_costo !== null ? formatoMoneda.format(p.total_costo) : '—'}
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.descuento !== null ? formatoMoneda.format(p.descuento) : '—'}
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.subtotal !== null ? formatoMoneda.format(p.subtotal) : '—'}
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.impuesto !== null ? formatoMoneda.format(p.impuesto) : '—'}
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }} fw={600}>
                  {p.total !== null ? formatoMoneda.format(p.total) : '—'}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
          <Table.Tfoot>
            <Table.Tr style={{ borderTop: '2px solid var(--mantine-color-teal-6)', background: 'var(--mantine-color-default-hover)' }}>
              <Table.Th colSpan={6}>TOTAL</Table.Th>
              <Table.Th ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatoMoneda.format(totalCosto)}
              </Table.Th>
              <Table.Th ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatoMoneda.format(totalDescuento)}
              </Table.Th>
              <Table.Th ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatoMoneda.format(totalSubtotal)}
              </Table.Th>
              <Table.Th ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatoMoneda.format(totalImpuesto)}
              </Table.Th>
              <Table.Th ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatoMoneda.format(totalGeneral)}
              </Table.Th>
            </Table.Tr>
          </Table.Tfoot>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );
}

// Nivel único (Grupo → Tabla) — Cafetería no tiene categoria_tipo ni
// seccion_menu, así que no hay pestañas de nivel superior.
function PanelGruposProductosVendidosCafeteria({
  productos,
  ivaFactor,
  pctCostoObjetivo,
}: {
  productos: ProductoVendidoCafeteria[];
  ivaFactor: number;
  pctCostoObjetivo: number;
}) {
  const [grupoActivo, setGrupoActivo] = useState<string | null>(null);

  const porGrupo = useMemo(() => {
    const mapa = new Map<string, ProductoVendidoCafeteria[]>();
    for (const p of productos) {
      const lista = mapa.get(p.grupo) ?? [];
      lista.push(p);
      mapa.set(p.grupo, lista);
    }
    return mapa;
  }, [productos]);

  const grupos = useMemo(() => Array.from(porGrupo.keys()).sort(), [porGrupo]);

  const exportar = useExportarProductosVendidosCafeteria();

  const executeExportarGrupo = (grupo: string, periodo: string) => {
    exportar.mutate(
      { periodo, grupo },
      {
        onSuccess: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `ProductosVendidosCafeteria_${periodo}_${grupo}.xlsx`.replace(/\s+/g, '_');
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.URL.revokeObjectURL(url);
        },
        onError: (err: any) => {
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

  if (grupoActivo && porGrupo.has(grupoActivo)) {
    const itemsGrupo = porGrupo.get(grupoActivo) ?? [];
    const periodo = itemsGrupo[0]?.periodo;
    return (
      <Stack gap="md">
        <Group justify="space-between">
          <Button variant="subtle" size="sm" leftSection={<IconArrowLeft size={16} />} onClick={() => setGrupoActivo(null)} style={{ alignSelf: 'flex-start' }}>
            Volver a grupos
          </Button>
          {periodo && (
            <Button
              variant="light"
              size="sm"
              leftSection={<IconFileSpreadsheet size={16} />}
              loading={exportar.isPending}
              onClick={() => executeExportarGrupo(grupoActivo, periodo)}
            >
              Exportar grupo
            </Button>
          )}
        </Group>
        <Title order={5}>{grupoActivo}</Title>
        <TablaProductosVendidosCafeteria productos={itemsGrupo} ivaFactor={ivaFactor} pctCostoObjetivo={pctCostoObjetivo} />
      </Stack>
    );
  }

  if (grupos.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No hay productos vendidos guardados para este periodo.
      </Text>
    );
  }

  return (
    <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="md">
      {grupos.map((grupo) => {
        const items = porGrupo.get(grupo) ?? [];
        const totalGrupo = items.reduce((acc, p) => acc + (p.total ?? 0), 0);
        const sinMatch = items.filter((p) => !p.producto_catalogo_encontrado).length;

        const conCosteo = items.filter((p) => p.costo_catalogo !== null && p.precio_venta_catalogo !== null && p.precio_venta_catalogo !== 0);
        const sumaCosto = conCosteo.reduce((acc, p) => acc + (p.costo_catalogo ?? 0), 0);
        const sumaVenta = conCosteo.reduce((acc, p) => acc + (p.precio_venta_catalogo ?? 0), 0);
        const pctCostoGrupo = conCosteo.length > 0 && sumaVenta > 0 ? sumaCosto / (sumaVenta / ivaFactor) : null;

        return (
          <UnstyledButton key={grupo} onClick={() => setGrupoActivo(grupo)}>
            <Card withBorder radius="md" p="md" style={{ borderLeft: '3px solid var(--mantine-color-teal-6)', height: '100%' }}>
              <Stack gap={6}>
                <Text size="sm" fw={600} lineClamp={2}>
                  {grupo}
                </Text>
                <Text size="xs" c="dimmed">
                  {items.length} producto(s)
                </Text>
                <Text size="sm" fw={700} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatoMoneda.format(totalGrupo)}
                </Text>
                {pctCostoGrupo !== null && (
                  <Badge size="xs" variant="light" color={colorPorEstadoCosteo(pctCostoGrupo <= pctCostoObjetivo)}>
                    % Costo: {formatoPct(pctCostoGrupo)}
                  </Badge>
                )}
                {sinMatch > 0 && (
                  <Badge size="xs" variant="light" color="red" leftSection={<IconAlertTriangle size={12} />}>
                    {sinMatch} sin match
                  </Badge>
                )}
              </Stack>
            </Card>
          </UnstyledButton>
        );
      })}
    </SimpleGrid>
  );
}

function PanelProductosVendidosCafeteria() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [mesArchivo, setMesArchivo] = useState<Date | null>(null);
  const [modalReemplazoAbierto, setModalReemplazoAbierto] = useState(false);
  const [totalExistentesReemplazo, setTotalExistentesReemplazo] = useState(0);
  const [modalEliminarAbierto, setModalEliminarAbierto] = useState(false);
  const [periodoVer, setPeriodoVer] = useState<string | null>(null);
  const [mostrarSubirManual, setMostrarSubirManual] = useState<boolean | null>(null);

  const subir = useSubirProductosVendidosCafeteria();
  const periodos = usePeriodosProductosVendidosCafeteria();
  const eliminar = useEliminarProductosVendidosCafeteria();
  const exportar = useExportarProductosVendidosCafeteria();
  const configuracionCosteo = useConfiguracionCosteoCafeteria();
  const ivaFactor = configuracionCosteo.data?.configuracion.iva_factor ?? 1.16;
  const pctCostoObjetivo = configuracionCosteo.data?.configuracion.pct_costo_objetivo ?? 0.28;

  const periodoActivo = periodoVer ?? periodos.data?.periodos[0]?.periodo ?? null;
  const datos = useProductosVendidosCafeteria(periodoActivo);
  const hayPeriodos = (periodos.data?.periodos.length ?? 0) > 0;
  const mostrarSubir = mostrarSubirManual ?? !hayPeriodos;

  const executeExportarTodo = () => {
    if (!periodoActivo) return;
    exportar.mutate(
      { periodo: periodoActivo },
      {
        onSuccess: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `ProductosVendidosCafeteria_${periodoActivo}.xlsx`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.URL.revokeObjectURL(url);
        },
        onError: (err: any) => {
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

  const periodoArchivoTexto = mesArchivo
    ? `${mesArchivo.getFullYear()}-${String(mesArchivo.getMonth() + 1).padStart(2, '0')}`
    : null;

  const executeSubir = (confirmarReemplazo = false) => {
    if (!archivo || !periodoArchivoTexto) return;

    subir.mutate(
      { file: archivo, periodo: periodoArchivoTexto, confirmarReemplazo },
      {
        onSuccess: (data) => {
          if ('requiere_confirmacion' in data) {
            setTotalExistentesReemplazo(data.total_existentes);
            setModalReemplazoAbierto(true);
            return;
          }
          setModalReemplazoAbierto(false);
          setArchivo(null);
          setPeriodoVer(data.periodo);
          setMostrarSubirManual(false);
          notifications.show({
            title: 'Productos Vendidos guardado',
            message: `${data.total} producto(s) guardado(s) en ${Object.keys(data.por_grupo).length} grupo(s)${
              data.sin_match_catalogo > 0 ? ` — ${data.sin_match_catalogo} sin match en catálogo` : ''
            }.`,
            color: data.sin_match_catalogo > 0 ? 'orange' : 'green',
            icon: <IconCheck size={16} />,
          });
        },
        onError: (err: any) => {
          notifications.show({
            title: 'Error al guardar Productos Vendidos',
            message: err.response?.data?.detail || 'Ocurrió un error al procesar el archivo.',
            color: 'red',
            icon: <IconX size={16} />,
          });
        },
      },
    );
  };

  const productos = datos.data?.productos ?? [];
  const totalVentas = productos.reduce((acc, p) => acc + (p.total ?? 0), 0);
  const totalSubtotal = productos.reduce((acc, p) => acc + (p.subtotal ?? 0), 0);
  const totalDescuento = productos.reduce((acc, p) => acc + (p.descuento ?? 0), 0);
  const sinMatchCatalogo = productos.filter((p) => !p.producto_catalogo_encontrado).length;

  return (
    <Stack gap="lg">
      <Card withBorder radius="md" p={mostrarSubir ? 'lg' : 'sm'}>
        <Stack gap={mostrarSubir ? 'md' : 0}>
          <UnstyledButton onClick={() => setMostrarSubirManual(!mostrarSubir)}>
            <Group justify="space-between">
              <Group gap="xs">
                <ThemeIcon size={28} radius="md" variant="light" color="teal">
                  <IconUpload size={16} />
                </ThemeIcon>
                <Text fw={600} size={mostrarSubir ? 'md' : 'sm'}>
                  {mostrarSubir ? 'Subir Productos Vendidos' : 'Actualizar Productos Vendidos'}
                </Text>
              </Group>
              <ActionIcon variant="subtle" color="gray" size="sm">
                {mostrarSubir ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
              </ActionIcon>
            </Group>
          </UnstyledButton>
          <Collapse in={mostrarSubir}>
            <Stack gap="md" pt="xs">
              <Group align="flex-start" grow>
                <MonthPickerInput
                  label="Periodo del archivo"
                  placeholder="Selecciona mes y año"
                  value={mesArchivo}
                  onChange={setMesArchivo}
                  valueFormat="MMMM YYYY"
                />
                <ArchivoDropzone
                  titulo="Reporte de Productos Vendidos"
                  descripcion="Excel exportado del POS (bloques por grupo)."
                  file={archivo}
                  onDrop={setArchivo}
                  onRemove={() => setArchivo(null)}
                />
              </Group>
              {archivo && periodoArchivoTexto && (
                <Group justify="flex-end">
                  <Button onClick={() => executeSubir(false)} loading={subir.isPending}>
                    Guardar Productos Vendidos
                  </Button>
                </Group>
              )}
            </Stack>
          </Collapse>
        </Stack>
      </Card>

      <Card withBorder radius="md" p="lg">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Group gap="xs">
              <ThemeIcon size={28} radius="md" variant="light" color="teal">
                <IconShoppingCart size={16} />
              </ThemeIcon>
              <Title order={4}>Productos Vendidos guardados</Title>
            </Group>
            {periodoActivo && (
              <Group gap="xs">
                <Button
                  variant="light"
                  size="xs"
                  leftSection={<IconFileSpreadsheet size={14} />}
                  loading={exportar.isPending}
                  onClick={executeExportarTodo}
                >
                  Exportar todo
                </Button>
                <Button
                  variant="subtle"
                  color="red"
                  size="xs"
                  leftSection={<IconTrash size={14} />}
                  onClick={() => setModalEliminarAbierto(true)}
                >
                  Eliminar periodo
                </Button>
              </Group>
            )}
          </Group>

          <Divider />

          {periodos.data && periodos.data.periodos.length > 0 ? (
            <Group gap="sm" align="center">
              <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                Periodo:
              </Text>
              <Group gap="xs">
                {periodos.data.periodos.map((p) => (
                  <Button
                    key={p.periodo}
                    size="xs"
                    variant={p.periodo === periodoActivo ? 'filled' : 'default'}
                    color="teal"
                    onClick={() => setPeriodoVer(p.periodo)}
                  >
                    {p.periodo} ({p.total})
                  </Button>
                ))}
              </Group>
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              Todavía no hay ningún periodo guardado.
            </Text>
          )}

          {periodoActivo && (
            <>
              <Divider />

              <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="md">
                <StatCard
                  title="Total vendido"
                  value={totalVentas}
                  icon={IconShoppingCart}
                  color="brand"
                  description={`${periodoActivo} · incluye Impuesto`}
                  formatValue={(v) => formatoMoneda.format(v)}
                />
                <StatCard
                  title="Subtotal (ganancia real)"
                  value={totalSubtotal}
                  icon={IconReceiptTax}
                  color="success"
                  description="Total sin Impuesto"
                  formatValue={(v) => formatoMoneda.format(v)}
                />
                <StatCard
                  title="Descuento"
                  value={totalDescuento}
                  icon={IconGift}
                  color="secondary"
                  description="Total del periodo"
                  formatValue={(v) => formatoMoneda.format(v)}
                />
                <StatCard
                  title="Productos"
                  value={productos.length}
                  icon={IconListDetails}
                  color="info"
                  description="Filas guardadas"
                />
                <StatCard
                  title="Sin match en catálogo"
                  value={sinMatchCatalogo}
                  icon={IconAlertTriangle}
                  color={sinMatchCatalogo > 0 ? 'error' : 'success'}
                  description="Pendientes de revisar"
                />
              </SimpleGrid>

              <Divider />

              {datos.isLoading ? (
                <Text size="sm" c="dimmed">Cargando...</Text>
              ) : (
                <PanelGruposProductosVendidosCafeteria productos={productos} ivaFactor={ivaFactor} pctCostoObjetivo={pctCostoObjetivo} />
              )}
            </>
          )}
        </Stack>
      </Card>

      <Modal
        opened={modalReemplazoAbierto}
        onClose={() => setModalReemplazoAbierto(false)}
        title={<Text fw={600} c="red">Confirmar reemplazo</Text>}
      >
        <Stack gap="md">
          <Text size="sm">
            Ya existen {totalExistentesReemplazo} producto(s) guardados para el periodo {periodoArchivoTexto}. Si
            continúas, se reemplazarán todos por el contenido del archivo actual.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setModalReemplazoAbierto(false)}>
              Cancelar
            </Button>
            <Button color="red" loading={subir.isPending} onClick={() => executeSubir(true)}>
              Reemplazar
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={modalEliminarAbierto}
        onClose={() => setModalEliminarAbierto(false)}
        title={<Text fw={600} c="red">Eliminar periodo</Text>}
      >
        <Stack gap="md">
          <Text size="sm">
            ¿Eliminar todos los productos vendidos guardados para el periodo {periodoActivo}? Esta acción no se puede
            deshacer.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setModalEliminarAbierto(false)}>
              Cancelar
            </Button>
            <Button
              color="red"
              loading={eliminar.isPending}
              onClick={() => {
                if (!periodoActivo) return;
                eliminar.mutate(periodoActivo, {
                  onSuccess: () => {
                    setModalEliminarAbierto(false);
                    setPeriodoVer(null);
                  },
                });
              }}
            >
              Eliminar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

function TablaComparacionIvaCafeteria({ filas }: { filas: FilaCortesiaProductoVendidoCafeteria[] }) {
  return (
    <Card withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
      <Table.ScrollContainer minWidth={820}>
        <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
          <Table.Thead
            style={{
              background: 'var(--mantine-color-default-hover)',
              borderBottom: '2px solid var(--mantine-color-default-border)',
            }}
          >
            <Table.Tr>
              {['Producto', 'Grupo', 'Subtotal', 'Impuesto', 'Ingreso real', 'Monto cortesía', 'Piezas'].map(
                (encabezado, i) => (
                  <Table.Th
                    key={encabezado}
                    ta={i >= 2 ? 'right' : undefined}
                    style={{ fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--mantine-color-dimmed)' }}
                  >
                    {encabezado}
                  </Table.Th>
                ),
              )}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filas.map((f, i) => {
              const sinDatos = f.monto_cortesia === null;
              const conCortesia = (f.monto_cortesia ?? 0) > 0.01;
              return (
                <Table.Tr
                  key={`${f.nombre_producto}-${i}`}
                  style={conCortesia ? { background: 'var(--mantine-color-red-light)' } : undefined}
                >
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {f.nombre_producto}
                    </Text>
                    {sinDatos && (
                      <Text size="xs" c="dimmed">
                        Falta Impuesto — vuelve a subir este periodo
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      {f.grupo}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {f.subtotal !== null ? formatoMoneda.format(f.subtotal) : '—'}
                  </Table.Td>
                  <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {f.impuesto !== null ? formatoMoneda.format(f.impuesto) : '—'}
                  </Table.Td>
                  <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {f.ingreso_real !== null ? formatoMoneda.format(f.ingreso_real) : '—'}
                  </Table.Td>
                  <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }} fw={600}>
                    <Text c={conCortesia ? SEMANTIC_COLORS.error : undefined} size="sm" fw={600}>
                      {f.monto_cortesia !== null ? formatoMoneda.format(f.monto_cortesia) : '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {f.cantidad_cortesia !== null ? f.cantidad_cortesia : '—'}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );
}

function PanelGruposComparacionIvaCafeteria({ filas }: { filas: FilaCortesiaProductoVendidoCafeteria[] }) {
  const [grupoActivo, setGrupoActivo] = useState<string | null>(null);

  const porGrupo = useMemo(() => {
    const mapa = new Map<string, FilaCortesiaProductoVendidoCafeteria[]>();
    for (const f of filas) {
      const lista = mapa.get(f.grupo) ?? [];
      lista.push(f);
      mapa.set(f.grupo, lista);
    }
    return mapa;
  }, [filas]);

  const grupos = useMemo(() => Array.from(porGrupo.keys()).sort(), [porGrupo]);

  if (grupoActivo && porGrupo.has(grupoActivo)) {
    return (
      <Stack gap="md">
        <Button variant="subtle" size="sm" leftSection={<IconArrowLeft size={16} />} onClick={() => setGrupoActivo(null)} style={{ alignSelf: 'flex-start' }}>
          Volver a grupos
        </Button>
        <Title order={5}>{grupoActivo}</Title>
        <TablaComparacionIvaCafeteria filas={porGrupo.get(grupoActivo) ?? []} />
      </Stack>
    );
  }

  if (grupos.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No hay productos que comparar aquí.
      </Text>
    );
  }

  return (
    <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="md">
      {grupos.map((grupo) => {
        const items = porGrupo.get(grupo) ?? [];
        const montoCortesiaGrupo = items.reduce((acc, f) => acc + (f.monto_cortesia ?? 0), 0);
        const conCortesia = items.filter((f) => (f.monto_cortesia ?? 0) > 0.01).length;
        return (
          <UnstyledButton key={grupo} onClick={() => setGrupoActivo(grupo)}>
            <Card withBorder radius="md" p="md" style={{ borderLeft: '3px solid var(--mantine-color-teal-6)', height: '100%' }}>
              <Stack gap={6}>
                <Text size="sm" fw={600} lineClamp={2}>
                  {grupo}
                </Text>
                <Text size="xs" c="dimmed">
                  {items.length} producto(s)
                </Text>
                <Text size="sm" fw={700} style={{ fontVariantNumeric: 'tabular-nums' }} c={montoCortesiaGrupo > 0.01 ? SEMANTIC_COLORS.error : undefined}>
                  {formatoMoneda.format(montoCortesiaGrupo)}
                </Text>
                {conCortesia > 0 && (
                  <Badge size="xs" variant="light" color="red" leftSection={<IconAlertTriangle size={12} />}>
                    {conCortesia} con cortesía
                  </Badge>
                )}
              </Stack>
            </Card>
          </UnstyledButton>
        );
      })}
    </SimpleGrid>
  );
}

function PanelComparacionIvaCafeteria() {
  const [periodoVer, setPeriodoVer] = useState<string | null>(null);
  const [soloConCortesia, setSoloConCortesia] = useState(true);

  const periodos = usePeriodosProductosVendidosCafeteria();

  const periodoActivo = periodoVer ?? periodos.data?.periodos[0]?.periodo ?? null;
  const cortesias = useCortesiasProductosVendidosCafeteria(periodoActivo);

  const filasComparacion = cortesias.data?.comparacion ?? [];
  const filasMostradas = soloConCortesia
    ? filasComparacion.filter((f) => (f.monto_cortesia ?? 0) > 0.01)
    : filasComparacion;

  return (
    <Stack gap="lg">
      <Card withBorder radius="md" p="lg">
        <Stack gap="md">
          <div>
            <Title order={4}>Posibles cortesías</Title>
            <Text size="sm" c="dimmed">
              Calculado directo de Productos Vendidos: Impuesto ÷ 0.16 da el ingreso real implícito — la diferencia
              contra el Subtotal registrado es una posible cortesía, expresada también en piezas usando el Costo.
              No hace falta subir ningún archivo aquí.
            </Text>
          </div>

          {periodos.data && periodos.data.periodos.length > 0 ? (
            <Group>
              {periodos.data.periodos.map((p) => (
                <Button
                  key={p.periodo}
                  size="xs"
                  variant={p.periodo === periodoActivo ? 'filled' : 'default'}
                  color="teal"
                  onClick={() => setPeriodoVer(p.periodo)}
                >
                  {p.periodo} ({p.total})
                </Button>
              ))}
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              Todavía no hay ningún periodo de Productos Vendidos guardado.
            </Text>
          )}

          {periodoActivo && (
            <>
              <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="md">
                <StatCard
                  title="Monto total de cortesía"
                  value={cortesias.data?.total_monto_cortesia ?? 0}
                  icon={IconReceiptTax}
                  color={(cortesias.data?.total_monto_cortesia ?? 0) > 0.01 ? 'warning' : 'success'}
                  description={periodoActivo}
                  formatValue={(v) => formatoMoneda.format(v)}
                />
                <StatCard
                  title="Piezas de cortesía"
                  value={cortesias.data?.total_cantidad_cortesia ?? 0}
                  icon={IconAlertTriangle}
                  color={(cortesias.data?.total_cantidad_cortesia ?? 0) > 0 ? 'warning' : 'success'}
                  description="Estimado (monto ÷ costo)"
                />
                <StatCard
                  title="Productos con cortesía"
                  value={cortesias.data?.productos_con_cortesia ?? 0}
                  icon={IconListDetails}
                  color="info"
                  description={`De ${filasComparacion.length} en total`}
                />
              </SimpleGrid>

              <Group justify="space-between">
                <Text size="sm" fw={600}>
                  Detalle por producto
                </Text>
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={() => setSoloConCortesia((v) => !v)}
                >
                  {soloConCortesia ? 'Mostrar todos' : 'Mostrar solo con cortesía'}
                </Button>
              </Group>

              {cortesias.isLoading ? (
                <Text size="sm" c="dimmed">Cargando...</Text>
              ) : filasMostradas.length === 0 ? (
                <Text size="sm" c="dimmed">
                  {soloConCortesia ? 'No hay indicios de cortesía — todo cuadra.' : 'No hay productos que mostrar.'}
                </Text>
              ) : (
                <PanelGruposComparacionIvaCafeteria filas={filasMostradas} />
              )}
            </>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}

// ════════════════════════════════════════════════════════════════════
// Productos Vendidos + Comparación IVA — Carreta de Mariscos (3 niveles:
// Categoría → Grupo → Tabla; tiene categoria_tipo pero no seccion_menu).
// Mismo criterio que Restaurante, con el nivel de Sección quitado.
// ════════════════════════════════════════════════════════════════════

function TablaProductosVendidosCarretaMariscos({
  productos,
  ivaFactor,
  pctCostoObjetivo,
}: {
  productos: ProductoVendidoCarretaMariscos[];
  ivaFactor: number;
  pctCostoObjetivo: number;
}) {
  const totalCosto = productos.reduce((acc, p) => acc + (p.total_costo ?? 0), 0);
  const totalDescuento = productos.reduce((acc, p) => acc + (p.descuento ?? 0), 0);
  const totalSubtotal = productos.reduce((acc, p) => acc + (p.subtotal ?? 0), 0);
  const totalImpuesto = productos.reduce((acc, p) => acc + (p.impuesto ?? 0), 0);
  const totalGeneral = productos.reduce((acc, p) => acc + (p.total ?? 0), 0);

  return (
    <Card withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
      <Table.ScrollContainer minWidth={860}>
        <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
          <Table.Thead
            style={{
              background: 'var(--mantine-color-default-hover)',
              borderBottom: '2px solid var(--mantine-color-default-border)',
            }}
          >
            <Table.Tr>
              {['Producto', 'Clasificación', '% Costo', 'Costo', 'Venta', 'Cant.', 'Tot. Costo', 'Descuento', 'Subtotal', 'Impuesto', 'TOTAL'].map(
                (encabezado, i) => (
                  <Table.Th
                    key={encabezado}
                    ta={i >= 2 ? 'right' : undefined}
                    style={{ fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--mantine-color-dimmed)' }}
                  >
                    {encabezado}
                  </Table.Th>
                ),
              )}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {productos.map((p) => (
              <Table.Tr key={p.id}>
                <Table.Td>
                  <Text size="sm" fw={500}>
                    {p.nombre_producto}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {p.producto_catalogo_encontrado ? (
                    p.categoria_tipo && (
                      <Badge size="xs" variant="light" color="gray">
                        {p.categoria_tipo}
                      </Badge>
                    )
                  ) : (
                    <Badge size="xs" variant="light" color="red" leftSection={<IconAlertTriangle size={12} />}>
                      No encontrado en catálogo
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td ta="right">
                  {(() => {
                    const pct = pctCostoCatalogo(p.costo_catalogo, p.precio_venta_catalogo, ivaFactor);
                    return pct !== null ? (
                      <Badge size="sm" variant="light" color={colorPorEstadoCosteo(pct <= pctCostoObjetivo)} style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatoPct(pct)}
                      </Badge>
                    ) : (
                      <Text size="sm" c="dimmed" ta="right">—</Text>
                    );
                  })()}
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.costo !== null ? formatoMoneda.format(p.costo) : '—'}
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.precio_venta !== null ? formatoMoneda.format(p.precio_venta) : '—'}
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.cantidad !== null ? Math.round(p.cantidad) : '—'}
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.total_costo !== null ? formatoMoneda.format(p.total_costo) : '—'}
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.descuento !== null ? formatoMoneda.format(p.descuento) : '—'}
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.subtotal !== null ? formatoMoneda.format(p.subtotal) : '—'}
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {p.impuesto !== null ? formatoMoneda.format(p.impuesto) : '—'}
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }} fw={600}>
                  {p.total !== null ? formatoMoneda.format(p.total) : '—'}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
          <Table.Tfoot>
            <Table.Tr style={{ borderTop: '2px solid var(--mantine-color-cyan-6)', background: 'var(--mantine-color-default-hover)' }}>
              <Table.Th colSpan={6}>TOTAL</Table.Th>
              <Table.Th ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatoMoneda.format(totalCosto)}
              </Table.Th>
              <Table.Th ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatoMoneda.format(totalDescuento)}
              </Table.Th>
              <Table.Th ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatoMoneda.format(totalSubtotal)}
              </Table.Th>
              <Table.Th ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatoMoneda.format(totalImpuesto)}
              </Table.Th>
              <Table.Th ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatoMoneda.format(totalGeneral)}
              </Table.Th>
            </Table.Tr>
          </Table.Tfoot>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );
}

function agruparProductosVendidosCarretaMariscosPorCategoria(
  productos: ProductoVendidoCarretaMariscos[],
): Map<string, ProductoVendidoCarretaMariscos[]> {
  const mapa = new Map<string, ProductoVendidoCarretaMariscos[]>();
  for (const p of productos) {
    if (!p.categoria_tipo) continue;
    const lista = mapa.get(p.categoria_tipo) ?? [];
    lista.push(p);
    mapa.set(p.categoria_tipo, lista);
  }
  return mapa;
}

// Nivel 3 — cuadrícula de tarjetas por grupo.
function PanelGruposProductosVendidosCarretaMariscos({
  productos,
  ivaFactor,
  pctCostoObjetivo,
}: {
  productos: ProductoVendidoCarretaMariscos[];
  ivaFactor: number;
  pctCostoObjetivo: number;
}) {
  const [grupoActivo, setGrupoActivo] = useState<string | null>(null);

  const porGrupo = useMemo(() => {
    const mapa = new Map<string, ProductoVendidoCarretaMariscos[]>();
    for (const p of productos) {
      const lista = mapa.get(p.grupo) ?? [];
      lista.push(p);
      mapa.set(p.grupo, lista);
    }
    return mapa;
  }, [productos]);

  const grupos = useMemo(() => Array.from(porGrupo.keys()).sort(), [porGrupo]);

  const exportar = useExportarProductosVendidosCarretaMariscos();

  const executeExportarGrupo = (grupo: string, periodo: string) => {
    exportar.mutate(
      { periodo, grupo },
      {
        onSuccess: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `ProductosVendidosCarretaMariscos_${periodo}_${grupo}.xlsx`.replace(/\s+/g, '_');
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.URL.revokeObjectURL(url);
        },
        onError: (err: any) => {
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

  if (grupoActivo && porGrupo.has(grupoActivo)) {
    const itemsGrupo = porGrupo.get(grupoActivo) ?? [];
    const periodo = itemsGrupo[0]?.periodo;
    return (
      <Stack gap="md">
        <Group justify="space-between">
          <Button variant="subtle" size="sm" leftSection={<IconArrowLeft size={16} />} onClick={() => setGrupoActivo(null)} style={{ alignSelf: 'flex-start' }}>
            Volver a grupos
          </Button>
          {periodo && (
            <Button
              variant="light"
              size="sm"
              leftSection={<IconFileSpreadsheet size={16} />}
              loading={exportar.isPending}
              onClick={() => executeExportarGrupo(grupoActivo, periodo)}
            >
              Exportar grupo
            </Button>
          )}
        </Group>
        <Title order={5}>{grupoActivo}</Title>
        <TablaProductosVendidosCarretaMariscos productos={itemsGrupo} ivaFactor={ivaFactor} pctCostoObjetivo={pctCostoObjetivo} />
      </Stack>
    );
  }

  if (grupos.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No hay productos vendidos guardados para este periodo.
      </Text>
    );
  }

  return (
    <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="md">
      {grupos.map((grupo) => {
        const items = porGrupo.get(grupo) ?? [];
        const totalGrupo = items.reduce((acc, p) => acc + (p.total ?? 0), 0);
        const sinMatch = items.filter((p) => !p.producto_catalogo_encontrado).length;

        const conCosteo = items.filter((p) => p.costo_catalogo !== null && p.precio_venta_catalogo !== null && p.precio_venta_catalogo !== 0);
        const sumaCosto = conCosteo.reduce((acc, p) => acc + (p.costo_catalogo ?? 0), 0);
        const sumaVenta = conCosteo.reduce((acc, p) => acc + (p.precio_venta_catalogo ?? 0), 0);
        const pctCostoGrupo = conCosteo.length > 0 && sumaVenta > 0 ? sumaCosto / (sumaVenta / ivaFactor) : null;

        return (
          <UnstyledButton key={grupo} onClick={() => setGrupoActivo(grupo)}>
            <Card withBorder radius="md" p="md" style={{ borderLeft: '3px solid var(--mantine-color-cyan-6)', height: '100%' }}>
              <Stack gap={6}>
                <Text size="sm" fw={600} lineClamp={2}>
                  {grupo}
                </Text>
                <Text size="xs" c="dimmed">
                  {items.length} producto(s)
                </Text>
                <Text size="sm" fw={700} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatoMoneda.format(totalGrupo)}
                </Text>
                {pctCostoGrupo !== null && (
                  <Badge size="xs" variant="light" color={colorPorEstadoCosteo(pctCostoGrupo <= pctCostoObjetivo)}>
                    % Costo: {formatoPct(pctCostoGrupo)}
                  </Badge>
                )}
                {sinMatch > 0 && (
                  <Badge size="xs" variant="light" color="red" leftSection={<IconAlertTriangle size={12} />}>
                    {sinMatch} sin match
                  </Badge>
                )}
              </Stack>
            </Card>
          </UnstyledButton>
        );
      })}
    </SimpleGrid>
  );
}

// Nivel 2 — pestañas por categoria_tipo, más "Sin clasificar" para los
// productos sin match contra el catálogo (categoria_tipo en null).
function PanelCategoriaProductosVendidosCarretaMariscos({
  productos,
  ivaFactor,
  pctCostoObjetivo,
}: {
  productos: ProductoVendidoCarretaMariscos[];
  ivaFactor: number;
  pctCostoObjetivo: number;
}) {
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null);

  const productosPorCategoria = useMemo(() => agruparProductosVendidosCarretaMariscosPorCategoria(productos), [productos]);
  const productosSinClasificar = useMemo(() => productos.filter((p) => !p.producto_catalogo_encontrado), [productos]);

  const categoriasConDatos = CATEGORIAS_TIPO.filter((cat) => (productosPorCategoria.get(cat.clave)?.length ?? 0) > 0);

  const categoriaMostrada =
    categoriaActiva && (categoriasConDatos.some((cat) => cat.clave === categoriaActiva) || categoriaActiva === 'sin-clasificar')
      ? categoriaActiva
      : (categoriasConDatos[0]?.clave ?? (productosSinClasificar.length > 0 ? 'sin-clasificar' : null));

  if (categoriasConDatos.length === 0 && productosSinClasificar.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No hay productos vendidos guardados para este periodo.
      </Text>
    );
  }

  return (
    <Tabs value={categoriaMostrada} onChange={setCategoriaActiva} variant="pills" keepMounted={false}>
      <Tabs.List>
        {categoriasConDatos.map((cat) => (
          <Tabs.Tab
            key={cat.clave}
            value={cat.clave}
            color={cat.color}
            leftSection={<cat.icono size={16} />}
            rightSection={
              <Badge size="sm" variant="light" color={cat.clave === categoriaMostrada ? 'white' : cat.color}>
                {productosPorCategoria.get(cat.clave)?.length ?? 0}
              </Badge>
            }
          >
            {cat.etiqueta}
          </Tabs.Tab>
        ))}
        {productosSinClasificar.length > 0 && (
          <Tabs.Tab
            value="sin-clasificar"
            color="red"
            leftSection={<IconAlertTriangle size={16} />}
            rightSection={
              <Badge size="sm" variant="light" color={categoriaMostrada === 'sin-clasificar' ? 'white' : 'red'}>
                {productosSinClasificar.length}
              </Badge>
            }
          >
            Sin clasificar
          </Tabs.Tab>
        )}
      </Tabs.List>

      {categoriasConDatos.map((cat) => (
        <Tabs.Panel key={cat.clave} value={cat.clave} pt="md">
          <PanelGruposProductosVendidosCarretaMariscos
            productos={productosPorCategoria.get(cat.clave) ?? []}
            ivaFactor={ivaFactor}
            pctCostoObjetivo={pctCostoObjetivo}
          />
        </Tabs.Panel>
      ))}
      {productosSinClasificar.length > 0 && (
        <Tabs.Panel value="sin-clasificar" pt="md">
          <PanelGruposProductosVendidosCarretaMariscos productos={productosSinClasificar} ivaFactor={ivaFactor} pctCostoObjetivo={pctCostoObjetivo} />
        </Tabs.Panel>
      )}
    </Tabs>
  );
}

function PanelProductosVendidosCarretaMariscos() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [mesArchivo, setMesArchivo] = useState<Date | null>(null);
  const [modalReemplazoAbierto, setModalReemplazoAbierto] = useState(false);
  const [totalExistentesReemplazo, setTotalExistentesReemplazo] = useState(0);
  const [modalEliminarAbierto, setModalEliminarAbierto] = useState(false);
  const [periodoVer, setPeriodoVer] = useState<string | null>(null);
  const [mostrarSubirManual, setMostrarSubirManual] = useState<boolean | null>(null);

  const subir = useSubirProductosVendidosCarretaMariscos();
  const periodos = usePeriodosProductosVendidosCarretaMariscos();
  const eliminar = useEliminarProductosVendidosCarretaMariscos();
  const exportar = useExportarProductosVendidosCarretaMariscos();
  const configuracionCosteo = useConfiguracionCosteoCarretaMariscos();
  const ivaFactor = configuracionCosteo.data?.configuracion.iva_factor ?? 1.16;
  const pctCostoObjetivo = configuracionCosteo.data?.configuracion.pct_costo_objetivo ?? 0.28;

  const periodoActivo = periodoVer ?? periodos.data?.periodos[0]?.periodo ?? null;
  const datos = useProductosVendidosCarretaMariscos(periodoActivo);
  const hayPeriodos = (periodos.data?.periodos.length ?? 0) > 0;
  const mostrarSubir = mostrarSubirManual ?? !hayPeriodos;

  const executeExportarTodo = () => {
    if (!periodoActivo) return;
    exportar.mutate(
      { periodo: periodoActivo },
      {
        onSuccess: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `ProductosVendidosCarretaMariscos_${periodoActivo}.xlsx`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.URL.revokeObjectURL(url);
        },
        onError: (err: any) => {
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

  const periodoArchivoTexto = mesArchivo
    ? `${mesArchivo.getFullYear()}-${String(mesArchivo.getMonth() + 1).padStart(2, '0')}`
    : null;

  const executeSubir = (confirmarReemplazo = false) => {
    if (!archivo || !periodoArchivoTexto) return;

    subir.mutate(
      { file: archivo, periodo: periodoArchivoTexto, confirmarReemplazo },
      {
        onSuccess: (data) => {
          if ('requiere_confirmacion' in data) {
            setTotalExistentesReemplazo(data.total_existentes);
            setModalReemplazoAbierto(true);
            return;
          }
          setModalReemplazoAbierto(false);
          setArchivo(null);
          setPeriodoVer(data.periodo);
          setMostrarSubirManual(false);
          notifications.show({
            title: 'Productos Vendidos guardado',
            message: `${data.total} producto(s) guardado(s) en ${Object.keys(data.por_grupo).length} grupo(s)${
              data.sin_match_catalogo > 0 ? ` — ${data.sin_match_catalogo} sin match en catálogo` : ''
            }.`,
            color: data.sin_match_catalogo > 0 ? 'orange' : 'green',
            icon: <IconCheck size={16} />,
          });
        },
        onError: (err: any) => {
          notifications.show({
            title: 'Error al guardar Productos Vendidos',
            message: err.response?.data?.detail || 'Ocurrió un error al procesar el archivo.',
            color: 'red',
            icon: <IconX size={16} />,
          });
        },
      },
    );
  };

  const productos = datos.data?.productos ?? [];
  const totalVentas = productos.reduce((acc, p) => acc + (p.total ?? 0), 0);
  const totalSubtotal = productos.reduce((acc, p) => acc + (p.subtotal ?? 0), 0);
  const totalDescuento = productos.reduce((acc, p) => acc + (p.descuento ?? 0), 0);
  const sinMatchCatalogo = productos.filter((p) => !p.producto_catalogo_encontrado).length;

  return (
    <Stack gap="lg">
      <Card withBorder radius="md" p={mostrarSubir ? 'lg' : 'sm'}>
        <Stack gap={mostrarSubir ? 'md' : 0}>
          <UnstyledButton onClick={() => setMostrarSubirManual(!mostrarSubir)}>
            <Group justify="space-between">
              <Group gap="xs">
                <ThemeIcon size={28} radius="md" variant="light" color="cyan">
                  <IconUpload size={16} />
                </ThemeIcon>
                <Text fw={600} size={mostrarSubir ? 'md' : 'sm'}>
                  {mostrarSubir ? 'Subir Productos Vendidos' : 'Actualizar Productos Vendidos'}
                </Text>
              </Group>
              <ActionIcon variant="subtle" color="gray" size="sm">
                {mostrarSubir ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
              </ActionIcon>
            </Group>
          </UnstyledButton>
          <Collapse in={mostrarSubir}>
            <Stack gap="md" pt="xs">
              <Group align="flex-start" grow>
                <MonthPickerInput
                  label="Periodo del archivo"
                  placeholder="Selecciona mes y año"
                  value={mesArchivo}
                  onChange={setMesArchivo}
                  valueFormat="MMMM YYYY"
                />
                <ArchivoDropzone
                  titulo="Reporte de Productos Vendidos"
                  descripcion="Excel exportado del POS (bloques por grupo)."
                  file={archivo}
                  onDrop={setArchivo}
                  onRemove={() => setArchivo(null)}
                />
              </Group>
              {archivo && periodoArchivoTexto && (
                <Group justify="flex-end">
                  <Button onClick={() => executeSubir(false)} loading={subir.isPending}>
                    Guardar Productos Vendidos
                  </Button>
                </Group>
              )}
            </Stack>
          </Collapse>
        </Stack>
      </Card>

      <Card withBorder radius="md" p="lg">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Group gap="xs">
              <ThemeIcon size={28} radius="md" variant="light" color="cyan">
                <IconShoppingCart size={16} />
              </ThemeIcon>
              <Title order={4}>Productos Vendidos guardados</Title>
            </Group>
            {periodoActivo && (
              <Group gap="xs">
                <Button
                  variant="light"
                  size="xs"
                  leftSection={<IconFileSpreadsheet size={14} />}
                  loading={exportar.isPending}
                  onClick={executeExportarTodo}
                >
                  Exportar todo
                </Button>
                <Button
                  variant="subtle"
                  color="red"
                  size="xs"
                  leftSection={<IconTrash size={14} />}
                  onClick={() => setModalEliminarAbierto(true)}
                >
                  Eliminar periodo
                </Button>
              </Group>
            )}
          </Group>

          <Divider />

          {periodos.data && periodos.data.periodos.length > 0 ? (
            <Group gap="sm" align="center">
              <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                Periodo:
              </Text>
              <Group gap="xs">
                {periodos.data.periodos.map((p) => (
                  <Button
                    key={p.periodo}
                    size="xs"
                    variant={p.periodo === periodoActivo ? 'filled' : 'default'}
                    color="cyan"
                    onClick={() => setPeriodoVer(p.periodo)}
                  >
                    {p.periodo} ({p.total})
                  </Button>
                ))}
              </Group>
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              Todavía no hay ningún periodo guardado.
            </Text>
          )}

          {periodoActivo && (
            <>
              <Divider />

              <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="md">
                <StatCard
                  title="Total vendido"
                  value={totalVentas}
                  icon={IconShoppingCart}
                  color="brand"
                  description={`${periodoActivo} · incluye Impuesto`}
                  formatValue={(v) => formatoMoneda.format(v)}
                />
                <StatCard
                  title="Subtotal (ganancia real)"
                  value={totalSubtotal}
                  icon={IconReceiptTax}
                  color="success"
                  description="Total sin Impuesto"
                  formatValue={(v) => formatoMoneda.format(v)}
                />
                <StatCard
                  title="Descuento"
                  value={totalDescuento}
                  icon={IconGift}
                  color="secondary"
                  description="Total del periodo"
                  formatValue={(v) => formatoMoneda.format(v)}
                />
                <StatCard
                  title="Productos"
                  value={productos.length}
                  icon={IconListDetails}
                  color="info"
                  description="Filas guardadas"
                />
                <StatCard
                  title="Sin match en catálogo"
                  value={sinMatchCatalogo}
                  icon={IconAlertTriangle}
                  color={sinMatchCatalogo > 0 ? 'error' : 'success'}
                  description="Pendientes de revisar"
                />
              </SimpleGrid>

              <Divider />

              {datos.isLoading ? (
                <Text size="sm" c="dimmed">Cargando...</Text>
              ) : (
                <PanelCategoriaProductosVendidosCarretaMariscos productos={productos} ivaFactor={ivaFactor} pctCostoObjetivo={pctCostoObjetivo} />
              )}
            </>
          )}
        </Stack>
      </Card>

      <Modal
        opened={modalReemplazoAbierto}
        onClose={() => setModalReemplazoAbierto(false)}
        title={<Text fw={600} c="red">Confirmar reemplazo</Text>}
      >
        <Stack gap="md">
          <Text size="sm">
            Ya existen {totalExistentesReemplazo} producto(s) guardados para el periodo {periodoArchivoTexto}. Si
            continúas, se reemplazarán todos por el contenido del archivo actual.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setModalReemplazoAbierto(false)}>
              Cancelar
            </Button>
            <Button color="red" loading={subir.isPending} onClick={() => executeSubir(true)}>
              Reemplazar
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={modalEliminarAbierto}
        onClose={() => setModalEliminarAbierto(false)}
        title={<Text fw={600} c="red">Eliminar periodo</Text>}
      >
        <Stack gap="md">
          <Text size="sm">
            ¿Eliminar todos los productos vendidos guardados para el periodo {periodoActivo}? Esta acción no se puede
            deshacer.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setModalEliminarAbierto(false)}>
              Cancelar
            </Button>
            <Button
              color="red"
              loading={eliminar.isPending}
              onClick={() => {
                if (!periodoActivo) return;
                eliminar.mutate(periodoActivo, {
                  onSuccess: () => {
                    setModalEliminarAbierto(false);
                    setPeriodoVer(null);
                  },
                });
              }}
            >
              Eliminar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

function TablaComparacionIvaCarretaMariscos({ filas }: { filas: FilaCortesiaProductoVendidoCarretaMariscos[] }) {
  return (
    <Card withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
      <Table.ScrollContainer minWidth={860}>
        <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
          <Table.Thead
            style={{
              background: 'var(--mantine-color-default-hover)',
              borderBottom: '2px solid var(--mantine-color-default-border)',
            }}
          >
            <Table.Tr>
              {['Producto', 'Grupo', 'Subtotal', 'Impuesto', 'Ingreso real', 'Monto cortesía', 'Piezas'].map(
                (encabezado, i) => (
                  <Table.Th
                    key={encabezado}
                    ta={i >= 2 ? 'right' : undefined}
                    style={{ fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--mantine-color-dimmed)' }}
                  >
                    {encabezado}
                  </Table.Th>
                ),
              )}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filas.map((f, i) => {
              const sinDatos = f.monto_cortesia === null;
              const conCortesia = (f.monto_cortesia ?? 0) > 0.01;
              return (
                <Table.Tr
                  key={`${f.nombre_producto}-${i}`}
                  style={conCortesia ? { background: 'var(--mantine-color-red-light)' } : undefined}
                >
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {f.nombre_producto}
                    </Text>
                    {sinDatos && (
                      <Text size="xs" c="dimmed">
                        Falta Impuesto — vuelve a subir este periodo
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      {f.grupo}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {f.subtotal !== null ? formatoMoneda.format(f.subtotal) : '—'}
                  </Table.Td>
                  <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {f.impuesto !== null ? formatoMoneda.format(f.impuesto) : '—'}
                  </Table.Td>
                  <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {f.ingreso_real !== null ? formatoMoneda.format(f.ingreso_real) : '—'}
                  </Table.Td>
                  <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }} fw={600}>
                    <Text c={conCortesia ? SEMANTIC_COLORS.error : undefined} size="sm" fw={600}>
                      {f.monto_cortesia !== null ? formatoMoneda.format(f.monto_cortesia) : '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {f.cantidad_cortesia !== null ? f.cantidad_cortesia : '—'}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );
}

function PanelGruposComparacionIvaCarretaMariscos({ filas }: { filas: FilaCortesiaProductoVendidoCarretaMariscos[] }) {
  const [grupoActivo, setGrupoActivo] = useState<string | null>(null);

  const porGrupo = useMemo(() => {
    const mapa = new Map<string, FilaCortesiaProductoVendidoCarretaMariscos[]>();
    for (const f of filas) {
      const lista = mapa.get(f.grupo) ?? [];
      lista.push(f);
      mapa.set(f.grupo, lista);
    }
    return mapa;
  }, [filas]);

  const grupos = useMemo(() => Array.from(porGrupo.keys()).sort(), [porGrupo]);

  if (grupoActivo && porGrupo.has(grupoActivo)) {
    return (
      <Stack gap="md">
        <Button variant="subtle" size="sm" leftSection={<IconArrowLeft size={16} />} onClick={() => setGrupoActivo(null)} style={{ alignSelf: 'flex-start' }}>
          Volver a grupos
        </Button>
        <Title order={5}>{grupoActivo}</Title>
        <TablaComparacionIvaCarretaMariscos filas={porGrupo.get(grupoActivo) ?? []} />
      </Stack>
    );
  }

  if (grupos.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No hay productos que comparar aquí.
      </Text>
    );
  }

  return (
    <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="md">
      {grupos.map((grupo) => {
        const items = porGrupo.get(grupo) ?? [];
        const montoCortesiaGrupo = items.reduce((acc, f) => acc + (f.monto_cortesia ?? 0), 0);
        const conCortesia = items.filter((f) => (f.monto_cortesia ?? 0) > 0.01).length;
        return (
          <UnstyledButton key={grupo} onClick={() => setGrupoActivo(grupo)}>
            <Card withBorder radius="md" p="md" style={{ borderLeft: '3px solid var(--mantine-color-cyan-6)', height: '100%' }}>
              <Stack gap={6}>
                <Text size="sm" fw={600} lineClamp={2}>
                  {grupo}
                </Text>
                <Text size="xs" c="dimmed">
                  {items.length} producto(s)
                </Text>
                <Text size="sm" fw={700} style={{ fontVariantNumeric: 'tabular-nums' }} c={montoCortesiaGrupo > 0.01 ? SEMANTIC_COLORS.error : undefined}>
                  {formatoMoneda.format(montoCortesiaGrupo)}
                </Text>
                {conCortesia > 0 && (
                  <Badge size="xs" variant="light" color="red" leftSection={<IconAlertTriangle size={12} />}>
                    {conCortesia} con cortesía
                  </Badge>
                )}
              </Stack>
            </Card>
          </UnstyledButton>
        );
      })}
    </SimpleGrid>
  );
}

function PanelCategoriaComparacionIvaCarretaMariscos({ filas }: { filas: FilaCortesiaProductoVendidoCarretaMariscos[] }) {
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null);

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, FilaCortesiaProductoVendidoCarretaMariscos[]>();
    for (const f of filas) {
      if (!f.categoria_tipo) continue;
      const lista = mapa.get(f.categoria_tipo) ?? [];
      lista.push(f);
      mapa.set(f.categoria_tipo, lista);
    }
    return mapa;
  }, [filas]);

  const sinClasificar = useMemo(() => filas.filter((f) => !f.categoria_tipo), [filas]);

  const categoriasConDatos = CATEGORIAS_TIPO.filter((cat) => (porCategoria.get(cat.clave)?.length ?? 0) > 0);

  const categoriaMostrada =
    categoriaActiva && (categoriasConDatos.some((cat) => cat.clave === categoriaActiva) || categoriaActiva === 'sin-clasificar')
      ? categoriaActiva
      : (categoriasConDatos[0]?.clave ?? (sinClasificar.length > 0 ? 'sin-clasificar' : null));

  if (categoriasConDatos.length === 0 && sinClasificar.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No hay productos que comparar.
      </Text>
    );
  }

  return (
    <Tabs value={categoriaMostrada} onChange={setCategoriaActiva} variant="pills" keepMounted={false}>
      <Tabs.List>
        {categoriasConDatos.map((cat) => (
          <Tabs.Tab
            key={cat.clave}
            value={cat.clave}
            color={cat.color}
            leftSection={<cat.icono size={16} />}
            rightSection={
              <Badge size="sm" variant="light" color={cat.clave === categoriaMostrada ? 'white' : cat.color}>
                {porCategoria.get(cat.clave)?.length ?? 0}
              </Badge>
            }
          >
            {cat.etiqueta}
          </Tabs.Tab>
        ))}
        {sinClasificar.length > 0 && (
          <Tabs.Tab
            value="sin-clasificar"
            color="red"
            leftSection={<IconAlertTriangle size={16} />}
            rightSection={
              <Badge size="sm" variant="light" color={categoriaMostrada === 'sin-clasificar' ? 'white' : 'red'}>
                {sinClasificar.length}
              </Badge>
            }
          >
            Sin clasificar
          </Tabs.Tab>
        )}
      </Tabs.List>

      {categoriasConDatos.map((cat) => (
        <Tabs.Panel key={cat.clave} value={cat.clave} pt="md">
          <PanelGruposComparacionIvaCarretaMariscos filas={porCategoria.get(cat.clave) ?? []} />
        </Tabs.Panel>
      ))}
      {sinClasificar.length > 0 && (
        <Tabs.Panel value="sin-clasificar" pt="md">
          <PanelGruposComparacionIvaCarretaMariscos filas={sinClasificar} />
        </Tabs.Panel>
      )}
    </Tabs>
  );
}

function PanelComparacionIvaCarretaMariscos() {
  const [periodoVer, setPeriodoVer] = useState<string | null>(null);
  const [soloConCortesia, setSoloConCortesia] = useState(true);

  const periodos = usePeriodosProductosVendidosCarretaMariscos();

  const periodoActivo = periodoVer ?? periodos.data?.periodos[0]?.periodo ?? null;
  const cortesias = useCortesiasProductosVendidosCarretaMariscos(periodoActivo);

  const filasComparacion = cortesias.data?.comparacion ?? [];
  const filasMostradas = soloConCortesia
    ? filasComparacion.filter((f) => (f.monto_cortesia ?? 0) > 0.01)
    : filasComparacion;

  return (
    <Stack gap="lg">
      <Card withBorder radius="md" p="lg">
        <Stack gap="md">
          <div>
            <Title order={4}>Posibles cortesías</Title>
            <Text size="sm" c="dimmed">
              Calculado directo de Productos Vendidos: Impuesto ÷ 0.16 da el ingreso real implícito — la diferencia
              contra el Subtotal registrado es una posible cortesía, expresada también en piezas usando el Costo.
              No hace falta subir ningún archivo aquí.
            </Text>
          </div>

          {periodos.data && periodos.data.periodos.length > 0 ? (
            <Group>
              {periodos.data.periodos.map((p) => (
                <Button
                  key={p.periodo}
                  size="xs"
                  variant={p.periodo === periodoActivo ? 'filled' : 'default'}
                  color="cyan"
                  onClick={() => setPeriodoVer(p.periodo)}
                >
                  {p.periodo} ({p.total})
                </Button>
              ))}
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              Todavía no hay ningún periodo de Productos Vendidos guardado.
            </Text>
          )}

          {periodoActivo && (
            <>
              <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="md">
                <StatCard
                  title="Monto total de cortesía"
                  value={cortesias.data?.total_monto_cortesia ?? 0}
                  icon={IconReceiptTax}
                  color={(cortesias.data?.total_monto_cortesia ?? 0) > 0.01 ? 'warning' : 'success'}
                  description={periodoActivo}
                  formatValue={(v) => formatoMoneda.format(v)}
                />
                <StatCard
                  title="Piezas de cortesía"
                  value={cortesias.data?.total_cantidad_cortesia ?? 0}
                  icon={IconAlertTriangle}
                  color={(cortesias.data?.total_cantidad_cortesia ?? 0) > 0 ? 'warning' : 'success'}
                  description="Estimado (monto ÷ costo)"
                />
                <StatCard
                  title="Productos con cortesía"
                  value={cortesias.data?.productos_con_cortesia ?? 0}
                  icon={IconListDetails}
                  color="info"
                  description={`De ${filasComparacion.length} en total`}
                />
              </SimpleGrid>

              <Group justify="space-between">
                <Text size="sm" fw={600}>
                  Detalle por producto
                </Text>
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={() => setSoloConCortesia((v) => !v)}
                >
                  {soloConCortesia ? 'Mostrar todos' : 'Mostrar solo con cortesía'}
                </Button>
              </Group>

              {cortesias.isLoading ? (
                <Text size="sm" c="dimmed">Cargando...</Text>
              ) : filasMostradas.length === 0 ? (
                <Text size="sm" c="dimmed">
                  {soloConCortesia ? 'No hay indicios de cortesía — todo cuadra.' : 'No hay productos que mostrar.'}
                </Text>
              ) : (
                <PanelCategoriaComparacionIvaCarretaMariscos filas={filasMostradas} />
              )}
            </>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}

// Contenido completo del punto de venta Restaurante (Catálogo, Costeo,
// Productos Vendidos, Comparación IVA) — extraído del antiguo default
// export para poder montarlo/desmontarlo condicionalmente desde el menú de
// puntos de venta, con el mismo criterio que ya siguen PanelCafeteria y
// PanelCarretaMariscos.
function PanelRestaurante() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [modalReemplazoAbierto, setModalReemplazoAbierto] = useState(false);
  const [totalExistentesReemplazo, setTotalExistentesReemplazo] = useState(0);
  const [filtro, setFiltro] = useState('');
  const [filtroDebounced] = useDebouncedValue(filtro.trim(), 300);
  const [seccionActiva, setSeccionActiva] = useState<string | null>('Desayuno');
  const [mostrarSubirManual, setMostrarSubirManual] = useState<boolean | null>(null);
  const [vistaActiva, setVistaActiva] = useState<SeccionPosClave | null>(null);

  const guardarCatalogo = useGuardarCatalogoProductos();
  const catalogo = useCatalogoProductos();

  const hayCatalogo = (catalogo.data?.total ?? 0) > 0;
  const mostrarSubir = mostrarSubirManual ?? !hayCatalogo;

  const executeGuardarCatalogo = (confirmarReemplazo = false) => {
    if (!archivo) return;

    guardarCatalogo.mutate(
      { file: archivo, confirmarReemplazo },
      {
        onSuccess: (data) => {
          if ('requiere_confirmacion' in data) {
            setTotalExistentesReemplazo(data.total_existentes);
            setModalReemplazoAbierto(true);
            return;
          }
          setModalReemplazoAbierto(false);
          setArchivo(null);
          setMostrarSubirManual(false);
          notifications.show({
            title: 'Catálogo guardado',
            message: `${data.total} producto(s) guardado(s) en ${Object.keys(data.por_grupo).length} grupo(s) (${Object.keys(data.por_seccion).length} secciones de menú).`,
            color: 'green',
            icon: <IconCheck size={16} />,
          });
        },
        onError: (err: any) => {
          notifications.show({
            title: 'Error al guardar el catálogo',
            message: err.response?.data?.detail || 'Ocurrió un error al procesar el archivo.',
            color: 'red',
            icon: <IconX size={16} />,
          });
        },
      },
    );
  };

  const productosFiltrados = useMemo(() => {
    const productos = catalogo.data?.productos ?? [];
    if (!filtroDebounced) return productos;
    const texto = filtroDebounced.toLowerCase();
    return productos.filter((p) => p.nombre_producto.toLowerCase().includes(texto));
  }, [catalogo.data?.productos, filtroDebounced]);

  const productosPorSeccion = useMemo(() => agruparPor(productosFiltrados, 'seccion_menu'), [productosFiltrados]);

  const seccionesConDatos = SECCIONES_MENU.filter((sec) => (productosPorSeccion.get(sec.clave)?.length ?? 0) > 0);

  const seccionMostrada =
    seccionActiva && seccionesConDatos.some((sec) => sec.clave === seccionActiva)
      ? seccionActiva
      : (seccionesConDatos[0]?.clave ?? null);

  return (
    <>
      {vistaActiva === null ? (
        <PanelMenuSeccionesPos color="grape" onSeleccionar={setVistaActiva} />
      ) : (
        <Stack gap="lg">
          <Button
            variant="subtle"
            size="sm"
            leftSection={<IconArrowLeft size={16} />}
            onClick={() => setVistaActiva(null)}
            style={{ alignSelf: 'flex-start' }}
          >
            Volver a secciones
          </Button>

          {vistaActiva === 'catalogo' && (
            <Stack gap="lg">
              <Card withBorder radius="md" p={mostrarSubir ? 'lg' : 'sm'}>
                <Stack gap={mostrarSubir ? 'md' : 0}>
                  <UnstyledButton onClick={() => setMostrarSubirManual(!mostrarSubir)}>
                    <Group justify="space-between">
                      <Text fw={600} size={mostrarSubir ? 'md' : 'sm'}>
                        {mostrarSubir ? 'Subir catálogo' : 'Actualizar catálogo'}
                      </Text>
                      <ActionIcon variant="subtle" color="gray" size="sm">
                        {mostrarSubir ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                      </ActionIcon>
                    </Group>
                  </UnstyledButton>
                  <Collapse in={mostrarSubir}>
                    <Stack gap="md" pt="xs">
                      <ArchivoDropzone
                        titulo="Catálogo de productos"
                        descripcion="Excel de catálogo (columnas B, C, G, K, O, Q desde la fila 6)."
                        file={archivo}
                        onDrop={setArchivo}
                        onRemove={() => setArchivo(null)}
                      />
                      {archivo && (
                        <Group justify="flex-end">
                          <Button onClick={() => executeGuardarCatalogo(false)} loading={guardarCatalogo.isPending}>
                            Guardar catálogo
                          </Button>
                        </Group>
                      )}
                    </Stack>
                  </Collapse>
                </Stack>
              </Card>

              <Card withBorder radius="md" p="lg">
                <Stack gap="md">
                  <Group justify="space-between">
                    <Title order={4}>Catálogo guardado</Title>
                    <Badge variant="light" color="grape">
                      {catalogo.data?.total ?? 0} producto(s)
                    </Badge>
                  </Group>

                  <TextInput
                    placeholder="Buscar producto por nombre"
                    leftSection={<IconSearch size={16} />}
                    value={filtro}
                    onChange={(e) => setFiltro(e.currentTarget.value)}
                  />

                  {catalogo.isLoading && <Text size="sm" c="dimmed">Cargando...</Text>}

                  {!catalogo.isLoading && seccionesConDatos.length === 0 && (
                    <Text size="sm" c="dimmed">
                      Todavía no hay productos guardados.
                    </Text>
                  )}

                  {seccionesConDatos.length > 0 && (
                    <Tabs value={seccionMostrada} onChange={setSeccionActiva} variant="pills" color="dark" keepMounted={false}>
                      <Tabs.List>
                        {seccionesConDatos.map((sec) => (
                          <Tabs.Tab
                            key={sec.clave}
                            value={sec.clave}
                            color={sec.color}
                            leftSection={<sec.icono size={16} />}
                            rightSection={
                              <Badge size="sm" variant="light" color={sec.clave === seccionMostrada ? 'white' : sec.color}>
                                {productosPorSeccion.get(sec.clave)?.length ?? 0}
                              </Badge>
                            }
                          >
                            {sec.clave}
                          </Tabs.Tab>
                        ))}
                      </Tabs.List>

                      {seccionesConDatos.map((sec) => (
                        <Tabs.Panel key={sec.clave} value={sec.clave} pt="lg">
                          <PanelPorCategoria productos={productosPorSeccion.get(sec.clave) ?? []} />
                        </Tabs.Panel>
                      ))}
                    </Tabs>
                  )}
                </Stack>
              </Card>
            </Stack>
          )}

          {vistaActiva === 'costeo' && <PanelCosteoRecetas />}
          {vistaActiva === 'productos-vendidos' && <PanelProductosVendidos />}
          {vistaActiva === 'cortesia' && <PanelComparacionIva />}
          {vistaActiva === 'analisis' && <PanelAnalisisVentasRestaurante />}
        </Stack>
      )}

      <Modal
        opened={modalReemplazoAbierto}
        onClose={() => setModalReemplazoAbierto(false)}
        title={<Text fw={600} c="red">Confirmar reemplazo</Text>}
      >
        <Stack gap="md">
          <Text size="sm">
            Ya existen {totalExistentesReemplazo} producto(s) guardados. Si continúas, se reemplazarán todos por el
            contenido del archivo actual.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setModalReemplazoAbierto(false)}>
              Cancelar
            </Button>
            <Button color="red" loading={guardarCatalogo.isPending} onClick={() => executeGuardarCatalogo(true)}>
              Reemplazar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

type PuntoVentaClave = 'restaurante' | 'cafeteria' | 'carreta-mariscos';

const PUNTOS_VENTA_MENU: {
  clave: PuntoVentaClave;
  nombre: string;
  descripcion: string;
  icono: typeof IconToolsKitchen2;
  color: string;
}[] = [
  {
    clave: 'restaurante',
    nombre: 'Restaurante',
    descripcion: 'Catálogo, Costeo, Productos Vendidos y Comparación IVA',
    icono: IconToolsKitchen2,
    color: 'grape',
  },
  {
    clave: 'cafeteria',
    nombre: 'Cafetería',
    descripcion: 'Catálogo, Costeo, Productos Vendidos y Comparación IVA',
    icono: IconCoffee,
    color: 'teal',
  },
  {
    clave: 'carreta-mariscos',
    nombre: 'La Carreta de Mariscos',
    descripcion: 'Catálogo, Costeo, Productos Vendidos y Comparación IVA',
    icono: IconFish,
    color: 'cyan',
  },
];

// Menú de entrada — pantalla de selección de punto de venta, mismo patrón
// visual (UnstyledButton + Card con acento de color a la izquierda) que ya
// se usa en todo el módulo para las tarjetas de grupo/categoría.
function PanelMenuPuntosVenta({ onSeleccionar }: { onSeleccionar: (pos: PuntoVentaClave) => void }) {
  return (
    <Stack gap="md">
      <Group gap="xs">
        <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: 1 }}>Selecciona el punto de venta</Text>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        {PUNTOS_VENTA_MENU.map((pos) => (
          <UnstyledButton key={pos.clave} onClick={() => onSeleccionar(pos.clave)}>
            <Card
              withBorder
              radius="lg"
              p="xl"
              style={{
                background: `linear-gradient(135deg, var(--mantine-color-${pos.color}-light) 0%, transparent 60%)`,
                border: `1.5px solid var(--mantine-color-${pos.color}-3)`,
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                height: '100%',
              }}
              className="hover-card"
            >
              <Stack gap="md" align="flex-start">
                <ThemeIcon size={56} radius="xl" color={pos.color} variant="light"
                  style={{ boxShadow: `0 4px 12px var(--mantine-color-${pos.color}-light)` }}
                >
                  <pos.icono size={30} />
                </ThemeIcon>
                <div>
                  <Text fw={700} size="md">{pos.nombre}</Text>
                  <Text size="sm" c="dimmed" mt={4}>{pos.descripcion}</Text>
                </div>
                <Group gap={4} style={{ marginTop: 'auto' }}>
                  <Text size="xs" c={pos.color} fw={600}>Abrir</Text>
                  <IconChevronRight size={14} color={`var(--mantine-color-${pos.color}-6)`} />
                </Group>
              </Stack>
            </Card>
          </UnstyledButton>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

// Menú principal de "Catálogo de Productos" — 2 opciones: Puntos de Venta
// (Restaurante/Cafetería/Carreta, todo lo ya construido) e Inteligencia de
// Negocio (Fase 3: análisis más profundo de ventas por día/hora, pensado
// para contraloría y gerencia — todavía no construido, solo la entrada de
// navegación con una pantalla "próximamente").
type VistaPrincipalCatalogoClave = 'puntos-venta' | 'inteligencia-negocio' | 'reporte-produccion';



function PanelMenuPrincipalCatalogo({ onSeleccionar }: { onSeleccionar: (v: VistaPrincipalCatalogoClave) => void }) {
  return (
    <Stack gap="xl">
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg">
        {/* Tarjeta Puntos de Venta */}
        <UnstyledButton onClick={() => onSeleccionar('puntos-venta')}>
          <Card
            withBorder
            radius="xl"
            p={0}
            style={{ overflow: 'hidden', height: '100%', border: '1.5px solid var(--mantine-color-grape-3)' }}
          >
            <div style={{ background: 'linear-gradient(135deg, var(--mantine-color-grape-light) 0%, transparent 70%)', padding: '28px' }}>
              <Stack gap="md" align="flex-start">
                <Group justify="space-between" w="100%">
                  <ThemeIcon size={60} radius="xl" color="grape" variant="light"
                    style={{ boxShadow: '0 4px 16px var(--mantine-color-grape-light)' }}
                  >
                    <IconBuildingStore size={32} />
                  </ThemeIcon>
                  <Badge color="grape" variant="light" size="sm">3 sucursales</Badge>
                </Group>
                <div>
                  <Title order={3} c="grape">Puntos de Venta</Title>
                  <Text size="sm" c="dimmed" mt={6}>
                    Restaurante · Cafetería · Carreta de Mariscos
                  </Text>
                  <Text size="xs" c="dimmed" mt={4}>Catálogo, costeo, productos vendidos y análisis por sucursal</Text>
                </div>
                <Group gap={4}>
                  <Text size="xs" c="grape" fw={700} tt="uppercase" style={{ letterSpacing: 0.5 }}>Entrar</Text>
                  <IconChevronRight size={14} color="var(--mantine-color-grape-6)" />
                </Group>
              </Stack>
            </div>
          </Card>
        </UnstyledButton>

        {/* Tarjeta Inteligencia de Negocio */}
        <UnstyledButton onClick={() => onSeleccionar('inteligencia-negocio')}>
          <Card
            withBorder
            radius="xl"
            p={0}
            style={{ overflow: 'hidden', height: '100%', border: '1.5px solid var(--mantine-color-indigo-3)' }}
          >
            <div style={{ background: 'linear-gradient(135deg, var(--mantine-color-indigo-light) 0%, transparent 70%)', padding: '28px' }}>
              <Stack gap="md" align="flex-start">
                <Group justify="space-between" w="100%">
                  <ThemeIcon size={60} radius="xl" color="indigo" variant="light"
                    style={{ boxShadow: '0 4px 16px var(--mantine-color-indigo-light)' }}
                  >
                    <IconBrain size={32} />
                  </ThemeIcon>
                  <Badge color="indigo" variant="light" size="sm">BI Ejecutivo</Badge>
                </Group>
                <div>
                  <Title order={3} c="indigo">Inteligencia de Negocio</Title>
                  <Text size="sm" c="dimmed" mt={6}>
                    Ventas Diarias · Análisis y Profundidad
                  </Text>
                  <Text size="xs" c="dimmed" mt={4}>Tendencias, KPIs automáticos y alertas para gerencia y contraloría</Text>
                </div>
                <Group gap={4}>
                  <Text size="xs" c="indigo" fw={700} tt="uppercase" style={{ letterSpacing: 0.5 }}>Entrar</Text>
                  <IconChevronRight size={14} color="var(--mantine-color-indigo-6)" />
                </Group>
              </Stack>
            </div>
          </Card>
        </UnstyledButton>

        {/* Tarjeta Reporte de producción y ventas de Carnes y Mariscos */}
        <UnstyledButton onClick={() => onSeleccionar('reporte-produccion')}>
          <Card
            withBorder
            radius="xl"
            p={0}
            style={{ overflow: 'hidden', height: '100%', border: '1.5px solid var(--mantine-color-red-3)' }}
          >
            <div style={{ background: 'linear-gradient(135deg, var(--mantine-color-red-light) 0%, transparent 70%)', padding: '28px' }}>
              <Stack gap="md" align="flex-start">
                <Group justify="space-between" w="100%">
                  <ThemeIcon size={60} radius="xl" color="red" variant="light"
                    style={{ boxShadow: '0 4px 16px var(--mantine-color-red-light)' }}
                  >
                    <IconClipboardCheck size={32} />
                  </ThemeIcon>
                  <Badge color="red" variant="light" size="sm">Captura diaria</Badge>
                </Group>
                <div>
                  <Title order={3} c="red">Producción de Carnes y Mariscos</Title>
                  <Text size="sm" c="dimmed" mt={6}>
                    Porcionador · Cocina
                  </Text>
                  <Text size="xs" c="dimmed" mt={4}>Inventario diario de porciones, cuadre y revisión de producción y ventas</Text>
                </div>
                <Group gap={4}>
                  <Text size="xs" c="red" fw={700} tt="uppercase" style={{ letterSpacing: 0.5 }}>Entrar</Text>
                  <IconChevronRight size={14} color="var(--mantine-color-red-6)" />
                </Group>
              </Stack>
            </div>
          </Card>
        </UnstyledButton>
      </SimpleGrid>
    </Stack>
  );
}

// Menú de tarjetas de Inteligencia de Negocio — mismo patrón que
// PanelMenuPrincipalCatalogo/PanelMenuSeccionesPos. "Ventas Diarias"
// (Comandas/Recibos Emitidos, Restaurante) es la primera funcionalidad real
// construida aquí. "Análisis y Profundidad" es la Fase 3 (BI ejecutivo:
// tendencias, insights automáticos, tableros) — se construye por partes;
// "Resumen Ejecutivo" (KPIs + insights automáticos) es el primer dashboard.
type SeccionInteligenciaNegocioClave = 'ventas-diarias' | 'analisis-profundidad';

const TONO_INSIGHT_COLOR: Record<string, string> = {
  positivo: 'teal',
  negativo: 'red',
  neutral: 'blue',
};

// Ícono por tipo de insight — antes todos usaban IconBulb genérico; ahora
// cada tipo se distingue visualmente de un vistazo.
const TIPO_INSIGHT_ICONO: Record<ResumenEjecutivoInsight['tipo'], typeof IconBulb> = {
  variacion: IconTrendingUp,
  turno: IconSunrise,
  producto_top: IconStar,
  dia_semana: IconCalendarWeek,
  por_que_mejor_peor_dia: IconSearch,
  precio_candidato: IconTag,
};

// Selector de mes único de "Análisis y Profundidad" — reemplaza el rango de
// fechas libre que antes se repetía por pestaña (confuso para gerencia y
// contralores): un solo mes controla las 4 pestañas y sus sub-vistas.
type ParamsMes = { fechaDesde: string; fechaHasta: string };

function primerYUltimoDiaDelMes(mes: Date): ParamsMes {
  const anio = mes.getFullYear();
  const mesIndex = mes.getMonth();
  const primero = new Date(anio, mesIndex, 1);
  const ultimo = new Date(anio, mesIndex + 1, 0);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { fechaDesde: iso(primero), fechaHasta: iso(ultimo) };
}

function SelectorMesAnalisis({ mes, onCambiarMes }: { mes: Date; onCambiarMes: (mes: Date) => void }) {
  return (
    <MonthPickerInput
      label="Mes a analizar"
      value={mes}
      onChange={(v) => v && onCambiarMes(v)}
      valueFormat="MMMM YYYY"
      maw={220}
    />
  );
}

const COMPARACION_LABEL: Record<string, string> = { dia: 'Día', semana: 'Semana', mes: 'Mes', anio: 'Año' };

// Conciliación de ventas (contraloría): de dónde sale la Venta Neta y qué
// controles de integridad tiene el mes. Colapsada por defecto para no saturar;
// el título ya avisa cuántos controles requieren atención.
function TarjetaConciliacionVentas({ c }: { c: ConciliacionVentasResumen }) {
  const filasNoComercial = (
    [
      ['Cortesías', c.no_comercial.cortesia],
      ['Al costo', c.no_comercial.al_costo],
      ['Consumo interno', c.no_comercial.consumo_interno],
      ['Otros tipos', c.no_comercial.otro],
    ] as const
  ).filter(([, v]) => v.cuentas > 0);

  const avisos = [
    c.cuentas_comanda_sin_recibo > 0 && `${c.cuentas_comanda_sin_recibo} cuentas con comanda y sin recibo`,
    c.cuentas_recibo_sin_comanda > 0 && `${c.cuentas_recibo_sin_comanda} recibos sin comanda`,
    c.productos_sin_precio.length > 0 &&
      `${c.productos_sin_precio.length} productos sin precio en catálogo (${c.cantidad_sin_precio} piezas)`,
    c.productos_precio_ambiguo.length > 0 &&
      `${c.productos_precio_ambiguo.length} productos con precio duplicado en catálogo`,
  ].filter(Boolean) as string[];

  const fila = (etiqueta: string, valor: string, detalle?: string) => (
    <Table.Tr key={etiqueta}>
      <Table.Td>{etiqueta}</Table.Td>
      <Table.Td ta="right" fw={600}>{valor}</Table.Td>
      <Table.Td c="dimmed">{detalle ?? ''}</Table.Td>
    </Table.Tr>
  );

  return (
    <Card withBorder radius="md" p={0}>
      <Accordion variant="default">
        <Accordion.Item value="conciliacion">
          <Accordion.Control>
            <Group gap="sm">
              <Text fw={600} size="sm">Conciliación de ventas</Text>
              {avisos.length > 0 && <Badge size="sm" color="yellow" variant="light">{avisos.length} por revisar</Badge>}
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <Table withRowBorders={false} verticalSpacing={4} fz="sm">
              <Table.Tbody>
                {fila('Venta neta', formatoMoneda.format(c.venta_neta), `${c.cuentas_comerciales} cuentas comerciales`)}
                {fila('IVA (aparte)', formatoMoneda.format(c.iva))}
                {fila('Propina (aparte)', formatoMoneda.format(c.propina), c.propina_pct_venta_neta != null ? `${c.propina_pct_venta_neta}% de la venta neta` : undefined)}
                {fila(
                  'Descuentos otorgados',
                  formatoMoneda.format(c.descuento),
                  `${c.cuentas_con_descuento} cuentas${c.descuento_pct_venta_bruta != null ? ` · ${c.descuento_pct_venta_bruta}% de la venta bruta` : ''}`,
                )}
                {filasNoComercial.map(([nombre, v]) => fila(`${nombre} (no es venta)`, formatoMoneda.format(v.monto), `${v.cuentas} cuentas`))}
              </Table.Tbody>
            </Table>
            <Divider my="sm" />
            <Text size="xs" c="dimmed" mb={4}>
              Catálogo × Comandas: {formatoMoneda.format(c.ingreso_catalogo_comandas)} · frente al subtotal de Recibos{' '}
              {c.vs_subtotal_recibos.diferencia_pct != null ? `${c.vs_subtotal_recibos.diferencia_pct > 0 ? '+' : ''}${c.vs_subtotal_recibos.diferencia_pct}%` : '—'}
              {' '}(con IVA: {c.vs_subtotal_con_iva_recibos.diferencia_pct != null ? `${c.vs_subtotal_con_iva_recibos.diferencia_pct > 0 ? '+' : ''}${c.vs_subtotal_con_iva_recibos.diferencia_pct}%` : '—'}).
              Es una diferencia observada, el sistema no conoce su causa.
            </Text>
            {avisos.length === 0 ? (
              <Text size="xs" c="teal">Sin diferencias de integridad entre Recibos, Comandas y Catálogo.</Text>
            ) : (
              <Stack gap={2}>
                {avisos.map((a) => (
                  <Text key={a} size="xs" c="orange.8">• {a}</Text>
                ))}
              </Stack>
            )}
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Card>
  );
}

// Resumen Ejecutivo — primer dashboard de "Análisis y Profundidad". KPIs +
// insights automáticos para el mes elegido, calculados solo con
// Comandas/Recibos Emitidos (no depende de Productos Vendidos, que es por
// lote y no encaja con un rango arbitrario — ver services/resumen_ejecutivo.py).
function PanelResumenEjecutivo({ params }: { params: ParamsMes }) {
  const [vista, setVista] = useState<'mes' | 'todos'>('mes');
  const resumen = useResumenEjecutivo(vista === 'mes' ? params : null);
  const tendenciaMensual = useTendenciaMensual();
  const kpis = resumen.data?.kpis;
  const insights = resumen.data?.insights ?? [];
  const comparaciones = resumen.data?.comparaciones;

  return (
    <Stack gap="lg">
      <SegmentedControl
        value={vista}
        onChange={(v) => setVista(v as 'mes' | 'todos')}
        data={[
          { label: 'Por mes', value: 'mes' },
          { label: 'Todos los meses', value: 'todos' },
        ]}
        style={{ alignSelf: 'flex-start' }}
      />

      {vista === 'todos' ? (
        <>
          {tendenciaMensual.isLoading && <Text size="sm" c="dimmed">Cargando...</Text>}
          {!tendenciaMensual.isLoading && (tendenciaMensual.data?.meses.length ?? 0) === 0 && (
            <Card withBorder radius="md" p="lg">
              <Text size="sm" c="dimmed" ta="center">No hay datos de Comandas/Recibos Emitidos todavía.</Text>
            </Card>
          )}
          {!tendenciaMensual.isLoading && (tendenciaMensual.data?.meses.length ?? 0) > 0 && (
            <Card withBorder radius="md" p="md">
              <Text fw={600} size="sm" mb="xs">Tendencia mensual — venta neta por mes</Text>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={tendenciaMensual.data?.meses ?? []} margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis />
                  <RechartsTooltip formatter={(value: any) => [formatoMoneda.format(value), 'Venta neta']} />
                  <Bar dataKey="total_vendido" name="Venta neta" fill="var(--mantine-color-violet-6)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}
        </>
      ) : (
        <>
          {resumen.isLoading && <Text size="sm" c="dimmed">Cargando...</Text>}

          {!resumen.isLoading && kpis && kpis.dias_con_datos === 0 && (
            <Card withBorder radius="md" p="lg">
              <Text size="sm" c="dimmed" ta="center">
                No hay datos de Comandas/Recibos Emitidos en este mes.
              </Text>
            </Card>
          )}

          {!resumen.isLoading && kpis && kpis.dias_con_datos > 0 && (
            <>
              <Card 
                withBorder 
                radius="xl" 
                p="xl" 
                style={{ 
                  background: 'linear-gradient(135deg, var(--mantine-color-violet-light) 0%, var(--mantine-color-grape-1) 100%)',
                  border: '1px solid var(--mantine-color-violet-2)',
                  boxShadow: '0 8px 32px rgba(132, 94, 247, 0.1)'
                }}
              >
                <Title order={4} c="violet.9" mb="lg">Resumen Ejecutivo</Title>
                <SimpleGrid cols={{ base: 1, sm: 2, md: 5 }} spacing="md">
                  <Card withBorder radius="md" p="md" style={{ background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.4)', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
                    <Stack gap={4}>
                      <Tooltip label="Subtotal − descuento de cuentas comerciales. Sin IVA, sin propina, sin cortesías ni consumos internos." multiline w={260}>
                        <Text size="sm" c="dimmed" fw={600}>Venta Neta</Text>
                      </Tooltip>
                      <Text fw={800} size="xl" style={{ fontSize: '1.8rem', color: 'var(--mantine-color-dark-9)' }}>{formatoMoneda.format(kpis.total_vendido)}</Text>
                      {kpis.variacion_pct !== null && (
                        <Badge size="sm" color={kpis.variacion_pct >= 0 ? 'teal' : 'red'} variant="light" style={{ alignSelf: 'flex-start' }}>
                          {kpis.variacion_pct >= 0 ? '▲' : '▼'} {Math.abs(kpis.variacion_pct)}% vs mes ant.
                        </Badge>
                      )}
                    </Stack>
                  </Card>
                  <Card withBorder radius="md" p="md" style={{ background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.4)', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
                    <Stack gap={4}>
                      <Text size="sm" c="dimmed" fw={600}>Ticket Promedio</Text>
                      <Text fw={800} size="xl" style={{ fontSize: '1.8rem', color: 'var(--mantine-color-dark-9)' }}>{formatoMoneda.format(kpis.ticket_promedio)}</Text>
                    </Stack>
                  </Card>
                  <Card withBorder radius="md" p="md" style={{ background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.4)', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
                    <Stack gap={4}>
                      <Text size="sm" c="dimmed" fw={600}>Cuentas</Text>
                      <Text fw={800} size="xl" style={{ fontSize: '1.8rem', color: 'var(--mantine-color-dark-9)' }}>{kpis.cantidad_cuentas}</Text>
                    </Stack>
                  </Card>
                  <Card withBorder radius="md" p="md" style={{ background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.4)', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
                    <Stack gap={4}>
                      <Text size="sm" c="dimmed" fw={600}>Piezas Vendidas</Text>
                      <Text fw={800} size="xl" style={{ fontSize: '1.8rem', color: 'var(--mantine-color-dark-9)' }}>{kpis.piezas_vendidas}</Text>
                    </Stack>
                  </Card>
                  <Card withBorder radius="md" p="md" style={{ background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.4)', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
                    <Stack gap={4}>
                      <Text size="sm" c="dimmed" fw={600}>Propina Total</Text>
                      <Text fw={800} size="xl" style={{ fontSize: '1.8rem', color: 'var(--mantine-color-dark-9)' }}>{formatoMoneda.format(kpis.propina_total)}</Text>
                      {resumen.data?.conciliacion.propina_pct_venta_neta != null && (
                        <Text size="xs" c="dimmed">{resumen.data.conciliacion.propina_pct_venta_neta}% de la venta neta</Text>
                      )}
                    </Stack>
                  </Card>
                </SimpleGrid>
              </Card>

              {comparaciones && (
                <Card withBorder radius="md" p="md">
                  <Text fw={600} size="sm" mb="xs">Comparación contra periodo anterior</Text>
                  <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
                    {(['dia', 'semana', 'mes', 'anio'] as const).map((clave) => {
                      const c = comparaciones[clave];
                      return (
                        <Stack key={clave} gap={2}>
                          <Text size="xs" c="dimmed">
                            {clave === 'dia' && comparaciones.dia.fecha
                              ? `Día ${comparaciones.dia.fecha.slice(5)} vs. mismo día sem. ant.`
                              : COMPARACION_LABEL[clave]}
                          </Text>
                          <Text fw={700} size="sm">{formatoMoneda.format(c.actual)}</Text>
                          {clave === 'dia' && comparaciones.dia.parcial && (
                            <Badge size="xs" color="yellow" variant="light">día incompleto</Badge>
                          )}
                          {c.variacion_pct === null ? (
                            <Badge size="xs" color="gray" variant="light">sin dato anterior</Badge>
                          ) : (
                            <Badge size="xs" color={c.variacion_pct >= 0 ? 'teal' : 'red'} variant="light">
                              {c.variacion_pct >= 0 ? '+' : ''}{c.variacion_pct}%
                            </Badge>
                          )}
                        </Stack>
                      );
                    })}
                  </SimpleGrid>
                </Card>
              )}

              <Card withBorder radius="md" p="md">
                <Text fw={600} size="sm" mb="xs">Tendencia diaria</Text>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={resumen.data?.serie_diaria ?? []} margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="fecha" />
                    <YAxis />
                    <RechartsTooltip formatter={(value: any) => [formatoMoneda.format(value), 'Venta neta']} />
                    <Bar dataKey="total_vendido" name="Venta neta" fill="var(--mantine-color-violet-6)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              {resumen.data?.conciliacion && <TarjetaConciliacionVentas c={resumen.data.conciliacion} />}

              <Stack gap="sm">
                <Title order={4} mt="md">Insights Automáticos</Title>
                {insights.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    No hay suficientes datos en este mes para generar hallazgos.
                  </Text>
                ) : (
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                    {insights.map((insight, i) => {
                      const IconoInsight = TIPO_INSIGHT_ICONO[insight.tipo] ?? IconBulb;
                      const insightColor = TONO_INSIGHT_COLOR[insight.tono];
                      return (
                        <Card
                          key={i}
                          withBorder
                          radius="md"
                          p="md"
                          style={{ borderLeft: `6px solid var(--mantine-color-${insightColor}-5)`, boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}
                        >
                          <Group gap="md" wrap="nowrap" align="center">
                            <ThemeIcon size={40} radius="md" color={insightColor} variant="light">
                              <IconoInsight size={24} />
                            </ThemeIcon>
                            <div>
                              <Text fw={600} size="md" c="dark.8">{insight.mensaje}</Text>
                              <Text size="sm" c="dimmed" mt={2}>{insight.accion_sugerida}</Text>
                            </div>
                          </Group>
                        </Card>
                      );
                    })}
                  </SimpleGrid>
                )}
              </Stack>
            </>
          )}
        </>
      )}
    </Stack>
  );
}

// Heatmap Día×Hora — segundo dashboard de "Análisis y Profundidad". Una
// fila por FECHA exacta (nunca combinada entre fechas del mismo día de la
// semana — un lunes 7 y un lunes 14 son 2 filas separadas), calculado solo
// con Comandas Emitidas (única tabla con hora real de consumo por línea —
// ver services/heatmap_ventas.py). Horas mostradas: 06:00–23:00.
const DIAS_SEMANA_HEATMAP = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const HORAS_HEATMAP = Array.from({ length: 18 }, (_, i) => i + 6); // 6..23

// Día de la semana (0=Lunes..6=Domingo, mismo criterio que
// date.weekday() del backend) calculado siempre a partir del string de
// fecha — nunca se mezcla con el `dia_semana` del backend para evitar
// inconsistencias de convención (JS getDay() es 0=Domingo).
function diaSemanaDesdeFecha(fechaISO: string): number {
  const diaJs = new Date(`${fechaISO}T00:00:00`).getDay(); // 0=Dom..6=Sáb
  return diaJs === 0 ? 6 : diaJs - 1;
}

function etiquetaFechaHeatmap(fechaISO: string): string {
  const dia = Number(fechaISO.slice(8, 10));
  return `${DIAS_SEMANA_HEATMAP[diaSemanaDesdeFecha(fechaISO)]} ${dia}`;
}

// Lista de productos con badge de ranking + barra proporcional (ancho =
// cantidad / máximo del set) — reemplaza la tabla simple Producto/Cantidad
// que tenía antes el panel de clic del Heatmap, mismo lenguaje visual que ya
// usa la intensidad de color de la grilla.
function ListaProductosBarra({ productos }: { productos: HeatmapTopProducto[] }) {
  const maxCantidad = Math.max(1, ...productos.map((p) => p.cantidad));
  const totalPiezas = productos.reduce((acc, p) => acc + p.cantidad, 0);

  return (
    <Card withBorder radius="md" p="md">
      <Text size="xs" c="dimmed" mb="sm">
        {totalPiezas} pieza(s) en total · {productos.length} producto(s)
      </Text>
      <Stack gap={8}>
        {productos.map((p, i) => (
          <Group key={p.producto} gap="sm" wrap="nowrap" align="center">
            <Badge size="sm" variant="light" color="violet" style={{ flexShrink: 0, width: 32 }}>
              #{i + 1}
            </Badge>
            <Stack gap={3} style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={500} truncate>{p.producto}</Text>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--mantine-color-default-hover)', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${(p.cantidad / maxCantidad) * 100}%`,
                    background: 'var(--mantine-color-violet-6)',
                    borderRadius: 3,
                  }}
                />
              </div>
            </Stack>
            <Text size="sm" fw={600} style={{ fontVariantNumeric: 'tabular-nums', flexShrink: 0, width: 36, textAlign: 'right' }}>
              {p.cantidad}
            </Text>
          </Group>
        ))}
      </Stack>
    </Card>
  );
}

// Nota manual opcional por fecha (ej. "Fiesta Mexicana") para explicar un
// pico que el sistema detectó pero no puede saber la causa real por sí
// solo. `key={fecha}` en el llamador remonta este componente al cambiar de
// fecha, así el estado local siempre arranca del valor guardado de esa
// fecha sin necesitar un useEffect de sincronización.
function NotaFechaHeatmapInput({ fecha, notaInicial }: { fecha: string; notaInicial: string }) {
  const [valor, setValor] = useState(notaInicial);
  const guardarNota = useGuardarNotaHeatmap();

  return (
    <Group align="flex-end" gap="xs" wrap="nowrap">
      <Textarea
        label={`Nota para el ${fecha}`}
        placeholder="Ej. Fiesta Mexicana"
        description="Explica el motivo real de un pico cuando lo sepas — el sistema no puede inferirlo solo."
        value={valor}
        onChange={(e) => setValor(e.currentTarget.value)}
        autosize
        minRows={1}
        maxRows={3}
        style={{ flex: 1 }}
      />
      <Button size="xs" loading={guardarNota.isPending} onClick={() => guardarNota.mutate({ fecha, nota: valor })}>
        Guardar
      </Button>
    </Group>
  );
}

function PanelHeatmapVentas({ params }: { params: ParamsMes }) {
  const heatmap = useHeatmapVentas(params);
  const celdas = heatmap.data?.celdas ?? [];
  const fechasConDatos = heatmap.data?.fechas_con_datos ?? [];
  const picos = heatmap.data?.picos ?? [];
  const notas = heatmap.data?.notas ?? {};
  const [celdaSeleccionada, setCeldaSeleccionada] = useState<{ fecha: string; hora: number } | null>(null);

  const celdaPorClave = new Map(celdas.map((c) => [`${c.fecha}-${c.hora}`, c]));
  const picoPorClave = new Map(picos.map((p) => [`${p.fecha}-${p.hora}`, p]));
  const maxPiezas = Math.max(0, ...celdas.map((c) => c.piezas));
  const celdaFijada = celdaSeleccionada ? celdaPorClave.get(`${celdaSeleccionada.fecha}-${celdaSeleccionada.hora}`) : undefined;

  return (
    <Stack gap="lg">
      {heatmap.isLoading && <Text size="sm" c="dimmed">Cargando...</Text>}

      {!heatmap.isLoading && fechasConDatos.length === 0 && (
        <Card withBorder radius="md" p="lg">
          <Text size="sm" c="dimmed" ta="center">
            No hay datos de Comandas Emitidas en este mes.
          </Text>
        </Card>
      )}

      {!heatmap.isLoading && fechasConDatos.length > 0 && (
        <Stack gap="md">
          {picos.length > 0 && (
            <Card radius="md" p="md" style={{ background: 'var(--mantine-color-blue-light)', borderLeft: '4px solid var(--mantine-color-blue-6)' }}>
              <Group gap="md">
                <ThemeIcon color="blue" variant="light" size={40} radius="md">
                  <IconFlame size={24} />
                </ThemeIcon>
                <div>
                  <Text fw={700} c="blue.9">Pico histórico del mes</Text>
                  <Text size="sm" c="blue.8">Tu mayor concentración de ventas fue el <b>{picos[0].fecha}</b> a las <b>{picos[0].hora}:00</b> con <b>{picos[0].piezas} piezas</b> vendidas.</Text>
                </div>
              </Group>
            </Card>
          )}
          <Card withBorder radius="md" p="md" style={{ overflowX: 'auto' }}>
            <Stack gap="sm">
              <Group justify="space-between" align="center" wrap="nowrap">
                <Text size="xs" fw={600} c="dimmed">↓ Fecha  ·  Hora →</Text>
              <Group gap={6} align="center" wrap="nowrap">
                <Text size="xs" c="dimmed">Poco</Text>
                <div
                  style={{
                    width: 90,
                    height: 10,
                    borderRadius: 4,
                    background: 'linear-gradient(to right, rgba(121, 80, 242, 0.12), rgba(121, 80, 242, 0.90))',
                  }}
                />
                <Text size="xs" c="dimmed">Mucho</Text>
              </Group>
            </Group>
            <Group gap={4} wrap="nowrap" pl={56}>
              {HORAS_HEATMAP.map((h) => (
                <Text key={h} size="xs" c="dimmed" ta="center" style={{ width: 28 }}>
                  {h}
                </Text>
              ))}
            </Group>
            {fechasConDatos.map((fecha) => {
              const nombreFecha = etiquetaFechaHeatmap(fecha);
              return (
                <Group key={fecha} gap={4} wrap="nowrap">
                  <Text size="xs" c="dimmed" style={{ width: 52 }}>
                    {nombreFecha}
                  </Text>
                  {HORAS_HEATMAP.map((hora) => {
                    const celda = celdaPorClave.get(`${fecha}-${hora}`);
                    const pico = picoPorClave.get(`${fecha}-${hora}`);
                    const intensidad = celda && maxPiezas > 0 ? celda.piezas / maxPiezas : 0;
                    const seleccionada = celdaSeleccionada?.fecha === fecha && celdaSeleccionada?.hora === hora;
                    return (
                      <Tooltip
                        key={hora}
                        label={
                          celda
                            ? `${nombreFecha} ${hora}:00 — ${celda.piezas} piezas${pico ? ` — pico (+${pico.variacion_pct}%)` : ''} — clic para ver productos`
                            : `${nombreFecha} ${hora}:00 — sin datos`
                        }
                      >
                        <div
                          onClick={() => setCeldaSeleccionada({ fecha, hora })}
                          style={{
                            boxSizing: 'border-box',
                            width: 28,
                            height: 28,
                            borderRadius: 4,
                            cursor: 'pointer',
                            backgroundColor: celda
                              ? `rgba(121, 80, 242, ${0.12 + intensidad * 0.78})`
                              : 'var(--mantine-color-gray-1)',
                            outline: seleccionada ? '2px solid var(--mantine-color-violet-9)' : 'none',
                            outlineOffset: 1,
                            border: pico && !seleccionada ? '2px solid var(--mantine-color-orange-6)' : '2px solid transparent',
                          }}
                        />
                      </Tooltip>
                    );
                  })}
                </Group>
              );
            })}
            <Group gap="md" mt={4}>
              <Text size="xs" c="dimmed">
                Cada celda muestra las <b>piezas</b> vendidas exactamente ese día y hora — cada fecha del mes es su
                propia fila, nunca se combina con otras fechas del mismo día de la semana.
              </Text>
              {picos.length > 0 && (
                <Group gap={4} wrap="nowrap">
                  <div style={{ width: 12, height: 12, borderRadius: 3, border: '2px solid var(--mantine-color-orange-6)', flexShrink: 0 }} />
                  <Text size="xs" c="dimmed">= pico detectado</Text>
                </Group>
              )}
            </Group>

            {picos.length > 0 && (
              <>
                <Divider label="Picos de venta detectados" labelPosition="left" />
                <Stack gap="xs">
                  {picos.map((pico) => {
                    const nombreFecha = etiquetaFechaHeatmap(pico.fecha);
                    const nota = notas[pico.fecha];
                    return (
                      <Card
                        key={`${pico.fecha}-${pico.hora}`}
                        withBorder
                        radius="md"
                        p="sm"
                        component="button"
                        onClick={() => setCeldaSeleccionada({ fecha: pico.fecha, hora: pico.hora })}
                        style={{ textAlign: 'left', cursor: 'pointer', borderLeft: '4px solid var(--mantine-color-orange-6)' }}
                      >
                        <Group justify="space-between" wrap="nowrap" align="flex-start">
                          <Text size="sm">
                            <b>{nombreFecha} a las {pico.hora}:00</b> — {pico.piezas} piezas, {pico.variacion_pct >= 0 ? '+' : ''}
                            {pico.variacion_pct}% vs. el promedio de esa hora ({pico.promedio_resto_del_mes}).
                          </Text>
                          <Badge size="xs" color="orange" variant="light" style={{ flexShrink: 0 }}>pico</Badge>
                        </Group>
                        {pico.top_productos.length > 0 && (
                          <Text size="xs" c="dimmed" mt={4}>
                            Productos: {pico.top_productos.slice(0, 5).map((p) => p.producto).join(', ')}
                          </Text>
                        )}
                        {nota && (
                          <Text size="xs" c="violet" mt={4} fw={500}>
                            Nota: {nota}
                          </Text>
                        )}
                      </Card>
                    );
                  })}
                </Stack>
              </>
            )}

            <Divider label="Detalle de la celda seleccionada" labelPosition="left" />

            {!celdaSeleccionada && (
              <Text size="xs" c="dimmed" ta="center">
                Haz clic en una celda para ver el detalle completo de productos de ese día y hora.
              </Text>
            )}

            {celdaSeleccionada && !celdaFijada && (
              <Text size="sm" c="dimmed" ta="center">
                Sin datos para {celdaSeleccionada.fecha} {celdaSeleccionada.hora}:00.
              </Text>
            )}

            {celdaFijada && (
              <Stack gap="sm">
                <Text size="sm" fw={600}>
                  {etiquetaFechaHeatmap(celdaFijada.fecha)} ({celdaFijada.fecha}) {celdaFijada.hora}:00 — {celdaFijada.top_productos.length} producto(s) pedidos
                </Text>
                {celdaFijada.top_productos.length === 0 ? (
                  <Text size="sm" c="dimmed">Sin productos registrados en esa celda.</Text>
                ) : (
                  <ListaProductosBarra productos={celdaFijada.top_productos} />
                )}
                <NotaFechaHeatmapInput key={celdaFijada.fecha} fecha={celdaFijada.fecha} notaInicial={notas[celdaFijada.fecha] ?? ''} />
              </Stack>
            )}
          </Stack>
        </Card>
        </Stack>
      )}
    </Stack>
  );
}

// Ranking de Productos — tercer dashboard de "Análisis y Profundidad".
// Popularidad/margen/ingreso por producto, calculado con Comandas Emitidas
// × Catálogo (ver services/ranking_productos.py). Navegación idéntica a la
// pestaña "Catálogo" (sección de menú → categoría → grupo → tabla), pero
// sobre RankingProductoFila en vez de ProductoCatalogo — reusa SECCIONES_MENU/
// CATEGORIAS_TIPO/ESTILO_ENCABEZADO_TABLA tal cual, sin duplicarlas. A
// diferencia de Catálogo, aquí sí puede haber productos sin match de
// catálogo (vienen de Comandas, no del catálogo maestro) — esos caen en un
// bucket "Sin Clasificar" en cada nivel en vez de perderse. El criterio de
// orden se aplica localmente sobre el array ya cargado, sin volver a pedir
// datos, y ahora también decide el orden de las tarjetas de grupo.
type CriterioRankingProductos = 'popularidad' | 'menos_vendidos' | 'margen' | 'ingreso' | 'declive';

function agruparRankingPor(
  productos: RankingProductoFila[],
  campo: 'categoria_tipo' | 'seccion_menu' | 'grupo',
): Map<string, RankingProductoFila[]> {
  const mapa = new Map<string, RankingProductoFila[]>();
  for (const producto of productos) {
    const clave = producto[campo] ?? 'Sin Clasificar';
    const lista = mapa.get(clave) ?? [];
    lista.push(producto);
    mapa.set(clave, lista);
  }
  return mapa;
}

function ordenarProductosRanking(productos: RankingProductoFila[], criterio: CriterioRankingProductos): RankingProductoFila[] {
  return [...productos].sort((a, b) => {
    if (criterio === 'popularidad') return b.cantidad - a.cantidad;
    if (criterio === 'menos_vendidos') return a.cantidad - b.cantidad;
    if (criterio === 'margen') return (b.margen_pct ?? -Infinity) - (a.margen_pct ?? -Infinity);
    if (criterio === 'declive') return (a.variacion_pct_cantidad ?? Infinity) - (b.variacion_pct_cantidad ?? Infinity);
    return b.ingreso_total - a.ingreso_total;
  });
}

// Métrica que se muestra en cada tarjeta de grupo y que decide su orden —
// coherente con el criterio elegido arriba, para que la navegación cuente la
// misma historia que la tabla final. "En declive" no es un concepto de
// grupo (es por producto, ver arriba) así que cae a Ingreso, igual que ya
// hacía la vista "Por Grupo" anterior.
function metricaGrupoRanking(productosGrupo: RankingProductoFila[], criterio: CriterioRankingProductos): { valor: number; texto: string } {
  if (criterio === 'margen') {
    const conMargen = productosGrupo.filter((p) => p.margen_pct !== null);
    const promedio = conMargen.length
      ? conMargen.reduce((acc, p) => acc + (p.margen_pct ?? 0), 0) / conMargen.length
      : null;
    return { valor: promedio ?? -Infinity, texto: promedio !== null ? `Margen prom.: ${promedio.toFixed(1)}%` : 'Margen prom.: —' };
  }
  if (criterio === 'popularidad' || criterio === 'menos_vendidos') {
    const total = productosGrupo.reduce((acc, p) => acc + p.cantidad, 0);
    return { valor: total, texto: `Cantidad: ${total}` };
  }
  const total = productosGrupo.reduce((acc, p) => acc + p.ingreso_total, 0);
  return { valor: total, texto: `Ingreso: ${formatoMoneda.format(total)}` };
}

// Nivel 4 — misma tabla que antes (Card + Table.ScrollContainer +
// ESTILO_ENCABEZADO_TABLA + semáforo de margen + fila TOTAL), ahora recibe
// el subconjunto ya filtrado/ordenado de un solo grupo.
function RankingTablaProductos({ productos }: { productos: RankingProductoFila[] }) {
  const totalCantidad = productos.reduce((acc, f) => acc + f.cantidad, 0);
  const totalIngreso = productos.reduce((acc, f) => acc + f.ingreso_total, 0);

  return (
    <Card withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
      <Table.ScrollContainer minWidth={720}>
        <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
          <Table.Thead
            style={{
              background: 'var(--mantine-color-default-hover)',
              borderBottom: '2px solid var(--mantine-color-default-border)',
            }}
          >
            <Table.Tr>
              <Table.Th style={ESTILO_ENCABEZADO_TABLA}>Producto</Table.Th>
              <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Cantidad</Table.Th>
              <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Tendencia</Table.Th>
              <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Margen %</Table.Th>
              <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Ingreso</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {productos.map((fila, i) => (
              <Table.Tr key={fila.producto}>
                <Table.Td>
                  <Group gap={8}>
                    {i === 0 && <Text size="lg">🥇</Text>}
                    {i === 1 && <Text size="lg">🥈</Text>}
                    {i === 2 && <Text size="lg">🥉</Text>}
                    {i > 2 && <Text size="sm" c="dimmed" w={24} ta="center">{i + 1}</Text>}
                    <Text size="sm" fw={600} c={i < 3 ? 'dark.9' : 'dark.7'}>{fila.producto}</Text>
                    {!fila.producto_catalogo_encontrado && (
                      <Badge size="xs" color="orange" variant="light">sin match en catálogo</Badge>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{fila.cantidad}</Table.Td>
                <Table.Td ta="right">
                  {fila.variacion_pct_cantidad === null ? (
                    <Badge size="xs" color="gray" variant="light">nuevo</Badge>
                  ) : (
                    <Badge
                      size="xs"
                      color={fila.variacion_pct_cantidad >= 0 ? 'teal' : 'red'}
                      variant="light"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {fila.variacion_pct_cantidad >= 0 ? '+' : ''}{fila.variacion_pct_cantidad}%
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td ta="right">
                  {fila.margen_pct === null ? (
                    <Text size="sm" c="dimmed" ta="right">—</Text>
                  ) : (
                    <Badge
                      size="sm"
                      variant="light"
                      color={colorMargenPct(fila.margen_pct)}
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {fila.margen_pct}%
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatoMoneda.format(fila.ingreso_total)}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
          <Table.Tfoot>
            <Table.Tr style={{ borderTop: '2px solid var(--mantine-color-violet-6)', background: 'var(--mantine-color-default-hover)' }}>
              <Table.Th>TOTAL</Table.Th>
              <Table.Th ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{totalCantidad}</Table.Th>
              <Table.Th />
              <Table.Th />
              <Table.Th ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatoMoneda.format(totalIngreso)}
              </Table.Th>
            </Table.Tr>
          </Table.Tfoot>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );
}

// Nivel 3 — cuadrícula de tarjetas de grupo, mismo markup que "Otros
// subgrupos" de PanelSubgrupos (sin las franjas de temáticas/eventos: esos
// campos no existen en datos de Comandas). Clic entra al grupo y muestra su
// tabla, igual que Catálogo.
function RankingPorGrupo({ productos, criterio, color }: { productos: RankingProductoFila[]; criterio: CriterioRankingProductos; color: string }) {
  const [grupoActivo, setGrupoActivo] = useState<string | null>(null);
  const productosPorGrupo = useMemo(() => agruparRankingPor(productos, 'grupo'), [productos]);

  if (grupoActivo && productosPorGrupo.has(grupoActivo)) {
    const productosGrupo = ordenarProductosRanking(productosPorGrupo.get(grupoActivo)!, criterio);
    return (
      <Stack gap="sm">
        <UnstyledButton onClick={() => setGrupoActivo(null)} style={{ alignSelf: 'flex-start' }}>
          <Group gap={6}>
            <IconArrowLeft size={16} />
            <Text size="sm" fw={500}>Volver a grupos</Text>
          </Group>
        </UnstyledButton>

        <Group gap="xs">
          <div style={{ width: 4, height: 16, borderRadius: 2, background: `var(--mantine-color-${color}-6)` }} />
          <Text fw={700} size="sm">{grupoActivo}</Text>
          <Badge size="sm" variant="light" color="gray">{productosGrupo.length}</Badge>
        </Group>

        <RankingTablaProductos productos={productosGrupo} />
      </Stack>
    );
  }

  const gruposConMetrica = Array.from(productosPorGrupo.entries()).map(([grupo, productosGrupo]) => ({
    grupo,
    productosGrupo,
    metrica: metricaGrupoRanking(productosGrupo, criterio),
  }));
  const ascendente = criterio === 'menos_vendidos';
  gruposConMetrica.sort((a, b) => (ascendente ? a.metrica.valor - b.metrica.valor : b.metrica.valor - a.metrica.valor));

  if (gruposConMetrica.length === 0) {
    return <Text size="sm" c="dimmed">Ningún producto coincide aquí.</Text>;
  }

  return (
    <SimpleGrid cols={{ base: 1, xs: 2, sm: 3, md: 4 }} spacing="sm">
      {gruposConMetrica.map(({ grupo, productosGrupo, metrica }) => (
        <Card
          key={grupo}
          withBorder
          radius="md"
          p="md"
          component="button"
          onClick={() => setGrupoActivo(grupo)}
          style={{ textAlign: 'left', cursor: 'pointer' }}
        >
          <Stack gap={6}>
            <div style={{ width: 28, height: 4, borderRadius: 2, background: `var(--mantine-color-${color}-6)` }} />
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Text size="sm" fw={600} style={{ flex: 1 }}>{grupo}</Text>
              <IconChevronRight size={16} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0, marginTop: 2 }} />
            </Group>
            <Badge size="sm" variant="light" color={color}>
              {productosGrupo.length} producto{productosGrupo.length === 1 ? '' : 's'}
            </Badge>
            <Text size="xs" c="dimmed">{metrica.texto}</Text>
          </Stack>
        </Card>
      ))}
    </SimpleGrid>
  );
}

// Nivel 2 — mismas CATEGORIAS_TIPO que Catálogo, más un bucket "Sin
// Clasificar" (productos de Comandas sin match de catálogo) que Catálogo no
// necesita porque todos sus productos ya vienen del catálogo maestro.
function RankingPorCategoria({ productos, criterio }: { productos: RankingProductoFila[]; criterio: CriterioRankingProductos }) {
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null);
  const productosPorCategoria = useMemo(() => agruparRankingPor(productos, 'categoria_tipo'), [productos]);

  const categoriasBase = [...CATEGORIAS_TIPO, { clave: 'Sin Clasificar', etiqueta: 'Sin Clasificar', color: 'gray', icono: IconCategory }];
  const categoriasConDatos = categoriasBase.filter((cat) => (productosPorCategoria.get(cat.clave)?.length ?? 0) > 0);

  const categoriaMostrada =
    categoriaActiva && categoriasConDatos.some((cat) => cat.clave === categoriaActiva)
      ? categoriaActiva
      : (categoriasConDatos[0]?.clave ?? null);

  if (categoriasConDatos.length === 0) {
    return <Text size="sm" c="dimmed">Ningún producto coincide aquí.</Text>;
  }

  return (
    <Tabs value={categoriaMostrada} onChange={setCategoriaActiva} variant="pills" keepMounted={false}>
      <Tabs.List>
        {categoriasConDatos.map((cat) => (
          <Tabs.Tab
            key={cat.clave}
            value={cat.clave}
            color={cat.color}
            leftSection={<cat.icono size={16} />}
            rightSection={
              <Badge size="sm" variant="light" color={cat.clave === categoriaMostrada ? 'white' : cat.color}>
                {productosPorCategoria.get(cat.clave)?.length ?? 0}
              </Badge>
            }
          >
            {cat.etiqueta}
          </Tabs.Tab>
        ))}
      </Tabs.List>

      {categoriasConDatos.map((cat) => (
        <Tabs.Panel key={cat.clave} value={cat.clave} pt="md">
          <RankingPorGrupo productos={productosPorCategoria.get(cat.clave) ?? []} criterio={criterio} color={cat.color} />
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}

// Nivel 1 — mismas SECCIONES_MENU que Catálogo, más el mismo bucket "Sin
// Clasificar" del nivel 2, y una búsqueda por nombre (mismo patrón que
// Catálogo) antes de agrupar.
function PanelRankingProductos({ params }: { params: ParamsMes }) {
  const [criterio, setCriterio] = useState<CriterioRankingProductos>('popularidad');
  const [busqueda, setBusqueda] = useState('');
  const [seccionActiva, setSeccionActiva] = useState<string | null>(null);
  const [busquedaDebounced] = useDebouncedValue(busqueda, 200);

  const ranking = useRankingProductos(params);
  const productos = ranking.data?.productos ?? [];

  const productosFiltrados = busquedaDebounced.trim()
    ? productos.filter((p) => p.producto.toLowerCase().includes(busquedaDebounced.trim().toLowerCase()))
    : productos;

  const productosPorSeccion = useMemo(() => agruparRankingPor(productosFiltrados, 'seccion_menu'), [productosFiltrados]);

  const seccionesBase = [...SECCIONES_MENU, { clave: 'Sin Clasificar', color: 'gray', icono: IconCategory }];
  const seccionesConDatos = seccionesBase.filter((sec) => (productosPorSeccion.get(sec.clave)?.length ?? 0) > 0);

  const seccionMostrada =
    seccionActiva && seccionesConDatos.some((sec) => sec.clave === seccionActiva)
      ? seccionActiva
      : (seccionesConDatos[0]?.clave ?? null);

  return (
    <Stack gap="lg">
      <Group align="flex-end" gap="md" wrap="wrap">
        <TextInput
          label="Buscar producto"
          placeholder="Nombre del producto..."
          leftSection={<IconSearch size={16} />}
          value={busqueda}
          onChange={(e) => setBusqueda(e.currentTarget.value)}
          maw={280}
        />
        <SegmentedControl
          value={criterio}
          onChange={(v) => setCriterio(v as CriterioRankingProductos)}
          data={[
            { label: 'Popularidad', value: 'popularidad' },
            { label: 'Menos vendidos', value: 'menos_vendidos' },
            { label: 'Margen', value: 'margen' },
            { label: 'Ingreso', value: 'ingreso' },
            { label: 'En declive', value: 'declive' },
          ]}
        />
      </Group>

      {ranking.isLoading && <Text size="sm" c="dimmed">Cargando...</Text>}

      {!ranking.isLoading && productos.length === 0 && (
        <Card withBorder radius="md" p="lg">
          <Text size="sm" c="dimmed" ta="center">
            No hay datos de Comandas Emitidas en este mes.
          </Text>
        </Card>
      )}

      {!ranking.isLoading && productos.length > 0 && seccionesConDatos.length === 0 && (
        <Card withBorder radius="md" p="lg">
          <Text size="sm" c="dimmed" ta="center">
            Ningún producto coincide con la búsqueda.
          </Text>
        </Card>
      )}

      {!ranking.isLoading && seccionesConDatos.length > 0 && (
        <Tabs value={seccionMostrada} onChange={setSeccionActiva} variant="pills" color="dark" keepMounted={false}>
          <Tabs.List>
            {seccionesConDatos.map((sec) => (
              <Tabs.Tab
                key={sec.clave}
                value={sec.clave}
                color={sec.color}
                leftSection={<sec.icono size={16} />}
                rightSection={
                  <Badge size="sm" variant="light" color={sec.clave === seccionMostrada ? 'white' : sec.color}>
                    {productosPorSeccion.get(sec.clave)?.length ?? 0}
                  </Badge>
                }
              >
                {sec.clave}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          {seccionesConDatos.map((sec) => (
            <Tabs.Panel key={sec.clave} value={sec.clave} pt="lg">
              <RankingPorCategoria productos={productosPorSeccion.get(sec.clave) ?? []} criterio={criterio} />
            </Tabs.Panel>
          ))}
        </Tabs>
      )}
    </Stack>
  );
}

// Ingeniería de Menú — 7º dashboard de "Análisis y Profundidad". Clasifica
// cada producto en 4 cuadrantes combinando popularidad (cantidad) y
// rentabilidad (margen_pct) — ver services/menu_engineering.py.
const CUADRANTE_INFO: Record<string, { label: string; color: string }> = {
  estrella: { label: 'Estrella', color: 'yellow' },
  caballo_batalla: { label: 'Caballo de Batalla', color: 'blue' },
  rompecabezas: { label: 'Rompecabezas', color: 'grape' },
  perro: { label: 'Perro', color: 'gray' },
};

function PanelMenuEngineering({ params }: { params: ParamsMes }) {
  const menuEngineering = useMenuEngineering(params);
  const productos = menuEngineering.data?.productos ?? [];
  const cortePopularidad = menuEngineering.data?.corte_popularidad ?? null;
  const corteMargen = menuEngineering.data?.corte_margen ?? null;
  const sinClasificar = menuEngineering.data?.sin_clasificar ?? [];

  const porCuadrante = (['estrella', 'caballo_batalla', 'rompecabezas', 'perro'] as const).map((clave) => ({
    clave,
    productos: productos
      .filter((p) => p.cuadrante === clave)
      .sort((a, b) => b.ingreso_total - a.ingreso_total)
      .slice(0, 5),
  }));

  return (
    <Stack gap="lg">
      {menuEngineering.isLoading && <Text size="sm" c="dimmed">Cargando...</Text>}

      {!menuEngineering.isLoading && productos.length === 0 && (
        <Card withBorder radius="md" p="lg">
          <Text size="sm" c="dimmed" ta="center">
            {sinClasificar.length > 0
              ? 'No hay suficientes productos con margen conocido en este rango para clasificar (mínimo 4).'
              : 'No hay datos de Comandas Emitidas en este rango.'}
          </Text>
        </Card>
      )}

      {!menuEngineering.isLoading && productos.length > 0 && (
        <>
          <Card withBorder radius="md" p="md">
            <Text size="xs" c="dimmed" mb="xs">
              Popularidad (cantidad vendida) vs. rentabilidad (margen %) — los cortes (líneas punteadas) son la
              mediana de popularidad ({cortePopularidad}) y el margen promedio ({corteMargen}%) del rango.
            </Text>
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" dataKey="cantidad" name="Cantidad" />
                <YAxis type="number" dataKey="margen_pct" name="Margen %" />
                <ZAxis range={[60, 60]} />
                <RechartsTooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ payload }) => {
                    if (!payload || payload.length === 0) return null;
                    const fila = payload[0].payload as MenuEngineeringProductoFila;
                    return (
                      <Card withBorder p="xs" radius="sm">
                        <Text size="xs" fw={600}>{fila.producto}</Text>
                        <Text size="xs" c="dimmed">Cantidad: {fila.cantidad} · Margen: {fila.margen_pct}%</Text>
                        <Text size="xs" c="dimmed">{CUADRANTE_INFO[fila.cuadrante].label}</Text>
                      </Card>
                    );
                  }}
                />
                {cortePopularidad !== null && <ReferenceLine x={cortePopularidad} stroke="gray" strokeDasharray="3 3" />}
                {corteMargen !== null && <ReferenceLine y={corteMargen} stroke="gray" strokeDasharray="3 3" />}
                <Scatter data={productos} fill="var(--mantine-color-violet-6)">
                  {productos.map((p) => (
                    <Cell key={p.producto} fill={`var(--mantine-color-${CUADRANTE_INFO[p.cuadrante].color}-6)`} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </Card>

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
            {porCuadrante.map(({ clave, productos: filas }) => {
              const info = CUADRANTE_INFO[clave];
              const iconos: Record<string, React.ReactNode> = {
                estrella: <Text size="xl">🌟</Text>,
                caballo_batalla: <Text size="xl">🐄</Text>,
                rompecabezas: <Text size="xl">❓</Text>,
                perro: <Text size="xl">🐕</Text>,
              };
              return (
                <Card
                  key={clave}
                  withBorder
                  radius="lg"
                  p="lg"
                  style={{ 
                    borderTop: `6px solid var(--mantine-color-${info.color}-5)`,
                    backgroundColor: `var(--mantine-color-${info.color}-0)`,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.02)'
                  }}
                >
                  <Group justify="space-between" mb="md" align="center">
                    <Group gap="sm">
                      {iconos[clave]}
                      <Text fw={800} size="md" c="dark.8">{info.label}</Text>
                    </Group>
                    <Badge size="md" color={info.color} variant="filled">
                      {productos.filter((p) => p.cuadrante === clave).length}
                    </Badge>
                  </Group>
                  {filas.length === 0 ? (
                    <Text size="sm" c="dimmed">Sin productos en este cuadrante.</Text>
                  ) : (
                    <Stack gap="xs">
                      {filas.map((f, i) => (
                        <Group key={f.producto} justify="space-between" wrap="nowrap" style={{ paddingBottom: 8, borderBottom: i < filas.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
                          <Text size="sm" fw={600} truncate style={{ flex: 1 }}>{f.producto}</Text>
                          <Text size="sm" fw={700} c="dark.6">{formatoMoneda.format(f.ingreso_total)}</Text>
                        </Group>
                      ))}
                    </Stack>
                  )}
                </Card>
              );
            })}
          </SimpleGrid>

          {sinClasificar.length > 0 && (
            <Text size="xs" c="dimmed">
              {sinClasificar.length} producto(s) sin match en el catálogo no se clasificaron (sin margen conocido).
            </Text>
          )}
        </>
      )}
    </Stack>
  );
}

// Panel de Turnos — cuarto dashboard de "Análisis y Profundidad".
// Comparativo Desayuno/Comida/Cena, calculado con Comandas Emitidas ×
// Recibos Emitidos (ver services/panel_turnos.py).
const TURNO_COLOR: Record<string, string> = {
  Desayuno: 'orange',
  Comida: 'red',
  Cena: 'indigo',
  'Sin Clasificar': 'gray',
};

function PanelTurnos({ params }: { params: ParamsMes }) {
  const panel = usePanelTurnos(params);
  const turnos = panel.data?.turnos ?? [];

  return (
    <Stack gap="lg">
      {panel.isLoading && <Text size="sm" c="dimmed">Cargando...</Text>}

      {!panel.isLoading && turnos.length === 0 && (
        <Card withBorder radius="md" p="lg">
          <Text size="sm" c="dimmed" ta="center">
            No hay datos de Comandas/Recibos Emitidos en este rango.
          </Text>
        </Card>
      )}

      {!panel.isLoading && turnos.length > 0 && (
        <>
          <Card withBorder radius="md" p="md">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={turnos} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="turno" />
                <YAxis />
                <RechartsTooltip formatter={(value: any) => [formatoMoneda.format(value), 'Venta neta']} />
                <Bar dataKey="total_vendido" name="Venta neta" fill="var(--mantine-color-violet-6)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <SimpleGrid cols={{ base: 1, sm: 2, md: turnos.length }} spacing="lg">
            {turnos.map((t) => (
              <Card
                key={t.turno}
                withBorder
                radius="lg"
                p="lg"
                style={{ 
                  borderTop: `6px solid var(--mantine-color-${TURNO_COLOR[t.turno] ?? 'gray'}-5)`,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                }}
              >
                <Stack gap={8}>
                  <Group justify="space-between">
                    <Text fw={800} size="lg" c="dark.8">{t.turno}</Text>
                    <Badge size="md" color={TURNO_COLOR[t.turno] ?? 'gray'} variant="filled">
                      {t.pct_participacion}%
                    </Badge>
                  </Group>
                  
                  <Text size="sm" c="dimmed" mt={8}>Venta neta</Text>
                  <Text fw={800} size="xl" style={{ fontSize: '1.6rem', color: 'var(--mantine-color-dark-9)' }}>{formatoMoneda.format(t.total_vendido)}</Text>
                  
                  <Divider my="sm" variant="dashed" />

                  <Group justify="space-between" align="center">
                    <Text size="sm" c="dimmed">Ticket promedio</Text>
                    <Text size="md" fw={700}>{formatoMoneda.format(t.ticket_promedio)}</Text>
                  </Group>
                  <Group justify="space-between" align="center">
                    <Text size="sm" c="dimmed">Cuentas / Piezas</Text>
                    <Text size="sm" fw={600}>{t.cantidad_cuentas} / {t.piezas_vendidas}</Text>
                  </Group>
                  <Group justify="space-between" align="center">
                    <Text size="sm" c="dimmed">Margen %</Text>
                    <Text size="sm" fw={600}>{t.margen_pct !== null ? `${t.margen_pct}%` : '—'}</Text>
                  </Group>
                </Stack>
              </Card>
            ))}
          </SimpleGrid>
        </>
      )}
    </Stack>
  );
}

// Mix de Ventas — 8º dashboard de "Análisis y Profundidad". Distribución de
// ventas por grupo, categoría, sección de menú y turno (ver
// services/mix_ventas.py) — responde "¿qué sostiene realmente las ventas?".
type DimensionMixVentas = 'grupo' | 'categoria_tipo' | 'seccion_menu' | 'turno';

function PanelMixVentas({ params }: { params: ParamsMes }) {
  const [dimension, setDimension] = useState<DimensionMixVentas>('grupo');
  const mix = useMixVentas(params);

  const filas: { etiqueta: string; pct_participacion: number; ingreso_total: number; margen_pct: number | null }[] =
    dimension === 'grupo'
      ? (mix.data?.grupo ?? []).map((g) => ({ etiqueta: g.grupo, pct_participacion: g.pct_participacion, ingreso_total: g.ingreso_total, margen_pct: g.margen_pct }))
      : dimension === 'turno'
      ? (mix.data?.turno ?? []).map((t) => ({ etiqueta: t.turno, pct_participacion: t.pct_participacion, ingreso_total: t.total_vendido, margen_pct: t.margen_pct }))
      : ((mix.data?.[dimension] ?? []) as MixVentasFila[]).map((f) => ({ etiqueta: f.etiqueta, pct_participacion: f.pct_participacion, ingreso_total: f.ingreso_total, margen_pct: f.margen_pct }));

  const filasOrdenadas = [...filas].sort((a, b) => b.pct_participacion - a.pct_participacion);

  return (
    <Stack gap="lg">
      <Group align="flex-end" gap="md">
        <SegmentedControl
          value={dimension}
          onChange={(v) => setDimension(v as DimensionMixVentas)}
          data={[
            { label: 'Grupo', value: 'grupo' },
            { label: 'Categoría', value: 'categoria_tipo' },
            { label: 'Sección', value: 'seccion_menu' },
            { label: 'Turno', value: 'turno' },
          ]}
        />
      </Group>

      {mix.isLoading && <Text size="sm" c="dimmed">Cargando...</Text>}

      {!mix.isLoading && filasOrdenadas.length === 0 && (
        <Card withBorder radius="md" p="lg">
          <Text size="sm" c="dimmed" ta="center">
            No hay datos de Comandas/Recibos Emitidos en este rango.
          </Text>
        </Card>
      )}

      {!mix.isLoading && filasOrdenadas.length > 0 && (
        <>
          <Card withBorder radius="md" p="md">
            <ResponsiveContainer width="100%" height={Math.max(180, filasOrdenadas.length * 36)}>
              <BarChart data={filasOrdenadas} layout="vertical" margin={{ left: 16, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" unit="%" />
                <YAxis type="category" dataKey="etiqueta" width={140} />
                <RechartsTooltip formatter={(value: any) => [`${value}%`, 'Participación']} />
                <Bar dataKey="pct_participacion" name="Participación" fill="var(--mantine-color-violet-6)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{dimension === 'grupo' ? 'Grupo' : dimension === 'turno' ? 'Turno' : dimension === 'categoria_tipo' ? 'Categoría' : 'Sección'}</Table.Th>
                <Table.Th>% Participación</Table.Th>
                <Table.Th>Ingreso</Table.Th>
                <Table.Th>Margen %</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filasOrdenadas.map((f) => (
                <Table.Tr key={f.etiqueta}>
                  <Table.Td>{f.etiqueta}</Table.Td>
                  <Table.Td>{f.pct_participacion}%</Table.Td>
                  <Table.Td>{formatoMoneda.format(f.ingreso_total)}</Table.Td>
                  <Table.Td>{f.margen_pct !== null ? `${f.margen_pct}%` : '—'}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </>
      )}
    </Stack>
  );
}

// Dashboard de Cortesías — 5º dashboard de "Análisis y Profundidad".
// Impacto económico y ranking de productos con más cortesías (ver
// services/cortesias_dashboard.py). El desglose por día/turno solo cubre
// lotes de Productos Vendidos de un solo día — un lote de varios días
// aporta al total/ranking pero no se puede atribuir a un día/turno exacto.
// Fuente principal: Recibos Emitidos (`tipo = CORTESIA`) — cubre todos los
// meses y trae el departamento que consumió. `montoPv` (Productos Vendidos,
// puede ser 0 si ese mes no trae Impuesto) solo sirve de control cruzado.
function CortesiasDesdeRecibos({ data, montoPv }: { data: CortesiasRecibos; montoPv: number }) {
  const maxDepto = Math.max(1, ...data.por_departamento.map((d) => d.monto));
  const otros = data.otros_no_comerciales;
  const difPv = montoPv > 0 ? Math.round(((montoPv - data.total_monto_cortesia) / data.total_monto_cortesia) * 1000) / 10 : null;

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <Card withBorder radius="md" p="md" style={{ borderLeft: '4px solid var(--mantine-color-pink-6)' }}>
          <Text size="xs" c="dimmed">Cortesías del mes</Text>
          <Text fw={700} size="lg">{formatoMoneda.format(data.total_monto_cortesia)}</Text>
          <Text size="xs" c="dimmed">a precio de lista, sin IVA</Text>
        </Card>
        <Card withBorder radius="md" p="md" style={{ borderLeft: '4px solid var(--mantine-color-grape-6)' }}>
          <Text size="xs" c="dimmed">Cuentas en cortesía</Text>
          <Text fw={700} size="lg">{data.cuentas_cortesia}</Text>
        </Card>
        <Card withBorder radius="md" p="md" style={{ borderLeft: '4px solid var(--mantine-color-orange-6)' }}>
          <Text size="xs" c="dimmed">% de la venta neta</Text>
          <Text fw={700} size="lg">{data.pct_de_venta_neta !== null ? `${data.pct_de_venta_neta}%` : '—'}</Text>
        </Card>
      </SimpleGrid>

      {data.por_departamento.length > 0 && (
        <Card withBorder radius="md" p="md">
          <Text fw={600} size="sm" mb="xs">Por departamento</Text>
          <Stack gap={6}>
            {data.por_departamento.slice(0, 12).map((d) => (
              <div key={d.segmento}>
                <Group justify="space-between" wrap="nowrap">
                  <Text size="sm" truncate>{d.segmento}</Text>
                  <Text size="sm" fw={600} style={{ flexShrink: 0 }}>
                    {formatoMoneda.format(d.monto)} <Text span size="xs" c="dimmed">· {d.cuentas} ctas</Text>
                  </Text>
                </Group>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--mantine-color-pink-1)' }}>
                  <div style={{ width: `${(d.monto / maxDepto) * 100}%`, height: '100%', borderRadius: 3, background: 'var(--mantine-color-pink-6)' }} />
                </div>
              </div>
            ))}
          </Stack>
          {data.por_departamento.length > 12 && (
            <Text size="xs" c="dimmed" mt="xs">+ {data.por_departamento.length - 12} departamentos menores</Text>
          )}
        </Card>
      )}

      {data.por_turno.length > 0 && (
        <Card withBorder radius="md" p="md">
          <Text fw={600} size="sm" mb="xs">Por turno</Text>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.por_turno} margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="turno" />
              <YAxis />
              <RechartsTooltip formatter={(value: any) => [formatoMoneda.format(value), 'Cortesía']} />
              <Bar dataKey="monto" name="Cortesía" fill="var(--mantine-color-pink-6)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {data.mayores_cuentas.length > 0 && (
        <Card withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
          <Text fw={600} size="sm" p="md" pb="xs">Cuentas más altas</Text>
          <Table.ScrollContainer minWidth={420}>
            <Table verticalSpacing="xs" horizontalSpacing="md" highlightOnHover>
              <Table.Thead style={{ background: 'var(--mantine-color-default-hover)' }}>
                <Table.Tr>
                  <Table.Th style={ESTILO_ENCABEZADO_TABLA}>Fecha</Table.Th>
                  <Table.Th style={ESTILO_ENCABEZADO_TABLA}>Cuenta</Table.Th>
                  <Table.Th style={ESTILO_ENCABEZADO_TABLA}>Departamento</Table.Th>
                  <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Monto</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.mayores_cuentas.map((c, i) => (
                  <Table.Tr key={`${c.fecha}-${c.cuenta}-${i}`}>
                    <Table.Td>{c.fecha}</Table.Td>
                    <Table.Td>{c.cuenta ?? '—'}</Table.Td>
                    <Table.Td><Text size="sm" truncate maw={220}>{c.segmento}</Text></Table.Td>
                    <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatoMoneda.format(c.monto)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      )}

      <Text size="xs" c="dimmed">
        No se suman como cortesía: consumo al costo {formatoMoneda.format(otros.al_costo.monto)} ({otros.al_costo.cuentas} ctas)
        y consumo interno de cuentas HOTEL {formatoMoneda.format(otros.consumo_interno.monto)} ({otros.consumo_interno.cuentas} ctas).
        {difPv !== null && ` Control: Productos Vendidos estima ${formatoMoneda.format(montoPv)} (${difPv > 0 ? '+' : ''}${difPv}%).`}
      </Text>
    </Stack>
  );
}

function PanelCortesias({ params }: { params: ParamsMes }) {
  const cortesias = useCortesiasDashboard(params);
  const resumen = cortesias.data?.resumen;
  const recibosCortesias = cortesias.data?.recibos;
  const porTurno = cortesias.data?.por_turno ?? [];
  const productosTop = (resumen?.productos ?? []).slice(0, 20);

  return (
    <Stack gap="lg">
      {cortesias.isLoading && (
        <Stack gap="sm">
          <Skeleton height={70} radius="md" />
          <Skeleton height={160} radius="md" />
        </Stack>
      )}

      {!cortesias.isLoading && recibosCortesias && recibosCortesias.cuentas_cortesia === 0 && (
        <Card withBorder radius="md" p="lg">
          <Text size="sm" c="dimmed" ta="center">No hay cuentas de cortesía en Recibos Emitidos en este mes.</Text>
        </Card>
      )}

      {!cortesias.isLoading && recibosCortesias && recibosCortesias.cuentas_cortesia > 0 && (
        <CortesiasDesdeRecibos data={recibosCortesias} montoPv={resumen?.total_monto_cortesia ?? 0} />
      )}

      {!cortesias.isLoading && resumen && (
        <Divider label="Detalle por producto (Productos Vendidos)" labelPosition="left" />
      )}

      {!cortesias.isLoading && resumen && resumen.productos.length === 0 && (
        <Text size="sm" c="dimmed">
          No hay detalle por producto este mes: Productos Vendidos no está cargado o no trae la columna de Impuesto.
        </Text>
      )}

      {!cortesias.isLoading && resumen && resumen.productos.length > 0 && (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Card withBorder radius="md" p="md" style={{ borderLeft: '4px solid var(--mantine-color-pink-6)' }}>
              <Stack gap={4}>
                <Text size="xs" c="dimmed">Impacto económico total</Text>
                <Text fw={700} size="lg">{formatoMoneda.format(resumen.total_monto_cortesia)}</Text>
              </Stack>
            </Card>
            <Card withBorder radius="md" p="md" style={{ borderLeft: '4px solid var(--mantine-color-grape-6)' }}>
              <Stack gap={4}>
                <Text size="xs" c="dimmed">Cantidad total de cortesías</Text>
                <Text fw={700} size="lg">{resumen.total_cantidad_cortesia}</Text>
              </Stack>
            </Card>
          </SimpleGrid>

          {(cortesias.data?.dias_excluidos_por_lote_multi_dia ?? 0) > 0 && (
            <Card withBorder radius="md" p="sm" style={{ borderLeft: '4px solid var(--mantine-color-yellow-6)' }}>
              <Text size="xs" c="dimmed">
                {cortesias.data?.dias_excluidos_por_lote_multi_dia} lote(s) de Productos Vendidos de varios días
                quedaron fuera del desglose por día/turno de abajo (sí están incluidos en el total e impacto
                económico) — solo los lotes subidos día por día tienen esa granularidad.
              </Text>
            </Card>
          )}

          {porTurno.length > 0 && (
            <Card withBorder radius="md" p="md">
              <Text fw={600} size="sm" mb="xs">Cortesías por turno</Text>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={porTurno} margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="turno" />
                  <YAxis />
                  <RechartsTooltip formatter={(value: any) => [formatoMoneda.format(value), 'Cortesía']} />
                  <Bar dataKey="monto_cortesia" name="Cortesía" fill="var(--mantine-color-pink-6)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Producto</Table.Th>
                <Table.Th>Cantidad cortesía</Table.Th>
                <Table.Th>Monto cortesía</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {productosTop.map((fila) => (
                <Table.Tr key={fila.producto}>
                  <Table.Td>{fila.producto}</Table.Td>
                  <Table.Td>{fila.cantidad_cortesia}</Table.Td>
                  <Table.Td>{formatoMoneda.format(fila.monto_cortesia)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </>
      )}
    </Stack>
  );
}

// Dependencia de Productos — 9º dashboard de "Análisis y Profundidad".
// Tabla de concentración de ingreso estilo Pareto (ver
// services/dependencia_productos.py) — responde "¿qué tan dependiente es el
// negocio de unos pocos productos?".
function PanelDependenciaProductos({ params }: { params: ParamsMes }) {
  const dependencia = useDependenciaProductos(params);
  const filas = dependencia.data?.filas ?? [];
  const top5Pct = dependencia.data?.top5_pct ?? null;
  const top10Pct = dependencia.data?.top10_pct ?? null;

  return (
    <Stack gap="lg">
      {dependencia.isLoading && <Text size="sm" c="dimmed">Cargando...</Text>}

      {!dependencia.isLoading && filas.length === 0 && (
        <Card withBorder radius="md" p="lg">
          <Text size="sm" c="dimmed" ta="center">
            No hay suficientes productos con ingreso en este rango (mínimo 5) para calcular la concentración.
          </Text>
        </Card>
      )}

      {!dependencia.isLoading && filas.length > 0 && (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Card withBorder radius="md" p="md" style={{ borderLeft: '4px solid var(--mantine-color-violet-6)' }}>
              <Stack gap={4}>
                <Text size="xs" c="dimmed">Top 5 productos concentran</Text>
                <Text fw={700} size="lg">{top5Pct !== null ? `${top5Pct}%` : '—'} del ingreso</Text>
              </Stack>
            </Card>
            <Card withBorder radius="md" p="md" style={{ borderLeft: '4px solid var(--mantine-color-indigo-6)' }}>
              <Stack gap={4}>
                <Text size="xs" c="dimmed">Top 10 productos concentran</Text>
                <Text fw={700} size="lg">{top10Pct !== null ? `${top10Pct}%` : '—'} del ingreso</Text>
              </Stack>
            </Card>
          </SimpleGrid>

          <Card withBorder radius="md" p="md">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={filas.slice(0, 20)} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="producto" hide />
                <YAxis yAxisId="ingreso" />
                <YAxis yAxisId="pct" orientation="right" unit="%" domain={[0, 100]} />
                <RechartsTooltip
                  formatter={(value: any, name: any) =>
                    name === 'ingreso_total' ? [formatoMoneda.format(value), 'Ingreso'] : [`${value}%`, '% Acumulado']
                  }
                  labelFormatter={(label: any) => label}
                />
                <Bar yAxisId="ingreso" dataKey="ingreso_total" name="ingreso_total" fill="var(--mantine-color-violet-4)" radius={[4, 4, 0, 0]} />
                <Line yAxisId="pct" type="monotone" dataKey="pct_acumulado" name="pct_acumulado" stroke="var(--mantine-color-red-6)" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <Text size="xs" c="dimmed" mt="xs">Barras = ingreso por producto (top 20). Línea = % acumulado del ingreso.</Text>
          </Card>

          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>#</Table.Th>
                <Table.Th>Producto</Table.Th>
                <Table.Th>Ingreso</Table.Th>
                <Table.Th>% Individual</Table.Th>
                <Table.Th>% Acumulado</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filas.map((f) => (
                <Table.Tr key={f.producto}>
                  <Table.Td>{f.rank}</Table.Td>
                  <Table.Td>{f.producto}</Table.Td>
                  <Table.Td>{formatoMoneda.format(f.ingreso_total)}</Table.Td>
                  <Table.Td>{f.pct_individual}%</Table.Td>
                  <Table.Td>{f.pct_acumulado}%</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </>
      )}
    </Stack>
  );
}

const SEVERIDAD_COLOR: Record<string, string> = {
  alta: 'red',
  media: 'orange',
  baja: 'gray',
};

const DIAS_SEMANA_OPORTUNIDADES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function TarjetaOportunidad({ op }: { op: OportunidadComercial }) {
  return (
    <Card
      withBorder
      radius="md"
      p="sm"
      style={{ borderLeft: `4px solid var(--mantine-color-${SEVERIDAD_COLOR[op.severidad]}-6)` }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Text size="sm">{op.mensaje}</Text>
        <Badge size="xs" color={SEVERIDAD_COLOR[op.severidad]} variant="light" style={{ flexShrink: 0 }}>
          {op.severidad}
        </Badge>
      </Group>
      <Group gap={4} mt={4} wrap="nowrap" align="flex-start">
        <IconBulb size={14} style={{ marginTop: 2, flexShrink: 0 }} color="var(--mantine-color-dimmed)" />
        <Text size="xs" c="dimmed">{op.accion_sugerida}</Text>
      </Group>
    </Card>
  );
}

// Panel de Oportunidades Comerciales — 6º dashboard de "Análisis y
// Profundidad". Hallazgos automáticos con severidad y acción sugerida (ver
// services/oportunidades_comerciales.py) — cierra la pregunta del brief
// "¿qué oportunidades comerciales existen?". Agrupado por día de la semana
// cuando la oportunidad está atada a uno (hoy solo "hora_muerta"); el resto
// (declive, concentración, grupo subutilizado, producto desaprovechado) cae
// en una sección "General" — más fácil de leer que la lista plana anterior.
function PanelOportunidades({ params }: { params: ParamsMes }) {
  const oportunidades = useOportunidadesComerciales(params);
  const lista = oportunidades.data?.oportunidades ?? [];

  const generales = lista.filter((op) => op.dia_semana === null);
  const porDia = new Map<number, OportunidadComercial[]>();
  for (const op of lista) {
    if (op.dia_semana !== null) {
      const grupo = porDia.get(op.dia_semana) ?? [];
      grupo.push(op);
      porDia.set(op.dia_semana, grupo);
    }
  }
  const diasConDatos = DIAS_SEMANA_OPORTUNIDADES.map((_, dia) => dia).filter((dia) => porDia.has(dia));

  return (
    <Stack gap="lg">
      {oportunidades.isLoading && <Text size="sm" c="dimmed">Cargando...</Text>}

      {!oportunidades.isLoading && lista.length === 0 && (
        <Card withBorder radius="md" p="lg">
          <Text size="sm" c="dimmed" ta="center">
            Sin oportunidades detectadas en este rango — buena señal.
          </Text>
        </Card>
      )}

      {!oportunidades.isLoading && lista.length > 0 && (
        <Stack gap="lg">
          {generales.length > 0 && (
            <Stack gap="xs">
              <Text fw={700} size="sm" c="dimmed">General</Text>
              {generales.map((op, i) => (
                <TarjetaOportunidad key={i} op={op} />
              ))}
            </Stack>
          )}
          {diasConDatos.map((dia) => (
            <Stack key={dia} gap="xs">
              <Text fw={700} size="sm" c="dimmed">{DIAS_SEMANA_OPORTUNIDADES[dia]}</Text>
              {porDia.get(dia)!.map((op, i) => (
                <TarjetaOportunidad key={i} op={op} />
              ))}
            </Stack>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

// Panel de Alertas de Riesgo — 10º dashboard de "Análisis y Profundidad".
// Hallazgos ejecutivos de riesgo con severidad y acción sugerida (ver
// services/alertas_riesgo.py) — misma estructura visual que Oportunidades.
function PanelAlertasRiesgo({ params }: { params: ParamsMes }) {
  const alertasRiesgo = useAlertasRiesgo(params);
  const lista = alertasRiesgo.data?.alertas ?? [];

  return (
    <Stack gap="lg">
      {alertasRiesgo.isLoading && <Text size="sm" c="dimmed">Cargando...</Text>}

      {!alertasRiesgo.isLoading && lista.length === 0 && (
        <Card withBorder radius="md" p="lg">
          <Text size="sm" c="dimmed" ta="center">
            Sin alertas de riesgo detectadas en este rango — buena señal.
          </Text>
        </Card>
      )}

      {!alertasRiesgo.isLoading && lista.length > 0 && (
          <Stack gap="md">
            {lista.map((a: AlertaRiesgo, i: number) => {
              const color = SEVERIDAD_COLOR[a.severidad];
              const isCritico = a.severidad === 'alta';
              return (
                <Card
                  key={i}
                  withBorder
                  radius="md"
                  p="md"
                  style={{ 
                    borderLeft: `6px solid var(--mantine-color-${color}-6)`,
                    backgroundColor: isCritico ? `var(--mantine-color-${color}-0)` : 'var(--mantine-color-body)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                  }}
                >
                  <Group gap="md" wrap="nowrap" align="flex-start">
                    <ThemeIcon size={36} radius="md" color={color} variant={isCritico ? "filled" : "light"} mt={2}>
                      <IconShieldExclamation size={20} />
                    </ThemeIcon>
                    <div style={{ flex: 1 }}>
                      <Group justify="space-between" align="center" wrap="nowrap" mb={4}>
                        <Text size="md" fw={600} c="dark.8">{a.mensaje}</Text>
                        <Badge size="xs" color={color} variant={isCritico ? "filled" : "light"} style={{ flexShrink: 0 }}>
                          {a.severidad}
                        </Badge>
                      </Group>
                      <Group gap={6} wrap="nowrap" align="center">
                        <IconBulb size={14} color="var(--mantine-color-dimmed)" />
                        <Text size="sm" c="dimmed">{a.accion_sugerida}</Text>
                      </Group>
                    </div>
                  </Group>
                </Card>
              );
            })}
          </Stack>
      )}
    </Stack>
  );
}

// Desempeño Comercial — 11º dashboard de "Análisis y Profundidad", nueva
// pestaña de nivel superior (no vive dentro de un grupo, a diferencia de las
// otras 9 vistas) orientada a Contraloría/Gerencia. Compara el mes elegido
// contra el periodo anterior de igual duración — todo el cálculo ya viene
// resuelto del backend (services/desempeno_comercial.py), este componente
// solo presenta las 10 secciones del pedido original.
function TarjetaKpiDesempeno({ titulo, kpi, mostrarDiferencia }: { titulo: string; kpi: ComparacionKpiDesempeno; mostrarDiferencia: boolean }) {
  const esMoneda = titulo !== 'Cantidad vendida' && titulo !== 'Cuentas';
  const formatear = (v: number) => (esMoneda ? formatoMoneda.format(v) : `${v}`);
  return (
    <Card withBorder radius="lg" p="md" style={{ background: 'rgba(255, 255, 255, 0.65)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.4)', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
      <Stack gap={4}>
        <Text size="sm" fw={600} c="dimmed">{titulo}</Text>
        <Text fw={800} size="xl" style={{ fontSize: '1.6rem', color: 'var(--mantine-color-dark-9)' }}>{formatear(kpi.actual)}</Text>
        <Group justify="space-between" align="center" mt={4}>
          <Text size="xs" c="dimmed">Ant: {formatear(kpi.anterior)}</Text>
          <Group gap={4}>
            {mostrarDiferencia && (
              <Badge size="xs" color={kpi.diferencia >= 0 ? 'teal' : 'red'} variant="light">
                {kpi.diferencia >= 0 ? '+' : ''}{formatear(kpi.diferencia)}
              </Badge>
            )}
            {kpi.variacion_pct !== null && (
              <Badge size="xs" color={kpi.variacion_pct >= 0 ? 'teal' : 'red'} variant="filled">
                {kpi.variacion_pct >= 0 ? '▲' : '▼'} {Math.abs(kpi.variacion_pct)}%
              </Badge>
            )}
          </Group>
        </Group>
      </Stack>
    </Card>
  );
}

function ListaImpulsores({ titulo, color, filas }: { titulo: string; color: string; filas: ProductoComparadoDesempeno[] }) {
  const isPositivo = color === 'teal';
  const Icono = isPositivo ? IconTrendingUp : IconTrendingDown;
  return (
    <Card withBorder radius="md" p="md" style={{ borderTop: `4px solid var(--mantine-color-${color}-5)`, boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
      <Group gap="xs" mb="sm">
        <ThemeIcon size={28} radius="xl" color={color} variant="light">
          <Icono size={16} />
        </ThemeIcon>
        <Text fw={700} size="sm" c="dark.8">{titulo}</Text>
      </Group>
      {filas.length === 0 ? (
        <Text size="xs" c="dimmed">Sin datos suficientes.</Text>
      ) : (
        <Stack gap="sm">
          {filas.map((f, i) => (
            <Group key={f.producto} justify="space-between" wrap="nowrap" style={{ paddingBottom: 6, borderBottom: i < filas.length - 1 ? '1px solid var(--mantine-color-gray-2)' : 'none' }}>
              <Text size="sm" fw={500} truncate style={{ flex: 1 }}>{f.producto}</Text>
              <Badge color={color} variant="light" size="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {f.contribucion >= 0 ? '+' : ''}{formatoMoneda.format(f.contribucion)}
              </Badge>
            </Group>
          ))}
        </Stack>
      )}
    </Card>
  );
}

function TablaComparativoDimension({ filas, campo, etiquetaColumna }: { filas: ComparativoDimensionDesempeno[]; campo: 'grupo' | 'etiqueta'; etiquetaColumna: string }) {
  return (
    <Card withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
      <Table.ScrollContainer minWidth={640}>
        <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
          <Table.Thead style={{ background: 'var(--mantine-color-default-hover)', borderBottom: '2px solid var(--mantine-color-default-border)' }}>
            <Table.Tr>
              <Table.Th style={ESTILO_ENCABEZADO_TABLA}>{etiquetaColumna}</Table.Th>
              <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Ingreso actual</Table.Th>
              <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Ingreso anterior</Table.Th>
              <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Variación %</Table.Th>
              <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Participación</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filas.map((f) => (
              <Table.Tr key={f[campo]}>
                <Table.Td><Text size="sm" fw={500}>{f[campo]}</Text></Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatoMoneda.format(f.ingreso_actual)}</Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatoMoneda.format(f.ingreso_anterior)}</Table.Td>
                <Table.Td ta="right">
                  {f.variacion_pct === null ? (
                    <Badge size="xs" color="gray" variant="light">nuevo</Badge>
                  ) : (
                    <Badge size="xs" color={f.variacion_pct >= 0 ? 'teal' : 'red'} variant="light" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {f.variacion_pct >= 0 ? '+' : ''}{f.variacion_pct}%
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{f.pct_participacion}%</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );
}

function TablaProductosComparadosDesempeno({ filas }: { filas: ProductoComparadoDesempeno[] }) {
  return (
    <Card withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
      <Table.ScrollContainer minWidth={560}>
        <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
          <Table.Thead style={{ background: 'var(--mantine-color-default-hover)', borderBottom: '2px solid var(--mantine-color-default-border)' }}>
            <Table.Tr>
              <Table.Th style={ESTILO_ENCABEZADO_TABLA}>Producto</Table.Th>
              <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Ingreso actual</Table.Th>
              <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Ingreso anterior</Table.Th>
              <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Diferencia $</Table.Th>
              <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Diferencia %</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filas.map((f) => (
              <Table.Tr key={f.producto}>
                <Table.Td><Text size="sm" fw={500}>{f.producto}</Text></Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatoMoneda.format(f.ingreso_actual)}</Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatoMoneda.format(f.ingreso_anterior)}</Table.Td>
                <Table.Td ta="right">
                  <Badge size="xs" color={f.contribucion >= 0 ? 'teal' : 'red'} variant="light" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {f.contribucion >= 0 ? '+' : ''}{formatoMoneda.format(f.contribucion)}
                  </Badge>
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {f.contribucion_pct !== null ? `${f.contribucion_pct >= 0 ? '+' : ''}${f.contribucion_pct}%` : '—'}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );
}

function BarraParticipacionDesempeno({ filas }: { filas: ComparativoDimensionDesempeno[] }) {
  const max = Math.max(1, ...filas.map((f) => f.pct_participacion));
  return (
    <Card withBorder radius="md" p="md">
      <Stack gap={8}>
        {filas.map((f) => (
          <Group key={f.grupo ?? f.etiqueta} gap="sm" wrap="nowrap" align="center">
            <Text size="sm" fw={500} style={{ width: 140, flexShrink: 0 }} truncate>{f.grupo ?? f.etiqueta}</Text>
            <div style={{ flex: 1, height: 10, borderRadius: 4, background: 'var(--mantine-color-default-hover)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(f.pct_participacion / max) * 100}%`, background: 'var(--mantine-color-violet-6)', borderRadius: 4 }} />
            </div>
            <Text size="sm" fw={600} style={{ width: 48, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{f.pct_participacion}%</Text>
          </Group>
        ))}
      </Stack>
    </Card>
  );
}

function PanelDesempenoComercialResumen({ params }: { params: ParamsMes }) {
  const desempeno = useDesempenoComercial(params);
  const data = desempeno.data;

  return (
    <Stack gap="xl">
      {desempeno.isLoading && <Text size="sm" c="dimmed">Cargando...</Text>}

      {!desempeno.isLoading && data && (
        <>
          <Text size="xs" c="dimmed">
            Comparando {data.fecha_desde} — {data.fecha_hasta} contra el periodo anterior ({data.fecha_desde_anterior} — {data.fecha_hasta_anterior}).
          </Text>

          <Stack gap="xs">
            <Text fw={700} size="sm">Resumen comparativo</Text>
            <Card 
              withBorder 
              radius="xl" 
              p="xl" 
              style={{ 
                background: 'linear-gradient(135deg, var(--mantine-color-indigo-light) 0%, var(--mantine-color-blue-1) 100%)',
                border: '1px solid var(--mantine-color-indigo-2)',
                boxShadow: '0 8px 32px rgba(59, 91, 219, 0.08)'
              }}
            >
              <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
                <TarjetaKpiDesempeno titulo="Ventas" kpi={data.kpis.ventas} mostrarDiferencia />
                <TarjetaKpiDesempeno titulo="Cantidad vendida" kpi={data.kpis.cantidad_vendida} mostrarDiferencia />
                <TarjetaKpiDesempeno titulo="Ticket promedio" kpi={data.kpis.ticket_promedio} mostrarDiferencia={false} />
                <TarjetaKpiDesempeno titulo="Cuentas" kpi={data.kpis.cuentas} mostrarDiferencia={false} />
              </SimpleGrid>
            </Card>
          </Stack>

          <Stack gap="xs">
            <Text fw={700} size="sm">Qué explica el crecimiento</Text>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <ListaImpulsores titulo="Top impulsores positivos" color="teal" filas={data.productos_comparados.positivos} />
              <ListaImpulsores titulo="Top impulsores negativos" color="red" filas={data.productos_comparados.negativos} />
            </SimpleGrid>
          </Stack>

          <Stack gap="xs">
            <Text fw={700} size="sm">Comparativo por grupo</Text>
            <TablaComparativoDimension filas={data.grupos_comparados} campo="grupo" etiquetaColumna="Grupo" />
          </Stack>

          <Stack gap="xs">
            <Text fw={700} size="sm">Comparativo por categoría</Text>
            <TablaComparativoDimension filas={data.categoria_comparada} campo="etiqueta" etiquetaColumna="Categoría" />
          </Stack>

          <Stack gap="xs">
            <Text fw={700} size="sm">Comparativo por sección</Text>
            <TablaComparativoDimension filas={data.seccion_comparada} campo="etiqueta" etiquetaColumna="Sección" />
          </Stack>

          <Stack gap="xs">
            <Text fw={700} size="sm">Top ganadores</Text>
            {data.top_ganadores.length === 0 ? (
              <Text size="xs" c="dimmed">Sin datos suficientes.</Text>
            ) : (
              <TablaProductosComparadosDesempeno filas={data.top_ganadores} />
            )}
          </Stack>

          <Stack gap="xs">
            <Text fw={700} size="sm">Top perdedores</Text>
            {data.top_perdedores.length === 0 ? (
              <Text size="xs" c="dimmed">Sin datos suficientes.</Text>
            ) : (
              <TablaProductosComparadosDesempeno filas={data.top_perdedores} />
            )}
          </Stack>

          <Stack gap="xs">
            <Text fw={700} size="sm">Productos nuevos</Text>
            {data.productos_nuevos.length === 0 ? (
              <Text size="xs" c="dimmed">Sin productos nuevos en este periodo.</Text>
            ) : (
              <Card withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
                <Table.ScrollContainer minWidth={420}>
                  <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
                    <Table.Thead style={{ background: 'var(--mantine-color-default-hover)', borderBottom: '2px solid var(--mantine-color-default-border)' }}>
                      <Table.Tr>
                        <Table.Th style={ESTILO_ENCABEZADO_TABLA}>Producto</Table.Th>
                        <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Ingreso</Table.Th>
                        <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Cantidad</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {data.productos_nuevos.map((p) => (
                        <Table.Tr key={p.producto}>
                          <Table.Td><Text size="sm" fw={500}>{p.producto}</Text></Table.Td>
                          <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatoMoneda.format(p.ingreso_total)}</Table.Td>
                          <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{p.cantidad}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              </Card>
            )}
          </Stack>

          <Stack gap="xs">
            <Text fw={700} size="sm">Participación de ventas</Text>
            <BarraParticipacionDesempeno filas={data.participacion_grupos} />
          </Stack>

          <Stack gap="xs">
            <Text fw={700} size="sm">Hallazgos automáticos</Text>
            {data.hallazgos.length === 0 ? (
              <Text size="sm" c="dimmed">No hay suficientes datos en este periodo para generar hallazgos.</Text>
            ) : (
              <Stack gap="xs">
                {data.hallazgos.map((h: HallazgoDesempeno, i: number) => (
                  <Card key={i} withBorder radius="md" p="sm" style={{ borderLeft: `4px solid var(--mantine-color-${TONO_INSIGHT_COLOR[h.tono]}-6)` }}>
                    <Text size="sm">{h.mensaje}</Text>
                    <Group gap={4} mt={4} wrap="nowrap" align="flex-start">
                      <IconBulb size={14} style={{ marginTop: 2, flexShrink: 0 }} color="var(--mantine-color-dimmed)" />
                      <Text size="xs" c="dimmed">{h.accion_sugerida}</Text>
                    </Group>
                  </Card>
                ))}
              </Stack>
            )}
          </Stack>
        </>
      )}
    </Stack>
  );
}

// Optimización de Precios — sub-vista de "Desempeño Comercial". Cruza Costeo
// (costo/precio/estado por producto — mismo cálculo que el tab Costeo, ver
// services/costeo_recetas.py::calcular_costeo) con Comandas del mes elegido
// para analizar la RENTABILIDAD real del catálogo completo (no solo
// "REQ AJUSTE": el estado resalta, no filtra), con la misma navegación
// jerárquica Sección → Categoría → Grupo → Tabla que usa Catálogo/Ranking de
// Productos. Todo el dinero de oportunidad va sin IVA (subtotal, no ingreso
// bruto — el IVA no es utilidad). Foto de un solo periodo, sin comparación
// contra el mes anterior (a diferencia del resto de Desempeño Comercial).

function agruparCosteoPorCampo(
  productos: ProductoCosteoAnalisis[],
  campo: 'seccion_menu' | 'categoria_tipo' | 'grupo',
): Map<string, ProductoCosteoAnalisis[]> {
  const mapa = new Map<string, ProductoCosteoAnalisis[]>();
  for (const producto of productos) {
    const clave = producto[campo] ?? 'Sin Clasificar';
    const lista = mapa.get(clave) ?? [];
    lista.push(producto);
    mapa.set(clave, lista);
  }
  return mapa;
}

const RESUMEN_NIVEL_VACIO: ResumenNivelCosteo = {
  clave: '',
  productos: 0,
  cantidad_vendida: 0,
  subtotal: 0,
  pct_costo_promedio: 0,
  pct_costo_objetivo: 0,
  diferencia_promedio: 0,
  incremento_potencial_estimado: 0,
};

function buscarResumenNivel(resumenes: ResumenNivelCosteo[], clave: string): ResumenNivelCosteo {
  return resumenes.find((r) => r.clave === clave) ?? { ...RESUMEN_NIVEL_VACIO, clave };
}

// Tarjeta de resumen de rentabilidad, reusada en los 3 niveles de la
// jerarquía (Sección/Categoría/Grupo) antes de bajar al siguiente nivel.
function CardResumenNivel({ resumen, color }: { resumen: ResumenNivelCosteo; color: string }) {
  return (
    <Card withBorder radius="md" p="md" style={{ borderLeft: `4px solid var(--mantine-color-${color}-6)` }}>
      <SimpleGrid cols={{ base: 2, sm: 4, md: 7 }} spacing="md">
        <Stack gap={2}>
          <Text size="xs" c="dimmed">Productos</Text>
          <Text fw={700} size="sm">{resumen.productos}</Text>
        </Stack>
        <Stack gap={2}>
          <Text size="xs" c="dimmed">Cantidad vendida</Text>
          <Text fw={700} size="sm">{resumen.cantidad_vendida}</Text>
        </Stack>
        <Stack gap={2}>
          <Text size="xs" c="dimmed">Subtotal</Text>
          <Text fw={700} size="sm">{formatoMoneda.format(resumen.subtotal)}</Text>
        </Stack>
        <Stack gap={2}>
          <Text size="xs" c="dimmed">% costo promedio</Text>
          <Badge size="sm" variant="light" color={colorPorcentajeCosto(resumen.pct_costo_promedio, 100)} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {resumen.pct_costo_promedio}%
          </Badge>
        </Stack>
        <Stack gap={2}>
          <Text size="xs" c="dimmed">% objetivo</Text>
          <Text fw={700} size="sm">{resumen.pct_costo_objetivo}%</Text>
        </Stack>
        <Stack gap={2}>
          <Text size="xs" c="dimmed">Diferencia promedio</Text>
          <Badge size="sm" variant="light" color={resumen.diferencia_promedio > 0 ? 'red' : 'teal'} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {resumen.diferencia_promedio > 0 ? '+' : ''}{resumen.diferencia_promedio} pts
          </Badge>
        </Stack>
        <Stack gap={2}>
          <Text size="xs" c="dimmed">Incremento potencial est.</Text>
          <Text fw={700} size="sm" c={resumen.incremento_potencial_estimado > 0 ? 'teal' : undefined}>
            {formatoMoneda.format(resumen.incremento_potencial_estimado)}
          </Text>
        </Stack>
      </SimpleGrid>
    </Card>
  );
}

// Nivel 4 — tabla de productos, mirror visual de TablaProductos/RankingTablaProductos
// (misma cabecera, mismo pie TOTAL) con columnas de costeo/rentabilidad.
// "REQ AJUSTE" se resalta con un badge, nunca se filtra fuera de la tabla.
function TablaCosteoProductos({ productos }: { productos: ProductoCosteoAnalisis[] }) {
  const totalCantidad = productos.reduce((acc, f) => acc + f.cantidad_vendida, 0);
  const totalSubtotalActual = productos.reduce((acc, f) => acc + f.subtotal_actual, 0);
  const totalIva = productos.reduce((acc, f) => acc + f.iva_actual, 0);
  const totalSubtotalPotencial = productos.reduce((acc, f) => acc + f.subtotal_potencial, 0);
  const totalIncremento = productos.reduce((acc, f) => acc + f.incremento_potencial, 0);

  return (
    <Card withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
      <Table.ScrollContainer minWidth={1280}>
        <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
          <Table.Thead style={{ background: 'var(--mantine-color-default-hover)', borderBottom: '2px solid var(--mantine-color-default-border)' }}>
            <Table.Tr>
              <Table.Th style={ESTILO_ENCABEZADO_TABLA}>Producto</Table.Th>
              <Table.Th style={ESTILO_ENCABEZADO_TABLA}>Grupo</Table.Th>
              <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Cantidad</Table.Th>
              <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Costo unitario</Table.Th>
              <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Precio actual</Table.Th>
              <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Precio sugerido</Table.Th>
              <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>% costo actual</Table.Th>
              <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>% costo objetivo</Table.Th>
              <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Diferencia %</Table.Th>
              <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Subtotal actual</Table.Th>
              <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>IVA</Table.Th>
              <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Subtotal potencial</Table.Th>
              <Table.Th ta="right" style={ESTILO_ENCABEZADO_TABLA}>Incremento potencial</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {productos.map((f) => (
              <Table.Tr key={f.producto}>
                <Table.Td>
                  <Group gap={6} wrap="nowrap">
                    <Text size="sm" fw={500}>{f.producto}</Text>
                    {f.estado === 'REQ AJUSTE' && <Badge size="xs" color="red" variant="light">REQ AJUSTE</Badge>}
                    {f.es_hora_feliz && <Badge size="xs" color="grape" variant="light">Hora Feliz</Badge>}
                  </Group>
                </Table.Td>
                <Table.Td><Text size="xs" c="dimmed">{f.grupo ?? '—'}</Text></Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{f.cantidad_vendida}</Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatoMoneda.format(f.costo_unitario)}</Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatoMoneda.format(f.precio_actual)}</Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatoMoneda.format(f.precio_sugerido)}</Table.Td>
                <Table.Td ta="right">
                  <Badge size="sm" variant="light" color={colorPorcentajeCosto(f.pct_costo_actual, 100)} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {f.pct_costo_actual}%
                  </Badge>
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{f.pct_costo_objetivo}%</Table.Td>
                <Table.Td ta="right">
                  <Badge size="sm" variant="light" color={f.diferencia_pct > 0 ? 'red' : 'teal'} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {f.diferencia_pct > 0 ? '+' : ''}{f.diferencia_pct}
                  </Badge>
                </Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatoMoneda.format(f.subtotal_actual)}</Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatoMoneda.format(f.iva_actual)}</Table.Td>
                <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatoMoneda.format(f.subtotal_potencial)}</Table.Td>
                <Table.Td ta="right">
                  <Text size="sm" c={f.incremento_potencial > 0 ? 'teal' : undefined} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatoMoneda.format(f.incremento_potencial)}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
          <Table.Tfoot>
            <Table.Tr style={{ borderTop: '2px solid var(--mantine-color-violet-6)', background: 'var(--mantine-color-default-hover)' }}>
              <Table.Th>TOTAL</Table.Th>
              <Table.Th />
              <Table.Th ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{totalCantidad}</Table.Th>
              <Table.Th /><Table.Th /><Table.Th /><Table.Th /><Table.Th /><Table.Th />
              <Table.Th ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatoMoneda.format(totalSubtotalActual)}</Table.Th>
              <Table.Th ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatoMoneda.format(totalIva)}</Table.Th>
              <Table.Th ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatoMoneda.format(totalSubtotalPotencial)}</Table.Th>
              <Table.Th ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatoMoneda.format(totalIncremento)}</Table.Th>
            </Table.Tr>
          </Table.Tfoot>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );
}

// Nivel 3 — tarjetas por grupo (mirror de RankingPorGrupo), ordenadas por
// incremento potencial estimado descendente (mayor oportunidad primero).
function PanelCosteoPorGrupo({
  productos,
  resumenesGrupo,
  color,
}: {
  productos: ProductoCosteoAnalisis[];
  resumenesGrupo: ResumenNivelCosteo[];
  color: string;
}) {
  const [grupoActivo, setGrupoActivo] = useState<string | null>(null);
  const productosPorGrupo = useMemo(() => agruparCosteoPorCampo(productos, 'grupo'), [productos]);

  if (grupoActivo && productosPorGrupo.has(grupoActivo)) {
    const productosGrupo = productosPorGrupo.get(grupoActivo)!;
    const resumenGrupo = buscarResumenNivel(resumenesGrupo, grupoActivo);
    return (
      <Stack gap="sm">
        <UnstyledButton onClick={() => setGrupoActivo(null)} style={{ alignSelf: 'flex-start' }}>
          <Group gap={6}>
            <IconArrowLeft size={16} />
            <Text size="sm" fw={500}>Volver a grupos</Text>
          </Group>
        </UnstyledButton>

        <Group gap="xs">
          <div style={{ width: 4, height: 16, borderRadius: 2, background: `var(--mantine-color-${color}-6)` }} />
          <Text fw={700} size="sm">{grupoActivo}</Text>
          <Badge size="sm" variant="light" color="gray">{productosGrupo.length}</Badge>
        </Group>

        <CardResumenNivel resumen={resumenGrupo} color={color} />
        <TablaCosteoProductos productos={productosGrupo} />
      </Stack>
    );
  }

  const gruposConResumen = Array.from(productosPorGrupo.entries()).map(([grupo, productosGrupo]) => ({
    grupo,
    productosGrupo,
    resumen: buscarResumenNivel(resumenesGrupo, grupo),
  }));
  gruposConResumen.sort((a, b) => b.resumen.incremento_potencial_estimado - a.resumen.incremento_potencial_estimado);

  if (gruposConResumen.length === 0) {
    return <Text size="sm" c="dimmed">Ningún producto coincide aquí.</Text>;
  }

  return (
    <SimpleGrid cols={{ base: 1, xs: 2, sm: 3, md: 4 }} spacing="sm">
      {gruposConResumen.map(({ grupo, productosGrupo, resumen }) => (
        <Card
          key={grupo}
          withBorder
          radius="md"
          p="md"
          component="button"
          onClick={() => setGrupoActivo(grupo)}
          style={{ textAlign: 'left', cursor: 'pointer' }}
        >
          <Stack gap={6}>
            <div style={{ width: 28, height: 4, borderRadius: 2, background: `var(--mantine-color-${color}-6)` }} />
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Text size="sm" fw={600} style={{ flex: 1 }}>{grupo}</Text>
              <IconChevronRight size={16} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0, marginTop: 2 }} />
            </Group>
            <Badge size="sm" variant="light" color={color}>
              {productosGrupo.length} producto{productosGrupo.length === 1 ? '' : 's'}
            </Badge>
            <Badge size="sm" variant="light" color={colorPorcentajeCosto(resumen.pct_costo_promedio, 100)}>
              Costo prom.: {resumen.pct_costo_promedio}%
            </Badge>
            <Text size="xs" c="dimmed">
              Incremento potencial: {formatoMoneda.format(resumen.incremento_potencial_estimado)}
            </Text>
          </Stack>
        </Card>
      ))}
    </SimpleGrid>
  );
}

// Nivel 2 — tabs pills por categoría (mirror de RankingPorCategoria).
function PanelCosteoPorCategoria({
  productos,
  resumenesCategoria,
  resumenesGrupo,
}: {
  productos: ProductoCosteoAnalisis[];
  resumenesCategoria: ResumenNivelCosteo[];
  resumenesGrupo: ResumenNivelCosteo[];
}) {
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null);
  const productosPorCategoria = useMemo(() => agruparCosteoPorCampo(productos, 'categoria_tipo'), [productos]);

  const categoriasBase = [...CATEGORIAS_TIPO, { clave: 'Sin Clasificar', etiqueta: 'Sin Clasificar', color: 'gray', icono: IconCategory }];
  const categoriasConDatos = categoriasBase.filter((cat) => (productosPorCategoria.get(cat.clave)?.length ?? 0) > 0);

  const categoriaMostrada =
    categoriaActiva && categoriasConDatos.some((cat) => cat.clave === categoriaActiva)
      ? categoriaActiva
      : (categoriasConDatos[0]?.clave ?? null);

  if (categoriasConDatos.length === 0) {
    return <Text size="sm" c="dimmed">Ningún producto coincide aquí.</Text>;
  }

  return (
    <Tabs value={categoriaMostrada} onChange={setCategoriaActiva} variant="pills" keepMounted={false}>
      <Tabs.List>
        {categoriasConDatos.map((cat) => (
          <Tabs.Tab
            key={cat.clave}
            value={cat.clave}
            color={cat.color}
            leftSection={<cat.icono size={16} />}
            rightSection={
              <Badge size="sm" variant="light" color={cat.clave === categoriaMostrada ? 'white' : cat.color}>
                {productosPorCategoria.get(cat.clave)?.length ?? 0}
              </Badge>
            }
          >
            {cat.etiqueta}
          </Tabs.Tab>
        ))}
      </Tabs.List>

      {categoriasConDatos.map((cat) => (
        <Tabs.Panel key={cat.clave} value={cat.clave} pt="md">
          <Stack gap="md">
            <CardResumenNivel resumen={buscarResumenNivel(resumenesCategoria, cat.clave)} color={cat.color} />
            <PanelCosteoPorGrupo
              productos={productosPorCategoria.get(cat.clave) ?? []}
              resumenesGrupo={resumenesGrupo}
              color={cat.color}
            />
          </Stack>
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}

function TarjetaComparacionHoraFeliz({ comparacion }: { comparacion: ComparacionHoraFeliz }) {
  return (
    <Card withBorder radius="md" p="md">
      <Stack gap="sm">
        <Text fw={700} size="sm">Hora Feliz vs. Cervezas</Text>
        <Text size="xs" c="dimmed">¿Sigue siendo rentable la política de precios de Hora Feliz frente al precio normal de Cervezas?</Text>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <Stack gap={4}>
            <Text size="xs" c="dimmed">% costo promedio Hora Feliz</Text>
            <Text fw={700} size="lg">
              {comparacion.pct_costo_promedio_hora_feliz !== null ? `${comparacion.pct_costo_promedio_hora_feliz}%` : 'Sin datos suficientes'}
            </Text>
          </Stack>
          <Stack gap={4}>
            <Text size="xs" c="dimmed">% costo promedio Cervezas</Text>
            <Text fw={700} size="lg">
              {comparacion.pct_costo_promedio_cervezas !== null ? `${comparacion.pct_costo_promedio_cervezas}%` : 'Sin datos suficientes'}
            </Text>
          </Stack>
        </SimpleGrid>
        <Group gap="xl" wrap="wrap">
          <Stack gap={2}>
            <Text size="xs" c="dimmed">Diferencia de margen</Text>
            {comparacion.diferencia_margen !== null ? (
              <Badge size="md" variant="light" color={comparacion.diferencia_margen < 0 ? 'red' : 'teal'}>
                {comparacion.diferencia_margen > 0 ? '+' : ''}{comparacion.diferencia_margen} pts
              </Badge>
            ) : (
              <Text size="sm" c="dimmed">Sin datos suficientes</Text>
            )}
          </Stack>
          <Stack gap={2}>
            <Text size="xs" c="dimmed">Incremento potencial estimado</Text>
            <Text fw={700} size="sm" c={comparacion.incremento_potencial_estimado > 0 ? 'teal' : undefined}>
              {formatoMoneda.format(comparacion.incremento_potencial_estimado)}
            </Text>
          </Stack>
        </Group>
      </Stack>
    </Card>
  );
}

// Nivel 1 — Sección → Categoría → Grupo → Tabla, mismo patrón que
// PanelRankingProductos, más el KPI principal y la comparación Hora Feliz.
function PanelOptimizacionPrecios({ params }: { params: ParamsMes }) {
  const optimizacion = useOptimizacionPrecios(params);
  const data = optimizacion.data;
  const [seccionActiva, setSeccionActiva] = useState<string | null>(null);

  const productos = data?.productos ?? [];
  const productosPorSeccion = useMemo(() => agruparCosteoPorCampo(productos, 'seccion_menu'), [productos]);

  const seccionesBase = [...SECCIONES_MENU, { clave: 'Sin Clasificar', color: 'gray', icono: IconCategory }];
  const seccionesConDatos = seccionesBase.filter((sec) => (productosPorSeccion.get(sec.clave)?.length ?? 0) > 0);

  const seccionMostrada =
    seccionActiva && seccionesConDatos.some((sec) => sec.clave === seccionActiva)
      ? seccionActiva
      : (seccionesConDatos[0]?.clave ?? null);

  return (
    <Stack gap="xl">
      {optimizacion.isLoading && <Text size="sm" c="dimmed">Cargando...</Text>}

      {!optimizacion.isLoading && data && (
        <>
          <Card withBorder radius="md" p="lg" style={{ borderLeft: '4px solid var(--mantine-color-teal-6)' }}>
            <Stack gap={4}>
              <Text size="xs" c="dimmed">Incremento potencial total</Text>
              <Text fw={700} size="xl" c="teal">{formatoMoneda.format(data.incremento_potencial_total)}</Text>
              <Text size="xs" c="dimmed">Si todos los productos con desviaciones de costeo operaran al precio sugerido.</Text>
            </Stack>
          </Card>

          <TarjetaComparacionHoraFeliz comparacion={data.hora_feliz} />

          {productos.length === 0 ? (
            <Card withBorder radius="md" p="lg">
              <Text size="sm" c="dimmed" ta="center">
                No hay productos con match de catálogo en este mes.
              </Text>
            </Card>
          ) : (
            <Tabs value={seccionMostrada} onChange={setSeccionActiva} variant="pills" color="dark" keepMounted={false}>
              <Tabs.List>
                {seccionesConDatos.map((sec) => (
                  <Tabs.Tab
                    key={sec.clave}
                    value={sec.clave}
                    color={sec.color}
                    leftSection={<sec.icono size={16} />}
                    rightSection={
                      <Badge size="sm" variant="light" color={sec.clave === seccionMostrada ? 'white' : sec.color}>
                        {productosPorSeccion.get(sec.clave)?.length ?? 0}
                      </Badge>
                    }
                  >
                    {sec.clave}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
              {seccionesConDatos.map((sec) => (
                <Tabs.Panel key={sec.clave} value={sec.clave} pt="lg">
                  <Stack gap="md">
                    <CardResumenNivel resumen={buscarResumenNivel(data.resumen_por_seccion, sec.clave)} color={sec.color} />
                    <PanelCosteoPorCategoria
                      productos={productosPorSeccion.get(sec.clave) ?? []}
                      resumenesCategoria={data.resumen_por_categoria}
                      resumenesGrupo={data.resumen_por_grupo}
                    />
                  </Stack>
                </Tabs.Panel>
              ))}
            </Tabs>
          )}

          {data.hallazgos.length > 0 && (
            <Stack gap="xs">
              <Text fw={700} size="sm">Hallazgos automáticos</Text>
              <Stack gap="xs">
                {data.hallazgos.map((h: HallazgoCosteoProductos, i: number) => (
                  <Card key={i} withBorder radius="md" p="sm" style={{ borderLeft: `4px solid var(--mantine-color-${TONO_INSIGHT_COLOR[h.tono]}-6)` }}>
                    <Text size="sm">{h.mensaje}</Text>
                    <Group gap={4} mt={4} wrap="nowrap" align="flex-start">
                      <IconBulb size={14} style={{ marginTop: 2, flexShrink: 0 }} color="var(--mantine-color-dimmed)" />
                      <Text size="xs" c="dimmed">{h.accion_sugerida}</Text>
                    </Group>
                  </Card>
                ))}
              </Stack>
            </Stack>
          )}
        </>
      )}
    </Stack>
  );
}

// Contenedor de "Desempeño Comercial" — 2 sub-pestañas (mismo patrón anidado
// que Ventas y Horarios/Productos/Riesgos y Alertas): "Resumen" (las 10
// secciones originales) y "Optimización de Precios" (lo nuevo).
function PanelDesempenoComercial({ params }: { params: ParamsMes }) {
  return (
    <Tabs defaultValue="resumen" keepMounted={false}>
      <Tabs.List>
        <Tabs.Tab value="resumen" leftSection={<IconReportMoney size={16} />}>Resumen</Tabs.Tab>
        <Tabs.Tab value="optimizacion-precios" leftSection={<IconTag size={16} />}>Optimización de Precios</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="resumen" pt="lg"><PanelDesempenoComercialResumen params={params} /></Tabs.Panel>
      <Tabs.Panel value="optimizacion-precios" pt="lg"><PanelOptimizacionPrecios params={params} /></Tabs.Panel>
    </Tabs>
  );
}

// Grupos de "Análisis y Profundidad" — las 10 vistas originales de la Fase 3
// se reagrupan en 3 grupos temáticos (más Resumen Ejecutivo, que queda
// suelto como panorama general) para que la navegación de nivel superior no
// tenga más de 4 pestañas — ver Paso A del plan de simplificación de UX.
function PanelGrupoVentasYHorarios({ params }: { params: ParamsMes }) {
  return (
    <Tabs defaultValue="heatmap" keepMounted={false}>
      <Tabs.List>
        <Tabs.Tab value="heatmap" leftSection={<IconFlame size={16} />}>Heatmap de Ventas</Tabs.Tab>
        <Tabs.Tab value="turnos" leftSection={<IconSunrise size={16} />}>Panel de Turnos</Tabs.Tab>
        <Tabs.Tab value="mix-ventas" leftSection={<IconChartPie size={16} />}>Mix de Ventas</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="heatmap" pt="lg"><PanelHeatmapVentas params={params} /></Tabs.Panel>
      <Tabs.Panel value="turnos" pt="lg"><PanelTurnos params={params} /></Tabs.Panel>
      <Tabs.Panel value="mix-ventas" pt="lg"><PanelMixVentas params={params} /></Tabs.Panel>
    </Tabs>
  );
}

function PanelGrupoProductos({ params }: { params: ParamsMes }) {
  return (
    <Tabs defaultValue="ranking" keepMounted={false}>
      <Tabs.List>
        <Tabs.Tab value="ranking" leftSection={<IconTrendingUp size={16} />}>Ranking de Productos</Tabs.Tab>
        <Tabs.Tab value="menu-engineering" leftSection={<IconStar size={16} />}>Ingeniería de Menú</Tabs.Tab>
        <Tabs.Tab value="dependencia" leftSection={<IconStack2 size={16} />}>Dependencia de Productos</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="ranking" pt="lg"><PanelRankingProductos params={params} /></Tabs.Panel>
      <Tabs.Panel value="menu-engineering" pt="lg"><PanelMenuEngineering params={params} /></Tabs.Panel>
      <Tabs.Panel value="dependencia" pt="lg"><PanelDependenciaProductos params={params} /></Tabs.Panel>
    </Tabs>
  );
}

function PanelGrupoRiesgosYAlertas({ params }: { params: ParamsMes }) {
  return (
    <Tabs defaultValue="cortesias" keepMounted={false}>
      <Tabs.List>
        <Tabs.Tab value="cortesias" leftSection={<IconGift size={16} />}>Cortesías</Tabs.Tab>
        <Tabs.Tab value="oportunidades" leftSection={<IconBulb size={16} />}>Oportunidades</Tabs.Tab>
        <Tabs.Tab value="alertas-riesgo" leftSection={<IconShieldExclamation size={16} />}>Alertas de Riesgo</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="cortesias" pt="lg"><PanelCortesias params={params} /></Tabs.Panel>
      <Tabs.Panel value="oportunidades" pt="lg"><PanelOportunidades params={params} /></Tabs.Panel>
      <Tabs.Panel value="alertas-riesgo" pt="lg"><PanelAlertasRiesgo params={params} /></Tabs.Panel>
    </Tabs>
  );
}

// Contenedor de "Análisis y Profundidad" — un único selector de mes controla
// las 4 pestañas de nivel superior (Resumen Ejecutivo y los 3 grupos de
// arriba, que agrupan las 10 vistas originales de la Fase 3).
function PanelAnalisisProfundidadRestaurante() {
  const [mes, setMes] = useState<Date>(new Date());
  const params = primerYUltimoDiaDelMes(mes);

  return (
    <Stack gap="lg">
      {/* Header ejecutivo integrado */}
      <Card withBorder radius="xl" p="lg"
        style={{ background: 'linear-gradient(135deg, var(--mantine-color-violet-light) 0%, transparent 80%)', border: '1.5px solid var(--mantine-color-violet-3)' }}
      >
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
          <Group gap="md">
            <ThemeIcon size={48} radius="xl" color="violet" variant="light"
              style={{ boxShadow: '0 4px 12px var(--mantine-color-violet-light)' }}
            >
              <IconChartInfographic size={26} />
            </ThemeIcon>
            <div>
              <Title order={3} c="violet">Análisis y Profundidad</Title>
              <Text size="sm" c="dimmed">Tablero ejecutivo del Restaurante — selecciona el mes para filtrar todos los paneles</Text>
            </div>
          </Group>
          <Card withBorder radius="md" p="sm" style={{ background: 'white' }}>
            <SelectorMesAnalisis mes={mes} onCambiarMes={setMes} />
          </Card>
        </Group>
      </Card>

      {/* Tabs con colores distintivos por área temática */}
      <Tabs defaultValue="resumen-ejecutivo" keepMounted={false}>
        <Tabs.List
          style={{
            gap: 4,
            borderBottom: '2px solid var(--mantine-color-default-border)',
            paddingBottom: 0,
          }}
        >
          <Tabs.Tab
            value="resumen-ejecutivo"
            leftSection={<IconChartInfographic size={16} />}
            style={{ fontWeight: 600 }}
          >
            Resumen Ejecutivo
          </Tabs.Tab>
          <Tabs.Tab
            value="desempeno-comercial"
            leftSection={<IconReportMoney size={16} />}
            color="indigo"
            style={{ fontWeight: 600 }}
          >
            Desempeño Comercial
          </Tabs.Tab>
          <Tabs.Tab
            value="ventas-horarios"
            leftSection={<IconCalendarWeek size={16} />}
            color="blue"
            style={{ fontWeight: 600 }}
          >
            Ventas y Horarios
          </Tabs.Tab>
          <Tabs.Tab
            value="productos"
            leftSection={<IconTrendingUp size={16} />}
            color="teal"
            style={{ fontWeight: 600 }}
          >
            Productos
          </Tabs.Tab>
          <Tabs.Tab
            value="riesgos-alertas"
            leftSection={<IconShieldExclamation size={16} />}
            color="orange"
            style={{ fontWeight: 600 }}
          >
            Riesgos y Alertas
          </Tabs.Tab>
        </Tabs.List>

        {/* Descripciones de contexto por pestaña */}
        <Tabs.Panel value="resumen-ejecutivo" pt="lg">
          <Stack gap="xs" mb="md">
            <Text size="xs" fw={600} tt="uppercase" c="dimmed" style={{ letterSpacing: 0.8 }}>📊 KPIs + Insights automáticos del mes seleccionado</Text>
          </Stack>
          <PanelResumenEjecutivo params={params} />
        </Tabs.Panel>
        <Tabs.Panel value="desempeno-comercial" pt="lg">
          <Stack gap="xs" mb="md">
            <Text size="xs" fw={600} tt="uppercase" c="dimmed" style={{ letterSpacing: 0.8 }}>💰 ¿Cómo nos fue este mes? Comparativa, optimización de precios y hallazgos</Text>
          </Stack>
          <PanelDesempenoComercial params={params} />
        </Tabs.Panel>
        <Tabs.Panel value="ventas-horarios" pt="lg">
          <Stack gap="xs" mb="md">
            <Text size="xs" fw={600} tt="uppercase" c="dimmed" style={{ letterSpacing: 0.8 }}>🕐 Heatmap por día/hora, análisis por turno y mix de ventas</Text>
          </Stack>
          <PanelGrupoVentasYHorarios params={params} />
        </Tabs.Panel>
        <Tabs.Panel value="productos" pt="lg">
          <Stack gap="xs" mb="md">
            <Text size="xs" fw={600} tt="uppercase" c="dimmed" style={{ letterSpacing: 0.8 }}>🏆 Ranking, ingeniería del menú y dependencia de productos</Text>
          </Stack>
          <PanelGrupoProductos params={params} />
        </Tabs.Panel>
        <Tabs.Panel value="riesgos-alertas" pt="lg">
          <Stack gap="xs" mb="md">
            <Text size="xs" fw={600} tt="uppercase" c="dimmed" style={{ letterSpacing: 0.8 }}>⚠️ Cortesías detectadas, oportunidades de mejora y alertas de riesgo</Text>
          </Stack>
          <PanelGrupoRiesgosYAlertas params={params} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

function PanelInteligenciaNegocio() {
  const [vistaIN, setVistaIN] = useState<SeccionInteligenciaNegocioClave | null>(null);

  if (vistaIN === 'ventas-diarias') {
    return (
      <Stack gap="lg">
        {/* Breadcrumb */}
        <Group gap={6}>
          <UnstyledButton onClick={() => setVistaIN(null)}>
            <Group gap={4}>
              <IconArrowLeft size={14} color="var(--mantine-color-dimmed)" />
              <Text size="sm" c="dimmed" style={{ textDecoration: 'underline dotted' }}>Inteligencia de Negocio</Text>
            </Group>
          </UnstyledButton>
          <Text size="sm" c="dimmed">/</Text>
          <Text size="sm" fw={600} c="indigo">Ventas Diarias</Text>
        </Group>
        <PanelVentasDiariasRestaurante />
      </Stack>
    );
  }

  if (vistaIN === 'analisis-profundidad') {
    return (
      <Stack gap="lg">
        {/* Breadcrumb */}
        <Group gap={6}>
          <UnstyledButton onClick={() => setVistaIN(null)}>
            <Group gap={4}>
              <IconArrowLeft size={14} color="var(--mantine-color-dimmed)" />
              <Text size="sm" c="dimmed" style={{ textDecoration: 'underline dotted' }}>Inteligencia de Negocio</Text>
            </Group>
          </UnstyledButton>
          <Text size="sm" c="dimmed">/</Text>
          <Text size="sm" fw={600} c="violet">Análisis y Profundidad</Text>
        </Group>
        <PanelAnalisisProfundidadRestaurante />
      </Stack>
    );
  }

  return (
    <Stack gap="xl">
      {/* Header de sección */}
      <Card withBorder radius="xl" p="lg"
        style={{ background: 'linear-gradient(135deg, var(--mantine-color-indigo-light) 0%, var(--mantine-color-violet-light) 100%)', border: '1.5px solid var(--mantine-color-indigo-3)' }}
      >
        <Group gap="md">
          <ThemeIcon size={52} radius="xl" color="indigo" variant="light"
            style={{ boxShadow: '0 4px 16px var(--mantine-color-indigo-light)' }}
          >
            <IconBrain size={28} />
          </ThemeIcon>
          <div>
            <Title order={3} c="indigo">Inteligencia de Negocio</Title>
            <Text size="sm" c="dimmed">Análisis avanzado para gerencia y contraloría — Restaurante</Text>
          </div>
        </Group>
      </Card>

      <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: 1 }}>Selecciona el módulo de análisis</Text>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
        {/* Ventas Diarias */}
        <UnstyledButton onClick={() => setVistaIN('ventas-diarias')}>
          <Card withBorder radius="xl" p={0}
            style={{ overflow: 'hidden', height: '100%', border: '1.5px solid var(--mantine-color-indigo-3)' }}
          >
            <div style={{ background: 'linear-gradient(135deg, var(--mantine-color-indigo-light) 0%, transparent 70%)', padding: '24px' }}>
              <Stack gap="md" align="flex-start">
                <Group justify="space-between" w="100%">
                  <ThemeIcon size={52} radius="xl" color="indigo" variant="light">
                    <IconCalendarWeek size={26} />
                  </ThemeIcon>
                  <Badge color="indigo" variant="dot" size="sm">Operativo</Badge>
                </Group>
                <div>
                  <Title order={4} c="indigo">Ventas Diarias</Title>
                  <Text size="sm" c="dimmed" mt={4}>
                    Revisión día a día de comandas y recibos emitidos
                  </Text>
                </div>
                <List size="xs" c="dimmed" spacing={3}>
                  <List.Item>📋 Comandas emitidas por turno</List.Item>
                  <List.Item>🧾 Recibos emitidos por cuenta</List.Item>
                  <List.Item>📅 Histórico agrupado por mes</List.Item>
                </List>
                <Group gap={4} mt={4}>
                  <Text size="xs" c="indigo" fw={700} tt="uppercase" style={{ letterSpacing: 0.5 }}>Abrir</Text>
                  <IconChevronRight size={14} color="var(--mantine-color-indigo-6)" />
                </Group>
              </Stack>
            </div>
          </Card>
        </UnstyledButton>

        {/* Análisis y Profundidad */}
        <UnstyledButton onClick={() => setVistaIN('analisis-profundidad')}>
          <Card withBorder radius="xl" p={0}
            style={{ overflow: 'hidden', height: '100%', border: '1.5px solid var(--mantine-color-violet-3)' }}
          >
            <div style={{ background: 'linear-gradient(135deg, var(--mantine-color-violet-light) 0%, transparent 70%)', padding: '24px' }}>
              <Stack gap="md" align="flex-start">
                <Group justify="space-between" w="100%">
                  <ThemeIcon size={52} radius="xl" color="violet" variant="light">
                    <IconChartInfographic size={26} />
                  </ThemeIcon>
                  <Badge color="violet" variant="dot" size="sm">Ejecutivo</Badge>
                </Group>
                <div>
                  <Title order={4} c="violet">Análisis y Profundidad</Title>
                  <Text size="sm" c="dimmed" mt={4}>
                    Tablero ejecutivo con KPIs, tendencias y alertas automáticas
                  </Text>
                </div>
                <List size="xs" c="dimmed" spacing={3}>
                  <List.Item>📊 Resumen ejecutivo mensual</List.Item>
                  <List.Item>💰 Desempeño comercial y precios</List.Item>
                  <List.Item>🏆 Ranking y clasificación de menú</List.Item>
                  <List.Item>⚠️ Alertas de riesgo y oportunidades</List.Item>
                </List>
                <Group gap={4} mt={4}>
                  <Text size="xs" c="violet" fw={700} tt="uppercase" style={{ letterSpacing: 0.5 }}>Abrir</Text>
                  <IconChevronRight size={14} color="var(--mantine-color-violet-6)" />
                </Group>
              </Stack>
            </div>
          </Card>
        </UnstyledButton>
      </SimpleGrid>
    </Stack>
  );
}

// Menú interno de cada punto de venta — mismo patrón que PanelMenuPuntosVenta,
// pero para elegir entre las 5 secciones (Catálogo/Costeo/Productos
// Vendidos/Cortesía/Análisis) dentro de un POS ya seleccionado. Compartido
// por los 3 POS (Restaurante/Cafetería/Carreta de Mariscos) porque es
// puramente navegación, sin datos ni tipos propios de ningún POS.
type SeccionPosClave = 'catalogo' | 'costeo' | 'productos-vendidos' | 'cortesia' | 'analisis';

const SECCIONES_POS_MENU: {
  clave: SeccionPosClave;
  nombre: string;
  descripcion: string;
  icono: typeof IconToolsKitchen2;
}[] = [
  {
    clave: 'catalogo',
    nombre: 'Catálogo',
    descripcion: 'Productos, costo y precio de venta por receta',
    icono: IconToolsKitchen2,
  },
  {
    clave: 'costeo',
    nombre: 'Costeo',
    descripcion: '% costo y precio sugerido por grupo',
    icono: IconCalculator,
  },
  {
    clave: 'productos-vendidos',
    nombre: 'Productos Vendidos',
    descripcion: 'Reporte mensual de ventas por producto',
    icono: IconShoppingCart,
  },
  {
    clave: 'cortesia',
    nombre: 'Cortesía',
    descripcion: 'Posibles cortesías detectadas contra el Impuesto',
    icono: IconReceiptTax,
  },
  {
    clave: 'analisis',
    nombre: 'Análisis',
    descripcion: 'Ranking de ventas por producto y sección',
    icono: IconTrendingUp,
  },
];

function PanelMenuSeccionesPos({ color, onSeleccionar }: { color: string; onSeleccionar: (sec: SeccionPosClave) => void }) {
  return (
    <Stack gap="md">
      <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: 1 }}>¿Qué deseas ver?</Text>
      <SimpleGrid cols={{ base: 1, xs: 2, sm: 3, lg: 5 }} spacing="md">
        {SECCIONES_POS_MENU.map((sec) => (
          <UnstyledButton key={sec.clave} onClick={() => onSeleccionar(sec.clave)}>
            <Card
              withBorder
              radius="lg"
              p="lg"
              style={{
                borderTop: `3px solid var(--mantine-color-${color}-5)`,
                background: 'var(--mantine-color-body)',
                height: '100%',
                transition: 'box-shadow 0.15s ease',
              }}
            >
              <Stack gap="sm" align="flex-start">
                <ThemeIcon size={40} radius="md" variant="light" color={color}>
                  <sec.icono size={20} />
                </ThemeIcon>
                <div>
                  <Text fw={700} size="sm">{sec.nombre}</Text>
                  <Text size="xs" c="dimmed" mt={2}>{sec.descripcion}</Text>
                </div>
                <Group gap={4} style={{ marginTop: 'auto' }}>
                  <Text size="xs" c={color} fw={600}>Ver</Text>
                  <IconChevronRight size={12} color={`var(--mantine-color-${color}-6)`} />
                </Group>
              </Stack>
            </Card>
          </UnstyledButton>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

// ════════════════════════════════════════════════════════════════════
// Ventas Diarias — "Inteligencia de Negocio" Fase 1 (Restaurante): Comandas
// Emitidas (detalle de producto, turno calculado desde Hora) y Recibos
// Emitidos (totales por cuenta, turno tal cual del POS). Un archivo cubre
// varios días; el reemplazo al volver a subir es solo por los días que
// vienen en el archivo — ver `fechas_conflicto` en la respuesta de
// confirmación. Fase 1 es solo revisar lo ingresado (lista plana + filtro
// de turno/grupo/rango de fecha); el drill-down por tarjetas de grupo y los
// dashboards ejecutivos quedan para una fase posterior.
// ════════════════════════════════════════════════════════════════════

const TURNOS_FILTRO = ['Todos', 'Desayuno', 'Comida', 'Cena', 'Sin Clasificar'];

const FORMATO_MES = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' });

function etiquetaMes(mesIso: string): string {
  // mesIso = "YYYY-MM" — se arma como fecha del día 2 (no el 1) para
  // evitar que un huso horario negativo la recorra al mes anterior.
  const texto = FORMATO_MES.format(new Date(`${mesIso}-02T00:00:00`));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// Selector de día/lote agrupado por mes — reusado por las 4 pestañas de
// Ventas Diarias (Comandas/Recibos/Productos Vendidos/Conciliación) para
// que la lista de días no se vuelva una fila interminable conforme se van
// subiendo más meses. `items` ya viene normalizado por quien llama (cada
// pestaña tiene su propia forma de día/lote: fecha simple vs. rango con
// etiqueta) a `{ clave, fecha, etiqueta, total }`, donde `fecha` es
// cualquier fecha ISO dentro del período (se usa solo para agrupar por
// mes) y `clave` es lo que se le pasa de vuelta a `onSeleccionar`.
function SelectorDiasPorMes({
  items,
  activo,
  onSeleccionar,
  color,
}: {
  items: { clave: string; fecha: string; etiqueta: string; total: number }[];
  activo: string | null;
  onSeleccionar: (clave: string) => void;
  color: string;
}) {
  const porMes = useMemo(() => {
    const mapa = new Map<string, typeof items>();
    for (const item of items) {
      const mes = item.fecha.slice(0, 7);
      const lista = mapa.get(mes) ?? [];
      lista.push(item);
      mapa.set(mes, lista);
    }
    return new Map([...mapa.entries()].sort(([a], [b]) => b.localeCompare(a)));
  }, [items]);

  const meses = [...porMes.keys()];
  const mesDelActivo = activo ? items.find((i) => i.clave === activo)?.fecha.slice(0, 7) : undefined;
  const [mesSeleccionadoManual, setMesSeleccionadoManual] = useState<string | null>(null);

  // Si `activo` cambia por una razón externa (ej. justo después de subir
  // un archivo, que salta al día recién guardado) y cae en un mes distinto
  // al que el usuario había navegado a mano, el mes debe seguir a `activo`
  // — si no, el botón del día activo quedaría escondido en un mes que ya
  // no se está mostrando.
  const mesActivoAnterior = useRef(mesDelActivo);
  if (mesDelActivo && mesDelActivo !== mesActivoAnterior.current) {
    mesActivoAnterior.current = mesDelActivo;
    if (mesSeleccionadoManual !== null) setMesSeleccionadoManual(null);
  }

  const mesActivo = mesSeleccionadoManual ?? mesDelActivo ?? meses[0] ?? null;

  if (items.length === 0) return null;

  return (
    <Stack gap="xs">
      <Group gap="xs" wrap="wrap">
        {meses.map((mes) => (
          <Button
            key={mes}
            size="xs"
            variant={mes === mesActivo ? 'filled' : 'subtle'}
            color={color}
            onClick={() => setMesSeleccionadoManual(mes)}
          >
            {etiquetaMes(mes)} ({porMes.get(mes)!.length})
          </Button>
        ))}
      </Group>
      <Group gap="xs" wrap="wrap">
        {(porMes.get(mesActivo ?? '') ?? []).map((item) => (
          <Button
            key={item.clave}
            size="xs"
            variant={item.clave === activo ? 'filled' : 'light'}
            color={color}
            onClick={() => onSeleccionar(item.clave)}
          >
            {item.etiqueta} ({item.total})
          </Button>
        ))}
      </Group>
    </Stack>
  );
}

function ModalConflictoFechas({
  opened,
  onClose,
  fechasConflicto,
  onConfirmar,
  cargando,
}: {
  opened: boolean;
  onClose: () => void;
  fechasConflicto: { fecha: string; total_existentes: number }[];
  onConfirmar: () => void;
  cargando: boolean;
}) {
  return (
    <Modal opened={opened} onClose={onClose} title={<Text fw={600} c="red">Confirmar reemplazo</Text>}>
      <Stack gap="md">
        <Text size="sm">
          {fechasConflicto.length} día(s) de este archivo ya tienen datos guardados. Si continúas, se reemplazan
          solo esos días — el resto de los días del archivo se agregan normalmente, y cualquier otro día ya
          guardado que no venga en este archivo queda intacto.
        </Text>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Fecha</Table.Th>
              <Table.Th ta="right">Filas existentes</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {fechasConflicto.map((f) => (
              <Table.Tr key={f.fecha}>
                <Table.Td>{f.fecha}</Table.Td>
                <Table.Td ta="right">{f.total_existentes}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>
            Cancelar
          </Button>
          <Button color="red" onClick={onConfirmar} loading={cargando}>
            Reemplazar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function PanelComandasEmitidas() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [mostrarSubir, setMostrarSubir] = useState(true);
  const [modalConflicto, setModalConflicto] = useState<{ fecha: string; total_existentes: number }[] | null>(null);
  const [diaActivo, setDiaActivo] = useState<string | null>(null);
  const [turno, setTurno] = useState('Todos');
  const [grupo, setGrupo] = useState<string | null>(null);

  const subir = useSubirComandasEmitidas();
  const dias = useDiasComandasEmitidas();
  const eliminar = useEliminarComandasEmitidas();

  const diaMasReciente = dias.data?.dias[0]?.fecha ?? null;
  const diaMostrado = diaActivo ?? diaMasReciente;

  const datos = useComandasEmitidas(
    diaMostrado
      ? { fechaDesde: diaMostrado, fechaHasta: diaMostrado, turno: turno === 'Todos' ? undefined : turno, grupo: grupo || undefined }
      : null,
  );
  const comandas = datos.data?.comandas ?? [];
  const grupos = useMemo(
    () => Array.from(new Set(comandas.map((c) => c.grupo).filter((g): g is string => !!g))).sort(),
    [comandas],
  );

  const executeSubir = (confirmarReemplazo = false) => {
    if (!archivo) return;
    subir.mutate(
      { file: archivo, confirmarReemplazo },
      {
        onSuccess: (data) => {
          if ('requiere_confirmacion' in data) {
            setModalConflicto((data as RequiereConfirmacionLote).fechas_conflicto);
            return;
          }
          setModalConflicto(null);
          setArchivo(null);
          setMostrarSubir(false);
          setDiaActivo(data.fechas_procesadas[data.fechas_procesadas.length - 1] ?? null);
          notifications.show({
            title: 'Comandas Emitidas guardadas',
            message: `${data.total_filas} fila(s) en ${data.fechas_procesadas.length} día(s)${
              data.sin_match_catalogo > 0 ? ` — ${data.sin_match_catalogo} sin match en catálogo` : ''
            }.`,
            color: data.sin_match_catalogo > 0 ? 'orange' : 'green',
            icon: <IconCheck size={16} />,
          });
        },
        onError: (err: any) => {
          notifications.show({
            title: 'Error al guardar Comandas Emitidas',
            message: err.response?.data?.detail || 'Ocurrió un error al procesar el archivo.',
            color: 'red',
            icon: <IconX size={16} />,
          });
        },
      },
    );
  };

  return (
    <Stack gap="lg">
      <Card withBorder radius="md" p={mostrarSubir ? 'lg' : 'sm'}>
        <Stack gap={mostrarSubir ? 'md' : 0}>
          <UnstyledButton onClick={() => setMostrarSubir(!mostrarSubir)}>
            <Group justify="space-between">
              <Text fw={600} size={mostrarSubir ? 'md' : 'sm'}>
                {mostrarSubir ? 'Subir Comandas Emitidas' : 'Actualizar Comandas Emitidas'}
              </Text>
              <ActionIcon variant="subtle" color="gray" size="sm">
                {mostrarSubir ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
              </ActionIcon>
            </Group>
          </UnstyledButton>
          <Collapse in={mostrarSubir}>
            <Stack gap="md" pt="xs">
              <ArchivoDropzone
                titulo="Comandas Emitidas"
                descripcion="Excel del POS (puede cubrir varios días — se divide por día y turno automáticamente)."
                file={archivo}
                onDrop={setArchivo}
                onRemove={() => setArchivo(null)}
              />
              {archivo && (
                <Group justify="flex-end">
                  <Button onClick={() => executeSubir(false)} loading={subir.isPending}>
                    Guardar Comandas Emitidas
                  </Button>
                </Group>
              )}
            </Stack>
          </Collapse>
        </Stack>
      </Card>

      <Card withBorder radius="md" p="lg">
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={4}>Comandas Emitidas guardadas</Title>
            {diaMostrado && (
              <Button
                variant="subtle"
                color="red"
                size="xs"
                leftSection={<IconTrash size={14} />}
                onClick={() => eliminar.mutate(diaMostrado)}
                loading={eliminar.isPending}
              >
                Eliminar día
              </Button>
            )}
          </Group>

          {(dias.data?.dias.length ?? 0) === 0 && (
            <Text size="sm" c="dimmed">Todavía no hay días guardados.</Text>
          )}

          {(dias.data?.dias.length ?? 0) > 0 && (
            <>
              <SelectorDiasPorMes
                items={dias.data!.dias.map((d) => ({ clave: d.fecha, fecha: d.fecha, etiqueta: d.fecha, total: d.total }))}
                activo={diaMostrado}
                onSeleccionar={setDiaActivo}
                color="grape"
              />

              <SegmentedControl value={turno} onChange={setTurno} data={TURNOS_FILTRO} size="xs" />

              {grupos.length > 0 && (
                <Group gap="xs" wrap="wrap">
                  <Button size="xs" variant={grupo === null ? 'filled' : 'light'} color="gray" onClick={() => setGrupo(null)}>
                    Todos los grupos
                  </Button>
                  {grupos.map((g) => (
                    <Button key={g} size="xs" variant={grupo === g ? 'filled' : 'light'} color="gray" onClick={() => setGrupo(g)}>
                      {g}
                    </Button>
                  ))}
                </Group>
              )}

              <Table.ScrollContainer minWidth={640}>
                <Table verticalSpacing="xs" horizontalSpacing="sm" highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Hora</Table.Th>
                      <Table.Th>Turno</Table.Th>
                      <Table.Th>Producto</Table.Th>
                      <Table.Th>Grupo</Table.Th>
                      <Table.Th>Mesa</Table.Th>
                      <Table.Th>Cuenta</Table.Th>
                      <Table.Th ta="right">Cantidad</Table.Th>
                      <Table.Th>Estatus</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {comandas.map((c: ComandaEmitida) => (
                      <Table.Tr key={c.id}>
                        <Table.Td>{c.hora}</Table.Td>
                        <Table.Td>
                          <Badge size="sm" variant="light" color="grape">{c.turno}</Badge>
                        </Table.Td>
                        <Table.Td>{c.producto}</Table.Td>
                        <Table.Td>
                          {c.grupo ?? (
                            <Badge size="sm" variant="light" color="orange">Sin match</Badge>
                          )}
                        </Table.Td>
                        <Table.Td>{c.mesa}</Table.Td>
                        <Table.Td>{c.cuenta}</Table.Td>
                        <Table.Td ta="right">{c.cantidad}</Table.Td>
                        <Table.Td>{c.estatus}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </>
          )}
        </Stack>
      </Card>

      <ModalConflictoFechas
        opened={!!modalConflicto}
        onClose={() => setModalConflicto(null)}
        fechasConflicto={modalConflicto ?? []}
        onConfirmar={() => executeSubir(true)}
        cargando={subir.isPending}
      />
    </Stack>
  );
}

function PanelRecibosEmitidos() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [mostrarSubir, setMostrarSubir] = useState(true);
  const [modalConflicto, setModalConflicto] = useState<{ fecha: string; total_existentes: number }[] | null>(null);
  const [diaActivo, setDiaActivo] = useState<string | null>(null);
  const [turno, setTurno] = useState('Todos');

  const subir = useSubirRecibosEmitidos();
  const dias = useDiasRecibosEmitidos();
  const eliminar = useEliminarRecibosEmitidos();

  const diaMasReciente = dias.data?.dias[0]?.fecha ?? null;
  const diaMostrado = diaActivo ?? diaMasReciente;

  const datos = useRecibosEmitidos(
    diaMostrado ? { fechaDesde: diaMostrado, fechaHasta: diaMostrado, turno: turno === 'Todos' ? undefined : turno } : null,
  );
  const recibos = datos.data?.recibos ?? [];
  const sumaTotal = recibos.reduce((acc, r) => acc + r.total, 0);
  const sumaPropina = recibos.reduce((acc, r) => acc + r.propina, 0);

  const executeSubir = (confirmarReemplazo = false) => {
    if (!archivo) return;
    subir.mutate(
      { file: archivo, confirmarReemplazo },
      {
        onSuccess: (data) => {
          if ('requiere_confirmacion' in data) {
            setModalConflicto((data as RequiereConfirmacionLote).fechas_conflicto);
            return;
          }
          setModalConflicto(null);
          setArchivo(null);
          setMostrarSubir(false);
          setDiaActivo(data.fechas_procesadas[data.fechas_procesadas.length - 1] ?? null);
          notifications.show({
            title: 'Recibos Emitidos guardados',
            message: `${data.total_filas} cuenta(s) en ${data.fechas_procesadas.length} día(s), suma ${formatoMoneda.format(data.suma_total)}.`,
            color: 'green',
            icon: <IconCheck size={16} />,
          });
        },
        onError: (err: any) => {
          notifications.show({
            title: 'Error al guardar Recibos Emitidos',
            message: err.response?.data?.detail || 'Ocurrió un error al procesar el archivo.',
            color: 'red',
            icon: <IconX size={16} />,
          });
        },
      },
    );
  };

  return (
    <Stack gap="lg">
      <Card withBorder radius="md" p={mostrarSubir ? 'lg' : 'sm'}>
        <Stack gap={mostrarSubir ? 'md' : 0}>
          <UnstyledButton onClick={() => setMostrarSubir(!mostrarSubir)}>
            <Group justify="space-between">
              <Text fw={600} size={mostrarSubir ? 'md' : 'sm'}>
                {mostrarSubir ? 'Subir Recibos Emitidos' : 'Actualizar Recibos Emitidos'}
              </Text>
              <ActionIcon variant="subtle" color="gray" size="sm">
                {mostrarSubir ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
              </ActionIcon>
            </Group>
          </UnstyledButton>
          <Collapse in={mostrarSubir}>
            <Stack gap="md" pt="xs">
              <ArchivoDropzone
                titulo="Recibos Emitidos"
                descripcion="Excel del POS (puede cubrir varios días — turno ya viene clasificado por el POS)."
                file={archivo}
                onDrop={setArchivo}
                onRemove={() => setArchivo(null)}
              />
              {archivo && (
                <Group justify="flex-end">
                  <Button onClick={() => executeSubir(false)} loading={subir.isPending}>
                    Guardar Recibos Emitidos
                  </Button>
                </Group>
              )}
            </Stack>
          </Collapse>
        </Stack>
      </Card>

      <Card withBorder radius="md" p="lg">
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={4}>Recibos Emitidos guardados</Title>
            {diaMostrado && (
              <Button
                variant="subtle"
                color="red"
                size="xs"
                leftSection={<IconTrash size={14} />}
                onClick={() => eliminar.mutate(diaMostrado)}
                loading={eliminar.isPending}
              >
                Eliminar día
              </Button>
            )}
          </Group>

          {(dias.data?.dias.length ?? 0) === 0 && (
            <Text size="sm" c="dimmed">Todavía no hay días guardados.</Text>
          )}

          {(dias.data?.dias.length ?? 0) > 0 && (
            <>
              <SelectorDiasPorMes
                items={dias.data!.dias.map((d) => ({ clave: d.fecha, fecha: d.fecha, etiqueta: d.fecha, total: d.total }))}
                activo={diaMostrado}
                onSeleccionar={setDiaActivo}
                color="grape"
              />

              <SegmentedControl value={turno} onChange={setTurno} data={TURNOS_FILTRO} size="xs" />

              <Group gap="lg">
                <Text size="sm" c="dimmed">Suma TOTAL: <Text span fw={600} c="inherit">{formatoMoneda.format(sumaTotal)}</Text></Text>
                <Text size="sm" c="dimmed">Suma Propina: <Text span fw={600} c="inherit">{formatoMoneda.format(sumaPropina)}</Text></Text>
              </Group>

              <Table.ScrollContainer minWidth={720}>
                <Table verticalSpacing="xs" horizontalSpacing="sm" highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Hora</Table.Th>
                      <Table.Th>Turno</Table.Th>
                      <Table.Th>Cuenta</Table.Th>
                      <Table.Th>Tipo</Table.Th>
                      <Table.Th>Pagada</Table.Th>
                      <Table.Th>Segmento</Table.Th>
                      <Table.Th ta="right">Subtotal</Table.Th>
                      <Table.Th ta="right">Propina</Table.Th>
                      <Table.Th ta="right">TOTAL</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {recibos.map((r: ReciboEmitido) => (
                      <Table.Tr key={r.id}>
                        <Table.Td>{r.hora}</Table.Td>
                        <Table.Td>
                          <Badge size="sm" variant="light" color="grape">{r.turno}</Badge>
                        </Table.Td>
                        <Table.Td>{r.cuenta}</Table.Td>
                        <Table.Td>{r.tipo}</Table.Td>
                        <Table.Td>{r.pagada}</Table.Td>
                        <Table.Td>{r.segmento}</Table.Td>
                        <Table.Td ta="right">{formatoMoneda.format(r.subtotal)}</Table.Td>
                        <Table.Td ta="right">{formatoMoneda.format(r.propina)}</Table.Td>
                        <Table.Td ta="right">{formatoMoneda.format(r.total)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </>
          )}
        </Stack>
      </Card>

      <ModalConflictoFechas
        opened={!!modalConflicto}
        onClose={() => setModalConflicto(null)}
        fechasConflicto={modalConflicto ?? []}
        onConfirmar={() => executeSubir(true)}
        cargando={subir.isPending}
      />
    </Stack>
  );
}

function PanelVentasDiariasRestaurante() {
  return (
    <Tabs defaultValue="comandas" variant="pills" color="grape" keepMounted={false}>
      <Tabs.List>
        <Tabs.Tab value="comandas" leftSection={<IconListDetails size={16} />}>
          Comandas Emitidas
        </Tabs.Tab>
        <Tabs.Tab value="recibos" leftSection={<IconReceiptTax size={16} />}>
          Recibos Emitidos
        </Tabs.Tab>
        <Tabs.Tab value="productos-vendidos" leftSection={<IconShoppingCart size={16} />}>
          Productos Vendidos
        </Tabs.Tab>
        <Tabs.Tab value="conciliacion" leftSection={<IconAlertTriangle size={16} />}>
          Conciliación
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="comandas" pt="lg">
        <PanelComandasEmitidas />
      </Tabs.Panel>
      <Tabs.Panel value="recibos" pt="lg">
        <PanelRecibosEmitidos />
      </Tabs.Panel>
      <Tabs.Panel value="productos-vendidos" pt="lg">
        <PanelProductosVendidos />
      </Tabs.Panel>
      <Tabs.Panel value="conciliacion" pt="lg">
        <PanelConciliacionVentasDiarias />
      </Tabs.Panel>
    </Tabs>
  );
}

// ════════════════════════════════════════════════════════════════════
// Conciliación — cruza Comandas Emitidas + Recibos Emitidos (por cuenta) y
// Comandas Emitidas + Productos Vendidos (por producto, marcando
// discrepancias de cantidad) para un día. Todo llega ya calculado del
// backend (services/conciliacion_ventas_diarias.py) — este panel solo
// selecciona el día (reusa la lista de días de Comandas Emitidas, ya que
// la conciliación depende de que existan) y muestra las 2 vistas.
// ════════════════════════════════════════════════════════════════════

function TablaProductosCuentaConciliacion({ productos }: { productos: ProductoCuentaConciliacion[] }) {
  return (
    <Table verticalSpacing={4} horizontalSpacing="sm">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Hora</Table.Th>
          <Table.Th>Producto</Table.Th>
          <Table.Th>Grupo</Table.Th>
          <Table.Th ta="right">Cantidad</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {productos.map((p, i) => (
          <Table.Tr key={i}>
            <Table.Td>{p.hora}</Table.Td>
            <Table.Td>{p.producto}</Table.Td>
            <Table.Td>{p.grupo ?? <Text span c="orange" size="sm">Sin match</Text>}</Table.Td>
            <Table.Td ta="right">{p.cantidad}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function PanelCuentasConciliacion({ cuentas }: { cuentas: CuentaConciliacion[] }) {
  if (cuentas.length === 0) {
    return <Text size="sm" c="dimmed">No hay cuentas para este día.</Text>;
  }
  return (
    <Accordion variant="separated">
      {cuentas.map((c) => (
        <Accordion.Item key={c.cuenta} value={c.cuenta}>
          <Accordion.Control>
            <Group justify="space-between" wrap="wrap" pr="md">
              <Group gap="xs">
                <Text fw={600} size="sm">Cuenta {c.cuenta}</Text>
                {c.turno && <Badge size="sm" variant="light" color="grape">{c.turno}</Badge>}
                {!c.recibo_encontrado && <Badge size="sm" color="red">Sin recibo</Badge>}
                {c.pagada && <Text size="xs" c="dimmed">{c.pagada}</Text>}
              </Group>
              <Group gap="md">
                {c.subtotal != null && <Text size="xs" c="dimmed">Subtotal: {formatoMoneda.format(c.subtotal)}</Text>}
                {c.propina != null && <Text size="xs" c="dimmed">Propina: {formatoMoneda.format(c.propina)}</Text>}
                {c.total != null && <Text size="sm" fw={600}>{formatoMoneda.format(c.total)}</Text>}
              </Group>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <TablaProductosCuentaConciliacion productos={c.productos} />
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}

// Celda de dos líneas (etiqueta chica arriba, valor abajo) — usada para
// compactar varios datos relacionados en una sola columna (Costo/Precio,
// Subtotal/Impuesto) sin perder cuál es cuál.
function CeldaDobleMoneda({ a, valorA, b, valorB }: { a: string; valorA: number | null; b: string; valorB: number | null }) {
  return (
    <Stack gap={0} align="flex-end">
      <Text size="xs" c="dimmed">{a} {valorA != null ? formatoMoneda.format(valorA) : '—'}</Text>
      <Text size="xs" c="dimmed">{b} {valorB != null ? formatoMoneda.format(valorB) : '—'}</Text>
    </Stack>
  );
}

function TablaProductosConciliacion({
  filas,
  ivaFactor,
  pctCostoObjetivo,
}: {
  filas: FilaProductoConciliacion[];
  ivaFactor: number;
  pctCostoObjetivo: number;
}) {
  return (
    <Stack gap="sm">
      <Text size="xs" c="dimmed">
        Costo/Precio/Total salen siempre del Catálogo × la cantidad de Comandas de ese turno. Subtotal/Impuesto/
        Descuento/Cortesía se prorratean del total de Productos Vendidos ese día según la cantidad de cada turno —
        sumar esas columnas entre los turnos de un mismo producto reconstruye el total real del día. "Prod. Vendidos"
        es del día completo, solo referencia para comparar contra Comandas.
      </Text>
      <Table.ScrollContainer minWidth={760}>
        <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover striped>
          <Table.Thead
            style={{
              background: 'var(--mantine-color-default-hover)',
              borderBottom: '2px solid var(--mantine-color-default-border)',
            }}
          >
            <Table.Tr>
              {['Producto', 'Turno', 'Cantidad', 'Economía', 'Total', 'Cortesía'].map((encabezado, i) => (
                <Table.Th
                  key={encabezado}
                  ta={i >= 3 ? 'right' : undefined}
                  style={{ fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--mantine-color-dimmed)' }}
                >
                  {encabezado}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {filas.map((f) => {
              const conCortesia = (f.monto_cortesia ?? 0) > 0.01;
              const pctCosto = pctCostoCatalogo(f.costo, f.precio_venta, ivaFactor);
              const totalCosto = f.costo != null ? f.costo * f.cantidad_comandas : null;
              return (
                <Table.Tr
                  key={`${f.producto}-${f.turno ?? 'sin-turno'}`}
                  style={f.discrepancia ? { boxShadow: 'inset 3px 0 0 var(--mantine-color-red-6)' } : undefined}
                >
                  <Table.Td>
                    <Stack gap={2}>
                      <Group gap={6} wrap="nowrap">
                        {f.discrepancia && (
                          <Tooltip label="Cantidad de Comandas y Productos Vendidos no cuadran para este producto" multiline w={220}>
                            <IconAlertTriangle size={14} color="var(--mantine-color-red-6)" style={{ flexShrink: 0 }} />
                          </Tooltip>
                        )}
                        <Text size="sm" fw={500}>{f.producto}</Text>
                        {!f.precio_estimado_de_catalogo && (
                          <Tooltip label="Tampoco se encontró en el Catálogo — sin precio disponible" multiline w={220}>
                            <Badge size="xs" variant="light" color="red">sin catálogo</Badge>
                          </Tooltip>
                        )}
                      </Group>
                      {(f.categoria_tipo || f.seccion_menu) && (
                        <Text size="xs" c="dimmed">
                          {[f.categoria_tipo, f.seccion_menu].filter(Boolean).join(' · ')}
                        </Text>
                      )}
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={2}>
                      {f.turno ? <Badge size="sm" variant="light" color="grape">{f.turno}</Badge> : <Text size="xs" c="dimmed">—</Text>}
                      {(f.hora_apertura || f.hora_cierre) && (
                        <Text size="xs" c="dimmed">
                          {f.hora_apertura === f.hora_cierre ? f.hora_apertura : `${f.hora_apertura ?? '—'} – ${f.hora_cierre ?? '—'}`}
                        </Text>
                      )}
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={2}>
                      <Text size="sm">Comandas: <Text span fw={600}>{f.cantidad_comandas}</Text></Text>
                      {f.sin_match_productos_vendidos ? (
                        f.confirmado_en_historial ? (
                          <Tooltip
                            label="Este producto sí tiene ventas confirmadas en otros meses — Productos Vendidos probablemente no lo incluyó en el reporte de este día."
                            multiline
                            w={260}
                          >
                            <Text size="xs" c="dimmed" style={{ borderBottom: '1px dashed currentColor', width: 'fit-content' }}>
                              Sin match este día
                            </Text>
                          </Tooltip>
                        ) : (
                          <Tooltip label="Nunca se ha visto reportado en Productos Vendidos, en ningún periodo guardado" multiline w={240}>
                            <Text size="xs" c="red" style={{ borderBottom: '1px dashed currentColor', width: 'fit-content' }}>
                              Sin match
                            </Text>
                          </Tooltip>
                        )
                      ) : (
                        <Text size="xs" c="dimmed">Prod. Vendidos: {f.cantidad_vendida} (día)</Text>
                      )}
                    </Stack>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Stack gap={2} align="flex-end">
                      <CeldaDobleMoneda a="Costo" valorA={f.costo} b="Venta" valorB={f.precio_venta} />
                      {pctCosto !== null && (
                        <Badge
                          size="xs"
                          variant="light"
                          color={colorPorEstadoCosteo(pctCosto <= pctCostoObjetivo)}
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          % Costo {formatoPct(pctCosto)}
                        </Badge>
                      )}
                      {totalCosto != null && (
                        <Text size="xs" c="dimmed">Tot. Costo {formatoMoneda.format(totalCosto)}</Text>
                      )}
                    </Stack>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Stack gap={0} align="flex-end">
                      <Text size="sm" fw={700}>{f.total != null ? formatoMoneda.format(f.total) : '—'}</Text>
                      {(f.subtotal != null || f.impuesto != null || f.descuento != null) && (
                        <Tooltip
                          label={`Subtotal: ${f.subtotal != null ? formatoMoneda.format(f.subtotal) : '—'} · Impuesto: ${f.impuesto != null ? formatoMoneda.format(f.impuesto) : '—'} · Descuento: ${f.descuento != null ? formatoMoneda.format(f.descuento) : '—'}`}
                        >
                          <Text size="xs" c="dimmed" style={{ borderBottom: '1px dashed currentColor', width: 'fit-content' }}>
                            detalle
                          </Text>
                        </Tooltip>
                      )}
                    </Stack>
                  </Table.Td>
                  <Table.Td ta="right">
                    {conCortesia ? (
                      <Tooltip
                        label={`Ingreso real: ${f.ingreso_real != null ? formatoMoneda.format(f.ingreso_real) : '—'} · Piezas: ${f.cantidad_cortesia ?? '—'}`}
                      >
                        <Badge size="sm" color="red" variant="light" leftSection={<IconGift size={12} />}>
                          {formatoMoneda.format(f.monto_cortesia!)}
                        </Badge>
                      </Tooltip>
                    ) : (
                      <Text size="sm" c="dimmed">—</Text>
                    )}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Stack>
  );
}

const SIN_GRUPO_CONCILIACION = 'Sin grupo';

function PanelProductosConciliacionPorGrupo({
  filas,
  ivaFactor,
  pctCostoObjetivo,
}: {
  filas: FilaProductoConciliacion[];
  ivaFactor: number;
  pctCostoObjetivo: number;
}) {
  const [filtro, setFiltro] = useState('');
  const [filtroDebounced] = useDebouncedValue(filtro, 200);
  const [turnoActivo, setTurnoActivo] = useState('Todos');

  const conteoPorTurno = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const f of filas) {
      const clave = f.turno ?? 'Sin Clasificar';
      mapa.set(clave, (mapa.get(clave) ?? 0) + 1);
    }
    return mapa;
  }, [filas]);

  const filasFiltradas = useMemo(() => {
    let resultado = filas;
    if (turnoActivo !== 'Todos') {
      resultado = resultado.filter((f) => (f.turno ?? 'Sin Clasificar') === turnoActivo);
    }
    if (filtroDebounced) {
      const texto = filtroDebounced.toLowerCase();
      resultado = resultado.filter((f) => f.producto.toLowerCase().includes(texto));
    }
    return resultado;
  }, [filas, turnoActivo, filtroDebounced]);

  const porGrupo = useMemo(() => {
    const mapa = new Map<string, FilaProductoConciliacion[]>();
    for (const f of filasFiltradas) {
      const clave = f.grupo ?? SIN_GRUPO_CONCILIACION;
      const lista = mapa.get(clave) ?? [];
      lista.push(f);
      mapa.set(clave, lista);
    }
    return new Map([...mapa.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }, [filasFiltradas]);

  return (
    <Stack gap="md">
      <SegmentedControl
        value={turnoActivo}
        onChange={setTurnoActivo}
        data={TURNOS_FILTRO.map((t) => ({
          label: t === 'Todos' ? `Todos (${filas.length})` : `${t} (${conteoPorTurno.get(t) ?? 0})`,
          value: t,
        }))}
      />
      <TextInput
        placeholder="Buscar producto por nombre"
        leftSection={<IconSearch size={16} />}
        value={filtro}
        onChange={(e) => setFiltro(e.currentTarget.value)}
      />
      {porGrupo.size === 0 ? (
        <Text size="sm" c="dimmed">No hay productos que coincidan con la búsqueda.</Text>
      ) : (
        <Accordion variant="separated">
          {[...porGrupo.entries()].map(([grupo, filasGrupo]) => {
            const conDiscrepancia = filasGrupo.filter((f) => f.discrepancia).length;
            return (
              <Accordion.Item key={grupo} value={grupo}>
                <Accordion.Control>
                  <Group justify="space-between" wrap="wrap" pr="md">
                    <Text fw={600} size="sm">{grupo}</Text>
                    <Group gap="xs">
                      <Badge size="sm" variant="light" color="grape">{filasGrupo.length} fila(s)</Badge>
                      {conDiscrepancia > 0 && (
                        <Badge size="sm" variant="light" color="red">{conDiscrepancia} con discrepancia</Badge>
                      )}
                    </Group>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <TablaProductosConciliacion filas={filasGrupo} ivaFactor={ivaFactor} pctCostoObjetivo={pctCostoObjetivo} />
                </Accordion.Panel>
              </Accordion.Item>
            );
          })}
        </Accordion>
      )}
    </Stack>
  );
}

// Tarjeta explicativa de qué es una "discrepancia" — pensada para que
// gerencia/dirección la lea directo en el sistema sin depender de que
// alguien se los explique aparte. Lenguaje sin jerga técnica (nada de
// "sin_match_productos_vendidos"), y deja explícito que los montos en
// pantalla NO se ven afectados por esto. Visible por defecto (no
// escondida detrás de un tooltip) pero colapsable para no estorbar en uso
// diario una vez que el equipo ya se la sabe.
function ExplicacionDiscrepancias() {
  const [abierta, setAbierta] = useState(true);
  return (
    <Card withBorder radius="md" p="md" style={{ borderLeft: '4px solid var(--mantine-color-indigo-6)' }}>
      <Stack gap={abierta ? 'sm' : 0}>
        <UnstyledButton onClick={() => setAbierta((v) => !v)}>
          <Group justify="space-between">
            <Group gap="xs">
              <ThemeIcon size={26} radius="md" variant="light" color="indigo">
                <IconAlertTriangle size={15} />
              </ThemeIcon>
              <Text fw={600} size="sm">¿Qué significa "discrepancia" en esta pantalla?</Text>
            </Group>
            <ActionIcon variant="subtle" color="gray" size="sm">
              {abierta ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
            </ActionIcon>
          </Group>
        </UnstyledButton>
        <Collapse in={abierta}>
          <Stack gap="xs" pt="xs">
            <Text size="sm">
              Cada producto se cruza contra dos fuentes independientes: lo que <b>Comandas Emitidas</b> registró que se
              pidió, y lo que <b>Productos Vendidos</b> (el reporte del sistema de punto de venta) dice que se vendió
              ese mismo período. Cuando esas dos cantidades no coinciden, la fila se marca como <b>discrepancia</b>.
            </Text>
            <Text size="sm">
              Casi siempre se debe a una de estas dos causas, ambas del lado del reporte del punto de venta, no de este
              sistema:
            </Text>
            <List size="sm" spacing={4} icon={<Text span c="indigo" fw={700}>•</Text>}>
              <List.Item>El producto sí se vendió, pero el reporte de Productos Vendidos no lo incluyó ese día.</List.Item>
              <List.Item>La venta se registró bajo el nombre de un producto parecido en vez del correcto (ej. una cerveza de una marca reportada como si fuera otra).</List.Item>
            </List>
            <Text size="sm" fw={600} c="teal">
              Importante: una discrepancia NO afecta los montos que se muestran en pantalla (Costo, Precio, Total) — esos
              siempre se calculan con lo que Comandas registró y el precio del Catálogo, nunca con el número del reporte
              de Productos Vendidos. La discrepancia es solo una señal de revisión sobre la cantidad reportada, no un
              error en el dinero.
            </Text>
          </Stack>
        </Collapse>
      </Stack>
    </Card>
  );
}

function PanelConciliacionVentasDiarias() {
  const [diaActivo, setDiaActivo] = useState<string | null>(null);

  const dias = useDiasComandasEmitidas();
  const diaMasReciente = dias.data?.dias[0]?.fecha ?? null;
  const diaMostrado = diaActivo ?? diaMasReciente;

  const conciliacion = useConciliacionVentasDiarias(diaMostrado);
  const configuracionCosteo = useConfiguracionCosteo();
  const ivaFactor = configuracionCosteo.data?.configuracion.iva_factor ?? 1.16;
  const pctCostoObjetivo = configuracionCosteo.data?.configuracion.pct_costo_objetivo ?? 0.28;

  const productos = conciliacion.data?.productos ?? [];
  const totalDiscrepancias = productos.filter((p) => p.discrepancia).length;
  const totalSinMatch = productos.filter((p) => p.sin_match_productos_vendidos).length;

  return (
    <Stack gap="lg">
      <Card withBorder radius="md" p="lg">
        <Stack gap="md">
          <Group gap="xs">
            <ThemeIcon size={28} radius="md" variant="light" color="indigo">
              <IconListDetails size={16} />
            </ThemeIcon>
            <Title order={4}>Conciliación por día</Title>
          </Group>

          {(dias.data?.dias.length ?? 0) === 0 ? (
            <Text size="sm" c="dimmed">
              Todavía no hay días de Comandas Emitidas guardados — sube un archivo en la pestaña "Comandas Emitidas".
            </Text>
          ) : (
            <SelectorDiasPorMes
              items={dias.data!.dias.map((d) => ({ clave: d.fecha, fecha: d.fecha, etiqueta: d.fecha, total: d.total }))}
              activo={diaMostrado}
              onSeleccionar={setDiaActivo}
              color="indigo"
            />
          )}

          {diaMostrado && !conciliacion.data?.productos_vendidos_disponible && (
            <Text size="sm" c="orange">
              No hay Productos Vendidos guardado para este día — la vista Por Producto no podrá comparar cantidades.
            </Text>
          )}
          {conciliacion.data?.productos_rango && (
            <Text size="sm" c="orange">
              Productos Vendidos para este período se subió como un rango ({conciliacion.data.productos_rango.fecha_desde} –{' '}
              {conciliacion.data.productos_rango.fecha_hasta}) — "Por Producto" compara Comandas de todo ese rango, no
              solo el día seleccionado arriba. "Por Cuenta" sigue mostrando solo las cuentas de este día.
            </Text>
          )}
        </Stack>
      </Card>

      {diaMostrado && (
        <>
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
            <StatCard title="Cuentas" value={conciliacion.data?.cuentas.length ?? 0} icon={IconReceiptTax} color="brand" description={diaMostrado} />
            <StatCard title="Productos distintos" value={productos.length} icon={IconShoppingCart} color="info" description="Comandas + Productos Vendidos" />
            <StatCard
              title="Con discrepancia"
              value={totalDiscrepancias}
              icon={IconAlertTriangle}
              color={totalDiscrepancias > 0 ? 'warning' : 'success'}
              description={`${totalSinMatch} sin match en Productos Vendidos`}
            />
          </SimpleGrid>

          <ExplicacionDiscrepancias />

          <Card withBorder radius="md" p="lg">
            <Tabs defaultValue="cuentas" variant="pills" color="indigo" keepMounted={false}>
              <Tabs.List>
                <Tabs.Tab value="cuentas">Por Cuenta</Tabs.Tab>
                <Tabs.Tab value="productos">Por Producto</Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel value="cuentas" pt="lg">
                {conciliacion.isLoading ? (
                  <Text size="sm" c="dimmed">Cargando...</Text>
                ) : (
                  <PanelCuentasConciliacion cuentas={conciliacion.data?.cuentas ?? []} />
                )}
              </Tabs.Panel>
              <Tabs.Panel value="productos" pt="lg">
                {conciliacion.isLoading ? (
                  <Text size="sm" c="dimmed">Cargando...</Text>
                ) : productos.length === 0 ? (
                  <Text size="sm" c="dimmed">No hay productos para este día.</Text>
                ) : (
                  <PanelProductosConciliacionPorGrupo filas={productos} ivaFactor={ivaFactor} pctCostoObjetivo={pctCostoObjetivo} />
                )}
              </Tabs.Panel>
            </Tabs>
          </Card>
        </>
      )}
    </Stack>
  );
}

// ════════════════════════════════════════════════════════════════════
// Análisis de ventas — pestaña "Análisis" de cada POS: ranking de productos
// por cantidad vendida (más se vende arriba, menos se pide abajo), dentro
// de la unidad de agrupación natural de cada punto de venta (sección de
// menú en Restaurante, categoría en Carreta de Mariscos, todo el periodo en
// Cafetería que no tiene esa clasificación). No requiere backend nuevo: se
// cruza lo que ya devuelven `useProductosVendidos*` (cantidad/subtotal por
// producto) y `useCortesiasProductosVendidos*` (cantidad_cortesia/
// monto_cortesia por producto, misma clave grupo+nombre_producto ya que
// ambos endpoints leen la misma tabla). Paso previo a una "Fase 3" de
// análisis por día/hora — esa fase no se construye aquí.
// ════════════════════════════════════════════════════════════════════

type FilaAnalisisVentas = {
  nombre_producto: string;
  grupo: string;
  cantidad: number;
  subtotal: number;
  cantidad_cortesia: number;
  monto_cortesia: number;
};

function construirFilasAnalisis(
  productos: { nombre_producto: string; grupo: string; cantidad: number | null; subtotal: number | null }[],
  cortesias: { nombre_producto: string; grupo: string; cantidad_cortesia: number | null; monto_cortesia: number | null }[],
): FilaAnalisisVentas[] {
  const cortesiaPorClave = new Map<string, { cantidad_cortesia: number | null; monto_cortesia: number | null }>();
  for (const f of cortesias) {
    cortesiaPorClave.set(`${f.grupo}|${f.nombre_producto}`, f);
  }
  return productos.map((p) => {
    const cortesia = cortesiaPorClave.get(`${p.grupo}|${p.nombre_producto}`);
    return {
      nombre_producto: p.nombre_producto,
      grupo: p.grupo,
      cantidad: Math.round(p.cantidad ?? 0),
      subtotal: p.subtotal ?? 0,
      cantidad_cortesia: cortesia?.cantidad_cortesia ?? 0,
      monto_cortesia: cortesia?.monto_cortesia ?? 0,
    };
  });
}

// Tabla compartida por los 3 POS — ordena por cantidad descendente (más
// vendido arriba, menos pedido abajo) y resalta en rojo la fila/columna de
// piezas cuando el producto tiene cortesía detectada, mismo criterio visual
// que ya usa TablaComparacionIva.
function TablaAnalisisVentas({ filas, mostrarGrupo = true }: { filas: FilaAnalisisVentas[]; mostrarGrupo?: boolean }) {
  const ordenadas = useMemo(() => [...filas].sort((a, b) => b.cantidad - a.cantidad), [filas]);

  if (ordenadas.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No hay productos que mostrar aquí.
      </Text>
    );
  }

  const encabezados = ['#', 'Producto', ...(mostrarGrupo ? ['Grupo'] : []), 'Cantidad vendida', 'Cortesía (piezas)', 'Subtotal'];
  const primeraColumnaDerecha = mostrarGrupo ? 3 : 2;

  return (
    <Card withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
      <Table.ScrollContainer minWidth={720}>
        <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
          <Table.Thead
            style={{
              background: 'var(--mantine-color-default-hover)',
              borderBottom: '2px solid var(--mantine-color-default-border)',
            }}
          >
            <Table.Tr>
              {encabezados.map((encabezado, i) => (
                <Table.Th
                  key={encabezado}
                  ta={i >= primeraColumnaDerecha ? 'right' : undefined}
                  style={{ fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--mantine-color-dimmed)' }}
                >
                  {encabezado}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {ordenadas.map((f, i) => {
              const conCortesia = f.cantidad_cortesia > 0;
              return (
                <Table.Tr key={`${f.grupo}-${f.nombre_producto}-${i}`}>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      {i + 1}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {f.nombre_producto}
                    </Text>
                  </Table.Td>
                  {mostrarGrupo && (
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {f.grupo}
                      </Text>
                    </Table.Td>
                  )}
                  <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }} fw={600}>
                    {f.cantidad}
                  </Table.Td>
                  <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {conCortesia ? (
                      <Badge size="sm" variant="light" color="red" leftSection={<IconAlertTriangle size={12} />}>
                        {f.cantidad_cortesia}
                      </Badge>
                    ) : (
                      <Text size="sm" c="dimmed">
                        —
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatoMoneda.format(f.subtotal)}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Card>
  );
}

// Cuadrícula de tarjetas por grupo — mismo criterio visual que
// PanelGruposProductosVendidos (grid de tarjetas, clic entra a la tabla de
// solo ese grupo, botón "Volver a grupos" para salir), compartida por los 3
// POS ya que solo depende de los campos estructurales que también usa
// construirFilasAnalisis. La tarjeta "Global" (siempre primera) junta todos
// los grupos recibidos en una sola tabla con columna Grupo visible.
function PanelGruposAnalisisVentas({
  productos,
  filasCortesia,
  color,
}: {
  productos: { nombre_producto: string; grupo: string; cantidad: number | null; subtotal: number | null }[];
  filasCortesia: { nombre_producto: string; grupo: string; cantidad_cortesia: number | null; monto_cortesia: number | null }[];
  color: string;
}) {
  const [grupoActivo, setGrupoActivo] = useState<string | null>(null);

  const porGrupo = useMemo(() => {
    const mapa = new Map<string, typeof productos>();
    for (const p of productos) {
      const lista = mapa.get(p.grupo) ?? [];
      lista.push(p);
      mapa.set(p.grupo, lista);
    }
    return mapa;
  }, [productos]);

  const grupos = useMemo(() => Array.from(porGrupo.keys()).sort(), [porGrupo]);

  const filasGlobal = useMemo(() => construirFilasAnalisis(productos, filasCortesia), [productos, filasCortesia]);

  const topMasVendidos = useMemo(
    () => [...filasGlobal].sort((a, b) => b.cantidad - a.cantidad).slice(0, 10),
    [filasGlobal],
  );
  const topMenosVendidos = useMemo(
    () =>
      filasGlobal
        .filter((f) => f.cantidad > 0)
        .sort((a, b) => a.cantidad - b.cantidad)
        .slice(0, 10),
    [filasGlobal],
  );

  if (grupoActivo === 'GLOBAL') {
    return (
      <Stack gap="md">
        <Button
          variant="subtle"
          size="sm"
          leftSection={<IconArrowLeft size={16} />}
          onClick={() => setGrupoActivo(null)}
          style={{ alignSelf: 'flex-start' }}
        >
          Volver a grupos
        </Button>
        <Title order={5}>Global — todos los grupos</Title>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <Card withBorder radius="md" p="md">
            <Text size="sm" fw={600} mb="xs">
              Top 10 más vendidos
            </Text>
            <ResponsiveContainer width="100%" height={Math.max(220, topMasVendidos.length * 32)}>
              <BarChart data={topMasVendidos} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="nombre_producto"
                  width={140}
                  tick={{ fontSize: 11 }}
                  interval={0}
                />
                <RechartsTooltip formatter={(value: any) => [value, 'Cantidad vendida']} />
                <Bar dataKey="cantidad" fill={`var(--mantine-color-${color}-6)`} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card withBorder radius="md" p="md">
            <Text size="sm" fw={600} mb="xs">
              Top 10 que menos se piden
            </Text>
            {topMenosVendidos.length === 0 ? (
              <Text size="sm" c="dimmed">
                No hay suficientes productos vendidos para mostrar esta comparación.
              </Text>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(220, topMenosVendidos.length * 32)}>
                <BarChart data={topMenosVendidos} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="nombre_producto"
                    width={140}
                    tick={{ fontSize: 11 }}
                    interval={0}
                  />
                  <RechartsTooltip formatter={(value: any) => [value, 'Cantidad vendida']} />
                  <Bar dataKey="cantidad" fill="var(--mantine-color-orange-6)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </SimpleGrid>

        <TablaAnalisisVentas filas={filasGlobal} />
      </Stack>
    );
  }

  if (grupoActivo && porGrupo.has(grupoActivo)) {
    const itemsGrupo = porGrupo.get(grupoActivo) ?? [];
    return (
      <Stack gap="md">
        <Button
          variant="subtle"
          size="sm"
          leftSection={<IconArrowLeft size={16} />}
          onClick={() => setGrupoActivo(null)}
          style={{ alignSelf: 'flex-start' }}
        >
          Volver a grupos
        </Button>
        <Title order={5}>{grupoActivo}</Title>
        <TablaAnalisisVentas filas={construirFilasAnalisis(itemsGrupo, filasCortesia)} mostrarGrupo={false} />
      </Stack>
    );
  }

  if (grupos.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No hay productos vendidos guardados para este periodo.
      </Text>
    );
  }

  return (
    <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="md">
      <UnstyledButton onClick={() => setGrupoActivo('GLOBAL')}>
        <Card withBorder radius="md" p="md" style={{ borderLeft: `3px solid var(--mantine-color-${color}-6)`, height: '100%' }}>
          <Stack gap={6}>
            <Group gap={6}>
              <IconTrendingUp size={16} />
              <Text size="sm" fw={700}>
                Global
              </Text>
            </Group>
            <Text size="xs" c="dimmed">
              Todos los grupos combinados
            </Text>
            <Text size="xs" c="dimmed">
              {productos.length} producto(s)
            </Text>
          </Stack>
        </Card>
      </UnstyledButton>
      {grupos.map((grupo) => {
        const items = porGrupo.get(grupo) ?? [];
        const totalPiezas = items.reduce((acc, p) => acc + Math.round(p.cantidad ?? 0), 0);
        return (
          <UnstyledButton key={grupo} onClick={() => setGrupoActivo(grupo)}>
            <Card withBorder radius="md" p="md" style={{ borderLeft: `3px solid var(--mantine-color-${color}-6)`, height: '100%' }}>
              <Stack gap={6}>
                <Text size="sm" fw={600} lineClamp={2}>
                  {grupo}
                </Text>
                <Text size="xs" c="dimmed">
                  {items.length} producto(s)
                </Text>
                <Text size="sm" fw={700} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {totalPiezas} pieza(s)
                </Text>
              </Stack>
            </Card>
          </UnstyledButton>
        );
      })}
    </SimpleGrid>
  );
}

// Restaurante — pestañas por seccion_menu (Desayuno/Comida-Cena/Bar/Extra/
// Otros) + "Sin clasificar", cada una con una sola tabla (sin nivel de
// Grupo intermedio: el objetivo es comparar ventas dentro de toda la
// sección, no dentro de un solo grupo).
function PanelAnalisisVentasRestaurante() {
  const [fechaDesdeVer, setFechaDesdeVer] = useState<string | null>(null);
  const [seccionActiva, setSeccionActiva] = useState<string | null>(null);

  const lotes = useLotesProductosVendidos();
  const fechaDesdeActivo = fechaDesdeVer ?? lotes.data?.lotes[0]?.fecha_desde ?? null;
  const etiquetaActiva = lotes.data?.lotes.find((l) => l.fecha_desde === fechaDesdeActivo)?.etiqueta ?? fechaDesdeActivo;
  const datos = useProductosVendidos(fechaDesdeActivo);
  const cortesias = useCortesiasProductosVendidos(fechaDesdeActivo);

  const productos = datos.data?.productos ?? [];
  const filasCortesia = cortesias.data?.comparacion ?? [];

  const productosPorSeccion = useMemo(() => agruparProductosVendidosPor(productos, 'seccion_menu'), [productos]);
  const productosSinClasificar = useMemo(() => productos.filter((p) => !p.producto_catalogo_encontrado), [productos]);
  const seccionesConDatos = SECCIONES_MENU.filter((sec) => (productosPorSeccion.get(sec.clave)?.length ?? 0) > 0);

  const seccionMostrada =
    seccionActiva && (seccionesConDatos.some((sec) => sec.clave === seccionActiva) || seccionActiva === 'sin-clasificar')
      ? seccionActiva
      : (seccionesConDatos[0]?.clave ?? (productosSinClasificar.length > 0 ? 'sin-clasificar' : null));

  const totalPiezas = productos.reduce((acc, p) => acc + Math.round(p.cantidad ?? 0), 0);
  const totalPiezasCortesia = filasCortesia.reduce((acc, f) => acc + (f.cantidad_cortesia ?? 0), 0);

  return (
    <Stack gap="lg">
      <Card withBorder radius="md" p="lg">
        <Stack gap="md">
          <Group gap="xs">
            <ThemeIcon size={28} radius="md" variant="light" color="grape">
              <IconTrendingUp size={16} />
            </ThemeIcon>
            <Title order={4}>Análisis de ventas por sección</Title>
          </Group>

          {lotes.data && lotes.data.lotes.length > 0 ? (
            <Group gap="sm" align="center">
              <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                Lote:
              </Text>
              <Group gap="xs">
                {lotes.data.lotes.map((l) => (
                  <Button
                    key={l.fecha_desde}
                    size="xs"
                    variant={l.fecha_desde === fechaDesdeActivo ? 'filled' : 'default'}
                    color="grape"
                    onClick={() => setFechaDesdeVer(l.fecha_desde)}
                  >
                    {l.etiqueta} ({l.total})
                  </Button>
                ))}
              </Group>
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              Todavía no hay ningún lote guardado.
            </Text>
          )}

          {fechaDesdeActivo && (
            <>
              <Divider />

              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                <StatCard title="Piezas vendidas" value={totalPiezas} icon={IconShoppingCart} color="brand" description={etiquetaActiva ?? ''} />
                <StatCard
                  title="Piezas de cortesía"
                  value={totalPiezasCortesia}
                  icon={IconGift}
                  color={totalPiezasCortesia > 0 ? 'warning' : 'success'}
                  description="Detectadas contra el Impuesto"
                />
                <StatCard title="Productos distintos" value={productos.length} icon={IconListDetails} color="info" description="Filas del lote" />
              </SimpleGrid>

              <Divider />

              {datos.isLoading || cortesias.isLoading ? (
                <Text size="sm" c="dimmed">Cargando...</Text>
              ) : seccionesConDatos.length === 0 && productosSinClasificar.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No hay productos vendidos guardados para este lote.
                </Text>
              ) : (
                <Tabs value={seccionMostrada} onChange={setSeccionActiva} variant="pills" color="dark" keepMounted={false}>
                  <Tabs.List>
                    {seccionesConDatos.map((sec) => (
                      <Tabs.Tab
                        key={sec.clave}
                        value={sec.clave}
                        color={sec.color}
                        leftSection={<sec.icono size={16} />}
                        rightSection={
                          <Badge size="sm" variant="light" color={sec.clave === seccionMostrada ? 'white' : sec.color}>
                            {productosPorSeccion.get(sec.clave)?.length ?? 0}
                          </Badge>
                        }
                      >
                        {sec.clave}
                      </Tabs.Tab>
                    ))}
                    {productosSinClasificar.length > 0 && (
                      <Tabs.Tab
                        value="sin-clasificar"
                        color="red"
                        leftSection={<IconAlertTriangle size={16} />}
                        rightSection={
                          <Badge size="sm" variant="light" color={seccionMostrada === 'sin-clasificar' ? 'white' : 'red'}>
                            {productosSinClasificar.length}
                          </Badge>
                        }
                      >
                        Sin clasificar
                      </Tabs.Tab>
                    )}
                  </Tabs.List>

                  {seccionesConDatos.map((sec) => (
                    <Tabs.Panel key={sec.clave} value={sec.clave} pt="lg">
                      <PanelGruposAnalisisVentas
                        productos={productosPorSeccion.get(sec.clave) ?? []}
                        filasCortesia={filasCortesia}
                        color="grape"
                      />
                    </Tabs.Panel>
                  ))}
                  {productosSinClasificar.length > 0 && (
                    <Tabs.Panel value="sin-clasificar" pt="lg">
                      <PanelGruposAnalisisVentas productos={productosSinClasificar} filasCortesia={filasCortesia} color="grape" />
                    </Tabs.Panel>
                  )}
                </Tabs>
              )}
            </>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}

// Cafetería — sin seccion_menu/categoria_tipo: una sola tabla para todo el
// periodo (con columna Grupo visible para no perder contexto), sin pestañas.
function PanelAnalisisVentasCafeteria() {
  const [periodoVer, setPeriodoVer] = useState<string | null>(null);

  const periodos = usePeriodosProductosVendidosCafeteria();
  const periodoActivo = periodoVer ?? periodos.data?.periodos[0]?.periodo ?? null;
  const datos = useProductosVendidosCafeteria(periodoActivo);
  const cortesias = useCortesiasProductosVendidosCafeteria(periodoActivo);

  const productos = datos.data?.productos ?? [];
  const filasCortesia = cortesias.data?.comparacion ?? [];
  const totalPiezas = productos.reduce((acc, p) => acc + Math.round(p.cantidad ?? 0), 0);
  const totalPiezasCortesia = filasCortesia.reduce((acc, f) => acc + (f.cantidad_cortesia ?? 0), 0);

  return (
    <Stack gap="lg">
      <Card withBorder radius="md" p="lg">
        <Stack gap="md">
          <Group gap="xs">
            <ThemeIcon size={28} radius="md" variant="light" color="teal">
              <IconTrendingUp size={16} />
            </ThemeIcon>
            <Title order={4}>Análisis de ventas</Title>
          </Group>

          {periodos.data && periodos.data.periodos.length > 0 ? (
            <Group gap="sm" align="center">
              <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                Periodo:
              </Text>
              <Group gap="xs">
                {periodos.data.periodos.map((p) => (
                  <Button
                    key={p.periodo}
                    size="xs"
                    variant={p.periodo === periodoActivo ? 'filled' : 'default'}
                    color="teal"
                    onClick={() => setPeriodoVer(p.periodo)}
                  >
                    {p.periodo} ({p.total})
                  </Button>
                ))}
              </Group>
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              Todavía no hay ningún periodo guardado.
            </Text>
          )}

          {periodoActivo && (
            <>
              <Divider />

              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                <StatCard title="Piezas vendidas" value={totalPiezas} icon={IconShoppingCart} color="brand" description={periodoActivo} />
                <StatCard
                  title="Piezas de cortesía"
                  value={totalPiezasCortesia}
                  icon={IconGift}
                  color={totalPiezasCortesia > 0 ? 'warning' : 'success'}
                  description="Detectadas contra el Impuesto"
                />
                <StatCard title="Productos distintos" value={productos.length} icon={IconListDetails} color="info" description="Filas del periodo" />
              </SimpleGrid>

              <Divider />

              {datos.isLoading || cortesias.isLoading ? (
                <Text size="sm" c="dimmed">Cargando...</Text>
              ) : (
                <PanelGruposAnalisisVentas productos={productos} filasCortesia={filasCortesia} color="teal" />
              )}
            </>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}

// Carreta de Mariscos — pestañas por categoria_tipo (Alimentos/Bebidas/
// Otros) + "Sin clasificar", mismo criterio que Restaurante pero sin nivel
// de Sección (ese catálogo no la tiene).
function PanelAnalisisVentasCarretaMariscos() {
  const [periodoVer, setPeriodoVer] = useState<string | null>(null);
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null);

  const periodos = usePeriodosProductosVendidosCarretaMariscos();
  const periodoActivo = periodoVer ?? periodos.data?.periodos[0]?.periodo ?? null;
  const datos = useProductosVendidosCarretaMariscos(periodoActivo);
  const cortesias = useCortesiasProductosVendidosCarretaMariscos(periodoActivo);

  const productos = datos.data?.productos ?? [];
  const filasCortesia = cortesias.data?.comparacion ?? [];

  const productosPorCategoria = useMemo(() => agruparProductosVendidosCarretaMariscosPorCategoria(productos), [productos]);
  const productosSinClasificar = useMemo(() => productos.filter((p) => !p.producto_catalogo_encontrado), [productos]);
  const categoriasConDatos = CATEGORIAS_TIPO.filter((cat) => (productosPorCategoria.get(cat.clave)?.length ?? 0) > 0);

  const categoriaMostrada =
    categoriaActiva && (categoriasConDatos.some((cat) => cat.clave === categoriaActiva) || categoriaActiva === 'sin-clasificar')
      ? categoriaActiva
      : (categoriasConDatos[0]?.clave ?? (productosSinClasificar.length > 0 ? 'sin-clasificar' : null));

  const totalPiezas = productos.reduce((acc, p) => acc + Math.round(p.cantidad ?? 0), 0);
  const totalPiezasCortesia = filasCortesia.reduce((acc, f) => acc + (f.cantidad_cortesia ?? 0), 0);

  return (
    <Stack gap="lg">
      <Card withBorder radius="md" p="lg">
        <Stack gap="md">
          <Group gap="xs">
            <ThemeIcon size={28} radius="md" variant="light" color="cyan">
              <IconTrendingUp size={16} />
            </ThemeIcon>
            <Title order={4}>Análisis de ventas por categoría</Title>
          </Group>

          {periodos.data && periodos.data.periodos.length > 0 ? (
            <Group gap="sm" align="center">
              <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                Periodo:
              </Text>
              <Group gap="xs">
                {periodos.data.periodos.map((p) => (
                  <Button
                    key={p.periodo}
                    size="xs"
                    variant={p.periodo === periodoActivo ? 'filled' : 'default'}
                    color="cyan"
                    onClick={() => setPeriodoVer(p.periodo)}
                  >
                    {p.periodo} ({p.total})
                  </Button>
                ))}
              </Group>
            </Group>
          ) : (
            <Text size="sm" c="dimmed">
              Todavía no hay ningún periodo guardado.
            </Text>
          )}

          {periodoActivo && (
            <>
              <Divider />

              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                <StatCard title="Piezas vendidas" value={totalPiezas} icon={IconShoppingCart} color="brand" description={periodoActivo} />
                <StatCard
                  title="Piezas de cortesía"
                  value={totalPiezasCortesia}
                  icon={IconGift}
                  color={totalPiezasCortesia > 0 ? 'warning' : 'success'}
                  description="Detectadas contra el Impuesto"
                />
                <StatCard title="Productos distintos" value={productos.length} icon={IconListDetails} color="info" description="Filas del periodo" />
              </SimpleGrid>

              <Divider />

              {datos.isLoading || cortesias.isLoading ? (
                <Text size="sm" c="dimmed">Cargando...</Text>
              ) : categoriasConDatos.length === 0 && productosSinClasificar.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No hay productos vendidos guardados para este periodo.
                </Text>
              ) : (
                <Tabs value={categoriaMostrada} onChange={setCategoriaActiva} variant="pills" keepMounted={false}>
                  <Tabs.List>
                    {categoriasConDatos.map((cat) => (
                      <Tabs.Tab
                        key={cat.clave}
                        value={cat.clave}
                        color={cat.color}
                        leftSection={<cat.icono size={16} />}
                        rightSection={
                          <Badge size="sm" variant="light" color={cat.clave === categoriaMostrada ? 'white' : cat.color}>
                            {productosPorCategoria.get(cat.clave)?.length ?? 0}
                          </Badge>
                        }
                      >
                        {cat.etiqueta}
                      </Tabs.Tab>
                    ))}
                    {productosSinClasificar.length > 0 && (
                      <Tabs.Tab
                        value="sin-clasificar"
                        color="red"
                        leftSection={<IconAlertTriangle size={16} />}
                        rightSection={
                          <Badge size="sm" variant="light" color={categoriaMostrada === 'sin-clasificar' ? 'white' : 'red'}>
                            {productosSinClasificar.length}
                          </Badge>
                        }
                      >
                        Sin clasificar
                      </Tabs.Tab>
                    )}
                  </Tabs.List>

                  {categoriasConDatos.map((cat) => (
                    <Tabs.Panel key={cat.clave} value={cat.clave} pt="lg">
                      <PanelGruposAnalisisVentas
                        productos={productosPorCategoria.get(cat.clave) ?? []}
                        filasCortesia={filasCortesia}
                        color="cyan"
                      />
                    </Tabs.Panel>
                  ))}
                  {productosSinClasificar.length > 0 && (
                    <Tabs.Panel value="sin-clasificar" pt="lg">
                      <PanelGruposAnalisisVentas productos={productosSinClasificar} filasCortesia={filasCortesia} color="cyan" />
                    </Tabs.Panel>
                  )}
                </Tabs>
              )}
            </>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}

export default function CatalogoProductosPage() {
  const [vistaPrincipal, setVistaPrincipal] = useState<VistaPrincipalCatalogoClave | null>(null);
  const [posActivo, setPosActivo] = useState<PuntoVentaClave | null>(null);

  // ── Breadcrumb labels ────────────────────────────────────────────
  const labelPrincipal: Record<VistaPrincipalCatalogoClave, string> = {
    'puntos-venta': 'Puntos de Venta',
    'inteligencia-negocio': 'Inteligencia de Negocio',
    'reporte-produccion': 'Producción de Carnes y Mariscos',
  };
  const colorPrincipal: Record<VistaPrincipalCatalogoClave, string> = {
    'puntos-venta': 'grape',
    'inteligencia-negocio': 'indigo',
    'reporte-produccion': 'red',
  };
  const labelPos: Record<PuntoVentaClave, string> = {
    restaurante: 'Restaurante',
    cafeteria: 'Cafetería',
    'carreta-mariscos': 'La Carreta de Mariscos',
  };

  return (
    <Stack gap="lg">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <Group gap="md" justify="space-between">
        <Group gap="sm">
          <ThemeIcon size={44} radius="xl" variant="filled" color="grape"
            style={{ boxShadow: '0 4px 12px var(--mantine-color-grape-light)' }}
          >
            <IconToolsKitchen2 size={24} />
          </ThemeIcon>
          <div>
            <Title order={2}>Catálogo de Productos</Title>
            <Text size="sm" c="dimmed">
              Catálogo maestro de recetas — costo, precio, costeo y análisis de ventas.
            </Text>
          </div>
        </Group>
      </Group>

      {/* ── Breadcrumb visual ──────────────────────────────────────── */}
      {vistaPrincipal !== null && (
        <Group gap={6} style={{ flexWrap: 'wrap' }}>
          <UnstyledButton
            onClick={() => { setVistaPrincipal(null); setPosActivo(null); }}
          >
            <Text size="sm" c="dimmed" style={{ textDecoration: 'underline dotted', textUnderlineOffset: 3 }}>
              Catálogo de Productos
            </Text>
          </UnstyledButton>
          <Text size="sm" c="dimmed">/</Text>
          {posActivo !== null ? (
            <>
              <UnstyledButton onClick={() => setPosActivo(null)}>
                <Text size="sm" c={colorPrincipal[vistaPrincipal]} style={{ textDecoration: 'underline dotted', textUnderlineOffset: 3 }}>
                  {labelPrincipal[vistaPrincipal]}
                </Text>
              </UnstyledButton>
              <Text size="sm" c="dimmed">/</Text>
              <Text size="sm" fw={700} c={colorPrincipal[vistaPrincipal]}>{labelPos[posActivo]}</Text>
            </>
          ) : (
            <Text size="sm" fw={700} c={colorPrincipal[vistaPrincipal]}>{labelPrincipal[vistaPrincipal]}</Text>
          )}
        </Group>
      )}

      {/* ── Content ────────────────────────────────────────────────── */}
      {vistaPrincipal === null ? (
        <PanelMenuPrincipalCatalogo onSeleccionar={setVistaPrincipal} />
      ) : (
        <>
          {vistaPrincipal === 'puntos-venta' &&
            (posActivo === null ? (
              <PanelMenuPuntosVenta onSeleccionar={setPosActivo} />
            ) : (
              <Stack gap="lg">
                {posActivo === 'restaurante' && <PanelRestaurante />}
                {posActivo === 'cafeteria' && <PanelCafeteria />}
                {posActivo === 'carreta-mariscos' && <PanelCarretaMariscos />}
              </Stack>
            ))}

          {vistaPrincipal === 'inteligencia-negocio' && <PanelInteligenciaNegocio />}

          {vistaPrincipal === 'reporte-produccion' && <ReporteProduccionPanel />}
        </>
      )}
    </Stack>
  );
}


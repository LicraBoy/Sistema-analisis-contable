/**
 * PagosPage — Table of pagos fetched from the API with status badges and filters.
 */

import {
  Badge,
  Button,
  Card,
  FileInput,
  Group,
  Modal,
  NumberInput,
  Pagination,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch, IconFileExport, IconClipboardList, IconFileTypeTxt } from '@tabler/icons-react';
import { useState } from 'react';
import {
  exportAuditoria,
  exportDiotFromExcel,
  exportPagos,
  fetchUsdPreview,
  parseCancelados,
  parseEgresos,
  parseRetencionIva10,
  parseRetencionIva4,
  parseRetencionIsr10,
  parseRetencionIsr125,
  parseIvaAcreditable,
  usePagos,
} from '../api/hooks';
import { EstadoPago, type UsdPreviewRow, type EgresoRelacionado, type CanceladoDetalle } from '../types';
import { notifications } from '@mantine/notifications';
import { PagoRowActions } from '../components/PagoRowActions';
import { ESTADO_PAGO_CONFIG } from '../theme/estadoPago';

export default function PagosPage() {
  const [searchFactura, setSearchFactura] = useState('');
  const [debouncedSearch] = useDebouncedValue(searchFactura, 300);
  const [filterEstado, setFilterEstado] = useState<string | null>(null);
  const [filterSinAmarre, setFilterSinAmarre] = useState(false);

  // Date filter state
  const [filterMes, setFilterMes] = useState<string | null>(String(new Date().getMonth() + 1));
  const [filterAnio, setFilterAnio] = useState<number | ''>(new Date().getFullYear());

  const [activePage, setActivePage] = useState(1);
  const pageSize = 20;

  // Compute fecha_desde / fecha_hasta based on month/year
  let fecha_desde: string | undefined = undefined;
  let fecha_hasta: string | undefined = undefined;
  if (filterMes && filterAnio) {
    const month = parseInt(filterMes, 10);
    const year = Number(filterAnio);
    if (!isNaN(month) && !isNaN(year)) {
      fecha_desde = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      fecha_hasta = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
    }
  }

  // Fetch payments with filters
  const { data, isLoading } = usePagos({
    estado: filterEstado as EstadoPago | undefined,
    factura: debouncedSearch || undefined,
    fecha_desde,
    fecha_hasta,
    sin_amarre: filterSinAmarre || undefined,
    page: activePage,
    page_size: pageSize,
  });

  // Export State
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFilename, setExportFilename] = useState('Reporte_Pagos');
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingAuditoria, setIsExportingAuditoria] = useState(false);
  // DIOT: re-subir el Reporte_Pagos ya corregido a mano en
  // Amarre/Pre-DIOT (y vuelto a guardar con Excel real) para generar el
  // .txt definitivo a partir de esos valores ya corregidos.
  const [diotExcelFile, setDiotExcelFile] = useState<File | null>(null);
  const [isExportingDiotFromExcel, setIsExportingDiotFromExcel] = useState(false);

  // Revisión de tipo de cambio (USD) antes de exportar
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isLoadingUsdPreview, setIsLoadingUsdPreview] = useState(false);
  const [usdRows, setUsdRows] = useState<UsdPreviewRow[]>([]);
  const [tipoCambioOverrides, setTipoCambioOverrides] = useState<Record<string, number>>({});

  // UUID cancelados (opcional) — se excluyen del Amarre antes de exportar
  const [canceladosFile, setCanceladosFile] = useState<File | null>(null);
  const [uuidsCancelados, setUuidsCancelados] = useState<string[]>([]);
  const [canceladosDetalle, setCanceladosDetalle] = useState<CanceladoDetalle[]>([]);

  // Egresos (opcional) — se restan los montos del Amarre antes de exportar
  const [egresosFile, setEgresosFile] = useState<File | null>(null);
  const [egresosRelacionados, setEgresosRelacionados] = useState<EgresoRelacionado[]>([]);
  const [egresosFilasTodas, setEgresosFilasTodas] = useState<Record<string, unknown>[]>([]);

  // Retenciones IVA RET 10% (opcional) — se concilia contra Amarre y se
  // agrega como hoja/sección más en el mismo Reporte_Pagos, no como un
  // documento aparte.
  const [retencionIva10File, setRetencionIva10File] = useState<File | null>(null);
  const [retencionIva10Filas, setRetencionIva10Filas] = useState<Record<string, unknown>[]>([]);
  const [retencionIva4File, setRetencionIva4File] = useState<File | null>(null);
  const [retencionIva4Filas, setRetencionIva4Filas] = useState<Record<string, unknown>[]>([]);
  const [retencionIsr10File, setRetencionIsr10File] = useState<File | null>(null);
  const [retencionIsr10Filas, setRetencionIsr10Filas] = useState<Record<string, unknown>[]>([]);
  const [retencionIsr125File, setRetencionIsr125File] = useState<File | null>(null);
  const [retencionIsr125Filas, setRetencionIsr125Filas] = useState<Record<string, unknown>[]>([]);
  const [ivaAcreditableFile, setIvaAcreditableFile] = useState<File | null>(null);
  const [ivaAcreditableFilas, setIvaAcreditableFilas] = useState<Record<string, unknown>[]>([]);

  const handleExport = async (
    tipoCambioOverridesToUse: Record<string, number> = {},
    uuidsCanceladosToUse: string[] = uuidsCancelados,
    egresosToUse: EgresoRelacionado[] = egresosRelacionados,
    canceladosDetalleToUse: CanceladoDetalle[] = canceladosDetalle,
    retencionIva10ToUse: Record<string, unknown>[] = retencionIva10Filas,
    retencionIva4ToUse: Record<string, unknown>[] = retencionIva4Filas,
    retencionIsr10ToUse: Record<string, unknown>[] = retencionIsr10Filas,
    retencionIsr125ToUse: Record<string, unknown>[] = retencionIsr125Filas,
    ivaAcreditableToUse: Record<string, unknown>[] = ivaAcreditableFilas,
    egresosFilasTodasToUse: Record<string, unknown>[] = egresosFilasTodas,
  ) => {
    setIsExporting(true);
    try {
      const blob = await exportPagos({
        // Exportar TODOS los registros del mes, sin importar el filtro de estado o factura
        fecha_desde,
        fecha_hasta,
        filename: exportFilename,
        tipo_cambio_overrides: tipoCambioOverridesToUse,
        uuids_cancelados: uuidsCanceladosToUse,
        egresos: egresosToUse,
        egresos_filas_todas: egresosFilasTodasToUse,
        cancelados_detalle: canceladosDetalleToUse,
        retencion_iva10_archivo: retencionIva10ToUse,
        retencion_iva4_archivo: retencionIva4ToUse,
        retencion_isr10_archivo: retencionIsr10ToUse,
        retencion_isr125_archivo: retencionIsr125ToUse,
        iva_acreditable_archivo: ivaAcreditableToUse,
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = exportFilename.endsWith('.xlsx') ? exportFilename : `${exportFilename}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setIsExportModalOpen(false);
      setIsReviewModalOpen(false);
    } catch (e) {
      notifications.show({ title: 'Error', message: 'No se pudo exportar', color: 'red' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportAuditoria = async () => {
    setIsExportingAuditoria(true);
    try {
      const blob = await exportAuditoria({ fecha_desde, fecha_hasta });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Reporte_Auditoria.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      notifications.show({ title: 'Error', message: 'No se pudo generar el reporte de auditoría', color: 'red' });
    } finally {
      setIsExportingAuditoria(false);
    }
  };

  const handleExportDiotFromExcel = async () => {
    if (!diotExcelFile) return;
    setIsExportingDiotFromExcel(true);
    try {
      const blob = await exportDiotFromExcel(diotExcelFile);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'DIOT.txt';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      notifications.show({ title: 'Error', message: 'No se pudo generar el .txt a partir del Excel subido', color: 'red' });
    } finally {
      setIsExportingDiotFromExcel(false);
    }
  };

  const handleDescargarClick = async () => {
    setIsLoadingUsdPreview(true);
    try {
      let uuidsCanceladosDetectados: string[] = [];
      let canceladosDetalleDetectado: CanceladoDetalle[] = [];
      if (canceladosFile) {
        const resultado = await parseCancelados(canceladosFile);
        canceladosDetalleDetectado = resultado.cancelados;
        uuidsCanceladosDetectados = resultado.cancelados
          .map((c) => String(c.UUID ?? '').trim())
          .filter(Boolean);
        setCanceladosDetalle(canceladosDetalleDetectado);
        setUuidsCancelados(uuidsCanceladosDetectados);
      }

      let egresosDetectados: EgresoRelacionado[] = [];
      let egresosFilasTodasDetectadas: Record<string, unknown>[] = [];
      if (egresosFile) {
        const resultado = await parseEgresos(egresosFile);
        egresosDetectados = resultado.egresos;
        egresosFilasTodasDetectadas = resultado.filas_todas;
        setEgresosRelacionados(egresosDetectados);
        setEgresosFilasTodas(egresosFilasTodasDetectadas);
      }

      let retencionIva10Detectado: Record<string, unknown>[] = [];
      if (retencionIva10File) {
        const resultado = await parseRetencionIva10(retencionIva10File);
        retencionIva10Detectado = resultado.filas;
        setRetencionIva10Filas(retencionIva10Detectado);
      }

      let retencionIva4Detectado: Record<string, unknown>[] = [];
      if (retencionIva4File) {
        const resultado = await parseRetencionIva4(retencionIva4File);
        retencionIva4Detectado = resultado.filas;
        setRetencionIva4Filas(retencionIva4Detectado);
      }

      let retencionIsr10Detectado: Record<string, unknown>[] = [];
      if (retencionIsr10File) {
        const resultado = await parseRetencionIsr10(retencionIsr10File);
        retencionIsr10Detectado = resultado.filas;
        setRetencionIsr10Filas(retencionIsr10Detectado);
      }

      let retencionIsr125Detectado: Record<string, unknown>[] = [];
      if (retencionIsr125File) {
        const resultado = await parseRetencionIsr125(retencionIsr125File);
        retencionIsr125Detectado = resultado.filas;
        setRetencionIsr125Filas(retencionIsr125Detectado);
      }

      let ivaAcreditableDetectado: Record<string, unknown>[] = [];
      if (ivaAcreditableFile) {
        const resultado = await parseIvaAcreditable(ivaAcreditableFile);
        ivaAcreditableDetectado = resultado.filas;
        setIvaAcreditableFilas(ivaAcreditableDetectado);
      }

      const rows = await fetchUsdPreview({
        fecha_desde,
        fecha_hasta,
        uuids_cancelados: uuidsCanceladosDetectados,
        egresos: egresosDetectados,
      });
      if (rows.length === 0) {
        await handleExport(
          {},
          uuidsCanceladosDetectados,
          egresosDetectados,
          canceladosDetalleDetectado,
          retencionIva10Detectado,
          retencionIva4Detectado,
          retencionIsr10Detectado,
          retencionIsr125Detectado,
          ivaAcreditableDetectado,
          egresosFilasTodasDetectadas,
        );
      } else {
        setUsdRows(rows);
        // Precargar el tipo de cambio calculado (DEBE ÷ Total) de cada fila,
        // así se exporta ya corregido aunque el usuario no edite nada.
        const overridesIniciales = Object.fromEntries(
          rows
            .filter((r) => r.uuid && r.tipo_cambio != null)
            .map((r) => [r.uuid, r.tipo_cambio as number]),
        );
        setTipoCambioOverrides(overridesIniciales);
        setIsExportModalOpen(false);
        setIsReviewModalOpen(true);
      }
    } catch (e) {
      notifications.show({ title: 'Error', message: 'No se pudo revisar el tipo de cambio', color: 'red' });
    } finally {
      setIsLoadingUsdPreview(false);
    }
  };

  const pagos = data?.items || [];
  const totalItems = data?.total || 0;
  const totalPages = Math.ceil(totalItems / pageSize);

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <Group>
          <Title order={2}>Pagos</Title>
          <Badge variant="light" color="violet">{totalItems} registros</Badge>
        </Group>
        <Group gap="sm">
          <Button
            leftSection={<IconClipboardList size={16} />}
            variant="light"
            color="violet"
            loading={isExportingAuditoria}
            onClick={handleExportAuditoria}
          >
            Generar Reporte de Auditoría
          </Button>
          <FileInput
            placeholder="Excel de Amarre/Pre-DIOT corregido"
            description="Ábrelo y guárdalo con Excel real tras corregir Amarre, luego súbelo aquí"
            value={diotExcelFile}
            onChange={setDiotExcelFile}
            accept=".xlsx,.xls"
            w={230}
            size="sm"
          />
          <Button
            leftSection={<IconFileTypeTxt size={16} />}
            variant="light"
            color="violet"
            loading={isExportingDiotFromExcel}
            disabled={!diotExcelFile}
            onClick={handleExportDiotFromExcel}
          >
            Exportar DIOT (.txt)
          </Button>
          <Button
            leftSection={<IconFileExport size={16} />}
            color="violet"
            onClick={() => {
              setCanceladosFile(null);
              setUuidsCancelados([]);
              setEgresosFile(null);
              setEgresosRelacionados([]);
              setEgresosFilasTodas([]);
              setIsExportModalOpen(true);
            }}
          >
            Generar Excel
          </Button>
        </Group>
      </Group>

      {/* ── Filters ────────────────────────────────── */}
      <Card shadow="sm" padding="md" radius="md" withBorder>
          <Group align="flex-end">
            <TextInput
              id="pagos-search"
              placeholder="Buscar por factura..."
              label="Factura"
              leftSection={<IconSearch size={16} />}
              value={searchFactura}
              onChange={(e) => {
                setSearchFactura(e.currentTarget.value);
                setActivePage(1); // Reset page on search
              }}
              style={{ flex: 1 }}
            />
            <Select
              id="pagos-filter-mes"
              label="Mes"
              placeholder="Mes"
              clearable
              data={[
                { value: '1', label: 'Enero' },
                { value: '2', label: 'Febrero' },
                { value: '3', label: 'Marzo' },
                { value: '4', label: 'Abril' },
                { value: '5', label: 'Mayo' },
                { value: '6', label: 'Junio' },
                { value: '7', label: 'Julio' },
                { value: '8', label: 'Agosto' },
                { value: '9', label: 'Septiembre' },
                { value: '10', label: 'Octubre' },
                { value: '11', label: 'Noviembre' },
                { value: '12', label: 'Diciembre' },
              ]}
              value={filterMes}
              onChange={(val) => {
                setFilterMes(val);
                setActivePage(1);
              }}
              w={140}
            />
            <NumberInput
              label="Año"
              placeholder="2026"
              value={filterAnio}
              onChange={(val) => {
                setFilterAnio(val as number);
                setActivePage(1);
              }}
              w={100}
            />
            <Select
              id="pagos-filter-estado"
              label="Estado"
              placeholder="Todos los estados"
              clearable
              data={[
                { value: EstadoPago.ENCONTRADO, label: 'Encontrado' },
                { value: EstadoPago.NO_PAGADO, label: 'No Pagado' },
                {
                  value: EstadoPago.DUPLICADO,
                  label: 'Duplicado',
                },
              ]}
              value={filterEstado}
              onChange={(val) => {
                setFilterEstado(val);
                setActivePage(1); // Reset page on filter change
              }}
              w={200}
            />
            <Switch
              label="Solo pendientes de Amarre"
              description="Pagos sin UUID o cuyo UUID no existe en Ingresos"
              checked={filterSinAmarre}
              onChange={(e) => {
                setFilterSinAmarre(e.currentTarget.checked);
                setActivePage(1);
              }}
            />
          </Group>
      </Card>

      {/* ── Table ──────────────────────────────────── */}
      <Card shadow="sm" padding={0} radius="md" withBorder style={{ overflow: 'auto' }}>
        <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="md" style={{ minWidth: '100%' }}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Factura</Table.Th>
              <Table.Th>Tipo</Table.Th>
              <Table.Th>Fecha</Table.Th>
              {/* Columnas dinámicas de datos_extra */}
              {pagos.length > 0 && pagos[0].datos_extra && Object.keys(pagos[0].datos_extra)
                .filter(k => !['is_duplicated'].includes(k))
                .map(key => (
                <Table.Th key={key} style={{ whiteSpace: 'nowrap' }}>
                  <Text size="xs" fw={600}>Col {key}</Text>
                </Table.Th>
              ))}
              <Table.Th>UUID</Table.Th>
              <Table.Th>Estado</Table.Th>
              <Table.Th>Observaciones</Table.Th>
              <Table.Th>Acciones</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading ? (
              <Table.Tr>
                <Table.Td colSpan={20}>
                  <Text ta="center" c="dimmed" py="lg">
                    Cargando registros...
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : pagos.map((pago) => {
              const badge = ESTADO_PAGO_CONFIG[pago.estado];
              const extraKeys = pago.datos_extra 
                ? Object.keys(pago.datos_extra).filter(k => !['is_duplicated'].includes(k))
                : [];
              const uuidNoVerificado = pago.estado === EstadoPago.ENCONTRADO && !pago.uuid_verificado;
              return (
                <Table.Tr key={pago.id} bg={pago.estado === EstadoPago.DUPLICADO || uuidNoVerificado ? 'orange.0' : undefined}>
                  <Table.Td>{pago.id}</Table.Td>
                  <Table.Td fw={600}>{pago.factura}</Table.Td>
                  <Table.Td>{pago.tipo_movimiento}</Table.Td>
                  <Table.Td>{pago.fecha ?? '—'}</Table.Td>
                  {/* Datos extra dinámicos */}
                  {extraKeys.map(key => (
                    <Table.Td key={key}>
                      <Text size="xs" truncate="end" maw={150}>
                        {String(pago.datos_extra?.[key] ?? '—')}
                      </Text>
                    </Table.Td>
                  ))}
                  <Table.Td>
                    <Text size="xs" ff="monospace" truncate="end" maw={220}>
                      {pago.uuid || 'NO SE PAGO'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {uuidNoVerificado ? (
                      <Badge color="orange" variant="filled" size="sm">
                        UUID no verificado
                      </Badge>
                    ) : (
                      <Badge
                        color={badge?.color || 'gray'}
                        variant={pago.estado === EstadoPago.NO_PAGADO ? 'filled' : 'light'}
                        size="sm"
                      >
                        {badge?.label || pago.estado}
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed" truncate="end" maw={200}>
                      {pago.observaciones ?? '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <PagoRowActions pago={pago} />
                  </Table.Td>
                </Table.Tr>
              );
            })}
            {!isLoading && pagos.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={20}>
                  <Text ta="center" c="dimmed" py="lg">
                    No se encontraron pagos con los filtros aplicados.
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Card>

      {/* ── Pagination ────────────────────────────── */}
      {totalPages > 1 && (
        <Group justify="center" mt="sm">
          <Pagination value={activePage} onChange={setActivePage} total={totalPages} />
        </Group>
      )}
      {/* ── Export Modal ────────────────────────────── */}
      <Modal
        opened={isExportModalOpen}
        onClose={() => !isExporting && setIsExportModalOpen(false)}
        title={<Text fw={600}>Generar Reporte Excel</Text>}
      >
        <Stack>
          <Text size="sm" c="dimmed">
            El archivo se generará con los registros correspondientes al mes y filtros seleccionados.
          </Text>
          <TextInput
            label="Nombre del archivo"
            description="No es necesario incluir .xlsx"
            value={exportFilename}
            onChange={(e) => setExportFilename(e.currentTarget.value)}
          />
          <FileInput
            label="Archivo de UUID cancelados (opcional)"
            description="Las facturas cuyo UUID aparezca aquí se excluyen del Amarre y se listan en Diferencias"
            placeholder="Seleccionar archivo .xlsx"
            accept=".xlsx,.xls"
            value={canceladosFile}
            onChange={setCanceladosFile}
            clearable
          />
          <FileInput
            label="Archivo de Egresos (opcional)"
            description="Se restan sus montos a la factura relacionada en el Amarre y se listan en Diferencias"
            placeholder="Seleccionar archivo .xlsx"
            accept=".xlsx,.xls"
            value={egresosFile}
            onChange={setEgresosFile}
            clearable
          />
          <FileInput
            label="Archivo de Retenciones IVA RET 10% (opcional)"
            description="Auxiliar contable (Fecha/Número/Concepto/Débito/Crédito) — se concilia contra el IVA RET 10% de Amarre y se agrega al mismo Excel"
            placeholder="Seleccionar archivo .xlsx"
            accept=".xlsx,.xls"
            value={retencionIva10File}
            onChange={setRetencionIva10File}
            clearable
          />
          <FileInput
            label="Archivo de Retenciones IVA RET 4% (opcional)"
            description="Mismo formato que el anterior — se concilia contra el IVA RET 4% de Amarre y se agrega al mismo Excel"
            placeholder="Seleccionar archivo .xlsx"
            accept=".xlsx,.xls"
            value={retencionIva4File}
            onChange={setRetencionIva4File}
            clearable
          />
          <FileInput
            label="Archivo de Retenciones ISR RET 10% (opcional)"
            description="Mismo formato que el anterior — se concilia contra el ISR RET 10% de Amarre y se agrega al mismo Excel"
            placeholder="Seleccionar archivo .xlsx"
            accept=".xlsx,.xls"
            value={retencionIsr10File}
            onChange={setRetencionIsr10File}
            clearable
          />
          <FileInput
            label="Archivo de Retenciones ISR RET 1.25% (opcional)"
            description="Mismo formato que el anterior — se concilia contra el ISR RET 1.25% de Amarre y se agrega al mismo Excel"
            placeholder="Seleccionar archivo .xlsx"
            accept=".xlsx,.xls"
            value={retencionIsr125File}
            onChange={setRetencionIsr125File}
            clearable
          />
          <FileInput
            label="Archivo de IVA Acreditable (opcional)"
            description="Auxiliar contable (Fecha/Concepto/Débito) — se compara por proveedor contra el Traslado IVA MXN de Amarre y se agrega al mismo Excel"
            placeholder="Seleccionar archivo .xlsx"
            accept=".xlsx,.xls"
            value={ivaAcreditableFile}
            onChange={setIvaAcreditableFile}
            clearable
          />
          <Group justify="flex-end" mt="md">
            <Button
              variant="default"
              onClick={() => setIsExportModalOpen(false)}
              disabled={isExporting || isLoadingUsdPreview}
            >
              Cancelar
            </Button>
            <Button color="violet" onClick={handleDescargarClick} loading={isLoadingUsdPreview}>
              Descargar
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* ── Revisión de tipo de cambio (USD) ────────── */}
      <Modal
        opened={isReviewModalOpen}
        onClose={() => !isExporting && setIsReviewModalOpen(false)}
        title={<Text fw={600}>Revisar tipo de cambio (USD)</Text>}
        size="xl"
      >
        <Stack>
          <Text size="sm" c="dimmed">
            Estas facturas están en USD. El tipo de cambio ya se calculó como DEBE ÷ Total (el que
            realmente se usó al pagar); ajústalo solo si alguna fila lo requiere.
          </Text>
          <Table striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Emisor</Table.Th>
                <Table.Th>Factura</Table.Th>
                <Table.Th>Fecha expedición</Table.Th>
                <Table.Th>Total (USD)</Table.Th>
                <Table.Th>Total MXN actual</Table.Th>
                <Table.Th>Tipo de cambio</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {usdRows.map((row, idx) => (
                <Table.Tr key={row.uuid || `${row.factura}-${idx}`}>
                  <Table.Td>{row.emisor}</Table.Td>
                  <Table.Td>{row.factura}</Table.Td>
                  <Table.Td>{row.fecha_expedicion}</Table.Td>
                  <Table.Td>{row.total ?? '—'}</Table.Td>
                  <Table.Td>{row.total_mxn ?? '—'}</Table.Td>
                  <Table.Td>
                    <NumberInput
                      w={140}
                      value={tipoCambioOverrides[row.uuid] ?? row.tipo_cambio ?? undefined}
                      disabled={!row.uuid}
                      onChange={(value) =>
                        setTipoCambioOverrides((prev) => ({
                          ...prev,
                          [row.uuid]: typeof value === 'number' ? value : Number(value),
                        }))
                      }
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setIsReviewModalOpen(false)} disabled={isExporting}>
              Cancelar
            </Button>
            <Button color="violet" onClick={() => handleExport(tipoCambioOverrides)} loading={isExporting}>
              Descargar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

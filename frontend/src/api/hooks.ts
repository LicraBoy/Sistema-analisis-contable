/**
 * React Query hooks for API calls.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from './client';
import type {
  Pago,
  PagoFilter,
  PagoListResponse,
  PagoUpdate,
  ProcesamientoStatus,
  UploadResponse,
  UsdPreviewRow,
  EgresoRelacionado,
  CanceladoDetalle,
} from '../types';

// ── Pagos ──────────────────────────────────────────────

export function usePagos(filters: PagoFilter = {}) {
  return useQuery({
    queryKey: ['pagos', filters],
    queryFn: async (): Promise<PagoListResponse> => {
      const params = new URLSearchParams();
      if (filters.estado) params.set('estado', filters.estado);
      if (filters.fecha_desde) params.set('fecha_desde', filters.fecha_desde);
      if (filters.fecha_hasta) params.set('fecha_hasta', filters.fecha_hasta);
      if (filters.factura) params.set('factura', filters.factura);
      if (filters.sin_amarre) params.set('sin_amarre', 'true');
      if (filters.page) params.set('page', String(filters.page));
      if (filters.page_size) params.set('page_size', String(filters.page_size));

      const response = await apiClient.get<PagoListResponse>(`/pagos?${params}`);
      return response.data;
    },
  });
}

export function useProcesamientoStatus(archivoId: number | null) {
  return useQuery({
    queryKey: ['procesamiento-status', archivoId],
    queryFn: async (): Promise<ProcesamientoStatus> => {
      const response = await apiClient.get<ProcesamientoStatus>(
        `/pagos/${archivoId}/status`,
      );
      return response.data;
    },
    enabled: archivoId !== null,
    refetchInterval: 3000, // Poll every 3s while processing
  });
}

// ── File Upload ────────────────────────────────────────

export function useUploadIngresos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<UploadResponse> => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await apiClient.post<UploadResponse>(
        '/ingresos/upload',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingresos-list'] });
      queryClient.invalidateQueries({ queryKey: ['conciliacion'] });
    },
  });
}

export function useUploadPagos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      file: File;
      segundaBusqueda?: boolean;
    }): Promise<{ message: string; total: number }> => {
      const formData = new FormData();
      formData.append('file', params.file);
      if (params.segundaBusqueda !== undefined) {
        formData.append('segunda_busqueda', params.segundaBusqueda.toString());
      }

      const response = await apiClient.post<{ message: string; total: number }>(
        '/pagos/upload',
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
        },
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pagos'] });
      queryClient.invalidateQueries({ queryKey: ['conciliacion'] });
    },
  });
}

export function useUpdatePago() {
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: PagoUpdate }): Promise<Pago> => {
      const response = await apiClient.patch<Pago>(`/pagos/${id}`, data);
      return response.data;
    },
  });
}

export function useDeletePago() {
  return useMutation({
    mutationFn: async ({ id, motivo }: { id: number; motivo: string }): Promise<void> => {
      await apiClient.delete(`/pagos/${id}`, { params: { motivo } });
    },
  });
}

export async function exportPagos(
  filters: PagoFilter & {
    filename?: string;
    tipo_cambio_overrides?: Record<string, number>;
    uuids_cancelados?: string[];
    egresos?: EgresoRelacionado[];
    egresos_filas_todas?: Record<string, unknown>[];
    cancelados_detalle?: CanceladoDetalle[];
    retencion_iva10_archivo?: Record<string, unknown>[];
    retencion_iva4_archivo?: Record<string, unknown>[];
    retencion_isr10_archivo?: Record<string, unknown>[];
    retencion_isr125_archivo?: Record<string, unknown>[];
    iva_acreditable_archivo?: Record<string, unknown>[];
  },
) {
  const response = await apiClient.post<Blob>(
    '/pagos/export',
    {
      estado: filters.estado,
      fecha_desde: filters.fecha_desde,
      fecha_hasta: filters.fecha_hasta,
      factura: filters.factura,
      filename: filters.filename,
      tipo_cambio_overrides: filters.tipo_cambio_overrides ?? {},
      uuids_cancelados: filters.uuids_cancelados ?? [],
      egresos: filters.egresos ?? [],
      egresos_filas_todas: filters.egresos_filas_todas ?? [],
      cancelados_detalle: filters.cancelados_detalle ?? [],
      retencion_iva10_archivo: filters.retencion_iva10_archivo ?? [],
      retencion_iva4_archivo: filters.retencion_iva4_archivo ?? [],
      retencion_isr10_archivo: filters.retencion_isr10_archivo ?? [],
      retencion_isr125_archivo: filters.retencion_isr125_archivo ?? [],
      iva_acreditable_archivo: filters.iva_acreditable_archivo ?? [],
    },
    { responseType: 'blob' },
  );
  return response.data;
}

export async function exportAuditoria(filters: { fecha_desde?: string; fecha_hasta?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.fecha_desde) params.set('fecha_desde', filters.fecha_desde);
  if (filters.fecha_hasta) params.set('fecha_hasta', filters.fecha_hasta);

  const response = await apiClient.get<Blob>(`/pagos/auditoria/export?${params}`, {
    responseType: 'blob',
  });
  return response.data;
}

export async function fetchUsdPreview(filters: {
  fecha_desde?: string;
  fecha_hasta?: string;
  uuids_cancelados?: string[];
  egresos?: EgresoRelacionado[];
}): Promise<UsdPreviewRow[]> {
  const response = await apiClient.post<UsdPreviewRow[]>('/pagos/export/usd-preview', {
    fecha_desde: filters.fecha_desde,
    fecha_hasta: filters.fecha_hasta,
    uuids_cancelados: filters.uuids_cancelados ?? [],
    egresos: filters.egresos ?? [],
  });
  return response.data;
}

export async function exportDiotFromExcel(file: File): Promise<Blob> {
  const formData = new FormData();
  formData.append('archivo', file);
  const response = await apiClient.post<Blob>('/pagos/diot/export-from-excel', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    responseType: 'blob',
  });
  return response.data;
}

export async function parseEgresos(
  file: File,
): Promise<{ egresos: EgresoRelacionado[]; total: number; filas_todas: Record<string, unknown>[] }> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post<{ egresos: EgresoRelacionado[]; total: number; filas_todas: Record<string, unknown>[] }>(
    '/pagos/egresos/parse',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return response.data;
}

export async function parseCancelados(
  file: File,
): Promise<{ cancelados: CanceladoDetalle[]; total: number }> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post<{ cancelados: CanceladoDetalle[]; total: number }>(
    '/pagos/cancelados/parse',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return response.data;
}

export function useReporte601() {
  return useMutation({
    mutationFn: async (file: File): Promise<Blob> => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await apiClient.post<Blob>('/ingresos/reporte-601', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        responseType: 'blob',
      });
      return response.data;
    },
  });
}

// ── Facturacion ───────────────────────────────────────────────

export interface EdicionFacturacion {
  clave: string;
  cambios: Record<string, string | number>;
}

export function useGenerarFacturacion() {
  return useMutation({
    mutationFn: async (params: {
      formasPago: File;
      recibosEmitidos: File;
      movimientosPeriodo?: File;
      ediciones?: EdicionFacturacion[];
    }): Promise<Blob> => {
      const formData = new FormData();
      formData.append('formas_pago', params.formasPago);
      formData.append('recibos_emitidos', params.recibosEmitidos);
      if (params.movimientosPeriodo) {
        formData.append('movimientos_periodo', params.movimientosPeriodo);
      }
      if (params.ediciones && params.ediciones.length > 0) {
        formData.append('ediciones', JSON.stringify(params.ediciones));
      }
      const response = await apiClient.post<Blob>('/facturacion/generar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        responseType: 'blob',
      });
      return response.data;
    },
  });
}

export interface DuplicadoFacturacion {
  [columna: string]: string | number | null;
}

export interface DuplicadosPreviewResponse {
  duplicadosCombinados: DuplicadoFacturacion[];
  totalCombinados: number;
  duplicadosSegundaLimpieza: DuplicadoFacturacion[];
  totalSegundaLimpieza: number;
}

export function useDuplicadosPreview() {
  return useMutation({
    mutationFn: async (params: {
      formasPago: File;
      recibosEmitidos: File;
      movimientosPeriodo?: File;
    }): Promise<DuplicadosPreviewResponse> => {
      const formData = new FormData();
      formData.append('formas_pago', params.formasPago);
      formData.append('recibos_emitidos', params.recibosEmitidos);
      if (params.movimientosPeriodo) {
        formData.append('movimientos_periodo', params.movimientosPeriodo);
      }
      const response = await apiClient.post('/facturacion/duplicados-preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return {
        duplicadosCombinados: response.data.duplicados_combinados,
        totalCombinados: response.data.total_combinados,
        duplicadosSegundaLimpieza: response.data.duplicados_segunda_limpieza,
        totalSegundaLimpieza: response.data.total_segunda_limpieza,
      };
    },
  });
}

export function useAgregarPuePpd() {
  return useMutation({
    mutationFn: async (file: File): Promise<Blob> => {
      const formData = new FormData();
      formData.append('archivo', file);
      const response = await apiClient.post<Blob>('/facturacion/agregar-pue-ppd', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        responseType: 'blob',
      });
      return response.data;
    },
  });
}

export interface FilaFacturacionTablaFormaPago {
  id: number;
  periodo: string;
  tabla_origen: string;
  categoria_pue_ppd: 'PUE' | 'PPD' | null;
  revision: string | null;
  fecha_texto: string | null;
  pos: string | null;
  forma_de_pago: string | null;
  cuenta: string | null;
  subtotal: number;
  descuento: number;
  gravado: number;
  ingtasa_0: number;
  desc_tasa_0: number;
  subtasa_0: number;
  iva: number;
  propina: number;
  pago_proveedor: number;
  total: number;
  fila_excel: number | null;
  creado_en: string | null;
}

export type GuardarTablasFormaPagoResponse =
  | { periodo: string; total: number; por_tabla: Record<string, number> }
  | { requiere_confirmacion: true; filas_existentes: number };

export function useGuardarTablasFormaPago() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      file: File;
      periodo: string;
      confirmarReemplazo?: boolean;
    }): Promise<GuardarTablasFormaPagoResponse> => {
      const formData = new FormData();
      formData.append('archivo', params.file);
      formData.append('periodo', params.periodo);
      formData.append('confirmar_reemplazo', String(params.confirmarReemplazo ?? false));
      const response = await apiClient.post<GuardarTablasFormaPagoResponse>(
        '/facturacion/tablas-forma-pago/guardar',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return response.data;
    },
    onSuccess: (data, variables) => {
      if (!('requiere_confirmacion' in data)) {
        queryClient.invalidateQueries({ queryKey: ['facturacion-tablas-periodos'] });
        queryClient.invalidateQueries({ queryKey: ['facturacion-tablas-guardadas', variables.periodo] });
        queryClient.invalidateQueries({ queryKey: ['facturacion-tablas-busqueda'] });
        queryClient.invalidateQueries({ queryKey: ['facturacion-tablas-analitica'] });
        queryClient.invalidateQueries({ queryKey: ['facturacion-ventas-pos'] });
      }
    },
  });
}

export interface PeriodoFacturacionResumen {
  periodo: string;
  total: number;
}

export function useListarPeriodosTablasFormaPago() {
  return useQuery({
    queryKey: ['facturacion-tablas-periodos'],
    queryFn: async (): Promise<PeriodoFacturacionResumen[]> => {
      const response = await apiClient.get<{ periodos: PeriodoFacturacionResumen[] }>(
        '/facturacion/tablas-forma-pago/periodos',
      );
      return response.data.periodos;
    },
  });
}

export function useObtenerTablasFormaPagoGuardadas(periodo: string | null) {
  return useQuery({
    queryKey: ['facturacion-tablas-guardadas', periodo],
    queryFn: async (): Promise<{ total: number; filas: FilaFacturacionTablaFormaPago[] }> => {
      const response = await apiClient.get<{ total: number; filas: FilaFacturacionTablaFormaPago[] }>(
        '/facturacion/tablas-forma-pago',
        { params: { periodo } },
      );
      return response.data;
    },
    enabled: !!periodo,
  });
}

export function useBuscarTablasFormaPago(params: { q: string; mes?: string }) {
  return useQuery({
    queryKey: ['facturacion-tablas-busqueda', params.q, params.mes],
    queryFn: async (): Promise<{ total: number; filas: FilaFacturacionTablaFormaPago[] }> => {
      const response = await apiClient.get<{ total: number; filas: FilaFacturacionTablaFormaPago[] }>(
        '/facturacion/tablas-forma-pago',
        { params: { q: params.q, mes: params.mes || undefined } },
      );
      return response.data;
    },
    enabled: !!params.q,
  });
}

export function useEliminarPeriodoTablasFormaPago() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { periodo: string }): Promise<{ periodo: string; eliminados: number }> => {
      const response = await apiClient.delete<{ periodo: string; eliminados: number }>(
        '/facturacion/tablas-forma-pago',
        { params: { periodo: params.periodo } },
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facturacion-tablas-periodos'] });
      queryClient.invalidateQueries({ queryKey: ['facturacion-tablas-guardadas'] });
      queryClient.invalidateQueries({ queryKey: ['facturacion-tablas-busqueda'] });
      queryClient.invalidateQueries({ queryKey: ['facturacion-tablas-analitica'] });
      queryClient.invalidateQueries({ queryKey: ['facturacion-ventas-pos'] });
    },
  });
}

export type TipoAdjuntoFactura = 'xml' | 'pdf';

// Facturas sueltas registradas para un día (sin amarrarlas a ninguna cuenta
// de las 7 tablas) — solo como constancia de que ese día se facturó algo.
export interface FacturaAdjuntaDia {
  id: number;
  periodo: string;
  xml_nombre_original: string | null;
  xml_tamano_bytes: number | null;
  pdf_nombre_original: string | null;
  pdf_tamano_bytes: number | null;
  creado_en: string | null;
}

export function useListarFacturasDia(periodo: string | null) {
  return useQuery({
    queryKey: ['facturacion-facturas-dia', periodo],
    queryFn: async (): Promise<{ total: number; facturas: FacturaAdjuntaDia[] }> => {
      const response = await apiClient.get<{ total: number; facturas: FacturaAdjuntaDia[] }>(
        '/facturacion/tablas-forma-pago/facturas-dia',
        { params: { periodo } },
      );
      return response.data;
    },
    enabled: !!periodo,
  });
}

export function useSubirFacturaDia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      periodo: string;
      xml?: File;
      pdf?: File;
    }): Promise<FacturaAdjuntaDia> => {
      const formData = new FormData();
      formData.append('periodo', params.periodo);
      if (params.xml) formData.append('xml', params.xml);
      if (params.pdf) formData.append('pdf', params.pdf);
      const response = await apiClient.post<FacturaAdjuntaDia>(
        '/facturacion/tablas-forma-pago/facturas-dia',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['facturacion-facturas-dia', data.periodo] });
    },
  });
}

export function useDescargarFacturaDia() {
  return useMutation({
    mutationFn: async (params: { id: number; tipo: TipoAdjuntoFactura }): Promise<Blob> => {
      const response = await apiClient.get<Blob>(
        `/facturacion/tablas-forma-pago/facturas-dia/${params.id}/${params.tipo}`,
        { responseType: 'blob' },
      );
      return response.data;
    },
  });
}

export function useEliminarFacturaDia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: number; periodo: string }): Promise<{ id: number; eliminado: boolean }> => {
      const response = await apiClient.delete<{ id: number; eliminado: boolean }>(
        `/facturacion/tablas-forma-pago/facturas-dia/${params.id}`,
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['facturacion-facturas-dia', variables.periodo] });
    },
  });
}

export interface SerieDiariaFacturacionAnalitica {
  periodo: string;
  total: number;
  subtotal: number;
  iva: number;
  propina: number;
  efectivo: number;
  visa_mastercard: number;
  american_express: number;
  funcionarios_y_empleados: number;
  huesped: number;
  tusosa: number;
  cortesia: number;
  pue: number;
  ppd: number;
  efectivo_cuentas: number;
  visa_mastercard_cuentas: number;
  american_express_cuentas: number;
  funcionarios_y_empleados_cuentas: number;
  huesped_cuentas: number;
  tusosa_cuentas: number;
  cortesia_cuentas: number;
}

export interface KpisFacturacionAnalitica {
  dias_registrados: number;
  total_historico: number;
  total_mes_actual: number;
  promedio_diario: number;
  iva_total_historico: number;
}

export function useAnaliticaTablasFormaPago() {
  return useQuery({
    queryKey: ['facturacion-tablas-analitica'],
    queryFn: async (): Promise<{
      serie_diaria: SerieDiariaFacturacionAnalitica[];
      kpis: KpisFacturacionAnalitica;
    }> => {
      const response = await apiClient.get<{
        serie_diaria: SerieDiariaFacturacionAnalitica[];
        kpis: KpisFacturacionAnalitica;
      }>('/facturacion/tablas-forma-pago/analitica');
      return response.data;
    },
  });
}

export interface PuntoVentaFacturacionAnalitica {
  clave: string;
  etiqueta: string;
  monto: number;
  metrica: 'ingreso_real' | 'total';
}

export function useVentasPorPosFacturacion(mes: string | null) {
  return useQuery({
    queryKey: ['facturacion-ventas-pos', mes],
    queryFn: async (): Promise<{ mes: string; puntos_venta: PuntoVentaFacturacionAnalitica[] }> => {
      const response = await apiClient.get<{ mes: string; puntos_venta: PuntoVentaFacturacionAnalitica[] }>(
        '/facturacion/tablas-forma-pago/ventas-por-pos',
        { params: { mes } },
      );
      return response.data;
    },
    enabled: !!mes,
  });
}

export function useExportarTablasFormaPago() {
  return useMutation({
    mutationFn: async (params: { periodo?: string; mes?: string }): Promise<Blob> => {
      const response = await apiClient.get<Blob>('/facturacion/tablas-forma-pago/export', {
        params: params.periodo ? { periodo: params.periodo } : { mes: params.mes },
        responseType: 'blob',
      });
      return response.data;
    },
  });
}

export function useExportarCategoriaTablaFormaPago() {
  return useMutation({
    mutationFn: async (params: { mes: string; tablaOrigen: string }): Promise<Blob> => {
      const response = await apiClient.get<Blob>('/facturacion/tablas-forma-pago/export-categoria', {
        params: { mes: params.mes, tabla_origen: params.tablaOrigen },
        responseType: 'blob',
      });
      return response.data;
    },
  });
}

// ── Balanza contable (comparación futura contra Ventas por punto de venta) ──

export interface CuentaBalanza {
  id: number;
  codigo_cuenta: string;
  descripcion: string;
  saldo_anterior: number;
  debitos_mes: number;
  creditos_mes: number;
  saldo_mes: number;
  saldo_actual: number;
  actualizado_en: string | null;
}

export function useGuardarBalanza() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<{ total: number }> => {
      const formData = new FormData();
      formData.append('archivo', file);
      const response = await apiClient.post<{ total: number }>(
        '/facturacion/balanza/guardar',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facturacion-balanza'] });
      queryClient.invalidateQueries({ queryKey: ['facturacion-balanza-detalle-punto-venta'] });
    },
  });
}

export function useObtenerBalanza() {
  return useQuery({
    queryKey: ['facturacion-balanza'],
    queryFn: async (): Promise<{ total: number; actualizado_en: string | null; cuentas: CuentaBalanza[] }> => {
      const response = await apiClient.get<{ total: number; actualizado_en: string | null; cuentas: CuentaBalanza[] }>(
        '/facturacion/balanza',
      );
      return response.data;
    },
  });
}

export interface CuentaDetalleBalanzaPuntoVenta {
  codigo_cuenta: string;
  etiqueta: string;
  saldo_mes: number | null;
  encontrada: boolean;
}

export interface GrupoDetalleBalanzaPuntoVenta {
  grupo: string;
  cuentas: CuentaDetalleBalanzaPuntoVenta[];
  subtotal: number;
}

export type DetalleBalanzaPuntoVenta =
  | { disponible: false }
  | { disponible: true; punto_venta: string; grupos: GrupoDetalleBalanzaPuntoVenta[]; total: number };

export function useDetalleBalanzaPuntoVenta(puntoVenta: string) {
  return useQuery({
    queryKey: ['facturacion-balanza-detalle-punto-venta', puntoVenta],
    queryFn: async (): Promise<DetalleBalanzaPuntoVenta> => {
      const response = await apiClient.get<DetalleBalanzaPuntoVenta>('/facturacion/balanza/detalle-punto-venta', {
        params: { punto_venta: puntoVenta },
      });
      return response.data;
    },
  });
}

// ── Pagos de Recepción (gastos de huésped durante su estancia) ──────

export interface FilaPagosRecepcion {
  [columna: string]: string | number | null;
}

export interface BloquePagosRecepcion {
  consecutivo: number;
  filas: FilaPagosRecepcion[];
}

export interface FilaTabla1PagosRecepcion {
  consecutivo: number;
  subtotal1: number;
  iva16: number;
  ish3: number;
  subtotal2: number;
  gravado: number;
  tasa0: number;
  propina: number;
  total: number;
}

export interface FilaTabla2PagosRecepcion {
  cuenta: number;
  habitacion: string | number | null;
  huesped: string | number | null;
  fecha_emision: string | number | null;
  efectivo: number;
  amex: number;
  visa: number;
  mcard: number;
  credito: number;
  totales: number;
  subtotal1: number;
  iva16: number;
  ish3: number;
  subtotal2: number;
  gravado: number;
  tasa0: number;
  propina: number;
  total: number;
}

export interface UploadPagosRecepcionResponse {
  filename: string;
  total_filas: number;
  total_bloques: number;
  columnas: string[];
  bloques: BloquePagosRecepcion[];
  tabla1: FilaTabla1PagosRecepcion[];
  tabla2: FilaTabla2PagosRecepcion[];
}

export function useUploadPagosRecepcion() {
  return useMutation({
    mutationFn: async (file: File): Promise<UploadPagosRecepcionResponse> => {
      const formData = new FormData();
      formData.append('archivo', file);
      const response = await apiClient.post<UploadPagosRecepcionResponse>(
        '/pagos-recepcion/upload',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return response.data;
    },
  });
}

// ── Archivo de Movimiento (conciliación de forma de pago) ───────────

export interface FilaMovimientoPagosRecepcion {
  [columna: string]: string | number | null;
}

export interface UploadMovimientoPagosRecepcionResponse {
  filename: string;
  total: number;
  columnas: string[];
  filas: FilaMovimientoPagosRecepcion[];
}

export function useUploadMovimientoPagosRecepcion() {
  return useMutation({
    mutationFn: async (file: File): Promise<UploadMovimientoPagosRecepcionResponse> => {
      const formData = new FormData();
      formData.append('archivo', file);
      const response = await apiClient.post<UploadMovimientoPagosRecepcionResponse>(
        '/pagos-recepcion/movimiento/upload',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return response.data;
    },
  });
}

export interface FilaAmexPeriodo {
  folio: string;
  fecha: string;
  huesped: string;
  monto: number;
}

export interface UploadMovimientosPeriodoPagosRecepcionResponse {
  filename: string;
  total: number;
  filas_amex: FilaAmexPeriodo[];
}

export function useUploadMovimientosPeriodoPagosRecepcion() {
  return useMutation({
    mutationFn: async (file: File): Promise<UploadMovimientosPeriodoPagosRecepcionResponse> => {
      const formData = new FormData();
      formData.append('archivo', file);
      const response = await apiClient.post<UploadMovimientosPeriodoPagosRecepcionResponse>(
        '/pagos-recepcion/movimientos-periodo/upload',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return response.data;
    },
  });
}

export interface NoConciliadoPagosRecepcion {
  forma_pago: string;
  habitacion: string;
  huesped: string;
  monto: number;
}

export interface ConciliarFormaPagoResponse {
  tabla2: FilaTabla2PagosRecepcion[];
  no_conciliados: NoConciliadoPagosRecepcion[];
  amex_sin_match: FilaAmexPeriodo[];
  credito_reclasificado_a_amex: number;
  suma_tabla1: number;
  suma_tabla2: number;
  diferencia: number;
}

export function useConciliarFormaPago() {
  return useMutation({
    mutationFn: async (params: {
      tabla1: FilaTabla1PagosRecepcion[];
      tabla2: FilaTabla2PagosRecepcion[];
      movimientoFilas: FilaMovimientoPagosRecepcion[];
      filasAmexPeriodo?: FilaAmexPeriodo[];
    }): Promise<ConciliarFormaPagoResponse> => {
      const response = await apiClient.post<ConciliarFormaPagoResponse>('/pagos-recepcion/conciliar-forma-pago', {
        tabla1: params.tabla1,
        tabla2: params.tabla2,
        movimiento_filas: params.movimientoFilas,
        filas_amex_periodo: params.filasAmexPeriodo ?? [],
      });
      return response.data;
    },
  });
}

// ── Pagos del Mes (snapshot diario persistido de cuentas conciliadas) ──

export interface FilaPagosDelMes {
  id: number;
  fecha: string;
  cuenta: number;
  habitacion: string | null;
  huesped: string | null;
  efectivo: number;
  amex: number;
  visa: number;
  mcard: number;
  credito: number;
  totales: number;
  subtotal1: number;
  iva16: number;
  ish3: number;
  subtotal2: number;
  gravado: number;
  tasa0: number;
  propina: number;
  total: number;
  es_manual?: boolean;
  es_sin_cuenta?: boolean;
}

export type GuardarPagosDelMesResponse =
  | { fecha: string; total: number; filas: FilaPagosDelMes[] }
  | { requiere_confirmacion: true; cuentas_existentes: number };

export function useGuardarPagosDelMes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      fecha: string;
      tabla2: FilaTabla2PagosRecepcion[];
      noConciliados?: NoConciliadoPagosRecepcion[];
      confirmarReemplazo?: boolean;
    }): Promise<GuardarPagosDelMesResponse> => {
      const response = await apiClient.post<GuardarPagosDelMesResponse>(
        '/pagos-recepcion/pagos-del-mes',
        {
          fecha: params.fecha,
          tabla2: params.tabla2,
          no_conciliados: params.noConciliados ?? [],
          confirmar_reemplazo: params.confirmarReemplazo ?? false,
        },
      );
      return response.data;
    },
    onSuccess: (data) => {
      if (!('requiere_confirmacion' in data)) {
        queryClient.invalidateQueries({ queryKey: ['pagos-del-mes'] });
        queryClient.invalidateQueries({ queryKey: ['pagos-del-mes-dias'] });
        queryClient.invalidateQueries({ queryKey: ['pagos-recepcion-analitica'] });
      }
    },
  });
}

export function useObtenerPagosDelMes() {
  return useQuery({
    queryKey: ['pagos-del-mes'],
    queryFn: async (): Promise<{ total: number; filas: FilaPagosDelMes[] }> => {
      const response = await apiClient.get<{ total: number; filas: FilaPagosDelMes[] }>(
        '/pagos-recepcion/pagos-del-mes',
      );
      return response.data;
    },
  });
}

export interface DiaPagosDelMes {
  fecha: string;
  total: number;
}

export function useDiasPagosDelMes() {
  return useQuery({
    queryKey: ['pagos-del-mes-dias'],
    queryFn: async (): Promise<DiaPagosDelMes[]> => {
      const response = await apiClient.get<{ dias: DiaPagosDelMes[] }>(
        '/pagos-recepcion/pagos-del-mes/dias',
      );
      return response.data.dias;
    },
  });
}

export function useEliminarDiaPagosDelMes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { fecha: string }): Promise<{ fecha: string; eliminados: number }> => {
      const response = await apiClient.delete<{ fecha: string; eliminados: number }>(
        '/pagos-recepcion/pagos-del-mes',
        { params: { fecha: params.fecha } },
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pagos-del-mes'] });
      queryClient.invalidateQueries({ queryKey: ['pagos-del-mes-dias'] });
      queryClient.invalidateQueries({ queryKey: ['pagos-recepcion-analitica'] });
    },
  });
}

export interface SerieDiariaPagosRecepcion {
  fecha: string;
  efectivo: number;
  amex: number;
  visa: number;
  mcard: number;
  credito: number;
  totales: number;
  iva16: number;
  ish3: number;
  propina: number;
  total: number;
}

export interface KpisPagosRecepcion {
  dias_registrados: number;
  total_historico: number;
  total_mes_actual: number;
  promedio_diario: number;
  propina_total: number;
  propina_promedio_diaria: number;
  distribucion_forma_pago: {
    efectivo: number;
    amex: number;
    visa: number;
    mcard: number;
    credito: number;
  };
}

export interface CuentaPendientePagosRecepcion {
  cuenta: number;
  habitacion: string | null;
  huesped: string | null;
  fecha: string;
  totales: number;
  total: number;
  pendiente: number;
}

export interface AnaliticaPagosRecepcionResponse {
  serie_diaria: SerieDiariaPagosRecepcion[];
  kpis: KpisPagosRecepcion;
  cuentas_pendientes: CuentaPendientePagosRecepcion[];
}

export function useAnaliticaPagosRecepcion() {
  return useQuery({
    queryKey: ['pagos-recepcion-analitica'],
    queryFn: async (): Promise<AnaliticaPagosRecepcionResponse> => {
      const response = await apiClient.get<AnaliticaPagosRecepcionResponse>('/pagos-recepcion/analitica');
      return response.data;
    },
  });
}

export function useExportarPagosDelMes() {
  return useMutation({
    mutationFn: async (params: { fecha?: string }): Promise<Blob> => {
      const response = await apiClient.get<Blob>('/pagos-recepcion/pagos-del-mes/export', {
        params: params.fecha ? { fecha: params.fecha } : undefined,
        responseType: 'blob',
      });
      return response.data;
    },
  });
}

export interface CamposEditablesPagosDelMes {
  efectivo: number;
  amex: number;
  visa: number;
  mcard: number;
  credito: number;
  subtotal1: number;
  iva16: number;
  ish3: number;
  propina: number;
}

export function useActualizarPagoRecepcionDia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: number; campos: CamposEditablesPagosDelMes }): Promise<FilaPagosDelMes> => {
      const response = await apiClient.put<FilaPagosDelMes>(
        `/pagos-recepcion/pagos-del-mes/${params.id}`,
        params.campos,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pagos-del-mes'] });
      queryClient.invalidateQueries({ queryKey: ['pagos-recepcion-analitica'] });
    },
  });
}

export interface FilaManualPagosDelMes {
  fecha: string;
  cuenta?: number;
  habitacion?: string;
  huesped?: string;
  efectivo?: number;
  amex?: number;
  visa?: number;
  mcard?: number;
  credito?: number;
}

export function useAgregarFilaManualPagosDelMes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: FilaManualPagosDelMes): Promise<FilaPagosDelMes> => {
      const response = await apiClient.post<FilaPagosDelMes>(
        '/pagos-recepcion/pagos-del-mes/fila-manual',
        params,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pagos-del-mes'] });
      queryClient.invalidateQueries({ queryKey: ['pagos-del-mes-dias'] });
      queryClient.invalidateQueries({ queryKey: ['pagos-recepcion-analitica'] });
    },
  });
}

export function useEliminarFilaPagosDelMes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: number }): Promise<{ id: number; eliminado: boolean }> => {
      const response = await apiClient.delete<{ id: number; eliminado: boolean }>(
        `/pagos-recepcion/pagos-del-mes/${params.id}`,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pagos-del-mes'] });
      queryClient.invalidateQueries({ queryKey: ['pagos-del-mes-dias'] });
      queryClient.invalidateQueries({ queryKey: ['pagos-recepcion-analitica'] });
    },
  });
}

// ── Conciliación de retenciones (se envía junto con /pagos/export) ──

async function _parseArchivoRetencion(
  file: File,
  endpoint: string,
): Promise<{ filas: Record<string, unknown>[]; total: number }> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post<{ filas: Record<string, unknown>[]; total: number }>(
    endpoint,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return response.data;
}

export const parseRetencionIva10 = (file: File) => _parseArchivoRetencion(file, '/pagos/retenciones/iva-10/parse');
export const parseRetencionIva4 = (file: File) => _parseArchivoRetencion(file, '/pagos/retenciones/iva-4/parse');
export const parseRetencionIsr10 = (file: File) => _parseArchivoRetencion(file, '/pagos/retenciones/isr-10/parse');
export const parseRetencionIsr125 = (file: File) => _parseArchivoRetencion(file, '/pagos/retenciones/isr-125/parse');
export const parseIvaAcreditable = (file: File) => _parseArchivoRetencion(file, '/pagos/retenciones/iva-acreditable/parse');

// ── Conciliacion ──────────────────────────────────────────────

export interface ConciliacionFilter {
  page?: number;
  page_size?: number;
  estado?: string;
  buscar?: string;
  fecha_desde?: string;
  fecha_hasta?: string;
}

export function useConciliacion(filters: ConciliacionFilter = {}) {
  return useQuery({
    queryKey: ['conciliacion', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.page) params.set('page', String(filters.page));
      if (filters.page_size) params.set('page_size', String(filters.page_size));
      if (filters.estado) params.set('estado', filters.estado);
      if (filters.buscar) params.set('buscar', filters.buscar);
      if (filters.fecha_desde) params.set('fecha_desde', filters.fecha_desde);
      if (filters.fecha_hasta) params.set('fecha_hasta', filters.fecha_hasta);

      const response = await apiClient.get(`/conciliacion?${params}`);
      return response.data;
    },
  });
}

// ── Ingresos (listado/búsqueda) ─────────────────────────────────

export interface IngresosFilter {
  page?: number;
  page_size?: number;
  buscar?: string;
}

export function useIngresosList(filters: IngresosFilter = {}) {
  return useQuery({
    queryKey: ['ingresos-list', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.page) params.set('page', String(filters.page));
      if (filters.page_size) params.set('page_size', String(filters.page_size));
      if (filters.buscar) params.set('buscar', filters.buscar);
      const response = await apiClient.get(`/ingresos?${params}`);
      return response.data;
    },
  });
}

export async function exportIngresos() {
  const response = await apiClient.get<Blob>('/ingresos/export', {
    responseType: 'blob',
  });
  return response.data;
}

export interface IngresoCandidato {
  uuid: string;
  folio: string | null;
  monto: string | null;
  fecha: string | null;
  rfc_emisor: string | null;
  nombre_emisor: string | null;
  coincide_exacto: boolean;
}

export async function buscarCoincidenciaIngreso(params: { folio?: string; monto?: string; fecha?: string; fecha_alt?: string }) {
  const query = new URLSearchParams();
  if (params.folio) query.set('folio', params.folio);
  if (params.monto) query.set('monto', params.monto);
  if (params.fecha) query.set('fecha', params.fecha);
  if (params.fecha_alt) query.set('fecha_alt', params.fecha_alt);
  const response = await apiClient.get<{ candidatos: IngresoCandidato[] }>(`/ingresos/buscar-coincidencia?${query}`);
  return response.data;
}

export interface IngresoDetalle {
  id: number;
  uuid: string;
  regimen_fiscal_receptor: string;
  regimen_fiscal_emisor: string;
  rfc_emisor: string | null;
  nombre_emisor: string | null;
  datos_extra: Record<string, unknown> | null;
  created_at: string;
}

export interface IngresoUpdatePayload {
  rfc_emisor?: string;
  nombre_emisor?: string;
  datos_extra?: Record<string, string | number>;
}

export function useIngreso(id: number | null) {
  return useQuery({
    queryKey: ['ingreso', id],
    queryFn: async (): Promise<IngresoDetalle> => {
      const response = await apiClient.get<IngresoDetalle>(`/ingresos/${id}`);
      return response.data;
    },
    enabled: id !== null,
  });
}

export function useUpdateIngreso() {
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: IngresoUpdatePayload }): Promise<IngresoDetalle> => {
      const response = await apiClient.patch<IngresoDetalle>(`/ingresos/${id}`, data);
      return response.data;
    },
  });
}

// ── Catálogo de Productos ────────────────────────────────────────

export interface ProductoCatalogo {
  id: number;
  punto_venta: string;
  grupo: string;
  nombre_producto: string;
  tipo: string | null;
  categoria_tipo: string;
  seccion_menu: string;
  dia_tematica: string | null;
  evento_especial: string | null;
  costo: number | null;
  precio_venta: number | null;
}

export interface GuardarCatalogoProductosResponse {
  total: number;
  por_grupo: Record<string, number>;
  por_categoria: Record<string, number>;
  por_seccion: Record<string, number>;
  por_dia_tematica: Record<string, number>;
  por_evento_especial: Record<string, number>;
}

export interface RequiereConfirmacionCatalogoProductos {
  requiere_confirmacion: true;
  total_existentes: number;
}

export function useGuardarCatalogoProductos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      file: File;
      confirmarReemplazo?: boolean;
    }): Promise<GuardarCatalogoProductosResponse | RequiereConfirmacionCatalogoProductos> => {
      const formData = new FormData();
      formData.append('archivo', params.file);
      formData.append('confirmar_reemplazo', String(params.confirmarReemplazo ?? false));
      const response = await apiClient.post<GuardarCatalogoProductosResponse | RequiereConfirmacionCatalogoProductos>(
        '/catalogo-productos/upload',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return response.data;
    },
    onSuccess: (data) => {
      if (!('requiere_confirmacion' in data)) {
        queryClient.invalidateQueries({ queryKey: ['catalogo-productos'] });
      }
    },
  });
}

export function useCatalogoProductos(
  filtros: { grupo?: string | null; categoriaTipo?: string | null; seccionMenu?: string | null } = {},
) {
  return useQuery({
    queryKey: ['catalogo-productos', filtros.grupo ?? null, filtros.categoriaTipo ?? null, filtros.seccionMenu ?? null],
    queryFn: async (): Promise<{ total: number; productos: ProductoCatalogo[] }> => {
      const params = new URLSearchParams();
      if (filtros.grupo) params.set('grupo', filtros.grupo);
      if (filtros.categoriaTipo) params.set('categoria_tipo', filtros.categoriaTipo);
      if (filtros.seccionMenu) params.set('seccion_menu', filtros.seccionMenu);
      const response = await apiClient.get<{ total: number; productos: ProductoCatalogo[] }>(
        `/catalogo-productos?${params}`,
      );
      return response.data;
    },
  });
}

// ── Productos Vendidos (Fase 2 de Catálogo de Productos, solo
// Restaurante) — sube el reporte mensual de ventas por producto del POS y
// hereda categoria_tipo/seccion_menu del Catálogo de Productos por nombre.
// A diferencia del catálogo (vigente, sin historial), aquí sí se guarda
// historial por lote (fecha_desde/fecha_hasta — el archivo no trae fecha
// por fila, solo un rango que cubre todas sus filas por igual). Dos lotes
// guardados nunca se traslapan (ver guard de /upload), así que
// `fecha_desde` por sí solo ya es una llave única de lote. ─────────────

export interface ProductoVendido {
  id: number;
  fecha_desde: string;
  fecha_hasta: string;
  punto_venta: string;
  grupo: string;
  nombre_producto: string;
  costo: number | null;
  precio_venta: number | null;
  cantidad: number | null;
  total_costo: number | null;
  descuento: number | null;
  subtotal: number | null;
  impuesto: number | null;
  total: number | null;
  categoria_tipo: string | null;
  seccion_menu: string | null;
  producto_catalogo_encontrado: boolean;
  costo_catalogo: number | null;
  precio_venta_catalogo: number | null;
}

export interface GuardarProductosVendidosResponse {
  fecha_desde: string;
  fecha_hasta: string;
  total: number;
  por_grupo: Record<string, number>;
  por_categoria_tipo: Record<string, number>;
  por_seccion_menu: Record<string, number>;
  sin_match_catalogo: number;
}

export interface LoteProductosVendidosConflicto {
  fecha_desde: string;
  fecha_hasta: string;
  total_existentes: number;
}

// Usado tal cual por Cafetería/Carreta de Mariscos, que siguen guardando
// Productos Vendidos por periodo mensual (un solo conteo de conflicto).
export interface RequiereConfirmacionProductosVendidos {
  requiere_confirmacion: true;
  total_existentes: number;
}

// Distinto de `RequiereConfirmacionProductosVendidos` (todavía usado tal
// cual por Cafetería/Carreta de Mariscos, que siguen con periodo mensual):
// Restaurante ahora guarda por lote de rango de fechas, así que su
// conflicto de reemplazo es una lista de lotes traslapados, no un solo
// conteo.
export interface RequiereConfirmacionLoteProductosVendidos {
  requiere_confirmacion: true;
  lotes_conflicto: LoteProductosVendidosConflicto[];
}

export function useSubirProductosVendidos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      file: File;
      fechaDesde: string;
      fechaHasta: string;
      confirmarReemplazo?: boolean;
    }): Promise<GuardarProductosVendidosResponse | RequiereConfirmacionLoteProductosVendidos> => {
      const formData = new FormData();
      formData.append('archivo', params.file);
      formData.append('fecha_desde', params.fechaDesde);
      formData.append('fecha_hasta', params.fechaHasta);
      formData.append('confirmar_reemplazo', String(params.confirmarReemplazo ?? false));
      const response = await apiClient.post<GuardarProductosVendidosResponse | RequiereConfirmacionLoteProductosVendidos>(
        '/productos-vendidos/upload',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return response.data;
    },
    onSuccess: (data, variables) => {
      if (!('requiere_confirmacion' in data)) {
        queryClient.invalidateQueries({ queryKey: ['productos-vendidos-lotes'] });
        queryClient.invalidateQueries({ queryKey: ['productos-vendidos', variables.fechaDesde] });
        queryClient.invalidateQueries({ queryKey: ['cortesias-productos-vendidos', variables.fechaDesde] });
      }
    },
  });
}

export interface LoteProductosVendidos {
  fecha_desde: string;
  fecha_hasta: string;
  etiqueta: string;
  total: number;
}

export function useLotesProductosVendidos() {
  return useQuery({
    queryKey: ['productos-vendidos-lotes'],
    queryFn: async (): Promise<{ lotes: LoteProductosVendidos[] }> => {
      const response = await apiClient.get<{ lotes: LoteProductosVendidos[] }>('/productos-vendidos/lotes');
      return response.data;
    },
  });
}

export function useProductosVendidos(fechaDesde: string | null) {
  return useQuery({
    queryKey: ['productos-vendidos', fechaDesde],
    enabled: !!fechaDesde,
    queryFn: async (): Promise<{ total: number; productos: ProductoVendido[] }> => {
      const response = await apiClient.get<{ total: number; productos: ProductoVendido[] }>(
        `/productos-vendidos?fecha_desde=${fechaDesde}`,
      );
      return response.data;
    },
  });
}

export function useEliminarProductosVendidos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fechaDesde: string) => {
      const response = await apiClient.delete(`/productos-vendidos?fecha_desde=${fechaDesde}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos-vendidos-lotes'] });
      queryClient.invalidateQueries({ queryKey: ['productos-vendidos'] });
      queryClient.invalidateQueries({ queryKey: ['cortesias-productos-vendidos'] });
    },
  });
}

export function useExportarProductosVendidos() {
  return useMutation({
    mutationFn: async (params: { fechaDesde: string; grupo?: string }): Promise<Blob> => {
      const response = await apiClient.get<Blob>('/productos-vendidos/export', {
        params: { fecha_desde: params.fechaDesde, grupo: params.grupo || undefined },
        responseType: 'blob',
      });
      return response.data;
    },
  });
}

// ── Cortesías (calculado directo de Productos Vendidos, sin archivo
// aparte) — Impuesto ÷ 0.16 = ingreso real implícito; la diferencia contra
// el Subtotal registrado es una posible cortesía. ────────────────────

export interface FilaCortesiaProductoVendido {
  nombre_producto: string;
  grupo: string;
  categoria_tipo: string | null;
  seccion_menu: string | null;
  subtotal: number | null;
  impuesto: number | null;
  ingreso_real: number | null;
  monto_cortesia: number | null;
  cantidad_cortesia: number | null;
}

export interface CortesiasProductosVendidosResponse {
  fecha_desde: string;
  total_monto_cortesia: number;
  total_cantidad_cortesia: number;
  productos_con_cortesia: number;
  comparacion: FilaCortesiaProductoVendido[];
}

export function useCortesiasProductosVendidos(fechaDesde: string | null) {
  return useQuery({
    queryKey: ['cortesias-productos-vendidos', fechaDesde],
    enabled: !!fechaDesde,
    queryFn: async (): Promise<CortesiasProductosVendidosResponse> => {
      const response = await apiClient.get<CortesiasProductosVendidosResponse>(
        `/productos-vendidos/comparar-iva?fecha_desde=${fechaDesde}`,
      );
      return response.data;
    },
  });
}

// ── Comandas Emitidas / Recibos Emitidos — Restaurante ("Inteligencia de
// Negocio" Fase 1): primeros archivos con fecha/hora real por fila de este
// sistema. Un archivo puede cubrir varios días (semanal/mensual); el
// reemplazo al volver a subir es por día, no por archivo completo — ver
// `fechas_conflicto` en la respuesta de confirmación. ───────────────────

export interface ComandaEmitida {
  id: number;
  fecha: string;
  hora: string;
  turno: string;
  mesa: string | null;
  cuenta: string | null;
  producto: string;
  grupo: string | null;
  categoria_tipo: string | null;
  seccion_menu: string | null;
  producto_catalogo_encontrado: boolean;
  cantidad: number;
  estatus: string | null;
}

export interface GuardarComandasEmitidasResponse {
  fechas_procesadas: string[];
  total_filas: number;
  por_turno: Record<string, number>;
  sin_match_catalogo: number;
}

export interface FechaConflicto {
  fecha: string;
  total_existentes: number;
}

export interface RequiereConfirmacionLote {
  requiere_confirmacion: true;
  fechas_conflicto: FechaConflicto[];
}

export function useSubirComandasEmitidas() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      file: File;
      confirmarReemplazo?: boolean;
    }): Promise<GuardarComandasEmitidasResponse | RequiereConfirmacionLote> => {
      const formData = new FormData();
      formData.append('archivo', params.file);
      formData.append('confirmar_reemplazo', String(params.confirmarReemplazo ?? false));
      const response = await apiClient.post<GuardarComandasEmitidasResponse | RequiereConfirmacionLote>(
        '/comandas-emitidas/upload',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return response.data;
    },
    onSuccess: (data) => {
      if (!('requiere_confirmacion' in data)) {
        queryClient.invalidateQueries({ queryKey: ['comandas-emitidas-dias'] });
        queryClient.invalidateQueries({ queryKey: ['comandas-emitidas'] });
      }
    },
  });
}

export function useDiasComandasEmitidas() {
  return useQuery({
    queryKey: ['comandas-emitidas-dias'],
    queryFn: async (): Promise<{ dias: { fecha: string; total: number }[] }> => {
      const response = await apiClient.get<{ dias: { fecha: string; total: number }[] }>('/comandas-emitidas/dias');
      return response.data;
    },
  });
}

export function useComandasEmitidas(params: { fechaDesde: string; fechaHasta: string; turno?: string; grupo?: string } | null) {
  return useQuery({
    queryKey: ['comandas-emitidas', params],
    enabled: !!params,
    queryFn: async (): Promise<{ total: number; comandas: ComandaEmitida[] }> => {
      const response = await apiClient.get<{ total: number; comandas: ComandaEmitida[] }>('/comandas-emitidas', {
        params: {
          fecha_desde: params!.fechaDesde,
          fecha_hasta: params!.fechaHasta,
          turno: params!.turno || undefined,
          grupo: params!.grupo || undefined,
        },
      });
      return response.data;
    },
  });
}

export function useEliminarComandasEmitidas() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fecha: string) => {
      const response = await apiClient.delete(`/comandas-emitidas?fecha=${fecha}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comandas-emitidas-dias'] });
      queryClient.invalidateQueries({ queryKey: ['comandas-emitidas'] });
    },
  });
}

export interface ReciboEmitido {
  id: number;
  fecha: string;
  hora: string;
  turno: string;
  pos: string | null;
  cuenta: string | null;
  factura: string | null;
  pagada: string | null;
  tipo: string | null;
  room_name: string | null;
  num_cubiertos: number | null;
  subtotal: number;
  descuento: number;
  tax: number;
  room_serv: number;
  servicio: number;
  propina: number;
  total: number;
  subtotal_tipo_producto: number;
  segmento: string | null;
  clientes: string | null;
}

export interface GuardarRecibosEmitidosResponse {
  fechas_procesadas: string[];
  total_filas: number;
  por_turno: Record<string, number>;
  suma_total: number;
}

export function useSubirRecibosEmitidos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      file: File;
      confirmarReemplazo?: boolean;
    }): Promise<GuardarRecibosEmitidosResponse | RequiereConfirmacionLote> => {
      const formData = new FormData();
      formData.append('archivo', params.file);
      formData.append('confirmar_reemplazo', String(params.confirmarReemplazo ?? false));
      const response = await apiClient.post<GuardarRecibosEmitidosResponse | RequiereConfirmacionLote>(
        '/recibos-emitidos/upload',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return response.data;
    },
    onSuccess: (data) => {
      if (!('requiere_confirmacion' in data)) {
        queryClient.invalidateQueries({ queryKey: ['recibos-emitidos-dias'] });
        queryClient.invalidateQueries({ queryKey: ['recibos-emitidos'] });
      }
    },
  });
}

export function useDiasRecibosEmitidos() {
  return useQuery({
    queryKey: ['recibos-emitidos-dias'],
    queryFn: async (): Promise<{ dias: { fecha: string; total: number }[] }> => {
      const response = await apiClient.get<{ dias: { fecha: string; total: number }[] }>('/recibos-emitidos/dias');
      return response.data;
    },
  });
}

export function useRecibosEmitidos(params: { fechaDesde: string; fechaHasta: string; turno?: string } | null) {
  return useQuery({
    queryKey: ['recibos-emitidos', params],
    enabled: !!params,
    queryFn: async (): Promise<{ total: number; recibos: ReciboEmitido[] }> => {
      const response = await apiClient.get<{ total: number; recibos: ReciboEmitido[] }>('/recibos-emitidos', {
        params: {
          fecha_desde: params!.fechaDesde,
          fecha_hasta: params!.fechaHasta,
          turno: params!.turno || undefined,
        },
      });
      return response.data;
    },
  });
}

export function useEliminarRecibosEmitidos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fecha: string) => {
      const response = await apiClient.delete(`/recibos-emitidos?fecha=${fecha}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recibos-emitidos-dias'] });
      queryClient.invalidateQueries({ queryKey: ['recibos-emitidos'] });
    },
  });
}

// ── Conciliación de Ventas Diarias — cruza Comandas Emitidas + Recibos
// Emitidos (por cuenta) y Comandas Emitidas + Productos Vendidos (por
// producto, marcando discrepancias de cantidad). Se calcula al vuelo en el
// backend, sin tabla propia. ────────────────────────────────────────────

export interface ProductoCuentaConciliacion {
  producto: string;
  grupo: string | null;
  categoria_tipo: string | null;
  seccion_menu: string | null;
  cantidad: number;
  hora: string;
  mesa: string | null;
  estatus: string | null;
}

export interface CuentaConciliacion {
  cuenta: string;
  recibo_encontrado: boolean;
  turno: string | null;
  pos: string | null;
  tipo: string | null;
  pagada: string | null;
  segmento: string | null;
  room_name: string | null;
  num_cubiertos: number | null;
  subtotal: number | null;
  descuento: number | null;
  tax: number | null;
  propina: number | null;
  total: number | null;
  productos: ProductoCuentaConciliacion[];
}

export interface FilaProductoConciliacion {
  producto: string;
  turno: string | null;
  hora_apertura: string | null;
  hora_cierre: string | null;
  grupo: string | null;
  categoria_tipo: string | null;
  seccion_menu: string | null;
  cantidad_comandas: number;
  cantidad_comandas_dia: number;
  cantidad_vendida: number | null;
  sin_match_productos_vendidos: boolean;
  confirmado_en_historial: boolean;
  discrepancia: boolean;
  costo: number | null;
  precio_venta: number | null;
  costo_catalogo: number | null;
  precio_venta_catalogo: number | null;
  subtotal: number | null;
  impuesto: number | null;
  descuento: number | null;
  total: number | null;
  precio_estimado_de_catalogo: boolean;
  ingreso_real: number | null;
  monto_cortesia: number | null;
  cantidad_cortesia: number | null;
}

export interface ConciliacionVentasDiariasResponse {
  fecha: string;
  cuentas: CuentaConciliacion[];
  productos: FilaProductoConciliacion[];
  productos_vendidos_disponible: boolean;
  productos_rango: { fecha_desde: string; fecha_hasta: string } | null;
}

export function useConciliacionVentasDiarias(fecha: string | null) {
  return useQuery({
    queryKey: ['conciliacion-ventas-diarias', fecha],
    enabled: !!fecha,
    queryFn: async (): Promise<ConciliacionVentasDiariasResponse> => {
      const response = await apiClient.get<ConciliacionVentasDiariasResponse>('/conciliacion-ventas-diarias', {
        params: { fecha },
      });
      return response.data;
    },
  });
}

// ── Resumen Ejecutivo — Inteligencia de Negocio / Análisis y Profundidad,
// Restaurante. KPIs + insights automáticos para un rango de fechas, a
// partir de Comandas/Recibos Emitidos (no depende de Productos Vendidos).

export interface ResumenEjecutivoKpis {
  dias_con_datos: number;
  total_vendido: number;
  cantidad_cuentas: number;
  ticket_promedio: number;
  piezas_vendidas: number;
  propina_total: number;
  total_vendido_periodo_anterior: number | null;
  variacion_pct: number | null;
}

export interface ResumenEjecutivoDia {
  fecha: string;
  total_vendido: number;
  cantidad_cuentas: number;
  piezas_vendidas: number;
}

export interface ResumenEjecutivoInsight {
  tipo: 'variacion' | 'turno' | 'producto_top' | 'dia_semana' | 'por_que_mejor_peor_dia' | 'precio_candidato';
  mensaje: string;
  tono: 'positivo' | 'negativo' | 'neutral';
  accion_sugerida: string;
}

export interface ComparacionPeriodo {
  actual: number;
  anterior: number;
  variacion_pct: number | null;
}

export interface ComparacionDia extends ComparacionPeriodo {
  fecha?: string;
  fecha_comparada?: string;
  /** El último día con datos parece incompleto (pocas cuentas vs. el promedio). */
  parcial?: boolean;
}

export interface ConciliacionVentasResumen {
  venta_neta: number;
  cuentas_comerciales: number;
  iva: number;
  propina: number;
  propina_pct_venta_neta: number | null;
  descuento: number;
  cuentas_con_descuento: number;
  descuento_pct_venta_bruta: number | null;
  no_comercial: Record<'cortesia' | 'al_costo' | 'consumo_interno' | 'otro', { monto: number; cuentas: number }>;
  por_segmento: { segmento: string; venta_neta: number }[];
  ingreso_catalogo_comandas: number;
  vs_subtotal_recibos: { base: number; diferencia: number; diferencia_pct: number | null };
  vs_subtotal_con_iva_recibos: { base: number; diferencia: number; diferencia_pct: number | null };
  cuentas_comanda_sin_recibo: number;
  cuentas_recibo_sin_comanda: number;
  cuentas_comanda_total: number;
  productos_precio_ambiguo: string[];
  productos_sin_precio: string[];
  cantidad_sin_precio: number;
}

export interface ComparacionesPeriodo {
  dia: ComparacionDia;
  semana: ComparacionPeriodo;
  mes: ComparacionPeriodo;
  anio: ComparacionPeriodo;
}

export interface ResumenEjecutivoResponse {
  fecha_desde: string;
  fecha_hasta: string;
  kpis: ResumenEjecutivoKpis;
  serie_diaria: ResumenEjecutivoDia[];
  insights: ResumenEjecutivoInsight[];
  comparaciones: ComparacionesPeriodo | null;
  conciliacion: ConciliacionVentasResumen;
}

export function useResumenEjecutivo(params: { fechaDesde: string; fechaHasta: string } | null) {
  return useQuery({
    queryKey: ['resumen-ejecutivo', params],
    enabled: !!params,
    queryFn: async (): Promise<ResumenEjecutivoResponse> => {
      const response = await apiClient.get<ResumenEjecutivoResponse>('/resumen-ejecutivo', {
        params: { fecha_desde: params!.fechaDesde, fecha_hasta: params!.fechaHasta },
      });
      return response.data;
    },
  });
}

export interface TendenciaMensualFila {
  mes: string;
  total_vendido: number;
  cantidad_cuentas: number;
  piezas_vendidas: number;
}

export interface TendenciaMensualResponse {
  meses: TendenciaMensualFila[];
}

export function useTendenciaMensual() {
  return useQuery({
    queryKey: ['resumen-ejecutivo-tendencia-mensual'],
    queryFn: async (): Promise<TendenciaMensualResponse> => {
      const response = await apiClient.get<TendenciaMensualResponse>('/resumen-ejecutivo/tendencia-mensual');
      return response.data;
    },
  });
}

// ── Heatmap Día×Hora de Ventas — segundo dashboard de Análisis y
// Profundidad. Una fila por FECHA exacta y hora (nunca combinada entre
// fechas del mismo día de la semana), calculado solo con Comandas Emitidas.

export interface HeatmapTopProducto {
  producto: string;
  cantidad: number;
}

export interface HeatmapCelda {
  fecha: string;
  dia_semana: number;
  hora: number;
  piezas: number;
  top_productos: HeatmapTopProducto[];
}

export interface HeatmapPico {
  fecha: string;
  hora: number;
  piezas: number;
  promedio_resto_del_mes: number;
  variacion_pct: number;
  top_productos: HeatmapTopProducto[];
}

export interface HeatmapVentasResponse {
  fecha_desde: string;
  fecha_hasta: string;
  celdas: HeatmapCelda[];
  fechas_con_datos: string[];
  picos: HeatmapPico[];
  notas: Record<string, string>;
}

export function useHeatmapVentas(params: { fechaDesde: string; fechaHasta: string } | null) {
  return useQuery({
    queryKey: ['heatmap-ventas', params],
    enabled: !!params,
    queryFn: async (): Promise<HeatmapVentasResponse> => {
      const response = await apiClient.get<HeatmapVentasResponse>('/heatmap-ventas', {
        params: { fecha_desde: params!.fechaDesde, fecha_hasta: params!.fechaHasta },
      });
      return response.data;
    },
  });
}

export function useGuardarNotaHeatmap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { fecha: string; nota: string }) => {
      const response = await apiClient.put('/heatmap-ventas/notas', body);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['heatmap-ventas'] });
    },
  });
}

// ── Ranking de Productos — tercer dashboard de Análisis y Profundidad.
// Popularidad/margen/ingreso por producto, calculado con Comandas Emitidas
// × Catálogo (no ordenado — el frontend reordena localmente por criterio).

export interface RankingProductoFila {
  producto: string;
  grupo: string | null;
  categoria_tipo: string | null;
  seccion_menu: string | null;
  cantidad: number;
  costo: number | null;
  precio_venta: number | null;
  margen_pct: number | null;
  ingreso_total: number;
  producto_catalogo_encontrado: boolean;
  cantidad_periodo_anterior: number;
  variacion_pct_cantidad: number | null;
}

export interface RankingGrupoFila {
  grupo: string;
  cantidad: number;
  ingreso_total: number;
  margen_pct: number | null;
  pct_participacion: number;
}

export interface RankingProductosResponse {
  fecha_desde: string;
  fecha_hasta: string;
  productos: RankingProductoFila[];
  grupos: RankingGrupoFila[];
}

export function useRankingProductos(params: { fechaDesde: string; fechaHasta: string } | null) {
  return useQuery({
    queryKey: ['ranking-productos', params],
    enabled: !!params,
    queryFn: async (): Promise<RankingProductosResponse> => {
      const response = await apiClient.get<RankingProductosResponse>('/ranking-productos', {
        params: { fecha_desde: params!.fechaDesde, fecha_hasta: params!.fechaHasta },
      });
      return response.data;
    },
  });
}

// ── Panel de Turnos — cuarto dashboard de Análisis y Profundidad.
// Comparativo Desayuno/Comida/Cena para un rango de fechas, calculado con
// Comandas Emitidas × Recibos Emitidos.

export interface TurnoComparativoFila {
  turno: string;
  total_vendido: number;
  cantidad_cuentas: number;
  ticket_promedio: number;
  piezas_vendidas: number;
  pct_participacion: number;
  margen_pct: number | null;
}

export interface PanelTurnosResponse {
  fecha_desde: string;
  fecha_hasta: string;
  turnos: TurnoComparativoFila[];
}

export function usePanelTurnos(params: { fechaDesde: string; fechaHasta: string } | null) {
  return useQuery({
    queryKey: ['panel-turnos', params],
    enabled: !!params,
    queryFn: async (): Promise<PanelTurnosResponse> => {
      const response = await apiClient.get<PanelTurnosResponse>('/panel-turnos', {
        params: { fecha_desde: params!.fechaDesde, fecha_hasta: params!.fechaHasta },
      });
      return response.data;
    },
  });
}

// ── Dashboard de Cortesías — 5º dashboard de Análisis y Profundidad.
// Impacto económico y ranking de productos con más cortesías; el desglose
// por día/turno solo cubre lotes de Productos Vendidos de un solo día.

export interface CortesiaProductoFila {
  producto: string;
  monto_cortesia: number;
  cantidad_cortesia: number;
}

export interface CortesiaDiaFila {
  fecha: string;
  monto_cortesia: number;
  cantidad_cortesia: number;
}

export interface CortesiaTurnoFila {
  turno: string;
  monto_cortesia: number;
  cantidad_cortesia: number;
}

/** Cortesías desde Recibos Emitidos (`tipo = CORTESIA`): fuente principal del panel, cubre todos los meses. */
export interface CortesiasRecibos {
  total_monto_cortesia: number;
  cuentas_cortesia: number;
  /** Cortesías como % de la venta neta del rango; null si no hay venta neta. */
  pct_de_venta_neta: number | null;
  por_departamento: { segmento: string; monto: number; cuentas: number }[];
  por_turno: { turno: string; monto: number; cuentas: number }[];
  por_dia: { fecha: string; monto: number; cuentas: number }[];
  mayores_cuentas: { fecha: string; cuenta: string | null; turno: string; segmento: string; monto: number }[];
  otros_no_comerciales: Record<'al_costo' | 'consumo_interno', { monto: number; cuentas: number }>;
}

export interface CortesiasDashboardResponse {
  fecha_desde: string;
  fecha_hasta: string;
  recibos: CortesiasRecibos;
  resumen: {
    total_monto_cortesia: number;
    total_cantidad_cortesia: number;
    productos: CortesiaProductoFila[];
  };
  por_dia: CortesiaDiaFila[];
  por_turno: CortesiaTurnoFila[];
  dias_excluidos_por_lote_multi_dia: number;
}

export function useCortesiasDashboard(params: { fechaDesde: string; fechaHasta: string } | null) {
  return useQuery({
    queryKey: ['cortesias-dashboard', params],
    enabled: !!params,
    queryFn: async (): Promise<CortesiasDashboardResponse> => {
      const response = await apiClient.get<CortesiasDashboardResponse>('/cortesias-dashboard', {
        params: { fecha_desde: params!.fechaDesde, fecha_hasta: params!.fechaHasta },
      });
      return response.data;
    },
  });
}

// ── Panel de Oportunidades Comerciales — 6º dashboard de Análisis y
// Profundidad. Hallazgos automáticos con severidad y acción sugerida.

export interface OportunidadComercial {
  tipo: string;
  dia_semana: number | null;
  mensaje: string;
  severidad: 'alta' | 'media' | 'baja';
  accion_sugerida: string;
}

export interface OportunidadesComercialesResponse {
  fecha_desde: string;
  fecha_hasta: string;
  oportunidades: OportunidadComercial[];
}

export function useOportunidadesComerciales(params: { fechaDesde: string; fechaHasta: string } | null) {
  return useQuery({
    queryKey: ['oportunidades-comerciales', params],
    enabled: !!params,
    queryFn: async (): Promise<OportunidadesComercialesResponse> => {
      const response = await apiClient.get<OportunidadesComercialesResponse>('/oportunidades-comerciales', {
        params: { fecha_desde: params!.fechaDesde, fecha_hasta: params!.fechaHasta },
      });
      return response.data;
    },
  });
}

// ── Ingeniería de Menú — 7º dashboard de Análisis y Profundidad. Clasifica
// cada producto en 4 cuadrantes combinando popularidad (cantidad) y
// rentabilidad (margen_pct), reusando la misma fila de Ranking de Productos.

export interface MenuEngineeringProductoFila extends RankingProductoFila {
  cuadrante: 'estrella' | 'caballo_batalla' | 'rompecabezas' | 'perro';
}

export interface MenuEngineeringResponse {
  fecha_desde: string;
  fecha_hasta: string;
  corte_popularidad: number | null;
  corte_margen: number | null;
  productos: MenuEngineeringProductoFila[];
  sin_clasificar: RankingProductoFila[];
}

export function useMenuEngineering(params: { fechaDesde: string; fechaHasta: string } | null) {
  return useQuery({
    queryKey: ['menu-engineering', params],
    enabled: !!params,
    queryFn: async (): Promise<MenuEngineeringResponse> => {
      const response = await apiClient.get<MenuEngineeringResponse>('/menu-engineering', {
        params: { fecha_desde: params!.fechaDesde, fecha_hasta: params!.fechaHasta },
      });
      return response.data;
    },
  });
}

// ── Mix de Ventas — 8º dashboard de Análisis y Profundidad. Distribución de
// ventas por grupo, categoría, sección de menú y turno (% de participación).

export interface MixVentasFila {
  etiqueta: string;
  cantidad: number;
  ingreso_total: number;
  margen_pct: number | null;
  pct_participacion: number;
}

export interface MixVentasResponse {
  fecha_desde: string;
  fecha_hasta: string;
  grupo: RankingGrupoFila[];
  categoria_tipo: MixVentasFila[];
  seccion_menu: MixVentasFila[];
  turno: TurnoComparativoFila[];
}

export function useMixVentas(params: { fechaDesde: string; fechaHasta: string } | null) {
  return useQuery({
    queryKey: ['mix-ventas', params],
    enabled: !!params,
    queryFn: async (): Promise<MixVentasResponse> => {
      const response = await apiClient.get<MixVentasResponse>('/mix-ventas', {
        params: { fecha_desde: params!.fechaDesde, fecha_hasta: params!.fechaHasta },
      });
      return response.data;
    },
  });
}

// ── Dependencia de Productos — 9º dashboard de Análisis y Profundidad.
// Tabla de concentración de ingreso (Pareto): rank, % individual y % acumulado.

export interface DependenciaProductoFila {
  rank: number;
  producto: string;
  ingreso_total: number;
  pct_individual: number;
  pct_acumulado: number;
}

export interface DependenciaProductosResponse {
  fecha_desde: string;
  fecha_hasta: string;
  filas: DependenciaProductoFila[];
  top5_pct: number | null;
  top10_pct: number | null;
}

export function useDependenciaProductos(params: { fechaDesde: string; fechaHasta: string } | null) {
  return useQuery({
    queryKey: ['dependencia-productos', params],
    enabled: !!params,
    queryFn: async (): Promise<DependenciaProductosResponse> => {
      const response = await apiClient.get<DependenciaProductosResponse>('/dependencia-productos', {
        params: { fecha_desde: params!.fechaDesde, fecha_hasta: params!.fechaHasta },
      });
      return response.data;
    },
  });
}

// ── Alertas de Riesgo — 10º dashboard de Análisis y Profundidad. Alertas
// ejecutivas automáticas con severidad y acción sugerida.

export interface AlertaRiesgo {
  tipo: string;
  mensaje: string;
  severidad: 'alta' | 'media' | 'baja';
  accion_sugerida: string;
}

export interface AlertasRiesgoResponse {
  fecha_desde: string;
  fecha_hasta: string;
  alertas: AlertaRiesgo[];
}

export function useAlertasRiesgo(params: { fechaDesde: string; fechaHasta: string } | null) {
  return useQuery({
    queryKey: ['alertas-riesgo', params],
    enabled: !!params,
    queryFn: async (): Promise<AlertasRiesgoResponse> => {
      const response = await apiClient.get<AlertasRiesgoResponse>('/alertas-riesgo', {
        params: { fecha_desde: params!.fechaDesde, fecha_hasta: params!.fechaHasta },
      });
      return response.data;
    },
  });
}

// ── Desempeño Comercial — 11º dashboard de Análisis y Profundidad. Compara
// el mes elegido contra el periodo anterior de igual duración: qué líneas
// de negocio crecen/caen, qué productos lo explican, impacto económico.

export interface ComparacionKpiDesempeno {
  actual: number;
  anterior: number;
  diferencia: number;
  variacion_pct: number | null;
}

export interface KpisDesempenoComercial {
  ventas: ComparacionKpiDesempeno;
  cantidad_vendida: ComparacionKpiDesempeno;
  ticket_promedio: ComparacionKpiDesempeno;
  cuentas: ComparacionKpiDesempeno;
}

export interface ProductoComparadoDesempeno {
  producto: string;
  ingreso_actual: number;
  ingreso_anterior: number;
  contribucion: number;
  contribucion_pct: number | null;
}

export interface ProductoNuevoDesempeno {
  producto: string;
  ingreso_total: number;
  cantidad: number;
}

export interface ComparativoDimensionDesempeno {
  grupo?: string;
  etiqueta?: string;
  ingreso_actual: number;
  ingreso_anterior: number;
  diferencia: number;
  variacion_pct: number | null;
  pct_participacion: number;
}

export interface HallazgoDesempeno {
  tipo: 'grupo_impulsor' | 'seccion_impulsora' | 'producto_top' | 'producto_caida' | 'concentracion';
  mensaje: string;
  tono: 'positivo' | 'negativo' | 'neutral';
  accion_sugerida: string;
}

export interface DesempenoComercialResponse {
  fecha_desde: string;
  fecha_hasta: string;
  fecha_desde_anterior: string;
  fecha_hasta_anterior: string;
  kpis: KpisDesempenoComercial;
  productos_comparados: { positivos: ProductoComparadoDesempeno[]; negativos: ProductoComparadoDesempeno[] };
  grupos_comparados: ComparativoDimensionDesempeno[];
  categoria_comparada: ComparativoDimensionDesempeno[];
  seccion_comparada: ComparativoDimensionDesempeno[];
  top_ganadores: ProductoComparadoDesempeno[];
  top_perdedores: ProductoComparadoDesempeno[];
  productos_nuevos: ProductoNuevoDesempeno[];
  participacion_grupos: ComparativoDimensionDesempeno[];
  hallazgos: HallazgoDesempeno[];
}

export function useDesempenoComercial(params: { fechaDesde: string; fechaHasta: string } | null) {
  return useQuery({
    queryKey: ['desempeno-comercial', params],
    enabled: !!params,
    queryFn: async (): Promise<DesempenoComercialResponse> => {
      const response = await apiClient.get<DesempenoComercialResponse>('/desempeno-comercial', {
        params: { fecha_desde: params!.fechaDesde, fecha_hasta: params!.fechaHasta },
      });
      return response.data;
    },
  });
}

// ── Optimización de Precios — sub-vista de Desempeño Comercial. Cruza
// Costeo (costo/precio/estado por producto) con Comandas del mes elegido
// para analizar la rentabilidad real del catálogo completo (no solo
// "REQ AJUSTE"), agrupado en la jerarquía Sección → Categoría → Grupo.
// Todo el dinero de oportunidad va sin IVA (subtotal, no ingreso bruto).

export interface ProductoCosteoAnalisis {
  producto: string;
  grupo: string | null;
  categoria_tipo: string | null;
  seccion_menu: string | null;
  cantidad_vendida: number;
  costo_unitario: number;
  precio_actual: number;
  precio_sugerido: number;
  pct_costo_actual: number;
  pct_costo_objetivo: number;
  diferencia_pct: number;
  subtotal_actual: number;
  iva_actual: number;
  subtotal_potencial: number;
  incremento_potencial: number;
  estado: 'OK' | 'REQ AJUSTE';
  es_hora_feliz: boolean;
}

export interface ResumenNivelCosteo {
  clave: string;
  productos: number;
  cantidad_vendida: number;
  subtotal: number;
  pct_costo_promedio: number;
  pct_costo_objetivo: number;
  diferencia_promedio: number;
  incremento_potencial_estimado: number;
}

export interface ComparacionHoraFeliz {
  pct_costo_promedio_hora_feliz: number | null;
  pct_costo_promedio_cervezas: number | null;
  margen_pct_hora_feliz: number | null;
  margen_pct_cervezas: number | null;
  diferencia_margen: number | null;
  incremento_potencial_estimado: number;
}

export interface HallazgoCosteoProductos {
  tipo:
    | 'grupo_mayor_desviacion'
    | 'grupo_mayor_concentracion'
    | 'hora_feliz_utilidad_no_capturada'
    | 'concentracion_productos'
    | 'seccion_peor_desviacion';
  mensaje: string;
  tono: 'positivo' | 'negativo' | 'neutral';
  accion_sugerida: string;
}

export interface AnalisisCosteoProductosResponse {
  fecha_desde: string;
  fecha_hasta: string;
  pct_costo_objetivo: number;
  productos: ProductoCosteoAnalisis[];
  resumen_por_seccion: ResumenNivelCosteo[];
  resumen_por_categoria: ResumenNivelCosteo[];
  resumen_por_grupo: ResumenNivelCosteo[];
  incremento_potencial_total: number;
  hora_feliz: ComparacionHoraFeliz;
  hallazgos: HallazgoCosteoProductos[];
}

export function useOptimizacionPrecios(params: { fechaDesde: string; fechaHasta: string } | null) {
  return useQuery({
    queryKey: ['desempeno-comercial-optimizacion-precios', params],
    enabled: !!params,
    queryFn: async (): Promise<AnalisisCosteoProductosResponse> => {
      const response = await apiClient.get<AnalisisCosteoProductosResponse>('/desempeno-comercial/optimizacion-precios', {
        params: { fecha_desde: params!.fechaDesde, fecha_hasta: params!.fechaHasta },
      });
      return response.data;
    },
  });
}

// ── Productos Vendidos — Cafetería (mismo criterio que Restaurante, sin
// categoria_tipo/seccion_menu: el Catálogo de Cafetería no los tiene) ──

export interface ProductoVendidoCafeteria {
  id: number;
  periodo: string;
  punto_venta: string;
  grupo: string;
  nombre_producto: string;
  costo: number | null;
  precio_venta: number | null;
  cantidad: number | null;
  total_costo: number | null;
  descuento: number | null;
  subtotal: number | null;
  impuesto: number | null;
  total: number | null;
  producto_catalogo_encontrado: boolean;
  costo_catalogo: number | null;
  precio_venta_catalogo: number | null;
}

export interface GuardarProductosVendidosCafeteriaResponse {
  periodo: string;
  total: number;
  por_grupo: Record<string, number>;
  sin_match_catalogo: number;
}

export function useSubirProductosVendidosCafeteria() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      file: File;
      periodo: string;
      confirmarReemplazo?: boolean;
    }): Promise<GuardarProductosVendidosCafeteriaResponse | RequiereConfirmacionProductosVendidos> => {
      const formData = new FormData();
      formData.append('archivo', params.file);
      formData.append('periodo', params.periodo);
      formData.append('confirmar_reemplazo', String(params.confirmarReemplazo ?? false));
      const response = await apiClient.post<GuardarProductosVendidosCafeteriaResponse | RequiereConfirmacionProductosVendidos>(
        '/productos-vendidos-cafeteria/upload',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return response.data;
    },
    onSuccess: (data, variables) => {
      if (!('requiere_confirmacion' in data)) {
        queryClient.invalidateQueries({ queryKey: ['productos-vendidos-cafeteria-periodos'] });
        queryClient.invalidateQueries({ queryKey: ['productos-vendidos-cafeteria', variables.periodo] });
        queryClient.invalidateQueries({ queryKey: ['cortesias-productos-vendidos-cafeteria', variables.periodo] });
      }
    },
  });
}

export function usePeriodosProductosVendidosCafeteria() {
  return useQuery({
    queryKey: ['productos-vendidos-cafeteria-periodos'],
    queryFn: async (): Promise<{ periodos: { periodo: string; total: number }[] }> => {
      const response = await apiClient.get<{ periodos: { periodo: string; total: number }[] }>(
        '/productos-vendidos-cafeteria/periodos',
      );
      return response.data;
    },
  });
}

export function useProductosVendidosCafeteria(periodo: string | null) {
  return useQuery({
    queryKey: ['productos-vendidos-cafeteria', periodo],
    enabled: !!periodo,
    queryFn: async (): Promise<{ total: number; productos: ProductoVendidoCafeteria[] }> => {
      const response = await apiClient.get<{ total: number; productos: ProductoVendidoCafeteria[] }>(
        `/productos-vendidos-cafeteria?periodo=${periodo}`,
      );
      return response.data;
    },
  });
}

export function useEliminarProductosVendidosCafeteria() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (periodo: string) => {
      const response = await apiClient.delete(`/productos-vendidos-cafeteria?periodo=${periodo}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos-vendidos-cafeteria-periodos'] });
      queryClient.invalidateQueries({ queryKey: ['productos-vendidos-cafeteria'] });
      queryClient.invalidateQueries({ queryKey: ['cortesias-productos-vendidos-cafeteria'] });
    },
  });
}

export function useExportarProductosVendidosCafeteria() {
  return useMutation({
    mutationFn: async (params: { periodo: string; grupo?: string }): Promise<Blob> => {
      const response = await apiClient.get<Blob>('/productos-vendidos-cafeteria/export', {
        params: { periodo: params.periodo, grupo: params.grupo || undefined },
        responseType: 'blob',
      });
      return response.data;
    },
  });
}

export interface FilaCortesiaProductoVendidoCafeteria {
  nombre_producto: string;
  grupo: string;
  subtotal: number | null;
  impuesto: number | null;
  ingreso_real: number | null;
  monto_cortesia: number | null;
  cantidad_cortesia: number | null;
}

export interface CortesiasProductosVendidosCafeteriaResponse {
  periodo: string;
  total_monto_cortesia: number;
  total_cantidad_cortesia: number;
  productos_con_cortesia: number;
  comparacion: FilaCortesiaProductoVendidoCafeteria[];
}

export function useCortesiasProductosVendidosCafeteria(periodo: string | null) {
  return useQuery({
    queryKey: ['cortesias-productos-vendidos-cafeteria', periodo],
    enabled: !!periodo,
    queryFn: async (): Promise<CortesiasProductosVendidosCafeteriaResponse> => {
      const response = await apiClient.get<CortesiasProductosVendidosCafeteriaResponse>(
        `/productos-vendidos-cafeteria/comparar-iva?periodo=${periodo}`,
      );
      return response.data;
    },
  });
}

// ── Productos Vendidos — Carreta de Mariscos (mismo criterio que
// Restaurante, con categoria_tipo pero sin seccion_menu: el Catálogo de
// Carreta de Mariscos no lo tiene) ──────────────────────────────────

export interface ProductoVendidoCarretaMariscos {
  id: number;
  periodo: string;
  punto_venta: string;
  grupo: string;
  nombre_producto: string;
  costo: number | null;
  precio_venta: number | null;
  cantidad: number | null;
  total_costo: number | null;
  descuento: number | null;
  subtotal: number | null;
  impuesto: number | null;
  total: number | null;
  categoria_tipo: string | null;
  producto_catalogo_encontrado: boolean;
  costo_catalogo: number | null;
  precio_venta_catalogo: number | null;
}

export interface GuardarProductosVendidosCarretaMariscosResponse {
  periodo: string;
  total: number;
  por_grupo: Record<string, number>;
  por_categoria_tipo: Record<string, number>;
  sin_match_catalogo: number;
}

export function useSubirProductosVendidosCarretaMariscos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      file: File;
      periodo: string;
      confirmarReemplazo?: boolean;
    }): Promise<GuardarProductosVendidosCarretaMariscosResponse | RequiereConfirmacionProductosVendidos> => {
      const formData = new FormData();
      formData.append('archivo', params.file);
      formData.append('periodo', params.periodo);
      formData.append('confirmar_reemplazo', String(params.confirmarReemplazo ?? false));
      const response = await apiClient.post<GuardarProductosVendidosCarretaMariscosResponse | RequiereConfirmacionProductosVendidos>(
        '/productos-vendidos-carreta-mariscos/upload',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return response.data;
    },
    onSuccess: (data, variables) => {
      if (!('requiere_confirmacion' in data)) {
        queryClient.invalidateQueries({ queryKey: ['productos-vendidos-carreta-mariscos-periodos'] });
        queryClient.invalidateQueries({ queryKey: ['productos-vendidos-carreta-mariscos', variables.periodo] });
        queryClient.invalidateQueries({ queryKey: ['cortesias-productos-vendidos-carreta-mariscos', variables.periodo] });
      }
    },
  });
}

export function usePeriodosProductosVendidosCarretaMariscos() {
  return useQuery({
    queryKey: ['productos-vendidos-carreta-mariscos-periodos'],
    queryFn: async (): Promise<{ periodos: { periodo: string; total: number }[] }> => {
      const response = await apiClient.get<{ periodos: { periodo: string; total: number }[] }>(
        '/productos-vendidos-carreta-mariscos/periodos',
      );
      return response.data;
    },
  });
}

export function useProductosVendidosCarretaMariscos(periodo: string | null) {
  return useQuery({
    queryKey: ['productos-vendidos-carreta-mariscos', periodo],
    enabled: !!periodo,
    queryFn: async (): Promise<{ total: number; productos: ProductoVendidoCarretaMariscos[] }> => {
      const response = await apiClient.get<{ total: number; productos: ProductoVendidoCarretaMariscos[] }>(
        `/productos-vendidos-carreta-mariscos?periodo=${periodo}`,
      );
      return response.data;
    },
  });
}

export function useEliminarProductosVendidosCarretaMariscos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (periodo: string) => {
      const response = await apiClient.delete(`/productos-vendidos-carreta-mariscos?periodo=${periodo}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productos-vendidos-carreta-mariscos-periodos'] });
      queryClient.invalidateQueries({ queryKey: ['productos-vendidos-carreta-mariscos'] });
      queryClient.invalidateQueries({ queryKey: ['cortesias-productos-vendidos-carreta-mariscos'] });
    },
  });
}

export function useExportarProductosVendidosCarretaMariscos() {
  return useMutation({
    mutationFn: async (params: { periodo: string; grupo?: string }): Promise<Blob> => {
      const response = await apiClient.get<Blob>('/productos-vendidos-carreta-mariscos/export', {
        params: { periodo: params.periodo, grupo: params.grupo || undefined },
        responseType: 'blob',
      });
      return response.data;
    },
  });
}

export interface FilaCortesiaProductoVendidoCarretaMariscos {
  nombre_producto: string;
  grupo: string;
  categoria_tipo: string | null;
  subtotal: number | null;
  impuesto: number | null;
  ingreso_real: number | null;
  monto_cortesia: number | null;
  cantidad_cortesia: number | null;
}

export interface CortesiasProductosVendidosCarretaMariscosResponse {
  periodo: string;
  total_monto_cortesia: number;
  total_cantidad_cortesia: number;
  productos_con_cortesia: number;
  comparacion: FilaCortesiaProductoVendidoCarretaMariscos[];
}

export function useCortesiasProductosVendidosCarretaMariscos(periodo: string | null) {
  return useQuery({
    queryKey: ['cortesias-productos-vendidos-carreta-mariscos', periodo],
    enabled: !!periodo,
    queryFn: async (): Promise<CortesiasProductosVendidosCarretaMariscosResponse> => {
      const response = await apiClient.get<CortesiasProductosVendidosCarretaMariscosResponse>(
        `/productos-vendidos-carreta-mariscos/comparar-iva?periodo=${periodo}`,
      );
      return response.data;
    },
  });
}

// ── Catálogo de Productos — Cafetería (módulo independiente del de
// restaurante: su propia tabla/servicio, sin categoria_tipo/seccion_menu
// todavía) ──────────────────────────────────────────────────────────

export interface ProductoCatalogoCafeteria {
  id: number;
  punto_venta: string;
  grupo: string;
  nombre_producto: string;
  tipo: string | null;
  costo: number | null;
  precio_venta: number | null;
}

export interface GuardarCatalogoCafeteriaResponse {
  total: number;
  por_grupo: Record<string, number>;
}

export function useGuardarCatalogoProductosCafeteria() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      file: File;
      confirmarReemplazo?: boolean;
    }): Promise<GuardarCatalogoCafeteriaResponse | RequiereConfirmacionCatalogoProductos> => {
      const formData = new FormData();
      formData.append('archivo', params.file);
      formData.append('confirmar_reemplazo', String(params.confirmarReemplazo ?? false));
      const response = await apiClient.post<GuardarCatalogoCafeteriaResponse | RequiereConfirmacionCatalogoProductos>(
        '/catalogo-productos-cafeteria/upload',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return response.data;
    },
    onSuccess: (data) => {
      if (!('requiere_confirmacion' in data)) {
        queryClient.invalidateQueries({ queryKey: ['catalogo-productos-cafeteria'] });
      }
    },
  });
}

export function useCatalogoProductosCafeteria(filtros: { grupo?: string | null } = {}) {
  return useQuery({
    queryKey: ['catalogo-productos-cafeteria', filtros.grupo ?? null],
    queryFn: async (): Promise<{ total: number; productos: ProductoCatalogoCafeteria[] }> => {
      const params = new URLSearchParams();
      if (filtros.grupo) params.set('grupo', filtros.grupo);
      const response = await apiClient.get<{ total: number; productos: ProductoCatalogoCafeteria[] }>(
        `/catalogo-productos-cafeteria?${params}`,
      );
      return response.data;
    },
  });
}

// ── Costeo de Recetas ─────────────────────────────────────────────

export interface ConfiguracionCosteo {
  iva_factor: number;
  descuento_pct: number;
  pct_costo_objetivo: number;
  incremento_default: number;
}

export interface IncrementoGrupo {
  grupo: string;
  pct_incremento: number;
}

export interface ProductoCosteo {
  id: number;
  grupo: string;
  nombre_producto: string;
  tipo: string | null;
  categoria_tipo: string;
  costo: number | null;
  precio_venta: number | null;
  pct_costo: number | null;
  pct_costo_desc5: number | null;
  precio_sugerido: number | null;
  pct_incremento_resultante: number | null;
  pct_costo_sugerido: number | null;
  pct_costo_sugerido_desc5: number | null;
  estado: 'OK' | 'REQ AJUSTE' | null;
  precio_sugerido_editado: boolean;
}

export interface ResumenGrupoCosteo {
  grupo: string;
  pct_costo_promedio: number;
  estado: 'OK' | 'REQ AJUSTE';
}

export interface CosteoProductosResponse {
  total: number;
  productos: ProductoCosteo[];
  resumen_por_grupo: ResumenGrupoCosteo[];
  pct_costo_global: number | null;
  configuracion: ConfiguracionCosteo;
}

export function useConfiguracionCosteo() {
  return useQuery({
    queryKey: ['costeo-configuracion'],
    queryFn: async (): Promise<{ configuracion: ConfiguracionCosteo; incrementos_por_grupo: IncrementoGrupo[] }> => {
      const response = await apiClient.get('/costeo/configuracion');
      return response.data;
    },
  });
}

export function useActualizarConfiguracionCosteo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (cambios: Partial<ConfiguracionCosteo>) => {
      const response = await apiClient.put('/costeo/configuracion', cambios);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['costeo-configuracion'] });
      queryClient.invalidateQueries({ queryKey: ['costeo-productos'] });
    },
  });
}

export function useActualizarIncrementoGrupo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { grupo: string; pctIncremento: number }) => {
      const response = await apiClient.put('/costeo/incremento-grupo', {
        grupo: params.grupo,
        pct_incremento: params.pctIncremento,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['costeo-configuracion'] });
      queryClient.invalidateQueries({ queryKey: ['costeo-productos'] });
    },
  });
}

export function useCosteoProductos(
  filtros: { seccionMenu?: string | null; grupo?: string | null; categoriaTipo?: string | null } = {},
) {
  return useQuery({
    queryKey: ['costeo-productos', filtros.seccionMenu ?? null, filtros.grupo ?? null, filtros.categoriaTipo ?? null],
    queryFn: async (): Promise<CosteoProductosResponse> => {
      const params = new URLSearchParams();
      if (filtros.seccionMenu) params.set('seccion_menu', filtros.seccionMenu);
      if (filtros.grupo) params.set('grupo', filtros.grupo);
      if (filtros.categoriaTipo) params.set('categoria_tipo', filtros.categoriaTipo);
      const response = await apiClient.get<CosteoProductosResponse>(`/costeo/productos?${params}`);
      return response.data;
    },
  });
}

export function useActualizarPrecioSugerido() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { nombreProducto: string; precioSugerido: number }) => {
      const response = await apiClient.put('/costeo/precio-sugerido', {
        nombre_producto: params.nombreProducto,
        precio_sugerido: params.precioSugerido,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['costeo-productos'] });
    },
  });
}

export function useEliminarPrecioSugerido() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (nombreProducto: string) => {
      const response = await apiClient.delete('/costeo/precio-sugerido', { params: { nombre_producto: nombreProducto } });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['costeo-productos'] });
    },
  });
}

export function useExportarCosteo() {
  return useMutation({
    mutationFn: async (params: { seccionMenu: string; categoriaTipo?: string | null }): Promise<Blob> => {
      const response = await apiClient.get<Blob>('/costeo/export', {
        params: { seccion_menu: params.seccionMenu, categoria_tipo: params.categoriaTipo || undefined },
        responseType: 'blob',
      });
      return response.data;
    },
  });
}

export function useExportarCosteoCompleto() {
  return useMutation({
    mutationFn: async (secciones: { seccionMenu: string; categoriaTipo?: string | null }[]): Promise<Blob> => {
      const params = new URLSearchParams();
      for (const sec of secciones) {
        params.append('secciones', sec.categoriaTipo ? `${sec.seccionMenu}:${sec.categoriaTipo}` : sec.seccionMenu);
      }
      const response = await apiClient.get<Blob>(`/costeo/export-todo?${params}`, { responseType: 'blob' });
      return response.data;
    },
  });
}

// ── Costeo de Recetas — Cafetería (módulo independiente: sus propias
// tablas de configuración, sin seccion_menu/categoria_tipo — un solo
// catálogo plano navegado por grupo). Reusa los tipos ya genéricos
// ConfiguracionCosteo/IncrementoGrupo (mismo shape) del restaurante. ──────

export interface ProductoCosteoCafeteria {
  id: number;
  grupo: string;
  nombre_producto: string;
  tipo: string | null;
  costo: number | null;
  precio_venta: number | null;
  pct_costo: number | null;
  pct_costo_desc5: number | null;
  precio_sugerido: number | null;
  pct_incremento_resultante: number | null;
  pct_costo_sugerido: number | null;
  pct_costo_sugerido_desc5: number | null;
  estado: 'OK' | 'REQ AJUSTE' | null;
  precio_sugerido_editado: boolean;
}

export interface CosteoProductosResponseCafeteria {
  total: number;
  productos: ProductoCosteoCafeteria[];
  resumen_por_grupo: ResumenGrupoCosteo[];
  pct_costo_global: number | null;
  configuracion: ConfiguracionCosteo;
}

export function useConfiguracionCosteoCafeteria() {
  return useQuery({
    queryKey: ['costeo-cafeteria-configuracion'],
    queryFn: async (): Promise<{ configuracion: ConfiguracionCosteo; incrementos_por_grupo: IncrementoGrupo[] }> => {
      const response = await apiClient.get('/costeo-cafeteria/configuracion');
      return response.data;
    },
  });
}

export function useActualizarConfiguracionCosteoCafeteria() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (cambios: Partial<ConfiguracionCosteo>) => {
      const response = await apiClient.put('/costeo-cafeteria/configuracion', cambios);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['costeo-cafeteria-configuracion'] });
      queryClient.invalidateQueries({ queryKey: ['costeo-cafeteria-productos'] });
    },
  });
}

export function useActualizarIncrementoGrupoCafeteria() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { grupo: string; pctIncremento: number }) => {
      const response = await apiClient.put('/costeo-cafeteria/incremento-grupo', {
        grupo: params.grupo,
        pct_incremento: params.pctIncremento,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['costeo-cafeteria-configuracion'] });
      queryClient.invalidateQueries({ queryKey: ['costeo-cafeteria-productos'] });
    },
  });
}

export function useCosteoProductosCafeteria(filtros: { grupo?: string | null } = {}) {
  return useQuery({
    queryKey: ['costeo-cafeteria-productos', filtros.grupo ?? null],
    queryFn: async (): Promise<CosteoProductosResponseCafeteria> => {
      const params = new URLSearchParams();
      if (filtros.grupo) params.set('grupo', filtros.grupo);
      const response = await apiClient.get<CosteoProductosResponseCafeteria>(`/costeo-cafeteria/productos?${params}`);
      return response.data;
    },
  });
}

export function useActualizarPrecioSugeridoCafeteria() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { nombreProducto: string; precioSugerido: number }) => {
      const response = await apiClient.put('/costeo-cafeteria/precio-sugerido', {
        nombre_producto: params.nombreProducto,
        precio_sugerido: params.precioSugerido,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['costeo-cafeteria-productos'] });
    },
  });
}

export function useEliminarPrecioSugeridoCafeteria() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (nombreProducto: string) => {
      const response = await apiClient.delete('/costeo-cafeteria/precio-sugerido', {
        params: { nombre_producto: nombreProducto },
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['costeo-cafeteria-productos'] });
    },
  });
}

export function useExportarCosteoCafeteria() {
  return useMutation({
    mutationFn: async (): Promise<Blob> => {
      const response = await apiClient.get<Blob>('/costeo-cafeteria/export', { responseType: 'blob' });
      return response.data;
    },
  });
}

// ── Catálogo de Productos — La Carreta de Mariscos (módulo independiente,
// mismo criterio que Cafetería) ──────────────────────────────────────

export interface ProductoCatalogoCarretaMariscos {
  id: number;
  punto_venta: string;
  grupo: string;
  nombre_producto: string;
  tipo: string | null;
  categoria_tipo: string;
  costo: number | null;
  precio_venta: number | null;
}

export interface GuardarCatalogoCarretaMariscosResponse {
  total: number;
  por_grupo: Record<string, number>;
}

export function useGuardarCatalogoProductosCarretaMariscos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      file: File;
      confirmarReemplazo?: boolean;
    }): Promise<GuardarCatalogoCarretaMariscosResponse | RequiereConfirmacionCatalogoProductos> => {
      const formData = new FormData();
      formData.append('archivo', params.file);
      formData.append('confirmar_reemplazo', String(params.confirmarReemplazo ?? false));
      const response = await apiClient.post<GuardarCatalogoCarretaMariscosResponse | RequiereConfirmacionCatalogoProductos>(
        '/catalogo-productos-carreta-mariscos/upload',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return response.data;
    },
    onSuccess: (data) => {
      if (!('requiere_confirmacion' in data)) {
        queryClient.invalidateQueries({ queryKey: ['catalogo-productos-carreta-mariscos'] });
      }
    },
  });
}

export function useCatalogoProductosCarretaMariscos(
  filtros: { grupo?: string | null; categoriaTipo?: string | null } = {},
) {
  return useQuery({
    queryKey: ['catalogo-productos-carreta-mariscos', filtros.grupo ?? null, filtros.categoriaTipo ?? null],
    queryFn: async (): Promise<{ total: number; productos: ProductoCatalogoCarretaMariscos[] }> => {
      const params = new URLSearchParams();
      if (filtros.grupo) params.set('grupo', filtros.grupo);
      if (filtros.categoriaTipo) params.set('categoria_tipo', filtros.categoriaTipo);
      const response = await apiClient.get<{ total: number; productos: ProductoCatalogoCarretaMariscos[] }>(
        `/catalogo-productos-carreta-mariscos?${params}`,
      );
      return response.data;
    },
  });
}

// ── Costeo de Recetas — La Carreta de Mariscos (módulo independiente, mismo
// criterio que Cafetería) ─────────────────────────────────────────────

export interface ProductoCosteoCarretaMariscos {
  id: number;
  grupo: string;
  nombre_producto: string;
  tipo: string | null;
  categoria_tipo: string;
  costo: number | null;
  precio_venta: number | null;
  pct_costo: number | null;
  pct_costo_desc5: number | null;
  precio_sugerido: number | null;
  pct_incremento_resultante: number | null;
  pct_costo_sugerido: number | null;
  pct_costo_sugerido_desc5: number | null;
  estado: 'OK' | 'REQ AJUSTE' | null;
  precio_sugerido_editado: boolean;
}

export interface CosteoProductosResponseCarretaMariscos {
  total: number;
  productos: ProductoCosteoCarretaMariscos[];
  resumen_por_grupo: ResumenGrupoCosteo[];
  pct_costo_global: number | null;
  configuracion: ConfiguracionCosteo;
}

export function useConfiguracionCosteoCarretaMariscos() {
  return useQuery({
    queryKey: ['costeo-carreta-mariscos-configuracion'],
    queryFn: async (): Promise<{ configuracion: ConfiguracionCosteo; incrementos_por_grupo: IncrementoGrupo[] }> => {
      const response = await apiClient.get('/costeo-carreta-mariscos/configuracion');
      return response.data;
    },
  });
}

export function useActualizarConfiguracionCosteoCarretaMariscos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (cambios: Partial<ConfiguracionCosteo>) => {
      const response = await apiClient.put('/costeo-carreta-mariscos/configuracion', cambios);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['costeo-carreta-mariscos-configuracion'] });
      queryClient.invalidateQueries({ queryKey: ['costeo-carreta-mariscos-productos'] });
    },
  });
}

export function useActualizarIncrementoGrupoCarretaMariscos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { grupo: string; pctIncremento: number }) => {
      const response = await apiClient.put('/costeo-carreta-mariscos/incremento-grupo', {
        grupo: params.grupo,
        pct_incremento: params.pctIncremento,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['costeo-carreta-mariscos-configuracion'] });
      queryClient.invalidateQueries({ queryKey: ['costeo-carreta-mariscos-productos'] });
    },
  });
}

export function useCosteoProductosCarretaMariscos(
  filtros: { grupo?: string | null; categoriaTipo?: string | null } = {},
) {
  return useQuery({
    queryKey: ['costeo-carreta-mariscos-productos', filtros.grupo ?? null, filtros.categoriaTipo ?? null],
    queryFn: async (): Promise<CosteoProductosResponseCarretaMariscos> => {
      const params = new URLSearchParams();
      if (filtros.grupo) params.set('grupo', filtros.grupo);
      if (filtros.categoriaTipo) params.set('categoria_tipo', filtros.categoriaTipo);
      const response = await apiClient.get<CosteoProductosResponseCarretaMariscos>(
        `/costeo-carreta-mariscos/productos?${params}`,
      );
      return response.data;
    },
  });
}

export function useActualizarPrecioSugeridoCarretaMariscos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { nombreProducto: string; precioSugerido: number }) => {
      const response = await apiClient.put('/costeo-carreta-mariscos/precio-sugerido', {
        nombre_producto: params.nombreProducto,
        precio_sugerido: params.precioSugerido,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['costeo-carreta-mariscos-productos'] });
    },
  });
}

export function useEliminarPrecioSugeridoCarretaMariscos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (nombreProducto: string) => {
      const response = await apiClient.delete('/costeo-carreta-mariscos/precio-sugerido', {
        params: { nombre_producto: nombreProducto },
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['costeo-carreta-mariscos-productos'] });
    },
  });
}

export function useExportarCosteoCarretaMariscos() {
  return useMutation({
    mutationFn: async (categoriaTipo?: string | null): Promise<Blob> => {
      const response = await apiClient.get<Blob>('/costeo-carreta-mariscos/export', {
        params: { categoria_tipo: categoriaTipo || undefined },
        responseType: 'blob',
      });
      return response.data;
    },
  });
}

// ── Amarre de Costo de Ventas (Inventarios) — módulo 5, independiente.
// Cada periodo (YYYY-MM) se llena subiendo 12 archivos crudos de Novohit
// (uno por tipo), en cualquier orden; los 3 reportes finales se arman en
// el backend a partir de lo ya cargado. ──────────────────────────────────

export const TIPOS_ARCHIVO_AMARRE_COSTO = [
  { tipo: 'balanza', grupo: 'Balanza', etiqueta: 'Balanza con auxiliares' },
  { tipo: 'conteo-alm-gral', grupo: 'Conteos Físicos', etiqueta: 'Almacén General' },
  { tipo: 'conteo-tienda', grupo: 'Conteos Físicos', etiqueta: 'Tienda La Hacienda' },
  { tipo: 'conteo-rest-bar', grupo: 'Conteos Físicos', etiqueta: 'Restaurant-Bar' },
  { tipo: 'conteo-cafeteria', grupo: 'Conteos Físicos', etiqueta: 'Cafetería' },
  { tipo: 'salidas-alm-gral', grupo: 'Salidas', etiqueta: 'Salidas Almacén General' },
  { tipo: 'salidas-mtto', grupo: 'Salidas', etiqueta: 'Salidas Mantenimiento' },
  { tipo: 'entradas-alm-gral', grupo: 'Entradas', etiqueta: 'Entradas Almacén General' },
  { tipo: 'entradas-tienda', grupo: 'Entradas', etiqueta: 'Entradas Tienda' },
  { tipo: 'entradas-mtto', grupo: 'Entradas', etiqueta: 'Entradas Mantenimiento' },
  { tipo: 'entradas-cafeteria', grupo: 'Entradas', etiqueta: 'Entradas Cafetería' },
  { tipo: 'entradas-rest', grupo: 'Entradas', etiqueta: 'Entradas Restaurant-Bar' },
  // Opcional: no bloquea /export si falta (no forma parte de los 12
  // archivos requeridos del periodo) — solo sirve para la comparación de
  // la pestaña "Comparación Balanza 2".
  { tipo: 'balanza-2', grupo: 'Balanza', etiqueta: 'Balanza 2 (para comparar)' },
] as const;

export type TipoArchivoAmarreCosto = (typeof TIPOS_ARCHIVO_AMARRE_COSTO)[number]['tipo'];

export interface PeriodoAmarreCosto {
  periodo: string;
  archivos_cargados: string[];
  total_archivos: number;
  actualizado_en: string;
}

export function useAmarreCostoPeriodos() {
  return useQuery({
    queryKey: ['amarre-costo-periodos'],
    queryFn: async (): Promise<{ periodos: PeriodoAmarreCosto[] }> => {
      const response = await apiClient.get('/amarre-costo/periodos');
      return response.data;
    },
  });
}

export function useAmarreCostoUpload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { periodo: string; tipo: TipoArchivoAmarreCosto; archivo: File }) => {
      const formData = new FormData();
      formData.append('archivo', params.archivo);
      const response = await apiClient.post(
        `/amarre-costo/${params.periodo}/upload/${params.tipo}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['amarre-costo-periodos'] });
      queryClient.invalidateQueries({ queryKey: ['amarre-costo-detalle', variables.periodo] });
      queryClient.invalidateQueries({ queryKey: ['amarre-costo-comparacion-balanza-2', variables.periodo] });
    },
  });
}

export interface LineaAmarreCosto {
  almacen: string;
  inventario_inicial: number;
  entradas: number;
  salidas_traspasos: number;
  inventario_en_libros: number;
  inventario_final: number | null;
  diferencia_costo_ventas: number | null;
  costo_contabilizado: number | null;
  diferencia_a_contabilizar: number | null;
}

export interface RenglonConsignacion {
  id: number;
  concepto: string;
  monto: number;
}

export interface AmarreCostoDetalle {
  periodo: string;
  archivos_cargados: string[];
  amarre_costo: {
    lineas: LineaAmarreCosto[];
    totales: { inventario_inicial: number; entradas: number; inventario_final: number };
    consignacion: { renglones: RenglonConsignacion[]; total: number };
  };
  datos_entrysal: {
    despachos: { almacen_general_a_gasto: number; mantenimiento: number; total: number };
    despachos_a_centros_de_costo: Record<string, number | null> & { total: number };
    entradas: Record<string, { subtotal: number; descuento: number; iva: number; total: number }>;
  };
  resumen_inv: {
    almacenes: { almacen: string; saldo_contable: number; saldo_real: number; diferencia: number }[];
    huecos: { fichas_lavanderia: number | null; mercancia_consignacion: number };
    totales: { saldo_contable: number; saldo_real: number; diferencia: number };
  };
  huecos_manuales: {
    inv_final_mantenimiento: number | null;
    entrysal_cafeteria_bebidas: number | null;
    resumen_lavanderia: number | null;
  };
}

export function useAmarreCostoDetalle(periodo: string | null) {
  return useQuery({
    queryKey: ['amarre-costo-detalle', periodo],
    queryFn: async (): Promise<AmarreCostoDetalle> => {
      const response = await apiClient.get(`/amarre-costo/${periodo}`);
      return response.data;
    },
    enabled: !!periodo,
  });
}

export function useAmarreCostoManual() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      periodo: string;
      campos: Partial<Record<'inv_final_mantenimiento' | 'entrysal_cafeteria_bebidas' | 'resumen_lavanderia', number | null>>;
    }) => {
      const response = await apiClient.patch(`/amarre-costo/${params.periodo}/manual`, params.campos);
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['amarre-costo-detalle', variables.periodo] });
    },
  });
}

export function useAmarreCostoAgregarConsignacion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { periodo: string; concepto: string; monto: number }) => {
      const response = await apiClient.post(`/amarre-costo/${params.periodo}/consignacion`, {
        concepto: params.concepto,
        monto: params.monto,
      });
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['amarre-costo-detalle', variables.periodo] });
    },
  });
}

export function useAmarreCostoEliminarConsignacion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { periodo: string; renglonId: number }) => {
      const response = await apiClient.delete(`/amarre-costo/${params.periodo}/consignacion/${params.renglonId}`);
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['amarre-costo-detalle', variables.periodo] });
    },
  });
}

export function useAmarreCostoExport() {
  return useMutation({
    mutationFn: async (periodo: string): Promise<Blob> => {
      const response = await apiClient.get<Blob>(`/amarre-costo/${periodo}/export`, { responseType: 'blob' });
      return response.data;
    },
  });
}

export interface RenglonComparacionBalanza2 {
  codigo: string;
  nombre: string;
  saldo_real: number;
  balanza_2: number;
  diferencia: number;
  cuadra: boolean;
}

export interface ComparacionBalanza2 {
  disponible: boolean;
  archivo?: string;
  actualizado_en?: string;
  renglones: RenglonComparacionBalanza2[];
}

export function useComparacionBalanza2(periodo: string | null) {
  return useQuery({
    queryKey: ['amarre-costo-comparacion-balanza-2', periodo],
    queryFn: async (): Promise<ComparacionBalanza2> => {
      const response = await apiClient.get(`/amarre-costo/${periodo}/comparacion-balanza-2`);
      return response.data;
    },
    enabled: !!periodo,
  });
}

export function useAmarreCostoEliminarPeriodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (periodo: string) => {
      const response = await apiClient.delete(`/amarre-costo/${periodo}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['amarre-costo-periodos'] });
    },
  });
}

// ── Saldo Cuenta Huésped (RCP170 de Novohit, dentro de Pagos de Recepción) ──

export interface FilaSaldoCuentaHuesped {
  id: number;
  orden: number;
  tipo: 'habitacion' | 'varios';
  habitacion: string;
  codigo: string;
  huesped: string;
  adultos_ninos: string;
  llegada: string;
  salida: string;
  tarifa: number;
  garantia: string;
  saldo_habitacion: number;
  es_primera_linea: boolean;
  agencia: string;
  linea_nombre: string;
  monto: number;
  total: number;
  gravado: number;
  tasa0: number;
  subtotal: number;
  iva: number;
  propina: number;
  ieps: number;
  ish: number;
  total2: number;
  dif: number;
}

export interface SaldoCuentaHuespedPeriodo {
  periodo: string;
  filas: FilaSaldoCuentaHuesped[];
  totales: Record<'monto' | 'gravado' | 'tasa0' | 'subtotal' | 'iva' | 'propina' | 'ieps' | 'ish' | 'total2' | 'dif', number>;
}

export interface UploadSaldoCuentaHuespedResponse extends SaldoCuentaHuespedPeriodo {
  origen: 'rcp170' | 'excel_editado';
  excluidas_sin_garantia: string[];
  capturas_conservadas: number;
  saldo_total_reporte: number | null;
}

/** El Excel trae otro periodo en A1: el backend no guardó nada hasta confirmar. */
export interface AvisoPeriodoSaldoCuentaHuesped {
  requiere_confirmacion: true;
  periodo_archivo: string;
  periodo_seleccionado: string;
}

export function useSaldoCuentaHuesped(periodo: string | null) {
  return useQuery({
    queryKey: ['saldo-cuenta-huesped', periodo],
    enabled: !!periodo,
    queryFn: async (): Promise<SaldoCuentaHuespedPeriodo> => {
      const response = await apiClient.get<SaldoCuentaHuespedPeriodo>(`/saldo-cuenta-huesped/${periodo}`);
      return response.data;
    },
  });
}

export function useUploadSaldoCuentaHuesped() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      periodo: string;
      file: File;
      confirmarPeriodo?: boolean;
    }): Promise<UploadSaldoCuentaHuespedResponse | AvisoPeriodoSaldoCuentaHuesped> => {
      const formData = new FormData();
      formData.append('file', params.file);
      const response = await apiClient.post<UploadSaldoCuentaHuespedResponse | AvisoPeriodoSaldoCuentaHuesped>(
        `/saldo-cuenta-huesped/${params.periodo}/upload`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          params: params.confirmarPeriodo ? { confirmar_periodo: true } : undefined,
        },
      );
      return response.data;
    },
    onSuccess: (data, variables) => {
      if (!('requiere_confirmacion' in data)) {
        queryClient.invalidateQueries({ queryKey: ['saldo-cuenta-huesped', variables.periodo] });
      }
    },
  });
}

export function useActualizarCapturaSaldoCuentaHuesped() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      periodo: string;
      lineaId: number;
      campos: Partial<Record<'gravado' | 'tasa0' | 'subtotal' | 'iva' | 'propina' | 'ieps' | 'ish', number>>;
    }): Promise<FilaSaldoCuentaHuesped> => {
      const response = await apiClient.patch<FilaSaldoCuentaHuesped>(
        `/saldo-cuenta-huesped/${params.periodo}/lineas/${params.lineaId}`,
        params.campos,
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['saldo-cuenta-huesped', variables.periodo] });
    },
  });
}

export function useEliminarSaldoCuentaHuesped() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (periodo: string) => {
      const response = await apiClient.delete(`/saldo-cuenta-huesped/${periodo}`);
      return response.data;
    },
    onSuccess: (_data, periodo) => {
      queryClient.invalidateQueries({ queryKey: ['saldo-cuenta-huesped', periodo] });
    },
  });
}

export function useExportarSaldoCuentaHuesped() {
  return useMutation({
    mutationFn: async (periodo: string): Promise<Blob> => {
      const response = await apiClient.get<Blob>(`/saldo-cuenta-huesped/${periodo}/export`, { responseType: 'blob' });
      return response.data;
    },
  });
}

// ── Reporte de producción y ventas de Carnes y Mariscos ────────────────

import type {
  CapturaRenglonProduccionBody,
  CruceReporteProduccion,
  DiaReporteProduccion,
  HojaReporteProduccion,
  InventarioBruto,
  PesajesDia,
  RenglonProduccion,
} from '../types';

// Toda mutación invalida el catálogo, el día capturado, la lista de fechas y el cruce.
function invalidarReporteProduccion(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['reporte-produccion'] });
}

export function useCatalogoReporteProduccion(hoja?: HojaReporteProduccion, incluirInactivos = false) {
  return useQuery({
    queryKey: ['reporte-produccion', 'catalogo', hoja ?? null, incluirInactivos],
    queryFn: async (): Promise<RenglonProduccion[]> => {
      const response = await apiClient.get<RenglonProduccion[]>('/reporte-produccion/catalogo', {
        params: { hoja, incluir_inactivos: incluirInactivos },
      });
      return response.data;
    },
  });
}

export function useSembrarCatalogoReporteProduccion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ creados: number; rendimientos: number; precios: number }> =>
      (await apiClient.post('/reporte-produccion/catalogo/sembrar')).data,
    onSuccess: () => invalidarReporteProduccion(queryClient),
  });
}

export function useCrearRenglonProduccion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      hoja: HojaReporteProduccion;
      seccion: string;
      producto: string;
      presentacion?: string | null;
      gramaje?: string | null;
      unidad: string;
      gramaje_kg?: number | null;
      prueba_bruto_kg?: number | null;
      prueba_limpio_kg?: number | null;
      es_crudo?: boolean | null;
      es_limpio?: boolean | null;
    }) => (await apiClient.post<RenglonProduccion>('/reporte-produccion/catalogo', body)).data,
    onSuccess: () => invalidarReporteProduccion(queryClient),
  });
}

export function useEditarRenglonProduccion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: number } & Partial<Omit<RenglonProduccion, 'id' | 'hoja'>>) =>
      (await apiClient.patch<RenglonProduccion>(`/reporte-produccion/catalogo/${id}`, body)).data,
    onSuccess: () => invalidarReporteProduccion(queryClient),
  });
}

export function useDesactivarRenglonProduccion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await apiClient.delete(`/reporte-produccion/catalogo/${id}`)).data,
    onSuccess: () => invalidarReporteProduccion(queryClient),
  });
}

export function useFechasReporteProduccion() {
  return useQuery({
    queryKey: ['reporte-produccion', 'fechas'],
    queryFn: async (): Promise<{ fecha: string; total: number }[]> =>
      (await apiClient.get('/reporte-produccion/fechas')).data,
  });
}

export function useDiaReporteProduccion(fecha: string | null, hoja: HojaReporteProduccion) {
  return useQuery({
    queryKey: ['reporte-produccion', 'dia', fecha, hoja],
    enabled: !!fecha,
    queryFn: async (): Promise<DiaReporteProduccion> =>
      (await apiClient.get<DiaReporteProduccion>('/reporte-produccion', { params: { fecha, hoja } })).data,
  });
}

export function useCruceReporteProduccion(fecha: string | null) {
  return useQuery({
    queryKey: ['reporte-produccion', 'cruce', fecha],
    enabled: !!fecha,
    queryFn: async (): Promise<CruceReporteProduccion> =>
      (await apiClient.get<CruceReporteProduccion>('/reporte-produccion/cruce', { params: { fecha } })).data,
  });
}

export function useGuardarCapturaReporteProduccion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      fecha: string;
      renglones: CapturaRenglonProduccionBody[];
      completar_hoja?: HojaReporteProduccion;
    }) =>
      (await apiClient.put<{ guardados: number; borrados: number; completados: number }>('/reporte-produccion/captura', body))
        .data,
    onSuccess: () => invalidarReporteProduccion(queryClient),
  });
}

export function useGuardarDiaReporteProduccion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      fecha: string;
      responsable_porcionador?: string | null;
      responsable_cocina?: string | null;
      notas?: string | null;
    }) => (await apiClient.put('/reporte-produccion/dia', body)).data,
    onSuccess: () => invalidarReporteProduccion(queryClient),
  });
}

export function useBorrarDiaReporteProduccion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fecha: string): Promise<{ borrados: number }> =>
      (await apiClient.delete('/reporte-produccion/dia', { params: { fecha } })).data,
    onSuccess: () => invalidarReporteProduccion(queryClient),
  });
}

// base 'existencia' = todo lo que hay; 'produccion' = solo "Entradas y producción" del día (lo que hizo el porcionador).
export function useInventarioBruto(fecha: string | null, hoja: HojaReporteProduccion, base: 'existencia' | 'produccion' = 'existencia') {
  return useQuery({
    queryKey: ['reporte-produccion', 'inventario-bruto', fecha, hoja, base],
    enabled: !!fecha,
    queryFn: async (): Promise<InventarioBruto> =>
      (await apiClient.get<InventarioBruto>('/reporte-produccion/inventario-bruto', { params: { fecha, hoja, base } })).data,
  });
}

export function usePesajesDia(fecha: string | null) {
  return useQuery({
    queryKey: ['reporte-produccion', 'pesajes', fecha],
    enabled: !!fecha,
    queryFn: async (): Promise<PesajesDia> =>
      (await apiClient.get<PesajesDia>('/reporte-produccion/pesajes', { params: { fecha } })).data,
  });
}

// Todo cambio de pesaje invalida 'reporte-produccion': el factor mueve el inventario en bruto y el control.
export function useCrearPesaje() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { fecha: string; producto: string; bruto_kg: number; limpio_kg: number }) =>
      (await apiClient.post('/reporte-produccion/pesajes', body)).data,
    onSuccess: () => invalidarReporteProduccion(queryClient),
  });
}

export function useEditarPesaje() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: number; bruto_kg?: number; limpio_kg?: number }) =>
      (await apiClient.patch(`/reporte-produccion/pesajes/${id}`, body)).data,
    onSuccess: () => invalidarReporteProduccion(queryClient),
  });
}

export function useBorrarPesaje() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await apiClient.delete(`/reporte-produccion/pesajes/${id}`)).data,
    onSuccess: () => invalidarReporteProduccion(queryClient),
  });
}

export function useGuardarPrecioProductoBase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { producto: string; precio_kg: number | null }) =>
      (await apiClient.put('/reporte-produccion/productos-base', body)).data,
    onSuccess: () => invalidarReporteProduccion(queryClient),
  });
}

export async function exportInventarioBruto(
  fecha: string,
  hoja: HojaReporteProduccion,
  base: 'existencia' | 'produccion' = 'existencia',
): Promise<Blob> {
  const response = await apiClient.get<Blob>('/reporte-produccion/inventario-bruto/export', {
    params: { fecha, hoja, base },
    responseType: 'blob',
  });
  return response.data;
}

export async function exportReporteProduccion(fecha: string, hoja: HojaReporteProduccion): Promise<Blob> {
  const response = await apiClient.get<Blob>('/reporte-produccion/export', {
    params: { fecha, hoja },
    responseType: 'blob',
  });
  return response.data;
}

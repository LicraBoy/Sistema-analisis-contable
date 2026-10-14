/**
 * React Query hooks del módulo Fiesta de Fin de Año (`/fiesta-fin-anio`).
 *
 * Vive en su propio archivo (en vez de `hooks.ts`, que ya pasa de 3,800
 * líneas); la regla se mantiene: los componentes nunca llaman axios directo.
 * Toda clave de caché empieza con 'fiesta' y toda mutación invalida todo el
 * prefijo (croquis, reservaciones, resumen y cobros dependen unos de otros).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from './client';

export type TipoBoletoFiesta = 'adulto' | 'nino' | 'cortesia';
export type EstadoSillaFiesta = 'libre' | 'sin_pago' | 'anticipo' | 'pagada' | 'cortesia' | 'bloqueada';
export type EstadoReservacionFiesta = 'sin_sillas' | 'cortesia' | 'sin_pago' | 'anticipo' | 'pagada';

export interface FiestaPrecio {
  tipo: TipoBoletoFiesta;
  precio_preventa: number;
  precio_normal: number;
}

export interface FiestaEvento {
  id: number;
  nombre: string;
  anio: number;
  fecha_evento: string | null;
  corte_preventa: string | null;
  iva_factor: number;
  propina_pct: number;
  total_contabilidad_al_dia: number | null;
  precios: FiestaPrecio[];
}

export interface FiestaSilla {
  id: number;
  numero: number;
  /** Silla 11 o 12: existe y se vende, pero el mapa no la dibuja. */
  extra: boolean;
  /** Fuera de venta: solo un supervisor la bloquea o la habilita. */
  bloqueada: boolean;
  bloqueo_motivo: string;
  estado: EstadoSillaFiesta;
  tipo: TipoBoletoFiesta | null;
  reservacion_id: number | null;
  cliente: string | null;
  /** Solo en sillas ocupadas: precio, lo pagado y lo que falta (reparto de los pagos de su reservación). */
  precio: number | null;
  pagado: number | null;
  saldo: number | null;
  estado_pago: EstadoPagoSillaFiesta | null;
  pagos: FiestaPagoSilla[];
}

export interface FiestaMesa {
  id: number;
  numero: number;
  zona: string | null;
  x: number;
  y: number;
  capacidad: number;
  libres: number;
  sillas: FiestaSilla[];
}

export interface FiestaMesasResponse {
  evento: { id: number; nombre: string; anio: number };
  mesas: FiestaMesa[];
  totales: {
    libre: number;
    sin_pago: number;
    anticipo: number;
    pagada: number;
    cortesia: number;
    bloqueada: number;
    capacidad: number;
    ocupadas: number;
    pct_ocupacion: number | null;
  };
}

/** Porción de un pago de la reservación que cubre esta silla (el pago se captura a la reservación y se reparte). */
export interface FiestaPagoSilla {
  pago_id: number;
  /** Cobro con varias formas de pago: comparten el mismo id y se muestran como UN solo Pago N. */
  cobro_id?: string | null;
  /** Qué parte del importe fue con cada forma de pago (efectivo, tarjeta…). */
  partes: { pago_id: number; forma_pago: string; importe: number }[];
  referencia: string;
  fecha: string;
  importe: number;
  /** true = el abono se aplicó a esta silla por elección; false = repartido en cascada. */
  dirigido: boolean;
}

export type EstadoPagoSillaFiesta = 'pagada' | 'anticipo' | 'sin_pago' | 'cortesia';

export interface FiestaReservacionSilla {
  silla_id: number;
  mesa: number;
  silla: number;
  tipo: TipoBoletoFiesta;
  precio_aplicado: number;
  preventa: boolean;
  activa: boolean;
  /** Reflejo por silla, como Pago 1/2/3, Pagado y Saldo de la hoja de mesa del Excel. */
  pagado: number;
  saldo: number;
  estado_pago: EstadoPagoSillaFiesta | null;
  pagos: FiestaPagoSilla[];
}

export interface FiestaPagoItem {
  id: number;
  referencia: string;
  fecha: string;
  importe: number;
  forma_pago: string;
  capturado_por: string;
  cancelado: boolean;
  /** Sillas a las que se aplicó el abono (vacío = toda la reservación). */
  silla_ids: number[];
}

export interface FiestaPreventaAutorizada {
  activa: boolean;
  por: string;
  motivo: string;
}

export interface FiestaReservacion {
  id: number;
  cliente: string;
  telefono_o_cuarto: string;
  correo: string;
  /** Permiso para respetar el precio de preventa aunque ya pasó el corte. */
  preventa_autorizada: FiestaPreventaAutorizada;
  notas: string;
  fecha_venta: string;
  capturado_por: string;
  estatus: 'activa' | 'cancelada';
  motivo_cancelacion: string;
  importe: number;
  pagado: number;
  saldo: number;
  excedente: number;
  estado: EstadoReservacionFiesta;
  sillas: FiestaReservacionSilla[];
  pagos: FiestaPagoItem[];
}

export interface FiestaVariacion {
  actual: number;
  anterior: number;
  variacion: number;
  pct: number | null;
}

export interface FiestaResumen {
  /** Cortesías: ni preventa ni normal (preventa + normal + cortesías = boletos reservados). */
  cortesias_tarifa: { cantidad: number; importe: number };
  capacidad_total: number;
  reservaciones: number;
  reservas: { adultos: number; ninos: number; cortesias: number; total: number };
  estado: {
    pagadas: number;
    anticipos: number;
    sin_anticipo: number;
    cortesias: number;
    sin_anticipo_con_cortesias: number;
    pct_pagadas: number | null;
    pct_anticipos: number | null;
    pct_sin_anticipo: number | null;
  };
  ocupacion: { ocupadas: number; disponibles: number; pct: number | null; adultos: number; ninos: number; cortesias: number };
  preventa: { adultos: { cantidad: number; importe: number }; ninos: { cantidad: number; importe: number } };
  normal: { adultos: { cantidad: number; importe: number }; ninos: { cantidad: number; importe: number } };
  dinero: { importe_total: number; pagado: number; saldo_pendiente: number; excedente: number };
  comparativo: {
    fecha_referencia: string;
    reservados: FiestaVariacion;
    pagadas: FiestaVariacion;
    anticipos: FiestaVariacion;
    sin_anticipo: FiestaVariacion;
    cortesias: FiestaVariacion;
  } | null;
  fecha_corte: string;
  anio_comparativo: number;
  fiscal: { subtotal: number; iva: number; propina: number; total: number };
  conciliacion: { total_sistema: number; total_contabilidad: number | null; diferencia: number | null };
}

/** Sillas por estado en un día ("cómo vamos al día"): Reservados = pagadas + anticipos + sin anticipo + cortesías. */
export interface FiestaReservasDia {
  reservados: number;
  pagadas: number;
  anticipos: number;
  sin_anticipo: number;
  cortesias: number;
  /** Boletos acumulados al día por tipo de boleto. */
  tipos: { adulto: number; nino: number; cortesia: number };
}

/** Una fila de la hoja Cobros del Excel. */
export interface FiestaCobroDia {
  fecha: string;
  pago1: number;
  pago2: number;
  pago3: number;
  total: number;
  sin_iva: number;
  /** Total que contabilidad registró en póliza ese día (null = sin capturar). */
  poliza: number | null;
  diferencia: number | null;
  acumulado: number;
  /** Hubo pagos o ventas ese día. */
  movimiento: boolean;
  /** Boletos vendidos ese día por tipo (adulto / niño / cortesía). */
  vendidas: { adulto: number; nino: number; cortesia: number };
  reservas: FiestaReservasDia;
}

export interface FiestaCobros {
  dias: FiestaCobroDia[];
  totales: { pago1: number; pago2: number; pago3: number; total: number; sin_iva: number; poliza: number; diferencia: number; dias_con_poliza: number };
  hoy: {
    fecha: string;
    es_hoy: boolean;
    reservas: FiestaReservasDia;
    cobrado_hoy: number;
    acumulado: number;
    por_cobrar: number;
  } | null;
  total: number;
  total_sin_iva: number;
  por_forma_pago: { forma_pago: string; importe: number }[];
  fiscal: { subtotal: number; iva: number; propina: number; total: number };
  conciliacion: { total_sistema: number; total_contabilidad: number | null; diferencia: number | null };
}

export interface FiestaSillaNueva {
  silla_id: number;
  tipo: TipoBoletoFiesta;
}

export interface FiestaPagoNuevo {
  importe: number;
  fecha?: string;
  referencia?: string;
  forma_pago?: string;
  capturado_por?: string;
  silla_ids?: number[];
}

export interface FiestaReservacionNueva {
  cliente: string;
  telefono_o_cuarto?: string;
  correo?: string;
  preventa_autorizada?: { por: string; motivo: string };
  notas?: string;
  fecha_venta?: string;
  capturado_por?: string;
  sillas: FiestaSillaNueva[];
  pago_inicial?: FiestaPagoNuevo;
}

export interface FiestaReservacionCambios {
  cliente?: string;
  telefono_o_cuarto?: string;
  correo?: string;
  preventa_autorizada?: { por: string; motivo: string };
  quitar_preventa?: boolean;
  notas?: string;
  sillas_agregar?: FiestaSillaNueva[];
  sillas_quitar?: number[];
  /** Cambia adulto/niño/cortesía de sillas ya reservadas (conserva la fecha de venta original). */
  sillas_cambiar_tipo?: FiestaSillaNueva[];
  /** Precio manual de sillas ya vendidas (requiere autorización de supervisor). */
  sillas_cambiar_precio?: { silla_id: number; precio: number; motivo: string }[];
  capturado_por?: string;
}

export interface FiestaPagoCambios {
  silla_ids?: number[];
  importe?: number;
  fecha?: string;
  referencia?: string;
  forma_pago?: string;
  capturado_por?: string;
}

export interface FiestaEventoCambios {
  nombre?: string;
  fecha_evento?: string | null;
  corte_preventa?: string | null;
  iva_factor?: number;
  propina_pct?: number;
  total_contabilidad_al_dia?: number | null;
  limpiar_contabilidad?: boolean;
}

export interface FiestaFiltrosReservaciones {
  estado?: string;
  mesa?: number;
  q?: string;
  con_saldo?: boolean;
  /** Incluye las canceladas (la lista normal las oculta). */
  incluir_canceladas?: boolean;
}

/**
 * Cabecera con la autorización de supervisor (de un solo uso) para las acciones que la exigen. El parámetro
 * se sigue llamando `pin` en los hooks: ahora lleva el token que devuelve `POST /auth/autorizar`.
 */
function cabeceraPin(autorizacion?: string): Record<string, string> {
  return autorizacion ? { 'X-Autorizacion': autorizacion } : {};
}

/** Mensaje legible de un error de la API (p. ej. el 409 de "silla ocupada"). */
export function mensajeErrorFiesta(error: unknown): string {
  const detalle = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detalle === 'string') return detalle;
  if (Array.isArray(detalle)) {
    return detalle
      .map((d) => (typeof d === 'object' && d !== null && 'msg' in d ? String((d as { msg: unknown }).msg) : String(d)))
      .join('; ');
  }
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado';
}

/** `true` si el error es el 404 de "el evento todavía no se prepara". */
export function esEventoNoPreparado(error: unknown): boolean {
  return (error as { response?: { status?: number } })?.response?.status === 404;
}

export function useFiestaEvento() {
  return useQuery({
    queryKey: ['fiesta', 'evento'],
    queryFn: async (): Promise<FiestaEvento> => {
      const response = await apiClient.get('/fiesta-fin-anio/evento');
      return response.data;
    },
    retry: false, // 404 = aún no se prepara el evento
  });
}

export function useFiestaSembrar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (anio?: number) => {
      const response = await apiClient.post('/fiesta-fin-anio/sembrar', null, { params: anio ? { anio } : {} });
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fiesta'] }),
  });
}

export function useFiestaMesas(enabled = true) {
  return useQuery({
    queryKey: ['fiesta', 'mesas'],
    queryFn: async (): Promise<FiestaMesasResponse> => {
      const response = await apiClient.get('/fiesta-fin-anio/mesas');
      return response.data;
    },
    enabled,
    refetchInterval: 15_000, // varias cajas capturando: que todas vean lo mismo
  });
}

export function useFiestaReservaciones(filtros: FiestaFiltrosReservaciones = {}, enabled = true) {
  return useQuery({
    queryKey: ['fiesta', 'reservaciones', filtros],
    queryFn: async (): Promise<{ reservaciones: FiestaReservacion[]; total: number }> => {
      const response = await apiClient.get('/fiesta-fin-anio/reservaciones', { params: filtros });
      return response.data;
    },
    enabled,
    refetchInterval: 30_000,
  });
}

export function useFiestaReservacion(id: number | null) {
  return useQuery({
    queryKey: ['fiesta', 'reservacion', id],
    queryFn: async (): Promise<FiestaReservacion> => {
      const response = await apiClient.get(`/fiesta-fin-anio/reservaciones/${id}`);
      return response.data;
    },
    enabled: id !== null,
  });
}

export function useFiestaResumen(fechaCorte?: string, enabled = true) {
  return useQuery({
    queryKey: ['fiesta', 'resumen', fechaCorte ?? null],
    queryFn: async (): Promise<FiestaResumen> => {
      const response = await apiClient.get('/fiesta-fin-anio/resumen', {
        params: fechaCorte ? { fecha_corte: fechaCorte } : {},
      });
      return response.data;
    },
    enabled,
    refetchInterval: 15_000, // otras cajas capturando: Resumen y Cobros se mantienen al día
    refetchOnWindowFocus: true,
  });
}

export interface FiestaHistoricoFila {
  fecha: string;
  reservados: number;
  pagados: number;
  anticipos: number;
  sin_anticipo: number;
  cortesias: number;
  /** Solo en el cierre de la edición (se capturan a mano). */
  adultos: number | null;
  ninos: number | null;
}

/** Sillas acumuladas por día de la edición anterior (comparativo de Ventas). */
export function useFiestaHistorico(anio?: number) {
  return useQuery({
    queryKey: ['fiesta', 'historico', anio ?? null],
    queryFn: async (): Promise<{ anio: number; filas: FiestaHistoricoFila[]; disponible_para_cargar: boolean }> => {
      const response = await apiClient.get('/fiesta-fin-anio/historico', { params: anio ? { anio } : {} });
      return response.data;
    },
  });
}

/** Captura o corrige el cierre (totales finales) de la edición anterior: lo que se compara contra el avance de hoy. */
export function useFiestaGuardarCierreHistorico() {
  const invalidar = useInvalidarFiesta();
  return useMutation({
    mutationFn: async (params: {
      anio?: number;
      cambios: Partial<Pick<FiestaHistoricoFila, 'reservados' | 'pagados' | 'anticipos' | 'sin_anticipo' | 'cortesias'>> & {
        adultos?: number;
        ninos?: number;
      };
    }) => {
      const response = await apiClient.put('/fiesta-fin-anio/historico/cierre', params.cambios, {
        params: params.anio ? { anio: params.anio } : {},
      });
      return response.data;
    },
    onSettled: invalidar,
  });
}

/** Carga el histórico de la edición anterior tomado del Excel (idempotente). */
export function useFiestaSembrarHistorico() {
  const invalidar = useInvalidarFiesta();
  return useMutation({
    mutationFn: async (anio?: number): Promise<{ anio: number; cargadas: number; total: number }> => {
      const response = await apiClient.post('/fiesta-fin-anio/historico/sembrar', null, { params: anio ? { anio } : {} });
      return response.data;
    },
    onSettled: invalidar,
  });
}

export function useFiestaCobros(enabled = true) {
  return useQuery({
    queryKey: ['fiesta', 'cobros'],
    queryFn: async (): Promise<FiestaCobros> => {
      const response = await apiClient.get('/fiesta-fin-anio/cobros');
      return response.data;
    },
    enabled,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

// Toda mutación del módulo invalida todas sus vistas.
function useInvalidarFiesta() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['fiesta'] });
}

export function useFiestaCrearReservacion() {
  const invalidar = useInvalidarFiesta();
  return useMutation({
    mutationFn: async ({ pin, ...datos }: FiestaReservacionNueva & { pin?: string }): Promise<FiestaReservacion> => {
      const response = await apiClient.post('/fiesta-fin-anio/reservaciones', datos, { headers: cabeceraPin(pin) });
      return response.data;
    },
    onSettled: invalidar, // también al fallar: un 409 significa que el croquis estaba desactualizado
  });
}

export function useFiestaEditarReservacion() {
  const invalidar = useInvalidarFiesta();
  return useMutation({
    mutationFn: async (params: { id: number; cambios: FiestaReservacionCambios; pin?: string }): Promise<FiestaReservacion> => {
      const response = await apiClient.patch(`/fiesta-fin-anio/reservaciones/${params.id}`, params.cambios, {
        headers: cabeceraPin(params.pin),
      });
      return response.data;
    },
    onSettled: invalidar,
  });
}

export function useFiestaCancelarReservacion() {
  const invalidar = useInvalidarFiesta();
  return useMutation({
    mutationFn: async (params: { id: number; motivo?: string; usuario?: string; cancelar_pagos?: boolean }) => {
      const response = await apiClient.delete(`/fiesta-fin-anio/reservaciones/${params.id}`, {
        params: { motivo: params.motivo, usuario: params.usuario, cancelar_pagos: params.cancelar_pagos },
      });
      return response.data;
    },
    onSettled: invalidar,
  });
}

/** Junta la reservación `origenId` dentro de `id` (sillas y pagos); la de origen queda cancelada como fusionada. */
export function useFiestaFusionarReservaciones() {
  const invalidar = useInvalidarFiesta();
  return useMutation({
    mutationFn: async (params: { id: number; origenId: number; capturadoPor?: string }): Promise<FiestaReservacion> => {
      const response = await apiClient.post(`/fiesta-fin-anio/reservaciones/${params.id}/fusionar`, {
        origen_id: params.origenId,
        capturado_por: params.capturadoPor,
      });
      return response.data;
    },
    onSettled: invalidar,
  });
}

export function useFiestaAgregarPago() {
  const invalidar = useInvalidarFiesta();
  return useMutation({
    mutationFn: async (params: { reservacionId: number; pago: FiestaPagoNuevo }): Promise<FiestaReservacion> => {
      const response = await apiClient.post(`/fiesta-fin-anio/reservaciones/${params.reservacionId}/pagos`, params.pago);
      return response.data;
    },
    onSettled: invalidar,
  });
}

/** Cobro en varias formas de pago (parte en efectivo, parte con tarjeta…): un pago por forma, todos o ninguno. */
export function useFiestaAgregarPagosMultiples() {
  const invalidar = useInvalidarFiesta();
  return useMutation({
    mutationFn: async (params: { reservacionId: number; pagos: FiestaPagoNuevo[] }): Promise<FiestaReservacion> => {
      const response = await apiClient.post(`/fiesta-fin-anio/reservaciones/${params.reservacionId}/pagos/multiple`, {
        pagos: params.pagos,
      });
      return response.data;
    },
    onSettled: invalidar,
  });
}

export function useFiestaEditarPago() {
  const invalidar = useInvalidarFiesta();
  return useMutation({
    mutationFn: async (params: { pagoId: number; cambios: FiestaPagoCambios; pin?: string }): Promise<FiestaReservacion> => {
      const response = await apiClient.patch(`/fiesta-fin-anio/pagos/${params.pagoId}`, params.cambios, {
        headers: cabeceraPin(params.pin),
      });
      return response.data;
    },
    onSettled: invalidar,
  });
}

/** Corrige cuánto de un pago puso una silla (Pago 1/2/3 de la hoja de mesa); 0 quita esa porción. */
/** Bloquea (saca de venta) o habilita sillas, o una mesa completa. Solo con autorización de supervisor. */
export function useFiestaBloquearSillas() {
  const invalidar = useInvalidarFiesta();
  return useMutation({
    mutationFn: async (params: {
      bloquear: boolean;
      sillaIds?: number[];
      mesa?: number;
      motivo?: string;
      capturadoPor?: string;
      pin?: string;
    }): Promise<{ cambiadas: number; omitidas_por_estar_reservadas: number }> => {
      const response = await apiClient.post(
        '/fiesta-fin-anio/bloqueos',
        {
          bloquear: params.bloquear,
          silla_ids: params.sillaIds,
          mesa: params.mesa,
          motivo: params.motivo,
          capturado_por: params.capturadoPor,
        },
        { headers: cabeceraPin(params.pin) },
      );
      return response.data;
    },
    onSettled: invalidar,
  });
}

export function useFiestaEditarPagoSilla() {
  const invalidar = useInvalidarFiesta();
  return useMutation({
    mutationFn: async (params: { pagoId: number; sillaId: number; importe: number; capturadoPor?: string; pin?: string }): Promise<FiestaReservacion> => {
      const response = await apiClient.patch(
        `/fiesta-fin-anio/pagos/${params.pagoId}/sillas/${params.sillaId}`,
        { importe: params.importe, capturado_por: params.capturadoPor },
        { headers: cabeceraPin(params.pin) },
      );
      return response.data;
    },
    onSettled: invalidar,
  });
}

/** Muda sillas de la reservación a las primeras sillas libres de otra mesa (conservan tipo, precio y pagos). */
export function useFiestaTransferirSillas() {
  const invalidar = useInvalidarFiesta();
  return useMutation({
    mutationFn: async (params: { id: number; mesaDestino: number; sillas: number[]; capturadoPor?: string }): Promise<FiestaReservacion> => {
      const response = await apiClient.post(`/fiesta-fin-anio/reservaciones/${params.id}/transferir`, {
        mesa_destino: params.mesaDestino,
        sillas: params.sillas,
        capturado_por: params.capturadoPor,
      });
      return response.data;
    },
    onSettled: invalidar,
  });
}

/** Captura (o borra, con importe null) el total que contabilidad registró en póliza para un día. */
export function useFiestaGuardarPoliza() {
  const invalidar = useInvalidarFiesta();
  return useMutation({
    mutationFn: async (params: { fecha: string; importe: number | null }) => {
      const response = await apiClient.put(`/fiesta-fin-anio/cobros/poliza/${params.fecha}`, { importe: params.importe });
      return response.data;
    },
    onSettled: invalidar,
  });
}

export function useFiestaCancelarPago() {
  const invalidar = useInvalidarFiesta();
  return useMutation({
    mutationFn: async (params: { pagoId: number; usuario?: string }): Promise<FiestaReservacion> => {
      const response = await apiClient.delete(`/fiesta-fin-anio/pagos/${params.pagoId}`, {
        params: { usuario: params.usuario },
      });
      return response.data;
    },
    onSettled: invalidar,
  });
}

export function useFiestaActualizarEvento() {
  const invalidar = useInvalidarFiesta();
  return useMutation({
    mutationFn: async ({ pin, ...cambios }: FiestaEventoCambios & { pin?: string }): Promise<FiestaEvento> => {
      const response = await apiClient.put('/fiesta-fin-anio/evento', cambios, { headers: cabeceraPin(pin) });
      return response.data;
    },
    onSettled: invalidar,
  });
}

export function useFiestaActualizarPrecios() {
  const invalidar = useInvalidarFiesta();
  return useMutation({
    mutationFn: async (params: { precios: FiestaPrecio[]; pin?: string }): Promise<FiestaEvento> => {
      const response = await apiClient.put('/fiesta-fin-anio/precios', params.precios, { headers: cabeceraPin(params.pin) });
      return response.data;
    },
    onSettled: invalidar,
  });
}

export function useFiestaGuardarPosiciones() {
  const invalidar = useInvalidarFiesta();
  return useMutation({
    mutationFn: async (posiciones: { id: number; x: number; y: number }[]) => {
      const response = await apiClient.put('/fiesta-fin-anio/mesas/posiciones', posiciones);
      return response.data;
    },
    onSettled: invalidar,
  });
}

export function useFiestaActualizarMesa() {
  const invalidar = useInvalidarFiesta();
  return useMutation({
    mutationFn: async (params: { id: number; capacidad?: number; zona?: string }) => {
      const { id, ...cambios } = params;
      const response = await apiClient.patch(`/fiesta-fin-anio/mesas/${id}`, cambios);
      return response.data;
    },
    onSettled: invalidar,
  });
}

// ── Auditoría (solo quien tiene el permiso `fiesta_auditoria`; las cajeras no la ven) ──

export type GrupoAuditoria = 'cobros' | 'cancelaciones' | 'reservaciones' | 'precios' | 'bloqueos' | 'configuracion';

export interface FiestaAuditoriaFila {
  id: number;
  creado_en: string;
  usuario: string;
  usuario_id: number | null;
  accion: string;
  entidad: string;
  grupo: GrupoAuditoria;
  grupo_etiqueta: string;
  etiqueta: string;
  reservacion_id: number | null;
  cliente: string;
  mesa: number | null;
  detalle: string;
  autorizo: string | null;
  antes: Record<string, unknown> | string | null;
  despues: Record<string, unknown> | string | null;
  ip: string;
}

export interface FiestaAuditoriaFiltros {
  usuario?: string;
  grupo?: GrupoAuditoria | '';
  reservacion_id?: number;
  q?: string;
  desde?: string;
  hasta?: string;
  pagina: number;
}

export interface FiestaAuditoriaRespuesta {
  total: number;
  pagina: number;
  por_pagina: number;
  filas: FiestaAuditoriaFila[];
  resumen: { movimientos_hoy: number; por_grupo: Record<string, number>; por_usuario: Record<string, number> };
  usuarios: string[];
  grupos: Record<string, string>;
}

function paramsAuditoria(f: FiestaAuditoriaFiltros) {
  return Object.fromEntries(Object.entries(f).filter(([k, v]) => v !== undefined && v !== '' && k !== 'pagina'));
}

export function useFiestaAuditoria(filtros: FiestaAuditoriaFiltros, activo = true) {
  return useQuery({
    queryKey: ['fiesta', 'auditoria', filtros],
    enabled: activo,
    queryFn: async (): Promise<FiestaAuditoriaRespuesta> => {
      const response = await apiClient.get('/fiesta-fin-anio/auditoria', { params: { ...paramsAuditoria(filtros), pagina: filtros.pagina } });
      return response.data;
    },
    placeholderData: (previa) => previa,
    refetchInterval: 20_000,
  });
}

/** Descarga el Excel de la auditoría con los mismos filtros de la pantalla. */
export async function descargarAuditoriaExcel(filtros: FiestaAuditoriaFiltros): Promise<void> {
  const response = await apiClient.get('/fiesta-fin-anio/auditoria/export', { params: paramsAuditoria(filtros), responseType: 'blob' });
  const url = URL.createObjectURL(response.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'auditoria_fiesta.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

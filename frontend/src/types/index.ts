/**
 * TypeScript interfaces matching the backend Pydantic schemas.
 */

// ── Enums ──────────────────────────────────────────────

export enum EstadoPago {
  ENCONTRADO = 'encontrado',
  NO_PAGADO = 'no_pagado',
  DUPLICADO = 'duplicado',
}

export enum EstadoProcesamiento {
  PENDIENTE = 'pendiente',
  PROCESANDO = 'procesando',
  COMPLETADO = 'completado',
  ERROR = 'error',
}

export enum TipoArchivo {
  INGRESOS = 'ingresos',
  PAGOS = 'pagos',
}

export enum RolUsuario {
  ADMIN = 'admin',
  ANALISTA = 'analista',
  VIEWER = 'viewer',
}

// ── Auth ───────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

// ── Pagos ──────────────────────────────────────────────

export interface Pago {
  id: number;
  tipo_movimiento: string;
  fecha: string | null;
  factura: string;
  uuid: string | null;
  estado: EstadoPago;
  observaciones: string | null;
  datos_extra: Record<string, unknown> | null;
  archivo_id: number | null;
  created_at: string;
  uuid_verificado: boolean;
}

export interface PagoListResponse {
  items: Pago[];
  total: number;
  page: number;
  page_size: number;
}

export interface PagoUpdate {
  tipo_movimiento?: string;
  fecha?: string | null;
  factura?: string;
  uuid?: string;
  estado?: EstadoPago;
  motivo?: string;
}

export interface PagoFilter {
  estado?: EstadoPago;
  fecha_desde?: string;
  fecha_hasta?: string;
  factura?: string;
  sin_amarre?: boolean;
  page?: number;
  page_size?: number;
}

export interface UsdPreviewRow {
  uuid: string;
  factura: string;
  emisor: string;
  fecha_expedicion: string;
  tipo_cambio: number | null;
  total: number | null;
  total_mxn: number | null;
}

export interface EgresoRelacionado {
  uuid: string;
  Subtotal: number;
  'Total descuento': number;
  Neto: number;
  'Retención IVA': number;
  'Retención ISR': number;
  'Traslado IVA': number;
  Total: number;
  // El archivo de Egresos puede traer columnas adicionales del original
  // (folio, fecha, serie, etc.) que se conservan tal cual para la hoja
  // "Egresos" del reporte, sin tipar cada una.
  [key: string]: unknown;
}

export interface CanceladoDetalle {
  UUID: string;
  // Resto de columnas originales del archivo de UUID cancelados, si las trae.
  [key: string]: unknown;
}

// ── Ingresos ───────────────────────────────────────────

export interface CfdiIngreso {
  id: number;
  uuid: string;
  regimen_fiscal_receptor: string;
  regimen_fiscal_emisor: string;
  rfc_emisor: string | null;
  nombre_emisor: string | null;
  datos_extra: Record<string, unknown> | null;
  created_at: string;
}

// ── Archivos ───────────────────────────────────────────

export interface UploadResponse {
  archivo_id: number;
  nombre_archivo: string;
  total_registros: number;
  mensaje: string;
}

export interface ProcesamientoStatus {
  archivo_id: number;
  estado: EstadoProcesamiento;
  total_registros: number;
  uuid_encontrados: number;
  uuid_no_encontrados: number;
  mensaje_error: string | null;
  progreso_porcentaje: number;
}

// ── Dashboard ──────────────────────────────────────────

export interface DashboardStats {
  total_pagos: number;
  encontrados: number;
  no_pagados: number;
  pendientes: number;
  archivos_procesados: number;
}

// ── Reporte de producción y ventas de Carnes y Mariscos ────────────────

export type HojaReporteProduccion = 'porcionador' | 'cocina';
export type EstadoDiferenciaProduccion = 'sin_conteo' | 'cuadra' | 'sobrante' | 'faltante';

export interface RenglonProduccion {
  id: number;
  hoja: HojaReporteProduccion;
  seccion: string;
  producto: string;
  presentacion: string | null;
  gramaje: string | null;
  unidad: string;
  orden: number;
  activo: boolean;
  clave_cruce: string | null;
  gramaje_kg: number | null; // kg limpio por unidad capturada
  prueba_bruto_kg: number | null; // prueba de rendimiento: kg en bruto…
  prueba_limpio_kg: number | null; // …y kg limpios que salieron (factor = bruto / limpio)
  es_crudo: boolean | null; // ¿es el crudo que se limpia? null = automático (única presentación en KG)
  es_limpio: boolean | null; // ¿es pollo/producto ya LIMPIO que sobra (p. ej. filetitos)? su cantidad son kg limpios
  gramaje_kg_efectivo: number | null; // gramaje_kg, o el que sale del texto impreso ("180g" → 0.18)
}

export interface FilaCapturaProduccion extends RenglonProduccion {
  // La existencia final no se captura: se calcula en cadena (inicial + entradas − salidas).
  inicial: number | null;
  inicial_manual: number | null; // inicial corregido a mano (manda sobre el arrastre)
  inicial_arrastrado: number | null; // existencia final del día previo con captura
  es_apertura: boolean; // primer día del renglón (sin saldo previo)
  entradas: number | null;
  entradas_es_auto: boolean; // cocina: hay sugerencia desde las salidas del porcionador
  entradas_auto: number | null; // esa sugerencia
  salidas_es_auto: boolean; // crudo: su salida es el bruto pesado ("usado en limpieza")
  salidas_auto: number | null; // esa sugerencia (bruto pesado ese día)
  entradas_manual: number | null; // lo capturado a mano (manda sobre la sugerencia)
  salidas: number | null;
  conteo_fisico: number | null; // existencia final editada a mano (opcional); corrige el arrastre
  final_calculado: number | null;
  existencia_final: number | null;
  diferencia: number | null; // conteo − calculado
  estado_diferencia: EstadoDiferenciaProduccion;
  alerta_negativo: boolean;
  capturado: boolean;
}

export interface DiaReporteProduccion {
  fecha: string;
  hoja: HojaReporteProduccion;
  fecha_dia_anterior: string | null;
  dia: { responsable_porcionador: string | null; responsable_cocina: string | null; notas: string | null };
  renglones: FilaCapturaProduccion[];
}

export interface CruceReporteProduccion {
  fecha: string;
  sin_contraparte: { producto: string; presentacion: string | null; hoja: HojaReporteProduccion }[];
}

export interface CapturaRenglonProduccionBody {
  renglon_id: number;
  inicial: number | null;
  entradas: number | null;
  salidas: number | null;
  conteo_fisico: number | null;
}

export interface FilaInventarioBruto {
  renglon_id: number;
  presentacion: string | null;
  unidad: string;
  cantidad: number | null;
  gramaje_kg: number | null;
  kg_limpio: number | null;
  factor: number | null;
  prueba_bruto_kg: number | null;
  prueba_limpio_kg: number | null;
  kg_bruto: number | null;
  falta: string | null; // por qué no se pudo calcular (sin gramaje / sin factor)
  limpio_intermedio: boolean; // sobrante ya limpio: entra y sale (neto) en la producción
}

export interface ProductoInventarioBruto {
  producto: string;
  seccion: string; // grupo de la hoja: CAMARÓN, PESCADO, RES…
  precio_kg: number | null;
  kg_bruto_total: number;
  valor: number | null;
  factor_origen: 'pesaje' | 'catalogo' | null; // de dónde sale el factor de rendimiento
  factor_fecha: string | null; // día del pesaje de limpieza usado (si es de pesaje)
  filas: FilaInventarioBruto[];
}

export interface GrupoInventarioBruto {
  seccion: string;
  kg_bruto_total: number;
  valor: number; // suma solo de productos con precio
  sin_precio: boolean; // algún producto con bruto no tiene precio por kg
  productos: ProductoInventarioBruto[];
}

export interface InventarioBruto {
  fecha: string;
  hoja: HojaReporteProduccion;
  productos: ProductoInventarioBruto[];
  grupos: GrupoInventarioBruto[];
  total_kg_bruto: number;
  total_valor: number;
  advertencias: string[];
}

export interface PesajeLimpieza {
  id: number;
  fecha: string;
  producto: string;
  bruto_kg: number;
  limpio_kg: number;
  merma_kg: number;
  factor: number | null;
}

export type EstadoControlLimpieza = 'sin_pesaje' | 'cuadra' | 'faltan_porciones' | 'exceden_limpio';

export interface ControlLimpieza {
  bruto_kg: number;
  limpio_kg: number;
  merma_kg: number | null;
  factor: number | null;
  kg_porciones: number;
  diferencia_kg: number | null; // limpio pesado − porciones producidas
  diferencia_pct: number | null;
  estado: EstadoControlLimpieza;
  porciones: {
    renglon_id: number;
    presentacion: string | null;
    entradas: number;
    gramaje_kg: number;
    kg: number;
    limpio_intermedio?: boolean;
  }[];
  sin_gramaje: string[];
}

export interface ProductoLimpieza {
  producto: string;
  activo_hoy: boolean;
  pesajes: PesajeLimpieza[];
  control: ControlLimpieza;
}

export interface PesajesDia {
  fecha: string;
  productos: ProductoLimpieza[];
}

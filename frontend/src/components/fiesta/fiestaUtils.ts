/**
 * Constantes y formateadores compartidos por los componentes de Fiesta de Fin de Año.
 */

import type {
  EstadoReservacionFiesta,
  EstadoSillaFiesta,
  FiestaHistoricoFila,
  TipoBoletoFiesta,
} from '../../api/fiestaHooks';

export const ESTADO_SILLA_CONFIG: Record<EstadoSillaFiesta, { etiqueta: string; relleno: string; borde: string; mantine: string }> = {
  libre: { etiqueta: 'Libre', relleno: '#ffffff', borde: '#adb5bd', mantine: 'gray' },
  sin_pago: { etiqueta: 'Apartada (sin pago)', relleno: '#ffa94d', borde: '#e8590c', mantine: 'orange' },
  anticipo: { etiqueta: 'Con anticipo', relleno: '#74c0fc', borde: '#1971c2', mantine: 'blue' },
  pagada: { etiqueta: 'Pagada', relleno: '#69db7c', borde: '#2f9e44', mantine: 'green' },
  cortesia: { etiqueta: 'Cortesía', relleno: '#b197fc', borde: '#6741d9', mantine: 'violet' },
  bloqueada: { etiqueta: 'Bloqueada', relleno: '#868e96', borde: '#343a40', mantine: 'dark' },
};

export const ORDEN_ESTADOS_SILLA: EstadoSillaFiesta[] = ['libre', 'sin_pago', 'anticipo', 'pagada', 'cortesia', 'bloqueada'];

export const ESTADO_RESERVACION_CONFIG: Record<EstadoReservacionFiesta, { etiqueta: string; color: string }> = {
  sin_sillas: { etiqueta: 'Sin sillas', color: 'gray' },
  cortesia: { etiqueta: 'Cortesía', color: 'violet' },
  sin_pago: { etiqueta: 'Sin pago', color: 'orange' },
  anticipo: { etiqueta: 'Anticipo', color: 'blue' },
  pagada: { etiqueta: 'Pagada', color: 'green' },
};

export const ETIQUETA_TIPO: Record<TipoBoletoFiesta, string> = {
  adulto: 'Adulto',
  nino: 'Niño',
  cortesia: 'Cortesía',
};

export const TIPOS_BOLETO: { value: TipoBoletoFiesta; label: string }[] = [
  { value: 'adulto', label: 'Adulto' },
  { value: 'nino', label: 'Niño' },
  { value: 'cortesia', label: 'Cortesía' },
];

const formatoMoneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

export function dinero(valor: number | null | undefined): string {
  return formatoMoneda.format(valor ?? 0);
}

export function entero(valor: number | null | undefined): string {
  return new Intl.NumberFormat('es-MX').format(valor ?? 0);
}

export function porcentaje(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? '—' : `${valor.toLocaleString('es-MX', { maximumFractionDigits: 1 })}%`;
}

/** Fecha local de hoy como `YYYY-MM-DD` (sin el corrimiento de zona horaria de toISOString). */
export function hoyISO(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** `YYYY-MM-DD` ↔ `Date` local a mediodía (así un `DateInput` de Mantine no se corre de día por la zona horaria). */
export function isoADate(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, (m || 1) - 1, d || 1, 12);
}
export function dateAIso(fecha: Date): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

/** `2026-12-31` → `31/12/2026` sin pasar por `Date` (evita desfases de zona horaria). */
export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

const CLAVE_CAPTURISTA = 'fiesta-fin-anio:capturado-por';

export function leerCapturista(): string {
  try {
    return localStorage.getItem(CLAVE_CAPTURISTA) ?? '';
  } catch {
    return '';
  }
}

export function guardarCapturista(nombre: string): void {
  try {
    localStorage.setItem(CLAVE_CAPTURISTA, nombre);
  } catch {
    // sin almacenamiento disponible: no pasa nada, solo no se recuerda
  }
}

/** Precio vigente de un boleto según la fecha de venta y el corte de preventa (misma regla que el backend). */
export function precioVigente(
  tipo: TipoBoletoFiesta,
  precios: { tipo: TipoBoletoFiesta; precio_preventa: number; precio_normal: number }[],
  corteIso: string | null,
  fechaIso: string,
  forzarPreventa = false,
): number {
  const p = precios.find((x) => x.tipo === tipo);
  if (!p) return 0;
  // forzarPreventa = la reservación tiene autorizado el precio de preventa aunque ya pasó el corte.
  const enPreventa = (corteIso !== null && fechaIso <= corteIso) || (forzarPreventa && tipo !== 'cortesia');
  return enPreventa ? p.precio_preventa : p.precio_normal;
}

export interface AbonoSugerido {
  pct: number;
  monto: number;
  sugerido: boolean;
  completa: boolean;
}

const MAX_PAGOS_POR_SILLA = 3; // Pago 1, 2 y 3 de la hoja de mesa del Excel

/**
 * Abonos sugeridos para llegar a 25/50/75/100 % de `base` (precio de las sillas elegidas), con el monto
 * que falta para cada umbral. Misma regla que `sugerir_abonos` del backend: solo umbrales por encima de lo
 * ya pagado (si dio 75 % queda el 25 % restante) y, con dos pagos ya hechos, solo completar el saldo.
 */
export function sugerirAbonos(base: number, pagado: number, nPagos: number): AbonoSugerido[] {
  const b = Math.round(base * 100) / 100;
  const saldo = Math.round((b - pagado) * 100) / 100;
  if (b <= 0.005 || saldo <= 0.005) return [];
  if (nPagos >= MAX_PAGOS_POR_SILLA - 1) return [{ pct: 100, monto: saldo, sugerido: true, completa: true }];
  const res: AbonoSugerido[] = [];
  for (const pct of [25, 50, 75, 100]) {
    const monto = Math.round((b * pct) / 100 * 100 - pagado * 100) / 100;
    if (monto <= 0.005) continue;
    res.push({ pct, monto: Math.min(monto, saldo), sugerido: false, completa: pct === 100 });
  }
  if (res.length) res[0].sugerido = true;
  return res;
}

/**
 * Fila de la edición anterior que corresponde a un día de este año: el mismo mes/día; si ese día no se capturó,
 * la última captura anterior (`exacta: false`, con su fecha). Antes de la primera captura o después de la última
 * no hay con qué comparar (null). `filas` va ordenada por fecha ascendente.
 */
export function filaDelAnioPasado(
  filas: FiestaHistoricoFila[],
  fechaIso: string,
  anio: number,
): { fila: FiestaHistoricoFila; exacta: boolean } | null {
  if (filas.length === 0) return null;
  const [, mes, dia] = fechaIso.split('-');
  const objetivo = `${anio}-${mes}-${dia}`;
  let elegida: FiestaHistoricoFila | null = null;
  for (const f of filas) {
    if (f.fecha <= objetivo) elegida = f;
    else break;
  }
  if (!elegida || objetivo > filas[filas.length - 1].fecha) return null;
  return { fila: elegida, exacta: elegida.fecha === objetivo };
}

/** Un día antes de una fecha ISO (YYYY-MM-DD), sin pasar por zonas horarias. */
export function diaAnteriorISO(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d - 1));
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, '0')}-${String(f.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Sillas reservadas / pagadas SOLO en ese día de la edición anterior: acumulado(día) − acumulado(día anterior).
 * Únicamente si el histórico tiene captura exacta de ambos días (si falta alguno no se inventa nada → null).
 * El valor puede ser negativo (cancelaciones o cambios ese día).
 */
export function variacionDiariaHistorico(
  filas: FiestaHistoricoFila[],
  fechaIso: string,
  anio: number,
): { reservados: number; pagados: number; cortesias: number } | null {
  const [, mes, dia] = fechaIso.split('-');
  const hoy = `${anio}-${mes}-${dia}`;
  const ayer = diaAnteriorISO(hoy);
  const fHoy = filas.find((f) => f.fecha === hoy);
  const fAyer = filas.find((f) => f.fecha === ayer);
  if (!fHoy || !fAyer) return null;
  return { reservados: fHoy.reservados - fAyer.reservados, pagados: fHoy.pagados - fAyer.pagados, cortesias: fHoy.cortesias - fAyer.cortesias };
}

// ── Confirmación al cliente (correo / WhatsApp) ──

const ETIQUETA_TIPO_PLURAL: Record<string, [string, string]> = {
  adulto: ['adulto', 'adultos'],
  nino: ['niño', 'niños'],
  cortesia: ['cortesía', 'cortesías'],
};

/** Texto de la confirmación: folio, mesa(s), sillas por tipo, total, pagado y saldo, más el pie configurable del evento. */
export function mensajeConfirmacion(
  r: { id: number; cliente: string; importe: number; pagado: number; saldo: number; sillas: { mesa: number; tipo: string; activa: boolean }[] },
  nombreEvento: string,
  fechaEvento: string | null,
  pie: string,
): { asunto: string; cuerpo: string } {
  const activas = r.sillas.filter((s) => s.activa);
  const mesas = [...new Set(activas.map((s) => s.mesa))].sort((a, b) => a - b);
  const porTipo = ['adulto', 'nino', 'cortesia']
    .map((t) => {
      const n = activas.filter((s) => s.tipo === t).length;
      return n > 0 ? `${n} ${ETIQUETA_TIPO_PLURAL[t][n === 1 ? 0 : 1]}` : null;
    })
    .filter(Boolean)
    .join(', ');
  const lineas = [
    `Hola ${r.cliente},`,
    '',
    `Confirmamos tu reservación #${r.id} para ${nombreEvento}${fechaEvento ? ` (${fechaCorta(fechaEvento)})` : ''}.`,
    '',
    `Mesa${mesas.length === 1 ? '' : 's'}: ${mesas.join(', ') || '—'}`,
    `Lugares: ${activas.length}${porTipo ? ` (${porTipo})` : ''}`,
    `Total: ${dinero(r.importe)}`,
    `Pagado: ${dinero(r.pagado)}`,
    `Saldo pendiente: ${dinero(Math.max(r.saldo, 0))}`,
  ];
  if (pie.trim()) lineas.push('', pie.trim());
  lineas.push('', '¡Gracias por tu preferencia!');
  return { asunto: `Confirmación de reservación #${r.id} · ${nombreEvento}`, cuerpo: lineas.join('\n') };
}

/** Enlaces listos para abrir el correo o WhatsApp del que envía (no se manda nada solo). */
export function enlaceCorreo(correo: string, asunto: string, cuerpo: string): string {
  return `mailto:${encodeURIComponent(correo)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
}

/** WhatsApp con el teléfono a 10 dígitos (México, +52). Devuelve null si el teléfono no sirve. */
export function enlaceWhatsApp(telefono: string, cuerpo: string): string | null {
  const digitos = telefono.replace(/\D/g, '');
  const diez = digitos.length >= 12 && digitos.startsWith('52') ? digitos.slice(-10) : digitos;
  if (diez.length !== 10) return null;
  return `https://wa.me/52${diez}?text=${encodeURIComponent(cuerpo)}`;
}

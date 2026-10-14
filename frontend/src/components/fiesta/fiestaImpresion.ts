/**
 * Impresión de Fiesta de Fin de Año: recibo de reservación y hoja por mesas
 * (reemplazan las hojas "Impresión" y "Reservas Impresion" del Excel).
 *
 * Se arma un documento HTML aparte y se imprime desde un iframe oculto: así no
 * depende de los estilos de la app ni de los modales de Mantine.
 */

import type { FiestaReservacion } from '../../api/fiestaHooks';
import { dinero, ESTADO_RESERVACION_CONFIG, ETIQUETA_TIPO, fechaCorta } from './fiestaUtils';

function esc(valor: unknown): string {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const ESTILOS = `
  @page { margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  h2 { font-size: 13px; margin: 14px 0 4px; text-transform: uppercase; letter-spacing: .04em; }
  .sub { color: #555; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; }
  th { background: #eee; }
  td.num, th.num { text-align: right; }
  .datos td { border: none; padding: 2px 6px 2px 0; }
  .total td { font-weight: bold; }
  .firmas { display: flex; gap: 40px; margin-top: 46px; }
  .firmas div { flex: 1; border-top: 1px solid #333; text-align: center; padding-top: 4px; }
  .cancelada { color: #b00; font-weight: bold; margin: 6px 0; }
  .mesas { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; }
  .mesa { break-inside: avoid; }
  .mesa h2 { margin-top: 0; }
`;

function imprimirDocumento(titulo: string, cuerpo: string): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  const ventana = iframe.contentWindow;
  if (!doc || !ventana) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${ESTILOS}</style></head><body>${cuerpo}</body></html>`);
  doc.close();

  // Espera un tick para que el iframe termine de pintar antes de imprimir.
  window.setTimeout(() => {
    ventana.focus();
    ventana.print();
    window.setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 1500);
  }, 150);
}

export function imprimirRecibo(reservacion: FiestaReservacion, nombreEvento: string): void {
  const sillas = reservacion.sillas.filter((s) => s.activa);
  const pagos = reservacion.pagos.filter((p) => !p.cancelado);
  const filasSillas = sillas
    .map(
      (s) =>
        `<tr><td>${s.mesa}</td><td>${s.silla}</td><td>${esc(ETIQUETA_TIPO[s.tipo])}${s.preventa ? ' (preventa)' : ''}</td><td class="num">${dinero(s.precio_aplicado)}</td></tr>`,
    )
    .join('');
  const filasPagos =
    pagos
      .map(
        (p) =>
          `<tr><td>${fechaCorta(p.fecha)}</td><td>${esc(p.forma_pago) || '—'}</td><td>${esc(p.referencia) || '—'}</td><td class="num">${dinero(p.importe)}</td></tr>`,
      )
      .join('') || '<tr><td colspan="4">Sin pagos registrados</td></tr>';

  const cuerpo = `
    <h1>${esc(nombreEvento)}</h1>
    <div class="sub">Recibo de reservación · Folio ${reservacion.id}</div>
    ${reservacion.estatus === 'cancelada' ? `<div class="cancelada">RESERVACIÓN CANCELADA${reservacion.motivo_cancelacion ? ': ' + esc(reservacion.motivo_cancelacion) : ''}</div>` : ''}
    <table class="datos">
      <tr><td><b>Cliente:</b> ${esc(reservacion.cliente)}</td><td><b>Teléfono / cuarto:</b> ${esc(reservacion.telefono_o_cuarto) || '—'}</td></tr>
      ${reservacion.correo ? `<tr><td colspan="2"><b>Correo:</b> ${esc(reservacion.correo)}</td></tr>` : ''}
      ${reservacion.preventa_autorizada?.activa ? `<tr><td colspan="2"><b>Precio de preventa autorizado</b> por ${esc(reservacion.preventa_autorizada.por)} (${esc(reservacion.preventa_autorizada.motivo)})</td></tr>` : ''}
      <tr><td><b>Fecha de venta:</b> ${fechaCorta(reservacion.fecha_venta)}</td><td><b>Estado:</b> ${esc(ESTADO_RESERVACION_CONFIG[reservacion.estado].etiqueta)}</td></tr>
      ${reservacion.notas ? `<tr><td colspan="2"><b>Notas:</b> ${esc(reservacion.notas)}</td></tr>` : ''}
    </table>
    <h2>Boletos</h2>
    <table>
      <tr><th>Mesa</th><th>Silla</th><th>Tipo</th><th class="num">Precio</th></tr>
      ${filasSillas}
      <tr class="total"><td colspan="3">Total (${sillas.length} boletos)</td><td class="num">${dinero(reservacion.importe)}</td></tr>
    </table>
    <h2>Pagos</h2>
    <table>
      <tr><th>Fecha</th><th>Forma de pago</th><th>Referencia</th><th class="num">Importe</th></tr>
      ${filasPagos}
      <tr class="total"><td colspan="3">Pagado</td><td class="num">${dinero(reservacion.pagado)}</td></tr>
      <tr class="total"><td colspan="3">Saldo pendiente</td><td class="num">${dinero(reservacion.saldo)}</td></tr>
    </table>
    <div class="firmas"><div>Cliente</div><div>Recibió${reservacion.capturado_por ? ': ' + esc(reservacion.capturado_por) : ''}</div></div>
  `;
  imprimirDocumento(`Recibo ${reservacion.id}`, cuerpo);
}

export interface FilaHojaMesa {
  silla: number;
  cliente: string;
  tipo: string;
  contacto: string;
  estado: string;
}

export interface BloqueHojaMesa {
  mesa: number;
  filas: FilaHojaMesa[];
}

export function imprimirHojaMesas(nombreEvento: string, bloques: BloqueHojaMesa[]): void {
  const mesas = bloques
    .map((b) => {
      const filas = b.filas
        .map(
          (f) =>
            `<tr><td>${f.silla}</td><td>${esc(f.cliente) || ''}</td><td>${esc(f.tipo)}</td><td>${esc(f.contacto)}</td><td>${esc(f.estado)}</td></tr>`,
        )
        .join('');
      return `<div class="mesa"><h2>Mesa ${b.mesa}</h2><table><tr><th>Silla</th><th>Cliente</th><th>Tipo</th><th>Teléfono / cuarto</th><th>Estado</th></tr>${filas}</table></div>`;
    })
    .join('');
  imprimirDocumento(`Hoja de mesas`, `<h1>${esc(nombreEvento)}</h1><div class="sub">Hoja de mesas · ${new Date().toLocaleDateString('es-MX')}</div><div class="mesas">${mesas}</div>`);
}

/**
 * Impresión de Fiesta de Fin de Año: recibo de reservación y hoja por mesas
 * (reemplazan las hojas "Impresión" y "Reservas Impresion" del Excel).
 *
 * Se arma un documento HTML aparte y se imprime desde un iframe oculto: así no
 * depende de los estilos de la app ni de los modales de Mantine.
 */

import type { FiestaMesasResponse, FiestaReservacion } from '../../api/fiestaHooks';
import { dinero, ESTADO_RESERVACION_CONFIG, ESTADO_SILLA_CONFIG, ETIQUETA_TIPO, fechaCorta, ORDEN_ESTADOS_SILLA } from './fiestaUtils';

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

function imprimirDocumento(titulo: string, cuerpo: string, estilosExtra = ''): void {
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
  doc.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${ESTILOS}${estilosExtra}</style></head><body>${cuerpo}</body></html>`);
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

const ESTILOS_CROQUIS = `
  @page { size: landscape; margin: 10mm; }
  /* Fuerza los colores al imprimir: sin esto, algunos navegadores/impresoras apagan los rellenos de fondo (la
     leyenda) aunque el plano en sí (relleno de las sillas, vegetación, etc.) es pintura SVG y siempre sale a color. */
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
  .croquis-svg-pagina { width: 100%; }
  .croquis-svg-pagina svg { width: 100%; height: auto; display: block; }
  .croquis-leyenda { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 8px 0 10px; }
  .croquis-leyenda span.pastilla { display: inline-flex; align-items: center; gap: 5px; }
  .croquis-leyenda i.muestra { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
`;

interface DatosCroquis {
  nombreEvento: string;
  /** Contenido SVG ya serializado (EscenarioSalon + Rótulos + mesas, con `mostrarHotel={false}`). */
  svgInterior: string;
  /** Acota el plano exactamente a la zona de la fiesta (nunca el hotel, aunque la pantalla lo esté mostrando). */
  viewBox: string;
  totales: FiestaMesasResponse['totales'];
}

interface ItemLeyenda {
  etiqueta: string;
  relleno: string;
  borde: string;
  valor: number;
}

function itemsLeyenda(totales: FiestaMesasResponse['totales']): ItemLeyenda[] {
  return ORDEN_ESTADOS_SILLA.map((estado) => {
    const cfg = ESTADO_SILLA_CONFIG[estado];
    return { etiqueta: cfg.etiqueta, relleno: cfg.relleno, borde: cfg.borde, valor: totales[estado] };
  });
}

function leyendaHtml(totales: FiestaMesasResponse['totales']): string {
  return itemsLeyenda(totales)
    .map((it) => `<span class="pastilla"><i class="muestra" style="background:${esc(it.relleno)};border:1.5px solid ${esc(it.borde)}"></i>${esc(it.etiqueta)}: ${it.valor}</span>`)
    .join('');
}

function subtituloCroquis(totales: FiestaMesasResponse['totales']): string {
  return `Croquis del recinto (solo la zona de la fiesta) · ${new Date().toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })} · ${totales.ocupadas} de ${totales.capacidad} lugares ocupados`;
}

/** Imprime el croquis del recinto, recortado a la zona de la fiesta. La página sale apaisada y a color. */
export function imprimirCroquis(opts: DatosCroquis): void {
  const { nombreEvento, svgInterior, viewBox, totales } = opts;
  const cuerpo = `
    <h1>${esc(nombreEvento)}</h1>
    <div class="sub">${esc(subtituloCroquis(totales))}</div>
    <div class="croquis-leyenda">${leyendaHtml(totales)}</div>
    <div class="croquis-svg-pagina">
      <svg viewBox="${esc(viewBox)}" xmlns="http://www.w3.org/2000/svg">${svgInterior}</svg>
    </div>
  `;
  imprimirDocumento('Croquis de la Fiesta', cuerpo, ESTILOS_CROQUIS);
}

/** Corta `texto` en líneas que quepan en `maxAncho` (con `ctx.font` ya puesto), como el salto de línea del título al imprimir. */
function envolverTexto(ctx: CanvasRenderingContext2D, texto: string, maxAncho: number): string[] {
  const palabras = texto.split(' ');
  const lineas: string[] = [];
  let actual = '';
  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (ctx.measureText(prueba).width > maxAncho && actual) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/**
 * Guarda el croquis como una imagen PNG a color — el MISMO título, la MISMA leyenda y el MISMO plano que al
 * imprimir. Un SVG con texto HTML dentro (`foreignObject`) no se puede convertir a imagen en el navegador ("lienzo
 * contaminado"), así que el título y la leyenda se dibujan con el `<canvas>` directamente (con su propio ajuste de
 * renglón) y el plano —puro SVG vectorial, sin texto HTML— se dibuja encima ya convertido a imagen.
 */
export async function descargarCroquisImagen(opts: DatosCroquis): Promise<void> {
  const { nombreEvento, svgInterior, viewBox, totales } = opts;
  const [, , vbAncho, vbAlto] = viewBox.split(/\s+/).map(Number);
  const ESCALA = 2; // más resolución que la pantalla (como una imagen @2x), se ve nítida al acercar el zoom
  const ANCHO = 1800 * ESCALA;
  const MARGEN = 28 * ESCALA;
  const altoMapa = Math.round((ANCHO - MARGEN * 2) * (vbAlto / vbAncho));

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo preparar el lienzo para la imagen.');

  // 1) Medir el encabezado (título envuelto + subtítulo + leyenda envuelta) para saber cuánto alto ocupa.
  const anchoUtil = ANCHO - MARGEN * 2;
  ctx.font = `bold ${26 * ESCALA}px Arial, sans-serif`;
  const lineasTitulo = envolverTexto(ctx, nombreEvento, anchoUtil);
  const altoTitulo = lineasTitulo.length * 34 * ESCALA;
  const altoSub = 20 * ESCALA;
  const items = itemsLeyenda(totales);
  const ladoMuestra = 13 * ESCALA;
  const espacioItem = 10 * ESCALA;
  const espacioGrupo = 22 * ESCALA;
  const altoFilaLeyenda = 20 * ESCALA;
  ctx.font = `${13 * ESCALA}px Arial, sans-serif`;
  let filasLeyenda = 1;
  let x = 0;
  for (const it of items) {
    const anchoItem = ladoMuestra + espacioItem + ctx.measureText(`${it.etiqueta}: ${it.valor}`).width;
    if (x > 0 && x + anchoItem > anchoUtil) {
      filasLeyenda++;
      x = 0;
    }
    x += anchoItem + espacioGrupo;
  }
  const altoLeyenda = filasLeyenda * altoFilaLeyenda;
  const altoEncabezado = MARGEN + altoTitulo + 10 * ESCALA + altoSub + 14 * ESCALA + altoLeyenda + 14 * ESCALA;
  const altoTotal = altoEncabezado + altoMapa + MARGEN;

  canvas.width = ANCHO;
  canvas.height = altoTotal;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2) Dibujar el encabezado.
  let y = MARGEN;
  ctx.fillStyle = '#1a1a1a';
  ctx.font = `bold ${26 * ESCALA}px Arial, sans-serif`;
  ctx.textBaseline = 'top';
  for (const linea of lineasTitulo) {
    ctx.fillText(linea, MARGEN, y);
    y += 34 * ESCALA;
  }
  y += 10 * ESCALA;
  ctx.fillStyle = '#555555';
  ctx.font = `${13 * ESCALA}px Arial, sans-serif`;
  ctx.fillText(subtituloCroquis(totales), MARGEN, y);
  y += altoSub + 14 * ESCALA;
  x = MARGEN;
  for (const it of items) {
    const textoItem = `${it.etiqueta}: ${it.valor}`;
    const anchoItem = ladoMuestra + espacioItem + ctx.measureText(textoItem).width;
    if (x > MARGEN && x + anchoItem > MARGEN + anchoUtil) {
      y += altoFilaLeyenda;
      x = MARGEN;
    }
    ctx.fillStyle = it.relleno;
    ctx.strokeStyle = it.borde;
    ctx.lineWidth = 1.5 * ESCALA;
    const radio = 3 * ESCALA;
    ctx.beginPath();
    ctx.roundRect(x, y + 2 * ESCALA, ladoMuestra, ladoMuestra, radio);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#212529';
    ctx.fillText(textoItem, x + ladoMuestra + espacioItem, y);
    x += anchoItem + espacioGrupo;
  }
  y += altoFilaLeyenda + 14 * ESCALA;

  // 3) Dibujar el plano (puro SVG, sin texto HTML: no contamina el lienzo) debajo del encabezado.
  const svgMapa = `<svg xmlns="http://www.w3.org/2000/svg" width="${anchoUtil}" height="${altoMapa}" viewBox="${esc(viewBox)}">${svgInterior}</svg>`;
  const blob = new Blob([svgMapa], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    const cargada = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('No se pudo generar la imagen del croquis.'));
    });
    img.src = url;
    await cargada;
    ctx.drawImage(img, MARGEN, y, anchoUtil, altoMapa);
  } finally {
    URL.revokeObjectURL(url);
  }

  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!png) throw new Error('No se pudo generar el archivo de imagen.');
  const urlPng = URL.createObjectURL(png);
  const a = document.createElement('a');
  a.href = urlPng;
  a.download = `Croquis_${nombreEvento.replace(/[^\w-]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.png`;
  a.click();
  URL.revokeObjectURL(urlPng);
}

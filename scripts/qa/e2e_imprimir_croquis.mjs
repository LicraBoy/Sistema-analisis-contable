// E2E: botón "Imprimir croquis" en el Croquis de la Fiesta — recorta a la zona del evento (nunca el hotel).
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const aqui = dirname(fileURLToPath(import.meta.url));
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = 'http://127.0.0.1:5180';
const PASS = 'Prueba-QA-2026';
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const matarEdge = (e) => { try { spawnSync('taskkill', ['/PID', String(e.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} };
const borrarPerfil = async (dir) => { await esperar(800); try { rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 400 }); } catch {} };
let fallas = 0; const ok = (n, c, x = '') => { if (!c) fallas++; console.log(`${c ? 'OK   ' : 'FALLA'} ${n} ${x}`); };
const puerto = 9900 + Math.floor(Math.random() * 90); const perfil = join(aqui, `tmp/edge_imp_${puerto}`); mkdirSync(perfil, { recursive: true });
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, 'about:blank'], { stdio: 'ignore' });
let ws; for (let i = 0; i < 60; i++) { try { const p = (await (await fetch(`http://127.0.0.1:${puerto}/json`)).json()).find((t) => t.type === 'page'); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch {} await esperar(500); }
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
const errores = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errores.push(d.params.exceptionDetails.text); };
const cdp = (method, params = {}) => new Promise((rs, rj) => { const mi = ++id; pend.set(mi, (d) => (d.error ? rj(new Error(d.error.message)) : rs(d.result))); ws.send(JSON.stringify({ id: mi, method, params })); });
const ev = async (e) => { const x = await cdp('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (x.exceptionDetails) throw new Error(x.exceptionDetails.exception?.description ?? x.exceptionDetails.text); return x.result.value; };
const espS = async (js, ms = 15000) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (await ev(js)) return true; await esperar(300); } return false; };
try {
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1100, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: BASE + '/login' });
  await espS(`!!document.querySelector('#login-email')`);
  for (const [sel, v] of [['#login-email', 'qa_cajera_fiesta'], ['#login-password', PASS]]) { await ev(`document.querySelector('${sel}').focus()`); await cdp('Input.insertText', { text: v }); }
  await ev(`document.querySelector('#login-submit').click()`);
  await espS(`location.pathname !== '/login'`);
  await cdp('Page.navigate', { url: BASE + '/fiesta-fin-anio' });
  ok('carga el croquis (SVG del recinto)', await espS(`!!document.querySelector('svg[aria-label="Croquis del recinto con las mesas de la fiesta"]')`));
  ok('aparece el botón "Imprimir croquis"', await espS(`!!document.querySelector('[aria-label="Imprimir croquis"]')`));
  await ev(`document.querySelector('[aria-label="Imprimir croquis"]').click()`);
  ok('se genera el documento de impresión (iframe oculto)', await espS(`!!document.querySelector('iframe[aria-hidden="true"]')`, 5000));
  await esperar(400); // el iframe termina de pintar antes de llamar a print()
  const datos = await ev(`(()=>{
    const f = document.querySelector('iframe[aria-hidden="true"]');
    const d = f && f.contentDocument;
    if (!d) return null;
    const svg = d.querySelector('svg');
    return {
      titulo: d.title,
      tieneLeyenda: !!d.querySelector('.croquis-leyenda'),
      viewBox: svg ? svg.getAttribute('viewBox') : null,
      tieneHotel: !!d.querySelector('#h-teja'),
      numMesas: d.querySelectorAll('[aria-label^="Mesa "]').length,
    };
  })()`);
  await ev(`(()=>{const f=document.querySelector('iframe[aria-hidden="true"]');f.style.cssText='position:fixed;left:0;top:0;width:1400px;height:900px;border:0;visibility:visible;z-index:99999;background:#fff;';})()`);
  await esperar(400);
  writeFileSync(join(aqui, 'tmp/croquis_impreso.png'), Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  console.log('impresión:', JSON.stringify(datos));
  ok('título del documento', datos && datos.titulo === 'Croquis de la Fiesta', JSON.stringify(datos?.titulo));
  ok('trae la leyenda de colores', !!datos?.tieneLeyenda);
  ok('dibuja las 72 mesas', datos?.numMesas === 72, String(datos?.numMesas));
  ok('NO incluye el hotel (sin sus patrones #h-teja)', datos && datos.tieneHotel === false);
  const vb = (datos?.viewBox || '').split(/\s+/).map(Number);
  // MUNDO ≈ ancho 204 × alto 102 (con 2% de margen); el hotel completo es mucho más grande (~465 de ancho).
  ok('el viewBox queda acotado a la zona del evento (no al hotel)', vb.length === 4 && vb[2] > 150 && vb[2] < 260 && vb[3] > 70 && vb[3] < 140, JSON.stringify(vb));
  const colorForzado = await ev(`(()=>{
    const f = document.querySelector('iframe[aria-hidden="true"]');
    const css = [...(f.contentDocument.querySelectorAll('style'))].map((s) => s.textContent).join('');
    return css.includes('print-color-adjust: exact');
  })()`);
  ok('la impresión fuerza los colores (print-color-adjust)', colorForzado);

  // ── Descargar croquis como imagen (PNG) ──
  const descargas = join(aqui, `tmp/descargas_${puerto}`);
  mkdirSync(descargas, { recursive: true });
  await cdp('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: descargas });
  ok('aparece el botón "Descargar croquis como imagen"', await espS(`!!document.querySelector('[aria-label="Descargar croquis como imagen"]')`));
  await ev(`document.querySelector('[aria-label="Descargar croquis como imagen"]').click()`);
  const { readdirSync, statSync } = await import('node:fs');
  let archivo = null;
  for (let i = 0; i < 30; i++) {
    const listos = readdirSync(descargas).filter((f) => f.endsWith('.png') && !f.endsWith('.crdownload'));
    if (listos.length) { archivo = listos[0]; break; }
    await esperar(300);
  }
  ok('se descarga un archivo .png', !!archivo, String(archivo));
  ok('la imagen pesa algo razonable (plano + leyenda)', !!archivo && statSync(join(descargas, archivo)).size > 20000, archivo ? String(statSync(join(descargas, archivo)).size) : '');
  ok('sin excepciones de JavaScript', errores.length === 0, errores.join(' | '));
} catch (e) { ok('script sin excepciones', false, e.message); }
finally { try { ws.close(); } catch {} matarEdge(edge); await esperar(600); await borrarPerfil(perfil); console.log(fallas ? `FALLAS ${fallas}` : 'TODO OK'); process.exit(0); }

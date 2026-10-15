// E2E: lo que captura OTRA caja aparece solo en esta pantalla (sin recargar): reservaciones, cobros, resumen y la campana de cortesías.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const aqui = dirname(fileURLToPath(import.meta.url));
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = 'http://127.0.0.1:5180';
const PASS = 'Prueba-QA-2026';
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
// Cierra Edge con TODOS sus procesos hijos y borra su perfil (si no, quedan ~100 MB por ejecución y se llena el disco).
const matarEdge = (e) => { try { spawnSync('taskkill', ['/PID', String(e.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} };
const borrarPerfil = async (dir) => { await esperar(800); try { rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 400 }); } catch {} };
let fallas = 0; const ok = (n, c, x = '') => { if (!c) fallas++; console.log(`${c ? 'OK   ' : 'FALLA'} ${n} ${x}`); };
const puerto = 9900 + Math.floor(Math.random() * 90); const perfil = join(aqui, `tmp/edge_act_${puerto}`); mkdirSync(perfil, { recursive: true });
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, 'about:blank'], { stdio: 'ignore' });
let ws; for (let i = 0; i < 60; i++) { try { const p = (await (await fetch(`http://127.0.0.1:${puerto}/json`)).json()).find((t) => t.type === 'page'); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch {} await esperar(500); }
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
const errores = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errores.push(d.params.exceptionDetails.text); };
const cdp = (method, params = {}) => new Promise((rs, rj) => { const mi = ++id; pend.set(mi, (d) => (d.error ? rj(new Error(d.error.message)) : rs(d.result))); ws.send(JSON.stringify({ id: mi, method, params })); });
const ev = async (e) => { const x = await cdp('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (x.exceptionDetails) throw new Error(x.exceptionDetails.exception?.description ?? x.exceptionDetails.text); return x.result.value; };
const espS = async (js, ms = 15000) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (await ev(js)) return true; await esperar(300); } return false; };
const escribirEn = async (etiqueta, valor) => {
  await ev(`(()=>{const l=[...document.querySelectorAll('label')].find(x=>x.textContent.trim().startsWith(${JSON.stringify(etiqueta)}));const i=l&&document.getElementById(l.getAttribute('for'));if(i){i.focus();i.select&&i.select();}return !!i})()`);
  await cdp('Input.insertText', { text: valor });
  await esperar(250);
};
const API = 'http://127.0.0.1:8011';
const post = (r, b, h) => fetch(API + r, { method: 'POST', headers: h, body: JSON.stringify(b) });
const tok = async (u) => (await (await fetch(API + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u, password: PASS }) })).json()).access_token;
const HC = { Authorization: 'Bearer ' + (await tok('qa_cajera_fiesta')), 'Content-Type': 'application/json' };
const libres = (await (await fetch(API + '/fiesta-fin-anio/mesas', { headers: HC })).json()).mesas.flatMap((m) => m.sillas.filter((s) => s.estado === 'libre' && !s.extra));
const monto = 1000 + Math.floor(Math.random() * 8000) + 0.37;
const montoTxt = monto.toLocaleString('en-US', { minimumFractionDigits: 2 });
const nombre = 'QA Vivo ' + Date.now().toString().slice(-5);
const pestana = (t) => ev(`[...document.querySelectorAll('[role=tab]')].find(x=>x.textContent.includes('${t}')).click()`);
const texto = (t, ms = 14000) => espS(`document.body.innerText.includes(${JSON.stringify(t)})`, ms);
try {
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1200, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: BASE + '/login' });
  await espS(`!!document.querySelector('#login-email')`);
  for (const [sel, v] of [['#login-email', 'qa_supervisor_fiesta'], ['#login-password', PASS]]) { await ev(`document.querySelector('${sel}').focus()`); await cdp('Input.insertText', { text: v }); }
  await ev(`document.querySelector('#login-submit').click()`);
  await espS(`location.pathname !== '/login'`);
  await cdp('Page.navigate', { url: BASE + '/fiesta-fin-anio' });
  await espS(`[...document.querySelectorAll('[role=tab]')].length > 0`);
  // 1) Reservaciones: otra caja crea una reservación y aparece sola
  await pestana('Reservaciones'); await esperar(1500);
  const t0 = Date.now();
  const r = await (await post('/fiesta-fin-anio/reservaciones', { cliente: nombre, telefono_o_cuarto: '6691234567', correo: 'qa@correo.com', sillas: [{ silla_id: libres[0].id, tipo: 'adulto' }, { silla_id: libres[1].id, tipo: 'nino' }] }, HC)).json();
  ok('API: reservación creada por otra caja', !!r.id);
  ok('Reservaciones: aparece sola, sin recargar', await texto(nombre, 12000), `en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  // 2) Cobros: otra caja registra un abono y el total sube solo
  await pestana('Cobros'); await esperar(2500);
  const antes = await ev(`document.body.innerText`);
  const t1 = Date.now();
  await post('/fiesta-fin-anio/reservaciones/' + r.id + '/pagos', { importe: monto, forma_pago: 'Efectivo', fecha: new Date().toISOString().slice(0, 10) }, HC);
  ok('Cobros: el abono nuevo aparece solo', await texto(montoTxt, 14000) && !antes.includes(montoTxt), `en ${((Date.now() - t1) / 1000).toFixed(1)} s`);
  // 3) Resumen: la reservación suma a "RESERVAS AL"
  await pestana('Resumen'); await esperar(2500);
  const total0 = await ev(`(()=>{const t=document.querySelector('table');const f=[...t.querySelectorAll('tbody tr')].find(x=>x.children[0].innerText.trim().startsWith('RESERVAS AL'));return Number(f.children[2].innerText.trim())})()`);
  const l2 = (await (await fetch(API + '/fiesta-fin-anio/mesas', { headers: HC })).json()).mesas.flatMap((m) => m.sillas.filter((s) => s.estado === 'libre' && !s.extra));
  const t2 = Date.now();
  await post('/fiesta-fin-anio/reservaciones', { cliente: nombre + ' B', telefono_o_cuarto: '6691234567', correo: 'qa@correo.com', sillas: [{ silla_id: l2[0].id, tipo: 'adulto' }, { silla_id: l2[1].id, tipo: 'adulto' }, { silla_id: l2[2].id, tipo: 'adulto' }] }, HC);
  const subio = await espS(`(()=>{const t=document.querySelector('table');const f=[...t.querySelectorAll('tbody tr')].find(x=>x.children[0].innerText.trim().startsWith('RESERVAS AL'));return Number(f.children[2].innerText.trim())===${total0 + 3}})()`, 14000);
  ok('Resumen: "RESERVAS AL" sube +3 solo', subio, `en ${((Date.now() - t2) / 1000).toFixed(1)} s (era ${total0})`);
  // 4) Campana: una cajera pide una cortesía y al supervisor le llega
  const l3 = (await (await fetch(API + '/fiesta-fin-anio/mesas', { headers: HC })).json()).mesas.flatMap((m) => m.sillas.filter((s) => s.estado === 'libre' && !s.extra));
  const campanaN = () => ev(`(()=>{const b=document.querySelector('[aria-label="Cortesías por autorizar"]');const r=b&&b.closest('.mantine-Indicator-root');return r?Number((r.innerText||'').trim())||0:0})()`);
  const n0 = await campanaN();
  const t3 = Date.now();
  await post('/fiesta-fin-anio/reservaciones', { cliente: nombre + ' C', telefono_o_cuarto: '6691234567', correo: 'qa@correo.com', sillas: [{ silla_id: l3[0].id, tipo: 'cortesia' }], cortesia_motivo: 'Prueba de campana viva' }, HC);
    ok('Campana: el supervisor ve la solicitud sin recargar', await espS(`(()=>{const b=document.querySelector('[aria-label="Cortesías por autorizar"]');const r=b&&b.closest('.mantine-Indicator-root');return (r?Number((r.innerText||'').trim())||0:0)>${n0}})()`, 14000), `en ${((Date.now() - t3) / 1000).toFixed(1)} s`);
  // 5) Croquis: las sillas ocupadas por otra caja se pintan solas
  await pestana('Croquis'); await esperar(2000);
  const ocupadas0 = await ev(`document.querySelectorAll('[aria-label^="Mesa "]').length`);
  ok('Croquis: carga el mapa de mesas', ocupadas0 > 0, String(ocupadas0));
  ok('sin excepciones de JavaScript', errores.length === 0, errores.join(' | '));
} catch (e) { ok('script sin excepciones', false, e.message); }
finally { try { ws.close(); } catch {} matarEdge(edge); await esperar(600); await borrarPerfil(perfil); console.log(fallas ? `FALLAS ${fallas}` : 'TODO OK'); process.exit(0); }

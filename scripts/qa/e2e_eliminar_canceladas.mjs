// E2E: Reservaciones → Canceladas → Eliminar (solo canceladas sin dinero; un supervisor).
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
const puerto = 9900 + Math.floor(Math.random() * 90); const perfil = join(aqui, `tmp/edge_elim_${puerto}`); mkdirSync(perfil, { recursive: true });
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
const pestana = (t) => ev(`[...document.querySelectorAll('[role=tab]')].find(x=>x.textContent.includes('${t}')).click()`);
const texto = (t, ms = 14000) => espS(`document.body.innerText.includes(${JSON.stringify(t)})`, ms);
const idRe = (s) => s;
const crear = async (nombreCli, tipos) => {
  const libresAhora = (await (await fetch(API + '/fiesta-fin-anio/mesas', { headers: HC })).json()).mesas.flatMap((m) => m.sillas.filter((s) => s.estado === 'libre' && !s.extra));
  return (await (await post('/fiesta-fin-anio/reservaciones', { cliente: nombreCli, telefono_o_cuarto: '6691234567', correo: 'qa@correo.com', sillas: tipos.map((t, i) => ({ silla_id: libresAhora[i].id, tipo: t })) }, HC)).json());
};
const cancelar = (id) => fetch(API + '/fiesta-fin-anio/reservaciones/' + id + '?motivo=prueba', { method: 'DELETE', headers: HC });
const A = await crear('QA Borrar ' + Date.now().toString().slice(-5), ['adulto']);
const B = await crear('QA ConDinero ' + Date.now().toString().slice(-5), ['adulto']);
await post('/fiesta-fin-anio/reservaciones/' + B.id + '/pagos', { importe: 700, forma_pago: 'Efectivo', fecha: new Date().toISOString().slice(0, 10) }, HC);
await cancelar(A.id); await cancelar(B.id);
const C = await crear('QA Lote ' + Date.now().toString().slice(-5), ['nino']);
await cancelar(C.id);
try {
  await cdp('Page.enable'); await cdp('Runtime.enable');
  ws.addEventListener('message', async (m) => { const d = JSON.parse(m.data); if (d.method === 'Page.javascriptDialogOpening') { await cdp('Page.handleJavaScriptDialog', { accept: true }); } });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1200, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: BASE + '/login' });
  await espS(`!!document.querySelector('#login-email')`);
  for (const [sel, v] of [['#login-email', 'qa_supervisor_fiesta'], ['#login-password', PASS]]) { await ev(`document.querySelector('${sel}').focus()`); await cdp('Input.insertText', { text: v }); }
  await ev(`document.querySelector('#login-submit').click()`);
  await espS(`location.pathname !== '/login'`);
  await cdp('Page.navigate', { url: BASE + '/fiesta-fin-anio' });
  await espS(`[...document.querySelectorAll('[role=tab]')].length > 0`);
  await ev(`[...document.querySelectorAll('[role=tab]')].find(x=>x.textContent.includes('Reservaciones')).click()`);
  await esperar(1500);
  await ev(`[...document.querySelectorAll('button')].find(b=>/^Canceladas/.test(b.textContent.trim())).click()`);
  ok('aparece la barra para eliminar canceladas', await espS(`!!document.querySelector('[data-testid="barra-eliminar-canceladas"]')`));
  const tarjeta = (nom) => `(()=>{const c=[...document.querySelectorAll('.mantine-Card-root')].find(x=>x.innerText.includes(${JSON.stringify(nom)}));return c})()`;
  ok('la cancelada SIN dinero muestra el botón Eliminar', await espS(`(()=>{const c=${tarjeta(A.cliente)};return !!c&&!!c.querySelector('[data-testid="eliminar-cancelada"]')})()`));
  ok('la cancelada CON dinero NO muestra Eliminar', await ev(`(()=>{const c=${tarjeta(B.cliente)};return !!c&&!c.querySelector('[data-testid="eliminar-cancelada"]')})()`));
  await ev(`${tarjeta(A.cliente)}.querySelector('[data-testid="eliminar-cancelada"]').click()`);
  ok('al eliminar la tarjeta desaparece', await espS(`!(${tarjeta(A.cliente)})`, 8000));
  ok('la que tiene dinero sigue ahí', await ev(`!!(${tarjeta(B.cliente)})`));
  const botonLote = await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Eliminar canceladas sin dinero'))?.innerText`);
  ok('el botón en lote lista las que se pueden borrar', /\(\d+\)/.test(botonLote || ''), botonLote);
  await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Eliminar canceladas sin dinero')).click()`);
  ok('el lote elimina las demás sin dinero', await espS(`!(${tarjeta(C.cliente)})`, 8000));
  ok('y deja la que tiene dinero', await ev(`!!(${tarjeta(B.cliente)})`));
  const aud = await (await fetch(API + '/fiesta-fin-anio/auditoria?limite=50', { headers: { Authorization: HC.Authorization } })).status;
  ok('sin excepciones de JavaScript', errores.length === 0, errores.join(' | '));
} catch (e) { ok('script sin excepciones', false, e.message); }
finally { try { ws.close(); } catch {} matarEdge(edge); await esperar(600); await borrarPerfil(perfil); console.log(fallas ? `FALLAS ${fallas}` : 'TODO OK'); process.exit(0); }

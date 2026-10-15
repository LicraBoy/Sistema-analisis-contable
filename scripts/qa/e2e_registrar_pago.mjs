// E2E: registrar un pago desde el detalle de una reservación NO debe dejar la pantalla en blanco ni cargando.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const aqui = dirname(fileURLToPath(import.meta.url));
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const API = 'http://127.0.0.1:8011';
const BASE = 'http://127.0.0.1:5180';
const PASS = 'Prueba-QA-2026';
const USUARIO = process.env.QA_USUARIO ?? 'qa_cajera_fiesta';
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
// Cierra Edge con TODOS sus procesos hijos y borra su perfil (si no, quedan ~100 MB por ejecución y se llena el disco).
const matarEdge = (e) => { try { spawnSync('taskkill', ['/PID', String(e.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} };
const borrarPerfil = async (dir) => { await esperar(800); try { rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 400 }); } catch {} };
let fallas = 0; const ok = (n, c, x = '') => { if (!c) fallas++; console.log(`${c ? 'OK   ' : 'FALLA'} ${n} ${x}`); };

const login = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: USUARIO, password: PASS }) })).json();
const H = { Authorization: `Bearer ${login.access_token}`, 'Content-Type': 'application/json' };
const mesas = (await (await fetch(`${API}/fiesta-fin-anio/mesas`, { headers: H })).json()).mesas;
const mesa = mesas.find((m) => m.sillas.filter((s) => s.estado === 'libre' && !s.extra).length >= 2);
const libres = mesa.sillas.filter((s) => s.estado === 'libre' && !s.extra).slice(0, 2);
const cliente = 'QA Pago ' + Date.now().toString().slice(-5);
const hoy = new Date().toISOString().slice(0, 10);
const res = await (await fetch(`${API}/fiesta-fin-anio/reservaciones`, { method: 'POST', headers: H, body: JSON.stringify({ cliente, telefono_o_cuarto: '6691234567', correo: 'qa@correo.com', fecha_venta: hoy, sillas: libres.map((s) => ({ silla_id: s.id, tipo: 'adulto' })) }) })).json();
ok('API: reservación creada', !!res.id);

const puerto = 9600 + Math.floor(Math.random() * 90); const perfil = join(aqui, `tmp/edge_rp_${puerto}`); mkdirSync(perfil, { recursive: true });
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, 'about:blank'], { stdio: 'ignore' });
let ws; for (let i = 0; i < 60; i++) { try { const p = (await (await fetch(`http://127.0.0.1:${puerto}/json`)).json()).find((t) => t.type === 'page'); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch {} await esperar(500); }
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errores = []; const red = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); return; }
  if (d.method === 'Runtime.exceptionThrown') errores.push('EXC ' + (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).slice(0, 600));
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errores.push('console.error ' + d.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 600));
  if (d.method === 'Network.responseReceived' && d.params.response.status >= 400 && !d.params.response.url.includes('/auth/refresh')) red.push(`${d.params.response.status} ${d.params.response.url}`);
};
const cdp = (method, params = {}) => new Promise((rs, rj) => { const mi = ++id; pend.set(mi, (d) => (d.error ? rj(new Error(d.error.message)) : rs(d.result))); ws.send(JSON.stringify({ id: mi, method, params })); });
const ev = async (e) => { const x = await cdp('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (x.exceptionDetails) throw new Error(x.exceptionDetails.exception?.description ?? x.exceptionDetails.text); return x.result.value; };
const espS = async (js, ms = 15000) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (await ev(js)) return true; await esperar(300); } return false; };
const espT = (frag, ms) => espS(`document.body.innerText.includes(${JSON.stringify(frag)})`, ms);
try {
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1100, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: BASE + '/login' });
  await espS(`!!document.querySelector('#login-email')`);
  for (const [sel, v] of [['#login-email', USUARIO], ['#login-password', PASS]]) { await ev(`document.querySelector('${sel}').focus()`); await cdp('Input.insertText', { text: v }); }
  await ev(`document.querySelector('#login-submit').click()`);
  await espS(`location.pathname !== '/login'`);
  await cdp('Page.navigate', { url: BASE + '/fiesta-fin-anio' });
  await espS(`!!document.querySelector('[aria-label^="Mesa "]')`);
  await ev(`[...document.querySelectorAll('button,[role=tab]')].find(x=>x.textContent.trim()==='Reservaciones')?.click()`);
  await espS(`[...document.querySelectorAll('input')].some(x=>/Buscar/i.test(x.placeholder||''))`);
  await ev(`(()=>{const i=[...document.querySelectorAll('input')].find(x=>/Buscar/i.test(x.placeholder||''));i.focus()})()`);
  await cdp('Input.insertText', { text: cliente });
  ok('aparece la tarjeta', await espT(cliente, 10000));
  await ev(`(()=>{const e=[...document.querySelectorAll('*')].filter(x=>x.children.length===0&&x.textContent.trim()===${JSON.stringify(cliente)}).pop();e&&e.click()})()`);
  ok('detalle abierto', await espT('Registrar pago', 10000));
  await esperar(600);
  // escribe el importe y registra
  await ev(`(()=>{const l=[...document.querySelectorAll('label')].find(x=>x.textContent.trim()==='Importe');const i=l&&document.getElementById(l.getAttribute('for'));i.focus();i.select&&i.select()})()`);
  await cdp('Input.insertText', { text: '1000' });
  await esperar(300);
  await ev(`[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Registrar pago').click()`);
  await esperar(3500);
  const texto = await ev('document.body.innerText');
  const raiz = await ev(`document.getElementById('root')?.innerText.length ?? 0`);
  ok('la pantalla NO queda en blanco', raiz > 200 && texto.length > 200, `len=${raiz}`);
  ok('aparece el aviso "Pago registrado"', texto.includes('Pago registrado'));
  ok('el detalle muestra el pago ($1,000)', /1,000/.test(texto));
  ok('sin cargas infinitas (no hay loader visible)', !(await ev(`!!document.querySelector('.mantine-Loader-root')`)));
  ok('sin excepciones de JavaScript', errores.length === 0, errores.join(' || '));
  ok('sin errores HTTP', red.length === 0, red.join(' | '));
  const sh = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(aqui, 'tmp/qa_registrar_pago.png'), Buffer.from(sh.data, 'base64'));
  // el mismo cobro con 2 formas de pago
  await ev(`(()=>{const l=[...document.querySelectorAll('label')].find(x=>/^Importe/.test(x.textContent.trim()));const i=l&&document.getElementById(l.getAttribute('for'));i.focus();i.select&&i.select()})()`);
  await cdp('Input.insertText', { text: '700' });
  await ev(`[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Pagar con otra forma de pago').click()`);
  await esperar(600);
  await ev(`(()=>{const l=[...document.querySelectorAll('label')].find(x=>x.textContent.trim().startsWith('Cuánto con'));const i=l&&document.getElementById(l.getAttribute('for'));i.focus();i.select&&i.select()})()`);
  await cdp('Input.insertText', { text: '200' });
  await ev(`[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Registrar pago').click()`);
  await esperar(3500);
  const t2 = await ev('document.body.innerText');
  const raiz2 = await ev(`document.getElementById('root')?.innerText.length ?? 0`);
  ok('2 formas: la pantalla NO queda en blanco', raiz2 > 200, `len=${raiz2}`);
  ok('2 formas: aviso de cobro registrado', /registrado en 2 formas/.test(t2));
  ok('2 formas: sin excepciones', errores.length === 0, errores.join(' || '));
} catch (e) { ok('script sin excepciones', false, e.message); console.log('errores de página:', errores.join(' || ')); }
finally { try { ws.close(); } catch {} matarEdge(edge); await esperar(600); await borrarPerfil(perfil); console.log(fallas ? `FALLAS ${fallas}` : 'TODO OK'); process.exit(0); }

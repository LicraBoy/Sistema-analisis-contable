// E2E: campana de cortesías por autorizar (supervisor ve, autoriza con un clic; la cajera no ve campana).
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
const puerto = 9900 + Math.floor(Math.random() * 90); const perfil = join(aqui, `tmp/edge_camp_${puerto}`); mkdirSync(perfil, { recursive: true });
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, 'about:blank'], { stdio: 'ignore' });
let ws; for (let i = 0; i < 60; i++) { try { const p = (await (await fetch(`http://127.0.0.1:${puerto}/json`)).json()).find((t) => t.type === 'page'); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch {} await esperar(500); }
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
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
const cliente = 'QA Campana ' + Date.now().toString().slice(-5);
const res = await (await post('/fiesta-fin-anio/reservaciones', { cliente, telefono_o_cuarto: '6691234567', correo: 'qa@correo.com', sillas: [{ silla_id: libres[0].id, tipo: 'cortesia' }], cortesia_motivo: 'Prueba campana' }, HC)).json();
ok('API: cortesía de cajera creada por autorizar', res.cortesias_por_autorizar === 1);
const entrar = async (u) => {
  await cdp('Page.navigate', { url: BASE + '/login' });
  await espS(`!!document.querySelector('#login-email')`);
  for (const [sel, v] of [['#login-email', u], ['#login-password', PASS]]) { await ev(`document.querySelector('${sel}').focus()`); await cdp('Input.insertText', { text: v }); }
  await ev(`document.querySelector('#login-submit').click()`);
  await espS(`location.pathname !== '/login'`);
  await cdp('Page.navigate', { url: BASE + '/fiesta-fin-anio' });
  await espS(`!!document.querySelector('[aria-label^="Mesa "]')`);
  await esperar(1200);
};
const campana = () => ev(`!!document.querySelector('[aria-label="Cortesías por autorizar"]')`);
try {
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1100, deviceScaleFactor: 1, mobile: false });
  await entrar('qa_supervisor_fiesta');
  ok('el supervisor ve la campana', await espS(`!!document.querySelector('[aria-label="Cortesías por autorizar"]')`));
  await ev(`document.querySelector('[aria-label="Cortesías por autorizar"]').click()`);
  ok('la campana lista la solicitud con cliente y motivo', await espS(`document.body.innerText.includes(${JSON.stringify(cliente)}) && document.body.innerText.includes('Prueba campana')`));
  await ev(`(()=>{const t=[...document.querySelectorAll('p,div')].filter(e=>e.textContent.includes(${JSON.stringify(cliente)})&&e.querySelector('button')).pop();[...t.querySelectorAll('button')].find(b=>b.textContent.trim()==='Autorizar').click();})()`);
  ok('aviso de cortesía autorizada', await espS(`document.body.innerText.includes('autorizada')`));
  const aut = await (await fetch(API + '/fiesta-fin-anio/reservaciones/' + res.id, { headers: HC })).json();
  ok('en el servidor quedó autorizada', aut.cortesias_por_autorizar === 0 && aut.cortesia.autorizada_por.includes('Supervisor'), JSON.stringify(aut.cortesia));
} catch (e) { ok('script sin excepciones', false, e.message); }
finally { try { ws.close(); } catch {} matarEdge(edge); await esperar(600); await borrarPerfil(perfil); console.log(fallas ? `FALLAS ${fallas}` : 'TODO OK'); process.exit(0); }

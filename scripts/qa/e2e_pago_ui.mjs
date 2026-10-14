// E2E: cobro con 2 formas de pago = UN Pago 1 en el detalle, y la silla pagada se ve pagada en el mapa (entorno de pruebas 5180/8011).
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const aqui = dirname(fileURLToPath(import.meta.url));
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const API = 'http://127.0.0.1:8011';
const BASE = 'http://127.0.0.1:5180';
const PASS = 'Prueba-QA-2026';
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let fallas = 0; const ok = (n, c, x = '') => { if (!c) fallas++; console.log(`${c ? 'OK   ' : 'FALLA'} ${n} ${x}`); };

// ── preparación por API (como lo haría una cajera)
const login = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'qa_cajera_fiesta', password: PASS }) })).json();
const H = { Authorization: `Bearer ${login.access_token}`, 'Content-Type': 'application/json' };
const mesas = (await (await fetch(`${API}/fiesta-fin-anio/mesas`, { headers: H })).json()).mesas;
const mesa = mesas.find((m) => m.sillas.filter((s) => s.estado === 'libre' && !s.extra).length >= 3);
const libres = mesa.sillas.filter((s) => s.estado === 'libre' && !s.extra).slice(0, 3);
const cliente = 'QA Multiforma ' + Date.now().toString().slice(-5);
const hoy = new Date().toISOString().slice(0, 10);
const res = await (await fetch(`${API}/fiesta-fin-anio/reservaciones`, { method: 'POST', headers: H, body: JSON.stringify({ cliente, fecha_venta: hoy, sillas: libres.map((s) => ({ silla_id: s.id, tipo: 'adulto' })) }) })).json();
ok('API: reservación creada', !!res.id, JSON.stringify(res).slice(0, 80));
const precio = res.sillas[0].precio_aplicado;
console.log(`   precio por silla = ${precio}`);
// silla 1 pagada completa (dirigido) + abono con 2 formas a las otras dos
const sillaPagada = libres[0].id;
let r = await fetch(`${API}/fiesta-fin-anio/reservaciones/${res.id}/pagos`, { method: 'POST', headers: H, body: JSON.stringify({ importe: precio || 100, forma_pago: 'Efectivo', fecha: hoy, silla_ids: [sillaPagada] }) });
ok('API: pago de la silla 1', r.status === 201, String(r.status));
r = await fetch(`${API}/fiesta-fin-anio/reservaciones/${res.id}/pagos/multiple`, { method: 'POST', headers: H, body: JSON.stringify({ pagos: [{ importe: 300, forma_pago: 'Efectivo', fecha: hoy, silla_ids: [libres[1].id, libres[2].id] }, { importe: 200, forma_pago: 'Tarjeta', fecha: hoy, silla_ids: [libres[1].id, libres[2].id] }] }) });
ok('API: cobro con 2 formas', r.status === 201, String(r.status));

// ── navegador
const puerto = 9800 + Math.floor(Math.random() * 100); const perfil = join(aqui, `edge_pg_${puerto}`); mkdirSync(perfil, { recursive: true });
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, 'about:blank'], { stdio: 'ignore' });
let ws; for (let i = 0; i < 60; i++) { try { const p = (await (await fetch(`http://127.0.0.1:${puerto}/json`)).json()).find((t) => t.type === 'page'); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch {} await esperar(500); }
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const cincos = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } if (d.method === 'Network.responseReceived' && d.params.response.status >= 500) cincos.push(d.params.response.url); };
const cdp = (method, params = {}) => new Promise((rs, rj) => { const mi = ++id; pend.set(mi, (d) => (d.error ? rj(new Error(d.error.message)) : rs(d.result))); ws.send(JSON.stringify({ id: mi, method, params })); });
const ev = async (e) => { const x = await cdp('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (x.exceptionDetails) throw new Error(x.exceptionDetails.exception?.description ?? x.exceptionDetails.text); return x.result.value; };
const espT = async (frag, ms = 15000) => { const fin = Date.now() + ms; while (Date.now() < fin) { if ((await ev('document.body.innerText')).includes(frag)) return true; await esperar(400); } return false; };
const espS = async (js, ms = 15000) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (await ev(js)) return true; await esperar(400); } return false; };
try {
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: BASE + '/login' });
  await espS(`!!document.querySelector('#login-email')`);
  for (const [sel, v] of [['#login-email', 'qa_cajera_fiesta'], ['#login-password', PASS]]) { await ev(`document.querySelector('${sel}').focus()`); await cdp('Input.insertText', { text: v }); }
  await ev(`document.querySelector('#login-submit').click()`);
  await espS(`location.pathname !== '/login'`);
  await cdp('Page.navigate', { url: BASE + '/fiesta-fin-anio' });
  ok('mapa carga', await espS(`!!document.querySelector('[aria-label^="Mesa ${mesa.numero},"]')`));
  await esperar(800);
  const titulo = await ev(`document.querySelector('[aria-label^="Mesa ${mesa.numero},"] title')?.textContent ?? ''`);
  ok('mapa: la mesa indica "1 pagada"', /1 pagada/.test(titulo), titulo);
  const colores = await ev(`[...document.querySelectorAll('[aria-label^="Mesa ${mesa.numero},"] path')].map(p=>p.getAttribute('fill')).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).length`);
  ok('mapa: la mesa pinta sillas con más de un color (pagada vs anticipo)', colores >= 2, `colores=${colores}`);
  // Reservaciones → buscar → abrir detalle
  await ev(`[...document.querySelectorAll('button,[role=tab]')].find(x=>x.textContent.trim()==='Reservaciones')?.click()`);
  await espS(`!!document.querySelector('input[type=text],input:not([type])')`);
  await esperar(800);
  await ev(`(()=>{const i=[...document.querySelectorAll('input')].find(x=>/Buscar|cliente/i.test(x.placeholder||''));i&&i.focus();return !!i})()`);
  await cdp('Input.insertText', { text: cliente });
  await esperar(900);
  ok('tarjeta de la reservación aparece', await espT(cliente));
  await ev(`(()=>{const e=[...document.querySelectorAll('*')].filter(x=>x.children.length===0&&x.textContent.trim()===${JSON.stringify(cliente)}).pop();e&&e.click();return !!e})()`);
  ok('detalle abre con columnas de pagos', await espT('Pago 1'));
  await esperar(800);
  const txt = await ev('document.body.innerText');
  ok('detalle: el cobro de 2 formas muestra el desglose "Efectivo $… + Tarjeta $…" en UNA celda', /Efectivo \$[\d.,]+ \+ Tarjeta \$[\d.,]+/.test(txt));
  // las dos sillas del cobro múltiple NO tienen valor en Pago 2 (solo "—" o "Abonar")
  const celdasPago2 = await ev(`(()=>{const th=[...document.querySelectorAll('th')].findIndex(x=>x.textContent.trim()==='Pago 2');if(th<0)return null;return [...document.querySelectorAll('tbody tr')].map(r=>r.children[th]?.textContent.trim()).filter(Boolean)})()`);
  ok('detalle: columna Pago 2 sin importes (un cobro = un Pago 1)', Array.isArray(celdasPago2) && celdasPago2.every((c) => !/\$\d/.test(c)), JSON.stringify(celdasPago2));
  const sh = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(aqui, 'qa_pago_multiforma.png'), Buffer.from(sh.data, 'base64'));
  ok('sin respuestas 5xx', cincos.length === 0, cincos.join(' '));
} catch (e) { ok('script sin excepciones', false, e.message); }
finally { try { ws.close(); } catch {} edge.kill(); await esperar(600); try { rmSync(perfil, { recursive: true, force: true }); } catch {} console.log(fallas ? `FALLAS ${fallas}` : 'TODO OK'); process.exit(0); }

// E2E: Resumen → COMPARATIVO con 2025 AL MISMO DÍA (acumulado) — se simula que hoy es 15/11/2026 (reservas de un solo día vs el mismo día del año pasado; "—" si 2025 no capturó).
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
const puerto = 9900 + Math.floor(Math.random() * 90); const perfil = join(aqui, `tmp/edge_dad_${puerto}`); mkdirSync(perfil, { recursive: true });
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
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{const R=Date,off=new R('2026-11-15T12:00:00').getTime()-R.now();class F extends R{constructor(...a){if(a.length===0)super(R.now()+off);else super(...a);}static now(){return R.now()+off;}}window.Date=F;})();` });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1400, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: BASE + '/login' });
  await espS(`!!document.querySelector('#login-email')`);
  for (const [sel, v] of [['#login-email', 'qa_supervisor_fiesta'], ['#login-password', PASS]]) { await ev(`document.querySelector('${sel}').focus()`); await cdp('Input.insertText', { text: v }); }
  await ev(`document.querySelector('#login-submit').click()`);
  await espS(`location.pathname !== '/login'`);
  await cdp('Page.navigate', { url: BASE + '/fiesta-fin-anio' });
  await espS(`[...document.querySelectorAll('[role=tab]')].length > 0`);
  await ev(`[...document.querySelectorAll('[role=tab]')].find(t=>/Resumen/i.test(t.textContent)).click()`);
  await esperar(2500);
  const filas = await ev(`[...document.querySelectorAll('table')][0].innerText`);
  console.log(filas.split(String.fromCharCode(10)).join(' | ').slice(0, 600));
  ok('encabezado 2025 al 15/11', filas.includes('2025 al 15/11'), '');
  const num = (etq) => ev(`(()=>{const r=[...document.querySelectorAll('table')][0].querySelectorAll('tbody tr');for(const x of r){const c=[...x.children].map(e=>e.innerText.trim());if(c[0]==='${etq}')return c;}return null})()`);
  const ad = await num('ADULTOS'), ni = await num('+NIÑOS'), pg = await num('R.PAGADAS'), tot = await num('TOTAL');
  ok('adultos 2025 acumulados al 15/11 = 148', ad && ad.includes('148'), JSON.stringify(ad));
  ok('niños 2025 acumulados al 15/11 = 5', ni && ni.includes('5'), JSON.stringify(ni));
  ok('pagadas 2025 al 15/11 = 45 (captura del Excel)', pg && pg.includes('45'), JSON.stringify(pg));
  ok('total 2025 al 15/11 = 286', tot && tot.includes('286'), JSON.stringify(tot));
  ok('hay nota de que se va sumando hasta el cierre', await ev(`!!document.querySelector('[data-testid="nota-acumulado"]')`));
  writeFileSync(join(aqui, 'tmp/acumulado.png'), Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  ok('sin excepciones de JavaScript', errores.length === 0, errores.join(' | '));
} catch (e) { ok('script sin excepciones', false, e.message); }
finally { try { ws.close(); } catch {} matarEdge(edge); await esperar(600); await borrarPerfil(perfil); console.log(fallas ? `FALLAS ${fallas}` : 'TODO OK'); process.exit(0); }

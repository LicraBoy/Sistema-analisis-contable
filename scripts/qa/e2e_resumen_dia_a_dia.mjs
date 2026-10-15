// E2E: Resumen → "Día a día contra 2025" (reservas de un solo día vs el mismo día del año pasado; "—" si 2025 no capturó).
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
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1400, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: BASE + '/login' });
  await espS(`!!document.querySelector('#login-email')`);
  for (const [sel, v] of [['#login-email', 'qa_supervisor_fiesta'], ['#login-password', PASS]]) { await ev(`document.querySelector('${sel}').focus()`); await cdp('Input.insertText', { text: v }); }
  await ev(`document.querySelector('#login-submit').click()`);
  await espS(`location.pathname !== '/login'`);
  await cdp('Page.navigate', { url: BASE + '/fiesta-fin-anio' });
  await espS(`[...document.querySelectorAll('[role=tab]')].length > 0`);
  await ev(`[...document.querySelectorAll('[role=tab]')].find(t=>/Resumen/i.test(t.textContent)).click()`);
  ok('tabla de tipos de precio con cortesías y total', await espS(`!!document.querySelector('[data-testid="tabla-tipo-precio"]') && document.querySelector('[data-testid="tabla-tipo-precio"]').innerText.includes('Cortesías') && document.body.innerText.includes('Lugares todavía libres')`));
  await ev(`document.querySelector('[data-testid="tabla-tipo-precio"]').scrollIntoView({block:'center'})`);
  writeFileSync(join(aqui, 'tmp/tipo_precio.png'), Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await esperar(1500);
  ok('Resumen: ya no hay tabla día a día (el detalle está en Cobros)', await ev(`!document.querySelector('[data-testid="tabla-dia-a-dia"]')`));
  ok('Resumen: tabla de boletos por tipo de precio con cortesías', await ev(`!!document.querySelector('[data-testid="tabla-tipo-precio"]') && document.querySelector('[data-testid="tabla-tipo-precio"]').innerText.includes('Cortesías')`));
  // ── Cobros → Día a día: columnas de niños contra 2025 (lista de boletos con fecha y monto)
  await ev(`[...document.querySelectorAll('[role=tab]')].find(t=>/Cobros/i.test(t.textContent)).click()`);
  await espS(`[...document.querySelectorAll('label,button,span')].some(e=>e.textContent.trim()==='Día a día')`);
  await ev(`[...document.querySelectorAll('label,button,span')].find(e=>e.textContent.trim()==='Día a día').click()`);
  ok('Cobros día a día: aparecen las columnas de niños vs 2025', await espS(`document.body.innerText.includes('Niños cobrado 2025') && document.body.innerText.includes('Niños vendidos 2025')`));
  const filasCobros = await ev(`[...document.querySelectorAll('table tbody tr')].map(r=>[...r.children].map(c=>c.textContent.trim()))`);
  ok('la tabla de Cobros tiene filas', filasCobros.length > 0, String(filasCobros.length));
  // 31/12: en 2025 se cobraron 4 niños de contado (4 × 1,090) y el 10/12 entran además 3 liquidaciones de 817.50.
  const f3112 = filasCobros.find((f) => f[0].startsWith('31/12'));
  ok('31/12: niños cobrados 2025 = $4,360 y 4 vendidos', !!f3112 && f3112.some((c) => c.includes('4,360')) && f3112.includes('4'), JSON.stringify(f3112));
  ok('Cobros: aparece la columna de adultos 2025', await ev(`document.body.innerText.includes('Adultos vendidos 2025')`));
  ok('Cobros: aparece la columna de adultos 2025', await ev(`document.body.innerText.includes('Adultos vendidos 2025')`));
  const f1012 = filasCobros.find((f) => f[0].startsWith('10/12'));
  ok('10/12: niños cobrados 2025 = 17×1,090 + 3×817.50 = $20,982.50', !!f1012 && f1012.some((c) => c.includes('20,982.50')) && f1012.includes('123') && f1012.includes('123'), JSON.stringify(f1012));
  // El contenedor de la tabla debe poder deslizarse hasta el último día
  const sc = await ev(`(()=>{const t=document.querySelector('table');let e=t.parentElement;while(e&&!(e.scrollHeight>e.clientHeight+5&&/auto|scroll/.test(getComputedStyle(e).overflowY)))e=e.parentElement;if(!e)return null;const antes=e.scrollTop;e.scrollTop=e.scrollHeight;return {alto:e.clientHeight,total:e.scrollHeight,antes,despues:e.scrollTop};})()`);
  ok('Cobros día a día: la tabla se desliza hacia abajo', !!sc && sc.despues > sc.antes, JSON.stringify(sc));
  const captura = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(aqui, 'tmp/dia_a_dia.png'), Buffer.from(captura.data, 'base64'));
  ok('sin excepciones de JavaScript', errores.length === 0, errores.join(' | '));
} catch (e) { ok('script sin excepciones', false, e.message); }
finally { try { ws.close(); } catch {} matarEdge(edge); await esperar(600); await borrarPerfil(perfil); console.log(fallas ? `FALLAS ${fallas}` : 'TODO OK'); process.exit(0); }

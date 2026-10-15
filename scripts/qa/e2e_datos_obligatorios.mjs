// E2E: reservar exige nombre, teléfono y correo (el botón "Reservar" queda deshabilitado hasta completarlos).
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
const puerto = 9900 + Math.floor(Math.random() * 90); const perfil = join(aqui, `tmp/edge_ob_${puerto}`); mkdirSync(perfil, { recursive: true });
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
const botonReservar = () => ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^Reservar \\d/.test(x.textContent.trim()));return b?{dis:b.disabled||b.hasAttribute('data-disabled')}:null})()`);
try {
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1100, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: BASE + '/login' });
  await espS(`!!document.querySelector('#login-email')`);
  for (const [sel, v] of [['#login-email', 'qa_cajera_fiesta'], ['#login-password', PASS]]) { await ev(`document.querySelector('${sel}').focus()`); await cdp('Input.insertText', { text: v }); }
  await ev(`document.querySelector('#login-submit').click()`);
  await espS(`location.pathname !== '/login'`);
  await cdp('Page.navigate', { url: BASE + '/fiesta-fin-anio' });
  await espS(`!!document.querySelector('[aria-label^="Mesa "]')`);
  await esperar(800);
  // abre la primera mesa con lugares libres
  await ev(`(()=>{const m=[...document.querySelectorAll('[aria-label^="Mesa "]')].find(x=>!x.getAttribute('aria-label').includes('sin lugares'));m.dispatchEvent(new MouseEvent('click',{bubbles:true}));})()`);
  ok('panel de la mesa abre', await espS(`[...document.querySelectorAll('button')].some(b=>/^Silla [0-9]+Libre$/.test(b.textContent.trim()))`));
  // elige una silla libre
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^Silla [0-9]+Libre$/.test(x.textContent.trim()));b&&b.click();return !!b})()`);
  await esperar(700);
  ok('aparecen los campos Nombre, Teléfono y Correo marcados como obligatorios', await espS(`(()=>{const t=[...document.querySelectorAll('label')].map(l=>l.textContent);return t.some(x=>x.includes('Nombre del cliente'))&&t.some(x=>x.includes('Teléfono'))&&t.some(x=>x.includes('Correo'))})()`));
  let b = await botonReservar();
  ok('sin datos: el botón Reservar está deshabilitado', !!b && b.dis);
  await escribirEn('Nombre del cliente', 'Maria Lopez');
  b = await botonReservar(); ok('solo nombre: sigue deshabilitado', !!b && b.dis);
  await escribirEn('Teléfono', '12345');
  b = await botonReservar(); ok('teléfono corto (5 dígitos): sigue deshabilitado', !!b && b.dis);
  await escribirEn('Teléfono', '669 123 4567');
  b = await botonReservar(); ok('teléfono ok pero sin correo: sigue deshabilitado', !!b && b.dis);
  await escribirEn('Correo', 'no-es-correo');
  b = await botonReservar(); ok('correo inválido: sigue deshabilitado', !!b && b.dis);
  await ev(`(()=>{const l=[...document.querySelectorAll('label')].find(x=>x.textContent.trim().startsWith('Correo'));const i=document.getElementById(l.getAttribute('for'));i.focus();i.select();})()`);
  await cdp('Input.insertText', { text: 'maria@correo.com' });
  await esperar(300);
  b = await botonReservar(); ok('nombre + teléfono + correo válidos: el botón se habilita', !!b && !b.dis, JSON.stringify(b));
} catch (e) { ok('script sin excepciones', false, e.message); }
finally { try { ws.close(); } catch {} matarEdge(edge); await esperar(600); await borrarPerfil(perfil); console.log(fallas ? `FALLAS ${fallas}` : 'TODO OK'); process.exit(0); }

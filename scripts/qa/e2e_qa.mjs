// E2E de QA por CDP (Edge headless) contra el entorno de pruebas aislado: front 5180 → backend 8011 (copia de la BD).
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
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

let totalFallas = 0;
const ok = (n, c, x = '') => { if (!c) totalFallas++; console.log(`${c ? 'OK   ' : 'FALLA'} ${n} ${x}`); };

async function sesion(nombre, fn) {
  const puerto = 9500 + Math.floor(Math.random() * 300);
  const perfil = join(aqui, `tmp/edge_qa_${puerto}`);
  mkdirSync(perfil, { recursive: true });
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, 'about:blank'], { stdio: 'ignore' });
  let ws;
  for (let i = 0; i < 60; i++) {
    try { const p = (await (await fetch(`http://127.0.0.1:${puerto}/json`)).json()).find((t) => t.type === 'page'); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch {}
    await esperar(500);
  }
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map(); const errores = []; const http5xx = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); return; }
    if (d.method === 'Runtime.exceptionThrown') errores.push('EXC ' + (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text));
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errores.push('console.error ' + d.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 200));
    if (d.method === 'Network.responseReceived' && d.params.response.status >= 500) http5xx.push(`${d.params.response.status} ${d.params.response.url}`);
  };
  const cdp = (method, params = {}) => new Promise((rs, rj) => { const mi = ++id; pend.set(mi, (d) => (d.error ? rj(new Error(d.error.message)) : rs(d.result))); ws.send(JSON.stringify({ id: mi, method, params })); });
  const ev = async (e) => { const r = await cdp('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
  const t = {
    cdp, ev,
    ir: async (ruta) => { await cdp('Page.navigate', { url: BASE + ruta }); await esperar(1800); },
    texto: () => ev('document.body.innerText'),
    ruta: () => ev('location.pathname'),
    esperarTexto: async (frag, ms = 15000) => { const fin = Date.now() + ms; while (Date.now() < fin) { if ((await ev('document.body.innerText')).includes(frag)) return true; await esperar(400); } return false; },
    escribir: async (sel, valor) => { for (let i = 0; i < 40 && !(await ev(`!!document.querySelector(${JSON.stringify(sel)})`)); i++) await esperar(300); await ev(`document.querySelector(${JSON.stringify(sel)}).focus()`); await cdp('Input.insertText', { text: valor }); },
    clic: (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(e){e.click();return true}return false})()`),
    clicTexto: (txt, tag = '*') => ev(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(tag)})].filter(x=>x.children.length<=2&&x.textContent.trim()===${JSON.stringify(txt)}).pop();if(e){e.click();return true}return false})()`),
    login: async (usuario, pass = PASS) => {
      await t.ir('/login');
      for (let i = 0; i < 40 && !(await ev("!!document.querySelector('#login-email')")); i++) await esperar(400);
      await t.escribir('#login-email', usuario);
      await t.escribir('#login-password', pass);
      await t.clic('#login-submit');
      for (let i = 0; i < 40 && (await t.ruta()) === '/login'; i++) await esperar(400); await esperar(500);
    },
  };
  try {
    await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1000, deviceScaleFactor: 1, mobile: false });
    console.log(`\n=== ${nombre} ===`);
    await fn(t);
    ok(`${nombre}: sin respuestas 5xx`, http5xx.length === 0, http5xx.join(' | '));
    const graves = errores.filter((e) => !/Failed to load resource|401|403|409|422|favicon/i.test(e));
    ok(`${nombre}: sin excepciones/errores de consola`, graves.length === 0, graves.slice(0, 3).join(' | '));
    const sh = await cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(aqui, `qa_${nombre.replace(/\W+/g, '_')}.png`), Buffer.from(sh.data, 'base64'));
  } catch (e) { ok(`${nombre}: sin excepciones del script`, false, e.message); }
  finally { try { ws.close(); } catch {} matarEdge(edge); await esperar(700); await borrarPerfil(perfil); }
}

await sesion('Sin sesion', async (t) => {
  await t.ir('/fiesta-fin-anio');
  for (let i = 0; i < 20 && (await t.ruta()) !== '/login'; i++) await esperar(500);
  ok('ruta protegida sin sesión manda a /login', (await t.ruta()) === '/login', await t.ruta());
  await t.login('qa_administrador', 'contraseña-equivocada');
  ok('contraseña incorrecta: sigue en /login', (await t.ruta()) === '/login');
  ok('contraseña incorrecta: mensaje claro y genérico', (await t.texto()).includes('Correo o contraseña incorrectos'));
});

await sesion('Cajera de Fiesta', async (t) => {
  await t.login('qa_cajera_fiesta');
  await t.ir('/fiesta-fin-anio');
  ok('cajera: entra a Fiesta', await t.esperarTexto('Fiesta de Fin de Año') && await t.esperarTexto('Reservaciones'));
  const txt = await t.texto();
  ok('cajera: ve las pestañas operativas', ['Croquis', 'Reservaciones', 'Cobros', 'Resumen'].every((x) => txt.includes(x)));
  ok('cajera: NO ve la pestaña Auditoría', !txt.includes('Auditoría'));
  ok('cajera: menú sin Administración ni Contabilidad', !txt.includes('Administración') && !/\bContabilidad\b/.test(txt));
  let hayMesas = false; for (let i = 0; i < 30 && !hayMesas; i++) { hayMesas = await t.ev(`!!document.querySelector('[aria-label^="Mesa "]')`); if (!hayMesas) await esperar(500); }
  ok('cajera: croquis dibuja mesas', hayMesas);
  await t.ir('/administracion');
  ok('cajera: /administracion → sin acceso', await t.esperarTexto('No tienes acceso a este módulo'));
  await t.ir('/facturacion');
  ok('cajera: /facturacion → sin acceso', await t.esperarTexto('No tienes acceso a este módulo'));
  const r = await t.ev(`fetch('/api/fiesta-fin-anio/auditoria',{credentials:'include'}).then(r=>r.status)`);
  ok('cajera: API de auditoría sin token propio responde 401/403', [401, 403].includes(r), String(r));
  await t.ir('/fiesta-fin-anio');
  await t.clicTexto('Cobros'); await esperar(1500);
  ok('cajera: pestaña Cobros abre', await t.esperarTexto('Cobranza', 12000) || await t.esperarTexto('Cobrado', 3000));
  await t.clicTexto('Día a día'); await esperar(1200);
  ok('cajera: Día a día muestra "Tipo de boleto"', await t.esperarTexto('Tipo de boleto', 12000));
});

await sesion('Administrador', async (t) => {
  await t.login('qa_administrador');
  await t.ir('/administracion');
  ok('admin: Administración abre', await t.esperarTexto('Usuarios'));
  const txt = await t.texto();
  ok('admin: ve Usuarios, Roles y permisos y Bitácora', ['Usuarios', 'Roles y permisos', 'Bitácora de seguridad'].every((x) => txt.includes(x)));
  ok('admin: lista a los usuarios QA', await t.esperarTexto('qa_cajera_fiesta', 10000));
  await t.clicTexto('Roles y permisos'); await esperar(1500);
  const roles = await t.texto();
  ok('admin: matriz muestra capacidad "Fiesta: ver la auditoría"', roles.includes('Fiesta: ver la auditoría'));
  await t.clicTexto('Bitácora de seguridad'); await esperar(1500);
  ok('admin: bitácora de seguridad lista eventos de login', (await t.texto()).toLowerCase().includes('login'));
  await t.ir('/fiesta-fin-anio');
  ok('admin: Fiesta muestra pestaña Auditoría', await t.esperarTexto('Auditoría'));
  await t.clicTexto('Auditoría'); await esperar(2000);
  const aud = await t.texto();
  ok('admin: Auditoría carga filtros y exportar', aud.includes('Exportar a Excel') && aud.includes('Cancelaciones'));
  ok('admin: Auditoría sin error en pantalla', !/No se pudo|Error/.test(aud));
});

await sesion('Contralor', async (t) => {
  await t.login('qa_contralor');
  await t.ir('/administracion');
  ok('contralor: /administracion → sin acceso', await t.esperarTexto('No tienes acceso a este módulo'));
  await t.ir('/facturacion');
  ok('contralor: Facturación sí abre', !(await t.texto()).includes('No tienes acceso a este módulo'));
  await t.ir('/fiesta-fin-anio');
  ok('contralor: ve Auditoría en Fiesta', await t.esperarTexto('Auditoría'));
});

await sesion('Movil cajera', async (t) => {
  await t.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 800, deviceScaleFactor: 2, mobile: true });
  await t.login('qa_cajera_fiesta');
  await t.ir('/fiesta-fin-anio');
  ok('móvil: la página carga', await t.esperarTexto('Fiesta de Fin de Año'));
  const desborde = await t.ev('document.documentElement.scrollWidth - document.documentElement.clientWidth');
  ok('móvil: sin desplazamiento horizontal de la página', desborde <= 4, `desborde=${desborde}px`);
});

console.log(totalFallas ? `\nFALLAS: ${totalFallas}` : '\nTODO OK');
process.exit(0);

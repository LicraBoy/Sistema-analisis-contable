// E2E: cortesías con supervisor, devolución desde el detalle, confirmación al cliente (correo/WhatsApp) y guía rápida.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const aqui = dirname(fileURLToPath(import.meta.url));
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const API = 'http://127.0.0.1:8011';
const BASE = 'http://127.0.0.1:5180';
const PASS = 'Prueba-QA-2026';
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
// Cierra Edge con TODOS sus procesos hijos y borra su perfil (si no, quedan ~100 MB por ejecución y se llena el disco).
const matarEdge = (e) => { try { spawnSync('taskkill', ['/PID', String(e.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} };
const borrarPerfil = async (dir) => { await esperar(800); try { rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 400 }); } catch {} };
let fallas = 0; const ok = (n, c, x = '') => { if (!c) fallas++; console.log(`${c ? 'OK   ' : 'FALLA'} ${n} ${x}`); };

const post = (ruta, cuerpo, h) => fetch(`${API}${ruta}`, { method: 'POST', headers: h, body: JSON.stringify(cuerpo) });
const loginApi = async (u) => (await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u, password: PASS }) })).json()).access_token;
const tokenCajera = await loginApi('qa_cajera_fiesta');
const H = { Authorization: `Bearer ${tokenCajera}`, 'Content-Type': 'application/json' };
const hoy = new Date().toISOString().slice(0, 10);
const mesas = (await (await fetch(`${API}/fiesta-fin-anio/mesas`, { headers: H })).json()).mesas;
const libres = mesas.flatMap((m) => m.sillas.filter((s) => s.estado === 'libre' && !s.extra)).slice(0, 6);
const datos = { telefono_o_cuarto: '669 123 4567', correo: 'qa@correo.com', fecha_venta: hoy };

// ── API con permisos reales
const cuerpoCortesia = { cliente: 'QA Cortesia', ...datos, sillas: [{ silla_id: libres[0].id, tipo: 'cortesia' }] };
let r = await post('/fiesta-fin-anio/reservaciones', cuerpoCortesia, H);
ok('cortesía sin motivo → 422', r.status === 422, String(r.status));
// La cajera NO pide contraseña: la cortesía queda "por autorizar" y se avisa a los supervisores.
r = await post('/fiesta-fin-anio/reservaciones', { ...cuerpoCortesia, cortesia_motivo: 'Invitado de gerencia' }, H);
const cort = await r.json();
ok('cajera: cortesía con motivo, sin contraseña → 201', r.status === 201, String(r.status));
ok('queda por autorizar (sin supervisor todavía)', cort.cortesias_por_autorizar === 1 && cort.cortesia?.autorizada_por === '', JSON.stringify(cort.cortesia));
r = await fetch(`${API}/fiesta-fin-anio/solicitudes-cortesia`, { headers: H });
ok('la cajera NO ve la campana de supervisores (403)', r.status === 403, String(r.status));
const tokenSup = await loginApi('qa_supervisor_fiesta');
const HS = { Authorization: `Bearer ${tokenSup}`, 'Content-Type': 'application/json' };
const pendSol = await (await fetch(`${API}/fiesta-fin-anio/solicitudes-cortesia`, { headers: HS })).json();
const miSol = pendSol.solicitudes.find((s) => s.reservacion_id === cort.id);
ok('el supervisor ve la solicitud con su motivo', !!miSol && miSol.motivo === 'Invitado de gerencia', JSON.stringify(pendSol.total));
r = await post(`/fiesta-fin-anio/solicitudes-cortesia/${miSol.id}/aprobar`, {}, H);
ok('la cajera no puede aprobar (403)', r.status === 403, String(r.status));
r = await post(`/fiesta-fin-anio/solicitudes-cortesia/${miSol.id}/aprobar`, {}, HS);
const aprobada = await r.json();
ok('el supervisor aprueba con un clic (sin contraseña)', r.status === 200 && aprobada.cortesias_por_autorizar === 0 && aprobada.cortesia.autorizada_por === 'QA Supervisor de Fiesta', JSON.stringify(aprobada.cortesia));
// rechazo: libera las sillas
r = await post('/fiesta-fin-anio/reservaciones', { ...cuerpoCortesia, cliente: 'QA Rechazo', sillas: [{ silla_id: libres[1].id, tipo: 'cortesia' }], cortesia_motivo: 'otra' }, H);
const rech = await r.json();
const sol2 = (await (await fetch(`${API}/fiesta-fin-anio/solicitudes-cortesia`, { headers: HS })).json()).solicitudes.find((s) => s.reservacion_id === rech.id);
r = await post(`/fiesta-fin-anio/solicitudes-cortesia/${sol2.id}/rechazar`, { nota: 'No aplica' }, HS);
const rechazada = await r.json();
ok('rechazar cancela la reservación y libera la silla', r.status === 200 && rechazada.estatus === 'cancelada');
const libresDespues = (await (await fetch(`${API}/fiesta-fin-anio/mesas`, { headers: H })).json()).mesas.flatMap((m) => m.sillas.filter((s) => s.estado === 'libre'));
ok('la silla vuelve a estar libre', libresDespues.some((s) => s.id === libres[1].id));
// el supervisor da la cortesía directo (sin solicitud)
r = await post('/fiesta-fin-anio/reservaciones', { ...cuerpoCortesia, cliente: 'QA Sup Directo', sillas: [{ silla_id: libres[1].id, tipo: 'cortesia' }], cortesia_motivo: 'Directivo' }, HS);
const directa = await r.json();
ok('supervisor: la cortesía queda autorizada al momento', r.status === 201 && directa.cortesias_por_autorizar === 0 && directa.cortesia.autorizada_por === 'QA Supervisor de Fiesta', JSON.stringify(directa.cortesia));
// para el flujo de pantalla y la devolución se vuelve a usar la autorización de un solo uso
const aut = await (await post('/auth/autorizar', { email: 'qa_supervisor_fiesta', password: PASS }, H)).json();
ok('el supervisor aún puede dar su autorización de un solo uso (precios/devoluciones)', !!aut.autorizacion);

// reservación para devolución: se paga y se cancela
const clienteDev = 'QA Devolucion ' + Date.now().toString().slice(-5);
const resDev = await (await post('/fiesta-fin-anio/reservaciones', { cliente: clienteDev, ...datos, sillas: [{ silla_id: libres[2].id, tipo: 'adulto' }] }, H)).json();
const precio = resDev.importe;
await post(`/fiesta-fin-anio/reservaciones/${resDev.id}/pagos`, { importe: precio, forma_pago: 'Efectivo', fecha: hoy }, H);
await fetch(`${API}/fiesta-fin-anio/reservaciones/${resDev.id}?motivo=${encodeURIComponent('QA cancelación')}`, { method: 'DELETE', headers: H });
// reservación activa para confirmación
const clienteConf = 'QA Confirma ' + Date.now().toString().slice(-5);
const resConf = await (await post('/fiesta-fin-anio/reservaciones', { cliente: clienteConf, ...datos, sillas: [{ silla_id: libres[3].id, tipo: 'adulto' }] }, H)).json();
ok('reservaciones de prueba creadas', !!resDev.id && !!resConf.id);

// ── navegador
const puerto = 9300 + Math.floor(Math.random() * 90); const perfil = join(aqui, `tmp/edge_cd_${puerto}`); mkdirSync(perfil, { recursive: true });
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, 'about:blank'], { stdio: 'ignore' });
let ws; for (let i = 0; i < 60; i++) { try { const p = (await (await fetch(`http://127.0.0.1:${puerto}/json`)).json()).find((t) => t.type === 'page'); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch {} await esperar(500); }
await new Promise((rs) => (ws.onopen = rs));
let id = 0; const pend = new Map(); const errores = []; const cincos = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); return; }
  if (d.method === 'Runtime.exceptionThrown') errores.push((d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).slice(0, 500));
  if (d.method === 'Network.responseReceived' && d.params.response.status >= 500) cincos.push(d.params.response.url);
};
const cdp = (method, params = {}) => new Promise((rs, rj) => { const mi = ++id; pend.set(mi, (d) => (d.error ? rj(new Error(d.error.message)) : rs(d.result))); ws.send(JSON.stringify({ id: mi, method, params })); });
const ev = async (e) => { const x = await cdp('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (x.exceptionDetails) throw new Error(x.exceptionDetails.exception?.description ?? x.exceptionDetails.text); return x.result.value; };
const espS = async (js, ms = 15000) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (await ev(js)) return true; await esperar(300); } return false; };
const espT = (frag, ms) => espS(`document.body.innerText.toLowerCase().includes(${JSON.stringify(frag.toLowerCase())})`, ms);
const escribirEtiqueta = async (etiqueta, valor) => {
  await espS(`[...document.querySelectorAll('label')].some(l=>l.textContent.trim().startsWith(${JSON.stringify(etiqueta)}))`, 8000);
  await ev(`(()=>{const l=[...document.querySelectorAll('label')].filter(x=>x.textContent.trim().startsWith(${JSON.stringify(etiqueta)})).pop();const i=l&&document.getElementById(l.getAttribute('for'));i.focus();i.select&&i.select()})()`);
  await cdp('Input.insertText', { text: valor });
  await esperar(250);
};
const clic = (txt) => ev(`(()=>{const b=[...document.querySelectorAll('button')].filter(x=>x.textContent.trim()===${JSON.stringify(txt)}).pop();if(b){b.click();return true}return false})()`);
const abrirReservacion = async (cliente, canceladas = false) => {
  await ev(`[...document.querySelectorAll('button,[role=tab]')].find(x=>x.textContent.trim()==='Reservaciones')?.click()`);
  const chip = canceladas ? 'Canceladas' : 'Todas'; await espS(`[...document.querySelectorAll('label,button')].some(x=>x.textContent.trim().startsWith(${JSON.stringify(chip)}))`, 8000); await ev(`[...document.querySelectorAll('label,button')].filter(x=>x.textContent.trim().startsWith(${JSON.stringify(chip)})).pop().click()`); await esperar(600);
  await espS(`[...document.querySelectorAll('input')].some(x=>/Buscar/i.test(x.placeholder||''))`);
  await ev(`(()=>{const i=[...document.querySelectorAll('input')].find(x=>/Buscar/i.test(x.placeholder||''));i.focus();i.select()})()`);
  await cdp('Input.insertText', { text: cliente });
  await espT(cliente, 10000);
  await ev(`(()=>{const e=[...document.querySelectorAll('*')].filter(x=>x.children.length===0&&x.textContent.trim()===${JSON.stringify(cliente)}).pop();e&&e.click()})()`);
  return espT('Imprimir recibo', 10000) || espT('Devoluciones', 10000);
};
try {
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1200, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: BASE + '/login' });
  await espS(`!!document.querySelector('#login-email')`);
  for (const [sel, v] of [['#login-email', 'qa_cajera_fiesta'], ['#login-password', PASS]]) { await ev(`document.querySelector('${sel}').focus()`); await cdp('Input.insertText', { text: v }); }
  await ev(`document.querySelector('#login-submit').click()`);
  await espS(`location.pathname !== '/login'`);
  await cdp('Page.navigate', { url: BASE + '/fiesta-fin-anio' });
  await espS(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Guía rápida')`);

  // guía rápida
  await clic('Guía rápida');
  ok('la guía rápida abre con sus temas', await espT('1. Entrar al sistema', 8000) && await espT('9. Reglas de oro', 3000));
  await ev(`document.querySelector('.mantine-Modal-close')?.click()`);
  await esperar(600);

  // devolución desde el detalle de la reservación cancelada
  ok('detalle de la reservación cancelada abre', await abrirReservacion(clienteDev, true));
  ok('muestra "Por devolver" con el monto cobrado', await espT('Por devolver', 8000));
  const textoDev = await ev('document.body.innerText');
  ok('el monto por devolver es el cobrado', textoDev.includes(precio.toLocaleString('en-US', { minimumFractionDigits: 2 })), `precio=${precio}`);
  await escribirEtiqueta('Motivo', 'Cliente desistió');
  await clic('Registrar devolución');
  ok('pide la autorización de un supervisor', await espT('Autorización de supervisor', 8000));
  await escribirEtiqueta('Usuario del supervisor', 'qa_supervisor_fiesta');
  await escribirEtiqueta('Contraseña del supervisor', PASS);
  await clic('Autorizar');
  ok('devolución registrada ("Nada por devolver")', await espT('Nada por devolver', 12000));
  ok('la tabla de devoluciones muestra el motivo y quién autorizó', (await espT('Cliente desistió', 3000)) && (await espT('qa_supervisor_fiesta', 3000)));
  await ev(`document.querySelector('.mantine-Modal-close')?.click()`);
  await esperar(700);

  // confirmación al cliente
  ok('detalle de la reservación activa abre', await abrirReservacion(clienteConf));
  await esperar(800);
  const enlaces = await ev(`({mail:[...document.querySelectorAll('a[href^="mailto:"]')].map(a=>decodeURIComponent(a.href)),wa:[...document.querySelectorAll('a[href^="https://wa.me/"]')].map(a=>decodeURIComponent(a.href))})`);
  ok('botón Correo con destinatario y mensaje', enlaces.mail.some((h) => h.includes('qa@correo.com') && h.includes(clienteConf) && h.includes('Confirmación de reservación')), enlaces.mail[0]?.slice(0, 120));
  ok('botón WhatsApp con el teléfono a 10 dígitos', enlaces.wa.some((h) => h.startsWith('https://wa.me/526691234567') && h.includes('Total:') && h.includes('Saldo pendiente')), enlaces.wa[0]?.slice(0, 120));
  const antes = (await (await fetch(`${API}/fiesta-fin-anio/reservaciones/${resConf.id}`, { headers: H })).json()).id;
  await ev(`document.querySelector('a[href^="https://wa.me/"]').addEventListener('click',e=>e.preventDefault(),{once:true});document.querySelector('a[href^="https://wa.me/"]').click()`);
  await esperar(1500);

  ok('sin excepciones de JavaScript', errores.length === 0, errores.join(' || '));
  ok('sin respuestas 5xx', cincos.length === 0, cincos.join(' '));
  void antes;
} catch (e) { ok('script sin excepciones', false, e.message); console.log(errores.join(' || ')); }
finally {
  try { ws.close(); } catch {} matarEdge(edge); await esperar(600); await borrarPerfil(perfil);
  // la confirmación quedó registrada en la auditoría
  try {
    const tokenSup = await loginApi('qa_supervisor_fiesta');
    const aud = await (await fetch(`${API}/fiesta-fin-anio/auditoria?reservacion_id=${resConf.id}`, { headers: { Authorization: `Bearer ${tokenSup}` } })).json();
    ok('la confirmación enviada quedó en la auditoría', aud.filas.some((f) => f.accion === 'confirmacion' && f.despues?.canal === 'whatsapp'));
    const aud2 = await (await fetch(`${API}/fiesta-fin-anio/auditoria?reservacion_id=${resDev.id}`, { headers: { Authorization: `Bearer ${tokenSup}` } })).json();
    ok('la devolución quedó en la auditoría con quién autorizó', aud2.filas.some((f) => f.accion === 'devolucion' && f.autorizo === 'qa_supervisor_fiesta'));
  } catch (e) { ok('consulta de auditoría', false, e.message); }
  console.log(fallas ? `FALLAS ${fallas}` : 'TODO OK'); process.exit(0);
}

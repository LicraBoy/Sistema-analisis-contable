/**
 * CroquisFiesta — plano interactivo del recinto con las mesas reales.
 *
 * El recinto (terreno, caminos, instalaciones, vegetación) se dibuja con SVG a
 * partir de `escenario/` — sin imágenes. Las mesas vienen del backend
 * (`useFiestaMesas`, refresco cada 15 s) y se colocan sobre el plano con las
 * posiciones guardadas, reflejadas 180° (`aPantalla`) para que la playa quede
 * abajo y el texto se lea derecho.
 *
 * Navegación: rueda, botones, arrastre y pinch táctil sobre un `viewBox` cuyo
 * aspecto siempre coincide con el del contenedor (así "ver todo" llena el
 * espacio y el zoom/centrado son exactos). Seleccionar una mesa solo cambia la
 * interfaz; nunca modifica su estado persistido.
 */

import './escenario/croquis.css';

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Chip,
  Collapse,
  Drawer,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useDebouncedValue, useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconArrowsMove,
  IconBuilding,
  IconChevronDown,
  IconChevronUp,
  IconDeviceFloppy,
  IconFocusCentered,
  IconMaximize,
  IconMinimize,
  IconMinus,
  IconPlus,
  IconSearch,
  IconX,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import {
  mensajeErrorFiesta,
  useFiestaGuardarPosiciones,
  useFiestaMesas,
  type EstadoSillaFiesta,
  type FiestaEvento,
  type FiestaMesa,
} from '../../api/fiestaHooks';
import DetalleReservacion from './DetalleReservacion';
import { EscenarioSalon, RotulosSalon, type ZonaMesas } from './escenario/EscenarioSalon';
import { MARGEN_PLATAFORMA, MUNDO, aPantalla, type Pt } from './escenario/geometria';
import { HOTEL } from './escenario/geometriaHotel';
import { MesaSvg } from './escenario/MesaSvg';
import PanelMesaFiesta from './PanelMesaFiesta';
import { entero, ESTADO_SILLA_CONFIG, ORDEN_ESTADOS_SILLA, porcentaje } from './fiestaUtils';

/** Vista: centro y ancho (en unidades del mundo). El alto sale del aspecto del contenedor. */
interface Vista {
  cx: number;
  cy: number;
  ancho: number;
}

const ANCHO_MUNDO = MUNDO.x1 - MUNDO.x0;
const ALTO_MUNDO = MUNDO.y1 - MUNDO.y0;
const CENTRO_MUNDO: Pt = { x: (MUNDO.x0 + MUNDO.x1) / 2, y: (MUNDO.y0 + MUNDO.y1) / 2 };
// El hotel completo rodea la zona de la fiesta: se ve al alejar el mapa o con Ver hotel completo.
const ANCHO_HOTEL = HOTEL.x1 - HOTEL.x0;
const ALTO_HOTEL = HOTEL.y1 - HOTEL.y0;
const CENTRO_HOTEL: Pt = { x: (HOTEL.x0 + HOTEL.x1) / 2, y: (HOTEL.y0 + HOTEL.y1) / 2 };
const ANCHO_MIN = 16; // acercamiento máximo (unidades visibles de ancho)
const UMBRAL_ARRASTRE = 5; // px: por debajo es un clic, por encima un desplazamiento
const PX_POR_UNIDAD_NUMERO = 9; // desde aquí se dibuja el número dentro de la mesa

const ESTADOS_FILTRO: EstadoSillaFiesta[] = ORDEN_ESTADOS_SILLA;

/** `viewBox` de una vista; el alto sale del aspecto del contenedor. */
function textoViewBox(v: Vista, aspecto: number): string {
  const alto = v.ancho * aspecto;
  return `${(v.cx - v.ancho / 2).toFixed(3)} ${(v.cy - alto / 2).toFixed(3)} ${v.ancho.toFixed(3)} ${alto.toFixed(3)}`;
}

/** ¿La vista se sale de la zona de la fiesta (con 8 u de holgura)? Solo entonces hace falta dibujar el hotel. */
function hotelVisibleDe(v: Vista, aspecto: number): boolean {
  const mitadAlto = (v.ancho * aspecto) / 2;
  const dentro =
    v.cx - v.ancho / 2 >= MUNDO.x0 - 8 &&
    v.cx + v.ancho / 2 <= MUNDO.x1 + 8 &&
    v.cy - mitadAlto >= MUNDO.y0 - 8 &&
    v.cy + mitadAlto <= MUNDO.y1 + 8;
  return !dentro;
}

export default function CroquisFiesta({ evento }: { evento: FiestaEvento }) {
  const { data, isLoading, isError, error } = useFiestaMesas();
  const guardarPosiciones = useFiestaGuardarPosiciones();
  const esMovil = useMediaQuery('(max-width: 600px)');
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false); // en móvil los chips de estado van plegados

  const [editor, setEditor] = useState(false);
  const [posiciones, setPosiciones] = useState<Record<number, Pt>>({}); // posiciones GUARDABLES editadas
  const [mesaId, setMesaId] = useState<number | null>(null);
  const [reservacionId, setReservacionId] = useState<number | null>(null);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const [leyendaAbierta, setLeyendaAbierta] = useState<boolean | null>(null); // null = según el tamaño de pantalla

  // Enlace a una mesa: /fiesta-fin-anio?mesa=42 abre el croquis buscando y centrando esa mesa.
  const [busqueda, setBusqueda] = useState(() => new URLSearchParams(window.location.search).get('mesa') ?? '');
  const [filtroEstados, setFiltroEstados] = useState<string[]>([]);
  const [filtroZona, setFiltroZona] = useState<string | null>(null);

  // La vista (zoom/desplazamiento) vive en una ref y se aplica directo al SVG: así un gesto no obliga a React a
  // volver a dibujar las 72 mesas en cada movimiento. React se entera con un pequeño retraso (redibujar).
  const vistaManual = useRef<Vista | null>(null); // null = ajustada al recinto completo
  const [, redibujar] = useReducer((n: number) => n + 1, 0);
  const temporizadorRender = useRef(0);
  const hotelVisibleRef = useRef(false);
  const aspectoRef = useRef(0.55);
  const ajusteRef = useRef<Vista>({ cx: CENTRO_MUNDO.x, cy: CENTRO_MUNDO.y, ancho: ANCHO_MUNDO });
  const [tam, setTam] = useState({ w: 0, h: 0 });

  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const anim = useRef(0);
  const vistaRef = useRef<Vista>({ cx: CENTRO_MUNDO.x, cy: CENTRO_MUNDO.y, ancho: ANCHO_MUNDO });
  const tamRef = useRef(tam);
  const punteros = useRef(new Map<number, Pt>());
  const gesto = useRef<
    | { tipo: 'pan'; inicio: Pt; vista0: Vista; movido: boolean }
    | { tipo: 'pinch'; dist0: number; centro0: Pt; vista0: Vista }
    | null
  >(null);
  const ignorarClic = useRef(false);
  const arrastreMesa = useRef<{ id: number; dx: number; dy: number } | null>(null);

  const mesas = data?.mesas ?? [];
  tamRef.current = tam;

  // ── Geometría de la vista ──
  const aspecto = tam.w > 0 && tam.h > 0 ? tam.h / tam.w : 0.55;
  const anchoAjuste = Math.max(ANCHO_MUNDO, ALTO_MUNDO / aspecto) * 1.03;
  const ajuste: Vista = { cx: CENTRO_MUNDO.x, cy: CENTRO_MUNDO.y, ancho: anchoAjuste };
  // Alejamiento máximo: el hotel completo (nunca menos que el ajuste a la fiesta).
  const anchoHotel = Math.max(ANCHO_HOTEL, ALTO_HOTEL / aspecto) * 1.03;
  const anchoMax = Math.max(anchoHotel, anchoAjuste);
  const vistaEf = vistaManual.current ?? ajuste;
  vistaRef.current = vistaEf;
  aspectoRef.current = aspecto;
  ajusteRef.current = ajuste;
  const viewBox = textoViewBox(vistaEf, aspecto);
  // El hotel solo se dibuja si la vista se sale de la zona de la fiesta (así la vista principal es mucho más ligera).
  const hotelVisible = hotelVisibleDe(vistaEf, aspecto);
  hotelVisibleRef.current = hotelVisible;
  const pxPorUnidad = tam.w > 0 ? tam.w / vistaEf.ancho : 0;

  /** Mantiene la vista dentro de una región recuperable (el recinto con un 8 % de holgura). */
  const acotar = (v: Vista): Vista => {
    const ancho = Math.min(Math.max(v.ancho, ANCHO_MIN), anchoMax);
    const holguraX = ANCHO_HOTEL * 0.04;
    const holguraY = ALTO_HOTEL * 0.04;
    return {
      ancho,
      cx: Math.min(Math.max(v.cx, HOTEL.x0 - holguraX), HOTEL.x1 + holguraX),
      cy: Math.min(Math.max(v.cy, HOTEL.y0 - holguraY), HOTEL.y1 + holguraY),
    };
  };

  /** Aplica la vista directo al SVG (sin pasar por React) y avisa a React poco después, o ya si cambia lo que se dibuja. */
  const fijarVista = (v: Vista | null, inmediato = false) => {
    vistaManual.current = v;
    const ef = v ?? ajusteRef.current;
    vistaRef.current = ef;
    svgRef.current?.setAttribute('viewBox', textoViewBox(ef, aspectoRef.current));
    const visible = hotelVisibleDe(ef, aspectoRef.current);
    window.clearTimeout(temporizadorRender.current);
    if (inmediato || visible !== hotelVisibleRef.current) {
      hotelVisibleRef.current = visible;
      redibujar();
    } else {
      temporizadorRender.current = window.setTimeout(redibujar, 140);
    }
  };

  /** Lleva la vista a `dest` con una animación corta (instantánea si el usuario prefiere menos movimiento). */
  const irA = (dest: Vista, opciones?: { volverAAjuste?: boolean }) => {
    cancelAnimationFrame(anim.current);
    const destino = acotar(dest);
    const desde = vistaRef.current;
    const reducir = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducir) {
      fijarVista(opciones?.volverAAjuste ? null : destino, true);
      return;
    }
    const t0 = performance.now();
    const paso = (t: number) => {
      const k = Math.min(1, (t - t0) / 420);
      const e = 1 - Math.pow(1 - k, 3);
      if (k >= 1) {
        fijarVista(opciones?.volverAAjuste ? null : destino, true);
        return;
      }
      fijarVista({
        cx: desde.cx + (destino.cx - desde.cx) * e,
        cy: desde.cy + (destino.cy - desde.cy) * e,
        ancho: desde.ancho + (destino.ancho - desde.ancho) * e,
      });
      anim.current = requestAnimationFrame(paso);
    };
    anim.current = requestAnimationFrame(paso);
  };

  const verTodo = () => irA(ajuste, { volverAAjuste: true });
  const verHotel = () => irA({ cx: CENTRO_HOTEL.x, cy: CENTRO_HOTEL.y, ancho: anchoHotel });

  /** Zoom alrededor de un punto de la pantalla (fracciones 0..1 del contenedor). */
  const zoomEn = (factor: number, fx = 0.5, fy = 0.5, animar = false) => {
    const v = vistaRef.current;
    const nuevoAncho = Math.min(Math.max(v.ancho * factor, ANCHO_MIN), anchoMax);
    const altoActual = v.ancho * aspecto;
    const altoNuevo = nuevoAncho * aspecto;
    const wx = v.cx - v.ancho / 2 + fx * v.ancho;
    const wy = v.cy - altoActual / 2 + fy * altoActual;
    const dest = { ancho: nuevoAncho, cx: wx - (fx - 0.5) * nuevoAncho, cy: wy - (fy - 0.5) * altoNuevo };
    if (animar) irA(dest);
    else {
      cancelAnimationFrame(anim.current);
      fijarVista(acotar(dest));
    }
  };

  // Medida del contenedor.
  useEffect(() => {
    const el = contenedorRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setTam({ w: el.clientWidth, h: el.clientHeight }));
    obs.observe(el);
    setTam({ w: el.clientWidth, h: el.clientHeight });
    return () => obs.disconnect();
  }, [isLoading, pantallaCompleta]);

  // Rueda: listener nativo no pasivo para impedir el scroll de la página.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const alRodar = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      zoomEn(e.deltaY > 0 ? 1.15 : 1 / 1.15, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
    };
    svg.addEventListener('wheel', alRodar, { passive: false });
    return () => svg.removeEventListener('wheel', alRodar);
    // zoomEn lee todo de refs y del aspecto; se re-registra si cambia el aspecto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, aspecto, anchoAjuste, anchoMax]);

  // Esc sale de pantalla completa.
  useEffect(() => {
    if (!pantallaCompleta) return;
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && setPantallaCompleta(false);
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [pantallaCompleta]);

  useEffect(
    () => () => {
      cancelAnimationFrame(anim.current);
      window.clearTimeout(temporizadorRender.current);
    },
    [],
  );

  // ── Posiciones en pantalla ──
  const posDe = (m: FiestaMesa): Pt => posiciones[m.id] ?? { x: m.x, y: m.y };
  const enPantalla = (m: FiestaMesa): Pt => aPantalla(posDe(m));

  /** Plataformas de las zonas de mesas: caja de las mesas de cada zona (con margen), siguen al reacomodar. */
  const zonas = useMemo<ZonaMesas[]>(() => {
    const porZona = new Map<string, Pt[]>();
    for (const m of mesas) {
      const p = aPantalla({ x: posiciones[m.id]?.x ?? m.x, y: posiciones[m.id]?.y ?? m.y });
      const clave = m.zona ?? 'Mesas';
      porZona.set(clave, [...(porZona.get(clave) ?? []), p]);
    }
    return [...porZona.entries()].map(([zona, pts]) => ({
      zona,
      caja: {
        x0: Math.min(...pts.map((p) => p.x)) - MARGEN_PLATAFORMA.x,
        y0: Math.min(...pts.map((p) => p.y)) - MARGEN_PLATAFORMA.y,
        x1: Math.max(...pts.map((p) => p.x)) + MARGEN_PLATAFORMA.x,
        y1: Math.max(...pts.map((p) => p.y)) + MARGEN_PLATAFORMA.y,
      },
    }));
  }, [mesas, posiciones]);

  // ── Búsqueda y filtros ──
  const [busquedaDiferida] = useDebouncedValue(busqueda, 350);
  const termino = busqueda.trim().toLowerCase();
  const coincide = (m: FiestaMesa): boolean =>
    String(m.numero).includes(termino) || m.sillas.some((s) => (s.cliente ?? '').toLowerCase().includes(termino));
  const resaltadas = useMemo(
    () => (termino ? new Set(mesas.filter(coincide).map((m) => m.id)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mesas, termino],
  );
  const zonasDisponibles = useMemo(() => [...new Set(mesas.map((m) => m.zona).filter((z): z is string => !!z))], [mesas]);
  const hayFiltros = filtroEstados.length > 0 || filtroZona !== null || termino !== '';

  const pasaFiltros = (m: FiestaMesa): boolean => {
    if (filtroZona && m.zona !== filtroZona) return false;
    if (filtroEstados.length > 0 && !m.sillas.some((s) => filtroEstados.includes(s.estado_pago ?? s.estado))) return false;
    if (resaltadas && !resaltadas.has(m.id)) return false;
    return true;
  };

  // Al buscar, el mapa se centra en la primera mesa encontrada.
  useEffect(() => {
    const t = busquedaDiferida.trim().toLowerCase();
    if (!t || tamRef.current.w === 0) return;
    const hallada = mesas.find(
      (m) => String(m.numero).includes(t) || m.sillas.some((s) => (s.cliente ?? '').toLowerCase().includes(t)),
    );
    if (!hallada) return;
    const p = aPantalla({ x: posiciones[hallada.id]?.x ?? hallada.x, y: posiciones[hallada.id]?.y ?? hallada.y });
    irA({ cx: p.x, cy: p.y, ancho: Math.min(anchoAjuste, 34) });
    // Solo reacciona al texto buscado (y a que el contenedor ya tenga medida), no a cada refresco de datos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaDiferida, tam.w > 0, mesas.length > 0]);

  const limpiarFiltros = () => {
    setBusqueda('');
    setFiltroEstados([]);
    setFiltroZona(null);
    verTodo();
  };

  // ── Gestos: pan, pinch y arrastre de mesas ──
  const aPuntoSvg = (clientX: number, clientY: number): Pt | null => {
    const svg = svgRef.current;
    const matriz = svg?.getScreenCTM();
    if (!svg || !matriz) return null;
    const p = svg.createSVGPoint();
    p.x = clientX;
    p.y = clientY;
    const r = p.matrixTransform(matriz.inverse());
    return { x: r.x, y: r.y };
  };

  const alPresionarMesa = (e: ReactPointerEvent<SVGGElement>, mesa: FiestaMesa) => {
    if (!editor) return; // fuera del editor la mesa deja pasar el gesto (pan/pinch) hasta el SVG
    e.stopPropagation();
    const p = aPuntoSvg(e.clientX, e.clientY);
    if (!p) return;
    const pos = enPantalla(mesa);
    arrastreMesa.current = { id: mesa.id, dx: p.x - pos.x, dy: p.y - pos.y };
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const alPresionar = (e: ReactPointerEvent<SVGSVGElement>) => {
    cancelAnimationFrame(anim.current);
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const n = punteros.current.size;
    if (n === 1) {
      gesto.current = { tipo: 'pan', inicio: { x: e.clientX, y: e.clientY }, vista0: vistaRef.current, movido: false };
    } else if (n === 2) {
      const [a, b] = [...punteros.current.values()];
      gesto.current = {
        tipo: 'pinch',
        dist0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        centro0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        vista0: vistaRef.current,
      };
      ignorarClic.current = true;
    }
  };

  const alMover = (e: ReactPointerEvent<SVGSVGElement>) => {
    const arrastre = arrastreMesa.current;
    if (arrastre) {
      const p = aPuntoSvg(e.clientX, e.clientY);
      if (!p) return;
      const x = Math.round((p.x - arrastre.dx) * 2) / 2; // ajusta a medias unidades
      const y = Math.round((p.y - arrastre.dy) * 2) / 2;
      setPosiciones((actual) => ({ ...actual, [arrastre.id]: aPantalla({ x, y }) })); // de pantalla a lo guardado
      return;
    }
    if (!punteros.current.has(e.pointerId)) return;
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesto.current;
    const { w, h } = tamRef.current;
    if (!g || w === 0 || h === 0) return;

    if (g.tipo === 'pinch' && punteros.current.size >= 2) {
      const [a, b] = [...punteros.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const centro = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const nuevoAncho = Math.min(Math.max(g.vista0.ancho * (g.dist0 / dist), ANCHO_MIN), anchoMax);
      const rect = contenedorRef.current?.getBoundingClientRect();
      if (!rect) return;
      // El punto del mundo bajo el centro inicial de los dedos sigue bajo el centro actual.
      const fx0 = (g.centro0.x - rect.left) / w;
      const fy0 = (g.centro0.y - rect.top) / h;
      const altoV0 = g.vista0.ancho * (h / w);
      const wx = g.vista0.cx - g.vista0.ancho / 2 + fx0 * g.vista0.ancho;
      const wy = g.vista0.cy - altoV0 / 2 + fy0 * altoV0;
      const fx = (centro.x - rect.left) / w;
      const fy = (centro.y - rect.top) / h;
      const altoN = nuevoAncho * (h / w);
      fijarVista(acotar({ ancho: nuevoAncho, cx: wx - (fx - 0.5) * nuevoAncho, cy: wy - (fy - 0.5) * altoN }));
      return;
    }

    if (g.tipo === 'pan') {
      const dx = e.clientX - g.inicio.x;
      const dy = e.clientY - g.inicio.y;
      if (!g.movido && Math.hypot(dx, dy) < UMBRAL_ARRASTRE) return; // aún es un clic
      if (!g.movido) {
        g.movido = true;
        ignorarClic.current = true;
        svgRef.current?.setPointerCapture(e.pointerId);
      }
      const porPx = g.vista0.ancho / w;
      fijarVista(acotar({ ancho: g.vista0.ancho, cx: g.vista0.cx - dx * porPx, cy: g.vista0.cy - dy * porPx }));
    }
  };

  const alSoltar = (e: ReactPointerEvent<SVGSVGElement>) => {
    arrastreMesa.current = null;
    punteros.current.delete(e.pointerId);
    if (punteros.current.size === 0) {
      gesto.current = null;
      // El clic que sigue a un arrastre o pinch no debe abrir una mesa.
      window.setTimeout(() => {
        ignorarClic.current = false;
      }, 0);
    } else if (punteros.current.size === 1) {
      const [resto] = [...punteros.current.values()];
      gesto.current = { tipo: 'pan', inicio: resto, vista0: vistaRef.current, movido: true };
    }
  };

  // Estables (no cambian entre renders): así MesaSvg (memo) no se vuelve a dibujar mientras se hace pan o zoom.
  const abrirMesa = useCallback((id: number) => {
    if (ignorarClic.current) return;
    setMesaId(id);
  }, []);
  const presionarMesaRef = useRef<(e: ReactPointerEvent<SVGGElement>, mesa: FiestaMesa) => void>(() => undefined);
  presionarMesaRef.current = alPresionarMesa;
  const presionarMesa = useCallback((e: ReactPointerEvent<SVGGElement>, mesa: FiestaMesa) => presionarMesaRef.current(e, mesa), []);

  // ── Guardado del reacomodo ──
  const hayCambios = Object.keys(posiciones).length > 0;
  const guardar = async () => {
    try {
      await guardarPosiciones.mutateAsync(Object.entries(posiciones).map(([id, p]) => ({ id: Number(id), x: p.x, y: p.y })));
      setPosiciones({});
      setEditor(false);
      notifications.show({ color: 'green', message: 'Posiciones guardadas.' });
    } catch (e) {
      notifications.show({ color: 'red', title: 'No se pudo guardar', message: mensajeErrorFiesta(e) });
    }
  };
  const salirDelEditor = () => {
    if (hayCambios && !window.confirm('Hay cambios sin guardar en el croquis. ¿Descartarlos?')) return;
    setPosiciones({});
    setEditor(false);
  };

  if (isLoading) return <Loader />;
  if (isError || !data) return <Alert color="red">{mensajeErrorFiesta(error)}</Alert>;

  const { totales } = data;
  const mesaSeleccionada = mesas.find((m) => m.id === mesaId) ?? null;
  const mostrarNumero = pxPorUnidad >= PX_POR_UNIDAD_NUMERO;
  const leyendaVisible = leyendaAbierta ?? false; // cerrada al inicio: no tapa el plano
  const coincidencias = resaltadas?.size ?? 0;

  return (
    <Stack
      gap="xs"
      style={
        pantallaCompleta
          ? { position: 'fixed', inset: 0, zIndex: 250, background: 'var(--mantine-color-body)', padding: 12, overflow: 'auto' }
          : undefined
      }
    >
      {/* Barra de herramientas */}
      <Group justify="space-between" align="flex-end" gap="xs">
        <Group gap="xs" align="flex-end">
          <TextInput
            placeholder="Buscar mesa o cliente…"
            aria-label="Buscar mesa o cliente"
            leftSection={<IconSearch size={16} />}
            value={busqueda}
            onChange={(e) => setBusqueda(e.currentTarget.value)}
            rightSection={
              busqueda ? (
                <Group gap={4} wrap="nowrap" pr={4}>
                  <Text size="xs" c="dimmed">
                    {coincidencias}
                  </Text>
                  <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Limpiar búsqueda" onClick={() => setBusqueda('')}>
                    <IconX size={14} />
                  </ActionIcon>
                </Group>
              ) : null
            }
            rightSectionWidth={busqueda ? 64 : undefined}
            w={{ base: '100%', sm: 270 }}
          />
          <Select
            placeholder="Todas las zonas"
            aria-label="Filtrar por zona"
            data={zonasDisponibles}
            value={filtroZona}
            onChange={setFiltroZona}
            clearable
            w={{ base: '100%', xs: 170 }}
            comboboxProps={{ zIndex: 400 }}
          />
          {esMovil && (
            <Button
              variant="default"
              size="sm"
              leftSection={filtrosAbiertos ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
              onClick={() => setFiltrosAbiertos((v) => !v)}
              rightSection={filtroEstados.length > 0 ? <Badge size="xs" circle>{filtroEstados.length}</Badge> : undefined}
            >
              Filtros por estado
            </Button>
          )}
          {hayFiltros && (
            <Button variant="subtle" color="gray" size="sm" onClick={limpiarFiltros}>
              Limpiar filtros
            </Button>
          )}
        </Group>
        <Group gap="xs">
          {editor ? (
            <>
              <Button variant="subtle" color="gray" onClick={salirDelEditor}>
                Salir
              </Button>
              <Button leftSection={<IconDeviceFloppy size={16} />} onClick={guardar} disabled={!hayCambios} loading={guardarPosiciones.isPending}>
                Guardar posiciones
              </Button>
            </>
          ) : (
            <Button variant="light" leftSection={<IconArrowsMove size={16} />} onClick={() => setEditor(true)}>
              Acomodar mesas
            </Button>
          )}
          <Button
            variant={pantallaCompleta ? 'filled' : 'default'}
            leftSection={pantallaCompleta ? <IconMinimize size={16} /> : <IconMaximize size={16} />}
            onClick={() => setPantallaCompleta((v) => !v)}
            title="Usa toda la pantalla para ver el croquis más grande (Esc para salir)"
          >
            {pantallaCompleta ? 'Salir' : 'Pantalla completa'}
          </Button>
        </Group>
      </Group>

      <Collapse in={!esMovil || filtrosAbiertos}>
        <Chip.Group multiple value={filtroEstados} onChange={setFiltroEstados}>
          <Group gap={6}>
            <Text size="xs" c="dimmed">
              Mostrar mesas con:
            </Text>
            {ESTADOS_FILTRO.map((estado) => (
              <Chip key={estado} value={estado} size="xs" variant="light">
                {ESTADO_SILLA_CONFIG[estado].etiqueta}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
      </Collapse>

      {editor && (
        <Alert color="violet" variant="light" py={6}>
          Modo editor: arrastra las mesas para acomodarlas y pulsa “Guardar posiciones”. Las reservaciones no se ven afectadas.
        </Alert>
      )}

      {/* Plano */}
      <div
        ref={contenedorRef}
        className="fc-contenedor"
        style={{
          height: pantallaCompleta ? 'calc(100dvh - 150px)' : esMovil ? 'calc(100dvh - 330px)' : 'calc(100vh - 290px)',
          minHeight: 380,
        }}
      >
        <svg
          ref={svgRef}
          viewBox={viewBox}
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid slice"
          role="group"
          aria-label="Croquis del recinto con las mesas de la fiesta"
          style={{ cursor: editor ? 'default' : 'grab' }}
          onPointerDown={alPresionar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={alSoltar}
        >
          <EscenarioSalon zonas={zonas} mostrarHotel={hotelVisible} />
          <RotulosSalon />
          {mesas.map((mesa) => {
            const p = enPantalla(mesa);
            return (
              <MesaSvg
                key={mesa.id}
                mesa={mesa}
                x={p.x}
                y={p.y}
                seleccionada={mesa.id === mesaId}
                resaltada={resaltadas?.has(mesa.id) ?? false}
                atenuada={hayFiltros && !pasaFiltros(mesa)}
                editando={editor}
                mostrarNumero={mostrarNumero}
                onAbrir={abrirMesa}
                onPresionar={presionarMesa}
              />
            );
          })}
        </svg>

        {/* Título */}
        <div className="fc-panel fc-vidrio fc-ocultar-movil" style={{ top: 10, left: 10, padding: '8px 12px', maxWidth: 'calc(100% - 70px)' }}>
          <Text fw={800} size="sm" lh={1.2} lineClamp={1}>
            {evento.nombre}
          </Text>
          <Text size="xs" c="dimmed" lh={1.2}>
            Mapa del recinto
          </Text>
        </div>

        {/* Leyenda */}
        <div className="fc-panel fc-vidrio" style={{ top: 10, right: 10, padding: '6px 10px', width: leyendaVisible ? 215 : 112 }}>
          <Group justify="space-between" gap="xs" wrap="nowrap" onClick={() => setLeyendaAbierta(!leyendaVisible)} style={{ cursor: 'pointer' }}>
            <Text size="xs" fw={700}>
              Leyenda
            </Text>
            {leyendaVisible ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
          </Group>
          <Collapse in={leyendaVisible}>
            <Stack gap={3} mt={6}>
              {ORDEN_ESTADOS_SILLA.map((estado) => (
                <Group key={estado} gap={7} wrap="nowrap">
                  <span
                    style={{
                      width: 12,
                      height: 9,
                      borderRadius: 3,
                      background: ESTADO_SILLA_CONFIG[estado].relleno,
                      border: `1.5px solid ${ESTADO_SILLA_CONFIG[estado].borde}`,
                      display: 'inline-block',
                      flex: 'none',
                    }}
                  />
                  <Text size="xs">{ESTADO_SILLA_CONFIG[estado].etiqueta}</Text>
                </Group>
              ))}
              <Group gap={7} wrap="nowrap">
                <span style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid #1c7ed6', background: 'rgba(28,126,214,.15)', flex: 'none' }} />
                <Text size="xs">Mesa seleccionada</Text>
              </Group>
              <Text size="xs" c="dimmed" mt={2}>
                El color de las sillas indica el estado de cada lugar.
              </Text>
            </Stack>
          </Collapse>
        </div>

        {/* Controles de zoom */}
        <div className="fc-panel fc-vidrio" style={{ right: 10, top: '50%', transform: 'translateY(-50%)', padding: 3 }}>
          <Stack gap={2}>
            <Tooltip label="Acercar" position="left">
              <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Acercar" onClick={() => zoomEn(1 / 1.4, 0.5, 0.5, true)}>
                <IconPlus size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Alejar" position="left">
              <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Alejar" onClick={() => zoomEn(1.4, 0.5, 0.5, true)}>
                <IconMinus size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Ver hotel completo" position="left">
              <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Ver hotel completo" onClick={verHotel}>
                <IconBuilding size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Ver todo el recinto" position="left">
              <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Ver todo el recinto" onClick={verTodo}>
                <IconFocusCentered size={18} />
              </ActionIcon>
            </Tooltip>
          </Stack>
        </div>

        {/* Resumen de mesas por estado */}
        <div className="fc-panel fc-vidrio" style={{ left: 10, bottom: 10, padding: '7px 12px' }}>
          <Group gap="md" wrap="wrap">
            <div>
              <Text size="xs" c="dimmed" lh={1.1}>
                Lugares
              </Text>
              <Text fw={800} size="sm" lh={1.3}>
                {entero(totales.capacidad)}
              </Text>
            </div>
            <div>
              <Text size="xs" c="dimmed" lh={1.1}>
                Libres
              </Text>
              <Text fw={800} size="sm" lh={1.3} c="teal">
                {entero(totales.libre)}
              </Text>
            </div>
            <div className="fc-ocultar-movil">
              <Text size="xs" c="dimmed" lh={1.1}>
                Ocupados
              </Text>
              <Text fw={800} size="sm" lh={1.3}>
                {entero(totales.ocupadas)}{' '}
                <Text span size="xs" c="dimmed" fw={500}>
                  {porcentaje(totales.pct_ocupacion)}
                </Text>
              </Text>
            </div>
            {ORDEN_ESTADOS_SILLA.filter((e) => e !== 'libre').map((estado) => (
              <div key={estado} className="fc-ocultar-movil">
                <Text size="xs" c="dimmed" lh={1.1}>
                  {ESTADO_SILLA_CONFIG[estado].etiqueta}
                </Text>
                <Badge size="sm" variant="light" color={ESTADO_SILLA_CONFIG[estado].mantine}>
                  {entero(totales[estado])}
                </Badge>
              </div>
            ))}
          </Group>
        </div>
      </div>

      <Drawer
        opened={mesaSeleccionada !== null}
        onClose={() => setMesaId(null)}
        position="right"
        size="lg"
        zIndex={300}
        title={mesaSeleccionada ? `Mesa ${mesaSeleccionada.numero}` : ''}
      >
        {mesaSeleccionada && (
          <PanelMesaFiesta key={mesaSeleccionada.id} mesa={mesaSeleccionada} evento={evento} onVerReservacion={setReservacionId} />
        )}
      </Drawer>

      <DetalleReservacion reservacionId={reservacionId} nombreEvento={evento.nombre} onClose={() => setReservacionId(null)} />
    </Stack>
  );
}

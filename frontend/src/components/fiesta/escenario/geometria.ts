/**
 * Geometría del recinto de la fiesta (datos editables, sin React).
 *
 * Sistema de coordenadas: el "mundo" usa las MISMAS unidades de cuadrícula que
 * las mesas (rejilla del Excel; 1 unidad ≈ 1 m, mesas separadas 6 × 5 u). Las
 * posiciones de las mesas guardadas en BD están en la orientación del Excel
 * (playa arriba); el croquis las muestra giradas 180° (playa abajo, texto
 * derecho) reflejándolas respecto a `CENTRO_ESPEJO` — ver `aPantalla`.
 *
 * Los elementos del recinto se midieron sobre `docs/croquis final.png`
 * (1774 × 887 px) y se convierten al mundo con `R(px, py)`. El ancla es el
 * centro de la zona de mesas de abajo (px 730,640 → mundo 71.9,79.1) y la
 * escala es uniforme, de modo que las dos zonas de mesas reales caen sobre las
 * dos plataformas de la referencia. Buffet 3 y Área de fumadores no aparecen en
 * esa imagen: vienen del plano del Excel (ubicación aproximada).
 */

export interface Pt {
  x: number;
  y: number;
}

// ── Conversión referencia → mundo ───────────────────────────────────────────

const ESCALA_REF = 0.115; // unidades de mundo por píxel de la referencia
const ANCLA_REF = { px: 730, py: 640, x: 71.9, y: 79.1 };

/** Píxel de `croquis final.png` → punto del mundo. */
export const R = (px: number, py: number): Pt => ({
  x: ANCLA_REF.x + (px - ANCLA_REF.px) * ESCALA_REF,
  y: ANCLA_REF.y + (py - ANCLA_REF.py) * ESCALA_REF,
});

/** Longitud en píxeles de la referencia → unidades de mundo. */
export const L = (px: number): number => px * ESCALA_REF;

const RP = (pts: [number, number][]): Pt[] => pts.map(([px, py]) => R(px, py));

/** Rectángulo del mundo completo (todo lo dibujado cabe aquí). */
export const MUNDO = (() => {
  const a = R(0, 0);
  const b = R(1774, 887);
  return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
})();

/**
 * Centro del espejo de 180° que convierte la posición guardada de una mesa
 * (orientación Excel) en posición de pantalla. Es el centro del plano original
 * del Excel (columnas/filas 1.05–179.89 × 0.5–100.6), constante histórica: no la
 * cambies o se moverían todas las mesas respecto a lo guardado.
 */
export const CENTRO_ESPEJO: Pt = { x: 90.47, y: 50.55 };

/** Mesa guardada → pantalla (y viceversa: el espejo es su propia inversa). */
export const aPantalla = (p: Pt): Pt => ({ x: 2 * CENTRO_ESPEJO.x - p.x, y: 2 * CENTRO_ESPEJO.y - p.y });

// ── Caminos ─────────────────────────────────────────────────────────────────

export interface Camino {
  id: string;
  puntos: Pt[]; // waypoints; se suavizan con Catmull-Rom
  ancho: number; // unidades de mundo
}

export const ANCHO_CAMINO = L(30);

export const CAMINOS: Camino[] = [
  {
    // Del acceso, bordea el circuito, pasa frente a la zona de mesas de abajo y sube por la derecha.
    id: 'principal',
    ancho: ANCHO_CAMINO,
    puntos: RP([
      [62, 498], [108, 572], [190, 612], [292, 602], [385, 580], [482, 546], [602, 526], [760, 520],
      [900, 522], [1040, 520], [1160, 526], [1232, 488], [1290, 424], [1340, 368], [1380, 300],
      [1404, 210], [1414, 120], [1406, 42], [1426, -10],
    ]),
  },
  {
    // Del circuito central hacia el escenario y la parte alta del recinto.
    id: 'norte',
    ancho: ANCHO_CAMINO,
    puntos: RP([
      [518, 336], [566, 268], [634, 226], [740, 226], [832, 210], [930, 166], [1010, 112],
      [1110, 98], [1230, 84], [1330, 52], [1422, 8],
    ]),
  },
  {
    // Ramal a la zona de camas de playa.
    id: 'playa',
    ancho: L(24),
    puntos: RP([[1190, 526], [1214, 548], [1262, 574], [1290, 600]]),
  },
  {
    // Conexión corta de la zona de mesas de abajo con el malecón.
    id: 'malecon',
    ancho: L(20),
    puntos: RP([[1100, 690], [1106, 724], [1110, 758]]),
  },
];

/** Circuito central (anillo con isla de palmas). */
export const CIRCUITO = {
  centro: R(403, 438),
  radio: L(135), // línea central del anillo
  ancho: L(28),
};

// ── Instalaciones ───────────────────────────────────────────────────────────

export interface Poligono {
  puntos: Pt[];
}

export const CANCHA: Poligono = { puntos: RP([[95, 155], [470, 115], [493, 285], [108, 326]]) };

export const ESCENARIO = (() => {
  const a = R(672, 170);
  const b = R(798, 238);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
})();

export const PISTA: Poligono = {
  puntos: RP([[620, 277], [838, 264], [846, 360], [886, 358], [881, 408], [645, 421], [634, 355]]),
};

export const ESCALONES_PISTA = (() => {
  const a = R(722, 420);
  const b = R(808, 505);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
})();

export const LOUNGE = {
  suelo: (() => {
    const a = R(145, 640);
    const b = R(290, 745);
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  })(),
  tarima: (() => {
    const a = R(156, 676);
    const b = R(222, 742);
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
  })(),
};

export interface Buffet {
  id: string;
  nombre: string;
  centro: Pt;
  /** Si se dibuja sobre una losa de concreto. */
  losa?: { w: number; h: number };
}

export const BUFFETS: Buffet[] = [
  { id: 'b1', nombre: 'Buffet 1', centro: R(378, 686) },
  { id: 'b2', nombre: 'Buffet 2', centro: R(1143, 630), losa: { w: L(76), h: L(72) } },
  // Arriba de las mesas 235/236 (zona 200): pantalla x≈108–114, borde superior de la plataforma y≈26.
  { id: 'b3', nombre: 'Buffet 3', centro: { x: 111, y: 22 } },
];

export const ALBERCA = (() => {
  const a = R(1467, 210);
  const b = R(1537, 327);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
})();

export const AREA_INFANTIL = { centro: R(1528, 85), rx: L(42), ry: L(46) };

export const GLORIETAS: Pt[] = [R(1563, 235), R(1560, 350)]; // pabellones octagonales (uno es el área de fumadores)

export const AREA_FUMADORES = { centro: R(1560, 350), radio: L(16) };

export const EDIFICIO_NORTE = (() => {
  const a = R(872, -20);
  const b = R(1036, 60);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
})();

/** Zona de camas de playa (arena con sombrillas y camastros). */
export const ZONA_CAMAS: Poligono = {
  puntos: RP([[1228, 564], [1362, 542], [1560, 522], [1774, 506], [1774, 692], [1272, 692]]),
};

export const MAR: Poligono = {
  puntos: RP([[1752, 330], [1774, 322], [1774, 742], [1746, 700], [1740, 520], [1748, 420]]),
};

export const MALECON = (() => {
  const a = R(0, 748);
  const b = R(1774, 826);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
})();

export const CALLE = (() => {
  const a = R(0, 826);
  const b = R(1774, 887);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
})();

export const CARRETERA_IZQUIERDA = (() => {
  const a = R(0, 0);
  const b = R(46, 887);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
})();

// ── Camas de playa: filas de sombrillas y camastros ─────────────────────────

export interface FilaCamas {
  desde: Pt;
  paso: number; // separación entre unidades (mundo)
  cantidad: number;
}

export const FILAS_CAMAS: FilaCamas[] = [
  { desde: R(1284, 596), paso: L(26), cantidad: 6 },
  { desde: R(1284, 650), paso: L(26), cantidad: 6 },
  { desde: R(1548, 580), paso: L(27), cantidad: 4 },
  { desde: R(1548, 640), paso: L(27), cantidad: 4 },
];

export const SOMBRILLAS_GRANDES: { centro: Pt; radio: number; color: string }[] = [
  { centro: R(1722, 556), radio: L(22), color: '#d9822b' },
  { centro: R(1664, 662), radio: L(24), color: '#8a5a3a' },
  { centro: R(1742, 606), radio: L(18), color: '#c8b48a' },
];

// ── Zonas de mesas (valores por defecto) ────────────────────────────────────

/** Margen de la plataforma alrededor de las mesas (unidades). */
export const MARGEN_PLATAFORMA = { x: 4.4, y: 4.6 };

/**
 * Cajas por defecto de las dos zonas de mesas (en pantalla), solo para que la
 * vegetación sepa dónde no plantar. La plataforma real se calcula con las
 * posiciones vigentes de las mesas (ver `EscenarioSalon`).
 */
export const ZONAS_MESAS_DEFECTO: Caja[] = [
  { x0: 41.9 - MARGEN_PLATAFORMA.x, y0: 71.6 - MARGEN_PLATAFORMA.y, x1: 101.9 + MARGEN_PLATAFORMA.x, y1: 86.6 + MARGEN_PLATAFORMA.y },
  { x0: 107.9 - MARGEN_PLATAFORMA.x, y0: 30.6 - MARGEN_PLATAFORMA.y, x1: 143.9 + MARGEN_PLATAFORMA.x, y1: 45.6 + MARGEN_PLATAFORMA.y },
];

export interface Caja {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// ── Etiquetas ───────────────────────────────────────────────────────────────

export type IconoEtiqueta = 'balon' | 'musica' | 'personas' | 'ninos' | 'sombrilla' | 'tabaco' | 'olas' | 'flecha';

export interface EtiquetaMapa {
  id: string;
  lineas: string[];
  pos: Pt;
  icono?: IconoEtiqueta;
  tam?: number; // tamaño de fuente (unidades)
  sutil?: boolean; // texto más discreto (rotulación de calles)
}

export const ETIQUETAS: EtiquetaMapa[] = [
  { id: 'cancha', lineas: ['Cancha', 'Fútbol de Playa'], pos: R(294, 232), icono: 'balon' },
  { id: 'escenario', lineas: ['Escenario', '(Grupo Musical)'], pos: R(735, 128), icono: 'musica' },
  { id: 'pista', lineas: ['Pista de', 'Baile'], pos: R(737, 352), icono: 'personas' },
  { id: 'lounge', lineas: ['Sala Lounge'], pos: R(208, 660), tam: 1.7 },
  { id: 'buffet1', lineas: ['Buffet 1'], pos: R(378, 726), tam: 1.7 },
  { id: 'buffet2', lineas: ['Buffet 2'], pos: R(1143, 664), tam: 1.7 },
  { id: 'buffet3', lineas: ['Buffet 3'], pos: { x: 111, y: 17.6 }, tam: 1.7 },
  { id: 'camas', lineas: ['Área de', 'Camas/Playa'], pos: R(1468, 610), icono: 'sombrilla' },
  { id: 'infantil', lineas: ['Área', 'infantil'], pos: R(1528, 86), icono: 'ninos', tam: 1.9 },
  { id: 'fumadores', lineas: ['Área de', 'fumadores'], pos: R(1560, 414), tam: 1.6 },
  { id: 'alberca', lineas: ['Alberca'], pos: R(1502, 346), tam: 1.6 },
  { id: 'playa', lineas: ['Playa'], pos: R(955, 786), icono: 'flecha', sutil: true },
];

/** Cajas aproximadas de las etiquetas, para que la vegetación no las tape. */
export const CAJAS_ETIQUETA: Caja[] = ETIQUETAS.map((e) => {
  const ancho = Math.max(...e.lineas.map((l) => l.length)) * (e.tam ?? 2.1) * 0.55 + 2;
  const alto = e.lineas.length * (e.tam ?? 2.1) * 1.25 + 5;
  return { x0: e.pos.x - ancho / 2, y0: e.pos.y - alto / 2, x1: e.pos.x + ancho / 2, y1: e.pos.y + alto / 2 };
});

export const ACCESO = {
  etiqueta: R(36, 305),
  flecha: R(104, 522),
};

// ── Utilidades geométricas ──────────────────────────────────────────────────

/** Caja que contiene un polígono. */
export function cajaDe(p: Poligono): Caja {
  const xs = p.puntos.map((q) => q.x);
  const ys = p.puntos.map((q) => q.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

export const cajaRect = (r: { x: number; y: number; w: number; h: number }, pad = 0): Caja => ({
  x0: r.x - pad,
  y0: r.y - pad,
  x1: r.x + r.w + pad,
  y1: r.y + r.h + pad,
});

/**
 * Curva suave (Catmull-Rom → Bézier cúbica) por los puntos dados.
 * Devuelve el atributo `d` de un `<path>`.
 */
export function trazoSuave(pts: Pt[], tension = 0.5): string {
  if (pts.length < 2) return '';
  const f = (n: number) => n.toFixed(2);
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = { x: p1.x + ((p2.x - p0.x) * tension) / 3, y: p1.y + ((p2.y - p0.y) * tension) / 3 };
    const c2 = { x: p2.x - ((p3.x - p1.x) * tension) / 3, y: p2.y - ((p3.y - p1.y) * tension) / 3 };
    d += ` C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return d;
}

/** Muestrea la misma curva de `trazoSuave` (para medir distancias a un camino). */
export function muestrearSuave(pts: Pt[], pasosPorTramo = 12, tension = 0.5): Pt[] {
  const salida: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = { x: p1.x + ((p2.x - p0.x) * tension) / 3, y: p1.y + ((p2.y - p0.y) * tension) / 3 };
    const c2 = { x: p2.x - ((p3.x - p1.x) * tension) / 3, y: p2.y - ((p3.y - p1.y) * tension) / 3 };
    for (let k = 0; k < pasosPorTramo; k++) {
      const t = k / pasosPorTramo;
      const u = 1 - t;
      salida.push({
        x: u * u * u * p1.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p2.x,
        y: u * u * u * p1.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p2.y,
      });
    }
  }
  salida.push(pts[pts.length - 1]);
  return salida;
}

/** Cadena `points` de un `<polygon>`. */
export const puntosSvg = (p: Poligono): string => p.puntos.map((q) => `${q.x.toFixed(2)},${q.y.toFixed(2)}`).join(' ');

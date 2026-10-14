/**
 * Geometría del hotel completo (datos editables, sin React).
 *
 * Se trazó a ojo sobre `docs/torres mazatlan.png` (foto aérea, ~882 × 632 px).
 * El jardín de la fiesta de esa foto (px x 8…395, y 390…583) es el rectángulo
 * `MUNDO` del croquis, así que el resto del hotel se coloca con el mismo mapeo
 * uniforme:
 *
 *     x = −12 + (px − 8) · 0.527        y = 5.5 + (py − 390) · 0.527
 *
 * Son figuras aproximadas, no topografía. Todo lo que cae DENTRO del jardín de
 * la fiesta ya está dibujado por la escena de la fiesta y aquí se omite, para
 * no tocarla.
 */

import { MUNDO, type Caja, type Pt } from './geometria';

const ESC = 0.527;

/** Píxel de la foto aérea → punto del mundo. */
export const H = (px: number, py: number): Pt => ({ x: -12 + (px - 8) * ESC, y: 5.5 + (py - 390) * ESC });
/** Longitud en píxeles de la foto → unidades del mundo. */
export const LH = (px: number): number => px * ESC;

const HP = (pts: [number, number][]): Pt[] => pts.map(([px, py]) => H(px, py));

/** Todo el hotel (los bordes de la foto aérea). */
export const HOTEL: Caja = (() => {
  const a = H(0, 0);
  const b = H(882, 632);
  return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
})();

/** Césped y fondo se dibujan más allá de los bordes del hotel, por si la vista queda holgada. */
export const MARGEN_FONDO = 170;

/** La zona de la fiesta (no se dibuja nada del hotel encima). */
export const ZONA_FIESTA: Caja = { x0: MUNDO.x0, y0: MUNDO.y0 - 3, x1: MUNDO.x1, y1: MUNDO.y1 };

// ── Tipos ───────────────────────────────────────────────────────────────────

export interface Forma {
  pts: Pt[];
}

export interface Edificio {
  id: string;
  techo: Pt[];
  fachada?: Pt[];
  /** Paneles solares sobre el techo (polígonos). */
  paneles?: Pt[][];
  /** Líneas de caballete / limahoya (pares de puntos). */
  caballetes?: [Pt, Pt][];
}

export interface Cancha {
  centro: Pt;
  w: number;
  h: number;
  rot: number;
}

export interface Palapa {
  centro: Pt;
  radio: number;
  /** Proporción alto/ancho (1 = redonda). */
  achatada?: number;
}

export interface Auto {
  centro: Pt;
  rot: number;
  color: string;
}

// ── Calles y caminos ────────────────────────────────────────────────────────

export const CALLE_NORTE = (() => {
  const a = H(0, -30);
  const b = H(882, 24);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
})();

export const BANQUETA_NORTE = (() => {
  const a = H(0, 24);
  const b = H(882, 38);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
})();

export const CARRETERA_OESTE = (() => {
  const a = H(-20, -30);
  const b = H(20, 390);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
})();

export interface CaminoHotel {
  id: string;
  puntos: Pt[];
  ancho: number;
}

/** Caminos del jardín del hotel. El primero termina justo en los caminos de la fiesta (x≈151.5, y≈3). */
export const CAMINOS_HOTEL: CaminoHotel[] = [
  { id: 'jardin-norte', ancho: LH(13), puntos: HP([[112, 206], [184, 236], [258, 278], [312, 330], [318, 388]]) },
  { id: 'tenis', ancho: LH(11), puntos: HP([[214, 128], [250, 176], [292, 226], [312, 296]]) },
  { id: 'hacia-torres', ancho: LH(12), puntos: HP([[318, 330], [400, 318], [470, 316], [545, 330], [606, 346]]) },
  { id: 'hacia-alberca', ancho: LH(12), puntos: HP([[470, 316], [496, 372], [514, 412], [530, 446]]) },
  { id: 'estacionamiento', ancho: LH(11), puntos: HP([[330, 176], [352, 232], [396, 282]]) },
];

// ── Estacionamiento ─────────────────────────────────────────────────────────

export const ESTACIONAMIENTO: Forma = {
  pts: HP([[300, 48], [482, 40], [484, 96], [728, 100], [726, 150], [642, 180], [482, 174], [300, 172]]),
};

export const ISLETA_ESTACIONAMIENTO = { centro: H(338, 122), radio: LH(13) };

export const TECHO_SOLAR: Forma = { pts: HP([[545, 44], [712, 52], [712, 99], [545, 92]]) };

export const CASETAS: { centro: Pt; w: number; h: number }[] = [
  { centro: H(504, 62), w: LH(16), h: LH(16) },
  { centro: H(624, 36), w: LH(22), h: LH(14) },
  { centro: H(500, 134), w: LH(12), h: LH(12) },
];

const COLORES_AUTOS = ['#f1f1ee', '#8f9399', '#2e3238', '#b73a35', '#3f6fb0', '#d6d3cb', '#5b6b52'];
export const AUTOS: Auto[] = [
  [398, 54, 80], [426, 50, 80], [454, 96, 100], [412, 124, 85], [438, 119, 90], [454, 124, 85],
  [612, 132, 5], [646, 150, 5], [674, 140, 8], [560, 152, 5], [722, 110, 90], [372, 92, 85], [350, 60, 82],
].map(([px, py, rot], i) => ({ centro: H(px, py), rot, color: COLORES_AUTOS[i % COLORES_AUTOS.length] }));

// ── Canchas de tenis ────────────────────────────────────────────────────────

export const CANCHAS_TENIS: Cancha[] = [
  { centro: H(88, 80), w: LH(118), h: LH(78), rot: 24 },
  { centro: H(214, 96), w: LH(118), h: LH(78), rot: 24 },
  { centro: H(88, 172), w: LH(118), h: LH(78), rot: 24 },
];

// ── Edificios ───────────────────────────────────────────────────────────────

/** Bodega/salón de techo gris corrugado (a la izquierda de las torres). */
export const EDIFICIO_GRIS: Forma = { pts: HP([[318, 190], [398, 186], [402, 282], [318, 286]]) };

export const EDIFICIOS: Edificio[] = [
  {
    id: 'torre-a',
    techo: HP([[470, 198], [520, 168], [598, 170], [608, 232], [562, 264], [484, 262]]),
    fachada: HP([[484, 262], [562, 264], [608, 232], [612, 252], [566, 284], [486, 298]]),
    caballetes: [[H(521, 170), H(548, 264)], [H(521, 170), H(472, 200)], [H(548, 264), H(604, 232)], [H(548, 218), H(600, 206)]],
  },
  {
    id: 'torre-b',
    techo: HP([[628, 226], [704, 176], [768, 232], [772, 266], [690, 304], [632, 264]]),
    fachada: HP([[632, 264], [690, 304], [772, 266], [774, 286], [694, 328], [622, 286]]),
    caballetes: [[H(704, 176), H(690, 304)], [H(704, 176), H(630, 228)], [H(690, 304), H(770, 240)]],
  },
  {
    id: 'torre-c',
    techo: HP([[722, 346], [790, 298], [850, 312], [868, 336], [822, 388], [790, 434], [748, 412]]),
    paneles: [HP([[762, 306], [802, 298], [810, 378], [770, 392]])],
    caballetes: [[H(790, 298), H(790, 434)], [H(722, 346), H(868, 336)]],
  },
  {
    id: 'torre-d',
    techo: HP([[776, 74], [852, 68], [880, 96], [880, 186], [842, 192], [776, 152]]),
    paneles: [HP([[822, 76], [876, 80], [876, 132], [822, 128]])],
    caballetes: [[H(776, 74), H(842, 192)], [H(850, 70), H(842, 192)]],
  },
  {
    id: 'edificio-e',
    techo: HP([[738, 482], [858, 486], [862, 522], [742, 524]]),
    fachada: HP([[726, 524], [862, 524], [868, 582], [720, 578]]),
    caballetes: [[H(800, 484), H(802, 524)]],
  },
];

/** Tira de edificio blanco al este de la torre D. */
export const TIRA_BLANCA: Forma = { pts: HP([[836, 194], [870, 198], [872, 292], [840, 290]]) };

/** Edificio junto a la alberca chica (techo claro con tragaluces). */
export const EDIFICIO_ALBERCA: Forma = { pts: HP([[505, 392], [546, 392], [546, 446], [505, 446]]) };

// ── Albercas, palapas y playa ───────────────────────────────────────────────

export const DECK_ALBERCA: Forma = { pts: HP([[498, 440], [690, 432], [696, 546], [500, 548]]) };

export const ALBERCA_PRINCIPAL = (() => {
  const a = H(533, 455);
  const b = H(650, 524);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y, rx: LH(24) };
})();

export const CHAPOTEADERO = (() => {
  const a = H(548, 392);
  const b = H(582, 414);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y, rx: LH(8) };
})();

/** Camastros azules alrededor de la alberca (filas). */
export const CAMASTROS_ALBERCA: { desde: Pt; paso: number; n: number; vertical: boolean }[] = [
  { desde: H(494, 466), paso: LH(11), n: 5, vertical: true },
  { desde: H(540, 536), paso: LH(12), n: 8, vertical: false },
  { desde: H(662, 462), paso: LH(11), n: 5, vertical: true },
];

/** En la foto es ovalada: ~110 × 65 px. */
export const PALAPA_GRANDE: Palapa = { centro: H(618, 538), radio: LH(54), achatada: 0.6 };

/** Palapas chicas (solo las que quedan fuera del jardín de la fiesta). */
export const PALAPAS: Palapa[] = [
  [204, 156, 15], [402, 436, 14], [462, 428, 12], [458, 470, 12], [612, 362, 12], [598, 398, 12],
  [684, 408, 11], [722, 452, 12], [436, 572, 11], [466, 570, 11], [496, 566, 11], [526, 562, 11],
]
  .map(([px, py, r]) => ({ centro: H(px, py), radio: LH(r) }))
  // Fuera del jardín de la fiesta y sin asomarse a su borde.
  .filter((p) => !(p.centro.x - p.radio < ZONA_FIESTA.x1 + 5 && p.centro.y + p.radio > ZONA_FIESTA.y0 && p.centro.y - p.radio < ZONA_FIESTA.y1));

/** Sombrillas de paja en la franja de playa (filas). */
export const SOMBRILLAS_PLAYA: { desde: Pt; paso: number; n: number }[] = [
  { desde: H(414, 556), paso: LH(26), n: 6 },
  { desde: H(428, 580), paso: LH(26), n: 6 },
];

/** Arena del club de playa, que continúa la zona de camas de la fiesta hacia el este. */
export const ARENA_CLUB: Forma = {
  pts: [
    { x: ZONA_FIESTA.x1 - 4, y: 78 },
    ...HP([[420, 536], [500, 540], [560, 548], [640, 586], [704, 600]]),
    { x: H(704, 600).x, y: HOTEL.y1 },
    { x: ZONA_FIESTA.x1 - 4, y: HOTEL.y1 },
  ],
};

/** Línea de costa: la arena baja hasta aquí y empieza el mar. */
export const PLAYA = (() => {
  const a = H(0, 598);
  const b = H(882, 612);
  return { arenaY: a.y, marY: b.y, x0: a.x - MARGEN_FONDO, x1: b.x + MARGEN_FONDO };
})();

// ── Etiquetas ───────────────────────────────────────────────────────────────

export interface EtiquetaHotel {
  id: string;
  lineas: string[];
  pos: Pt;
  tam: number;
}

export const ETIQUETAS_HOTEL: EtiquetaHotel[] = [
  { id: 'hotel', lineas: ['Hotel Torres Mazatlán'], pos: H(690, 13), tam: 5.2 },
  { id: 'estacionamiento', lineas: ['Estacionamiento'], pos: H(392, 168), tam: 4.6 },
  { id: 'tenis', lineas: ['Canchas de tenis'], pos: H(150, 13), tam: 4.4 },
  { id: 'alberca', lineas: ['Alberca'], pos: H(592, 489), tam: 4.2 },
  { id: 'chapoteadero', lineas: ['Chapoteadero'], pos: H(565, 380), tam: 3.4 },
  { id: 'palapa', lineas: ['Palapa'], pos: H(618, 586), tam: 3.6 },
  { id: 'playa-hotel', lineas: ['Playa'], pos: H(560, 622), tam: 5.2 },
];

/** Cajas de las etiquetas del hotel, para que la vegetación no las tape. */
export const CAJAS_ETIQUETA_HOTEL: Caja[] = ETIQUETAS_HOTEL.map((e) => {
  const ancho = Math.max(...e.lineas.map((l) => l.length)) * e.tam * 0.55 + 3;
  const alto = e.lineas.length * e.tam * 1.3 + 3;
  return { x0: e.pos.x - ancho / 2, y0: e.pos.y - alto / 2, x1: e.pos.x + ancho / 2, y1: e.pos.y + alto / 2 };
});

// ── Utilidades ──────────────────────────────────────────────────────────────

export const cajaDeForma = (f: Forma): Caja => {
  const xs = f.pts.map((p) => p.x);
  const ys = f.pts.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
};

export const puntos = (pts: Pt[]): string => pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

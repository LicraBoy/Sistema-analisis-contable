/**
 * Vegetación del recinto: palmeras, árboles y arbustos.
 *
 * Se genera una sola vez y de forma DETERMINISTA (PRNG con semilla fija), así el
 * croquis se ve igual en cada carga y en cada dispositivo. Las plantas se
 * reparten por zonas de jardín tomadas de la referencia y nunca caen sobre
 * caminos, instalaciones, zonas de mesas ni etiquetas.
 */

import {
  ACCESO,
  ALBERCA,
  AREA_INFANTIL,
  BUFFETS,
  CAJAS_ETIQUETA,
  CALLE,
  CAMINOS,
  CANCHA,
  CARRETERA_IZQUIERDA,
  CIRCUITO,
  EDIFICIO_NORTE,
  ESCALONES_PISTA,
  ESCENARIO,
  GLORIETAS,
  LOUNGE,
  MALECON,
  MAR,
  MUNDO,
  PISTA,
  R,
  ZONAS_MESAS_DEFECTO,
  ZONA_CAMAS,
  cajaDe,
  cajaRect,
  muestrearSuave,
  type Caja,
  type Pt,
} from './geometria';
import {
  ARENA_CLUB,
  CAJAS_ETIQUETA_HOTEL,
  CAMINOS_HOTEL,
  CANCHAS_TENIS,
  CASETAS,
  CHAPOTEADERO,
  DECK_ALBERCA,
  EDIFICIO_ALBERCA,
  EDIFICIO_GRIS,
  EDIFICIOS,
  ESTACIONAMIENTO,
  H,
  HOTEL,
  PALAPA_GRANDE,
  PALAPAS,
  PLAYA,
  TECHO_SOLAR,
  TIRA_BLANCA,
  ZONA_FIESTA,
} from './geometriaHotel';

export type TipoPlanta = 'palma' | 'arbol' | 'arbusto';

export interface Planta {
  x: number;
  y: number;
  tipo: TipoPlanta;
  variante: 0 | 1 | 2;
  tono: 0 | 1 | 2;
  escala: number;
  rot: number;
  radio: number; // radio aproximado de la copa (unidades)
}

/** Radio base de cada tipo antes de escalar (unidades). */
const RADIO_BASE: Record<TipoPlanta, number> = { palma: 2.5, arbol: 2.9, arbusto: 1.2 };

// ── PRNG determinista ───────────────────────────────────────────────────────

export function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Exclusiones ─────────────────────────────────────────────────────────────

type Exclusion =
  | { k: 'caja'; c: Caja }
  | { k: 'circ'; x: number; y: number; r: number }
  | { k: 'camino'; id: string; pts: Pt[]; mitad: number };

const caja = (c: Caja, pad = 0): Exclusion => ({
  k: 'caja',
  c: { x0: c.x0 - pad, y0: c.y0 - pad, x1: c.x1 + pad, y1: c.y1 + pad },
});

export const EXCLUSIONES: Exclusion[] = [
  ...ZONAS_MESAS_DEFECTO.map((z) => caja(z, 1.6)),
  caja(cajaDe(CANCHA), 1.6),
  caja(cajaRect(ESCENARIO), 2.2),
  caja(cajaDe(PISTA), 1.8),
  caja(cajaRect(ESCALONES_PISTA), 1.2),
  caja(cajaRect(LOUNGE.suelo), 1.2),
  caja(cajaRect(ALBERCA), 2.4),
  caja(cajaRect(EDIFICIO_NORTE), 1.2),
  caja(cajaDe(ZONA_CAMAS), 0.5),
  caja(cajaDe(MAR), 0.5),
  caja(cajaRect(MALECON), 0),
  caja(cajaRect(CALLE), 0),
  caja(cajaRect(CARRETERA_IZQUIERDA), 0.6),
  ...CAJAS_ETIQUETA.map((c) => caja(c, 0.4)),
  { k: 'circ', x: AREA_INFANTIL.centro.x, y: AREA_INFANTIL.centro.y, r: Math.max(AREA_INFANTIL.rx, AREA_INFANTIL.ry) + 1.4 },
  ...GLORIETAS.map((g): Exclusion => ({ k: 'circ', x: g.x, y: g.y, r: 4.6 })),
  ...BUFFETS.map((b): Exclusion => ({ k: 'circ', x: b.centro.x, y: b.centro.y, r: b.losa ? 6.2 : 4.4 })),
  // Anillo del circuito: ni la banda ni el hueco central (ahí van palmas fijas).
  { k: 'circ', x: CIRCUITO.centro.x, y: CIRCUITO.centro.y, r: CIRCUITO.radio + CIRCUITO.ancho / 2 + 1.2 },
  { k: 'circ', x: ACCESO.flecha.x, y: ACCESO.flecha.y, r: 2.4 },
  ...CAMINOS.map((c): Exclusion => ({ k: 'camino', id: c.id, pts: muestrearSuave(c.puntos), mitad: c.ancho / 2 + 1.3 })),
];

function distSegmento(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** ¿La copa de radio `r` centrada en (x,y) toca alguna zona protegida? */
export function estaExcluido(x: number, y: number, r: number, exclusiones: Exclusion[] = EXCLUSIONES): boolean {
  for (const e of exclusiones) {
    if (e.k === 'caja') {
      if (x + r > e.c.x0 && x - r < e.c.x1 && y + r > e.c.y0 && y - r < e.c.y1) return true;
    } else if (e.k === 'circ') {
      if (Math.hypot(x - e.x, y - e.y) < e.r + r * 0.6) return true;
    } else {
      for (let i = 0; i < e.pts.length - 1; i++) {
        if (distSegmento({ x, y }, e.pts[i], e.pts[i + 1]) < e.mitad + r * 0.55) return true;
      }
    }
  }
  return false;
}

// ── Zonas de jardín (píxeles de la referencia) y cantidades ─────────────────

interface ZonaPlantas {
  caja: Caja;
  n: number;
  palmas: number; // fracción de palmeras; el resto son árboles y algún arbusto
}

const zona = (px0: number, py0: number, px1: number, py1: number, n: number, palmas: number): ZonaPlantas => {
  const a = R(px0, py0);
  const b = R(px1, py1);
  return { caja: { x0: a.x, y0: a.y, x1: b.x, y1: b.y }, n, palmas };
};

const ZONAS: ZonaPlantas[] = [
  zona(50, 60, 150, 330, 9, 0.55), // borde izquierdo, junto a la cancha
  zona(46, 500, 250, 745, 14, 0.8), // palmeral inferior izquierdo
  zona(50, -10, 470, 115, 13, 0.35), // franja norte izquierda
  zona(490, 30, 670, 250, 8, 0.45), // entre cancha y escenario
  zona(190, 300, 272, 480, 5, 0.85), // flanco izquierdo del circuito
  zona(840, 240, 960, 420, 7, 0.75), // junto a la pista
  zona(1040, -10, 1774, 95, 17, 0.4), // franja norte derecha
  zona(1378, 90, 1470, 520, 10, 0.5), // lado derecho de la zona de mesas
  zona(1040, 536, 1112, 745, 4, 0.5), // junto al Buffet 2
  zona(292, 612, 442, 745, 4, 0.5), // entre lounge y Buffet 1
  zona(1600, 30, 1774, 320, 8, 0.6), // costado derecho (alberca / mar)
];

/** Palmas del islote central, colocadas a mano (polares respecto al centro del circuito). */
const ISLOTE: { ang: number; dist: number; esc: number }[] = [
  { ang: 0, dist: 0, esc: 1.55 },
  { ang: 30, dist: 6.2, esc: 1.2 },
  { ang: 100, dist: 6.6, esc: 1.3 },
  { ang: 165, dist: 6.0, esc: 1.15 },
  { ang: 225, dist: 6.4, esc: 1.25 },
  { ang: 290, dist: 6.1, esc: 1.2 },
  { ang: 60, dist: 10.5, esc: 0.95 },
  { ang: 150, dist: 10.8, esc: 0.9 },
  { ang: 255, dist: 10.6, esc: 0.95 },
  { ang: 335, dist: 10.4, esc: 0.9 },
];

// ── Generación ──────────────────────────────────────────────────────────────

const SEMILLA = 20261231;

export function generarVegetacion(semilla = SEMILLA): Planta[] {
  const azar = mulberry32(semilla);
  const plantas: Planta[] = [];

  const nueva = (x: number, y: number, tipo: TipoPlanta, escalaFija?: number): Planta => {
    const escala = escalaFija ?? (tipo === 'arbusto' ? 0.8 + azar() * 0.7 : 0.78 + azar() * 0.55);
    return {
      x,
      y,
      tipo,
      variante: Math.floor(azar() * 3) as 0 | 1 | 2,
      tono: Math.floor(azar() * 3) as 0 | 1 | 2,
      escala,
      rot: azar() * 360,
      radio: RADIO_BASE[tipo] * escala,
    };
  };

  // Islote central (fijo).
  for (const p of ISLOTE) {
    const rad = (p.ang * Math.PI) / 180;
    plantas.push(
      nueva(CIRCUITO.centro.x + Math.cos(rad) * p.dist, CIRCUITO.centro.y + Math.sin(rad) * p.dist, 'palma', p.esc),
    );
  }

  // Zonas de jardín.
  for (const z of ZONAS) {
    let colocadas = 0;
    let intentos = 0;
    while (colocadas < z.n && intentos < z.n * 70) {
      intentos++;
      const x = z.caja.x0 + azar() * (z.caja.x1 - z.caja.x0);
      const y = z.caja.y0 + azar() * (z.caja.y1 - z.caja.y0);
      const sorteo = azar();
      const tipo: TipoPlanta = sorteo < z.palmas ? 'palma' : sorteo < 0.93 ? 'arbol' : 'arbusto';
      const candidata = nueva(x, y, tipo);
      if (x < MUNDO.x0 + 1 || x > MUNDO.x1 - 1 || y < MUNDO.y0 - 3 || y > MUNDO.y1 - 1) continue;
      if (estaExcluido(x, y, candidata.radio)) continue;
      // Separación: copas que se rozan, no que se apilan.
      if (plantas.some((q) => Math.hypot(q.x - x, q.y - y) < (q.radio + candidata.radio) * 0.72)) continue;
      plantas.push(candidata);
      colocadas++;
    }
  }

  // Arbustos sueltos para romper la regularidad de los bordes de los caminos.
  for (const c of CAMINOS) {
    const pts = muestrearSuave(c.puntos, 8);
    for (let i = 3; i < pts.length - 3; i += 5) {
      if (azar() < 0.5) continue;
      const lado = azar() < 0.5 ? -1 : 1;
      const p = pts[i];
      const q = pts[i + 1];
      const largo = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      const sep = c.ancho / 2 + 1.7 + azar() * 1.8;
      const x = p.x + (-(q.y - p.y) / largo) * sep * lado;
      const y = p.y + ((q.x - p.x) / largo) * sep * lado;
      const arbusto = nueva(x, y, 'arbusto');
      // El arbusto va pegado a SU camino a propósito: se comprueba contra todo lo demás.
      if (estaExcluido(x, y, arbusto.radio, EXCLUSIONES.filter((e) => !(e.k === 'camino' && e.id === c.id)))) continue;
      if (plantas.some((o) => Math.hypot(o.x - x, o.y - y) < (o.radio + arbusto.radio) * 0.75)) continue;
      plantas.push(arbusto);
    }
  }

  // Orden de dibujo: de arriba abajo, para que las copas inferiores tapen a las superiores.
  return plantas.sort((a, b) => a.y - b.y);
}

export const PLANTAS: Planta[] = generarVegetacion();

// ── Vegetación del hotel (fuera del jardín de la fiesta) ────────────────────
// Va aparte y con su propia semilla: así las plantas de la fiesta no cambian.

const ESCALA_HOTEL = 1.8; // a escala de la foto aérea las copas son más grandes que en el croquis de la fiesta

function exclusionesHotel(): Exclusion[] {
  const cajaPol = (pts: Pt[], pad = 1.2): Exclusion => {
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    return caja({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }, pad);
  };
  const lista: Exclusion[] = [
    // La fiesta completa: ahí manda su propia escena.
    caja(ZONA_FIESTA, 2),
    cajaPol(ESTACIONAMIENTO.pts, 1.5),
    cajaPol(TECHO_SOLAR.pts, 1.5),
    ...CASETAS.map((c): Exclusion => caja({ x0: c.centro.x - c.w, y0: c.centro.y - c.h, x1: c.centro.x + c.w, y1: c.centro.y + c.h }, 1)),
    ...CANCHAS_TENIS.map((c): Exclusion => ({ k: 'circ', x: c.centro.x, y: c.centro.y, r: Math.max(c.w, c.h) * 0.62 })),
    cajaPol(EDIFICIO_GRIS.pts, 2),
    ...EDIFICIOS.map((e) => cajaPol([...e.techo, ...(e.fachada ?? [])], 2.4)),
    cajaPol(TIRA_BLANCA.pts, 1.5),
    cajaPol(EDIFICIO_ALBERCA.pts, 2),
    cajaPol(DECK_ALBERCA.pts, 2),
    caja({ x0: CHAPOTEADERO.x, y0: CHAPOTEADERO.y, x1: CHAPOTEADERO.x + CHAPOTEADERO.w, y1: CHAPOTEADERO.y + CHAPOTEADERO.h }, 2),
    { k: 'circ', x: PALAPA_GRANDE.centro.x, y: PALAPA_GRANDE.centro.y, r: PALAPA_GRANDE.radio + 1.5 },
    ...PALAPAS.map((p): Exclusion => ({ k: 'circ', x: p.centro.x, y: p.centro.y, r: p.radio + 1.2 })),
    cajaPol(ARENA_CLUB.pts, 0.5),
    caja({ x0: HOTEL.x0 - 100, y0: PLAYA.arenaY, x1: HOTEL.x1 + 100, y1: HOTEL.y1 + 100 }),
    cajaPol([H(0, -40), H(882, 30)], 0),
    ...CAJAS_ETIQUETA_HOTEL.map((c) => caja(c, 0.6)),
    ...CAMINOS_HOTEL.map((c): Exclusion => ({ k: 'camino', id: c.id, pts: muestrearSuave(c.puntos), mitad: c.ancho / 2 + 1.4 })),
  ];
  return lista;
}

const zonaHotel = (px0: number, py0: number, px1: number, py1: number, n: number, palmas: number): ZonaPlantas => {
  const a = H(px0, py0);
  const b = H(px1, py1);
  return { caja: { x0: a.x, y0: a.y, x1: b.x, y1: b.y }, n, palmas };
};

const ZONAS_HOTEL: ZonaPlantas[] = [
  zonaHotel(20, 232, 330, 392, 46, 0.8), // palmeral del jardín norte
  zonaHotel(150, 150, 312, 240, 8, 0.7), // entre tenis y bodega
  zonaHotel(14, 30, 70, 232, 8, 0.8), // borde oeste, junto a la carretera
  zonaHotel(404, 176, 470, 330, 12, 0.7), // entre estacionamiento y torres
  zonaHotel(480, 296, 540, 396, 8, 0.6), // pasillo entre torres y alberca
  zonaHotel(620, 420, 740, 470, 8, 0.7), // al sur de la torre C
  zonaHotel(696, 440, 730, 560, 6, 0.8), // lado este de la alberca
  zonaHotel(400, 500, 500, 548, 6, 0.7), // junto al club de playa
  zonaHotel(724, 120, 836, 200, 4, 0.7), // entre torres D y B
  zonaHotel(860, 190, 880, 600, 8, 0.8), // borde este
  zonaHotel(10, 232, 40, 392, 4, 0.8), // flanco oeste del jardín
];

/** Hilera de palmeras junto a la calle del norte (cada ~36 px de la foto). */
function hileraCalle(azar: () => number): Planta[] {
  const resultado: Planta[] = [];
  for (let px = 40; px <= 870; px += 36) {
    const p = H(px + (azar() - 0.5) * 6, 30 + (azar() - 0.5) * 3);
    const escala = ESCALA_HOTEL * (0.9 + azar() * 0.25);
    resultado.push({
      x: p.x,
      y: p.y,
      tipo: 'palma',
      variante: Math.floor(azar() * 3) as 0 | 1 | 2,
      tono: Math.floor(azar() * 3) as 0 | 1 | 2,
      escala,
      rot: azar() * 360,
      radio: RADIO_BASE.palma * escala,
    });
  }
  return resultado;
}

export function generarVegetacionHotel(semilla = SEMILLA ^ 0x5bd1e995): Planta[] {
  const azar = mulberry32(semilla);
  const exclusiones = exclusionesHotel();
  const plantas: Planta[] = hileraCalle(azar);

  const nueva = (x: number, y: number, tipo: TipoPlanta): Planta => {
    const escala = ESCALA_HOTEL * (tipo === 'arbusto' ? 0.7 + azar() * 0.5 : 0.8 + azar() * 0.5);
    return {
      x,
      y,
      tipo,
      variante: Math.floor(azar() * 3) as 0 | 1 | 2,
      tono: Math.floor(azar() * 3) as 0 | 1 | 2,
      escala,
      rot: azar() * 360,
      radio: RADIO_BASE[tipo] * escala,
    };
  };

  for (const z of ZONAS_HOTEL) {
    let colocadas = 0;
    let intentos = 0;
    while (colocadas < z.n && intentos < z.n * 80) {
      intentos++;
      const x = z.caja.x0 + azar() * (z.caja.x1 - z.caja.x0);
      const y = z.caja.y0 + azar() * (z.caja.y1 - z.caja.y0);
      const sorteo = azar();
      const tipo: TipoPlanta = sorteo < z.palmas ? 'palma' : sorteo < 0.93 ? 'arbol' : 'arbusto';
      const candidata = nueva(x, y, tipo);
      if (x < HOTEL.x0 || x > HOTEL.x1 || y < HOTEL.y0 || y > HOTEL.y1) continue;
      if (estaExcluido(x, y, candidata.radio, exclusiones)) continue;
      if (plantas.some((q) => Math.hypot(q.x - x, q.y - y) < (q.radio + candidata.radio) * 0.7)) continue;
      plantas.push(candidata);
      colocadas++;
    }
  }
  return plantas.sort((a, b) => a.y - b.y);
}

export const PLANTAS_HOTEL: Planta[] = generarVegetacionHotel();
export const EXCLUSIONES_HOTEL = exclusionesHotel();

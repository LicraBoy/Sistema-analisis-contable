/**
 * EscenarioSalon — el recinto dibujado con SVG (sin imágenes).
 *
 * Capas, de abajo hacia arriba:
 *   1. Definiciones (degradados, patrones, símbolos de vegetación)
 *   2. Terreno y superficies (césped, calle, malecón, mar, arena)
 *   3. Caminos y circuito central
 *   4. Plataformas de las zonas de mesas  ← dinámicas: siguen a las mesas
 *   5. Instalaciones (cancha, pista, escenario, lounge, alberca, buffets…)
 *   6. Camas de playa
 *   7. Sombras y vegetación
 *   8. Etiquetas y pictogramas
 *
 * Toda la geometría sale de `geometria.ts` y `vegetacion.ts`. Las capas
 * estáticas están memorizadas: al hacer zoom o pan no se vuelven a calcular.
 * No se usan filtros SVG (costosos al hacer zoom): las sombras y la textura se
 * resuelven con degradados, patrones y formas simples.
 */

import { memo, useMemo } from 'react';

import {
  ACCESO,
  ALBERCA,
  AREA_FUMADORES,
  AREA_INFANTIL,
  BUFFETS,
  CALLE,
  CAMINOS,
  CANCHA,
  CARRETERA_IZQUIERDA,
  CIRCUITO,
  EDIFICIO_NORTE,
  ESCALONES_PISTA,
  ESCENARIO,
  ETIQUETAS,
  FILAS_CAMAS,
  GLORIETAS,
  LOUNGE,
  MALECON,
  MUNDO,
  PISTA,
  SOMBRILLAS_GRANDES,
  ZONA_CAMAS,
  puntosSvg,
  trazoSuave,
  type Buffet,
  type Caja,
  type EtiquetaMapa,
  type Poligono,
  type Pt,
} from './geometria';
import { EscenarioHotel } from './EscenarioHotel';
import { HOTEL, MARGEN_FONDO } from './geometriaHotel';
import { mulberry32, PLANTAS, type TipoPlanta } from './vegetacion';

// ── Paleta ──────────────────────────────────────────────────────────────────

const C = {
  cesped: ['#79b858', '#63a246'],
  caminoBorde: '#bfa57f',
  caminoRelleno: '#ecdabf',
  caminoCentro: '#f4e7d1',
  arena: '#efdfc3',
  arenaBorde: '#d3c09a',
  concreto: '#ece9e2',
  concretoBorde: '#c6c1b5',
  madera: '#b98d5d',
  maderaBorde: '#8a6540',
  agua: ['#8edcee', '#35a3cf'],
  tinta: '#2c3139',
  sombra: '#10230f',
};

// ── Utilidades ──────────────────────────────────────────────────────────────

const centroide = (p: Poligono): Pt => ({
  x: p.puntos.reduce((s, q) => s + q.x, 0) / p.puntos.length,
  y: p.puntos.reduce((s, q) => s + q.y, 0) / p.puntos.length,
});

/** Polígono reducido/ampliado respecto a su centroide. */
const escalarPoligono = (p: Poligono, k: number): Poligono => {
  const c = centroide(p);
  return { puntos: p.puntos.map((q) => ({ x: c.x + (q.x - c.x) * k, y: c.y + (q.y - c.y) * k })) };
};

const punto = (a: Pt, b: Pt, t = 0.5): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

const rect = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x, y: r.y, width: r.w, height: r.h });

// ── Símbolos de vegetación ──────────────────────────────────────────────────

const PALMA_TONOS = [
  { oscuro: '#2a6730', medio: '#3d8a3a', claro: '#63ad52' },
  { oscuro: '#2e7233', medio: '#459541', claro: '#6cb85a' },
  { oscuro: '#265e2b', medio: '#37803a', claro: '#58a04b' },
];
const ARBOL_TONOS = [
  { alto: '#7cc062', bajo: '#2f6e31' },
  { alto: '#6fb457', bajo: '#2a6430' },
  { alto: '#88c96a', bajo: '#356f2c' },
];
const FRONDAS_POR_VARIANTE = [9, 11, 13];

// Cada símbolo se instancia cientos de veces con <use>, y el navegador repinta TODAS las instancias en cada
// cuadro del zoom/desplazamiento. Por eso cada planta es un puñado de trazos (no decenas de nodos): las
// frondas y los lóbulos se fusionan en un solo <path> por color, con la rotación ya aplicada a los puntos.

const f2 = (n: number) => Number(n.toFixed(3));
const girar = (x: number, y: number, grados: number): [number, number] => {
  const a = (grados * Math.PI) / 180;
  return [f2(x * Math.cos(a) - y * Math.sin(a)), f2(x * Math.sin(a) + y * Math.cos(a))];
};
/** Círculo como trazo (arcos) para poder fusionar varios en un solo <path>. */
const circuloTrazo = (cx: number, cy: number, r: number) =>
  `M${f2(cx - r)} ${f2(cy)}a${f2(r)} ${f2(r)} 0 1 0 ${f2(2 * r)} 0a${f2(r)} ${f2(r)} 0 1 0 ${f2(-2 * r)} 0Z`;

function SimboloPalma({ variante, tono }: { variante: number; tono: number }) {
  const n = FRONDAS_POR_VARIANTE[variante];
  const t = PALMA_TONOS[tono];
  let medio = '';
  let oscuro = '';
  let nervaduras = '';
  for (let i = 0; i < n; i++) {
    const ang = (i * 360) / n + ((i * 37) % 11) - 5;
    const largo = 0.82 + (((i * 53) % 7) / 7) * 0.22;
    const ancho = 0.17 + (((i * 29) % 5) / 5) * 0.05;
    // Fronda curvada: base fina, vientre ancho y punta afilada (puntos ya girados).
    const p = (x: number, y: number) => girar(x, y, ang).join(' ');
    const d = `M0 0C${p(ancho, -0.22 * largo)} ${p(ancho * 1.25, -0.68 * largo)} ${p(0.05, -largo)}C${p(-ancho * 0.9, -0.7 * largo)} ${p(-ancho, -0.24 * largo)} 0 0Z`;
    if (i % 2 === 0) medio += d;
    else oscuro += d;
    nervaduras += `M${p(0, -0.04)}L${p(0.02, -largo * 0.93)}`;
  }
  return (
    <g id={`palma-${variante}-${tono}`}>
      <path d={oscuro} fill={t.oscuro} />
      <path d={medio} fill={t.medio} />
      <path d={nervaduras} fill="none" stroke={t.claro} strokeWidth={0.035} strokeLinecap="round" opacity={0.85} />
      <circle r={0.13} fill="#4a3321" />
    </g>
  );
}

// Copas de árbol: lóbulos [x, y, radio]; la variante cambia la disposición.
const LOBULOS: [number, number, number][][] = [
  [[0, 0, 0.7], [-0.45, -0.3, 0.42], [0.42, -0.28, 0.45], [-0.3, 0.38, 0.4], [0.36, 0.34, 0.42]],
  [[0, 0, 0.66], [-0.5, 0.05, 0.4], [0.48, -0.08, 0.42], [0.02, -0.5, 0.4], [-0.08, 0.52, 0.38], [0.4, 0.42, 0.3]],
  [[0, 0, 0.72], [-0.38, -0.42, 0.36], [0.4, -0.4, 0.36], [-0.5, 0.3, 0.34], [0.5, 0.3, 0.34]],
];

function SimboloArbol({ variante, tono }: { variante: number; tono: number }) {
  const t = ARBOL_TONOS[tono];
  const lobulos = LOBULOS[variante];
  // Tres capas de menor a mayor luz, corridas hacia la esquina iluminada: da volumen sin degradados por círculo.
  const base = lobulos.map(([x, y, r]) => circuloTrazo(x, y, r)).join('');
  const medio = lobulos.map(([x, y, r]) => circuloTrazo(x - 0.08, y - 0.1, r * 0.78)).join('');
  const luz = lobulos.map(([x, y, r]) => circuloTrazo(x - 0.17, y - 0.2, r * 0.42)).join('');
  const hojas = [[-0.15, -0.2], [0.2, 0.05], [-0.05, 0.25], [0.28, -0.3]].map(([x, y]) => circuloTrazo(x, y, 0.06)).join('');
  return (
    <g id={`arbol-${variante}-${tono}`}>
      <path d={base} fill={t.bajo} stroke="#1f4a22" strokeWidth={0.03} />
      <path d={medio} fill={t.alto} opacity={0.62} />
      <path d={luz} fill="#c3e6a8" opacity={0.42} />
      <path d={hojas} fill="#e4f5d0" opacity={0.4} />
    </g>
  );
}

function SimboloArbusto({ tono }: { tono: number }) {
  const t = ARBOL_TONOS[tono];
  return (
    <g id={`arbusto-0-${tono}`}>
      <path d={circuloTrazo(-0.28, 0.08, 0.55)} fill={t.bajo} />
      <path d={circuloTrazo(0.3, -0.05, 0.6) + circuloTrazo(0, 0.22, 0.5)} fill={t.alto} />
    </g>
  );
}

// ── Texturas deterministas ──────────────────────────────────────────────────

/** Motas del césped (patrón de 10×10 unidades). */
const MOTAS_CESPED = (() => {
  const azar = mulberry32(4411);
  const verdes = ['#4f8f3b', '#8bc769', '#5d9d44', '#9ad07a', '#477f35'];
  return Array.from({ length: 34 }, () => ({
    x: azar() * 10,
    y: azar() * 10,
    r: 0.1 + azar() * 0.22,
    c: verdes[Math.floor(azar() * verdes.length)],
    o: 0.25 + azar() * 0.4,
  }));
})();

const MOTAS_ARENA = (() => {
  const azar = mulberry32(917);
  return Array.from({ length: 26 }, () => ({ x: azar() * 8, y: azar() * 8, r: 0.07 + azar() * 0.14, o: 0.25 + azar() * 0.35 }));
})();

/** Manchas de tono para el césped del entorno del hotel (fuera de la zona de la fiesta, que ya tiene las suyas). */
const MANCHAS_HOTEL = (() => {
  const azar = mulberry32(8812);
  const resultado: { cx: number; cy: number; rx: number; ry: number; oscura: boolean; rot: number }[] = [];
  while (resultado.length < 70) {
    const cx = HOTEL.x0 + azar() * (HOTEL.x1 - HOTEL.x0);
    const cy = HOTEL.y0 + azar() * (HOTEL.y1 - HOTEL.y0);
    const rx = 9 + azar() * 18;
    const ry = 6 + azar() * 11;
    const oscura = resultado.length % 2 === 0;
    const rot = azar() * 180;
    // Las del interior de la fiesta ya existen en `MANCHAS`: aquí solo el entorno.
    if (cx > MUNDO.x0 - rx && cx < MUNDO.x1 + rx && cy > MUNDO.y0 - ry && cy < MUNDO.y1 + ry) continue;
    resultado.push({ cx, cy, rx, ry, oscura, rot });
  }
  return resultado;
})();

/** Manchas de tono sobre el césped, para romper la uniformidad. */
const MANCHAS = (() => {
  const azar = mulberry32(2026);
  return Array.from({ length: 30 }, (_, i) => ({
    cx: MUNDO.x0 + azar() * (MUNDO.x1 - MUNDO.x0),
    cy: MUNDO.y0 + azar() * (MUNDO.y1 - MUNDO.y0),
    rx: 9 + azar() * 16,
    ry: 6 + azar() * 10,
    oscura: i % 2 === 0,
    rot: azar() * 180,
  }));
})();

// ── Definiciones ────────────────────────────────────────────────────────────

const Definiciones = memo(function Definiciones() {
  return (
    <defs>
      {/* Mismo degradado de siempre sobre la zona de la fiesta (coordenadas absolutas); fuera de ella se mantiene el color del borde. */}
      <linearGradient
        id="g-cesped"
        gradientUnits="userSpaceOnUse"
        x1={MUNDO.x0 - 40}
        y1={MUNDO.y0 - 40}
        x2={MUNDO.x0 - 40 + 0.4 * (MUNDO.x1 - MUNDO.x0 + 80)}
        y2={MUNDO.y1 + 40}
      >
        <stop offset="0" stopColor={C.cesped[0]} />
        <stop offset="1" stopColor={C.cesped[1]} />
      </linearGradient>
      <radialGradient id="g-mancha-clara">
        <stop offset="0" stopColor="#a7dd82" stopOpacity="0.5" />
        <stop offset="1" stopColor="#a7dd82" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="g-mancha-oscura">
        <stop offset="0" stopColor="#3c7a35" stopOpacity="0.42" />
        <stop offset="1" stopColor="#3c7a35" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="g-agua" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={C.agua[0]} />
        <stop offset="1" stopColor={C.agua[1]} />
      </linearGradient>
      <linearGradient id="g-mar" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#c8efe9" />
        <stop offset="0.35" stopColor="#6fd0dd" />
        <stop offset="1" stopColor="#2b8fc2" />
      </linearGradient>
      <linearGradient id="g-sombra-borde" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.22" />
      </linearGradient>
      <linearGradient id="g-pantalla" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3a4048" />
        <stop offset="1" stopColor="#1f2328" />
      </linearGradient>

      <pattern id="p-cesped" width="10" height="10" patternUnits="userSpaceOnUse">
        {MOTAS_CESPED.map((m, i) => (
          <circle key={i} cx={m.x} cy={m.y} r={m.r} fill={m.c} opacity={m.o} />
        ))}
      </pattern>
      <pattern id="p-arena" width="8" height="8" patternUnits="userSpaceOnUse">
        {MOTAS_ARENA.map((m, i) => (
          <circle key={i} cx={m.x} cy={m.y} r={m.r} fill="#b59e74" opacity={m.o} />
        ))}
      </pattern>
      <pattern id="p-adoquin" width="3" height="3" patternUnits="userSpaceOnUse">
        <path d="M0 0H3M0 1.5H3M1.5 0V1.5M0 1.5V3M3 1.5V3" stroke="#b8a784" strokeWidth="0.07" fill="none" opacity="0.55" />
      </pattern>
      <pattern id="p-losas" width="4" height="4" patternUnits="userSpaceOnUse">
        <path d="M0 0H4M0 0V4" stroke="#b7b2a6" strokeWidth="0.08" fill="none" opacity="0.6" />
      </pattern>
      <pattern id="p-madera" width="2" height="1.1" patternUnits="userSpaceOnUse">
        <rect width="2" height="1.1" fill={C.madera} />
        <path d="M0 1.05H2" stroke="#8a6540" strokeWidth="0.1" />
        <path d="M0.3 0.4H1.2" stroke="#c9a373" strokeWidth="0.06" opacity="0.7" />
      </pattern>
      <pattern id="p-calle" width="6" height="6" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="0.1" fill="#8f8f89" opacity="0.5" />
        <circle cx="4" cy="3.5" r="0.08" fill="#c4c4be" opacity="0.5" />
      </pattern>

      {[0, 1, 2].flatMap((v) => [0, 1, 2].map((t) => <SimboloPalma key={`p${v}${t}`} variante={v} tono={t} />))}
      {[0, 1, 2].flatMap((v) => [0, 1, 2].map((t) => <SimboloArbol key={`a${v}${t}`} variante={v} tono={t} />))}
      {[0, 1, 2].map((t) => (
        <SimboloArbusto key={`b${t}`} tono={t} />
      ))}

      <symbol id="s-sombrilla" overflow="visible" viewBox="-1 -1 2 2">
        <circle r={1} fill="#f1e5cf" stroke="#b9a37c" strokeWidth={0.1} />
        {Array.from({ length: 8 }, (_, i) => (
          <path key={i} d="M0 0L0 -1" stroke="#c7b48f" strokeWidth={0.07} transform={`rotate(${i * 45})`} />
        ))}
        <circle r={0.12} fill="#9a8560" />
      </symbol>
      <symbol id="s-camastro" overflow="visible" viewBox="0 0 1 2">
        <rect x={0.05} y={0.05} width={0.9} height={1.9} rx={0.18} fill="#f8f2e6" stroke="#c9b690" strokeWidth={0.07} />
        <rect x={0.12} y={0.1} width={0.76} height={0.55} rx={0.14} fill="#ece1cd" />
      </symbol>
    </defs>
  );
});

// ── Capa 2-3: terreno, superficies y caminos ────────────────────────────────

/** Césped de todo el hotel (la fiesta y su entorno comparten el mismo fondo, sin costuras). */
const TerrenoBase = memo(function TerrenoBase() {
  const x = HOTEL.x0 - MARGEN_FONDO;
  const y = HOTEL.y0 - MARGEN_FONDO;
  const ancho = HOTEL.x1 - HOTEL.x0 + 2 * MARGEN_FONDO;
  const alto = HOTEL.y1 - HOTEL.y0 + 2 * MARGEN_FONDO;
  return (
    <g aria-hidden="true">
      <rect x={x} y={y} width={ancho} height={alto} fill="url(#g-cesped)" />
      <rect x={x} y={y} width={ancho} height={alto} fill="url(#p-cesped)" />
      {MANCHAS_HOTEL.map((m, i) => (
        <ellipse
          key={i}
          cx={m.cx}
          cy={m.cy}
          rx={m.rx}
          ry={m.ry}
          transform={`rotate(${m.rot.toFixed(0)} ${m.cx.toFixed(1)} ${m.cy.toFixed(1)})`}
          fill={m.oscura ? 'url(#g-mancha-oscura)' : 'url(#g-mancha-clara)'}
        />
      ))}
    </g>
  );
});

const Terreno = memo(function Terreno() {
  return (
    <g aria-hidden="true">
      {MANCHAS.map((m, i) => (
        <ellipse
          key={i}
          cx={m.cx}
          cy={m.cy}
          rx={m.rx}
          ry={m.ry}
          transform={`rotate(${m.rot.toFixed(0)} ${m.cx.toFixed(1)} ${m.cy.toFixed(1)})`}
          fill={m.oscura ? 'url(#g-mancha-oscura)' : 'url(#g-mancha-clara)'}
        />
      ))}

      {/* Carretera del lado izquierdo (acceso) */}
      <g>
        <rect {...rect(CARRETERA_IZQUIERDA)} x={CARRETERA_IZQUIERDA.x - 6} width={CARRETERA_IZQUIERDA.w + 6} fill="#c3c3bb" />
        <rect {...rect(CARRETERA_IZQUIERDA)} x={CARRETERA_IZQUIERDA.x - 6} width={CARRETERA_IZQUIERDA.w + 6} fill="url(#p-calle)" />
        <line
          x1={CARRETERA_IZQUIERDA.x + CARRETERA_IZQUIERDA.w * 0.42}
          x2={CARRETERA_IZQUIERDA.x + CARRETERA_IZQUIERDA.w * 0.42}
          y1={CARRETERA_IZQUIERDA.y}
          y2={CARRETERA_IZQUIERDA.y + CARRETERA_IZQUIERDA.h}
          stroke="#f4f1e6"
          strokeWidth={0.22}
          strokeDasharray="2.2 1.6"
          opacity={0.8}
        />
        <line
          x1={CARRETERA_IZQUIERDA.x + CARRETERA_IZQUIERDA.w}
          x2={CARRETERA_IZQUIERDA.x + CARRETERA_IZQUIERDA.w}
          y1={CARRETERA_IZQUIERDA.y}
          y2={CARRETERA_IZQUIERDA.y + CARRETERA_IZQUIERDA.h}
          stroke="#a79e8c"
          strokeWidth={0.35}
        />
      </g>

      {/* Malecón y calle junto a la playa */}
      <rect {...rect(MALECON)} fill="#ddd6c7" />
      <rect {...rect(MALECON)} fill="url(#p-losas)" />
      <rect x={MALECON.x} y={MALECON.y} width={MALECON.w} height={0.4} fill="#bdb5a3" />
      <rect {...rect(CALLE)} fill="#a8a8a2" />
      <rect {...rect(CALLE)} fill="url(#p-calle)" />
      <line
        x1={CALLE.x}
        x2={CALLE.x + CALLE.w}
        y1={CALLE.y + CALLE.h * 0.55}
        y2={CALLE.y + CALLE.h * 0.55}
        stroke="#f1eee2"
        strokeWidth={0.25}
        strokeDasharray="3 2.4"
        opacity={0.75}
      />

      {/* Arena de la zona de camas */}
      <polygon points={puntosSvg(ZONA_CAMAS)} fill={C.arena} stroke={C.arenaBorde} strokeWidth={0.3} strokeLinejoin="round" />
      <polygon points={puntosSvg(ZONA_CAMAS)} fill="url(#p-arena)" />

      {/* Edificio al norte (techo visto desde arriba) */}
      <g>
        <rect x={EDIFICIO_NORTE.x + 0.6} y={EDIFICIO_NORTE.y + 0.8} width={EDIFICIO_NORTE.w} height={EDIFICIO_NORTE.h} fill="#000" opacity={0.18} />
        <rect {...rect(EDIFICIO_NORTE)} fill="#b9bdc2" stroke="#8d9298" strokeWidth={0.3} />
        <rect x={EDIFICIO_NORTE.x + 1} y={EDIFICIO_NORTE.y + 1} width={EDIFICIO_NORTE.w - 2} height={EDIFICIO_NORTE.h - 2} fill="#cdd1d5" stroke="#a1a6ab" strokeWidth={0.18} />
        <rect x={EDIFICIO_NORTE.x + EDIFICIO_NORTE.w * 0.4} y={EDIFICIO_NORTE.y + 1} width={EDIFICIO_NORTE.w * 0.22} height={EDIFICIO_NORTE.h - 2} fill="#aeb3b8" opacity={0.7} />
      </g>
    </g>
  );
});

const Caminos = memo(function Caminos() {
  const trazos = useMemo(() => CAMINOS.map((c) => ({ id: c.id, d: trazoSuave(c.puntos), ancho: c.ancho })), []);
  const { centro, radio, ancho } = CIRCUITO;
  return (
    <g aria-hidden="true" strokeLinecap="round" strokeLinejoin="round" fill="none">
      {/* sombra bajo los caminos */}
      {trazos.map((t) => (
        <path key={`s${t.id}`} d={t.d} stroke="#000" strokeOpacity={0.12} strokeWidth={t.ancho + 0.9} transform="translate(0.25 0.35)" />
      ))}
      <circle cx={centro.x} cy={centro.y} r={radio} stroke="#000" strokeOpacity={0.12} strokeWidth={ancho + 0.9} transform="translate(0.25 0.35)" />

      {trazos.map((t) => (
        <g key={t.id}>
          <path d={t.d} stroke={C.caminoBorde} strokeWidth={t.ancho + 0.5} />
          <path d={t.d} stroke={C.caminoRelleno} strokeWidth={t.ancho} />
          <path d={t.d} stroke={C.caminoCentro} strokeWidth={t.ancho * 0.5} opacity={0.55} />
        </g>
      ))}

      {/* circuito central */}
      <circle cx={centro.x} cy={centro.y} r={radio} stroke={C.caminoBorde} strokeWidth={ancho + 0.5} />
      <circle cx={centro.x} cy={centro.y} r={radio} stroke={C.caminoRelleno} strokeWidth={ancho} />
      <circle cx={centro.x} cy={centro.y} r={radio} stroke={C.caminoCentro} strokeWidth={ancho * 0.5} opacity={0.55} />
      {/* islote: césped con borde de piedra */}
      <circle cx={centro.x} cy={centro.y} r={radio - ancho / 2 - 0.15} fill="#4f9440" stroke="#9c9a90" strokeWidth={0.55} strokeDasharray="0.9 0.35" />
      <circle cx={centro.x} cy={centro.y} r={radio - ancho / 2 - 1.1} fill="url(#g-mancha-oscura)" stroke="none" />

      {/* escalones de madera hacia la pista */}
      <g>
        <rect {...rect(ESCALONES_PISTA)} x={ESCALONES_PISTA.x + 0.4} y={ESCALONES_PISTA.y + 0.5} fill="#000" opacity={0.15} stroke="none" />
        <rect {...rect(ESCALONES_PISTA)} fill="url(#p-madera)" stroke={C.maderaBorde} strokeWidth={0.25} />
      </g>
    </g>
  );
});

// ── Capa 4: plataformas de las zonas de mesas (dinámicas) ───────────────────

export interface ZonaMesas {
  zona: string;
  caja: Caja;
}

export const PlataformasMesas = memo(function PlataformasMesas({ zonas }: { zonas: ZonaMesas[] }) {
  return (
    <g aria-hidden="true">
      {zonas.map(({ zona, caja }) => {
        const w = caja.x1 - caja.x0;
        const h = caja.y1 - caja.y0;
        return (
          <g key={zona}>
            <rect x={caja.x0 + 0.5} y={caja.y0 + 0.7} width={w} height={h} rx={1.7} fill="#000" opacity={0.17} />
            <rect x={caja.x0} y={caja.y0} width={w} height={h} rx={1.7} fill="#ead9bf" stroke="#c4b08a" strokeWidth={0.3} />
            <rect x={caja.x0} y={caja.y0} width={w} height={h} rx={1.7} fill="url(#p-adoquin)" />
            <rect x={caja.x0 + 0.7} y={caja.y0 + 0.7} width={w - 1.4} height={h - 1.4} rx={1.2} fill="none" stroke="#f6ecda" strokeWidth={0.22} opacity={0.9} />
            <text
              x={caja.x0 + 1.4}
              y={caja.y0 + 2.1}
              fontSize={1.15}
              fontWeight={700}
              fill="#8a7650"
              letterSpacing={0.08}
              style={{ textTransform: 'uppercase' }}
            >
              {zona}
            </text>
          </g>
        );
      })}
    </g>
  );
});

// ── Capa 5-6: instalaciones y camas ─────────────────────────────────────────

const Sombra = ({ puntos, dx = 0.55, dy = 0.75 }: { puntos: Poligono; dx?: number; dy?: number }) => (
  <polygon points={puntosSvg(puntos)} transform={`translate(${dx} ${dy})`} fill="#000" opacity={0.17} />
);

function Cancha() {
  const [p0, p1, p2, p3] = CANCHA.puntos;
  const medioArriba = punto(p0, p1);
  const medioAbajo = punto(p3, p2);
  const centro = punto(medioArriba, medioAbajo);
  const interior = escalarPoligono(CANCHA, 0.93);
  const [i0, i1, i2, i3] = interior.puntos;
  const areaIzq = [punto(i0, i3, 0.3), punto(i0, i3, 0.7)];
  const areaDer = [punto(i1, i2, 0.3), punto(i1, i2, 0.7)];
  return (
    <g aria-hidden="true">
      <Sombra puntos={CANCHA} />
      <polygon points={puntosSvg(CANCHA)} fill="#ecdfc6" stroke="#b9a681" strokeWidth={0.35} strokeLinejoin="round" />
      <polygon points={puntosSvg(CANCHA)} fill="url(#p-arena)" />
      <polygon points={puntosSvg(interior)} fill="none" stroke="#fffdf4" strokeWidth={0.28} strokeLinejoin="round" opacity={0.95} />
      <line x1={medioArriba.x} y1={medioArriba.y} x2={medioAbajo.x} y2={medioAbajo.y} stroke="#fffdf4" strokeWidth={0.26} opacity={0.95} />
      <circle cx={centro.x} cy={centro.y} r={4.2} fill="none" stroke="#fffdf4" strokeWidth={0.26} opacity={0.95} />
      {[
        [i0, i3, areaIzq],
        [i1, i2, areaDer],
      ].map(([a, b, area], idx) => {
        const c = punto(a as Pt, b as Pt);
        const dir = idx === 0 ? 1 : -1;
        const a0 = (area as Pt[])[0];
        const a1 = (area as Pt[])[1];
        return (
          <g key={idx}>
            <path
              d={`M${a0.x.toFixed(2)} ${a0.y.toFixed(2)} L${(a0.x + dir * 6).toFixed(2)} ${a0.y.toFixed(2)} L${(a1.x + dir * 6).toFixed(2)} ${a1.y.toFixed(2)} L${a1.x.toFixed(2)} ${a1.y.toFixed(2)}`}
              fill="none"
              stroke="#fffdf4"
              strokeWidth={0.22}
              opacity={0.85}
            />
            <rect x={c.x - (dir === 1 ? 0.2 : 1.6)} y={c.y - 1.6} width={1.8} height={3.2} fill="#f6f4ee" stroke="#8d8672" strokeWidth={0.15} />
          </g>
        );
      })}
    </g>
  );
}

function Pista() {
  const interior = escalarPoligono(PISTA, 0.93);
  return (
    <g aria-hidden="true">
      <Sombra puntos={PISTA} />
      <polygon points={puntosSvg(PISTA)} fill={C.concreto} stroke={C.concretoBorde} strokeWidth={0.35} strokeLinejoin="round" />
      <polygon points={puntosSvg(interior)} fill="#f6f3ee" stroke="#d9d4c9" strokeWidth={0.16} strokeLinejoin="round" />
      <polygon points={puntosSvg(interior)} fill="url(#p-losas)" opacity={0.6} />
    </g>
  );
}

function Escenario() {
  const e = ESCENARIO;
  return (
    <g aria-hidden="true">
      <rect x={e.x - 0.9} y={e.y - 0.5} width={e.w + 1.8} height={e.h + 1.8} rx={0.5} fill="#000" opacity={0.2} transform="translate(0.5 0.7)" />
      {/* armazón */}
      <rect x={e.x - 0.9} y={e.y - 0.5} width={e.w + 1.8} height={e.h + 1.4} rx={0.4} fill="#4a5058" stroke="#2f343a" strokeWidth={0.25} />
      <rect x={e.x - 0.9} y={e.y - 0.5} width={e.w + 1.8} height={e.h + 1.4} fill="none" stroke="#9aa1aa" strokeWidth={0.18} strokeDasharray="0.7 0.5" />
      {/* tarima y pantalla */}
      <rect x={e.x} y={e.y} width={e.w} height={e.h} fill="url(#g-pantalla)" stroke="#16191d" strokeWidth={0.2} />
      <rect x={e.x + e.w * 0.18} y={e.y + e.h * 0.2} width={e.w * 0.64} height={e.h * 0.34} fill="#12161a" stroke="#5a616b" strokeWidth={0.12} />
      <rect x={e.x + e.w * 0.36} y={e.y + e.h * 0.62} width={e.w * 0.28} height={e.h * 0.16} fill="#555c66" opacity={0.9} />
      {/* bocinas */}
      <rect x={e.x - 1.7} y={e.y + 0.6} width={0.9} height={1.6} fill="#2b2f35" />
      <rect x={e.x + e.w + 0.8} y={e.y + 0.6} width={0.9} height={1.6} fill="#2b2f35" />
    </g>
  );
}

function Lounge() {
  const s = LOUNGE.suelo;
  const t = LOUNGE.tarima;
  const cx = t.x + t.w / 2;
  const cy = t.y + t.h / 2;
  return (
    <g aria-hidden="true">
      <rect x={s.x + 0.4} y={s.y + 0.6} width={s.w} height={s.h} rx={1} fill="#000" opacity={0.14} />
      <rect {...rect(s)} rx={1} fill="#efe6d4" stroke="#d3c5a8" strokeWidth={0.25} />
      <rect {...rect(s)} rx={1} fill="url(#p-adoquin)" opacity={0.7} />
      <rect x={t.x + 0.3} y={t.y + 0.4} width={t.w} height={t.h} fill="#000" opacity={0.18} />
      <rect {...rect(t)} fill="url(#p-madera)" stroke={C.maderaBorde} strokeWidth={0.22} />
      {/* sofá en L */}
      <g fill="#e0ddd5" stroke="#a9a498" strokeWidth={0.14}>
        <rect x={t.x + 0.8} y={t.y + 0.8} width={t.w - 1.6} height={1.5} rx={0.35} />
        <rect x={t.x + 0.8} y={t.y + 0.8} width={1.5} height={t.h * 0.6} rx={0.35} />
        <rect x={t.x + t.w - 2.9} y={t.y + t.h - 2.6} width={2.1} height={1.7} rx={0.4} />
        <rect x={t.x + 0.9} y={t.y + t.h - 2.7} width={2.1} height={1.7} rx={0.4} />
      </g>
      <circle cx={cx} cy={cy} r={1.5} fill="#f6f2ea" stroke="#9c9688" strokeWidth={0.16} />
      <circle cx={cx} cy={cy} r={0.7} fill="#d8cfbd" />
      {/* macetas */}
      {[[s.x + 1.2, s.y + 1.2], [s.x + s.w - 1.2, s.y + 1.2], [s.x + s.w - 1.2, s.y + s.h - 1.2]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={0.8} fill="#4f9a45" stroke="#2f6b2f" strokeWidth={0.12} />
      ))}
    </g>
  );
}

function Alberca() {
  const a = ALBERCA;
  const m = 1.0;
  return (
    <g aria-hidden="true">
      <rect x={a.x + 0.4} y={a.y + 0.6} width={a.w} height={a.h} rx={0.8} fill="#000" opacity={0.16} />
      <rect {...rect(a)} rx={0.8} fill="#f1ede5" stroke="#cdc7ba" strokeWidth={0.25} />
      <rect x={a.x + m} y={a.y + m} width={a.w - 2 * m} height={a.h - 2 * m} rx={0.5} fill="url(#g-agua)" stroke="#86c3d8" strokeWidth={0.2} />
      {[0.25, 0.5, 0.75].map((k) => (
        <path
          key={k}
          d={`M${a.x + m + 0.7} ${a.y + a.h * k} q${(a.w - 2 * m) * 0.25} -0.45 ${(a.w - 2 * m) * 0.5} 0 t${(a.w - 2 * m) * 0.5 - 1.4} 0`}
          fill="none"
          stroke="#fff"
          strokeWidth={0.12}
          opacity={0.45}
        />
      ))}
    </g>
  );
}

function AreaInfantil() {
  const { centro, rx, ry } = AREA_INFANTIL;
  return (
    <g aria-hidden="true">
      <ellipse cx={centro.x + 0.4} cy={centro.y + 0.6} rx={rx} ry={ry} fill="#000" opacity={0.15} />
      <ellipse cx={centro.x} cy={centro.y} rx={rx} ry={ry} fill="#e8dfd0" stroke="#cbbfa9" strokeWidth={0.3} />
      <ellipse cx={centro.x} cy={centro.y} rx={rx} ry={ry} fill="url(#p-arena)" opacity={0.8} />
      {[[-0.5, 0.45, '#e5604b'], [0.45, 0.4, '#3f8fd8'], [0.05, -0.05, '#f2c230']].map(([dx, dy, c], i) => (
        <circle key={i} cx={centro.x + (dx as number) * rx} cy={centro.y + (dy as number) * ry} r={1.1} fill={c as string} stroke="#fff" strokeWidth={0.18} />
      ))}
    </g>
  );
}

function Glorietas() {
  return (
    <g aria-hidden="true">
      {GLORIETAS.map((g, idx) => {
        const r = 3.4;
        const vertices = Array.from({ length: 8 }, (_, i) => {
          const a = (Math.PI / 4) * i + Math.PI / 8;
          return { x: g.x + Math.cos(a) * r, y: g.y + Math.sin(a) * r };
        });
        const esFumadores = idx === 1;
        return (
          <g key={idx}>
            <polygon points={vertices.map((v) => `${v.x.toFixed(2)},${v.y.toFixed(2)}`).join(' ')} transform="translate(0.4 0.6)" fill="#000" opacity={0.17} />
            <polygon points={vertices.map((v) => `${v.x.toFixed(2)},${v.y.toFixed(2)}`).join(' ')} fill="#ebe6dc" stroke="#c4bcab" strokeWidth={0.22} />
            {vertices.map((v, i) => (
              <line key={i} x1={g.x} y1={g.y} x2={v.x} y2={v.y} stroke="#d2cabb" strokeWidth={0.14} />
            ))}
            <circle cx={g.x} cy={g.y} r={0.4} fill="#b4ab98" />
            {esFumadores && (
              <circle cx={AREA_FUMADORES.centro.x} cy={AREA_FUMADORES.centro.y} r={r + 1.5} fill="none" stroke="#a79a82" strokeWidth={0.2} strokeDasharray="0.8 0.6" />
            )}
          </g>
        );
      })}
    </g>
  );
}

function IconoBuffet({ b }: { b: Buffet }) {
  const { x, y } = b.centro;
  return (
    <g aria-hidden="true">
      {b.losa && (
        <>
          <rect x={x - b.losa.w / 2 + 0.4} y={y - b.losa.h / 2 + 0.6} width={b.losa.w} height={b.losa.h} rx={0.8} fill="#000" opacity={0.12} />
          <rect x={x - b.losa.w / 2} y={y - b.losa.h / 2} width={b.losa.w} height={b.losa.h} rx={0.8} fill="#e9e3d6" stroke="#cdc5b3" strokeWidth={0.22} />
          <rect x={x - b.losa.w / 2} y={y - b.losa.h / 2} width={b.losa.w} height={b.losa.h} rx={0.8} fill="url(#p-losas)" opacity={0.6} />
        </>
      )}
      {/* estación de buffet: mesa larga con calentadores y quemadores */}
      <rect x={x - 1.9 + 0.3} y={y - 1.3 + 0.4} width={3.8} height={2.6} rx={0.4} fill="#000" opacity={0.2} />
      <rect x={x - 1.9} y={y - 1.3} width={3.8} height={2.6} rx={0.4} fill="#3b4048" stroke="#1f2328" strokeWidth={0.14} />
      <rect x={x - 1.55} y={y - 0.95} width={3.1} height={1.0} rx={0.25} fill="#656c76" />
      {[-1, 0, 1].map((k) => (
        <circle key={k} cx={x + k * 1.0} cy={y + 0.6} r={0.28} fill="#d86a2b" />
      ))}
      <path d={`M${x - 1.3} ${y - 1.6} q0.4 -0.6 0 -1.1 M${x} ${y - 1.6} q0.4 -0.6 0 -1.1 M${x + 1.3} ${y - 1.6} q0.4 -0.6 0 -1.1`} fill="none" stroke="#7a828c" strokeWidth={0.12} opacity={0.6} />
    </g>
  );
}

const Camas = memo(function Camas() {
  return (
    <g aria-hidden="true">
      {/* sombrillas grandes del borde */}
      {SOMBRILLAS_GRANDES.map((s, i) => (
        <g key={i}>
          <circle cx={s.centro.x + 0.5} cy={s.centro.y + 0.7} r={s.radio} fill="#000" opacity={0.18} />
          <circle cx={s.centro.x} cy={s.centro.y} r={s.radio} fill={s.color} stroke="#fff" strokeWidth={0.2} strokeOpacity={0.5} />
          {Array.from({ length: 10 }, (_, k) => (
            <line key={k} x1={s.centro.x} y1={s.centro.y} x2={s.centro.x} y2={s.centro.y - s.radio} stroke="#000" strokeOpacity={0.18} strokeWidth={0.14} transform={`rotate(${k * 36} ${s.centro.x} ${s.centro.y})`} />
          ))}
          <circle cx={s.centro.x} cy={s.centro.y} r={0.35} fill="#4a3321" />
        </g>
      ))}
      {/* filas de sombrillas con sus camastros */}
      {FILAS_CAMAS.flatMap((f, fi) =>
        Array.from({ length: f.cantidad }, (_, i) => {
          const x = f.desde.x + i * f.paso;
          const y = f.desde.y;
          return (
            <g key={`${fi}-${i}`}>
              <use href="#s-camastro" x={x - 1.1} y={y + 1.5} width={1.0} height={2.2} />
              <use href="#s-camastro" x={x + 0.1} y={y + 1.5} width={1.0} height={2.2} />
              <ellipse cx={x + 0.45} cy={y + 0.6} rx={1.5} ry={1.35} fill="#000" opacity={0.16} />
              <use href="#s-sombrilla" x={x - 1.4} y={y - 1.4} width={2.8} height={2.8} />
            </g>
          );
        }),
      )}
    </g>
  );
});

const Instalaciones = memo(function Instalaciones() {
  return (
    <g>
      <Cancha />
      <Pista />
      <Escenario />
      <Lounge />
      <Alberca />
      <AreaInfantil />
      <Glorietas />
      {BUFFETS.map((b) => (
        <IconoBuffet key={b.id} b={b} />
      ))}
      <Camas />
    </g>
  );
});

// ── Capa 7: vegetación ──────────────────────────────────────────────────────

const PREFIJO_SIMBOLO: Record<TipoPlanta, string> = { palma: 'palma', arbol: 'arbol', arbusto: 'arbusto' };

const Vegetacion = memo(function Vegetacion() {
  return (
    <g aria-hidden="true">
      {/* Sombras: un óvalo por planta desplazado hacia abajo-derecha (luz desde arriba-izquierda). */}
      <g fill={C.sombra} opacity={0.2}>
        {PLANTAS.map((p, i) => (
          <ellipse key={i} cx={p.x + p.radio * 0.34} cy={p.y + p.radio * 0.3} rx={p.radio * 0.95} ry={p.radio * 0.78} />
        ))}
      </g>
      {PLANTAS.map((p, i) => {
        const variante = p.tipo === 'arbusto' ? 0 : p.variante;
        return (
          <use
            key={i}
            href={`#${PREFIJO_SIMBOLO[p.tipo]}-${variante}-${p.tono}`}
            transform={`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${p.rot.toFixed(0)}) scale(${p.radio.toFixed(2)})`}
          />
        );
      })}
    </g>
  );
});

// ── Capa 8: etiquetas y pictogramas ─────────────────────────────────────────

function Pictograma({ tipo, x, y }: { tipo: NonNullable<EtiquetaMapa['icono']>; x: number; y: number }) {
  const tinta = C.tinta;
  switch (tipo) {
    case 'balon':
      return (
        <g transform={`translate(${x} ${y})`}>
          <circle r={1.25} fill="#fff" stroke={tinta} strokeWidth={0.18} />
          <polygon points="0,-0.55 0.52,-0.17 0.32,0.45 -0.32,0.45 -0.52,-0.17" fill={tinta} />
          <path d="M0 -0.55V-1.2M0.52 -0.17L1.12 -0.4M0.32 0.45L0.7 1M-0.32 0.45L-0.7 1M-0.52 -0.17L-1.12 -0.4" stroke={tinta} strokeWidth={0.16} />
        </g>
      );
    case 'musica':
      return (
        <g transform={`translate(${x} ${y})`} fill={tinta}>
          <ellipse cx={-0.45} cy={0.7} rx={0.62} ry={0.46} transform="rotate(-20 -0.45 0.7)" />
          <ellipse cx={0.85} cy={0.4} rx={0.62} ry={0.46} transform="rotate(-20 0.85 0.4)" />
          <path d="M-0.05 0.55V-1.1L1.35 -1.4V0.25" stroke={tinta} strokeWidth={0.28} fill="none" />
          <path d="M-0.05 -1.1L1.35 -1.4V-0.7L-0.05 -0.4Z" />
        </g>
      );
    case 'personas':
      return (
        <g transform={`translate(${x} ${y})`} fill={tinta}>
          {[-0.95, 0.95].map((dx) => (
            <g key={dx} transform={`translate(${dx} 0)`}>
              <circle cy={-1} r={0.45} />
              <path d="M-0.55 1.25V-0.2Q0 -0.55 0.55 -0.2V1.25H0.2V0.4H-0.2V1.25Z" />
            </g>
          ))}
        </g>
      );
    case 'ninos':
      return (
        <g transform={`translate(${x} ${y})`} fill={tinta}>
          <circle cx={-0.6} cy={-0.8} r={0.38} />
          <path d="M-1 0.9V-0.2Q-0.6 -0.45 -0.2 -0.2V0.9Z" />
          <circle cx={0.65} cy={-0.3} r={0.3} />
          <path d="M0.35 0.9V0.15Q0.65 -0.05 0.95 0.15V0.9Z" />
        </g>
      );
    case 'sombrilla':
      return (
        <g transform={`translate(${x} ${y})`}>
          <path d="M-1.3 0.1Q0 -1.9 1.3 0.1Z" fill="#fff" stroke={tinta} strokeWidth={0.18} />
          <path d="M0 0.1V1.3" stroke={tinta} strokeWidth={0.2} />
        </g>
      );
    case 'tabaco':
      return (
        <g transform={`translate(${x} ${y})`}>
          <rect x={-1.3} y={0} width={2.2} height={0.5} rx={0.1} fill={tinta} />
          <rect x={0.95} y={0} width={0.45} height={0.5} fill="#d86a2b" />
          <path d="M1.1 -0.2Q1.6 -0.7 1.1 -1.2Q0.7 -1.6 1.2 -2" fill="none" stroke={tinta} strokeWidth={0.14} opacity={0.6} />
        </g>
      );
    case 'olas':
      return null;
    case 'flecha':
      return null;
  }
}

function Etiqueta({ e }: { e: EtiquetaMapa }) {
  const tam = e.tam ?? 2.1;
  const interlineado = tam * 1.22;
  const alto = e.lineas.length * interlineado;
  const y0 = e.pos.y - alto / 2 + tam * 0.85;
  const yIcono = e.pos.y - alto / 2 - tam * 0.95;
  return (
    <g aria-hidden="true" pointerEvents="none">
      {e.icono && e.icono !== 'flecha' && <Pictograma tipo={e.icono} x={e.pos.x} y={yIcono} />}
      <text
        x={e.pos.x}
        y={y0}
        textAnchor="middle"
        fontSize={tam}
        fontWeight={e.sutil ? 600 : 700}
        fill={e.sutil ? '#6b665b' : C.tinta}
        stroke="#fffdf6"
        strokeWidth={tam * 0.3}
        strokeLinejoin="round"
        paintOrder="stroke"
        strokeOpacity={0.92}
        letterSpacing={e.sutil ? 0.12 : 0.02}
      >
        {e.lineas.map((l, i) => (
          <tspan key={i} x={e.pos.x} dy={i === 0 ? 0 : interlineado}>
            {l}
            {e.icono === 'flecha' && i === e.lineas.length - 1 ? ' →' : ''}
          </tspan>
        ))}
      </text>
    </g>
  );
}

function Acceso() {
  const { etiqueta, flecha } = ACCESO;
  return (
    <g aria-hidden="true" pointerEvents="none">
      <rect x={MUNDO.x0 - 1} y={etiqueta.y - 1.7} width={11.5} height={3.4} rx={1.7} fill="#fffdf6" stroke="#cfc9ba" strokeWidth={0.2} />
      <text x={MUNDO.x0 + 1.6} y={etiqueta.y + 0.7} fontSize={1.9} fontWeight={700} fill={C.tinta}>
        Acceso →
      </text>
      <g transform={`translate(${flecha.x} ${flecha.y}) rotate(-38)`}>
        <path d="M-1 0H0.8M0.1 -0.8L1 0L0.1 0.8" stroke="#2c3139" strokeWidth={0.34} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </g>
  );
}

const Rotulos = memo(function Rotulos() {
  return (
    <g>
      {ETIQUETAS.map((e) => (
        <Etiqueta key={e.id} e={e} />
      ))}
      <Acceso />
    </g>
  );
});

// ── Composición ─────────────────────────────────────────────────────────────

/** Capa base: terreno, superficies, caminos y plataformas de mesas. Va DEBAJO de las mesas. */
export function EscenarioSalon({ zonas, mostrarHotel = true }: { zonas: ZonaMesas[]; mostrarHotel?: boolean }) {
  return (
    <g>
      <Definiciones />
      <TerrenoBase />
      {mostrarHotel && <EscenarioHotel />}
      <Terreno />
      <Caminos />
      <PlataformasMesas zonas={zonas} />
      <Instalaciones />
      <Vegetacion />
    </g>
  );
}

/** Rótulos del recinto. Se dibujan ENCIMA de la base pero DEBAJO de las mesas. */
export { Rotulos as RotulosSalon };

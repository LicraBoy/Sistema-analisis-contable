/**
 * EscenarioHotel — el hotel completo alrededor de la zona de la fiesta (SVG).
 *
 * Se dibuja DEBAJO de la escena de la fiesta y sin eventos de puntero: es
 * contexto, no interfaz. Las figuras vienen de `geometriaHotel.ts` (trazadas
 * sobre la foto aérea). Reutiliza los degradados, patrones y símbolos de
 * `EscenarioSalon` (mismo documento SVG); solo define aquí los que son propios
 * del hotel (tejas, paneles solares, ventanas, cajones, paja).
 */

import { memo } from 'react';

import { MUNDO, trazoSuave, type Pt } from './geometria';
import {
  ALBERCA_PRINCIPAL,
  ARENA_CLUB,
  AUTOS,
  BANQUETA_NORTE,
  CALLE_NORTE,
  CAMASTROS_ALBERCA,
  CAMINOS_HOTEL,
  CANCHAS_TENIS,
  CARRETERA_OESTE,
  CASETAS,
  CHAPOTEADERO,
  DECK_ALBERCA,
  EDIFICIO_ALBERCA,
  EDIFICIO_GRIS,
  EDIFICIOS,
  ESTACIONAMIENTO,
  ETIQUETAS_HOTEL,
  HOTEL,
  ISLETA_ESTACIONAMIENTO,
  LH,
  PALAPA_GRANDE,
  PALAPAS,
  PLAYA,
  SOMBRILLAS_PLAYA,
  TECHO_SOLAR,
  TIRA_BLANCA,
  puntos,
  type Palapa,
} from './geometriaHotel';
import { PLANTAS_HOTEL } from './vegetacion';

const SOMBRA = '#10230f';

// ── Definiciones propias del hotel ──────────────────────────────────────────

const DefinicionesHotel = memo(function DefinicionesHotel() {
  return (
    <defs>
      <pattern id="h-teja" width="2.4" height="2.4" patternUnits="userSpaceOnUse">
        <rect width="2.4" height="2.4" fill="#d9763a" />
        <path d="M0 0.6H2.4M0 1.8H2.4" stroke="#bf5f2a" strokeWidth="0.32" />
        <path d="M0.6 0V0.6M1.8 0.6V1.8M0.6 1.8V2.4" stroke="#c76a31" strokeWidth="0.18" />
        <path d="M0 0.1H2.4M0 1.3H2.4" stroke="#e99059" strokeWidth="0.12" opacity="0.7" />
      </pattern>
      <pattern id="h-paneles" width="2.2" height="1.6" patternUnits="userSpaceOnUse">
        <rect width="2.2" height="1.6" fill="#52627e" />
        <path d="M0 0H2.2M0 0V1.6" stroke="#aebbd0" strokeWidth="0.16" />
        <path d="M1.1 0V1.6" stroke="#6f819f" strokeWidth="0.1" />
      </pattern>
      <pattern id="h-ventanas" width="2.8" height="2.6" patternUnits="userSpaceOnUse">
        <rect width="2.8" height="2.6" fill="#efe6d4" />
        <rect x="0.5" y="0.5" width="1.5" height="1.2" fill="#8a9bb0" opacity="0.75" />
        <path d="M0 2.4H2.8" stroke="#cdbf9f" strokeWidth="0.25" />
      </pattern>
      <pattern id="h-cajones" width="5.2" height="9" patternUnits="userSpaceOnUse">
        <path d="M0.1 0V9" stroke="#f1f1ec" strokeWidth="0.22" opacity="0.85" />
      </pattern>
      <pattern id="h-gris" width="3.2" height="3.2" patternUnits="userSpaceOnUse">
        <rect width="3.2" height="3.2" fill="#cfd3d6" />
        <path d="M0.4 0V3.2" stroke="#aeb4ba" strokeWidth="0.3" />
        <path d="M2.2 0V3.2" stroke="#e4e7e9" strokeWidth="0.18" />
      </pattern>
      <pattern id="h-paja" width="2" height="2" patternUnits="userSpaceOnUse">
        <rect width="2" height="2" fill="#8d7146" />
        <path d="M0 0.5L2 1.5M0 1.5L2 0.4" stroke="#6f5632" strokeWidth="0.22" />
      </pattern>
      <linearGradient id="h-mar" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#bfeee6" />
        <stop offset="0.28" stopColor="#6cd0dc" />
        <stop offset="1" stopColor="#1f7fb8" />
      </linearGradient>
    </defs>
  );
});

// ── Costa, calles y senderos ────────────────────────────────────────────────

const Costa = memo(function Costa() {
  const x0 = PLAYA.x0;
  const ancho = PLAYA.x1 - PLAYA.x0;
  const arenaY = MUNDO.y1; // la arena arranca donde termina el jardín de la fiesta
  const marY = PLAYA.marY;
  const marAlto = HOTEL.y1 + 90 - marY;
  const ola = (y: number, fase: number) => {
    let d = `M${x0} ${y}`;
    for (let x = x0; x < x0 + ancho; x += 14) d += ` q3.5 ${fase} 7 0 t7 0`;
    return d;
  };
  return (
    <g aria-hidden="true">
      <rect x={x0} y={arenaY} width={ancho} height={marY - arenaY + 0.5} fill="#efdfc3" />
      <rect x={x0} y={arenaY} width={ancho} height={marY - arenaY + 0.5} fill="url(#p-arena)" />
      <rect x={x0} y={marY} width={ancho} height={marAlto} fill="url(#h-mar)" />
      <path d={ola(marY + 0.2, 1.1)} fill="none" stroke="#ffffff" strokeWidth={0.7} opacity={0.75} />
      <path d={ola(marY + 3.4, -1.0)} fill="none" stroke="#ffffff" strokeWidth={0.35} opacity={0.4} />
      <path d={ola(marY + 8.5, 1.2)} fill="none" stroke="#ffffff" strokeWidth={0.3} opacity={0.28} />
    </g>
  );
});

const Calles = memo(function Calles() {
  const { x: cx, y: cy, w: cw, h: ch } = CALLE_NORTE;
  return (
    <g aria-hidden="true">
      <rect x={cx} y={cy} width={cw} height={ch} fill="#a3a39e" />
      <rect x={cx} y={cy} width={cw} height={ch} fill="url(#p-calle)" />
      <line x1={cx} x2={cx + cw} y1={cy + ch * 0.55} y2={cy + ch * 0.55} stroke="#f1eee2" strokeWidth={0.5} strokeDasharray="6 4.5" opacity={0.75} />
      <rect x={BANQUETA_NORTE.x} y={BANQUETA_NORTE.y} width={BANQUETA_NORTE.w} height={BANQUETA_NORTE.h} fill="#ddd6c7" />
      <rect x={BANQUETA_NORTE.x} y={BANQUETA_NORTE.y} width={BANQUETA_NORTE.w} height={BANQUETA_NORTE.h} fill="url(#p-losas)" />
      <rect x={CARRETERA_OESTE.x} y={CARRETERA_OESTE.y} width={CARRETERA_OESTE.w} height={CARRETERA_OESTE.h} fill="#c3c3bb" />
      <rect x={CARRETERA_OESTE.x} y={CARRETERA_OESTE.y} width={CARRETERA_OESTE.w} height={CARRETERA_OESTE.h} fill="url(#p-calle)" />
      <line
        x1={CARRETERA_OESTE.x + CARRETERA_OESTE.w * 0.62}
        x2={CARRETERA_OESTE.x + CARRETERA_OESTE.w * 0.62}
        y1={CARRETERA_OESTE.y}
        y2={CARRETERA_OESTE.y + CARRETERA_OESTE.h}
        stroke="#f4f1e6"
        strokeWidth={0.4}
        strokeDasharray="4 3"
        opacity={0.8}
      />
    </g>
  );
});

const Senderos = memo(function Senderos() {
  return (
    <g aria-hidden="true" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {CAMINOS_HOTEL.map((c) => {
        const d = trazoSuave(c.puntos);
        return (
          <g key={c.id}>
            <path d={d} stroke="#000" strokeOpacity={0.12} strokeWidth={c.ancho + 0.9} transform="translate(0.3 0.45)" />
            <path d={d} stroke="#bfa57f" strokeWidth={c.ancho + 0.6} />
            <path d={d} stroke="#ecdabf" strokeWidth={c.ancho} />
            <path d={d} stroke="#f4e7d1" strokeWidth={c.ancho * 0.5} opacity={0.55} />
          </g>
        );
      })}
    </g>
  );
});

// ── Estacionamiento y tenis ─────────────────────────────────────────────────

const Estacionamiento = memo(function Estacionamiento() {
  const isleta = ISLETA_ESTACIONAMIENTO;
  return (
    <g aria-hidden="true">
      <polygon points={puntos(ESTACIONAMIENTO.pts)} transform="translate(0.8 1.1)" fill="#000" opacity={0.16} />
      <polygon points={puntos(ESTACIONAMIENTO.pts)} fill="#b6b6b0" stroke="#8f8f88" strokeWidth={0.5} strokeLinejoin="round" />
      <polygon points={puntos(ESTACIONAMIENTO.pts)} fill="url(#p-calle)" />
      <polygon points={puntos(ESTACIONAMIENTO.pts)} fill="url(#h-cajones)" opacity={0.7} />
      <circle cx={isleta.centro.x} cy={isleta.centro.y} r={isleta.radio} fill="#8dc06a" stroke="#c9c9c2" strokeWidth={0.6} />
      <circle cx={isleta.centro.x} cy={isleta.centro.y} r={isleta.radio * 0.45} fill="#4f8f3b" />
      {AUTOS.map((a, i) => (
        <g key={i} transform={`translate(${a.centro.x.toFixed(2)} ${a.centro.y.toFixed(2)}) rotate(${a.rot})`}>
          <rect x={-LH(8.5)} y={-LH(4.5)} width={LH(17)} height={LH(9)} rx={0.9} fill="#000" opacity={0.22} transform="translate(0.5 0.6)" />
          <rect x={-LH(8.5)} y={-LH(4.5)} width={LH(17)} height={LH(9)} rx={0.9} fill={a.color} stroke="#00000044" strokeWidth={0.18} />
          <rect x={-LH(3)} y={-LH(3.4)} width={LH(8)} height={LH(6.8)} rx={0.5} fill="#1d2630" opacity={0.55} />
        </g>
      ))}
      {/* techo solar */}
      <polygon points={puntos(TECHO_SOLAR.pts)} transform="translate(0.9 1.3)" fill="#000" opacity={0.22} />
      <polygon points={puntos(TECHO_SOLAR.pts)} fill="url(#h-paneles)" stroke="#2d3a52" strokeWidth={0.45} strokeLinejoin="round" />
      {TECHO_SOLAR.pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={0.55} fill="#7b8594" />
      ))}
      {CASETAS.map((c, i) => (
        <g key={i}>
          <rect x={c.centro.x - c.w / 2 + 0.5} y={c.centro.y - c.h / 2 + 0.7} width={c.w} height={c.h} fill="#000" opacity={0.2} />
          <rect x={c.centro.x - c.w / 2} y={c.centro.y - c.h / 2} width={c.w} height={c.h} fill="url(#h-teja)" stroke="#a85a2c" strokeWidth={0.25} />
        </g>
      ))}
    </g>
  );
});

const Tenis = memo(function Tenis() {
  return (
    <g aria-hidden="true">
      {CANCHAS_TENIS.map((c, i) => {
        const w = c.w;
        const h = c.h;
        const iw = w * 0.82;
        const ih = h * 0.74;
        return (
          <g key={i} transform={`translate(${c.centro.x.toFixed(2)} ${c.centro.y.toFixed(2)}) rotate(${c.rot})`}>
            <rect x={-w / 2 + 0.7} y={-h / 2 + 1} width={w} height={h} rx={1} fill="#000" opacity={0.18} />
            <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={1} fill="#cf6a40" stroke="#a24f2d" strokeWidth={0.35} />
            <rect x={-iw / 2} y={-ih / 2} width={iw} height={ih} fill="#4d9d68" stroke="#f4f1e6" strokeWidth={0.4} />
            <line x1={0} x2={0} y1={-ih / 2} y2={ih / 2} stroke="#f4f1e6" strokeWidth={0.5} />
            <line x1={-iw / 2} x2={iw / 2} y1={0} y2={0} stroke="#f4f1e6" strokeWidth={0.28} />
            <rect x={-iw * 0.27} y={-ih / 2} width={iw * 0.54} height={ih} fill="none" stroke="#f4f1e6" strokeWidth={0.3} />
            <line x1={-iw * 0.27} x2={-iw * 0.27} y1={-ih / 2} y2={ih / 2} stroke="#f4f1e6" strokeWidth={0.3} />
            <line x1={iw * 0.27} x2={iw * 0.27} y1={-ih / 2} y2={ih / 2} stroke="#f4f1e6" strokeWidth={0.3} />
          </g>
        );
      })}
    </g>
  );
});

// ── Edificios ───────────────────────────────────────────────────────────────

const Edificios = memo(function Edificios() {
  return (
    <g aria-hidden="true">
      {/* bodega de techo gris */}
      <polygon points={puntos(EDIFICIO_GRIS.pts)} transform="translate(1.1 1.6)" fill="#000" opacity={0.2} />
      <polygon points={puntos(EDIFICIO_GRIS.pts)} fill="url(#h-gris)" stroke="#9aa0a6" strokeWidth={0.4} strokeLinejoin="round" />

      {EDIFICIOS.map((e) => (
        <g key={e.id}>
          <polygon points={puntos([...e.techo, ...(e.fachada ?? [])])} transform="translate(1.6 2.3)" fill="#000" opacity={0.24} />
          {e.fachada && <polygon points={puntos(e.fachada)} fill="url(#h-ventanas)" stroke="#b9a98a" strokeWidth={0.3} strokeLinejoin="round" />}
          <polygon points={puntos(e.techo)} fill="url(#h-teja)" stroke="#9c4f25" strokeWidth={0.45} strokeLinejoin="round" />
          {e.caballetes?.map(([a, b], i) => (
            <g key={i}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#9c4f25" strokeWidth={0.55} strokeLinecap="round" />
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#f0a36f" strokeWidth={0.18} strokeLinecap="round" opacity={0.8} />
            </g>
          ))}
          {e.paneles?.map((p, i) => (
            <polygon key={i} points={puntos(p)} fill="url(#h-paneles)" stroke="#2d3a52" strokeWidth={0.35} strokeLinejoin="round" />
          ))}
        </g>
      ))}

      <polygon points={puntos(TIRA_BLANCA.pts)} transform="translate(0.9 1.3)" fill="#000" opacity={0.18} />
      <polygon points={puntos(TIRA_BLANCA.pts)} fill="#f4f2ee" stroke="#cfcbc2" strokeWidth={0.35} strokeLinejoin="round" />

      <polygon points={puntos(EDIFICIO_ALBERCA.pts)} transform="translate(0.9 1.3)" fill="#000" opacity={0.2} />
      <polygon points={puntos(EDIFICIO_ALBERCA.pts)} fill="#efeae0" stroke="#c9c1ae" strokeWidth={0.35} strokeLinejoin="round" />
      {[0.25, 0.62].map((k) => (
        <rect
          key={k}
          x={EDIFICIO_ALBERCA.pts[0].x + 1.2}
          y={EDIFICIO_ALBERCA.pts[0].y + (EDIFICIO_ALBERCA.pts[2].y - EDIFICIO_ALBERCA.pts[0].y) * k}
          width={EDIFICIO_ALBERCA.pts[1].x - EDIFICIO_ALBERCA.pts[0].x - 2.4}
          height={3.2}
          fill="#c4d8e2"
          stroke="#a9bfcb"
          strokeWidth={0.2}
        />
      ))}
    </g>
  );
});

// ── Alberca, palapas y club de playa ────────────────────────────────────────

function PalapaSvg({ p }: { p: Palapa }) {
  const { centro, radio } = p;
  return (
    <g transform={p.achatada ? `translate(${centro.x} ${centro.y}) scale(1 ${p.achatada}) translate(${-centro.x} ${-centro.y})` : undefined}>
      <circle cx={centro.x + radio * 0.14} cy={centro.y + radio * 0.2} r={radio} fill="#000" opacity={0.2} />
      <circle cx={centro.x} cy={centro.y} r={radio} fill="url(#h-paja)" stroke="#5e472a" strokeWidth={0.35} />
      {Array.from({ length: 14 }, (_, i) => (
        <line
          key={i}
          x1={centro.x}
          y1={centro.y}
          x2={centro.x}
          y2={centro.y - radio}
          stroke="#53401f"
          strokeWidth={0.22}
          opacity={0.7}
          transform={`rotate(${(360 / 14) * i} ${centro.x} ${centro.y})`}
        />
      ))}
      <circle cx={centro.x} cy={centro.y} r={radio * 0.16} fill="#a58a58" stroke="#5e472a" strokeWidth={0.25} />
    </g>
  );
}

const ClubDePlaya = memo(function ClubDePlaya() {
  const a = ALBERCA_PRINCIPAL;
  const c = CHAPOTEADERO;
  return (
    <g aria-hidden="true">
      <polygon points={puntos(ARENA_CLUB.pts)} fill="#efdfc3" stroke="#d3c09a" strokeWidth={0.4} strokeLinejoin="round" />
      <polygon points={puntos(ARENA_CLUB.pts)} fill="url(#p-arena)" />

      {/* deck y alberca principal */}
      <polygon points={puntos(DECK_ALBERCA.pts)} transform="translate(0.8 1.1)" fill="#000" opacity={0.16} />
      <polygon points={puntos(DECK_ALBERCA.pts)} fill="#eae4d7" stroke="#cdc5b2" strokeWidth={0.4} strokeLinejoin="round" />
      <polygon points={puntos(DECK_ALBERCA.pts)} fill="url(#p-losas)" opacity={0.7} />
      <rect x={a.x} y={a.y} width={a.w} height={a.h} rx={a.rx} fill="url(#g-agua)" stroke="#7fbfd6" strokeWidth={0.6} />
      <rect x={a.x + 1.4} y={a.y + 1.4} width={a.w - 2.8} height={a.h - 2.8} rx={a.rx - 1.2} fill="none" stroke="#ffffff" strokeWidth={0.28} opacity={0.4} />
      {[0.3, 0.55, 0.78].map((k) => (
        <path key={k} d={`M${a.x + 3} ${a.y + a.h * k} q${a.w * 0.2} -0.9 ${a.w * 0.4} 0 t${a.w * 0.4} 0`} fill="none" stroke="#fff" strokeWidth={0.22} opacity={0.5} />
      ))}
      {/* chapoteadero */}
      <rect x={c.x - 0.8} y={c.y - 0.8} width={c.w + 1.6} height={c.h + 1.6} rx={c.rx + 0.8} fill="#f1ede5" stroke="#cdc7ba" strokeWidth={0.3} />
      <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={c.rx} fill="url(#g-agua)" stroke="#7fbfd6" strokeWidth={0.35} />

      {/* camastros azules */}
      {CAMASTROS_ALBERCA.flatMap((f, fi) =>
        Array.from({ length: f.n }, (_, i) => {
          const x = f.desde.x + (f.vertical ? 0 : i * f.paso);
          const y = f.desde.y + (f.vertical ? i * f.paso : 0);
          return <rect key={`${fi}-${i}`} x={x} y={y} width={f.vertical ? 3.4 : 2.1} height={f.vertical ? 2.1 : 3.4} rx={0.5} fill="#4a86d4" stroke="#ffffff" strokeWidth={0.2} />;
        }),
      )}

      {PALAPAS.map((p, i) => (
        <PalapaSvg key={i} p={p} />
      ))}
      <PalapaSvg p={PALAPA_GRANDE} />
      {SOMBRILLAS_PLAYA.flatMap((f, fi) =>
        Array.from({ length: f.n }, (_, i) => <PalapaSvg key={`s${fi}-${i}`} p={{ centro: { x: f.desde.x + i * f.paso, y: f.desde.y } as Pt, radio: LH(7) }} />),
      )}
    </g>
  );
});

// ── Vegetación del hotel ────────────────────────────────────────────────────

const VegetacionHotel = memo(function VegetacionHotel() {
  return (
    <g aria-hidden="true">
      <g fill={SOMBRA} opacity={0.2}>
        {PLANTAS_HOTEL.map((p, i) => (
          <ellipse key={i} cx={p.x + p.radio * 0.34} cy={p.y + p.radio * 0.3} rx={p.radio * 0.95} ry={p.radio * 0.78} />
        ))}
      </g>
      {PLANTAS_HOTEL.map((p, i) => (
        <use
          key={i}
          href={`#${p.tipo}-${p.tipo === 'arbusto' ? 0 : p.variante}-${p.tono}`}
          transform={`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${p.rot.toFixed(0)}) scale(${p.radio.toFixed(2)})`}
        />
      ))}
    </g>
  );
});

// ── Etiquetas ───────────────────────────────────────────────────────────────

const EtiquetasHotel = memo(function EtiquetasHotel() {
  return (
    <g aria-hidden="true" pointerEvents="none">
      {ETIQUETAS_HOTEL.map((e) => {
        const sutil = e.id === 'hotel';
        const interlineado = e.tam * 1.22;
        const y0 = e.pos.y - (e.lineas.length * interlineado) / 2 + e.tam * 0.85;
        return (
          <text
            key={e.id}
            x={e.pos.x}
            y={y0}
            textAnchor="middle"
            fontSize={e.tam}
            fontWeight={sutil ? 800 : 700}
            fill={sutil ? '#fffaf0' : '#2c3139'}
            stroke={sutil ? '#2b3a2a' : '#fffdf6'}
            strokeWidth={e.tam * (sutil ? 0.18 : 0.3)}
            strokeLinejoin="round"
            paintOrder="stroke"
            strokeOpacity={sutil ? 0.55 : 0.92}
            letterSpacing={sutil ? 0.4 : 0.02}
          >
            {e.lineas.map((l, i) => (
              <tspan key={i} x={e.pos.x} dy={i === 0 ? 0 : interlineado}>
                {l}
              </tspan>
            ))}
          </text>
        );
      })}
    </g>
  );
});

// ── Composición ─────────────────────────────────────────────────────────────

/** Hotel completo, sin interacción. Va debajo de la escena de la fiesta. */
export const EscenarioHotel = memo(function EscenarioHotel() {
  return (
    <g pointerEvents="none">
      <DefinicionesHotel />
      <Costa />
      <Calles />
      <Senderos />
      <Estacionamiento />
      <Tenis />
      <Edificios />
      <ClubDePlaya />
      <VegetacionHotel />
      <EtiquetasHotel />
    </g>
  );
});

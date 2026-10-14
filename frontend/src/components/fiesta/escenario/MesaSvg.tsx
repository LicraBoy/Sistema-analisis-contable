/**
 * MesaSvg — una mesa vista desde arriba, en unidades del mundo.
 *
 * Es solo presentación: recibe el estado ya calculado y avisa clics/teclas.
 * "Seleccionada" (aro azul + pastilla con el número) es un estado de la
 * interfaz y nunca se confunde con los estados de la reservación, que se ven
 * en el color de cada silla.
 */

import { memo, useMemo } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';

import type { FiestaMesa } from '../../../api/fiestaHooks';
import { ESTADO_SILLA_CONFIG } from '../fiestaUtils';

export const RADIO_MESA = 1.06;
export const DIST_SILLAS = 1.78;
const SILLA_ANCHO = 0.64;
const SILLA_FONDO = 0.46;
/** Radio de la zona sensible (más amplia que la mesa para acertar con el dedo). */
export const RADIO_CLIC = 3.0;

interface Props {
  mesa: FiestaMesa;
  /** Posición en pantalla (ya reflejada), en unidades del mundo. */
  x: number;
  y: number;
  seleccionada: boolean;
  resaltada: boolean;
  atenuada: boolean;
  editando: boolean;
  /** Dibuja el número dentro de la mesa (solo si hay zoom suficiente para leerlo). */
  mostrarNumero: boolean;
  onAbrir: (id: number) => void;
  onPresionar: (e: PointerEvent<SVGGElement>, mesa: FiestaMesa) => void;
}

function MesaSvgBase({ mesa, x, y, seleccionada, resaltada, atenuada, editando, mostrarNumero, onAbrir, onPresionar }: Props) {
  // El mapa dibuja solo las sillas visibles (las 11 y 12 son "extra" y se manejan desde el panel).
  const visibles = useMemo(() => mesa.sillas.filter((s) => !s.extra), [mesa.sillas]);
  const n = visibles.length;
  const extrasOcupadas = mesa.sillas.reduce((k, s) => (s.extra && s.estado !== 'libre' && s.estado !== 'bloqueada' ? k + 1 : k), 0);
  const descripcion =
    mesa.libres === 0 ? 'sin lugares libres' : `${mesa.libres} de ${mesa.capacidad} lugares libres`;

  // Una silla = un rectángulo girado; todas las del mismo estado van en un solo <path> (1-3 nodos por mesa).
  const sillasPorEstado = useMemo(() => {
    const grupos = new Map<string, string>();
    visibles.forEach((silla, i) => {
      const a = (Math.PI * 2 * i) / n;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const pt = (lx: number, ly: number) => {
        const y0 = ly - DIST_SILLAS;
        return `${(lx * c - y0 * s).toFixed(2)} ${(lx * s + y0 * c).toFixed(2)}`;
      };
      const hw = SILLA_ANCHO / 2;
      const hh = SILLA_FONDO / 2;
      const d = `M${pt(-hw, -hh)}L${pt(hw, -hh)}L${pt(hw, hh)}L${pt(-hw, hh)}Z`;
      // Se pinta por el estado de pago de CADA silla (pagada / anticipo / sin pago), no por el de la reservación.
      const pintado = silla.estado_pago ?? silla.estado;
      grupos.set(pintado, (grupos.get(pintado) ?? '') + d);
    });
    return [...grupos.entries()].map(([estado, d]) => ({ estado, d }));
  }, [visibles, n]);
  const clientes = [...new Set(mesa.sillas.map((s) => s.cliente).filter(Boolean))].join(', ');
  const pagadas = mesa.sillas.filter((s) => s.estado_pago === 'pagada').length;
  const resumenPago = pagadas > 0 ? ` · ${pagadas} pagada${pagadas === 1 ? '' : 's'}` : '';

  const alTeclear = (e: KeyboardEvent<SVGGElement>) => {
    if (editando) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onAbrir(mesa.id);
    }
  };

  return (
    <g
      className="fc-mesa"
      transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`}
      opacity={atenuada ? 0.22 : 1}
      style={{ cursor: editando ? 'move' : 'pointer' }}
      role="button"
      tabIndex={0}
      aria-label={`Mesa ${mesa.numero}, ${descripcion}${seleccionada ? ', seleccionada' : ''}`}
      aria-pressed={seleccionada}
      onClick={() => {
        if (!editando) onAbrir(mesa.id);
      }}
      onKeyDown={alTeclear}
      onPointerDown={(e) => onPresionar(e, mesa)}
    >
      <title>{`Mesa ${mesa.numero} · ${descripcion}${resumenPago}${clientes ? ` · ${clientes}` : ''}`}</title>

      {/* zona sensible, invisible */}
      <circle r={RADIO_CLIC} fill="transparent" />
      {/* halo al pasar el cursor y aro de foco del teclado */}
      <circle className="fc-hover" r={2.75} fill="#ffffff" opacity={0} />
      <circle className="fc-foco" r={3.05} fill="none" stroke="#1c7ed6" strokeWidth={0.22} strokeDasharray="0.5 0.35" opacity={0} />

      {/* sombra */}
      <ellipse cx={0.28} cy={0.4} rx={DIST_SILLAS + 0.5} ry={DIST_SILLAS + 0.42} fill="#10230f" opacity={0.2} />

      {/* sillas, orientadas hacia el centro */}
      {sillasPorEstado.map(({ estado, d }) => {
        const cfg = ESTADO_SILLA_CONFIG[estado as keyof typeof ESTADO_SILLA_CONFIG];
        return (
          <path key={estado} d={d} fill={cfg.relleno} stroke={cfg.borde} strokeWidth={0.12} strokeLinejoin="round" />
        );
      })}

      {/* tablero */}
      <circle r={RADIO_MESA} fill="#ffffff" stroke="#9aa3ad" strokeWidth={0.14} />
      <circle r={RADIO_MESA * 0.74} fill="none" stroke="#dde2e7" strokeWidth={0.07} />
      {mostrarNumero && (
        <text
          y={0.3}
          textAnchor="middle"
          fontSize={mesa.numero >= 100 ? 0.78 : 0.92}
          fontWeight={800}
          fill="#27303a"
          pointerEvents="none"
        >
          {mesa.numero}
        </text>
      )}

      {/* sillas extra (11-12) ocupadas: no se dibujan, pero se avisa con una insignia */}
      {extrasOcupadas > 0 && (
        <g transform="translate(1.45 -1.45)" pointerEvents="none">
          <circle r={0.62} fill="#495057" stroke="#ffffff" strokeWidth={0.1} />
          <text y={0.22} textAnchor="middle" fontSize={0.62} fontWeight={800} fill="#ffffff">
            +{extrasOcupadas}
          </text>
        </g>
      )}

      {/* resaltada por la búsqueda */}
      {resaltada && <circle r={2.7} fill="none" stroke="#7048e8" strokeWidth={0.26} strokeDasharray="0.7 0.4" />}

      {/* seleccionada */}
      {seleccionada && (
        <g pointerEvents="none">
          <circle r={3.3} fill="#1c7ed6" opacity={0.14} />
          <circle r={2.9} fill="none" stroke="#1c7ed6" strokeWidth={0.3} />
          <g transform="translate(0 -4.3)">
            <rect x={-2.5} y={-0.95} width={5} height={1.9} rx={0.95} fill="#1c7ed6" />
            <path d="M-0.5 0.9 L0 1.55 L0.5 0.9Z" fill="#1c7ed6" />
            <text y={0.36} textAnchor="middle" fontSize={1.05} fontWeight={800} fill="#ffffff">
              Mesa {mesa.numero}
            </text>
          </g>
        </g>
      )}
    </g>
  );
}

export const MesaSvg = memo(MesaSvgBase);

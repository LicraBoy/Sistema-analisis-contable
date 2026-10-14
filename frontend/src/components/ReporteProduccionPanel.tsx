/**
 * Reporte de revisión de producción y ventas de Carnes y Mariscos — captura
 * diaria de los formatos Porcionador y Cocina, cuadre, cruce y catálogo de renglones.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { detalleErrorApi } from '../api/client';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Anchor,
  Card,
  Input,
  type InputProps,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  Switch,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconArrowRight, IconChevronDown, IconChevronUp, IconDeviceFloppy, IconDownload, IconEdit, IconEyeOff, IconEye, IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react';
import {
  exportInventarioBruto,
  exportReporteProduccion,
  useGuardarPrecioProductoBase,
  useInventarioBruto,
  useCatalogoReporteProduccion,
  useCruceReporteProduccion,
  useCrearRenglonProduccion,
  useBorrarDiaReporteProduccion,
  useBorrarPesaje,
  useCrearPesaje,
  useEditarPesaje,
  usePesajesDia,
  useDesactivarRenglonProduccion,
  useDiaReporteProduccion,
  useEditarRenglonProduccion,
  useFechasReporteProduccion,
  useGuardarCapturaReporteProduccion,
  useGuardarDiaReporteProduccion,
  useSembrarCatalogoReporteProduccion,
} from '../api/hooks';
import type {
  EstadoControlLimpieza,
  EstadoDiferenciaProduccion,
  FilaCapturaProduccion,
  HojaReporteProduccion,
  PesajeLimpieza,
  ProductoInventarioBruto,
  ProductoLimpieza,
  ControlLimpieza,
  RenglonProduccion,
} from '../types';

const UNIDADES = ['PORCION', 'KG', 'PZA', 'BULTO', '1/2 PZA'];

// Sobrio: solo se resalta lo anómalo (conteo que no cuadra, existencia negativa).
const COLOR_DIFERENCIA: Record<EstadoDiferenciaProduccion, string | undefined> = {
  sin_conteo: undefined,
  cuadra: undefined,
  sobrante: 'orange',
  faltante: 'red',
};

const aFechaIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parseFechaIso = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(Math.round(n * 1000) / 1000));

// ── Captura de una hoja (porcionador / cocina) ─────────────────────────
// La existencia final se calcula sola: inicial + entradas − salidas, y el inicial
// es la existencia final del día anterior. Ambos se pueden corregir a mano cualquier
// día (fallas o días sin capturar): lo editado manda y se arrastra a los siguientes.
// Solo se guarda lo que el usuario cambió; el resto lo calcula el sistema.

const ETIQUETAS_COLUMNAS: Record<HojaReporteProduccion, { inicial: string; entradas: string; salidas: string }> = {
  porcionador: { inicial: 'Inventario inicial', entradas: 'Entradas y producción', salidas: 'Salidas a cocina' },
  cocina: { inicial: 'Existencia inicial', entradas: 'Entradas', salidas: 'Ventas' },
};

interface Valores {
  inicial: number | null;
  entradas: number | null;
  salidas: number | null;
  conteo_fisico: number | null;
}

type CampoValor = keyof Valores;

// ── Borrador local ──────────────────────────────────────────────────────
// Lo tecleado sin guardar se conserva en el navegador (por hoja y día): sobrevive a recargar la
// página, cambiar de pestaña/día o cerrar sin querer. Se borra al guardar o al descartarlo.
interface Borrador {
  valores: Record<number, Valores>;
  responsable: string;
  notas: string;
  guardadoEn: string;
}

const claveBorrador = (hoja: HojaReporteProduccion, fecha: string) => `reporte-produccion:borrador:${hoja}:${fecha}`;

function leerBorrador(clave: string): Borrador | null {
  try {
    const crudo = localStorage.getItem(clave);
    return crudo ? (JSON.parse(crudo) as Borrador) : null;
  } catch {
    return null;
  }
}

function guardarBorrador(clave: string, borrador: Borrador) {
  try {
    localStorage.setItem(clave, JSON.stringify(borrador));
  } catch {
    /* sin almacenamiento disponible: la captura sigue funcionando, solo sin borrador */
  }
}

function borrarBorrador(clave: string) {
  try {
    localStorage.removeItem(clave);
  } catch {
    /* ignorar */
  }
}

function CapturaHojaForm({
  fecha,
  hoja,
  renglones,
  dia,
  fechaDiaAnterior,
  onCambiosPendientes,
  onReiniciar,
}: {
  fecha: string;
  hoja: HojaReporteProduccion;
  renglones: FilaCapturaProduccion[];
  dia: { responsable_porcionador: string | null; responsable_cocina: string | null; notas: string | null };
  fechaDiaAnterior: string | null;
  onCambiosPendientes: (pendiente: boolean) => void;
  onReiniciar: () => void;
}) {
  const guardarCaptura = useGuardarCapturaReporteProduccion();
  const guardarDia = useGuardarDiaReporteProduccion();
  const borrarDia = useBorrarDiaReporteProduccion();

  // campos que el usuario está editando: se respeta lo tecleado (incluso vacío) hasta que sale del campo
  const [tocados, setTocados] = useState<Set<string>>(() => new Set());
  // texto tal cual se teclea ("2." o "2.5"): convertirlo a número en cada tecla se comía el punto decimal
  const [crudos, setCrudos] = useState<Record<string, string | number>>({});

  const clave = claveBorrador(hoja, fecha);
  const campoResponsable = hoja === 'porcionador' ? 'responsable_porcionador' : 'responsable_cocina';

  // lo que dice el servidor (base para iniciar o para descartar el borrador)
  const valoresServidor = (): Record<number, Valores> =>
    Object.fromEntries(
      renglones.map((r) => [
        r.id,
        {
          // solo se envía el inicial corregido a mano; si no, manda el arrastre
          inicial: r.inicial_manual,
          // solo se envía lo corregido a mano; si no, en cocina manda la sugerencia del porcionador
          entradas: r.entradas_manual,
          salidas: r.salidas,
          conteo_fisico: r.conteo_fisico,
        },
      ]),
    );

  const [borradorInicial] = useState(() => leerBorrador(clave));
  const [restaurado, setRestaurado] = useState(borradorInicial !== null);
  // hay algo tecleado que el servidor aún no tiene
  const [sucio, setSucio] = useState(borradorInicial !== null);
  // el guardado automático arranca con la primera edición (un borrador recuperado no se guarda solo)
  const [autoOk, setAutoOk] = useState(false);
  const [estadoAuto, setEstadoAuto] = useState<'idle' | 'guardando' | 'guardado' | 'error'>('idle');
  const [ultimoGuardado, setUltimoGuardado] = useState<string | null>(null);
  const versionRef = useRef(0); // sube con cada cambio; sirve para saber si hubo cambios durante un guardado
  const enVueloRef = useRef(false);
  const pendienteRef = useRef(false);
  // Renglones que el usuario realmente modificó (id → versión del último cambio). SOLO esos se envían al guardar:
  // enviar el formulario completo con datos viejos en pantalla borraba renglones ya guardados (un renglón
  // vacío significa "borrar su captura").
  const modificadasRef = useRef<Map<number, number>>(new Map());
  const diaModRef = useRef(false); // responsable / notas cambiaron

  const [valores, setValores] = useState<Record<number, Valores>>(() => {
    const base = valoresServidor();
    // del borrador solo se toman renglones que siguen existiendo
    return borradorInicial ? { ...base, ...Object.fromEntries(Object.entries(borradorInicial.valores).filter(([id]) => Number(id) in base)) } : base;
  });
  const [responsable, setResponsableEstado] = useState(borradorInicial?.responsable ?? dia[campoResponsable] ?? '');
  const [notas, setNotasEstado] = useState(borradorInicial?.notas ?? dia.notas ?? '');
  // un borrador recuperado solo cuenta como "pendiente" donde difiere de lo que ya tiene el servidor
  useState(() => {
    if (borradorInicial) {
      const base = valoresServidor();
      Object.entries(borradorInicial.valores).forEach(([id, v]) => {
        const b = base[Number(id)];
        if (b && (['inicial', 'entradas', 'salidas', 'conteo_fisico'] as CampoValor[]).some((c) => v[c] !== b[c])) {
          modificadasRef.current.set(Number(id), 0);
        }
      });
      diaModRef.current = borradorInicial.responsable !== (dia[campoResponsable] ?? '') || borradorInicial.notas !== (dia.notas ?? '');
    }
    return null;
  });

  // estable (solo usa refs y setters): las filas memoizadas dependen de que `actualizar`/`soltar` no cambien
  const marcarCambio = useCallback((id?: number) => {
    versionRef.current += 1;
    if (id !== undefined) modificadasRef.current.set(id, versionRef.current);
    setSucio(true);
    setAutoOk(true);
  }, []);
  const setResponsable = (v: string) => {
    diaModRef.current = true;
    marcarCambio();
    setResponsableEstado(v);
  };
  const setNotas = (v: string) => {
    diaModRef.current = true;
    marcarCambio();
    setNotasEstado(v);
  };

  // avisa al panel principal y guarda el borrador en cada cambio
  useEffect(() => onCambiosPendientes(sucio), [sucio, onCambiosPendientes]);
  useEffect(() => {
    if (sucio) guardarBorrador(clave, { valores, responsable, notas, guardadoEn: new Date().toISOString() });
  }, [sucio, valores, responsable, notas, clave]);
  // recargar o cerrar con cambios sin guardar: el navegador avisa (el borrador igual queda)
  useEffect(() => {
    if (!sucio) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [sucio]);

  const descartarBorrador = () => {
    borrarBorrador(clave);
    setValores(valoresServidor());
    setResponsableEstado(dia[campoResponsable] ?? '');
    setNotasEstado(dia.notas ?? '');
    setTocados(new Set());
    setCrudos({});
    setSucio(false);
    setRestaurado(false);
  };
  const [exportando, setExportando] = useState(false);

  const etiquetas = ETIQUETAS_COLUMNAS[hoja];

  const secciones = useMemo(() => {
    const mapa = new Map<string, FilaCapturaProduccion[]>();
    renglones.forEach((r) => mapa.set(r.seccion, [...(mapa.get(r.seccion) ?? []), r]));
    return [...mapa.entries()];
  }, [renglones]);

  const actualizar = useCallback(
    (id: number, campo: CampoValor, valor: string | number) => {
      marcarCambio(id);
      const llave = `${id}:${campo}`;
      setTocados((prev) => new Set(prev).add(llave));
      setCrudos((prev) => ({ ...prev, [llave]: valor }));
      const n = valor === '' ? null : Number(valor);
      setValores((prev) => ({ ...prev, [id]: { ...prev[id], [campo]: n === null || Number.isNaN(n) ? null : n } }));
    },
    [marcarCambio],
  );

  // al salir del campo: vacío o igual a lo calculado = vuelve a ser automático (no es una corrección)
  const soltar = useCallback((id: number, campo: CampoValor, sugerido: number | null) => {
    const llave = `${id}:${campo}`;
    setTocados((prev) => {
      const siguiente = new Set(prev);
      siguiente.delete(llave);
      return siguiente;
    });
    setCrudos((prev) => {
      const { [llave]: _quitado, ...resto } = prev;
      return resto;
    });
    setValores((prev) => {
      const actual = prev[id][campo];
      if (actual === null || (sugerido !== null && Math.abs(actual - sugerido) <= 0.0005)) {
        if (actual !== null) {
          versionRef.current += 1;
          modificadasRef.current.set(id, versionRef.current);
        }
        return { ...prev, [id]: { ...prev[id], [campo]: null } };
      }
      return prev;
    });
  }, []);

  const borrarDelDia = async () => {
    if (!window.confirm(`¿Borrar TODA la captura del ${fecha} (porcionador y cocina)? Los días anteriores y el catálogo no se tocan.`)) return;
    try {
      const res = await borrarDia.mutateAsync(fecha);
      // el borrado alcanza a ambas hojas: sus borradores ya no tienen sentido
      borrarBorrador(claveBorrador('porcionador', fecha));
      borrarBorrador(claveBorrador('cocina', fecha));
      setSucio(false);
      onCambiosPendientes(false);
      onReiniciar(); // el formulario vuelve a arrancar limpio con los datos ya vacíos
      notifications.show({ color: 'green', message: `Se borró la captura del día (${res.borrados} renglón(es)).` });
    } catch (error) {
      notifications.show({ color: 'red', message: detalleErrorApi(error, 'No se pudo borrar la captura.'), autoClose: false });
    }
  };

  // Lo último que hay en pantalla, para que el guardado automático (temporizador) nunca use valores viejos.
  const ultimoRef = useRef({ valores, responsable, notas });
  ultimoRef.current = { valores, responsable, notas };

  // Guarda todo el formulario. Lo usan el botón (manual) y el guardado automático. Si ya hay un guardado
  // en curso se encola otro al terminar, para que nunca se pierda lo tecleado mientras tanto.
  const guardar = async (manual = true) => {
    if (enVueloRef.current) {
      pendienteRef.current = true;
      return;
    }
    const idsModificados = new Set(modificadasRef.current.keys());
    const hayDia = diaModRef.current;
    if (idsModificados.size === 0 && !hayDia && !manual) {
      // el guardado automático no tiene nada que enviar
      setSucio(false);
      onCambiosPendientes(false);
      borrarBorrador(clave);
      return;
    }
    enVueloRef.current = true;
    const versionAlEmpezar = versionRef.current;
    const { valores: vals, responsable: resp, notas: nts } = ultimoRef.current;
    setEstadoAuto('guardando');
    diaModRef.current = false;
    try {
      // Siempre se envía la captura (aunque no haya renglones tocados): con `completar_hoja` el día queda
      // registrado para TODOS los productos, con su inicial y existencia final, sin que haya que tocarlos.
      const res = await guardarCaptura.mutateAsync({
        fecha,
        // solo los renglones que el usuario tocó traen datos
        renglones: renglones.filter((r) => idsModificados.has(r.id)).map((r) => ({ renglon_id: r.id, ...vals[r.id] })),
        completar_hoja: hoja,
      });
      const guardados = res.guardados;
      // los renglones enviados que no cambiaron durante el guardado ya no están pendientes
      idsModificados.forEach((id) => {
        if ((modificadasRef.current.get(id) ?? 0) <= versionAlEmpezar) modificadasRef.current.delete(id);
      });
      if (hayDia) {
        await guardarDia.mutateAsync({
          fecha,
          // solo el responsable de esta hoja: el endpoint no toca los campos omitidos
          [campoResponsable]: resp,
          notas: nts,
        });
      }
      if (modificadasRef.current.size === 0 && !diaModRef.current) {
        borrarBorrador(clave);
        setSucio(false);
        onCambiosPendientes(false);
      }
      setRestaurado(false);
      setEstadoAuto('guardado');
      setUltimoGuardado(new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      if (manual) {
        notifications.show({
          color: 'green',
          message: `Día guardado: ${renglones.length} productos con su inicial y existencia final${guardados > 0 ? ` (${guardados} con captura)` : ''}.`,
        });
      }
    } catch (error) {
      diaModRef.current = diaModRef.current || hayDia;
      setEstadoAuto('error');
      notifications.show({ color: 'red', message: detalleErrorApi(error, 'No se pudo guardar la captura.'), autoClose: false });
    } finally {
      enVueloRef.current = false;
      if (pendienteRef.current) {
        pendienteRef.current = false;
        void guardarRef.current(false);
      }
    }
  };
  const guardarRef = useRef(guardar);
  guardarRef.current = guardar;

  // guardado automático: 1 s después de la última tecla
  useEffect(() => {
    if (!sucio || !autoOk) return;
    const temporizador = setTimeout(() => void guardarRef.current(false), 1000);
    return () => clearTimeout(temporizador);
  }, [valores, responsable, notas, sucio, autoOk]);

  const exportar = async () => {
    setExportando(true);
    try {
      const blob = await exportReporteProduccion(fecha, hoja);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte_${hoja}_${fecha}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportando(false);
    }
  };


  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {fechaDiaAnterior
            ? `El inicial viene de la existencia final del ${fechaDiaAnterior}. Solo captura ${etiquetas.entradas.toLowerCase()} y ${etiquetas.salidas.toLowerCase()}.`
            : 'Primer día: captura el inventario inicial de cada producto; después solo entradas y salidas.'}
          {hoja === 'cocina' && ' Las entradas de cocina se sugieren con lo que el porcionador mandó; edítalas si llegó otra cantidad.'}
        </Text>
        <Button size="xs" variant="default" leftSection={<IconDownload size={14} />} loading={exportando} onClick={exportar}>
          Exportar Excel
        </Button>
      </Group>
      {restaurado && borradorInicial && (
        <Alert color="blue" variant="light" title="Se recuperó lo que tenías sin guardar">
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm">
              Borrador de las {new Date(borradorInicial.guardadoEn).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}.
              Revísalo y pulsa <b>Guardar captura</b> para conservarlo.
            </Text>
            <Button size="xs" variant="default" onClick={descartarBorrador}>
              Descartar borrador
            </Button>
          </Group>
        </Alert>
      )}
      <Text size="xs" c="dimmed">
        Se guarda solo al capturar. Teclado: <b>Enter</b> baja a la siguiente celda · <b>Shift+Enter</b> sube · <b>Tab</b> pasa a la derecha.
        Inicial y existencia final se pueden corregir a mano. Lo corregido se resalta en azul y los días siguientes parten de ahí.
      </Text>

      <Table.ScrollContainer minWidth={940}>
        <Table withTableBorder withColumnBorders verticalSpacing={4} fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Producto</Table.Th>
              <Table.Th>Presentación / variante</Table.Th>
              <Table.Th>Gramaje</Table.Th>
              <Table.Th>Unidad</Table.Th>
              <Table.Th w={110}>{etiquetas.inicial}</Table.Th>
              <Table.Th w={110}>{etiquetas.entradas}</Table.Th>
              <Table.Th w={110}>{etiquetas.salidas}</Table.Th>
              <Table.Th w={120}>Existencia final</Table.Th>
              <Table.Th w={90}>Ajuste</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {secciones.map(([seccion, filas]) => (
              <SeccionFilas key={seccion} seccion={seccion} filas={filas} valores={valores} tocados={tocados} crudos={crudos} onChange={actualizar} onSoltar={soltar} />
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput
          label={hoja === 'porcionador' ? 'Nombre del porcionador' : 'Nombre del responsable'}
          description="Quien resguarda y firma este inventario"
          value={responsable}
          onChange={(e) => setResponsable(e.currentTarget.value)}
        />
        <Textarea label="Notas del día" autosize minRows={1} value={notas} onChange={(e) => setNotas(e.currentTarget.value)} />
      </SimpleGrid>

      <Group justify="space-between">
        <Button variant="subtle" color="red" size="xs" leftSection={<IconTrash size={14} />} loading={borrarDia.isPending} onClick={borrarDelDia}>
          Borrar captura de este día
        </Button>
        {estadoAuto === 'error' ? (
          <Badge variant="light" color="red">
            No se pudo guardar · tus datos siguen aquí, pulsa Guardar para reintentar
          </Badge>
        ) : estadoAuto === 'guardando' ? (
          <Badge variant="light" color="blue">
            Guardando…
          </Badge>
        ) : sucio ? (
          <Badge variant="light" color="orange">
            {restaurado ? 'Borrador sin guardar · pulsa Guardar' : 'Guardando en un momento…'}
          </Badge>
        ) : ultimoGuardado ? (
          <Badge variant="light" color="green">
            Todo guardado · {ultimoGuardado}
          </Badge>
        ) : null}
        <Button
          leftSection={<IconDeviceFloppy size={16} />}
          loading={guardarCaptura.isPending || guardarDia.isPending}
          onClick={() => void guardar(true)}
        >
          Guardar captura
        </Button>
      </Group>
    </Stack>
  );
}

// ── Navegación con teclado ─────────────────────────────────────────────
// Enter baja a la siguiente celda de la misma columna (como Excel), Shift+Enter sube.
// Al terminar una columna salta al inicio de la siguiente. Tab sigue moviendo a la derecha.
const COLUMNAS_CAPTURA: CampoValor[] = ['inicial', 'entradas', 'salidas', 'conteo_fisico'];

function moverACelda(origen: HTMLInputElement, direccion: 1 | -1) {
  const tabla = origen.closest('table');
  if (!tabla) return;
  const celdas = Array.from(tabla.querySelectorAll<HTMLInputElement>('input[data-celda]'));
  const campoDe = (el: HTMLInputElement) => el.dataset.celda?.split(':')[1] as CampoValor;
  const columna = COLUMNAS_CAPTURA.indexOf(campoDe(origen));
  const enColumna = (c: number) => celdas.filter((el) => campoDe(el) === COLUMNAS_CAPTURA[c]);

  const actual = enColumna(columna);
  let destino = actual[actual.indexOf(origen) + direccion];
  if (!destino) {
    const otra = enColumna(columna + direccion);
    destino = direccion === 1 ? otra[0] : otra[otra.length - 1];
  }
  if (destino) {
    destino.focus();
    destino.select();
  }
}

// Props que se esparcen en cada celda editable: identifica la celda, selecciona al entrar y maneja Enter.
const celda = (id: number, campo: CampoValor) => ({
  'data-celda': `${id}:${campo}`,
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.select(),
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    moverACelda(e.currentTarget, e.shiftKey ? -1 : 1);
  },
});

// Campo numérico ligero para la tabla de captura. El NumberInput de Mantine cuesta ~0.5 ms por campo y la hoja
// tiene 180 (≈ 85 ms al abrir); el `Input` simple cuesta ~0.1 ms. Mantiene lo que se usaba: decimales (hasta 3),
// coma como punto, negativos solo donde se permiten y que "2." no pierda su punto (el texto sube tal cual).
const REGEX_NUMERO = /^-?\d*\.?\d{0,3}$/;

function aTexto(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  return typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : v;
}

function CeldaNumero({
  value,
  onChange,
  permitirNegativo = false,
  ...resto
}: {
  value: number | string;
  onChange: (valor: string) => void;
  permitirNegativo?: boolean;
  styles?: InputProps['styles'];
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  'data-celda'?: string;
}) {
  return (
    <Input
      size="xs"
      inputMode="decimal"
      autoComplete="off"
      value={aTexto(value)}
      onChange={(e) => {
        let texto = e.currentTarget.value.replace(',', '.');
        if (!permitirNegativo) texto = texto.replace('-', '');
        if (REGEX_NUMERO.test(texto)) onChange(texto); // lo que no es número se ignora
      }}
      {...resto}
    />
  );
}

// Estilos fijos (objetos nuevos en cada render harían que Mantine recalcule el estilo de cada celda).
const ESTILO_MANUAL = { input: { borderColor: 'var(--mantine-color-blue-5)', fontWeight: 600 } };
const ESTILO_FINAL_NEGATIVA = { input: { color: 'var(--mantine-color-red-7)', fontWeight: 700 } };
const ESTILO_FINAL = { input: { fontWeight: 700 } };

interface PropsFila {
  r: FilaCapturaProduccion;
  v: Valores;
  onChange: (id: number, campo: CampoValor, valor: string | number) => void;
  onSoltar: (id: number, campo: CampoValor, sugerido: number | null) => void;
  // lo que se está tecleando en cada celda (primitivos: así React.memo puede saltarse las filas que no cambiaron)
  ti: boolean; ci?: string | number;
  te: boolean; ce?: string | number;
  ts: boolean; cs?: string | number;
  tc: boolean; cc?: string | number;
}

/**
 * Una fila de captura. Va en React.memo: al teclear en una celda solo se vuelve a dibujar ESA fila, no las 45
 * (antes cada tecla redibujaba toda la tabla, ~110 ms). Las pistas de cada celda usan `title` nativo: un
 * Tooltip de Mantine por celda eran ~180 componentes con posicionamiento que pesaban al abrir la hoja.
 */
const FilaCaptura = memo(function FilaCaptura({ r, v, onChange, onSoltar, ti, ci, te, ce, ts, cs, tc, cc }: PropsFila) {
  // mientras se escribe se respeta lo tecleado (aunque esté vacío, y "2." no pierde su punto); al salir del campo,
  // si quedó vacío o igual a lo calculado, vuelve a ser automático
  const mostrar = (tocado: boolean, crudo: string | number | undefined, valor: number | null, sugerido: number | null) =>
    tocado ? (crudo ?? valor ?? '') : (valor ?? sugerido ?? '');

  // inicial efectivo: el corregido a mano o el que arrastra; la final igual, en vivo
  const inicial = v.inicial ?? r.inicial_arrastrado;
  const entradas = v.entradas ?? r.entradas_auto;
  const salidas = v.salidas ?? r.salidas_auto; // crudo: el bruto pesado cuenta como salida
  const hayDatos = inicial !== null || entradas !== null || salidas !== null;
  const calculada = hayDatos ? (inicial ?? 0) + (entradas ?? 0) - (salidas ?? 0) : null;
  const final = v.conteo_fisico ?? calculada;
  const ajuste = calculada !== null && v.conteo_fisico !== null ? v.conteo_fisico - calculada : null;
  const colorAjuste = ajuste === null || Math.abs(ajuste) <= 0.005 ? undefined : ajuste > 0 ? 'orange' : 'red';

  const pistaInicial =
    v.inicial !== null
      ? `Corregido a mano (el arrastre era ${fmt(r.inicial_arrastrado) || '—'})`
      : r.inicial_arrastrado !== null
        ? 'Viene del día anterior; edítalo si hubo una falla'
        : 'Sin saldo previo: captura el inicial';
  const pistaEntradas = !r.entradas_es_auto
    ? 'Captúralas a mano'
    : v.entradas !== null
      ? `Corregidas a mano (el porcionador mandó ${fmt(r.entradas_auto)})`
      : 'Vienen de lo que el porcionador mandó a cocina; edítalas si llegó otra cantidad';
  const pistaSalidas = !r.salidas_es_auto
    ? undefined
    : v.salidas !== null
      ? `Corregida a mano (el bruto pesado fue ${fmtKg(r.salidas_auto) || '0'} kg)`
      : 'Usado en limpieza: es el bruto que pesaste. Edítalo si fue otra cantidad';
  const pistaFinal =
    v.conteo_fisico !== null
      ? `Corregida a mano (el sistema calculó ${fmt(calculada)})`
      : 'Se calcula sola; edítala si el conteo real es otro';

  return (
    <Table.Tr>
      <Table.Td>{r.producto}</Table.Td>
      <Table.Td c="dimmed">{r.presentacion}</Table.Td>
      <Table.Td c="dimmed">{r.gramaje}</Table.Td>
      <Table.Td c="dimmed">{r.unidad}</Table.Td>
      <Table.Td p={2}>
        <div title={pistaInicial}>
          <CeldaNumero
            permitirNegativo
            value={mostrar(ti, ci, v.inicial, r.inicial_arrastrado)}
            onChange={(val) => onChange(r.id, 'inicial', val)}
            {...celda(r.id, 'inicial')}
            onBlur={() => onSoltar(r.id, 'inicial', r.inicial_arrastrado)}
            styles={v.inicial !== null ? ESTILO_MANUAL : undefined}
          />
        </div>
      </Table.Td>
      <Table.Td p={2}>
        <div title={pistaEntradas}>
          <CeldaNumero
            value={mostrar(te, ce, v.entradas, r.entradas_auto)}
            onChange={(val) => onChange(r.id, 'entradas', val)}
            {...celda(r.id, 'entradas')}
            onBlur={() => onSoltar(r.id, 'entradas', r.entradas_auto)}
            styles={r.entradas_es_auto && v.entradas !== null ? ESTILO_MANUAL : undefined}
          />
        </div>
      </Table.Td>
      <Table.Td p={2}>
        <div title={pistaSalidas}>
          <CeldaNumero
            value={mostrar(ts, cs, v.salidas, r.salidas_auto)}
            onChange={(val) => onChange(r.id, 'salidas', val)}
            {...celda(r.id, 'salidas')}
            onBlur={() => onSoltar(r.id, 'salidas', r.salidas_auto)}
            styles={r.salidas_es_auto && v.salidas !== null ? ESTILO_MANUAL : undefined}
          />
        </div>
      </Table.Td>
      <Table.Td p={2}>
        <div title={pistaFinal}>
          <CeldaNumero
            permitirNegativo
            value={mostrar(tc, cc, v.conteo_fisico, calculada)}
            onChange={(val) => onChange(r.id, 'conteo_fisico', val)}
            {...celda(r.id, 'conteo_fisico')}
            onBlur={() => onSoltar(r.id, 'conteo_fisico', calculada)}
            styles={v.conteo_fisico !== null ? ESTILO_MANUAL : final !== null && final < -0.005 ? ESTILO_FINAL_NEGATIVA : ESTILO_FINAL}
          />
        </div>
      </Table.Td>
      <Table.Td ta="right" fw={colorAjuste ? 700 : undefined} c={colorAjuste}>
        {ajuste === null || colorAjuste === undefined ? '' : ajuste > 0 ? `+${fmt(ajuste)}` : fmt(ajuste)}
      </Table.Td>
    </Table.Tr>
  );
});

function SeccionFilas({
  seccion,
  filas,
  valores,
  tocados,
  crudos,
  onChange,
  onSoltar,
}: {
  seccion: string;
  filas: FilaCapturaProduccion[];
  valores: Record<number, Valores>;
  tocados: Set<string>;
  crudos: Record<string, string | number>;
  onChange: (id: number, campo: CampoValor, valor: string | number) => void;
  onSoltar: (id: number, campo: CampoValor, sugerido: number | null) => void;
}) {
  return (
    <>
      <Table.Tr bg="var(--mantine-color-gray-light)">
        <Table.Td colSpan={9} fw={700}>
          {seccion}
        </Table.Td>
      </Table.Tr>
      {filas.map((r) => {
        const p = `${r.id}:`;
        return (
          <FilaCaptura
            key={r.id}
            r={r}
            v={valores[r.id]}
            onChange={onChange}
            onSoltar={onSoltar}
            ti={tocados.has(`${p}inicial`)}
            ci={crudos[`${p}inicial`]}
            te={tocados.has(`${p}entradas`)}
            ce={crudos[`${p}entradas`]}
            ts={tocados.has(`${p}salidas`)}
            cs={crudos[`${p}salidas`]}
            tc={tocados.has(`${p}conteo_fisico`)}
            cc={crudos[`${p}conteo_fisico`]}
          />
        );
      })}
    </>
  );
}

function PanelCapturaHoja({
  fecha,
  hoja,
  onCambiosPendientes,
}: {
  fecha: string;
  hoja: HojaReporteProduccion;
  onCambiosPendientes: (pendiente: boolean) => void;
}) {
  const { data, isLoading, isError, isFetchedAfterMount } = useDiaReporteProduccion(fecha, hoja);
  // sube cuando el formulario debe arrancar de cero (p. ej. tras borrar el día)
  const [reinicio, setReinicio] = useState(0);
  const yaMostrado = useRef(false);

  if (isLoading) return <Loader size="sm" />;
  if (isError || !data) return <Alert color="red">No se pudo cargar el reporte del día.</Alert>;
  // al abrir se espera el dato fresco del servidor (no el que quedó en caché): el formulario parte de él
  if (!isFetchedAfterMount && !yaMostrado.current) return <Loader size="sm" />;
  if (data.renglones.length === 0) {
    return (
      <Alert color="yellow" title="Sin renglones">
        El catálogo de esta hoja está vacío. Cárgalo desde la pestaña "Catálogo de renglones".
      </Alert>
    );
  }
  yaMostrado.current = true;
  // El formulario NO se remonta cuando llegan datos nuevos (antes pasaba tras cada guardado y reiniciaba
  // lo que se estaba escribiendo): lo capturado vive en su estado y los valores calculados se actualizan solos.
  return (
    <CapturaHojaForm
      key={`${fecha}-${hoja}-${reinicio}`}
      fecha={fecha}
      hoja={hoja}
      renglones={data.renglones}
      dia={data.dia}
      fechaDiaAnterior={data.fecha_dia_anterior}
      onCambiosPendientes={onCambiosPendientes}
      onReiniciar={() => {
        yaMostrado.current = false;
        setReinicio((n) => n + 1);
      }}
    />
  );
}

// ── Cuadre ─────────────────────────────────────────────────────────────
// Solo lo anómalo: conteo físico distinto del calculado, existencias negativas
// y los renglones de cocina cuyas entradas se capturan a mano.

function PanelCuadre({ fecha }: { fecha: string }) {
  const porcionador = useDiaReporteProduccion(fecha, 'porcionador');
  const cocina = useDiaReporteProduccion(fecha, 'cocina');
  const cruce = useCruceReporteProduccion(fecha);

  const bloque = (titulo: string, query: typeof porcionador) => {
    const filas = query.data?.renglones ?? [];
    const diferencias = filas.filter((r) => r.estado_diferencia === 'sobrante' || r.estado_diferencia === 'faltante');
    const negativos = filas.filter((r) => r.alerta_negativo);
    const sinConteo = filas.filter((r) => r.capturado && r.conteo_fisico === null).length;
    return (
      <Card withBorder>
        <Group justify="space-between" mb="xs">
          <Title order={5}>{titulo}</Title>
          {sinConteo > 0 && (
            <Badge variant="light" color="gray">
              {sinConteo} sin conteo físico
            </Badge>
          )}
        </Group>
        {query.isLoading ? (
          <Loader size="sm" />
        ) : diferencias.length === 0 && negativos.length === 0 ? (
          <Text size="sm" c="dimmed">
            Sin diferencias de conteo ni existencias negativas.
          </Text>
        ) : (
          <Stack gap="sm">
            {diferencias.length > 0 && (
              <Table fz="sm" verticalSpacing={4}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Producto</Table.Th>
                    <Table.Th>Presentación</Table.Th>
                    <Table.Th ta="right">Calculado</Table.Th>
                    <Table.Th ta="right">Conteo físico</Table.Th>
                    <Table.Th ta="right">Diferencia</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {diferencias.map((r) => (
                    <Table.Tr key={r.id}>
                      <Table.Td>{r.producto}</Table.Td>
                      <Table.Td c="dimmed">{r.presentacion}</Table.Td>
                      <Table.Td ta="right">{fmt(r.final_calculado)}</Table.Td>
                      <Table.Td ta="right">{fmt(r.conteo_fisico)}</Table.Td>
                      <Table.Td ta="right" fw={700} c={COLOR_DIFERENCIA[r.estado_diferencia]}>
                        {(r.diferencia ?? 0) > 0 ? '+' : ''}
                        {fmt(r.diferencia)}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
            {negativos.length > 0 && (
              <Alert color="red" variant="light" title="Existencia calculada negativa (salió más de lo que había)">
                {negativos.map((r) => `${r.producto}${r.presentacion ? ` (${r.presentacion})` : ''}: ${fmt(r.final_calculado)}`).join(' · ')}
              </Alert>
            )}
          </Stack>
        )}
      </Card>
    );
  };

  const cocinaManual = (cruce.data?.sin_contraparte ?? []).filter((s) => s.hoja === 'cocina');

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        La existencia final se calcula sola (inicial + entradas − salidas). Aquí solo aparece lo que merece revisión.
      </Text>
      {bloque('Porcionador', porcionador)}
      {bloque('Cocina', cocina)}
      {cocinaManual.length > 0 && (
        <Text size="xs" c="dimmed">
          Productos de cocina sin equivalente en porcionador (sus entradas se capturan a mano):{' '}
          {cocinaManual.map((s) => `${s.producto}${s.presentacion ? ` (${s.presentacion})` : ''}`).join(' · ')}
        </Text>
      )}
    </Stack>
  );
}

// ── Inventario en kg bruto y en pesos (hoja PORCIONADOR del libro de inventario) ────────────────────
// kg limpio = cantidad × gramaje · factor = bruto/limpio de la prueba · kg bruto = kg limpio × factor ·
// valor = kg bruto × precio por kg. Lo que falta (gramaje, factor, precio) se avisa y no suma.

const fmtKg = (n: number | null | undefined) =>
  n === null || n === undefined ? '' : n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
const fmtPesos = (n: number | null | undefined) =>
  n === null || n === undefined ? '' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

function PrecioKgInput({ producto, precio }: { producto: string; precio: number | null }) {
  const guardarPrecio = useGuardarPrecioProductoBase();
  const [valor, setValor] = useState<number | string>(precio ?? '');
  const guardar = () => {
    const nuevo = valor === '' ? null : Number(valor);
    if (nuevo === precio || (nuevo !== null && Number.isNaN(nuevo))) return;
    guardarPrecio.mutate(
      { producto, precio_kg: nuevo },
      { onError: (error) => notifications.show({ color: 'red', message: detalleErrorApi(error, 'No se pudo guardar el precio.') }) },
    );
  };
  return (
    <NumberInput
      size="xs"
      w={100}
      hideControls
      min={0}
      decimalScale={2}
      prefix="$"
      placeholder="$ / kg"
      value={valor}
      onChange={setValor}
      onBlur={guardar}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

// ── Inventario y limpieza: lo que produjo el porcionador, una tarjeta por producto ────────────────
// Solo se calcula con "Entradas y producción" del día. Cada tarjeta se lee de izquierda a derecha:
// Pesaste → Merma → Limpio → Factor, luego las porciones de hoy y su valor en bruto.

const fmtFechaCorta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const COLOR_CONTROL: Record<EstadoControlLimpieza, string> = {
  sin_pesaje: 'gray',
  cuadra: 'green',
  faltan_porciones: 'orange',
  exceden_limpio: 'red',
};

const ETIQUETA_CONTROL: Record<EstadoControlLimpieza, string> = {
  sin_pesaje: 'Sin pesar',
  cuadra: 'Cuadra',
  faltan_porciones: 'Faltan porciones',
  exceden_limpio: 'Porciones de más',
};

/** Explica el resultado del control con palabras, no con signos. */
function mensajeControl(c: ControlLimpieza, p?: ProductoInventarioBruto): string | null {
  if (c.estado === 'sin_pesaje') {
    if (c.kg_porciones <= 0) return null;
    // días en que solo se porciona (p. ej. dedos con pollo limpio que sobró) no hay pesaje y está bien: se usa el último factor
    return p?.factor_origen === 'pesaje' && p.factor_fecha
      ? `Hoy no hubo pesaje: se usa el factor del pesaje del ${fmtFechaCorta(p.factor_fecha)}. Si hoy limpiaste, captura lo que pesaste.`
      : 'Hoy no hubo pesaje: se usa el factor de la prueba del catálogo. Cuando limpies, captura lo que pesaste para tener el factor real.';
  }
  if (c.kg_porciones === 0) return "Aún no hay 'Entradas y producción' de este producto hoy para comparar con el limpio.";
  const dif = fmtKg(Math.abs(c.diferencia_kg ?? 0));
  if (c.estado === 'cuadra') return `Las porciones (${fmtKg(c.kg_porciones)} kg) cuadran con el limpio pesado (${fmtKg(c.limpio_kg)} kg).`;
  if (c.estado === 'faltan_porciones') {
    return `Pesaste ${fmtKg(c.limpio_kg)} kg limpios pero las porciones suman ${fmtKg(c.kg_porciones)} kg: faltan ${dif} kg por porcionar.`;
  }
  return `Las porciones suman ${fmtKg(c.kg_porciones)} kg y solo pesaste ${fmtKg(c.limpio_kg)} kg limpios: hay ${dif} kg de más. Revisa el pesaje o las entradas.`;
}

function PesajeFila({ pesaje }: { pesaje: PesajeLimpieza }) {
  const editar = useEditarPesaje();
  const borrar = useBorrarPesaje();
  const [bruto, setBruto] = useState<number | string>(pesaje.bruto_kg);
  const [limpio, setLimpio] = useState<number | string>(pesaje.limpio_kg);

  const b = bruto === '' ? NaN : Number(bruto);
  const l = limpio === '' ? NaN : Number(limpio);
  const valido = b > 0 && l > 0 && l <= b;

  const guardar = () => {
    if (b === pesaje.bruto_kg && l === pesaje.limpio_kg) return;
    if (!valido) {
      notifications.show({ color: 'red', message: 'El bruto y el limpio deben ser mayores a 0, y el limpio no puede pasar del bruto.' });
      setBruto(pesaje.bruto_kg);
      setLimpio(pesaje.limpio_kg);
      return;
    }
    editar.mutate(
      { id: pesaje.id, bruto_kg: b, limpio_kg: l },
      { onError: (error) => notifications.show({ color: 'red', message: detalleErrorApi(error, 'No se pudo guardar el pesaje.') }) },
    );
  };

  return (
    <Table.Tr>
      <Table.Td p={2}>
        <NumberInput size="xs" hideControls min={0} decimalScale={3} value={bruto} onChange={setBruto} onBlur={guardar} suffix=" kg" />
      </Table.Td>
      <Table.Td p={2}>
        <NumberInput size="xs" hideControls min={0} decimalScale={3} value={limpio} onChange={setLimpio} onBlur={guardar} suffix=" kg" />
      </Table.Td>
      <Table.Td ta="right">{valido ? `${fmtKg(Math.round((b - l) * 1000) / 1000)} kg` : ''}</Table.Td>
      <Table.Td ta="right">{valido ? (b / l).toFixed(3) : ''}</Table.Td>
      <Table.Td w={40}>
        <Tooltip label="Quitar este pesaje">
          <ActionIcon variant="subtle" color="red" loading={borrar.isPending} onClick={() => borrar.mutate(pesaje.id)}>
            <IconTrash size={16} />
          </ActionIcon>
        </Tooltip>
      </Table.Td>
    </Table.Tr>
  );
}

function NuevoPesaje({ fecha, producto, otro }: { fecha: string; producto: string; otro: boolean }) {
  const crear = useCrearPesaje();
  const [bruto, setBruto] = useState<number | string>('');
  const [limpio, setLimpio] = useState<number | string>('');
  const b = bruto === '' ? NaN : Number(bruto);
  const l = limpio === '' ? NaN : Number(limpio);

  const agregar = () => {
    if (!(b > 0 && l > 0 && l <= b)) {
      notifications.show({ color: 'red', message: 'Captura lo que pesaste en bruto y lo que quedó limpio (el limpio no puede pasar del bruto).' });
      return;
    }
    crear.mutate(
      { fecha, producto, bruto_kg: b, limpio_kg: l },
      {
        onSuccess: () => {
          setBruto('');
          setLimpio('');
        },
        onError: (error) => notifications.show({ color: 'red', message: detalleErrorApi(error, 'No se pudo guardar el pesaje.') }),
      },
    );
  };

  return (
    <Group gap="xs" align="flex-end">
      <NumberInput
        size="sm"
        w={150}
        label={otro ? 'Otro pesaje: bruto' : 'Pesaste en bruto'}
        hideControls
        min={0}
        decimalScale={3}
        suffix=" kg"
        value={bruto}
        onChange={setBruto}
      />
      <NumberInput
        size="sm"
        w={150}
        label="Quedó limpio"
        hideControls
        min={0}
        decimalScale={3}
        suffix=" kg"
        value={limpio}
        onChange={setLimpio}
        onKeyDown={(e) => e.key === 'Enter' && agregar()}
      />
      <Button size="sm" variant="light" leftSection={<IconPlus size={14} />} loading={crear.isPending} onClick={agregar}>
        {otro ? 'Agregar' : 'Guardar pesaje'}
      </Button>
    </Group>
  );
}

/** Un paso del flujo: título chico, valor grande. */
function Paso({ titulo, valor, color }: { titulo: string; valor: string; color?: string }) {
  return (
    <Paper withBorder radius="md" px="md" py="xs" miw={120}>
      <Text size="xs" c="dimmed">
        {titulo}
      </Text>
      <Text fw={700} size="lg" c={color}>
        {valor}
      </Text>
    </Paper>
  );
}

function TarjetaProducto({ fecha, producto, limpieza }: { fecha: string; producto: ProductoInventarioBruto; limpieza?: ProductoLimpieza }) {
  const [editando, setEditando] = useState(false);
  const c = limpieza?.control;
  const pesajes = limpieza?.pesajes ?? [];
  const mensaje = c ? mensajeControl(c, producto) : null;
  const porciones = producto.filas.filter((f) => (f.cantidad ?? 0) !== 0);
  const hayProduccion = porciones.length > 0;
  const origenFactor =
    producto.factor_origen === 'pesaje' && producto.factor_fecha
      ? pesajes.length > 0
        ? null
        : `Se usa el factor del pesaje del ${fmtFechaCorta(producto.factor_fecha)} (hoy no hay pesaje)`
      : producto.factor_origen === 'catalogo'
        ? 'Aún no hay pesaje: se usa el factor de la prueba del catálogo'
        : hayProduccion
          ? 'Sin factor: captura el pesaje para calcular el bruto'
          : null;

  return (
    <Card withBorder radius="md" p="lg" style={{ borderLeft: '4px solid var(--mantine-color-red-6)' }}>
      <Group justify="space-between" align="flex-start" mb="md">
        <div>
          <Title order={4}>{producto.producto}</Title>
          {c && (
            <Badge variant="light" size="sm" mt={4} color={COLOR_CONTROL[c.estado]}>
              {ETIQUETA_CONTROL[c.estado]}
            </Badge>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <Text size="xs" c="dimmed">
            Valor producido
          </Text>
          <Text fw={700} size="xl" c={producto.valor === null && hayProduccion ? 'orange' : 'teal'}>
            {producto.valor === null ? (hayProduccion ? 'Falta precio' : '—') : fmtPesos(producto.valor)}
          </Text>
        </div>
      </Group>

      {/* Pesaje: Pesaste → Merma → Limpio → Factor */}
      {pesajes.length === 0 ? (
        <Stack gap={4}>
          <Text size="sm" c="dimmed">
            Pesaje de hoy
          </Text>
          <NuevoPesaje fecha={fecha} producto={producto.producto} otro={false} />
        </Stack>
      ) : (
        <>
          <Group gap="xs" align="center" wrap="wrap">
            <Paso titulo="Pesaste" valor={`${fmtKg(c?.bruto_kg)} kg`} />
            <IconArrowRight size={18} color="var(--mantine-color-dimmed)" />
            <Paso titulo="Merma" valor={`${fmtKg(c?.merma_kg)} kg`} color="orange" />
            <IconArrowRight size={18} color="var(--mantine-color-dimmed)" />
            <Paso titulo="Quedó limpio" valor={`${fmtKg(c?.limpio_kg)} kg`} />
            <IconArrowRight size={18} color="var(--mantine-color-dimmed)" />
            <Paso titulo="Factor" valor={c?.factor ? c.factor.toFixed(3) : '—'} color="blue" />
            <Anchor size="xs" ml="xs" onClick={() => setEditando((v) => !v)}>
              {editando ? 'Cerrar' : 'Editar pesaje'}
            </Anchor>
          </Group>
          {editando && (
            <Stack gap="xs" mt="sm">
              <Table fz="sm" verticalSpacing={2}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Pesaste en bruto</Table.Th>
                    <Table.Th>Quedó limpio</Table.Th>
                    <Table.Th ta="right">Merma</Table.Th>
                    <Table.Th ta="right">Factor</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {pesajes.map((ps) => (
                    <PesajeFila key={`${ps.id}-${ps.bruto_kg}-${ps.limpio_kg}`} pesaje={ps} />
                  ))}
                </Table.Tbody>
              </Table>
              <NuevoPesaje fecha={fecha} producto={producto.producto} otro />
            </Stack>
          )}
        </>
      )}
      {origenFactor && (
        <Text size="xs" c="dimmed" mt={6}>
          {origenFactor}
        </Text>
      )}

      {/* Porciones producidas hoy */}
      <Text size="sm" fw={600} mt="lg" mb={4}>
        Porciones de hoy
      </Text>
      {!hayProduccion ? (
        <Text size="sm" c="dimmed">
          Todavía no hay 'Entradas y producción' de este producto hoy.
        </Text>
      ) : (
        <Stack gap={2}>
          {porciones.map((f) => (
            <Group key={f.renglon_id} justify="space-between" wrap="nowrap">
              <Text size="sm">
                {f.presentacion ?? producto.producto}{' '}
                <Text span size="xs" c="dimmed">
                  {f.limpio_intermedio
                    ? `pollo limpio que sobra (${(f.cantidad ?? 0) > 0 ? 'sobró' : 'se usó'} · neto del día)`
                    : `${fmtKg(f.cantidad)} × ${f.gramaje_kg === null ? '—' : `${fmtKg(f.gramaje_kg)} kg`}`}
                </Text>
              </Text>
              {f.falta === 'sin gramaje' ? (
                <Tooltip label="Falta el gramaje en el catálogo: no se puede calcular" withArrow>
                  <Text size="sm" c="orange">
                    Falta gramaje
                  </Text>
                </Tooltip>
              ) : (
                <Text size="sm">{f.kg_limpio === null ? '' : `${fmtKg(f.kg_limpio)} kg`}</Text>
              )}
            </Group>
          ))}
          {c && c.kg_porciones > 0 && (
            <Group justify="space-between" mt={4}>
              <Text size="sm" fw={600}>
                Total de porciones
              </Text>
              <Text size="sm" fw={600}>
                {fmtKg(c.kg_porciones)} kg
              </Text>
            </Group>
          )}
        </Stack>
      )}
      {mensaje && (
        <Text size="sm" mt="xs" c={c && c.estado !== 'cuadra' ? COLOR_CONTROL[c.estado] : 'dimmed'}>
          {mensaje}
        </Text>
      )}

      {/* En bruto y valor */}
      {hayProduccion && (
        <Group mt="md" gap="sm" align="center" wrap="wrap">
          <Text size="sm">
            En bruto <b>{fmtKg(producto.kg_bruto_total)} kg</b> ×
          </Text>
          <PrecioKgInput key={`${producto.producto}-${producto.precio_kg}`} producto={producto.producto} precio={producto.precio_kg} />
          <Text size="sm">
            por kg = <b>{producto.valor === null ? '—' : fmtPesos(producto.valor)}</b>
          </Text>
        </Group>
      )}
    </Card>
  );
}

function VistaProduccion({ fecha }: { fecha: string }) {
  const [verAvisos, setVerAvisos] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [agregados, setAgregados] = useState<string[]>([]);
  // solo lo que hizo el porcionador: "Entradas y producción" del día
  const { data, isLoading, isError } = useInventarioBruto(fecha, 'porcionador', 'produccion');
  const { data: limpiezas } = usePesajesDia(fecha);

  const exportar = async () => {
    setExportando(true);
    try {
      const blob = await exportInventarioBruto(fecha, 'porcionador', 'produccion');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `produccion_bruto_porcionador_${fecha}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportando(false);
    }
  };

  const limpiezaDe = (producto: string) => limpiezas?.productos.find((p) => p.producto === producto);
  const productos = data?.productos ?? [];
  const esVisible = (p: ProductoInventarioBruto) =>
    p.filas.some((f) => (f.cantidad ?? 0) > 0) || (limpiezaDe(p.producto)?.pesajes.length ?? 0) > 0 || agregados.includes(p.producto);
  const visibles = productos.filter(esVisible);
  // productos que se limpian (tienen presentaciones procesadas) y hoy no tienen nada: se pueden agregar para pesarlos
  const agregables = (limpiezas?.productos ?? []).map((p) => p.producto).filter((n) => !visibles.some((v) => v.producto === n));

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <Text size="sm" c="dimmed" maw={640}>
          Lo que produjo el porcionador hoy (<b>Entradas y producción</b>). Pesa el producto al limpiarlo: con la merma sale el <b>factor</b>, que lleva las porciones a kg
          bruto y a pesos.
        </Text>
        <Button size="xs" variant="default" leftSection={<IconDownload size={14} />} loading={exportando} onClick={exportar}>
          Exportar Excel
        </Button>
      </Group>

      {isLoading ? (
        <Loader size="sm" />
      ) : isError || !data ? (
        <Alert color="red">No se pudo calcular la producción.</Alert>
      ) : (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Card withBorder>
              <Text size="xs" c="dimmed">
                Producido hoy en bruto
              </Text>
              <Title order={2}>{fmtKg(data.total_kg_bruto)} kg</Title>
            </Card>
            <Card withBorder>
              <Text size="xs" c="dimmed">
                Valor de lo producido
              </Text>
              <Title order={2} c="teal">
                {fmtPesos(data.total_valor)}
              </Title>
            </Card>
          </SimpleGrid>

          {data.advertencias.length > 0 && (
            <div>
              <Badge variant="light" color="yellow" style={{ cursor: 'pointer' }} onClick={() => setVerAvisos((v) => !v)}>
                {data.advertencias.length} dato(s) por completar {verAvisos ? '▲' : '▼'}
              </Badge>
              {verAvisos && (
                <Stack gap={2} mt="xs">
                  {data.advertencias.map((a) => (
                    <Text key={a} size="xs" c="dimmed">
                      • {a}
                    </Text>
                  ))}
                </Stack>
              )}
            </div>
          )}

          {visibles.length === 0 ? (
            <Alert color="gray" variant="light">
              Hoy no hay 'Entradas y producción' del porcionador. Cuando las captures aparecerán aquí; también puedes agregar un producto abajo para pesarlo antes.
            </Alert>
          ) : (
            visibles.map((p) => <TarjetaProducto key={p.producto} fecha={fecha} producto={p} limpieza={limpiezaDe(p.producto)} />)
          )}

          {agregables.length > 0 && (
            <Select
              w={360}
              searchable
              placeholder="Agregar un producto para pesarlo…"
              data={agregables}
              value={null}
              onChange={(v) => v && setAgregados((prev) => [...prev, v])}
            />
          )}
        </>
      )}
    </Stack>
  );
}

// ── Existencia total por grupo ─────────────────────────────────────────────────────────────────────
// Todo lo que hay (existencia final del día) llevado a kg bruto y pesos, agrupado como la hoja:
// Camarón, Pescado, Res… Usa el mismo factor que "Producido hoy" (el del último pesaje de cada producto).

function ProductoExistencia({ fecha, producto }: { fecha: string; producto: ProductoInventarioBruto }) {
  const [abierto, setAbierto] = useState(false);
  const filas = producto.filas.filter((f) => (f.cantidad ?? 0) > 0 || f.falta);
  // sin factor no se puede pasar a bruto: se resuelve pesando el producto, y se puede hacer aquí mismo
  const sinFactor = producto.filas.some((f) => f.falta === 'sin factor de rendimiento');
  const origenFactor =
    producto.factor_origen === 'pesaje' && producto.factor_fecha
      ? `Factor del pesaje del ${fmtFechaCorta(producto.factor_fecha)}`
      : producto.factor_origen === 'catalogo'
        ? 'Factor de la prueba del catálogo (aún sin pesaje)'
        : 'Sin factor de rendimiento';

  return (
    <>
      <Table.Tr>
        <Table.Td fw={600}>
          {producto.producto}
          {sinFactor && (
            <Tooltip label="Falta el factor de rendimiento: captura un pesaje de este producto" withArrow>
              <Badge ml="xs" size="sm" color="orange" variant="light" style={{ cursor: 'pointer' }} onClick={() => setAbierto(true)}>
                Falta factor · pesar
              </Badge>
            </Tooltip>
          )}
        </Table.Td>
        <Table.Td ta="right">{fmtKg(producto.kg_bruto_total)} kg</Table.Td>
        <Table.Td p={2}>
          <PrecioKgInput key={`${producto.producto}-${producto.precio_kg}`} producto={producto.producto} precio={producto.precio_kg} />
        </Table.Td>
        <Table.Td ta="right" fw={700} c={producto.valor === null ? 'orange' : 'teal'}>
          {producto.valor === null ? 'Falta precio' : fmtPesos(producto.valor)}
        </Table.Td>
        <Table.Td w={36}>
          <Tooltip label={abierto ? 'Ocultar presentaciones' : 'Ver presentaciones'}>
            <ActionIcon variant="subtle" color="gray" onClick={() => setAbierto((v) => !v)}>
              {abierto ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
            </ActionIcon>
          </Tooltip>
        </Table.Td>
      </Table.Tr>
      {abierto && (
        <Table.Tr bg="var(--mantine-color-gray-light)">
          <Table.Td colSpan={5}>
            <Stack gap={4} p="xs">
              <Text size="xs" c="dimmed">
                {origenFactor}
              </Text>
              {sinFactor && (
                <Stack gap={4}>
                  <Text size="sm" c="orange">
                    Para pasar este producto a bruto falta su factor. Pésalo al limpiarlo (lo que pesaste en bruto y lo que quedó limpio); el factor
                    queda guardado desde el {fmtFechaCorta(fecha)} y se usa de ahí en adelante.
                  </Text>
                  <NuevoPesaje fecha={fecha} producto={producto.producto} otro={false} />
                </Stack>
              )}
              <Table fz="sm" verticalSpacing={2}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Presentación</Table.Th>
                    <Table.Th ta="right">Existencia</Table.Th>
                    <Table.Th ta="right">Gramaje</Table.Th>
                    <Table.Th ta="right">Kg limpio</Table.Th>
                    <Table.Th ta="right">Factor</Table.Th>
                    <Table.Th ta="right">Kg bruto</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filas.map((f) => (
                    <Table.Tr key={f.renglon_id}>
                      <Table.Td>{f.presentacion ?? '(sin presentación)'}</Table.Td>
                      <Table.Td ta="right">{fmtKg(f.cantidad)}</Table.Td>
                      <Table.Td ta="right">{f.gramaje_kg === null ? '' : `${fmtKg(f.gramaje_kg)} kg`}</Table.Td>
                      <Table.Td ta="right">{f.kg_limpio === null ? '' : `${fmtKg(f.kg_limpio)} kg`}</Table.Td>
                      <Table.Td ta="right">{f.factor === null ? '' : f.factor.toFixed(3)}</Table.Td>
                      <Table.Td ta="right" fw={600} c={f.falta ? 'orange' : undefined}>
                        {f.falta ? (
                          <Tooltip label={`No se pudo calcular: ${f.falta}. Complétalo en el catálogo.`} withArrow>
                            <span>Falta dato</span>
                          </Tooltip>
                        ) : (
                          `${fmtKg(f.kg_bruto)} kg`
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Stack>
          </Table.Td>
        </Table.Tr>
      )}
    </>
  );
}

function VistaExistencia({ fecha }: { fecha: string }) {
  const [verAvisos, setVerAvisos] = useState(false);
  const [exportando, setExportando] = useState(false);
  const { data, isLoading, isError } = useInventarioBruto(fecha, 'porcionador', 'existencia');

  const exportar = async () => {
    setExportando(true);
    try {
      const blob = await exportInventarioBruto(fecha, 'porcionador', 'existencia');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventario_bruto_porcionador_${fecha}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportando(false);
    }
  };

  // de cada grupo solo se muestran los productos que tienen existencia
  const conExistencia = (p: ProductoInventarioBruto) => p.kg_bruto_total > 0 || p.filas.some((f) => (f.cantidad ?? 0) > 0);
  const grupos = (data?.grupos ?? []).map((g) => ({ ...g, productos: g.productos.filter(conExistencia) })).filter((g) => g.productos.length > 0);
  const ocultos = (data?.productos ?? []).filter((p) => !conExistencia(p)).length;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <Text size="sm" c="dimmed" maw={640}>
          Todo lo que hay al cierre del {fecha}, por grupo, llevado a kg bruto con el mismo factor y a pesos con el precio por kg.
        </Text>
        <Button size="xs" variant="default" leftSection={<IconDownload size={14} />} loading={exportando} onClick={exportar}>
          Exportar Excel
        </Button>
      </Group>

      {isLoading ? (
        <Loader size="sm" />
      ) : isError || !data ? (
        <Alert color="red">No se pudo calcular la existencia.</Alert>
      ) : (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Card withBorder>
              <Text size="xs" c="dimmed">
                Inventario total en bruto
              </Text>
              <Title order={2}>{fmtKg(data.total_kg_bruto)} kg</Title>
            </Card>
            <Card withBorder>
              <Text size="xs" c="dimmed">
                Valor del inventario
              </Text>
              <Title order={2} c="teal">
                {fmtPesos(data.total_valor)}
              </Title>
            </Card>
          </SimpleGrid>

          {data.advertencias.length > 0 && (
            <div>
              <Badge variant="light" color="yellow" style={{ cursor: 'pointer' }} onClick={() => setVerAvisos((v) => !v)}>
                {data.advertencias.length} dato(s) por completar {verAvisos ? '▲' : '▼'}
              </Badge>
              {verAvisos && (
                <Stack gap={2} mt="xs">
                  {data.advertencias.map((a) => (
                    <Text key={a} size="xs" c="dimmed">
                      • {a}
                    </Text>
                  ))}
                </Stack>
              )}
            </div>
          )}

          {grupos.length === 0 && (
            <Alert color="gray" variant="light">
              No hay existencia capturada en este día.
            </Alert>
          )}

          {grupos.map((g) => (
            <Card key={g.seccion} withBorder radius="md" p="md" style={{ borderLeft: '4px solid var(--mantine-color-red-6)' }}>
              <Group justify="space-between" align="flex-end" mb="xs">
                <Title order={4}>{g.seccion}</Title>
                <Group gap="xl" align="flex-end">
                  <div style={{ textAlign: 'right' }}>
                    <Text size="xs" c="dimmed">
                      En bruto
                    </Text>
                    <Text fw={700}>{fmtKg(g.kg_bruto_total)} kg</Text>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <Text size="xs" c="dimmed">
                      Valor
                    </Text>
                    <Text fw={700} c="teal">
                      {fmtPesos(g.valor)}
                    </Text>
                  </div>
                  {g.sin_precio && (
                    <Badge variant="light" color="orange" size="sm">
                      Falta algún precio
                    </Badge>
                  )}
                </Group>
              </Group>
              <Table fz="sm" verticalSpacing={4}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Producto</Table.Th>
                    <Table.Th ta="right">Existencia (bruto)</Table.Th>
                    <Table.Th w={110}>$ por kg</Table.Th>
                    <Table.Th ta="right">Valor</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {g.productos.map((p) => (
                    <ProductoExistencia key={p.producto} fecha={fecha} producto={p} />
                  ))}
                </Table.Tbody>
              </Table>
            </Card>
          ))}
          {ocultos > 0 && (
            <Text size="xs" c="dimmed" ta="center">
              {ocultos} producto(s) sin existencia están ocultos.
            </Text>
          )}
        </>
      )}
    </Stack>
  );
}

/** Pestaña "Inventario y limpieza": lo producido hoy (con pesaje) o la existencia total por grupo. */
function PanelInventarioBruto({ fecha }: { fecha: string }) {
  const [vista, setVista] = useState<'produccion' | 'existencia'>('produccion');
  return (
    <Stack gap="md">
      <SegmentedControl
        value={vista}
        onChange={(v) => setVista(v as 'produccion' | 'existencia')}
        data={[
          { value: 'produccion', label: 'Producido hoy' },
          { value: 'existencia', label: 'Existencia total' },
        ]}
      />
      {vista === 'produccion' ? <VistaProduccion fecha={fecha} /> : <VistaExistencia fecha={fecha} />}
    </Stack>
  );
}

// ── Catálogo de renglones ──────────────────────────────────────────────

interface FormRenglon {
  hoja: HojaReporteProduccion;
  seccion: string;
  producto: string;
  presentacion: string;
  gramaje: string;
  unidad: string;
  gramaje_kg: number | string; // kg limpio por unidad (para pasar a kg bruto)
  prueba_bruto_kg: number | string;
  prueba_limpio_kg: number | string;
  es_crudo: 'auto' | 'si' | 'no'; // automático = la única presentación en KG del producto
  es_limpio: boolean; // sobrante ya limpio (filetitos): kg limpios que entran y salen
}

const FORM_VACIO: FormRenglon = {
  hoja: 'porcionador',
  seccion: '',
  producto: '',
  presentacion: '',
  gramaje: '',
  unidad: 'PORCION',
  gramaje_kg: '',
  prueba_bruto_kg: '',
  prueba_limpio_kg: '',
  es_crudo: 'auto',
  es_limpio: false,
};

const crudoAEstado = (v: boolean | null): 'auto' | 'si' | 'no' => (v === null ? 'auto' : v ? 'si' : 'no');
const estadoACrudo = (v: 'auto' | 'si' | 'no'): boolean | null => (v === 'auto' ? null : v === 'si');

const aNumeroONull = (v: number | string) => (v === '' || Number.isNaN(Number(v)) ? null : Number(v));

function PanelCatalogoRenglones() {
  const { data, isLoading } = useCatalogoReporteProduccion(undefined, true);
  const sembrar = useSembrarCatalogoReporteProduccion();
  const crear = useCrearRenglonProduccion();
  const editar = useEditarRenglonProduccion();
  const desactivar = useDesactivarRenglonProduccion();

  const [hojaVista, setHojaVista] = useState<HojaReporteProduccion>('porcionador');
  const [form, setForm] = useState<FormRenglon>(FORM_VACIO);
  const [editando, setEditando] = useState<RenglonProduccion | null>(null);

  const filas = (data ?? []).filter((r) => r.hoja === hojaVista);
  const seccionesExistentes = [...new Set(filas.map((r) => r.seccion))];

  const abrirNuevo = () => {
    setEditando(null);
    setForm({ ...FORM_VACIO, hoja: hojaVista, seccion: seccionesExistentes[0] ?? '' });
    setAbierto(true);
  };
  const [abierto, setAbierto] = useState(false);

  const abrirEditar = (r: RenglonProduccion) => {
    setEditando(r);
    setForm({
      hoja: r.hoja,
      seccion: r.seccion,
      producto: r.producto,
      presentacion: r.presentacion ?? '',
      gramaje: r.gramaje ?? '',
      unidad: r.unidad,
      gramaje_kg: r.gramaje_kg ?? '',
      prueba_bruto_kg: r.prueba_bruto_kg ?? '',
      prueba_limpio_kg: r.prueba_limpio_kg ?? '',
      es_crudo: crudoAEstado(r.es_crudo),
      es_limpio: r.es_limpio === true,
    });
    setAbierto(true);
  };

  const guardar = async () => {
    if (!form.seccion.trim() || !form.producto.trim()) {
      notifications.show({ color: 'red', message: 'Sección y producto son obligatorios.' });
      return;
    }
    try {
      if (editando) {
        await editar.mutateAsync({
          id: editando.id,
          seccion: form.seccion,
          producto: form.producto,
          presentacion: form.presentacion || null,
          gramaje: form.gramaje || null,
          unidad: form.unidad,
          gramaje_kg: aNumeroONull(form.gramaje_kg),
          prueba_bruto_kg: aNumeroONull(form.prueba_bruto_kg),
          prueba_limpio_kg: aNumeroONull(form.prueba_limpio_kg),
          es_crudo: estadoACrudo(form.es_crudo),
          es_limpio: form.es_limpio ? true : null,
        });
      } else {
        await crear.mutateAsync({
          ...form,
          presentacion: form.presentacion || null,
          gramaje: form.gramaje || null,
          gramaje_kg: aNumeroONull(form.gramaje_kg),
          prueba_bruto_kg: aNumeroONull(form.prueba_bruto_kg),
          prueba_limpio_kg: aNumeroONull(form.prueba_limpio_kg),
          es_crudo: estadoACrudo(form.es_crudo),
          es_limpio: form.es_limpio ? true : null,
        });
      }
      setAbierto(false);
    } catch (error) {
      notifications.show({ color: 'red', message: detalleErrorApi(error, 'No se pudo guardar el renglón.'), autoClose: false });
    }
  };

  const sembrarCatalogo = async () => {
    const res = await sembrar.mutateAsync();
    const partes = [
      res.creados > 0 ? `${res.creados} renglones del formato original` : null,
      res.rendimientos > 0 ? `rendimientos de ${res.rendimientos} renglones` : null,
      res.precios > 0 ? `${res.precios} precios por kg` : null,
    ].filter(Boolean);
    notifications.show({
      color: partes.length > 0 ? 'green' : 'gray',
      message: partes.length > 0 ? `Se cargaron: ${partes.join(', ')}.` : 'No había nada por cargar: todo ya estaba en el catálogo.',
    });
  };

  if (isLoading) return <Loader size="sm" />;

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Select
          w={220}
          allowDeselect={false}
          data={[
            { value: 'porcionador', label: 'Hoja Porcionador' },
            { value: 'cocina', label: 'Hoja Cocina' },
          ]}
          value={hojaVista}
          onChange={(v) => v && setHojaVista(v as HojaReporteProduccion)}
        />
        <Group gap="xs">
          <Button size="xs" variant="default" leftSection={<IconRefresh size={14} />} loading={sembrar.isPending} onClick={sembrarCatalogo}>
            Cargar formato, rendimientos y precios
          </Button>
          <Button size="xs" leftSection={<IconPlus size={14} />} onClick={abrirNuevo}>
            Nuevo renglón
          </Button>
        </Group>
      </Group>

      <Table withTableBorder fz="sm" verticalSpacing={4}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Sección</Table.Th>
            <Table.Th>Producto</Table.Th>
            <Table.Th>Presentación</Table.Th>
            <Table.Th>Gramaje</Table.Th>
            <Table.Th>Unidad</Table.Th>
            <Table.Th ta="right">Gramaje (kg)</Table.Th>
            <Table.Th ta="right">Factor</Table.Th>
            <Table.Th w={90} />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {filas.map((r) => (
            <Table.Tr key={r.id} opacity={r.activo ? 1 : 0.5}>
              <Table.Td>{r.seccion}</Table.Td>
              <Table.Td>{r.producto}</Table.Td>
              <Table.Td c="dimmed">{r.presentacion}</Table.Td>
              <Table.Td c="dimmed">{r.gramaje}</Table.Td>
              <Table.Td c="dimmed">{r.unidad}</Table.Td>
              <Table.Td ta="right" c="dimmed">
                {r.gramaje_kg !== null ? (
                  fmtKg(r.gramaje_kg)
                ) : r.gramaje_kg_efectivo !== null ? (
                  <Tooltip label={`Tomado del texto "${r.gramaje}"`} withArrow>
                    <Text span fs="italic">
                      {fmtKg(r.gramaje_kg_efectivo)}
                    </Text>
                  </Tooltip>
                ) : null}
              </Table.Td>
              <Table.Td ta="right" c="dimmed">
                {r.prueba_bruto_kg && r.prueba_limpio_kg ? (r.prueba_bruto_kg / r.prueba_limpio_kg).toFixed(3) : ''}
              </Table.Td>
              <Table.Td>
                <Group gap={4} wrap="nowrap">
                  <Tooltip label="Editar">
                    <ActionIcon variant="subtle" onClick={() => abrirEditar(r)}>
                      <IconEdit size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label={r.activo ? 'Desactivar (conserva el historial)' : 'Reactivar'}>
                    <ActionIcon
                      variant="subtle"
                      color={r.activo ? 'gray' : 'green'}
                      onClick={() => (r.activo ? desactivar.mutate(r.id) : editar.mutate({ id: r.id, activo: true }))}
                    >
                      {r.activo ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <Modal opened={abierto} onClose={() => setAbierto(false)} title={editando ? 'Editar renglón' : 'Nuevo renglón'}>
        <Stack gap="sm">
          {!editando && (
            <Select
              label="Hoja"
              allowDeselect={false}
              data={[
                { value: 'porcionador', label: 'Porcionador' },
                { value: 'cocina', label: 'Cocina' },
              ]}
              value={form.hoja}
              onChange={(v) => v && setForm({ ...form, hoja: v as HojaReporteProduccion })}
            />
          )}
          <TextInput
            label="Sección"
            description="Ej. CAMARÓN, PESCADO, RES"
            value={form.seccion}
            onChange={(e) => setForm({ ...form, seccion: e.currentTarget.value })}
          />
          <TextInput label="Producto" value={form.producto} onChange={(e) => setForm({ ...form, producto: e.currentTarget.value })} />
          <TextInput
            label="Presentación / variante"
            value={form.presentacion}
            onChange={(e) => setForm({ ...form, presentacion: e.currentTarget.value })}
          />
          <Group grow>
            <TextInput label="Gramaje" value={form.gramaje} onChange={(e) => setForm({ ...form, gramaje: e.currentTarget.value })} />
            <Select
              label="Unidad"
              allowDeselect={false}
              data={UNIDADES}
              value={form.unidad}
              onChange={(v) => v && setForm({ ...form, unidad: v })}
            />
          </Group>
          {form.unidad === 'KG' && form.hoja === 'porcionador' && (
            <div>
              <Text size="sm" fw={500} mb={4}>
                ¿Es el producto crudo que se limpia?
              </Text>
              <SegmentedControl
                size="xs"
                value={form.es_crudo}
                onChange={(v) => setForm({ ...form, es_crudo: v as 'auto' | 'si' | 'no' })}
                data={[
                  { value: 'auto', label: 'Automático' },
                  { value: 'si', label: 'Sí' },
                  { value: 'no', label: 'No' },
                ]}
              />
              <Text size="xs" c="dimmed" mt={4}>
                Si es el crudo, lo que pesas en bruto se descuenta solo de aquí como "usado en limpieza". Automático: se considera crudo si es la única presentación en KG del producto.
              </Text>
            </div>
          )}
          {form.unidad === 'KG' && form.hoja === 'porcionador' && (
            <Switch
              label="Es producto ya LIMPIO (lo que sobra de la limpieza)"
              description="Ejemplo: filetitos de pechuga. Sus kg son pollo limpio: se pasan a bruto con el factor del producto. Lo que sobra (entradas) cuenta como producido y lo que usas para hacer porciones (salidas) se descuenta, para no contarlo dos veces."
              checked={form.es_limpio}
              onChange={(e) => setForm({ ...form, es_limpio: e.currentTarget.checked })}
            />
          )}
          <Text size="sm" fw={600} mt="xs">
            Rendimiento (para llevar la producción a kg bruto)
          </Text>
          <NumberInput
            label="Gramaje en kg por unidad capturada"
            description="Ej. una porción de 110 g = 0.11; una pieza o bulto de 2 kg = 2"
            min={0}
            decimalScale={4}
            hideControls
            value={form.gramaje_kg}
            onChange={(v) => setForm({ ...form, gramaje_kg: v })}
          />
          <Group grow align="flex-start">
            <NumberInput
              label="Prueba: kg en bruto"
              min={0}
              decimalScale={3}
              hideControls
              value={form.prueba_bruto_kg}
              onChange={(v) => setForm({ ...form, prueba_bruto_kg: v })}
            />
            <NumberInput
              label="Prueba: kg limpios"
              min={0}
              decimalScale={3}
              hideControls
              value={form.prueba_limpio_kg}
              onChange={(v) => setForm({ ...form, prueba_limpio_kg: v })}
            />
          </Group>
          <Text size="xs" c="dimmed">
            Factor de rendimiento:{' '}
            {aNumeroONull(form.prueba_bruto_kg) && aNumeroONull(form.prueba_limpio_kg)
              ? (Number(form.prueba_bruto_kg) / Number(form.prueba_limpio_kg)).toFixed(3)
              : 'sin prueba (no se calcula bruto para las porciones)'}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button loading={crear.isPending || editar.isPending} onClick={guardar}>
              Guardar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

// ── Panel principal ────────────────────────────────────────────────────

export default function ReporteProduccionPanel() {
  const [fecha, setFecha] = useState<Date>(new Date());
  const [tab, setTab] = useState('porcionador');
  const fechaIso = aFechaIso(fecha);
  const { data: fechas } = useFechasReporteProduccion();

  // Cambiar de pestaña o de día remonta el formulario (keepMounted={false}), pero lo tecleado sin
  // guardar queda en un borrador local por hoja y día (ver CapturaHojaForm): no se pierde, así que
  // ya no hace falta pedir confirmación. `pendientesRef` solo informa si hay algo sin guardar.
  const pendientesRef = useRef<Record<'porcionador' | 'cocina', boolean>>({ porcionador: false, cocina: false });

  const cambiarTab = (valor: string | null) => {
    if (valor) setTab(valor);
  };
  const cambiarFecha = (nueva: Date) => setFecha(nueva);

  return (
    <Stack gap="lg">
      <Group align="flex-end" gap="md">
        <DateInput
          label="Día del reporte"
          valueFormat="DD/MM/YYYY"
          value={fecha}
          onChange={(v) => v && cambiarFecha(new Date(v))}
          maxDate={new Date()}
          w={180}
        />
        {(fechas ?? []).length > 0 && (
          <Group gap={6} style={{ flexWrap: 'wrap' }}>
            <Text size="xs" c="dimmed">
              Días con captura:
            </Text>
            {(fechas ?? []).slice(0, 10).map((f) => (
              <Badge
                key={f.fecha}
                variant={f.fecha === fechaIso ? 'filled' : 'light'}
                color="red"
                style={{ cursor: 'pointer' }}
                onClick={() => cambiarFecha(parseFechaIso(f.fecha))}
              >
                {f.fecha.slice(8, 10)}/{f.fecha.slice(5, 7)}
              </Badge>
            ))}
          </Group>
        )}
      </Group>

      <Tabs value={tab} onChange={cambiarTab} keepMounted={false} variant="pills" color="red">
        <Tabs.List mb="md">
          <Tabs.Tab value="porcionador">Porcionador</Tabs.Tab>
          <Tabs.Tab value="cocina">Cocina</Tabs.Tab>
          <Tabs.Tab value="cuadre">Cuadre</Tabs.Tab>
          <Tabs.Tab value="inventario">Inventario y limpieza</Tabs.Tab>
          <Tabs.Tab value="catalogo">Catálogo de renglones</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="porcionador">
          <PanelCapturaHoja
            key={fechaIso}
            fecha={fechaIso}
            hoja="porcionador"
            onCambiosPendientes={(p) => { pendientesRef.current.porcionador = p; }}
          />
        </Tabs.Panel>
        <Tabs.Panel value="cocina">
          <PanelCapturaHoja
            key={fechaIso}
            fecha={fechaIso}
            hoja="cocina"
            onCambiosPendientes={(p) => { pendientesRef.current.cocina = p; }}
          />
        </Tabs.Panel>
        <Tabs.Panel value="cuadre">
          <PanelCuadre fecha={fechaIso} />
        </Tabs.Panel>
        <Tabs.Panel value="inventario">
          <PanelInventarioBruto fecha={fechaIso} />
        </Tabs.Panel>
        <Tabs.Panel value="catalogo">
          <PanelCatalogoRenglones />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

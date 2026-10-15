/**
 * TablaReservaciones — pantalla de trabajo de las cajeras: tarjetas por cliente con su avance de pago y
 * botón de abonar, buscador grande, filtros por estado con contadores, venta nueva sin pasar por el croquis
 * y vista por mesa (como las hojas 10, 20, 30… del Excel). El detalle (pagos, sillas, recibo) y la
 * impresión de la hoja por mesas siguen siendo los mismos.
 */

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  MultiSelect,
  Paper,
  Progress,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
  IconCash,
  IconLayoutGrid,
  IconListDetails,
  IconPlus,
  IconPrinter,
  IconSearch,
  IconX,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';

import {
  mensajeErrorFiesta,
  useFiestaMesas,
  useFiestaReservaciones,
  type FiestaEvento,
  type FiestaMesa,
  type FiestaReservacion,
} from '../../api/fiestaHooks';
import DetalleReservacion from './DetalleReservacion';
import { imprimirHojaMesas, type BloqueHojaMesa } from './fiestaImpresion';
import PanelMesaFiesta from './PanelMesaFiesta';
import {
  dinero,
  ESTADO_RESERVACION_CONFIG,
  ESTADO_SILLA_CONFIG,
  ETIQUETA_TIPO,
} from './fiestaUtils';

type FiltroEstado = 'todas' | 'sin_pago' | 'anticipo' | 'pagada' | 'cortesia' | 'cancelada';

const FILTROS: { valor: FiltroEstado; etiqueta: string; color: string }[] = [
  { valor: 'todas', etiqueta: 'Todas', color: 'gray' },
  { valor: 'sin_pago', etiqueta: 'Sin pago', color: 'orange' },
  { valor: 'anticipo', etiqueta: 'Con anticipo', color: 'blue' },
  { valor: 'pagada', etiqueta: 'Pagadas', color: 'green' },
  { valor: 'cortesia', etiqueta: 'Cortesías', color: 'violet' },
  { valor: 'cancelada', etiqueta: 'Canceladas', color: 'red' },
];

const COLOR_PROGRESO: Record<string, string> = {
  sin_pago: 'orange',
  anticipo: 'blue',
  pagada: 'green',
  cortesia: 'violet',
};

const claveEstado = (r: FiestaReservacion): FiltroEstado =>
  r.estatus === 'cancelada' ? 'cancelada' : r.estado === 'sin_sillas' ? 'cancelada' : r.estado;

/** "Mesa 103" / "Mesas 83 y 93" */
function etiquetaMesas(r: FiestaReservacion): string {
  const mesas = [...new Set(r.sillas.filter((x) => x.activa).map((x) => x.mesa))].sort((a, b) => a - b);
  if (mesas.length === 0) return '—';
  if (mesas.length === 1) return `Mesa ${mesas[0]}`;
  return `Mesas ${mesas.slice(0, -1).join(', ')} y ${mesas[mesas.length - 1]}`;
}

export default function TablaReservaciones({ evento }: { evento: FiestaEvento }) {
  const [vista, setVista] = useState<'reservaciones' | 'mesas'>('reservaciones');
  const [estado, setEstado] = useState<FiltroEstado>('todas');
  const [texto, setTexto] = useState('');
  const [detalle, setDetalle] = useState<{ id: number; abonar: boolean } | null>(null);
  const [hojaAbierta, setHojaAbierta] = useState(false);
  const [nuevaAbierta, setNuevaAbierta] = useState(false);
  const [mesaAbierta, setMesaAbierta] = useState<number | null>(null);

  // Se trae todo una vez y se filtra aquí: los contadores y los filtros responden al instante.
  const { data, isLoading, isError, error } = useFiestaReservaciones({ incluir_canceladas: true });
  const { data: mesasData } = useFiestaMesas();
  const todas = data?.reservaciones ?? [];
  const mesas = mesasData?.mesas ?? [];

  const [textoDiferido] = useDebouncedValue(texto, 150);
  const busqueda = textoDiferido.trim().toLowerCase();

  const contadores = useMemo(() => {
    const c: Record<FiltroEstado, number> = { todas: 0, sin_pago: 0, anticipo: 0, pagada: 0, cortesia: 0, cancelada: 0 };
    for (const r of todas) {
      c[claveEstado(r)] += 1;
      if (r.estatus !== 'cancelada') c.todas += 1;
    }
    return c;
  }, [todas]);

  const filtradas = useMemo(
    () =>
      todas.filter((r) => {
        if (estado === 'todas' ? r.estatus === 'cancelada' : claveEstado(r) !== estado) return false;
        if (!busqueda) return true;
        const mesasDe = r.sillas.filter((s) => s.activa).map((s) => String(s.mesa));
        const texto = `${r.cliente} ${r.telefono_o_cuarto} ${r.correo} ${r.notas} ${r.id}`.toLowerCase();
        return texto.includes(busqueda) || mesasDe.includes(busqueda) || mesasDe.some((m) => `m${m}` === busqueda);
      }),
    [todas, estado, busqueda],
  );

  const totales = useMemo(
    () =>
      todas.reduce(
        (t, r) =>
          r.estatus === 'cancelada' ? t : { importe: t.importe + r.importe, pagado: t.pagado + r.pagado, saldo: t.saldo + r.saldo },
        { importe: 0, pagado: 0, saldo: 0 },
      ),
    [todas],
  );

  return (
    <Stack gap="md">
      {/* Barra principal: buscador grande + acciones */}
      <Group align="flex-end" justify="space-between" wrap="wrap">
        <TextInput
          size="md"
          placeholder="Buscar por cliente, mesa, teléfono, cuarto o correo…"
          leftSection={<IconSearch size={18} />}
          rightSection={
            texto ? (
              <ActionIcon variant="subtle" color="gray" aria-label="Limpiar búsqueda" onClick={() => setTexto('')}>
                <IconX size={16} />
              </ActionIcon>
            ) : undefined
          }
          value={texto}
          onChange={(e) => setTexto(e.currentTarget.value)}
          style={{ flex: 1, minWidth: 260, maxWidth: 560 }}
        />
        <Group gap="xs">
          <SegmentedControl
            value={vista}
            onChange={(v) => setVista(v as 'reservaciones' | 'mesas')}
            data={[
              { value: 'reservaciones', label: <Group gap={6} wrap="nowrap"><IconListDetails size={16} />Reservaciones</Group> },
              { value: 'mesas', label: <Group gap={6} wrap="nowrap"><IconLayoutGrid size={16} />Por mesa</Group> },
            ]}
          />
          <Button leftSection={<IconPlus size={18} />} onClick={() => setNuevaAbierta(true)}>
            Nueva reservación
          </Button>
          <Button variant="default" leftSection={<IconPrinter size={16} />} onClick={() => setHojaAbierta(true)}>
            Hoja por mesas
          </Button>
        </Group>
      </Group>

      {isError && <Alert color="red">{mensajeErrorFiesta(error)}</Alert>}
      {isLoading && <Loader size="sm" />}

      {vista === 'reservaciones' ? (
        <>
          {/* Resumen de cobranza */}
          <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="sm">
            <Resumen etiqueta="Importe vendido" valor={dinero(totales.importe)} />
            <Resumen etiqueta="Cobrado" valor={dinero(totales.pagado)} color="green" />
            <Resumen etiqueta="Por cobrar" valor={dinero(totales.saldo)} color={totales.saldo > 0 ? 'red' : undefined} />
          </SimpleGrid>

          {/* Filtros por estado con contador */}
          <Group gap="xs">
            {FILTROS.map((f) => (
              <Button
                key={f.valor}
                size="compact-md"
                radius="xl"
                color={f.color}
                variant={estado === f.valor ? 'filled' : 'light'}
                onClick={() => setEstado(f.valor)}
                rightSection={
                  <Badge size="sm" circle={contadores[f.valor] < 100} color={estado === f.valor ? 'dark' : f.color} variant={estado === f.valor ? 'filled' : 'white'}>
                    {contadores[f.valor]}
                  </Badge>
                }
              >
                {f.etiqueta}
              </Button>
            ))}
          </Group>

          {filtradas.length === 0 && !isLoading ? (
            <Paper withBorder p="xl" ta="center">
              <Text c="dimmed">
                {todas.length === 0
                  ? 'Todavía no hay reservaciones. Pulsa "Nueva reservación" para capturar la primera.'
                  : 'No hay reservaciones con esa búsqueda o filtro.'}
              </Text>
            </Paper>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing="sm">
              {filtradas.map((r) => (
                <TarjetaReservacion
                  key={r.id}
                  r={r}
                  onVer={() => setDetalle({ id: r.id, abonar: false })}
                  onAbonar={() => setDetalle({ id: r.id, abonar: true })}
                />
              ))}
            </SimpleGrid>
          )}
        </>
      ) : (
        <VistaMesas mesas={mesas} busqueda={busqueda} onAbrir={setMesaAbierta} />
      )}

      <DetalleReservacion
        reservacionId={detalle?.id ?? null}
        enfocarAbono={detalle?.abonar}
        nombreEvento={evento.nombre}
        onClose={() => setDetalle(null)}
      />
      <NuevaReservacionModal
        opened={nuevaAbierta}
        onClose={() => setNuevaAbierta(false)}
        mesas={mesas}
        evento={evento}
        onCreada={(id) => {
          setNuevaAbierta(false);
          setDetalle({ id, abonar: false });
        }}
      />
      <MesaModal
        mesa={mesas.find((m) => m.numero === mesaAbierta) ?? null}
        evento={evento}
        onClose={() => setMesaAbierta(null)}
        onVerReservacion={(id) => {
          setMesaAbierta(null);
          setDetalle({ id, abonar: false });
        }}
      />
      <HojaMesasModal opened={hojaAbierta} onClose={() => setHojaAbierta(false)} nombreEvento={evento.nombre} />
    </Stack>
  );
}

function Resumen({ etiqueta, valor, color }: { etiqueta: string; valor: string; color?: string }) {
  return (
    <Paper withBorder p="sm" radius="md">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {etiqueta}
      </Text>
      <Text size="xl" fw={700} c={color}>
        {valor}
      </Text>
    </Paper>
  );
}

/** Una reservación, lo mínimo: quién, mesa, cuánto debe y el botón de abonar. El resto está en "Ver". */
function TarjetaReservacion({
  r,
  onVer,
  onAbonar,
}: {
  r: FiestaReservacion;
  onVer: () => void;
  onAbonar: () => void;
}) {
  const cancelada = r.estatus === 'cancelada';
  const cfg = ESTADO_RESERVACION_CONFIG[r.estado];
  const color = cancelada ? 'red' : COLOR_PROGRESO[r.estado] ?? 'gray';
  const pct = r.importe > 0 ? Math.min(100, Math.round((r.pagado / r.importe) * 100)) : r.estado === 'cortesia' ? 100 : 0;
  const nSillas = r.sillas.filter((s) => s.activa).length;
  const liquidada = !cancelada && r.saldo <= 0.005 && r.importe > 0;
  const puedeAbonar = !cancelada && !liquidada && r.estado !== 'cortesia';

  return (
    <Card
      withBorder
      radius="md"
      padding="md"
      onClick={onVer}
      style={{ cursor: 'pointer', opacity: cancelada ? 0.6 : 1 }}
    >
      <Group justify="space-between" wrap="nowrap" align="center">
        <Text fw={700} size="lg" lineClamp={1}>
          {r.cliente}
        </Text>
        <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
          {r.cortesias_por_autorizar > 0 && (
            <Badge color="yellow" variant="filled" size="sm" title="Un supervisor debe autorizar la cortesía">
              Cortesía por autorizar
            </Badge>
          )}
          {r.por_devolver > 0 && (
            <Badge color="orange" variant="filled" size="sm" title="Dinero cobrado que hay que regresar al cliente">
              Por devolver {dinero(r.por_devolver)}
            </Badge>
          )}
          <Badge color={color} variant="light" size="sm">
            {cancelada ? 'Cancelada' : cfg.etiqueta}
          </Badge>
        </Group>
      </Group>
      <Text size="sm" c="dimmed" mt={2}>
        {etiquetaMesas(r)} · {nSillas} {nSillas === 1 ? 'silla' : 'sillas'}
      </Text>

      <Progress value={pct} color={color} size="sm" radius="xl" mt="sm" />

      <Group justify="space-between" align="flex-end" mt="sm" wrap="nowrap">
        {cancelada ? (
          <Text size="sm" c="dimmed">
            {r.motivo_cancelacion || 'Cancelada'}
          </Text>
        ) : liquidada ? (
          <Text fw={700} c="green">
            ✓ Liquidada
          </Text>
        ) : r.estado === 'cortesia' ? (
          <Text fw={700} c="violet">
            Cortesía
          </Text>
        ) : (
          <div>
            <Text size="xs" c="dimmed" lh={1.1}>
              Debe
            </Text>
            <Text fw={800} size="xl" c="red" lh={1.1}>
              {dinero(r.saldo)}
            </Text>
          </div>
        )}
        {puedeAbonar && (
          <Button
            size="sm"
            leftSection={<IconCash size={16} />}
            onClick={(e) => {
              e.stopPropagation();
              onAbonar();
            }}
          >
            Abonar
          </Button>
        )}
      </Group>
    </Card>
  );
}

/** Mesas como las hojas del Excel: cuántas sillas hay ocupadas y su avance de pago; clic para abrirla. */
function VistaMesas({
  mesas,
  busqueda,
  onAbrir,
}: {
  mesas: FiestaMesa[];
  busqueda: string;
  onAbrir: (numero: number) => void;
}) {
  const zonas = useMemo(() => [...new Set(mesas.map((m) => m.zona ?? 'Sin zona'))], [mesas]);
  const [zona, setZona] = useState<string>('todas');
  const lista = mesas
    .slice()
    .sort((a, b) => a.numero - b.numero)
    .filter((m) => zona === 'todas' || (m.zona ?? 'Sin zona') === zona)
    // La búsqueda sirve igual aquí: por número de mesa o por el nombre de algún cliente sentado en ella.
    .filter(
      (m) =>
        !busqueda ||
        String(m.numero).includes(busqueda.replace(/^m/, '')) ||
        m.sillas.some((s) => (s.cliente ?? '').toLowerCase().includes(busqueda)),
    );

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        {zonas.length > 1 ? (
          <SegmentedControl value={zona} onChange={setZona} data={[{ value: 'todas', label: 'Todas' }, ...zonas.map((z) => ({ value: z, label: z }))]} />
        ) : (
          <span />
        )}
        <Group gap="md">
          {(['libre', 'sin_pago', 'anticipo', 'pagada'] as const).map((e) => (
            <Group key={e} gap={4}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: ESTADO_SILLA_CONFIG[e].relleno, border: `1px solid ${ESTADO_SILLA_CONFIG[e].borde}` }} />
              <Text size="xs">{ESTADO_SILLA_CONFIG[e].etiqueta}</Text>
            </Group>
          ))}
        </Group>
      </Group>
      <SimpleGrid cols={{ base: 2, xs: 3, sm: 4, md: 6, lg: 8 }} spacing="xs">
        {lista.map((m) => {
          const total = m.sillas.length;
          const bloqueadas = m.sillas.filter((s) => s.estado === 'bloqueada').length;
          const ocupadas = total - m.libres - bloqueadas;
          const cuenta = (e: string) => m.sillas.filter((s) => (s.estado_pago ?? s.estado) === e).length;
          const pagadas = cuenta('pagada');
          const anticipos = cuenta('anticipo');
          const sinPago = cuenta('sin_pago');
          const llena = m.libres === 0 && bloqueadas === 0;
          return (
            <UnstyledButton key={m.id} onClick={() => onAbrir(m.numero)}>
              <Paper
                withBorder
                p="xs"
                radius="md"
                style={{ borderColor: llena ? 'var(--mantine-color-green-5)' : ocupadas > 0 ? 'var(--mantine-color-orange-4)' : undefined }}
              >
                <Group justify="space-between" wrap="nowrap">
                  <Text fw={800} size="lg">
                    {m.numero}
                  </Text>
                  <Text size="xs" c={llena ? 'green' : 'dimmed'} fw={600}>
                    {ocupadas}/{total}
                  </Text>
                </Group>
                <Progress.Root size="sm" mt={4}>
                  <Progress.Section value={(pagadas / total) * 100} color="green" />
                  <Progress.Section value={(anticipos / total) * 100} color="blue" />
                  <Progress.Section value={(sinPago / total) * 100} color="orange" />
                </Progress.Root>
                <Text size="xs" c="dimmed" mt={4}>
                  {llena ? 'Llena' : `${m.libres} libres`}
                  {bloqueadas > 0 ? ` · ${bloqueadas} 🔒` : ''}
                </Text>
              </Paper>
            </UnstyledButton>
          );
        })}
      </SimpleGrid>
      {lista.length === 0 && (
        <Text c="dimmed" ta="center" py="md">
          No hay mesas con ese número.
        </Text>
      )}
    </Stack>
  );
}

/** Abre una mesa (sus 12 sillas, clientes, pagado y saldo) para reservar o abonar sin ir al croquis. */
function MesaModal({
  mesa,
  evento,
  onClose,
  onVerReservacion,
}: {
  mesa: FiestaMesa | null;
  evento: FiestaEvento;
  onClose: () => void;
  onVerReservacion: (id: number) => void;
}) {
  return (
    <Modal opened={mesa !== null} onClose={onClose} title={mesa ? `Mesa ${mesa.numero}` : ''} size="lg">
      {mesa && <PanelMesaFiesta key={mesa.id} mesa={mesa} evento={evento} onVerReservacion={onVerReservacion} />}
    </Modal>
  );
}

/** Venta nueva: se elige la mesa y se capturan sillas, cliente y primer pago (mismo formulario que el croquis). */
function NuevaReservacionModal({
  opened,
  onClose,
  mesas,
  evento,
  onCreada,
}: {
  opened: boolean;
  onClose: () => void;
  mesas: FiestaMesa[];
  evento: FiestaEvento;
  onCreada: (id: number) => void;
}) {
  const [numero, setNumero] = useState<string | null>(null);
  const mesa = mesas.find((m) => String(m.numero) === numero) ?? null;
  const opciones = mesas
    .slice()
    .sort((a, b) => a.numero - b.numero)
    .map((m) => ({ value: String(m.numero), label: `Mesa ${m.numero} · ${m.libres} libres`, disabled: m.libres === 0 }));

  return (
    <Modal opened={opened} onClose={onClose} title="Nueva reservación" size="lg">
      <Stack gap="sm">
        <Select
          label="Mesa"
          placeholder="Escribe o elige el número de mesa"
          data={opciones}
          value={numero}
          onChange={setNumero}
          searchable
          nothingFoundMessage="Esa mesa no existe"
          comboboxProps={{ zIndex: 400 }}
          data-autofocus
        />
        {mesa ? (
          <ScrollArea.Autosize mah="70vh" offsetScrollbars>
            <PanelMesaFiesta key={mesa.id} mesa={mesa} evento={evento} onVerReservacion={onCreada} />
          </ScrollArea.Autosize>
        ) : (
          <Text size="sm" c="dimmed">
            Elige la mesa, marca las sillas libres, captura al cliente y, si ya paga, el primer abono (25 %, 50 %, 75 % o todo).
          </Text>
        )}
      </Stack>
    </Modal>
  );
}

function HojaMesasModal({
  opened,
  onClose,
  nombreEvento,
}: {
  opened: boolean;
  onClose: () => void;
  nombreEvento: string;
}) {
  const { data: mesasData } = useFiestaMesas(opened);
  const { data: reservacionesData } = useFiestaReservaciones({}, opened);
  const [elegidas, setElegidas] = useState<string[]>([]);

  const mesas = (mesasData?.mesas ?? []).slice().sort((a, b) => a.numero - b.numero);
  const opciones = mesas.map((m) => ({ value: String(m.numero), label: `Mesa ${m.numero}${m.libres < m.sillas.length ? '' : ' (vacía)'}` }));

  const imprimir = (numeros: number[]) => {
    const porSilla = new Map<number, { cliente: string; contacto: string; tipo: string }>();
    for (const r of reservacionesData?.reservaciones ?? []) {
      if (r.estatus !== 'activa') continue;
      for (const s of r.sillas.filter((x) => x.activa)) {
        porSilla.set(s.silla_id, { cliente: r.cliente, contacto: r.telefono_o_cuarto, tipo: ETIQUETA_TIPO[s.tipo] });
      }
    }
    const bloques: BloqueHojaMesa[] = mesas
      .filter((m) => numeros.includes(m.numero))
      .map((m) => ({
        mesa: m.numero,
        filas: m.sillas.map((s) => {
          const info = porSilla.get(s.id);
          return {
            silla: s.numero,
            cliente: info?.cliente ?? '',
            tipo: info?.tipo ?? '',
            contacto: info?.contacto ?? '',
            estado: s.estado === 'libre' ? '' : ESTADO_SILLA_CONFIG[s.estado].etiqueta,
          };
        }),
      }));
    imprimirHojaMesas(nombreEvento, bloques);
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Imprimir hoja por mesas" size="md">
      <Stack>
        <Text size="sm" c="dimmed">
          Elige las mesas que quieres en la hoja (cliente, tipo, contacto y estado de cada silla).
        </Text>
        <MultiSelect
          label="Mesas"
          data={opciones}
          value={elegidas}
          onChange={setElegidas}
          searchable
          clearable
          placeholder="Busca por número de mesa"
          nothingFoundMessage="Sin coincidencias"
          maxDropdownHeight={260}
        />
        <Group justify="space-between">
          <Button
            variant="default"
            onClick={() => imprimir(mesas.filter((m) => m.libres < m.sillas.length).map((m) => m.numero))}
            disabled={mesas.length === 0}
          >
            Todas las mesas con reservaciones
          </Button>
          <Button
            leftSection={<IconPrinter size={16} />}
            onClick={() => imprimir(elegidas.map(Number))}
            disabled={elegidas.length === 0}
          >
            Imprimir selección
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

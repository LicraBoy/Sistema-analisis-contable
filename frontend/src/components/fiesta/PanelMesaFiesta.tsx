/**
 * PanelMesaFiesta — contenido del Drawer al hacer clic en una mesa del croquis:
 * estado de cada silla y formulario para reservar las sillas libres elegidas.
 */

import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Paper,
  SegmentedControl,
  Switch,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconLock, IconLockOpen } from '@tabler/icons-react';
import { useState } from 'react';

import {
  mensajeErrorFiesta,
  useFiestaBloquearSillas,
  useFiestaCrearReservacion,
  type FiestaEvento,
  type FiestaMesa,
  type TipoBoletoFiesta,
} from '../../api/fiestaHooks';
import {
  dinero,
  ESTADO_SILLA_CONFIG,
  fechaCorta,
  guardarCapturista,
  hoyISO,
  leerCapturista,
  precioVigente,
  TIPOS_BOLETO,
} from './fiestaUtils';
import { useSupervisor } from './SupervisorPin';

interface Props {
  mesa: FiestaMesa;
  evento: FiestaEvento;
  onVerReservacion: (id: number) => void;
}

export default function PanelMesaFiesta({ mesa, evento, onVerReservacion }: Props) {
  const crear = useFiestaCrearReservacion();
  const bloquear = useFiestaBloquearSillas();
  const pedirPin = useSupervisor();

  const [elegidas, setElegidas] = useState<Record<number, TipoBoletoFiesta>>({});
  const [cliente, setCliente] = useState('');
  const [contacto, setContacto] = useState('');
  const [notas, setNotas] = useState('');
  const [capturadoPor, setCapturadoPor] = useState(leerCapturista());
  const [fechaVenta, setFechaVenta] = useState(hoyISO());
  const [correo, setCorreo] = useState('');
  // Permiso para respetar el precio de preventa después del corte (queda registrado quién lo autoriza).
  const [preventa, setPreventa] = useState(false);
  const [autorizadoPor, setAutorizadoPor] = useState('');
  const [motivoPreventa, setMotivoPreventa] = useState('');

  // Si otra caja ocupó una silla mientras la tenías elegida, deja de estar seleccionada.
  const libres = new Set(mesa.sillas.filter((s) => s.estado === 'libre').map((s) => s.id));
  const seleccion = Object.entries(elegidas)
    .map(([id, tipo]) => ({ silla_id: Number(id), tipo }))
    .filter((s) => libres.has(s.silla_id));

  const pasoElCorte = evento.corte_preventa !== null && fechaVenta > evento.corte_preventa;
  const forzarPreventa = preventa && pasoElCorte;
  const total = seleccion.reduce(
    (suma, s) => suma + precioVigente(s.tipo, evento.precios, evento.corte_preventa, fechaVenta, forzarPreventa),
    0,
  );
  const sinPrecios =
    seleccion.some((s) => s.tipo !== 'cortesia') &&
    evento.precios.filter((p) => p.tipo !== 'cortesia').every((p) => p.precio_preventa === 0 && p.precio_normal === 0);

  const alternar = (sillaId: number) =>
    setElegidas((actual) => {
      const copia = { ...actual };
      if (sillaId in copia) delete copia[sillaId];
      else copia[sillaId] = 'adulto';
      return copia;
    });

  const elegirTodasLasLibres = () =>
    setElegidas((actual) => {
      const copia = { ...actual };
      mesa.sillas.filter((s) => s.estado === 'libre').forEach((s) => (copia[s.id] ??= 'adulto'));
      return copia;
    });

  /** Bloquear o habilitar sillas (o toda la mesa): solo el supervisor, con su PIN. */
  const cambiarBloqueo = async (bloqueo: boolean, opciones: { sillaIds?: number[]; mesa?: boolean }) => {
    let motivo: string | undefined;
    if (bloqueo) {
      const texto = window.prompt('Motivo del bloqueo (ej. mesa del DJ, evento privado):');
      if (texto === null) return;
      if (texto.trim().length < 3) {
        notifications.show({ color: 'red', message: 'Indica el motivo del bloqueo.' });
        return;
      }
      motivo = texto.trim();
    }
    const pin = await pedirPin(bloqueo ? 'bloquear (sacar de venta)' : 'habilitar (volver a poner en venta)');
    if (pin === null) return;
    try {
      const r = await bloquear.mutateAsync({
        bloquear: bloqueo,
        sillaIds: opciones.sillaIds,
        mesa: opciones.mesa ? mesa.numero : undefined,
        motivo,
        pin: pin || undefined,
      });
      setElegidas({});
      notifications.show({
        color: bloqueo ? 'gray' : 'green',
        message:
          `${r.cambiadas} ${r.cambiadas === 1 ? 'silla' : 'sillas'} ${bloqueo ? 'bloqueadas' : 'habilitadas'}.` +
          (r.omitidas_por_estar_reservadas ? ` ${r.omitidas_por_estar_reservadas} ya estaban reservadas y no se tocaron.` : ''),
      });
    } catch (e) {
      notifications.show({ color: 'red', title: 'No se pudo cambiar el bloqueo', message: mensajeErrorFiesta(e), autoClose: 8000 });
    }
  };

  const botonSilla = (s: FiestaMesa['sillas'][number]) => {
    if (s.bloqueada) {
      return (
        <UnstyledButton
          key={s.id}
          onClick={() => cambiarBloqueo(false, { sillaIds: [s.id] })}
          style={{ border: '2px dashed #343a40', background: '#dee2e6', borderRadius: 8, padding: '6px 8px', minHeight: 52 }}
          title={`Bloqueada${s.bloqueo_motivo ? `: ${s.bloqueo_motivo}` : ''}\nClic para habilitarla (supervisor)`}
        >
          <Text size="sm" fw={700} c="dark">
            <IconLock size={13} style={{ verticalAlign: '-2px' }} /> Silla {s.numero}
          </Text>
          <Text size="xs" c="dark" lineClamp={2}>
            {s.bloqueo_motivo || 'Bloqueada'}
          </Text>
        </UnstyledButton>
      );
    }
    const libre = s.estado === 'libre';
    // Ocupada: el color sigue el pago de ESA silla (los pagos de la reservación se reparten entre sus sillas).
    const cfg = ESTADO_SILLA_CONFIG[libre ? 'libre' : (s.estado_pago ?? s.estado)];
    const conPagos = !libre && s.pagado !== null && s.saldo !== null;
    const detallePagos = s.pagos.map((p) => `${fechaCorta(p.fecha)} ${dinero(p.importe)}${p.referencia ? ` (${p.referencia})` : ''}`);
    const marcada = s.id in elegidas && libres.has(s.id);
    return (
      <UnstyledButton
        key={s.id}
        onClick={() => (libre ? alternar(s.id) : s.reservacion_id !== null && onVerReservacion(s.reservacion_id))}
        style={{
          border: `2px solid ${marcada ? '#7048e8' : cfg.borde}`,
          background: marcada ? '#e5dbff' : cfg.relleno,
          borderRadius: 8,
          padding: '6px 8px',
          minHeight: 52,
        }}
        title={
          libre
            ? 'Clic para elegir esta silla'
            : `Clic para ver la reservación${detallePagos.length ? `\n${detallePagos.map((d, i) => `Pago ${i + 1}: ${d}`).join('\n')}` : ''}`
        }
      >
        <Text size="sm" fw={700} c="dark">
          Silla {s.numero}
        </Text>
        <Text size="xs" c="dark" lineClamp={1}>
          {libre ? (marcada ? 'Elegida' : 'Libre') : (s.cliente ?? cfg.etiqueta)}
        </Text>
        {conPagos && (
          <Text size="xs" c="dark" fw={600}>
            {s.estado_pago === 'cortesia'
              ? 'Cortesía'
              : s.estado_pago === 'pagada'
                ? `Pagada ${dinero(s.pagado ?? 0)}`
                : `Pagó ${dinero(s.pagado ?? 0)} · debe ${dinero(s.saldo ?? 0)}`}
          </Text>
        )}
      </UnstyledButton>
    );
  };

  const reservar = async () => {
    if (!cliente.trim()) {
      notifications.show({ color: 'red', message: 'Captura el nombre del cliente.' });
      return;
    }
    if (seleccion.length === 0) {
      notifications.show({ color: 'red', message: 'Elige al menos una silla libre.' });
      return;
    }
    if (forzarPreventa && (autorizadoPor.trim().length < 3 || motivoPreventa.trim().length < 3)) {
      notifications.show({ color: 'red', message: 'Para respetar la preventa indica quién lo autoriza y el motivo.' });
      return;
    }
    guardarCapturista(capturadoPor);
    // Respetar la preventa después del corte lo autoriza el supervisor (PIN).
    const pin = forzarPreventa ? await pedirPin('respetar el precio de preventa') : '';
    if (pin === null) return;
    try {
      const reservacion = await crear.mutateAsync({
        pin: pin || undefined,
        cliente: cliente.trim(),
        telefono_o_cuarto: contacto || undefined,
        correo: correo.trim() || undefined,
        notas: notas || undefined,
        fecha_venta: fechaVenta,
        capturado_por: capturadoPor || undefined,
        sillas: seleccion,
        preventa_autorizada: forzarPreventa ? { por: autorizadoPor.trim(), motivo: motivoPreventa.trim() } : undefined,
      });
      notifications.show({ color: 'green', message: `Reservación #${reservacion.id} creada.` });
      setElegidas({});
      setCliente('');
      setContacto('');
      setNotas('');
      setCorreo('');
      setPreventa(false);
      setAutorizadoPor('');
      setMotivoPreventa('');
      onVerReservacion(reservacion.id); // abre el detalle: ahí se imprime el recibo
    } catch (e) {
      notifications.show({ color: 'red', title: 'No se pudo reservar', message: mensajeErrorFiesta(e), autoClose: 8000 });
    }
  };

  return (
    <Stack gap="md">
      <Group gap="xs">
        <Badge variant="light" color="gray">
          {mesa.zona ?? 'Sin zona'}
        </Badge>
        <Text size="sm" c="dimmed">
          {mesa.libres} de {mesa.capacidad} sillas libres
          {mesa.sillas.some((x) => x.bloqueada) ? ` · ${mesa.sillas.filter((x) => x.bloqueada).length} bloqueadas` : ''}
        </Text>
      </Group>

      <SimpleGrid cols={{ base: 2, xs: 3 }} spacing="xs">
        {mesa.sillas.filter((s) => !s.extra).map(botonSilla)}
      </SimpleGrid>

      {mesa.sillas.some((s) => s.extra) && (
        <>
          <Divider
            label={
              <Group gap={6}>
                <Text size="xs" fw={600}>
                  Sillas extra
                </Text>
                <Badge size="xs" variant="light" color="gray">
                  no aparecen en el mapa
                </Badge>
              </Group>
            }
            labelPosition="left"
          />
          <SimpleGrid cols={{ base: 2, xs: 3 }} spacing="xs">
            {mesa.sillas.filter((s) => s.extra).map(botonSilla)}
          </SimpleGrid>
        </>
      )}

      {(mesa.libres > 0 || mesa.sillas.some((x) => x.bloqueada)) && (
        <Group gap="xs">
          {mesa.libres > 0 && (
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              leftSection={<IconLock size={14} />}
              onClick={() =>
                cambiarBloqueo(true, seleccion.length > 0 ? { sillaIds: seleccion.map((x) => x.silla_id) } : { mesa: true })
              }
              loading={bloquear.isPending}
              title="Solo el supervisor (PIN): saca de venta las sillas elegidas, o toda la mesa si no eliges ninguna"
            >
              {seleccion.length > 0 ? `Bloquear ${seleccion.length} elegidas` : 'Bloquear mesa'}
            </Button>
          )}
          {mesa.sillas.some((x) => x.bloqueada) && (
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              leftSection={<IconLockOpen size={14} />}
              onClick={() => cambiarBloqueo(false, { mesa: true })}
              loading={bloquear.isPending}
              title="Solo el supervisor (PIN): vuelve a poner en venta las sillas bloqueadas de esta mesa"
            >
              Habilitar bloqueadas
            </Button>
          )}
        </Group>
      )}

      {mesa.libres > 0 && (
        <Group gap="xs">
          <Button variant="light" size="xs" onClick={elegirTodasLasLibres}>
            Elegir todas las libres
          </Button>
          {seleccion.length > 0 && (
            <Button variant="subtle" size="xs" color="gray" onClick={() => setElegidas({})}>
              Limpiar selección
            </Button>
          )}
        </Group>
      )}

      {seleccion.length > 0 && (
        <>
          <Divider label={`Nueva reservación (${seleccion.length} ${seleccion.length === 1 ? 'silla' : 'sillas'})`} labelPosition="left" />

          <Stack gap="xs">
            {seleccion.map((s) => {
              const silla = mesa.sillas.find((x) => x.id === s.silla_id);
              return (
                <Paper key={s.silla_id} withBorder p="xs">
                  <Group justify="space-between" wrap="nowrap">
                    <Text size="sm" fw={600}>
                      Silla {silla?.numero}
                    </Text>
                    <SegmentedControl
                      size="xs"
                      value={s.tipo}
                      onChange={(v) => setElegidas((a) => ({ ...a, [s.silla_id]: v as TipoBoletoFiesta }))}
                      data={TIPOS_BOLETO}
                    />
                    <Text size="sm" w={86} ta="right">
                      {dinero(precioVigente(s.tipo, evento.precios, evento.corte_preventa, fechaVenta, forzarPreventa))}
                    </Text>
                  </Group>
                </Paper>
              );
            })}
          </Stack>

          {sinPrecios && (
            <Alert color="yellow" title="Faltan los precios">
              Los precios están en $0. Captúralos en la pestaña Configuración antes de vender.
            </Alert>
          )}

          <TextInput label="Cliente" required value={cliente} onChange={(e) => setCliente(e.currentTarget.value)} />
          <SimpleGrid cols={{ base: 1, xs: 2 }}>
            <TextInput label="Teléfono o cuarto" value={contacto} onChange={(e) => setContacto(e.currentTarget.value)} />
            <TextInput
              label="Correo del huésped"
              type="email"
              placeholder="nombre@correo.com"
              value={correo}
              onChange={(e) => setCorreo(e.currentTarget.value)}
            />
          </SimpleGrid>
          <SimpleGrid cols={{ base: 1, xs: 2 }}>
            <TextInput label="Capturó" value={capturadoPor} onChange={(e) => setCapturadoPor(e.currentTarget.value)} />
            <TextInput label="Fecha de venta" type="date" value={fechaVenta} onChange={(e) => setFechaVenta(e.currentTarget.value)} />
          </SimpleGrid>
          {pasoElCorte && (
            <Paper withBorder p="xs" radius="md">
              <Switch
                label="Respetar el precio de preventa (requiere autorización)"
                description={`La fecha de venta ya pasó el corte (${fechaCorta(evento.corte_preventa ?? '')}).`}
                checked={preventa}
                onChange={(e) => setPreventa(e.currentTarget.checked)}
              />
              {preventa && (
                <SimpleGrid cols={{ base: 1, xs: 2 }} mt="xs">
                  <TextInput label="Autorizado por" required value={autorizadoPor} onChange={(e) => setAutorizadoPor(e.currentTarget.value)} />
                  <TextInput label="Motivo" required value={motivoPreventa} onChange={(e) => setMotivoPreventa(e.currentTarget.value)} />
                </SimpleGrid>
              )}
            </Paper>
          )}
          <Textarea label="Notas" value={notas} onChange={(e) => setNotas(e.currentTarget.value)} minRows={2} autosize />

          <Paper withBorder p="sm" bg="var(--mantine-color-gray-light)">
            <Group justify="space-between">
              <Text fw={600}>Total a cobrar</Text>
              <Text fw={700} size="lg">
                {dinero(total)}
              </Text>
            </Group>
          </Paper>

          <Text size="xs" c="dimmed">
            Aquí solo se aparta el lugar. Los abonos se registran en la reservación (pestaña Reservaciones → Abonar).
          </Text>

          <Button size="md" onClick={reservar} loading={crear.isPending}>
            Reservar {seleccion.length} {seleccion.length === 1 ? 'silla' : 'sillas'}
          </Button>
        </>
      )}
    </Stack>
  );
}

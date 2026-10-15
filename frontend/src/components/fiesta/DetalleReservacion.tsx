/**
 * DetalleReservacion — modal con todo lo de una reservación: datos del cliente,
 * sillas (quitar), pagos (abonar / cancelar), recibo imprimible y cancelación.
 */

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  Chip,
  Divider,
  Group,
  Loader,
  Modal,
  Popover,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowsExchange, IconBrandWhatsapp, IconCheck, IconCopy, IconHistory, IconMail, IconPencil, IconPlus, IconPrinter, IconTrash, IconX } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';

import {
  mensajeErrorFiesta,
  registrarConfirmacion,
  useFiestaAgregarPago,
  useFiestaAgregarPagosMultiples,
  useFiestaCancelarDevolucion,
  useFiestaCancelarPago,
  useFiestaEvento,
  useFiestaRegistrarDevolucion,
  useFiestaCancelarReservacion,
  useFiestaEditarPago,
  useFiestaEditarPagoSilla,
  useFiestaEditarReservacion,
  useFiestaFusionarReservaciones,
  useFiestaMesas,
  useFiestaReservacion,
  useFiestaReservaciones,
  useFiestaTransferirSillas,
  type FiestaReservacion,
  type TipoBoletoFiesta,
} from '../../api/fiestaHooks';
import { useAuth } from '../../auth/AuthContext';
import PanelAuditoria from './PanelAuditoria';
import { imprimirRecibo } from './fiestaImpresion';
import { useSupervisor } from './SupervisorPin';
import {
  dinero,
  enlaceCorreo,
  enlaceWhatsApp,
  ESTADO_RESERVACION_CONFIG,
  ESTADO_SILLA_CONFIG,
  ETIQUETA_TIPO,
  fechaCorta,
  guardarCapturista,
  hoyISO,
  leerCapturista,
  mensajeConfirmacion,
  sugerirAbonos,
  TIPOS_BOLETO,
} from './fiestaUtils';

const FORMAS_PAGO = ['Efectivo', 'Tarjeta', 'Transferencia', 'Cheque', 'Cargo a habitación', 'Otro'];

interface Props {
  reservacionId: number | null;
  /** Al abrir, baja directo a "Registrar abono" (botón Abonar de las tarjetas). */
  enfocarAbono?: boolean;
  nombreEvento: string;
  onClose: () => void;
}

export default function DetalleReservacion({ reservacionId, enfocarAbono, nombreEvento, onClose }: Props) {
  const { data, isLoading, isError, error } = useFiestaReservacion(reservacionId);

  return (
    <Modal
      opened={reservacionId !== null}
      onClose={onClose}
      title={data ? `Reservación #${data.id} · ${data.cliente}` : 'Reservación'}
      size="min(1100px, 96vw)"
      zIndex={350}
    >
      {isLoading && <Loader size="sm" />}
      {isError && <Alert color="red">{mensajeErrorFiesta(error)}</Alert>}
      {data && <Contenido key={data.id} reservacion={data} nombreEvento={nombreEvento} enfocarAbono={enfocarAbono} onCerrar={onClose} />}
    </Modal>
  );
}

function Contenido({
  reservacion,
  nombreEvento,
  enfocarAbono,
  onCerrar,
}: {
  reservacion: FiestaReservacion;
  nombreEvento: string;
  enfocarAbono?: boolean;
  onCerrar: () => void;
}) {
  const abonoRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!enfocarAbono) return;
    const t = window.setTimeout(() => abonoRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250);
    return () => window.clearTimeout(t);
  }, [enfocarAbono]);
  const editar = useFiestaEditarReservacion();
  const agregarPago = useFiestaAgregarPago();
  const agregarMultiples = useFiestaAgregarPagosMultiples();
  const cancelarPago = useFiestaCancelarPago();
  const cancelarReservacion = useFiestaCancelarReservacion();

  const [cliente, setCliente] = useState(reservacion.cliente);
  const [contacto, setContacto] = useState(reservacion.telefono_o_cuarto);
  const [correo, setCorreo] = useState(reservacion.correo);
  // Sillas marcadas para transferirlas a otra mesa.
  const [paraTransferir, setParaTransferir] = useState<number[]>([]);
  const [notas, setNotas] = useState(reservacion.notas);

  const [importe, setImporte] = useState<number | string>('');
  const [fecha, setFecha] = useState(hoyISO());
  const [forma, setForma] = useState<string | null>('Efectivo');
  const [referencia, setReferencia] = useState('');
  // Otras formas de pago del mismo cobro (p. ej. parte en efectivo y parte con tarjeta).
  const [otrasFormas, setOtrasFormas] = useState<{ id: number; importe: number | string; forma: string | null; referencia: string }[]>([]);
  const [capturadoPor, setCapturadoPor] = useState(leerCapturista());
  const { puede } = useAuth();
  const [verHistorial, setVerHistorial] = useState(false);
  // Sillas a las que se aplica el abono (vacío = toda la reservación); define la base de las sugerencias.
  const [destino, setDestino] = useState<string[]>([]);

  const activa = reservacion.estatus === 'activa';
  const sillasActivas = reservacion.sillas.filter((s) => s.activa);
  const config = ESTADO_RESERVACION_CONFIG[reservacion.estado];
  const datosCambiaron =
    cliente !== reservacion.cliente ||
    contacto !== reservacion.telefono_o_cuarto ||
    correo !== reservacion.correo ||
    notas !== reservacion.notas;

  const avisarError = (e: unknown) =>
    notifications.show({ color: 'red', title: 'No se pudo guardar', message: mensajeErrorFiesta(e) });

  const guardarDatos = async () => {
    if (!cliente.trim()) {
      notifications.show({ color: 'red', message: 'El nombre del cliente no puede quedar vacío.' });
      return;
    }
    try {
      await editar.mutateAsync({
        id: reservacion.id,
        cambios: { cliente: cliente.trim(), telefono_o_cuarto: contacto, correo: correo.trim(), notas },
      });
      notifications.show({ color: 'green', message: 'Datos guardados.' });
    } catch (e) {
      avisarError(e);
    }
  };

  const quitarSilla = async (sillaId: number, etiqueta: string) => {
    if (!window.confirm(`¿Liberar ${etiqueta}? La silla quedará disponible para otra reservación.`)) return;
    try {
      await editar.mutateAsync({ id: reservacion.id, cambios: { sillas_quitar: [sillaId], capturado_por: capturadoPor } });
    } catch (e) {
      avisarError(e);
    }
  };

  const pedirPin = useSupervisor();

  const cambiarTipo = async (sillaId: number, tipo: TipoBoletoFiesta) => {
    // Cambiar adulto ↔ niño cambia el precio cobrado: lo autoriza el supervisor con su contraseña.
    // Convertir una silla ya vendida en cortesía lleva motivo y lo hace un supervisor (sin contraseña, ya inició sesión).
    let cortesiaMotivo: string | undefined;
    if (tipo === 'cortesia') {
      const m = window.prompt('Motivo de la cortesía (obligatorio, mínimo 3 caracteres):');
      if (m === null) return;
      if (m.trim().length < 3) {
        notifications.show({ color: 'red', message: 'Escribe el motivo de la cortesía.' });
        return;
      }
      cortesiaMotivo = m.trim();
    }
    const pin = tipo === 'cortesia' ? '' : await pedirPin('cambiar el tipo de boleto (cambia el precio)');
    if (pin === null) return;
    try {
      await editar.mutateAsync({
        id: reservacion.id,
        cambios: {
          sillas_cambiar_tipo: [{ silla_id: sillaId, tipo }],
          cortesia_motivo: cortesiaMotivo,
          capturado_por: capturadoPor || undefined,
        },
        pin: pin || undefined,
      });
    } catch (e) {
      avisarError(e);
    }
  };

  // Alcance del abono: base = precio de esas sillas, ya pagado = lo que llevan (reparto vigente).
  const idsDestino = destino.map(Number).filter((id) => sillasActivas.some((s) => s.silla_id === id));
  const alcance = idsDestino.length ? sillasActivas.filter((s) => idsDestino.includes(s.silla_id)) : sillasActivas;
  const baseAlcance = alcance.reduce((t, s) => t + s.precio_aplicado, 0);
  const pagadoAlcance = alcance.reduce((t, s) => t + s.pagado, 0);
  const saldoAlcance = Math.max(Math.round((baseAlcance - pagadoAlcance) * 100) / 100, 0);
  const pagosPrevios = idsDestino.length
    ? Math.max(...alcance.map((s) => s.pagos.length))
    : Math.max(0, ...sillasActivas.map((s) => s.pagos.length));
  const sugerencias = sugerirAbonos(baseAlcance, pagadoAlcance, pagosPrevios);
  const montoEscrito = typeof importe === 'number' ? importe : Number(importe);
  // Botón resaltado: el que coincide con el importe escrito; sin importe, el sugerido; con un importe distinto, ninguno.
  const resaltado = (x: { monto: number; sugerido: boolean }) =>
    importe === '' || importe === undefined ? x.sugerido : Math.abs(montoEscrito - x.monto) < 0.005;
  const excedeAlcance = montoEscrito > saldoAlcance + 0.005 && saldoAlcance > 0;

  const numero = (v: number | string) => (typeof v === 'number' ? v : Number(v));
  // El importe de arriba es el TOTAL que paga el cliente; cada forma extra toma su parte y la forma principal
  // se queda con el resto (así no se duplica el monto ni hay que hacer cuentas).
  const totalCobro = numero(importe) || 0;
  const montoOtras = otrasFormas.reduce((t, f) => t + (numero(f.importe) || 0), 0);
  const restoPrincipal = Math.round((totalCobro - montoOtras) * 100) / 100;

  const agregarForma = () =>
    setOtrasFormas((a) => [...a, { id: Date.now() + a.length, importe: '', forma: forma === 'Tarjeta' ? 'Efectivo' : 'Tarjeta', referencia: '' }]);

  const abonar = async () => {
    const total = numero(importe);
    if (!total || total <= 0) {
      notifications.show({ color: 'red', message: 'Captura el importe total del cobro.' });
      return;
    }
    const extras = otrasFormas.filter((f) => numero(f.importe) > 0);
    if (otrasFormas.length !== extras.length) {
      notifications.show({ color: 'red', message: 'Captura cuánto se paga con cada forma adicional (o quítala).' });
      return;
    }
    if (restoPrincipal < -0.005) {
      notifications.show({ color: 'red', message: `Las otras formas suman ${dinero(montoOtras)}, más que el total del cobro (${dinero(total)}).` });
      return;
    }
    guardarCapturista(capturadoPor);
    const base = {
      fecha,
      capturado_por: capturadoPor || undefined,
      silla_ids: idsDestino.length ? idsDestino : undefined,
    };
    const lineas = [
      ...(restoPrincipal > 0.005
        ? [{ ...base, importe: restoPrincipal, forma_pago: forma ?? undefined, referencia: referencia || undefined }]
        : []),
      ...extras.map((f) => ({ ...base, importe: numero(f.importe), forma_pago: f.forma ?? undefined, referencia: f.referencia || undefined })),
    ];
    try {
      if (lineas.length === 1) await agregarPago.mutateAsync({ reservacionId: reservacion.id, pago: lineas[0] });
      else await agregarMultiples.mutateAsync({ reservacionId: reservacion.id, pagos: lineas });
      setImporte('');
      setReferencia('');
      setOtrasFormas([]);
      notifications.show({
        color: 'green',
        message: lineas.length === 1 ? 'Pago registrado.' : `Cobro de ${dinero(total)} registrado en ${lineas.length} formas de pago.`,
      });
    } catch (e) {
      avisarError(e);
    }
  };

  const quitarPago = async (pagoId: number, monto: number) => {
    if (!window.confirm(`¿Cancelar el pago de ${dinero(monto)}? Quedará registrado en la bitácora.`)) return;
    try {
      await cancelarPago.mutateAsync({ pagoId, usuario: capturadoPor || undefined });
    } catch (e) {
      avisarError(e);
    }
  };

  const cancelar = async () => {
    const motivo = window.prompt('Motivo de la cancelación (opcional). Pulsa Cancelar para no cancelar la reservación.');
    if (motivo === null) return;
    // Con dinero cobrado se pregunta qué hacer con él: si no se cancela, sigue contando en Cobros.
    const cancelarPagos =
      reservacion.pagado > 0 &&
      window.confirm(
        `Esta reservación tiene ${dinero(reservacion.pagado)} cobrados.\n\n` +
          'Aceptar = cancelar también sus pagos (desaparecen de Cobros; úsalo en pruebas o si ya se devolvió todo).\n' +
          'Cancelar = conservar los pagos en Cobros hasta cancelarlos uno por uno.',
      );
    try {
      const r = await cancelarReservacion.mutateAsync({
        id: reservacion.id,
        motivo: motivo || undefined,
        usuario: capturadoPor || undefined,
        cancelar_pagos: cancelarPagos,
      });
      notifications.show({
        color: 'orange',
        title: 'Reservación cancelada',
        message:
          r.pagos_cancelados > 0
            ? `Las sillas quedaron libres y se cancelaron ${dinero(r.pagos_cancelados)} en pagos.`
            : r.pagado_sin_devolver > 0
            ? `Las sillas quedaron libres. Hay ${dinero(r.pagado_sin_devolver)} cobrados: registra la devolución en la reservación (sección Devoluciones) cuando se le regrese al cliente.`
            : 'Las sillas quedaron libres.',
      });
      onCerrar();
    } catch (e) {
      avisarError(e);
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Group gap="xs">
          <Badge color={config.color} size="lg">
            {config.etiqueta}
          </Badge>
          {!activa && <Badge color="red">Cancelada</Badge>}
          <Text size="sm" c="dimmed">
            Vendida el {fechaCorta(reservacion.fecha_venta)}
            {reservacion.capturado_por ? ` · capturó ${reservacion.capturado_por}` : ''}
          </Text>
          {reservacion.cortesias_por_autorizar > 0 && (
            <Badge color="yellow" variant="filled" title="Un supervisor debe autorizar estas cortesías; si las rechaza, las sillas se liberan">
              {reservacion.cortesias_por_autorizar} cortesía(s) por autorizar
            </Badge>
          )}
          {reservacion.cortesia.motivo && (
            <Badge color="violet" variant="light" title="Motivo y supervisor que autorizó las cortesías">
              Cortesía: {reservacion.cortesia.motivo}
              {reservacion.cortesia.autorizada_por ? ` · autorizó ${reservacion.cortesia.autorizada_por}` : ''}
            </Badge>
          )}
        </Group>
        <Group gap="xs">
          {activa && <BotonesConfirmacion reservacion={reservacion} nombreEvento={nombreEvento} />}
          {puede('fiesta_auditoria', 1) && (
            <Button variant="default" leftSection={<IconHistory size={16} />} onClick={() => setVerHistorial(true)}>
              Historial
            </Button>
          )}
          <Button
            variant="light"
            leftSection={<IconPrinter size={16} />}
            onClick={() => imprimirRecibo(reservacion, nombreEvento)}
          >
            Imprimir recibo
          </Button>
        </Group>
        <Modal opened={verHistorial} onClose={() => setVerHistorial(false)} title={`Historial · reservación #${reservacion.id}`} size="xl" zIndex={450}>
          {verHistorial && <PanelAuditoria reservacionInicial={reservacion.id} />}
        </Modal>
      </Group>

      {!activa && (
        <Alert color="red" title="Reservación cancelada">
          {reservacion.motivo_cancelacion || 'Sin motivo registrado.'} Sus sillas ya están libres.
          {reservacion.pagado > 0 && ` Tiene ${dinero(reservacion.pagado)} cobrados: cancela cada pago cuando se devuelva.`}
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <TextInput label="Cliente" value={cliente} onChange={(e) => setCliente(e.currentTarget.value)} disabled={!activa} />
        <TextInput
          label="Teléfono o cuarto"
          value={contacto}
          onChange={(e) => setContacto(e.currentTarget.value)}
          disabled={!activa}
        />
        <TextInput
          label="Correo del huésped"
          type="email"
          placeholder="nombre@correo.com"
          value={correo}
          onChange={(e) => setCorreo(e.currentTarget.value)}
          disabled={!activa}
        />
      </SimpleGrid>
      {activa && <PreventaAutorizacion reservacion={reservacion} capturadoPor={capturadoPor} onError={avisarError} />}
      <Textarea label="Notas" value={notas} onChange={(e) => setNotas(e.currentTarget.value)} minRows={2} autosize disabled={!activa} />
      {activa && datosCambiaron && (
        <Group justify="flex-end">
          <Button onClick={guardarDatos} loading={editar.isPending}>
            Guardar datos
          </Button>
        </Group>
      )}

      <Divider label="Boletos" labelPosition="left" />
      <Text size="xs" c="dimmed">
        Cada abono se reparte entre las sillas elegidas. Pulsa un pago para corregir lo de esa silla; marca sillas
        para pasarlas a otra mesa.
      </Text>
      <Table.ScrollContainer minWidth={900}>
      <Table withTableBorder>
        <Table.Thead>
          <Table.Tr>
            {activa && <Table.Th w={32} />}
            <Table.Th>Mesa</Table.Th>
            <Table.Th>Silla</Table.Th>
            <Table.Th>Tipo</Table.Th>
            <Table.Th ta="right">Precio</Table.Th>
            <Table.Th>Pago 1</Table.Th>
            <Table.Th>Pago 2</Table.Th>
            <Table.Th>Pago 3</Table.Th>
            <Table.Th ta="right">Pagado</Table.Th>
            <Table.Th ta="right">Saldo</Table.Th>
            <Table.Th>Estado</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sillasActivas.map((s) => (
            <Table.Tr key={s.silla_id}>
              {activa && (
                <Table.Td>
                  <Checkbox
                    size="xs"
                    aria-label={`Marcar silla ${s.silla} para transferir`}
                    checked={paraTransferir.includes(s.silla_id)}
                    onChange={(e) =>
                      setParaTransferir((a) => (e.currentTarget.checked ? [...a, s.silla_id] : a.filter((x) => x !== s.silla_id)))
                    }
                  />
                </Table.Td>
              )}
              <Table.Td>{s.mesa}</Table.Td>
              <Table.Td>{s.silla}</Table.Td>
              <Table.Td>
                {activa ? (
                  <Select comboboxProps={{ zIndex: 400 }}
                    size="xs"
                    w={110}
                    data={TIPOS_BOLETO}
                    value={s.tipo}
                    allowDeselect={false}
                    aria-label="Tipo de boleto"
                    disabled={editar.isPending}
                    onChange={(v) => v && v !== s.tipo && cambiarTipo(s.silla_id, v as TipoBoletoFiesta)}
                  />
                ) : (
                  ETIQUETA_TIPO[s.tipo]
                )}
                {s.preventa && (
                  <Badge ml="xs" size="xs" variant="light">
                    preventa
                  </Badge>
                )}
              </Table.Td>
              <CeldaPrecioSilla reservacionId={reservacion.id} silla={s} editable={activa} capturadoPor={capturadoPor} onError={avisarError} />
              {[0, 1, 2].map((k) => (
                <CeldaPagoSilla
                  key={k}
                  silla={s}
                  indice={k}
                  editable={activa}
                  capturadoPor={capturadoPor}
                  onAbonar={() => {
                    setDestino([String(s.silla_id)]);
                    abonoRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                  }}
                  onError={avisarError}
                />
              ))}
              <Table.Td ta="right">{dinero(s.pagado)}</Table.Td>
              <Table.Td ta="right" c={s.saldo > 0 ? 'red' : undefined} fw={s.saldo > 0 ? 600 : undefined}>
                {dinero(s.saldo)}
              </Table.Td>
              <Table.Td>
                {s.estado_pago && (
                  <Badge variant="light" size="sm" color={ESTADO_SILLA_CONFIG[s.estado_pago].mantine}>
                    {s.por_autorizar
                      ? 'Cortesía por autorizar'
                      : s.estado_pago === 'pagada' ? 'Pagada' : s.estado_pago === 'anticipo' ? 'Anticipo' : s.estado_pago === 'sin_pago' ? 'Sin pago' : 'Cortesía'}
                  </Badge>
                )}
              </Table.Td>
              <Table.Td ta="right">
                {activa && sillasActivas.length > 1 && (
                  <Tooltip label="Liberar esta silla">
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label="Liberar silla"
                      onClick={() => quitarSilla(s.silla_id, `la silla ${s.silla} de la mesa ${s.mesa}`)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      </Table.ScrollContainer>

      {activa && paraTransferir.length > 0 && (
        <TransferirSillas
          reservacion={reservacion}
          seleccion={paraTransferir}
          capturadoPor={capturadoPor}
          onError={avisarError}
          onListo={() => setParaTransferir([])}
          onCancelar={() => setParaTransferir([])}
        />
      )}
      {activa && (
        <AgregarSillas reservacion={reservacion} capturadoPor={capturadoPor} onError={avisarError} />
      )}
      {activa && <CombinarReservacion reservacion={reservacion} capturadoPor={capturadoPor} onError={avisarError} />}

      <SimpleGrid cols={{ base: 1, xs: 3 }}>
        <Stat etiqueta="Importe total" valor={dinero(reservacion.importe)} />
        <Stat etiqueta="Pagado" valor={dinero(reservacion.pagado)} color="green" />
        <Stat
          etiqueta={reservacion.excedente > 0 ? 'Saldo a favor del cliente' : 'Saldo pendiente'}
          valor={dinero(reservacion.excedente > 0 ? reservacion.excedente : reservacion.saldo)}
          color={reservacion.saldo > 0 ? 'red' : undefined}
        />
      </SimpleGrid>

      <Divider label="Pagos" labelPosition="left" />
      {reservacion.pagos.length === 0 ? (
        <Text size="sm" c="dimmed">
          Todavía no hay pagos.
        </Text>
      ) : (
        <Table withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Fecha</Table.Th>
              <Table.Th>Forma</Table.Th>
              <Table.Th>Referencia</Table.Th>
              <Table.Th>Sillas</Table.Th>
              <Table.Th>Capturó</Table.Th>
              <Table.Th ta="right">Importe</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {reservacion.pagos.map((p) => (
              <FilaPago
                key={p.id}
                pago={p}
                etiquetaSillas={
                  p.silla_ids.length === 0
                    ? 'Todas'
                    : reservacion.sillas
                        .filter((s) => p.silla_ids.includes(s.silla_id))
                        .map((s) => `M${s.mesa}·S${s.silla}`)
                        .join(', ') || 'Todas'
                }
                editable={activa}
                capturadoPor={capturadoPor}
                onCancelar={() => quitarPago(p.id, p.importe)}
                onError={avisarError}
              />
            ))}
          </Table.Tbody>
        </Table>
      )}

      {activa && (
        <Stack gap="xs" ref={abonoRef}>
          <Text fw={600} size="sm">
            Registrar abono
          </Text>
          <Group gap={6}>
            <Text size="xs" c="dimmed">
              Aplicar a:
            </Text>
            <Chip size="xs" checked={destino.length === 0} onChange={() => setDestino([])} variant="light">
              Toda la reservación
            </Chip>
            <Chip.Group multiple value={destino} onChange={setDestino}>
              {sillasActivas.map((s) => (
                <Chip key={s.silla_id} size="xs" value={String(s.silla_id)} variant="light">
                  M{s.mesa} · S{s.silla}
                  {s.saldo <= 0.005 ? ' ✓' : ''}
                </Chip>
              ))}
            </Chip.Group>
          </Group>
          {sugerencias.length > 0 && (
            <Group gap={6} align="center">
              <Text size="xs" c="dimmed">
                Sugerido (sobre {dinero(baseAlcance)}, ya pagado {dinero(pagadoAlcance)}):
              </Text>
              {sugerencias.map((x) => (
                <Button
                  key={x.pct}
                  size="compact-xs"
                  variant={resaltado(x) ? 'filled' : 'light'}
                  onClick={() => setImporte(x.monto)}
                  title={x.completa ? 'Deja pagado el 100 %' : `Con este abono llegan al ${x.pct} %`}
                >
                  {x.completa && pagadoAlcance > 0 ? 'Completar' : `${x.pct} %`} · {dinero(x.monto)}
                </Button>
              ))}
            </Group>
          )}
          {montoEscrito > 0 && alcance.length > 1 && (
            <Text size="xs" c="dimmed">
              Se repartirá entre {alcance.filter((x) => x.saldo > 0.005).length} sillas (≈{' '}
              {dinero(Math.min(montoEscrito, saldoAlcance) / Math.max(alcance.filter((x) => x.saldo > 0.005).length, 1))}{' '}
              c/u, según lo que le falta a cada una).
            </Text>
          )}
          {excedeAlcance && (
            <Text size="xs" c="orange">
              El importe supera lo que falta de lo elegido ({dinero(saldoAlcance)}): el sobrante se reparte en las
              demás sillas.
            </Text>
          )}
          <SimpleGrid cols={{ base: 1, sm: 2, md: 5 }}>
            <NumberInput
              label={otrasFormas.length > 0 ? 'Importe total del cobro' : 'Importe'}
              value={importe}
              onChange={setImporte}
              min={0}
              decimalScale={2}
              prefix="$"
              thousandSeparator=","
              placeholder={reservacion.saldo > 0 ? dinero(reservacion.saldo) : undefined}
            />
            <TextInput label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.currentTarget.value)} />
            <Select
              comboboxProps={{ zIndex: 400 }}
              label={otrasFormas.length > 0 ? 'Forma de pago (el resto)' : 'Forma de pago'}
              description={otrasFormas.length > 0 ? `${forma ?? 'Esta forma'}: ${dinero(Math.max(restoPrincipal, 0))}` : undefined}
              data={FORMAS_PAGO}
              value={forma}
              onChange={setForma}
            />
            <TextInput label="Referencia" value={referencia} onChange={(e) => setReferencia(e.currentTarget.value)} />
            <TextInput label="Capturó" value={capturadoPor} onChange={(e) => setCapturadoPor(e.currentTarget.value)} />
          </SimpleGrid>
          {otrasFormas.map((f) => (
            <SimpleGrid key={f.id} cols={{ base: 1, sm: 2, md: 5 }} style={{ alignItems: 'end' }}>
              <NumberInput
                label={`Cuánto con ${f.forma ?? 'esta forma'}`}
                value={f.importe}
                onChange={(v) => setOtrasFormas((a) => a.map((x) => (x.id === f.id ? { ...x, importe: v } : x)))}
                min={0}
                decimalScale={2}
                prefix="$"
                thousandSeparator=","
              />
              <Select
                comboboxProps={{ zIndex: 400 }}
                label="Forma de pago"
                data={FORMAS_PAGO}
                value={f.forma}
                onChange={(v) => setOtrasFormas((a) => a.map((x) => (x.id === f.id ? { ...x, forma: v } : x)))}
              />
              <TextInput
                label="Referencia"
                value={f.referencia}
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  setOtrasFormas((a) => a.map((x) => (x.id === f.id ? { ...x, referencia: v } : x)));
                }}
              />
              <span />
              <Button variant="subtle" color="red" size="xs" leftSection={<IconX size={14} />} onClick={() => setOtrasFormas((a) => a.filter((x) => x.id !== f.id))}>
                Quitar esta forma
              </Button>
            </SimpleGrid>
          ))}
          <Group justify="space-between" align="center">
            <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={agregarForma}>
              Pagar con otra forma de pago
            </Button>
            {otrasFormas.length > 0 && (
              <Text size="sm" fw={600} c={restoPrincipal < -0.005 ? 'red' : undefined}>
                {restoPrincipal < -0.005
                  ? `Las otras formas pasan del total por ${dinero(-restoPrincipal)}`
                  : `${[
                      restoPrincipal > 0.005 ? `${forma ?? 'Principal'} ${dinero(restoPrincipal)}` : null,
                      ...otrasFormas.map((f) => `${f.forma ?? 'Otra'} ${dinero(numero(f.importe) || 0)}`),
                    ]
                      .filter(Boolean)
                      .join(' + ')} = ${dinero(totalCobro)}`}
              </Text>
            )}
          </Group>
          <Group justify="space-between">
            {reservacion.saldo > 0 ? (
              <Button variant="subtle" size="xs" onClick={() => setImporte(reservacion.saldo)}>
                Usar el saldo ({dinero(reservacion.saldo)})
              </Button>
            ) : (
              <span />
            )}
            <Button leftSection={<IconPlus size={16} />} onClick={abonar} loading={agregarPago.isPending || agregarMultiples.isPending}>
              Registrar pago
            </Button>
          </Group>
        </Stack>
      )}

      {(reservacion.por_devolver > 0 || reservacion.devoluciones.length > 0) && (
        <SeccionDevoluciones reservacion={reservacion} capturadoPor={capturadoPor} onError={avisarError} />
      )}

      {activa && (
        <>
          <Divider />
          <Group justify="flex-end">
            <Button color="red" variant="outline" onClick={cancelar} loading={cancelarReservacion.isPending}>
              Cancelar reservación
            </Button>
          </Group>
        </>
      )}
    </Stack>
  );
}

/** Fila de la tabla de pagos con edición en línea (importe, fecha, forma y referencia). */
function FilaPago({
  pago,
  etiquetaSillas,
  editable,
  capturadoPor,
  onCancelar,
  onError,
}: {
  pago: FiestaReservacion['pagos'][number];
  etiquetaSillas: string;
  editable: boolean;
  capturadoPor: string;
  onCancelar: () => void;
  onError: (e: unknown) => void;
}) {
  const editarPago = useFiestaEditarPago();
  const [editando, setEditando] = useState(false);
  const [importe, setImporte] = useState<number | string>(pago.importe);
  const [fecha, setFecha] = useState(pago.fecha);
  const [forma, setForma] = useState<string | null>(pago.forma_pago || null);
  const [referencia, setReferencia] = useState(pago.referencia);

  const empezar = () => {
    setImporte(pago.importe);
    setFecha(pago.fecha);
    setForma(pago.forma_pago || null);
    setReferencia(pago.referencia);
    setEditando(true);
  };

  const guardar = async () => {
    const monto = typeof importe === 'number' ? importe : Number(importe);
    if (!monto || monto <= 0) {
      notifications.show({ color: 'red', message: 'Captura un importe mayor a cero.' });
      return;
    }
    const pin = '';
    try {
      await editarPago.mutateAsync({
        pin: pin || undefined,
        pagoId: pago.id,
        cambios: {
          importe: monto,
          fecha,
          forma_pago: forma ?? '',
          referencia,
          capturado_por: capturadoPor || undefined,
        },
      });
      setEditando(false);
      notifications.show({ color: 'green', message: 'Pago actualizado.' });
    } catch (e) {
      onError(e);
    }
  };

  if (editando) {
    return (
      <Table.Tr>
        <Table.Td>
          <TextInput size="xs" type="date" value={fecha} onChange={(e) => setFecha(e.currentTarget.value)} />
        </Table.Td>
        <Table.Td>
          <Select comboboxProps={{ zIndex: 400 }} size="xs" data={FORMAS_PAGO} value={forma} onChange={setForma} clearable />
        </Table.Td>
        <Table.Td>
          <TextInput size="xs" value={referencia} onChange={(e) => setReferencia(e.currentTarget.value)} />
        </Table.Td>
        <Table.Td>{etiquetaSillas}</Table.Td>
        <Table.Td>{pago.capturado_por || '—'}</Table.Td>
        <Table.Td>
          <NumberInput
            size="xs"
            value={importe}
            onChange={setImporte}
            min={0}
            decimalScale={2}
            prefix="$"
            thousandSeparator=","
          />
        </Table.Td>
        <Table.Td ta="right">
          <Group gap={2} justify="flex-end" wrap="nowrap">
            <Tooltip label="Guardar cambios">
              <ActionIcon variant="subtle" color="green" aria-label="Guardar pago" onClick={guardar} loading={editarPago.isPending}>
                <IconCheck size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Descartar">
              <ActionIcon variant="subtle" color="gray" aria-label="Descartar cambios" onClick={() => setEditando(false)}>
                <IconX size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Table.Td>
      </Table.Tr>
    );
  }

  return (
    <Table.Tr style={pago.cancelado ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}>
      <Table.Td>{fechaCorta(pago.fecha)}</Table.Td>
      <Table.Td>{pago.forma_pago || '—'}</Table.Td>
      <Table.Td>{pago.referencia || '—'}</Table.Td>
      <Table.Td>{etiquetaSillas}</Table.Td>
      <Table.Td>{pago.capturado_por || '—'}</Table.Td>
      <Table.Td ta="right">{dinero(pago.importe)}</Table.Td>
      <Table.Td ta="right">
        {!pago.cancelado && (
          <Group gap={2} justify="flex-end" wrap="nowrap">
            {editable && (
              <Tooltip label="Editar este pago ">
                <ActionIcon variant="subtle" aria-label="Editar pago" onClick={empezar}>
                  <IconPencil size={16} />
                </ActionIcon>
              </Tooltip>
            )}
            <Tooltip label="Cancelar este pago">
              <ActionIcon variant="subtle" color="red" aria-label="Cancelar pago" onClick={onCancelar}>
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}
      </Table.Td>
    </Table.Tr>
  );
}

/** Etiqueta corta de las sillas de una reservación: "M93: 1, 2, 3". */
function resumenSillas(r: FiestaReservacion): string {
  const porMesa = new Map<number, number[]>();
  r.sillas.filter((s) => s.activa).forEach((s) => porMesa.set(s.mesa, [...(porMesa.get(s.mesa) ?? []), s.silla]));
  return [...porMesa.entries()].map(([m, ss]) => `M${m}: ${ss.sort((a, b) => a - b).join(', ')}`).join(' · ');
}

const normalizarNombre = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Junta otra reservación (sillas y pagos) en ésta; sugiere primero las del mismo cliente. */
function CombinarReservacion({
  reservacion,
  capturadoPor,
  onError,
}: {
  reservacion: FiestaReservacion;
  capturadoPor: string;
  onError: (e: unknown) => void;
}) {
  const { data } = useFiestaReservaciones();
  const fusionar = useFiestaFusionarReservaciones();
  const [abierto, setAbierto] = useState(false);
  const [origen, setOrigen] = useState<string | null>(null);

  const otras = (data?.reservaciones ?? []).filter((r) => r.estatus === 'activa' && r.id !== reservacion.id);
  // Solo se sugiere juntar si es el mismo cliente EN LA MISMA MESA (en mesas distintas son reservaciones independientes).
  const mesasDeEsta = new Set(reservacion.sillas.filter((s) => s.activa).map((s) => s.mesa));
  const mismoCliente = otras.filter(
    (r) =>
      normalizarNombre(r.cliente) === normalizarNombre(reservacion.cliente) &&
      r.sillas.some((s) => s.activa && mesasDeEsta.has(s.mesa)),
  );
  const elegida = otras.find((r) => String(r.id) === origen);

  const combinar = async () => {
    if (!elegida) return;
    if (
      !window.confirm(
        `Se pasarán a la reservación #${reservacion.id} las sillas (${resumenSillas(elegida)}) y ${dinero(elegida.pagado)} en pagos de la reservación #${elegida.id}.\n` +
          `La #${elegida.id} quedará cancelada como "fusionada". ¿Continuar?`,
      )
    )
      return;
    try {
      await fusionar.mutateAsync({ id: reservacion.id, origenId: elegida.id, capturadoPor: capturadoPor || undefined });
      notifications.show({ color: 'green', message: `Reservación #${elegida.id} combinada en la #${reservacion.id}.` });
      setOrigen(null);
      setAbierto(false);
    } catch (e) {
      onError(e);
    }
  };

  if (mismoCliente.length > 0 && !abierto) {
    return (
      <Alert color="violet" title="Hay otra reservación de este cliente">
        <Stack gap={4}>
          {mismoCliente.map((r) => (
            <Group key={r.id} justify="space-between" wrap="nowrap">
              <Text size="sm">
                #{r.id} · {resumenSillas(r)} · {dinero(r.importe)}
              </Text>
              <Button
                size="compact-xs"
                variant="light"
                color="violet"
                onClick={() => {
                  setOrigen(String(r.id));
                  setAbierto(true);
                }}
              >
                Combinar aquí
              </Button>
            </Group>
          ))}
        </Stack>
      </Alert>
    );
  }

  if (!abierto) {
    return (
      <Group>
        <Button variant="subtle" size="xs" onClick={() => setAbierto(true)}>
          Combinar con otra reservación
        </Button>
      </Group>
    );
  }

  const ordenadas = [...mismoCliente, ...otras.filter((r) => !mismoCliente.includes(r))];
  return (
    <Stack gap="xs" p="sm" style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
      <Group justify="space-between">
        <Text fw={600} size="sm">
          Combinar otra reservación en ésta
        </Text>
        <Button variant="subtle" size="xs" color="gray" onClick={() => setAbierto(false)}>
          Cerrar
        </Button>
      </Group>
      <Select
        comboboxProps={{ zIndex: 400 }}
        label="Reservación a juntar"
        placeholder="Busca por cliente o mesa"
        searchable
        value={origen}
        onChange={setOrigen}
        data={ordenadas.map((r) => ({
          value: String(r.id),
          label: `#${r.id} · ${r.cliente} · ${resumenSillas(r)} · ${dinero(r.importe)}`,
        }))}
      />
      {elegida && (
        <Group justify="flex-end">
          <Button size="xs" onClick={combinar} loading={fusionar.isPending}>
            Combinar #{elegida.id} en #{reservacion.id}
          </Button>
        </Group>
      )}
    </Stack>
  );
}

/** Precio de una silla: lo puede corregir solo la cuenta superior (pide el PIN de supervisor y un motivo). */
function CeldaPrecioSilla({
  reservacionId,
  silla,
  editable,
  capturadoPor,
  onError,
}: {
  reservacionId: number;
  silla: FiestaReservacion['sillas'][number];
  editable: boolean;
  capturadoPor: string;
  onError: (e: unknown) => void;
}) {
  const editar = useFiestaEditarReservacion();
  const pedirPin = useSupervisor();
  const [abierto, setAbierto] = useState(false);
  const [precio, setPrecio] = useState<number | string>('');
  const [motivo, setMotivo] = useState('');

  if (!editable) return <Table.Td ta="right">{dinero(silla.precio_aplicado)}</Table.Td>;

  const guardar = async () => {
    const nuevo = typeof precio === 'number' ? precio : Number(precio);
    if (!Number.isFinite(nuevo) || nuevo < 0) {
      notifications.show({ color: 'red', message: 'Captura un precio válido.' });
      return;
    }
    if (motivo.trim().length < 3) {
      notifications.show({ color: 'red', message: 'Indica el motivo del cambio de precio.' });
      return;
    }
    const pin = await pedirPin('cambiar el precio de una silla');
    if (pin === null) return;
    try {
      await editar.mutateAsync({
        id: reservacionId,
        cambios: {
          sillas_cambiar_precio: [{ silla_id: silla.silla_id, precio: nuevo, motivo: motivo.trim() }],
          capturado_por: capturadoPor || undefined,
        },
        pin: pin || undefined,
      });
      notifications.show({ color: 'green', message: 'Precio actualizado.' });
      setAbierto(false);
    } catch (e) {
      onError(e);
    }
  };

  return (
    <Table.Td ta="right">
      <Popover opened={abierto} onChange={setAbierto} position="bottom" withArrow shadow="md" zIndex={400} trapFocus>
        <Popover.Target>
          <UnstyledButton
            title="Cambiar el precio (solo supervisor)"
            onClick={() => {
              setPrecio(silla.precio_aplicado);
              setMotivo('');
              setAbierto((v) => !v);
            }}
            style={{ borderRadius: 6, padding: '2px 6px', border: '1px dashed var(--mantine-color-gray-4)' }}
          >
            {dinero(silla.precio_aplicado)}
          </UnstyledButton>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs" w={230}>
            <Text size="xs" fw={600}>
              Silla {silla.silla}: precio 
            </Text>
            <NumberInput size="xs" value={precio} onChange={setPrecio} min={0} decimalScale={2} prefix="$" thousandSeparator="," data-autofocus />
            <TextInput size="xs" label="Motivo" placeholder="Ej. error de captura" value={motivo} onChange={(e) => setMotivo(e.currentTarget.value)} />
            <Group justify="flex-end" gap="xs">
              <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setAbierto(false)}>
                Cancelar
              </Button>
              <Button size="compact-xs" onClick={guardar} loading={editar.isPending}>
                Guardar
              </Button>
            </Group>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Table.Td>
  );
}

/** Una celda Pago 1/2/3 de una silla: muestra la porción y deja corregirla (solo esa silla). */
function CeldaPagoSilla({
  silla,
  indice,
  editable,
  capturadoPor,
  onAbonar,
  onError,
}: {
  silla: FiestaReservacion['sillas'][number];
  indice: number;
  editable: boolean;
  capturadoPor: string;
  onAbonar: () => void;
  onError: (e: unknown) => void;
}) {
  const editarPagoSilla = useFiestaEditarPagoSilla();
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState<number | string>('');
  // Los hooks van SIEMPRE antes de cualquier return condicional (si no, al llegar el primer pago React falla y la pantalla queda en blanco).
  const [montosParte, setMontosParte] = useState<Record<number, number | string>>({});
  const p = silla.pagos[indice];
  // Si una silla recibió más de 3 porciones, lo que sobra se junta en la 3ª columna ("+N").
  const extra = indice === 2 ? silla.pagos.length - 3 : 0;

  if (!p) {
    // Primer hueco libre: invita a abonar a esa silla (si aún debe).
    const primerHueco = indice === silla.pagos.length && silla.saldo > 0.005 && editable;
    return (
      <Table.Td>
        {primerHueco ? (
          <Button size="compact-xs" variant="subtle" leftSection={<IconPlus size={12} />} onClick={onAbonar}>
            Abonar
          </Button>
        ) : (
          <Text size="sm" c="dimmed">
            —
          </Text>
        )}
      </Table.Td>
    );
  }

  const partes = p.partes ?? [];
  const variasFormas = partes.length > 1;
  const resumenFormas = variasFormas ? partes.map((x) => `${x.forma_pago || 's/forma'} ${dinero(x.importe)}`).join(' · ') : '';

  const guardar = async (importe: number, pagoId: number = p.pago_id) => {
    // Corregir un pago lo puede hacer la cajera; queda registrado con su usuario.
    const pin = '';
    try {
      await editarPagoSilla.mutateAsync({
        pagoId,
        sillaId: silla.silla_id,
        importe,
        capturadoPor: capturadoPor || undefined,
        pin: pin || undefined,
      });
      setAbierto(false);
      notifications.show({ color: 'green', message: 'Pago corregido.' });
    } catch (e) {
      onError(e);
    }
  };

  const contenido = (
    <>
      <Text size="sm">
        {dinero(p.importe)}
        {extra > 0 ? ` +${extra}` : ''}
      </Text>
      <Text size="xs" c="dimmed">
        {fechaCorta(p.fecha)}
      </Text>
      {variasFormas && (
        <Text size="xs" c="dimmed" lh={1.2}>
          {partes.map((x) => `${x.forma_pago || 's/forma'} ${dinero(x.importe)}`).join(' + ')}
        </Text>
      )}
    </>
  );
  if (!editable) return <Table.Td title={[p.referencia ? `Ref. ${p.referencia}` : '', resumenFormas].filter(Boolean).join(' · ') || undefined}>{contenido}</Table.Td>;

  return (
    <Table.Td title={[p.referencia ? `Ref. ${p.referencia}` : 'Clic para corregir el monto de esta silla ', resumenFormas].filter(Boolean).join(' · ')}>
      <Popover opened={abierto} onChange={setAbierto} position="bottom" withArrow shadow="md" zIndex={400} trapFocus>
        <Popover.Target>
          <UnstyledButton
            onClick={() => {
              setMonto(p.importe);
              setMontosParte(Object.fromEntries(partes.map((x) => [x.pago_id, x.importe])));
              setAbierto((v) => !v);
            }}
            style={{ textAlign: 'left', borderRadius: 6, padding: '2px 4px', border: '1px dashed var(--mantine-color-gray-4)' }}
          >
            {contenido}
          </UnstyledButton>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs" w={200}>
            <Text size="xs" fw={600}>
              Silla {silla.silla}: monto de este pago
            </Text>
            {variasFormas ? (
              <>
                {partes.map((x) => (
                  <NumberInput
                    key={x.pago_id}
                    size="xs"
                    label={x.forma_pago || 'Sin forma'}
                    value={montosParte[x.pago_id] ?? ''}
                    onChange={(v) => setMontosParte((m) => ({ ...m, [x.pago_id]: v }))}
                    min={0}
                    decimalScale={2}
                    prefix="$"
                    thousandSeparator=","
                  />
                ))}
                <Group justify="flex-end" gap="xs">
                  <Button
                    size="compact-xs"
                    loading={editarPagoSilla.isPending}
                    onClick={async () => {
                      // Se corrige cada forma que cambió (queda registrado con tu usuario).
                      for (const x of partes) {
                        const nuevo = Number(montosParte[x.pago_id] ?? x.importe);
                        if (Math.abs(nuevo - x.importe) > 0.004) await guardar(nuevo, x.pago_id);
                      }
                    }}
                  >
                    Guardar
                  </Button>
                </Group>
              </>
            ) : (
              <>
                <NumberInput size="xs" value={monto} onChange={setMonto} min={0} decimalScale={2} prefix="$" thousandSeparator="," data-autofocus />
                <Group justify="space-between" gap="xs">
                  <Button size="compact-xs" color="red" variant="subtle" onClick={() => guardar(0)} loading={editarPagoSilla.isPending}>
                    Quitar
                  </Button>
                  <Button size="compact-xs" onClick={() => guardar(typeof monto === 'number' ? monto : Number(monto))} loading={editarPagoSilla.isPending}>
                    Guardar
                  </Button>
                </Group>
              </>
            )}
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Table.Td>
  );
}

/** Autoriza (o revoca) el precio de preventa de esta reservación después del corte; queda quién y por qué. */
function PreventaAutorizacion({
  reservacion,
  capturadoPor,
  onError,
}: {
  reservacion: FiestaReservacion;
  capturadoPor: string;
  onError: (e: unknown) => void;
}) {
  const editar = useFiestaEditarReservacion();
  const pedirPin = useSupervisor();
  const [abierto, setAbierto] = useState(false);
  const [por, setPor] = useState('');
  const [motivo, setMotivo] = useState('');
  const auth = reservacion.preventa_autorizada;
  const hayPorAutorizar = reservacion.sillas.some((s) => s.activa && s.tipo !== 'cortesia' && !s.preventa);

  const autorizar = async () => {
    if (por.trim().length < 3 || motivo.trim().length < 3) {
      notifications.show({ color: 'red', message: 'Indica quién lo autoriza y el motivo.' });
      return;
    }
    const pin = await pedirPin('respetar el precio de preventa');
    if (pin === null) return;
    try {
      await editar.mutateAsync({
        id: reservacion.id,
        cambios: { preventa_autorizada: { por: por.trim(), motivo: motivo.trim() } },
        pin: pin || undefined,
      });
      notifications.show({ color: 'green', message: 'Precio de preventa autorizado: las sillas se repreciaron.' });
      setAbierto(false);
    } catch (e) {
      onError(e);
    }
  };

  const revocar = async () => {
    if (!window.confirm('¿Quitar la autorización? Las sillas vuelven al precio que corresponde por la fecha de venta.')) return;
    const pin = await pedirPin('quitar la autorización de preventa');
    if (pin === null) return;
    try {
      await editar.mutateAsync({
        id: reservacion.id,
        cambios: { quitar_preventa: true, capturado_por: capturadoPor || undefined },
        pin: pin || undefined,
      });
    } catch (e) {
      onError(e);
    }
  };

  if (auth.activa) {
    return (
      <Alert color="violet" title="Precio de preventa autorizado">
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm">
            Por <b>{auth.por}</b> — {auth.motivo}. Las sillas que se agreguen también se cobran a preventa.
          </Text>
          <Button size="compact-xs" variant="subtle" color="red" onClick={revocar} loading={editar.isPending}>
            Quitar
          </Button>
        </Group>
      </Alert>
    );
  }
  if (!hayPorAutorizar) return null;
  if (!abierto) {
    return (
      <Group>
        <Button variant="subtle" size="xs" onClick={() => setAbierto(true)}>
          Respetar precio de preventa…
        </Button>
      </Group>
    );
  }
  return (
    <Stack gap="xs" p="sm" style={{ border: '1px solid var(--mantine-color-violet-3)', borderRadius: 8 }}>
      <Text fw={600} size="sm">
        Respetar el precio de preventa (requiere autorización)
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput label="Autorizado por" required value={por} onChange={(e) => setPor(e.currentTarget.value)} />
        <TextInput label="Motivo" required value={motivo} onChange={(e) => setMotivo(e.currentTarget.value)} />
      </SimpleGrid>
      <Group justify="flex-end">
        <Button variant="subtle" color="gray" size="xs" onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
        <Button size="xs" onClick={autorizar} loading={editar.isPending}>
          Autorizar y repreciar
        </Button>
      </Group>
    </Stack>
  );
}

/** Pasa las sillas marcadas a otra mesa (a sus primeras sillas libres); conservan tipo, precio y pagos. */
function TransferirSillas({
  reservacion,
  seleccion,
  capturadoPor,
  onError,
  onListo,
  onCancelar,
}: {
  reservacion: FiestaReservacion;
  seleccion: number[];
  capturadoPor: string;
  onError: (e: unknown) => void;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const { data } = useFiestaMesas();
  const transferir = useFiestaTransferirSillas();
  const [mesa, setMesa] = useState<string | null>(null);
  const mesas = (data?.mesas ?? []).slice().sort((a, b) => a.numero - b.numero);
  const destino = mesas.find((m) => String(m.numero) === mesa);

  const confirmar = async () => {
    if (!destino) return;
    try {
      await transferir.mutateAsync({ id: reservacion.id, mesaDestino: destino.numero, sillas: seleccion, capturadoPor: capturadoPor || undefined });
      notifications.show({ color: 'green', message: `${seleccion.length} silla(s) pasaron a la mesa ${destino.numero}.` });
      onListo();
    } catch (e) {
      onError(e);
    }
  };

  return (
    <Stack gap="xs" p="sm" style={{ border: '1px solid var(--mantine-color-blue-3)', borderRadius: 8 }}>
      <Group justify="space-between">
        <Text fw={600} size="sm">
          <IconArrowsExchange size={16} style={{ verticalAlign: 'middle' }} /> Transferir {seleccion.length}{' '}
          {seleccion.length === 1 ? 'silla' : 'sillas'} a otra mesa
        </Text>
        <Button variant="subtle" size="xs" color="gray" onClick={onCancelar}>
          Cancelar
        </Button>
      </Group>
      <Select
        comboboxProps={{ zIndex: 400 }}
        label="Mesa destino"
        placeholder="Elige una mesa con lugar"
        searchable
        value={mesa}
        onChange={setMesa}
        data={mesas.map((m) => ({
          value: String(m.numero),
          label: `Mesa ${m.numero} · ${m.libres} libres`,
          disabled: m.libres < seleccion.length,
        }))}
      />
      {destino && (
        <Text size="xs" c="dimmed">
          Pasarán a las primeras sillas libres de la mesa {destino.numero}: el tipo, el precio y lo ya pagado viajan con cada silla.
        </Text>
      )}
      <Group justify="flex-end">
        <Button size="xs" onClick={confirmar} disabled={!destino} loading={transferir.isPending}>
          Transferir
        </Button>
      </Group>
    </Stack>
  );
}

/** Agrega sillas libres (incluidas las extra 11-12) a una reservación ya registrada. */
function AgregarSillas({
  reservacion,
  capturadoPor,
  onError,
}: {
  reservacion: FiestaReservacion;
  capturadoPor: string;
  onError: (e: unknown) => void;
}) {
  const editar = useFiestaEditarReservacion();
  const { data } = useFiestaMesas();
  const [motivoCortesia, setMotivoCortesia] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [mesaNumero, setMesaNumero] = useState<string | null>(null);
  const [elegidas, setElegidas] = useState<Record<number, TipoBoletoFiesta>>({});

  const mesas = data?.mesas ?? [];
  const mesa = mesas.find((m) => String(m.numero) === mesaNumero);
  const libres = mesa?.sillas.filter((s) => s.estado === 'libre') ?? [];
  const seleccion = Object.entries(elegidas)
    .filter(([id]) => libres.some((s) => s.id === Number(id)))
    .map(([id, tipo]) => ({ silla_id: Number(id), tipo }));

  const hayCortesia = seleccion.some((s) => s.tipo === 'cortesia');

  const agregar = async () => {
    if (seleccion.length === 0) return;
    if (hayCortesia && motivoCortesia.trim().length < 3) {
      notifications.show({ color: 'red', message: 'Escribe el motivo de la cortesía.' });
      return;
    }
    try {
      // Las cortesías no piden contraseña: se apartan y se avisa a un supervisor.
      const nueva = await editar.mutateAsync({
        id: reservacion.id,
        cambios: {
          sillas_agregar: seleccion,
          cortesia_motivo: hayCortesia ? motivoCortesia.trim() : undefined,
          capturado_por: capturadoPor || undefined,
        },
      });
      notifications.show(
        nueva.cortesias_por_autorizar > reservacion.cortesias_por_autorizar
          ? { color: 'yellow', message: `${seleccion.length} silla(s) agregada(s). Las cortesías quedaron por autorizar: ya se avisó a un supervisor.`, autoClose: 9000 }
          : { color: 'green', message: `${seleccion.length} silla(s) agregada(s).` },
      );
      setElegidas({});
      setMotivoCortesia('');
    } catch (e) {
      onError(e);
    }
  };

  if (!abierto) {
    return (
      <Group>
        <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={() => setAbierto(true)}>
          Agregar sillas
        </Button>
      </Group>
    );
  }

  return (
    <Stack gap="xs" p="sm" style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}>
      <Group justify="space-between">
        <Text fw={600} size="sm">
          Agregar sillas a esta reservación
        </Text>
        <Button variant="subtle" size="xs" color="gray" onClick={() => setAbierto(false)}>
          Cerrar
        </Button>
      </Group>
      <Select comboboxProps={{ zIndex: 400 }}
        label="Mesa"
        placeholder="Elige la mesa"
        searchable
        value={mesaNumero}
        onChange={(v) => {
          setMesaNumero(v);
          setElegidas({});
        }}
        data={mesas.map((m) => ({ value: String(m.numero), label: `Mesa ${m.numero} · ${m.libres} libres` }))}
      />
      {mesa && libres.length === 0 && (
        <Text size="sm" c="dimmed">
          Esa mesa no tiene sillas libres.
        </Text>
      )}
      {libres.map((s) => {
        const marcada = s.id in elegidas;
        return (
          <Group key={s.id} justify="space-between" wrap="nowrap">
            <Button
              size="xs"
              variant={marcada ? 'filled' : 'default'}
              onClick={() =>
                setElegidas((a) => {
                  const copia = { ...a };
                  if (s.id in copia) delete copia[s.id];
                  else copia[s.id] = 'adulto';
                  return copia;
                })
              }
            >
              Silla {s.numero}
              {s.extra ? ' (extra)' : ''}
            </Button>
            {marcada && (
              <Select comboboxProps={{ zIndex: 400 }}
                size="xs"
                w={120}
                data={TIPOS_BOLETO}
                value={elegidas[s.id]}
                allowDeselect={false}
                aria-label="Tipo de boleto"
                onChange={(v) => v && setElegidas((a) => ({ ...a, [s.id]: v as TipoBoletoFiesta }))}
              />
            )}
          </Group>
        );
      })}
      {hayCortesia && (
        <TextInput
          size="xs"
          required
          label="Motivo de la cortesía"
          description="Pedirá la autorización de un supervisor"
          value={motivoCortesia}
          onChange={(e) => setMotivoCortesia(e.currentTarget.value)}
        />
      )}
      {seleccion.length > 0 && (
        <Group justify="flex-end">
          <Button size="xs" onClick={agregar} loading={editar.isPending}>
            Agregar {seleccion.length} {seleccion.length === 1 ? 'silla' : 'sillas'} (al precio de hoy)
          </Button>
        </Group>
      )}
    </Stack>
  );
}

/** Confirmación al cliente: abre su correo o WhatsApp con el mensaje ya escrito (no se manda nada solo) y deja constancia. */
function BotonesConfirmacion({ reservacion, nombreEvento }: { reservacion: FiestaReservacion; nombreEvento: string }) {
  const { data: evento } = useFiestaEvento();
  const { asunto, cuerpo } = mensajeConfirmacion(reservacion, nombreEvento, evento?.fecha_evento ?? null, evento?.mensaje_confirmacion ?? '');
  const correo = reservacion.correo.trim();
  const whatsapp = enlaceWhatsApp(reservacion.telefono_o_cuarto, cuerpo);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(cuerpo);
      notifications.show({ color: 'green', message: 'Mensaje copiado. Pégalo donde lo vayas a enviar.' });
    } catch {
      window.prompt('Copia el mensaje (Ctrl+C):', cuerpo);
    }
    void registrarConfirmacion(reservacion.id, 'copiado');
  };

  return (
    <Group gap={6}>
      <Tooltip label={correo ? `Abre tu correo con el mensaje para ${correo}` : 'La reservación no tiene correo'}>
        <Button
          component="a"
          href={correo ? enlaceCorreo(correo, asunto, cuerpo) : undefined}
          variant="default"
          leftSection={<IconMail size={16} />}
          disabled={!correo}
          onClick={() => void registrarConfirmacion(reservacion.id, 'correo')}
        >
          Correo
        </Button>
      </Tooltip>
      <Tooltip label={whatsapp ? 'Abre WhatsApp con el mensaje ya escrito' : 'Se necesita un teléfono de 10 dígitos'}>
        <Button
          component="a"
          href={whatsapp ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          variant="default"
          leftSection={<IconBrandWhatsapp size={16} />}
          disabled={!whatsapp}
          onClick={() => void registrarConfirmacion(reservacion.id, 'whatsapp')}
        >
          WhatsApp
        </Button>
      </Tooltip>
      <Tooltip label="Copiar el mensaje de confirmación">
        <ActionIcon variant="default" size="lg" aria-label="Copiar mensaje de confirmación" onClick={copiar}>
          <IconCopy size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

/** Dinero que se le regresó al cliente (reservación cancelada o con excedente). Lo autoriza un supervisor. */
function SeccionDevoluciones({
  reservacion,
  capturadoPor,
  onError,
}: {
  reservacion: FiestaReservacion;
  capturadoPor: string;
  onError: (e: unknown) => void;
}) {
  const registrar = useFiestaRegistrarDevolucion();
  const anular = useFiestaCancelarDevolucion();
  const pedirPin = useSupervisor();
  const [importe, setImporte] = useState<number | string>(reservacion.por_devolver || '');
  const [forma, setForma] = useState<string | null>('Efectivo');
  const [fecha, setFecha] = useState(hoyISO());
  const [referencia, setReferencia] = useState('');
  const [motivo, setMotivo] = useState('');
  const vigentes = reservacion.devoluciones.filter((d) => !d.cancelada);

  const devolver = async () => {
    const monto = typeof importe === 'number' ? importe : Number(importe);
    if (!monto || monto <= 0) {
      notifications.show({ color: 'red', message: 'Captura cuánto se devolvió.' });
      return;
    }
    if (motivo.trim().length < 3) {
      notifications.show({ color: 'red', message: 'Escribe el motivo de la devolución.' });
      return;
    }
    const pin = await pedirPin('registrar una devolución');
    if (pin === null) return;
    try {
      await registrar.mutateAsync({
        reservacionId: reservacion.id,
        importe: monto,
        fecha,
        forma_pago: forma ?? undefined,
        referencia: referencia || undefined,
        motivo: motivo.trim(),
        capturado_por: capturadoPor || undefined,
        pin: pin || undefined,
      });
      notifications.show({ color: 'green', message: `Devolución de ${dinero(monto)} registrada.` });
      setImporte('');
      setMotivo('');
      setReferencia('');
    } catch (e) {
      onError(e);
    }
  };

  const anularDevolucion = async (id: number) => {
    if (!window.confirm('¿Anular esta devolución? Volverá a quedar como dinero por devolver.')) return;
    const pin = await pedirPin('anular una devolución');
    if (pin === null) return;
    try {
      await anular.mutateAsync({ devolucionId: id, pin: pin || undefined });
    } catch (e) {
      onError(e);
    }
  };

  return (
    <Stack gap="xs" p="sm" style={{ border: '1px solid var(--mantine-color-orange-3)', borderRadius: 8 }}>
      <Group justify="space-between">
        <Text fw={600}>Devoluciones</Text>
        <Group gap="xs">
          {reservacion.devuelto > 0 && <Badge color="gray">Devuelto {dinero(reservacion.devuelto)}</Badge>}
          <Badge color={reservacion.por_devolver > 0 ? 'orange' : 'green'} size="lg">
            {reservacion.por_devolver > 0 ? `Por devolver ${dinero(reservacion.por_devolver)}` : 'Nada por devolver'}
          </Badge>
        </Group>
      </Group>
      {vigentes.length > 0 && (
        <Table fz="sm" verticalSpacing={4}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Fecha</Table.Th>
              <Table.Th ta="right">Importe</Table.Th>
              <Table.Th>Forma</Table.Th>
              <Table.Th>Motivo</Table.Th>
              <Table.Th>Autorizó</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {vigentes.map((d) => (
              <Table.Tr key={d.id}>
                <Table.Td>{fechaCorta(d.fecha)}</Table.Td>
                <Table.Td ta="right">{dinero(d.importe)}</Table.Td>
                <Table.Td>{d.forma_pago || '—'}</Table.Td>
                <Table.Td>{d.motivo}</Table.Td>
                <Table.Td>{d.autorizado_por || '—'}</Table.Td>
                <Table.Td>
                  <Button size="compact-xs" variant="subtle" color="red" onClick={() => anularDevolucion(d.id)}>
                    Anular
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {reservacion.por_devolver > 0 && (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 5 }}>
            <NumberInput label="Importe devuelto" value={importe} onChange={setImporte} min={0} max={reservacion.por_devolver} decimalScale={2} prefix="$" thousandSeparator="," />
            <TextInput label="Fecha" type="date" value={fecha} onChange={(e) => setFecha(e.currentTarget.value)} />
            <Select comboboxProps={{ zIndex: 400 }} label="Forma" data={FORMAS_PAGO} value={forma} onChange={setForma} />
            <TextInput label="Referencia" value={referencia} onChange={(e) => setReferencia(e.currentTarget.value)} />
            <TextInput label="Motivo" required value={motivo} onChange={(e) => setMotivo(e.currentTarget.value)} />
          </SimpleGrid>
          <Group justify="flex-end">
            <Button color="orange" onClick={devolver} loading={registrar.isPending}>
              Registrar devolución
            </Button>
          </Group>
        </>
      )}
    </Stack>
  );
}

function Stat({ etiqueta, valor, color }: { etiqueta: string; valor: string; color?: string }) {
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {etiqueta}
      </Text>
      <Text size="xl" fw={700} c={color}>
        {valor}
      </Text>
    </Stack>
  );
}

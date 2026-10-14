/**
 * ConfiguracionFiesta — datos del evento, precios del año, factor de IVA/propina
 * y capacidad de cada mesa. Los precios nuevos solo afectan ventas futuras.
 */

import { Accordion, Alert, Button, Group, NumberInput, Paper, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';

import {
  mensajeErrorFiesta,
  useFiestaActualizarEvento,
  useFiestaActualizarMesa,
  useFiestaActualizarPrecios,
  useFiestaMesas,
  type FiestaEvento,
  type FiestaPrecio,
  type TipoBoletoFiesta,
} from '../../api/fiestaHooks';
import { ETIQUETA_TIPO } from './fiestaUtils';
import { useSupervisor } from './SupervisorPin';

const TIPOS: TipoBoletoFiesta[] = ['adulto', 'nino', 'cortesia'];

export default function ConfiguracionFiesta({ evento }: { evento: FiestaEvento }) {
  // `key` reinicia los formularios con lo ya guardado cuando el evento cambia en el servidor.
  const clave = JSON.stringify(evento);
  return (
    <Stack gap="md">
      <FormularioEvento key={`e-${clave}`} evento={evento} />
      <FormularioPrecios key={`p-${clave}`} evento={evento} />
      <CapacidadMesas />
    </Stack>
  );
}

function FormularioEvento({ evento }: { evento: FiestaEvento }) {
  const actualizar = useFiestaActualizarEvento();
  const pedirPin = useSupervisor();
  const [nombre, setNombre] = useState(evento.nombre);
  const [fechaEvento, setFechaEvento] = useState(evento.fecha_evento ?? '');
  const [corte, setCorte] = useState(evento.corte_preventa ?? '');
  const [iva, setIva] = useState<number | string>(evento.iva_factor);
  const [propina, setPropina] = useState<number | string>(Math.round(evento.propina_pct * 10000) / 100);

  const guardar = async () => {
    if (!nombre.trim()) {
      notifications.show({ color: 'red', message: 'El evento necesita un nombre.' });
      return;
    }
    const nuevoIva = Number(iva) || 1.16;
    const nuevaPropina = (Number(propina) || 0) / 100;
    // El corte de preventa y los factores de IVA/propina cambian lo que se cobra: los autoriza el supervisor.
    const sensible =
      (corte || null) !== evento.corte_preventa ||
      Math.abs(nuevoIva - evento.iva_factor) > 1e-9 ||
      Math.abs(nuevaPropina - evento.propina_pct) > 1e-9;
    const pin = sensible ? await pedirPin('cambiar el corte de preventa o los factores de IVA/propina') : '';
    if (pin === null) return;
    try {
      await actualizar.mutateAsync({
        nombre: nombre.trim(),
        fecha_evento: fechaEvento || null,
        corte_preventa: corte || null,
        iva_factor: nuevoIva,
        propina_pct: nuevaPropina,
        pin: pin || undefined,
      });
      notifications.show({ color: 'green', message: 'Datos del evento guardados.' });
    } catch (e) {
      notifications.show({ color: 'red', title: 'No se pudo guardar', message: mensajeErrorFiesta(e) });
    }
  };

  return (
    <Paper withBorder p="md">
      <Title order={5} mb="sm">
        Evento
      </Title>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
        <TextInput label="Nombre" value={nombre} onChange={(e) => setNombre(e.currentTarget.value)} />
        <TextInput label="Fecha del evento" type="date" value={fechaEvento} onChange={(e) => setFechaEvento(e.currentTarget.value)} />
        <TextInput
          label="Último día de preventa"
          description="Ventas hasta este día (incluido) usan precio de preventa"
          type="date"
          value={corte}
          onChange={(e) => setCorte(e.currentTarget.value)}
        />
        <NumberInput label="Factor de IVA" description="1.16 = IVA del 16%" value={iva} onChange={setIva} min={1} decimalScale={4} step={0.01} />
        <NumberInput label="Propina incluida en el precio (%)" value={propina} onChange={setPropina} min={0} decimalScale={2} suffix="%" />
      </SimpleGrid>

      <Group justify="flex-end" mt="md">
        <Button onClick={guardar} loading={actualizar.isPending}>
          Guardar evento
        </Button>
      </Group>
    </Paper>
  );
}

function FormularioPrecios({ evento }: { evento: FiestaEvento }) {
  const actualizar = useFiestaActualizarPrecios();
  const pedirPin = useSupervisor();
  const inicial = (tipo: TipoBoletoFiesta): FiestaPrecio =>
    evento.precios.find((p) => p.tipo === tipo) ?? { tipo, precio_preventa: 0, precio_normal: 0 };

  const [precios, setPrecios] = useState<Record<TipoBoletoFiesta, { pre: number | string; nor: number | string }>>({
    adulto: { pre: inicial('adulto').precio_preventa, nor: inicial('adulto').precio_normal },
    nino: { pre: inicial('nino').precio_preventa, nor: inicial('nino').precio_normal },
    cortesia: { pre: inicial('cortesia').precio_preventa, nor: inicial('cortesia').precio_normal },
  });

  const sinPrecios = TIPOS.filter((t) => t !== 'cortesia').every(
    (t) => inicial(t).precio_preventa === 0 && inicial(t).precio_normal === 0,
  );

  const guardar = async () => {
    const pin = await pedirPin('cambiar los precios de los boletos');
    if (pin === null) return;
    try {
      await actualizar.mutateAsync({
        precios: TIPOS.map((tipo) => ({
          tipo,
          precio_preventa: Number(precios[tipo].pre) || 0,
          precio_normal: Number(precios[tipo].nor) || 0,
        })),
        pin: pin || undefined,
      });
      notifications.show({ color: 'green', message: 'Precios guardados. Aplican a las ventas nuevas.' });
    } catch (e) {
      notifications.show({ color: 'red', title: 'No se pudo guardar', message: mensajeErrorFiesta(e) });
    }
  };

  return (
    <Paper withBorder p="md">
      <Title order={5} mb="sm">
        Precios por boleto (con IVA y propina)
      </Title>
      {sinPrecios && (
        <Alert color="yellow" mb="sm">
          Aún no hay precios capturados: captúralos antes de empezar a vender.
        </Alert>
      )}
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Tipo</Table.Th>
            <Table.Th>Preventa</Table.Th>
            <Table.Th>Normal</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {TIPOS.map((tipo) => (
            <Table.Tr key={tipo}>
              <Table.Td fw={600}>{ETIQUETA_TIPO[tipo]}</Table.Td>
              <Table.Td>
                <NumberInput
                  value={precios[tipo].pre}
                  onChange={(v) => setPrecios((p) => ({ ...p, [tipo]: { ...p[tipo], pre: v } }))}
                  min={0}
                  decimalScale={2}
                  prefix="$"
                  thousandSeparator=","
                  w={150}
                />
              </Table.Td>
              <Table.Td>
                <NumberInput
                  value={precios[tipo].nor}
                  onChange={(v) => setPrecios((p) => ({ ...p, [tipo]: { ...p[tipo], nor: v } }))}
                  min={0}
                  decimalScale={2}
                  prefix="$"
                  thousandSeparator=","
                  w={150}
                />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Text size="xs" c="dimmed" mt="xs">
        Cambiar un precio no modifica las reservaciones ya hechas: cada boleto conserva el precio con el que se vendió.
      </Text>
      <Group justify="flex-end" mt="md">
        <Button onClick={guardar} loading={actualizar.isPending}>
          Guardar precios
        </Button>
      </Group>
    </Paper>
  );
}

function CapacidadMesas() {
  const { data } = useFiestaMesas();
  const actualizar = useFiestaActualizarMesa();
  const [cambios, setCambios] = useState<Record<number, number | string>>({});

  const mesas = (data?.mesas ?? []).slice().sort((a, b) => a.numero - b.numero);

  const guardar = async (id: number) => {
    const capacidad = Number(cambios[id]);
    if (!capacidad || capacidad < 1) return;
    try {
      await actualizar.mutateAsync({ id, capacidad });
      setCambios(({ [id]: _quitada, ...resto }) => resto);
      notifications.show({ color: 'green', message: 'Capacidad actualizada.' });
    } catch (e) {
      notifications.show({ color: 'red', title: 'No se pudo cambiar', message: mensajeErrorFiesta(e), autoClose: 8000 });
    }
  };

  return (
    <Accordion variant="contained">
      <Accordion.Item value="capacidad">
        <Accordion.Control>Capacidad de cada mesa ({mesas.length} mesas)</Accordion.Control>
        <Accordion.Panel>
          <Text size="sm" c="dimmed" mb="sm">
            Cambia cuántas sillas tiene una mesa. Solo se pueden quitar sillas que nunca han tenido una reservación.
          </Text>
          <Table.ScrollContainer minWidth={360} mah={380}>
            <Table stickyHeader>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Mesa</Table.Th>
                  <Table.Th>Zona</Table.Th>
                  <Table.Th>Sillas</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {mesas.map((m) => {
                  const valor = cambios[m.id] ?? m.sillas.length;
                  return (
                    <Table.Tr key={m.id}>
                      <Table.Td fw={600}>{m.numero}</Table.Td>
                      <Table.Td>{m.zona ?? '—'}</Table.Td>
                      <Table.Td>
                        <NumberInput
                          value={valor}
                          onChange={(v) => setCambios((c) => ({ ...c, [m.id]: v }))}
                          min={1}
                          max={40}
                          allowDecimal={false}
                          w={90}
                          size="xs"
                        />
                      </Table.Td>
                      <Table.Td>
                        {m.id in cambios && Number(cambios[m.id]) !== m.sillas.length && (
                          <Button size="xs" onClick={() => guardar(m.id)} loading={actualizar.isPending}>
                            Guardar
                          </Button>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}

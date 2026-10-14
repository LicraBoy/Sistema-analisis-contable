/**
 * PanelAuditoria — quién hizo qué en la Fiesta: cobros, cancelaciones, cambios de precio, bloqueos, etc.
 * Solo la ven los roles con el permiso `fiesta_auditoria` (las cajeras no). La bitácora es de solo anexar.
 */

import { ActionIcon, Alert, Badge, Button, Group, Loader, Paper, SegmentedControl, Select, SimpleGrid, Stack, Table, Text, TextInput, Title, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDownload, IconX } from '@tabler/icons-react';
import { useState } from 'react';

import {
  descargarAuditoriaExcel,
  mensajeErrorFiesta,
  useFiestaAuditoria,
  type FiestaAuditoriaFila,
  type GrupoAuditoria,
} from '../../api/fiestaHooks';

const COLOR_GRUPO: Record<string, string> = {
  cobros: 'green',
  cancelaciones: 'red',
  reservaciones: 'blue',
  precios: 'orange',
  bloqueos: 'gray',
  configuracion: 'violet',
};

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });

/** `{importe: 1000, forma_pago: "Tarjeta"}` → "importe $1,000 · forma de pago Tarjeta" */
function describir(valor: FiestaAuditoriaFila['antes']): string {
  if (!valor) return '';
  if (typeof valor === 'string') return valor;
  return Object.entries(valor)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' · ');
}

export default function PanelAuditoria({ reservacionInicial }: { reservacionInicial?: number }) {
  const [grupo, setGrupo] = useState<string>('');
  const [usuario, setUsuario] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [reservacion, setReservacion] = useState<number | undefined>(reservacionInicial);
  const [pagina, setPagina] = useState(1);

  const filtros = {
    grupo: (grupo || undefined) as GrupoAuditoria | undefined,
    usuario: usuario ?? undefined,
    q: q.trim() || undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
    reservacion_id: reservacion,
    pagina,
  };
  const { data, isLoading, isError, error, isFetching } = useFiestaAuditoria(filtros);
  const cambia = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPagina(1);
  };

  if (isError) return <Alert color="red">{mensajeErrorFiesta(error)}</Alert>;
  const paginas = data ? Math.max(1, Math.ceil(data.total / data.por_pagina)) : 1;

  const exportar = async () => {
    try {
      await descargarAuditoriaExcel(filtros);
    } catch (e) {
      notifications.show({ color: 'red', title: 'No se pudo exportar', message: mensajeErrorFiesta(e) });
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <div>
          <Title order={4}>Auditoría</Title>
          <Text size="sm" c="dimmed">
            Todo lo que se mueve en la Fiesta: quién, cuándo y qué cambió. Solo se agrega, no se puede borrar.
          </Text>
        </div>
        <Button variant="light" leftSection={<IconDownload size={16} />} onClick={exportar}>
          Exportar a Excel
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 2, md: 4 }}>
        <Paper withBorder p="sm">
          <Text size="xs" c="dimmed">
            Movimientos hoy
          </Text>
          <Text fw={700} fz="xl">
            {data?.resumen.movimientos_hoy ?? '—'}
          </Text>
        </Paper>
        <Paper withBorder p="sm">
          <Text size="xs" c="dimmed">
            Cobros (filtro actual)
          </Text>
          <Text fw={700} fz="xl" c="green">
            {data?.resumen.por_grupo.cobros ?? 0}
          </Text>
        </Paper>
        <Paper withBorder p="sm">
          <Text size="xs" c="dimmed">
            Cancelaciones (filtro actual)
          </Text>
          <Text fw={700} fz="xl" c="red">
            {data?.resumen.por_grupo.cancelaciones ?? 0}
          </Text>
        </Paper>
        <Paper withBorder p="sm">
          <Text size="xs" c="dimmed">
            Total en el filtro
          </Text>
          <Text fw={700} fz="xl">
            {data?.total ?? '—'}
          </Text>
        </Paper>
      </SimpleGrid>

      <Group align="flex-end" gap="sm" wrap="wrap">
        <SegmentedControl
          value={grupo}
          onChange={cambia(setGrupo)}
          data={[
            { value: '', label: 'Todo' },
            { value: 'cobros', label: 'Cobros' },
            { value: 'cancelaciones', label: 'Cancelaciones' },
            { value: 'reservaciones', label: 'Reservaciones' },
            { value: 'precios', label: 'Precios' },
            { value: 'bloqueos', label: 'Bloqueos' },
            { value: 'configuracion', label: 'Configuración' },
          ]}
        />
        <Select label="Usuario" placeholder="Todos" clearable value={usuario} onChange={cambia(setUsuario)} data={data?.usuarios ?? []} w={190} />
        <TextInput label="Cliente, mesa o detalle" value={q} onChange={(e) => cambia(setQ)(e.currentTarget.value)} w={220} />
        <TextInput label="Desde" type="date" value={desde} onChange={(e) => cambia(setDesde)(e.currentTarget.value)} />
        <TextInput label="Hasta" type="date" value={hasta} onChange={(e) => cambia(setHasta)(e.currentTarget.value)} />
        {reservacion !== undefined && (
          <Badge size="lg" variant="light" rightSection={<ActionIcon size="xs" variant="transparent" aria-label="Quitar filtro" onClick={() => cambia(setReservacion)(undefined)}><IconX size={12} /></ActionIcon>}>
            Reservación #{reservacion}
          </Badge>
        )}
      </Group>

      <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
        <Table.ScrollContainer minWidth={820}>
          <Table verticalSpacing={6} fz="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Fecha y hora</Table.Th>
                <Table.Th>Usuario</Table.Th>
                <Table.Th>Movimiento</Table.Th>
                <Table.Th>Reservación</Table.Th>
                <Table.Th>Qué pasó</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {isLoading && (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Loader size="sm" />
                  </Table.Td>
                </Table.Tr>
              )}
              {data?.filas.map((f) => (
                <Table.Tr key={f.id}>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>{fechaHora(f.creado_en)}</Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={600}>
                      {f.usuario || '—'}
                    </Text>
                    {f.ip && (
                      <Text size="xs" c="dimmed">
                        {f.ip}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Badge color={COLOR_GRUPO[f.grupo] ?? 'gray'} variant="light">
                      {f.etiqueta}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {f.reservacion_id ? (
                      <Tooltip label="Ver solo los movimientos de esta reservación">
                        <Button size="compact-xs" variant="subtle" onClick={() => cambia(setReservacion)(f.reservacion_id ?? undefined)}>
                          #{f.reservacion_id}
                        </Button>
                      </Tooltip>
                    ) : null}
                    <Text size="sm">{f.cliente}</Text>
                    {f.mesa ? (
                      <Text size="xs" c="dimmed">
                        Mesa {f.mesa}
                      </Text>
                    ) : null}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{f.detalle}</Text>
                    {(f.antes || f.despues) && (
                      <Text size="xs" c="dimmed">
                        {f.antes ? `Antes: ${describir(f.antes)}` : ''}
                        {f.antes && f.despues ? '  →  ' : ''}
                        {f.despues ? `Después: ${describir(f.despues)}` : ''}
                      </Text>
                    )}
                    {f.autorizo && (
                      <Badge size="xs" variant="outline" color="orange" mt={2}>
                        Autorizó: {f.autorizo}
                      </Badge>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
              {data && data.filas.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Text c="dimmed" ta="center" py="md">
                      Sin movimientos con esos filtros.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {data?.total ?? 0} movimiento(s) {isFetching && '· actualizando…'}
        </Text>
        <Group gap="xs">
          <Button size="xs" variant="default" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
            Anterior
          </Button>
          <Text size="sm">
            {pagina} / {paginas}
          </Text>
          <Button size="xs" variant="default" disabled={pagina >= paginas} onClick={() => setPagina((p) => p + 1)}>
            Siguiente
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}

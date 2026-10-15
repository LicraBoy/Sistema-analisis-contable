/**
 * Campana del supervisor: cortesías que las cajeras apartaron y esperan autorización.
 * Un clic aprueba (queda como cortesía) o rechaza (se liberan las sillas); no pide contraseña porque quien ve la
 * campana ya inició sesión con el permiso de supervisor de Fiesta.
 */
import { ActionIcon, Badge, Button, Group, Indicator, Popover, ScrollArea, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBell, IconCheck, IconX } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import {
  mensajeErrorFiesta,
  useFiestaResolverCortesia,
  useFiestaSolicitudesCortesia,
  type FiestaSolicitudCortesiaDetalle,
} from '../../api/fiestaHooks';

function etiquetaSillas(s: FiestaSolicitudCortesiaDetalle): string {
  const porMesa = new Map<number, number[]>();
  for (const x of s.sillas) porMesa.set(x.mesa, [...(porMesa.get(x.mesa) ?? []), x.silla]);
  return [...porMesa.entries()].map(([mesa, sillas]) => `Mesa ${mesa} · silla${sillas.length > 1 ? 's' : ''} ${sillas.join(', ')}`).join(' | ');
}

function Tarjeta({ s }: { s: FiestaSolicitudCortesiaDetalle }) {
  const resolver = useFiestaResolverCortesia();
  const [nota, setNota] = useState('');
  const [rechazando, setRechazando] = useState(false);

  const resolverCon = async (aprobar: boolean) => {
    try {
      await resolver.mutateAsync({ id: s.id, aprobar, nota: nota.trim() || undefined });
      notifications.show({
        color: aprobar ? 'green' : 'orange',
        message: aprobar ? `Cortesía de ${s.cliente} autorizada.` : `Cortesía de ${s.cliente} rechazada: sillas liberadas.`,
      });
    } catch (e) {
      notifications.show({ color: 'red', title: 'No se pudo resolver', message: mensajeErrorFiesta(e), autoClose: 8000 });
    }
  };

  return (
    <Stack gap={6} p="xs" style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 8 }}>
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <div>
          <Text fw={600} size="sm">{s.cliente}</Text>
          <Text size="xs" c="dimmed">{etiquetaSillas(s)}</Text>
        </div>
        <Badge variant="light" color="yellow" size="sm">Reservación #{s.reservacion_id}</Badge>
      </Group>
      <Text size="sm">Motivo: {s.motivo}</Text>
      <Text size="xs" c="dimmed">Lo pidió {s.solicitado_por || 'una cajera'}</Text>
      {rechazando && (
        <TextInput size="xs" placeholder="Nota para la cajera (opcional)" value={nota} onChange={(e) => setNota(e.currentTarget.value)} />
      )}
      <Group gap="xs">
        <Button size="compact-sm" color="green" leftSection={<IconCheck size={14} />} loading={resolver.isPending} onClick={() => resolverCon(true)}>
          Autorizar
        </Button>
        {rechazando ? (
          <Button size="compact-sm" color="red" leftSection={<IconX size={14} />} loading={resolver.isPending} onClick={() => resolverCon(false)}>
            Confirmar rechazo
          </Button>
        ) : (
          <Button size="compact-sm" variant="light" color="red" leftSection={<IconX size={14} />} onClick={() => setRechazando(true)}>
            Rechazar
          </Button>
        )}
      </Group>
    </Stack>
  );
}

export default function SolicitudesCortesia() {
  const { data } = useFiestaSolicitudesCortesia(true);
  const [abierto, setAbierto] = useState(false);
  const pendientes = data?.solicitudes ?? [];
  const total = pendientes.length;
  const previo = useRef<number | null>(null);

  // Aviso emergente cuando llega una solicitud nueva (sin esperar a que el supervisor abra la campana).
  useEffect(() => {
    if (previo.current !== null && total > previo.current) {
      notifications.show({ color: 'yellow', title: 'Cortesía por autorizar', message: 'Una cajera pidió autorización para una cortesía.', autoClose: 10000 });
    }
    previo.current = total;
  }, [total]);

  return (
    <Popover opened={abierto} onChange={setAbierto} width={380} position="bottom-end" shadow="md" withArrow>
      <Popover.Target>
        <Indicator label={total} disabled={total === 0} color="red" size={18} offset={4}>
          <ActionIcon variant={total ? 'filled' : 'light'} color={total ? 'yellow' : 'gray'} size="lg" aria-label="Cortesías por autorizar" onClick={() => setAbierto((v) => !v)}>
            <IconBell size={18} />
          </ActionIcon>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Text fw={600} size="sm">Cortesías por autorizar</Text>
          {total === 0 ? (
            <Text size="sm" c="dimmed">No hay nada pendiente.</Text>
          ) : (
            <ScrollArea.Autosize mah={420}>
              <Stack gap="xs">
                {pendientes.map((s) => (
                  <Tarjeta key={s.id} s={s} />
                ))}
              </Stack>
            </ScrollArea.Autosize>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

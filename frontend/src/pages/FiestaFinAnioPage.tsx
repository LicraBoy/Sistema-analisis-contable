/**
 * FiestaFinAnioPage — venta de boletos de la fiesta de fin de año por mesa/silla.
 *
 * Vive en su propio grupo del sidebar, independiente de Contabilidad y Almacén.
 * Reemplaza al Excel "CROQUIS RESERV FIN DE AÑO": croquis interactivo,
 * reservaciones con pagos, cobros por día y resumen de ventas.
 */

import { Alert, Button, Card, Group, Loader, Stack, Tabs, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import {
  IconCash,
  IconChartBar,
  IconLayoutGrid,
  IconListDetails,
  IconHistory,
  IconSettings,
} from '@tabler/icons-react';

import {
  esEventoNoPreparado,
  mensajeErrorFiesta,
  useFiestaEvento,
  useFiestaSembrar,
} from '../api/fiestaHooks';
import { useAuth } from '../auth/AuthContext';
import GuiaCajeras from '../components/fiesta/GuiaCajeras';
import PanelAuditoria from '../components/fiesta/PanelAuditoria';
import ConfiguracionFiesta from '../components/fiesta/ConfiguracionFiesta';
import CroquisFiesta from '../components/fiesta/CroquisFiesta';
import PanelCobros from '../components/fiesta/PanelCobros';
import PanelResumenFiesta from '../components/fiesta/PanelResumenFiesta';
import SolicitudesCortesia from '../components/fiesta/SolicitudesCortesia';
import { SupervisorProvider } from '../components/fiesta/SupervisorPin';
import TablaReservaciones from '../components/fiesta/TablaReservaciones';

export default function FiestaFinAnioPage() {
  const { data: evento, isLoading, isError, error } = useFiestaEvento();
  const sembrar = useFiestaSembrar();
  const [pestana, setPestana] = useState<string | null>('croquis');
  const { puede } = useAuth();
  const veAuditoria = puede('fiesta_auditoria', 1); // las cajeras no la ven (el servidor también responde 403)
  const veCampana = puede('fiesta_supervisor', 2); // solo quien puede autorizar cortesías ve la campana

  if (isLoading) return <Loader />;

  if (isError && esEventoNoPreparado(error)) {
    const preparar = async () => {
      try {
        const r = await sembrar.mutateAsync(undefined);
        notifications.show({
          color: 'green',
          title: 'Evento preparado',
          message: `${r.mesas_creadas} mesas y ${r.sillas_creadas} sillas creadas. Captura los precios en Configuración.`,
        });
      } catch (e) {
        notifications.show({ color: 'red', title: 'No se pudo preparar', message: mensajeErrorFiesta(e) });
      }
    };
    return (
      <Stack gap="md" maw={640}>
        <Title order={2}>Fiesta de Fin de Año</Title>
        <Card withBorder padding="lg">
          <Stack gap="sm">
            <Text fw={600}>Todavía no hay un evento configurado</Text>
            <Text size="sm" c="dimmed">
              Al prepararlo se crean las mesas y sillas del croquis. Después captura los precios y la fecha de corte de
              preventa en la pestaña Configuración.
            </Text>
            <Group>
              <Button onClick={preparar} loading={sembrar.isPending}>
                Preparar evento
              </Button>
            </Group>
          </Stack>
        </Card>
      </Stack>
    );
  }

  if (isError || !evento) {
    return (
      <Alert color="red" title="No se pudo cargar el módulo">
        {mensajeErrorFiesta(error)}
      </Alert>
    );
  }

  return (
    <SupervisorProvider>
    <Stack gap="md">
      <Group justify="space-between" align="center" wrap="wrap">
        <Title order={2}>{evento.nombre}</Title>
        <Group gap="xs">
          {veCampana && <SolicitudesCortesia />}
          <GuiaCajeras />
        </Group>
      </Group>

      <Tabs value={pestana} onChange={setPestana} variant="pills" color="violet" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="croquis" leftSection={<IconLayoutGrid size={16} />}>
            Croquis
          </Tabs.Tab>
          <Tabs.Tab value="reservaciones" leftSection={<IconListDetails size={16} />}>
            Reservaciones
          </Tabs.Tab>
          <Tabs.Tab value="cobros" leftSection={<IconCash size={16} />}>
            Cobros
          </Tabs.Tab>
          <Tabs.Tab value="resumen" leftSection={<IconChartBar size={16} />}>
            Resumen
          </Tabs.Tab>
          <Tabs.Tab value="configuracion" leftSection={<IconSettings size={16} />}>
            Configuración
          </Tabs.Tab>
          {veAuditoria && (
            <Tabs.Tab value="auditoria" leftSection={<IconHistory size={16} />}>
              Auditoría
            </Tabs.Tab>
          )}
        </Tabs.List>

        <Tabs.Panel value="croquis">
          <CroquisFiesta evento={evento} />
        </Tabs.Panel>
        <Tabs.Panel value="reservaciones">
          <TablaReservaciones evento={evento} />
        </Tabs.Panel>
        <Tabs.Panel value="cobros">
          <PanelCobros />
        </Tabs.Panel>
        <Tabs.Panel value="resumen">
          <PanelResumenFiesta />
        </Tabs.Panel>
        <Tabs.Panel value="configuracion">
          <ConfiguracionFiesta evento={evento} />
        </Tabs.Panel>
        {veAuditoria && (
          <Tabs.Panel value="auditoria">
            <PanelAuditoria />
          </Tabs.Panel>
        )}
      </Tabs>
    </Stack>
    </SupervisorProvider>
  );
}

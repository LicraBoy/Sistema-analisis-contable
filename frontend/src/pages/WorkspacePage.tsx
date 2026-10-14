/**
 * WorkspacePage — Unifica Cargar Archivos, Pagos y Conciliación en una sola
 * pantalla, con un menú interactivo de tarjetas como pantalla de entrada
 * (mismo patrón que Catálogo de Productos) en vez de pestañas planas.
 */

import { Button, Card, Group, SimpleGrid, Stack, Text, ThemeIcon, Title, UnstyledButton } from '@mantine/core';
import { useState } from 'react';
import {
  IconArrowLeft,
  IconFileInvoice,
  IconFileUpload,
  IconListDetails,
  IconRefreshAlert,
} from '@tabler/icons-react';
import UploadPage from './UploadPage';
import PagosPage from './PagosPage';
import { ConciliacionPage } from './ConciliacionPage';
import IngresosPage from './IngresosPage';

type SeccionWorkspaceClave = 'upload' | 'conciliacion' | 'pagos' | 'ingresos';

const SECCIONES_WORKSPACE_MENU: {
  clave: SeccionWorkspaceClave;
  nombre: string;
  descripcion: string;
  icono: typeof IconFileUpload;
  color: string;
}[] = [
  {
    clave: 'upload',
    nombre: 'Cargar Archivos',
    descripcion: 'Subir los Excel de Ingresos/Pagos y procesarlos',
    icono: IconFileUpload,
    color: 'blue',
  },
  {
    clave: 'conciliacion',
    nombre: 'Conciliación',
    descripcion: 'Cruce de CFDI Ingresos contra Pagos por UUID',
    icono: IconRefreshAlert,
    color: 'orange',
  },
  {
    clave: 'pagos',
    nombre: 'Pagos',
    descripcion: 'Listado y edición de pagos procesados',
    icono: IconListDetails,
    color: 'teal',
  },
  {
    clave: 'ingresos',
    nombre: 'Ingresos',
    descripcion: 'CFDI Ingresos recibidos, búsqueda y exportación',
    icono: IconFileInvoice,
    color: 'grape',
  },
];

function PanelMenuSeccionesWorkspace({ onSeleccionar }: { onSeleccionar: (sec: SeccionWorkspaceClave) => void }) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="lg">
      {SECCIONES_WORKSPACE_MENU.map((sec) => (
        <UnstyledButton key={sec.clave} onClick={() => onSeleccionar(sec.clave)}>
          <Card
            withBorder
            radius="md"
            p="lg"
            style={{ borderLeft: `4px solid var(--mantine-color-${sec.color}-6)`, height: '100%' }}
          >
            <Stack gap="sm" align="flex-start">
              <ThemeIcon size={44} radius="md" variant="light" color={sec.color}>
                <sec.icono size={24} />
              </ThemeIcon>
              <Text fw={600}>{sec.nombre}</Text>
              <Text size="xs" c="dimmed">
                {sec.descripcion}
              </Text>
            </Stack>
          </Card>
        </UnstyledButton>
      ))}
    </SimpleGrid>
  );
}

export default function WorkspacePage() {
  const [vista, setVista] = useState<SeccionWorkspaceClave | null>(null);
  // Secciones que ya se visitaron al menos una vez: se renderizan todas al
  // mismo tiempo (ocultas con CSS, no desmontadas) para que su estado local
  // sobreviva al ir y venir entre secciones — ej. subir un archivo nuevo en
  // "Cargar Archivos" redirige a "Pagos" (ver onUploadSuccess abajo); si
  // PagosPage se desmontaba mientras tanto, perdía el Cancelados/Egresos/
  // Retenciones ya seleccionados. La que nunca se visitó sigue sin
  // renderizarse, así que no dispara sus queries hasta que el usuario entra.
  const [visitadas, setVisitadas] = useState<Set<SeccionWorkspaceClave>>(new Set());

  const irA = (sec: SeccionWorkspaceClave) => {
    setVisitadas((prev) => (prev.has(sec) ? prev : new Set(prev).add(sec)));
    setVista(sec);
  };

  if (vista === null) {
    return (
      <Stack gap="lg">
        <Title order={3}>Flujo de Trabajo</Title>
        <PanelMenuSeccionesWorkspace onSeleccionar={irA} />
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Button
          variant="subtle"
          size="sm"
          leftSection={<IconArrowLeft size={16} />}
          onClick={() => setVista(null)}
          style={{ alignSelf: 'flex-start' }}
        >
          Volver al menú
        </Button>
      </Group>

      {visitadas.has('upload') && (
        <div style={{ display: vista === 'upload' ? undefined : 'none' }}>
          <UploadPage onUploadSuccess={() => irA('pagos')} />
        </div>
      )}
      {visitadas.has('conciliacion') && (
        <div style={{ display: vista === 'conciliacion' ? undefined : 'none' }}>
          <ConciliacionPage />
        </div>
      )}
      {visitadas.has('pagos') && (
        <div style={{ display: vista === 'pagos' ? undefined : 'none' }}>
          <PagosPage />
        </div>
      )}
      {visitadas.has('ingresos') && (
        <div style={{ display: vista === 'ingresos' ? undefined : 'none' }}>
          <IngresosPage />
        </div>
      )}
    </Stack>
  );
}

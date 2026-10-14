/**
 * IngresosPage — Tabla de solo lectura de los Ingresos ya subidos, para
 * consultar el UUID correcto de una factura mientras se editan Pagos/Conciliación.
 */

import { useState } from 'react';
import {
  ActionIcon,
  Box,
  Button,
  Card,
  Group,
  Pagination,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { Dropzone, MS_EXCEL_MIME_TYPE } from '@mantine/dropzone';
import { useDebouncedValue } from '@mantine/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import {
  IconCopy,
  IconSearch,
  IconFileExport,
  IconUpload,
  IconX,
  IconFileSpreadsheet,
  IconCheck,
  IconEdit,
} from '@tabler/icons-react';
import { useIngresosList, useUploadIngresos, exportIngresos } from '../api/hooks';
import { IngresoEditModal } from '../components/IngresoEditModal';

interface IngresoRow {
  id: number;
  uuid: string;
  rfc_emisor: string | null;
  nombre_emisor: string | null;
  folio: string | null;
  monto: string | null;
  fecha: string | null;
}

export default function IngresosPage() {
  const [buscar, setBuscar] = useState('');
  const [debouncedBuscar] = useDebouncedValue(buscar, 300);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [isExporting, setIsExporting] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const uploadIngresos = useUploadIngresos();

  const { data: result, isLoading } = useIngresosList({
    page,
    page_size: pageSize,
    buscar: debouncedBuscar || undefined,
  });

  const items: IngresoRow[] = result?.data || [];
  const meta = result?.meta || { total: 0, page: 1, pages: 1 };

  const copiarUuid = (uuid: string) => {
    navigator.clipboard.writeText(uuid);
    notifications.show({ title: 'Copiado', message: 'UUID copiado al portapapeles', color: 'teal' });
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await exportIngresos();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Ingresos_Recibidos.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      notifications.show({ title: 'Error', message: 'No se pudo exportar', color: 'red' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleUploadIngresos = (files: File[]) => {
    const file = files[0];
    if (!file) return;

    uploadIngresos.mutate(file, {
      onSuccess: (res) => {
        notifications.show({
          title: '¡Ingresos cargados!',
          message: res.mensaje || 'Archivo de ingresos guardado.',
          color: 'teal',
          icon: <IconCheck size={16} />,
        });
        queryClient.invalidateQueries({ queryKey: ['ingresos-list'] });
      },
      onError: (err: any) => {
        notifications.show({
          title: 'Error',
          message: err.response?.data?.detail || 'No se pudo cargar el archivo de ingresos.',
          color: 'red',
          icon: <IconX size={16} />,
        });
      },
    });
  };

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <Group>
          <Title order={2}>Ingresos</Title>
          <Text c="dimmed" size="sm">{meta.total} registros</Text>
        </Group>
        <Button
          leftSection={<IconFileExport size={16} />}
          color="violet"
          onClick={handleExport}
          loading={isExporting}
        >
          Exportar
        </Button>
      </Group>
      <Text c="dimmed">
        Consulta los CFDI de Ingresos ya subidos — busca por factura, RFC o nombre del emisor
        para encontrar el UUID correcto y copiarlo al editar un Pago.
      </Text>

      <Card shadow="sm" padding="md" radius="md" withBorder>
        <Text fw={600} size="sm" mb="xs">Cargar Ingresos</Text>
        <Text size="xs" c="dimmed" mb="sm">
          Sube un Excel de Ingresos Recibidos para ampliar esta base de datos — solo se agregan
          los registros nuevos, nunca se reemplazan los que ya están guardados.
        </Text>
        <Dropzone
          id="dropzone-ingresos-standalone"
          onDrop={handleUploadIngresos}
          accept={MS_EXCEL_MIME_TYPE}
          maxSize={50 * 1024 * 1024}
          maxFiles={1}
          loading={uploadIngresos.isPending}
        >
          <Group justify="center" gap="md" mih={80} style={{ pointerEvents: 'none' }}>
            <Dropzone.Accept>
              <IconUpload size={28} stroke={1.5} color="var(--mantine-color-violet-6)" />
            </Dropzone.Accept>
            <Dropzone.Reject>
              <IconX size={28} stroke={1.5} color="var(--mantine-color-red-6)" />
            </Dropzone.Reject>
            <Dropzone.Idle>
              <IconFileSpreadsheet size={28} stroke={1.5} color="var(--mantine-color-dimmed)" />
            </Dropzone.Idle>
            <Text size="sm" c="dimmed">Arrastra el archivo de Ingresos aquí o haz clic para seleccionarlo</Text>
          </Group>
        </Dropzone>
      </Card>

      <Card shadow="sm" padding="md" radius="md" withBorder>
        <TextInput
          label="Buscar"
          placeholder="Folio, UUID, RFC o nombre del emisor..."
          value={buscar}
          onChange={(e) => {
            setBuscar(e.currentTarget.value);
            setPage(1);
          }}
          leftSection={<IconSearch size={16} />}
        />
      </Card>

      <Card shadow="sm" padding={0} radius="md" withBorder style={{ overflowX: 'auto' }}>
        <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Folio</Table.Th>
              <Table.Th>Monto</Table.Th>
              <Table.Th>Fecha</Table.Th>
              <Table.Th>RFC Emisor</Table.Th>
              <Table.Th>Emisor</Table.Th>
              <Table.Th>UUID</Table.Th>
              <Table.Th></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading ? (
              <Table.Tr>
                <Table.Td colSpan={7}>
                  <Text ta="center" c="dimmed" py="lg">Cargando ingresos...</Text>
                </Table.Td>
              </Table.Tr>
            ) : items.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={7}>
                  <Text ta="center" c="dimmed" py="lg">No se encontraron resultados.</Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              items.map((ing) => (
                <Table.Tr key={ing.id}>
                  <Table.Td fw={600}>{ing.folio || '—'}</Table.Td>
                  <Table.Td>{ing.monto ? `$${ing.monto}` : '—'}</Table.Td>
                  <Table.Td>{ing.fecha || '—'}</Table.Td>
                  <Table.Td>{ing.rfc_emisor || '—'}</Table.Td>
                  <Table.Td>
                    <Text size="xs" truncate maw={200}>{ing.nombre_emisor || '—'}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" ff="monospace">{ing.uuid}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="violet"
                        onClick={() => copiarUuid(ing.uuid)}
                        title="Copiar UUID"
                      >
                        <IconCopy size={16} />
                      </ActionIcon>
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="blue"
                        onClick={() => setEditandoId(ing.id)}
                        title="Editar"
                      >
                        <IconEdit size={16} />
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>

        {!isLoading && meta.pages > 1 && (
          <Box p="md" style={{ display: 'flex', justifyContent: 'center' }}>
            <Pagination total={meta.pages} value={page} onChange={setPage} color="blue" size="sm" />
          </Box>
        )}
      </Card>

      <IngresoEditModal ingresoId={editandoId} onClose={() => setEditandoId(null)} />
    </Stack>
  );
}

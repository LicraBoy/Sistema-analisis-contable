import {
  Button,
  Card,
  Grid,
  Group,
  List,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { Dropzone, MS_EXCEL_MIME_TYPE } from '@mantine/dropzone';
import { notifications } from '@mantine/notifications';
import {
  IconCheck,
  IconFileSpreadsheet,
  IconUpload,
  IconX,
  IconFileInvoice,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useReporte601 } from '../api/hooks';

export default function Reporte601Page() {
  const reporte601 = useReporte601();
  const [ingresosFile, setIngresosFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const executeFiltro = () => {
    if (!ingresosFile) return;
    setIsProcessing(true);

    reporte601.mutate(ingresosFile, {
      onSuccess: (blob) => {
        notifications.show({
          title: '¡Reporte generado!',
          message: 'El reporte de validación fiscal de ingresos se ha descargado.',
          color: 'teal',
          icon: <IconCheck size={16} />,
        });

        // Trigger browser file download
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'Reporte_Validacion_Fiscal.xlsx';
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);

        setIsProcessing(false);
      },
      onError: (err: any) => {
        notifications.show({
          title: 'Error',
          message: err.response?.data?.detail || 'Ocurrió un error al procesar el archivo.',
          color: 'red',
          icon: <IconX size={16} />,
        });
        setIsProcessing(false);
      },
    });
  };

  return (
    <Stack gap="lg">
      <Title order={2}>Reporte Especial: Validación Fiscal (Régimen 601)</Title>
      <Text c="dimmed">
        Sube tu archivo de Ingresos Recibidos para generar un análisis completo que detecta regímenes receptores distintos a 601, vacíos, emisores diferentes al esperado y anomalías en UUIDs.
      </Text>

      <Grid>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Stack gap="md">
              <Group justify="space-between">
                <Group>
                  <ThemeIcon size={40} radius="md" variant="light" color="blue">
                    <IconFileSpreadsheet size={24} />
                  </ThemeIcon>
                  <div>
                    <Text fw={600}>Archivo de Ingresos</Text>
                    <Text size="xs" c="dimmed">
                      Selecciona tu archivo de ingresos para analizar
                    </Text>
                  </div>
                </Group>
                {ingresosFile && (
                  <Button
                    onClick={executeFiltro}
                    color="blue"
                    disabled={isProcessing}
                    loading={isProcessing}
                  >
                    Generar Reporte
                  </Button>
                )}
              </Group>

              {ingresosFile ? (
                <Card withBorder padding="md" radius="sm">
                  <Group justify="space-between">
                    <Group>
                      <IconFileInvoice size={24} color="var(--mantine-color-blue-6)" />
                      <Text fw={500}>{ingresosFile.name}</Text>
                    </Group>
                    <Button variant="subtle" color="red" size="xs" onClick={() => setIngresosFile(null)}>
                      Quitar
                    </Button>
                  </Group>
                </Card>
              ) : (
                <Dropzone
                  onDrop={(files) => setIngresosFile(files[0])}
                  accept={MS_EXCEL_MIME_TYPE}
                  maxSize={50 * 1024 * 1024}
                  maxFiles={1}
                >
                  <Group
                    justify="center"
                    gap="xl"
                    mih={140}
                    style={{ pointerEvents: 'none' }}
                  >
                    <Dropzone.Accept>
                      <IconUpload size={40} stroke={1.5} color="var(--mantine-color-blue-6)" />
                    </Dropzone.Accept>
                    <Dropzone.Reject>
                      <IconX size={40} stroke={1.5} color="var(--mantine-color-red-6)" />
                    </Dropzone.Reject>
                    <Dropzone.Idle>
                      <IconFileSpreadsheet
                        size={40}
                        stroke={1.5}
                        color="var(--mantine-color-dimmed)"
                      />
                    </Dropzone.Idle>

                    <div>
                      <Text size="lg" inline>
                        Arrastra el archivo de Ingresos aquí
                      </Text>
                      <Text size="sm" c="dimmed" inline mt={7}>
                        Se generará un reporte con resumen de validación y lista de revisiones
                      </Text>
                    </div>
                  </Group>
                </Dropzone>
              )}

              <List size="xs" spacing={4} c="dimmed">
                <List.Item>El proceso no altera la base de datos de cruces de la aplicación.</List.Item>
                <List.Item>Se generará 1 hoja con los registros cuyo Régimen Fiscal Receptor sea diferente a 601.</List.Item>
              </List>
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

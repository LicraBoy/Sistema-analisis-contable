/**
 * UploadPage — File upload for Pagos Excel files with filters and optional Ingresos cross-reference.
 */

import {
  Button,
  Card,
  Grid,
  Group,
  List,
  Modal,
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
import { useNavigate } from 'react-router-dom';
import { useUploadIngresos, useUploadPagos } from '../api/hooks';

interface UploadPageProps {
  /** Si se provee (ej. embebido dentro de WorkspacePage), se llama en vez de
   * navegar a /pagos — permite cambiar de pestaña sin salir de la vista unificada. */
  onUploadSuccess?: () => void;
}

export default function UploadPage({ onUploadSuccess }: UploadPageProps = {}) {
  const uploadIngresos = useUploadIngresos();
  const uploadPagos = useUploadPagos();
  const navigate = useNavigate();

  // Wizard state
  const [pagosFile, setPagosFile] = useState<File | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const executePagos = (segundaBusqueda: boolean) => {
    if (!pagosFile) return;
    setIsProcessing(true);

    uploadPagos.mutate(
      {
        file: pagosFile,
        segundaBusqueda,
      },
      {
        onSuccess: (res) => {
          notifications.show({
            title: '¡Procesamiento completo!',
            message: res.message || 'Tu reporte de pagos ha sido procesado con éxito.',
            color: 'teal',
            icon: <IconCheck size={16} />,
          });

          setIsModalOpen(false);
          setIsProcessing(false);

          // Si está embebido en el flujo unificado, cambiar de pestaña en vez
          // de navegar a la página standalone /pagos.
          if (onUploadSuccess) {
            onUploadSuccess();
          } else {
            navigate('/pagos');
          }
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
      }
    );
  };

  const handleIngresosUpload = (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setIsProcessing(true);

    uploadIngresos.mutate(file, {
      onSuccess: () => {
        notifications.show({
          title: '¡Ingresos cargados!',
          message: 'Archivo de ingresos guardado, procediendo con la segunda búsqueda...',
          color: 'teal',
          icon: <IconCheck size={16} />,
        });
        // Now trigger the Pagos upload WITH the second search flag enabled
        executePagos(true);
      },
      onError: (err: any) => {
        notifications.show({
          title: 'Error',
          message: err.response?.data?.detail || 'No se pudo cargar el archivo de ingresos.',
          color: 'red',
          icon: <IconX size={16} />,
        });
        setIsProcessing(false);
      },
    });
  };

  return (
    <Stack gap="lg">
      <Title order={2}>Análisis de Pagos</Title>
      <Text c="dimmed">
        Sube tu archivo de pagos para cruzar UUIDs de manera automática.
      </Text>

      <Grid>
        {/* ── Pagos Dropzone ───────────────────────── */}
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Stack gap="md">
              <Group justify="space-between">
                <Group>
                  <ThemeIcon size={40} radius="md" variant="light" color="violet">
                    <IconFileSpreadsheet size={24} />
                  </ThemeIcon>
                  <div>
                    <Text fw={600}>Archivo de Pagos</Text>
                    <Text size="xs" c="dimmed">
                      Selecciona tu archivo para procesarlo
                    </Text>
                  </div>
                </Group>
                {pagosFile && (
                  <Button 
                    onClick={() => setIsModalOpen(true)}
                    color="violet"
                    disabled={isProcessing}
                  >
                    Procesar e Ir a Revisión
                  </Button>
                )}
              </Group>

              {pagosFile ? (
                <Card withBorder padding="md" radius="sm">
                  <Group justify="space-between">
                    <Group>
                      <IconFileInvoice size={24} color="var(--mantine-color-violet-6)" />
                      <Text fw={500}>{pagosFile.name}</Text>
                    </Group>
                    <Button variant="subtle" color="red" size="xs" onClick={() => setPagosFile(null)}>
                      Quitar
                    </Button>
                  </Group>
                </Card>
              ) : (
                <Dropzone
                  id="dropzone-pagos"
                  onDrop={(files) => setPagosFile(files[0])}
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
                      <IconUpload size={40} stroke={1.5} color="var(--mantine-color-violet-6)" />
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
                        Arrastra el archivo de Pagos aquí
                      </Text>
                      <Text size="sm" c="dimmed" inline mt={7}>
                        Se cargará temporalmente para su configuración
                      </Text>
                    </div>
                  </Group>
                </Dropzone>
              )}

              <List size="xs" spacing={4} c="dimmed">
                <List.Item>Columnas esperadas: A=Tipo, D=Fecha, F=Factura, L=UUID</List.Item>
                <List.Item>La primera búsqueda cruzará internamente en el mismo archivo (F -{">"} C)</List.Item>
              </List>
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>

      {/* ── Wizard Modal ───────────────────────────── */}
      <Modal 
        opened={isModalOpen} 
        onClose={() => !isProcessing && setIsModalOpen(false)} 
        title={<Text fw={600}>Opciones de Búsqueda</Text>}
        size="lg"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            ¿Deseas realizar la <b>Segunda Búsqueda</b> cruzando la información con un archivo de CFDI de Ingresos?
          </Text>
          <Text size="xs" c="dimmed">
            Si eliges no hacerlo, el reporte se generará únicamente con los datos encontrados en la Primera Búsqueda (Cruce Interno).
          </Text>
          
          <Group grow>
            <Button 
              variant="light" 
              color="gray" 
              onClick={() => executePagos(false)}
              loading={isProcessing && !uploadIngresos.isPending}
              disabled={isProcessing}
            >
              No, solo búsqueda interna
            </Button>
          </Group>

          <Text size="sm" fw={600} mt="md">
            Sí, cruzar con Ingresos:
          </Text>
          
          <Dropzone
            id="dropzone-ingresos"
            onDrop={handleIngresosUpload}
            accept={MS_EXCEL_MIME_TYPE}
            maxSize={50 * 1024 * 1024}
            maxFiles={1}
            loading={isProcessing}
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
                  color="var(--mantine-color-blue-6)"
                />
              </Dropzone.Idle>

              <div>
                <Text size="lg" inline>
                  Arrastra tu archivo de Ingresos aquí
                </Text>
                <Text size="sm" c="dimmed" inline mt={7}>
                  El procesamiento comenzará automáticamente al soltar el archivo
                </Text>
              </div>
            </Group>
          </Dropzone>
        </Stack>
      </Modal>
    </Stack>
  );
}

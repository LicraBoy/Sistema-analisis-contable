/**
 * IngresoEditModal — edita CADA columna de un registro de Ingresos
 * (rfc_emisor/nombre_emisor + todas las claves de datos_extra). El UUID se
 * muestra de solo lectura: es la clave que conecta este Ingreso con su Pago
 * en todo el sistema (Amarre, conciliaciones), y editarlo mal podría romper
 * ese cruce o chocar con otro registro.
 */

import { useEffect, useState } from 'react';
import { Button, Group, Loader, Modal, ScrollArea, Stack, Switch, Text, TextInput } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useIngreso, useUpdateIngreso } from '../api/hooks';

// Clave de datos_extra usada para marcar manualmente una factura como IVA
// Exento (para el Pre-DIOT/DIOT) — no hay forma de derivarlo automáticamente
// de los datos que se importan hoy (ver _construir_filas_pre_diot). Tiene su
// propio control (Switch) en vez de aparecer en la lista dinámica de campos.
const CLAVE_EXENTO_MANUAL = 'IVA Exento Manual';

export function IngresoEditModal({
  ingresoId,
  onClose,
}: {
  ingresoId: number | null;
  onClose: () => void;
}) {
  const { data: ingreso, isLoading } = useIngreso(ingresoId);
  const updateIngreso = useUpdateIngreso();
  const queryClient = useQueryClient();

  const [rfcEmisor, setRfcEmisor] = useState('');
  const [nombreEmisor, setNombreEmisor] = useState('');
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [exentoManual, setExentoManual] = useState(false);

  useEffect(() => {
    if (!ingreso) return;
    setRfcEmisor(ingreso.rfc_emisor || '');
    setNombreEmisor(ingreso.nombre_emisor || '');
    const iniciales: Record<string, string> = {};
    for (const [clave, valor] of Object.entries(ingreso.datos_extra || {})) {
      if (clave === CLAVE_EXENTO_MANUAL) continue;
      iniciales[clave] = valor == null ? '' : String(valor);
    }
    setCampos(iniciales);
    setExentoManual(
      String(ingreso.datos_extra?.[CLAVE_EXENTO_MANUAL] ?? '').trim().toLowerCase() === 'true'
    );
  }, [ingreso]);

  const handleSave = () => {
    if (!ingresoId) return;
    updateIngreso.mutate(
      {
        id: ingresoId,
        data: {
          rfc_emisor: rfcEmisor,
          nombre_emisor: nombreEmisor,
          datos_extra: { ...campos, [CLAVE_EXENTO_MANUAL]: exentoManual ? 'true' : 'false' },
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['ingresos-list'] });
          queryClient.invalidateQueries({ queryKey: ['ingreso', ingresoId] });
          notifications.show({ title: 'Guardado', message: 'Ingreso actualizado', color: 'teal' });
          onClose();
        },
        onError: () => {
          notifications.show({ title: 'Error', message: 'No se pudo guardar el ingreso', color: 'red' });
        },
      }
    );
  };

  return (
    <Modal
      opened={ingresoId !== null}
      onClose={onClose}
      title={<Text fw={600}>Editar Ingreso (ID: {ingresoId})</Text>}
      size="lg"
    >
      {isLoading || !ingreso ? (
        <Group justify="center" py="xl">
          <Loader size="sm" />
          <Text c="dimmed">Cargando registro...</Text>
        </Group>
      ) : (
        <Stack>
          <TextInput label="UUID" value={ingreso.uuid} readOnly disabled />
          <TextInput label="RFC Emisor" value={rfcEmisor} onChange={(e) => setRfcEmisor(e.currentTarget.value)} />
          <TextInput label="Nombre Emisor" value={nombreEmisor} onChange={(e) => setNombreEmisor(e.currentTarget.value)} />
          <Switch
            label="Marcar como IVA Exento (para DIOT)"
            description="No se puede detectar automáticamente — actívalo si sabes que esta factura es exenta de IVA, no solo tasa 0%"
            checked={exentoManual}
            onChange={(e) => setExentoManual(e.currentTarget.checked)}
          />

          <ScrollArea.Autosize mah={420} type="auto">
            <Stack gap="xs">
              {Object.keys(campos)
                .sort((a, b) => a.localeCompare(b))
                .map((clave) => (
                  <TextInput
                    key={clave}
                    label={clave}
                    value={campos[clave]}
                    onChange={(e) => setCampos({ ...campos, [clave]: e.currentTarget.value })}
                  />
                ))}
            </Stack>
          </ScrollArea.Autosize>

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} loading={updateIngreso.isPending} color="violet">Guardar Cambios</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

/**
 * PagoRowActions — Editar (modal completo) y Eliminar un registro de Pago.
 * Compartido entre PagosPage y ConciliacionPage.
 */

import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { IconEdit, IconTrash, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdatePago, useDeletePago, buscarCoincidenciaIngreso, IngresoCandidato } from '../api/hooks';
import { EstadoPago, Pago } from '../types';
import { notifications } from '@mantine/notifications';

const MOTIVOS_RAPIDOS = [
  { label: 'UUID estaba vacío', texto: 'Se añadió el UUID correspondiente porque estaba vacío' },
  { label: 'Mismo UUID en varias facturas', texto: 'Se corrigió el UUID porque múltiples facturas tenían el mismo número de factura y el mismo UUID' },
  { label: 'CFDI cancelado/sustituido', texto: 'UUID corregido: el CFDI original fue cancelado y sustituido por uno nuevo' },
];

export function PagoRowActions({ pago }: { pago: Pago }) {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const uuidOriginal = pago.uuid === 'NO SE PAGO' ? '' : (pago.uuid || '');
  const [formData, setFormData] = useState({
    tipo_movimiento: pago.tipo_movimiento,
    factura: pago.factura,
    fecha: pago.fecha || '',
    uuid: uuidOriginal,
    estado: pago.estado,
    motivo: '',
  });

  const [isMatchModalOpen, setIsMatchModalOpen] = useState(false);
  const [isSearchingMatch, setIsSearchingMatch] = useState(false);
  const [candidatos, setCandidatos] = useState<IngresoCandidato[]>([]);
  const [motivoEliminacion, setMotivoEliminacion] = useState(
    pago.estado === EstadoPago.DUPLICADO ? 'Cancelado y vuelto a pagar' : ''
  );

  const updatePago = useUpdatePago();
  const deletePago = useDeletePago();
  const queryClient = useQueryClient();

  const uuidCambiado = formData.uuid !== uuidOriginal;

  const handleSave = () => {
    if (uuidCambiado && !formData.motivo.trim()) {
      notifications.show({ title: 'Falta el motivo', message: 'Explica por qué cambió el UUID antes de guardar', color: 'red' });
      return;
    }
    updatePago.mutate(
      { id: pago.id, data: uuidCambiado ? formData : { ...formData, motivo: undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['pagos'] });
          queryClient.invalidateQueries({ queryKey: ['conciliacion'] });
          setIsEditModalOpen(false);
          notifications.show({ title: 'Guardado', message: 'Fila actualizada', color: 'teal' });
        }
      }
    )
  };

  const handleDelete = () => {
    if (!motivoEliminacion.trim()) {
      notifications.show({ title: 'Falta el motivo', message: 'Explica por qué se elimina este registro', color: 'red' });
      return;
    }
    deletePago.mutate({ id: pago.id, motivo: motivoEliminacion.trim() }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['pagos'] });
        queryClient.invalidateQueries({ queryKey: ['conciliacion'] });
        setIsDeleteModalOpen(false);
        notifications.show({ title: 'Eliminado', message: 'Fila eliminada correctamente', color: 'teal' });
      }
    });
  };

  // "No Pagado" y "Encontrado con UUID no verificado" comparten el mismo problema:
  // su Factura no es un folio real confiable para buscar en Ingresos.
  const sinFolioConfiable = pago.estado === EstadoPago.NO_PAGADO || !pago.uuid_verificado;

  const handleBuscarCoincidencia = async () => {
    setIsMatchModalOpen(true);
    setIsSearchingMatch(true);
    try {
      const monto = pago.datos_extra?.['8'] != null ? String(pago.datos_extra['8']) : undefined;
      const resultado = await buscarCoincidenciaIngreso({
        folio: sinFolioConfiable ? undefined : pago.factura,
        monto,
        fecha: pago.fecha || undefined,
        fecha_alt: sinFolioConfiable && pago.datos_extra?.['6'] != null ? String(pago.datos_extra['6']) : undefined,
      });
      setCandidatos(resultado.candidatos);
    } catch {
      notifications.show({ title: 'Error', message: 'No se pudo buscar en Ingresos', color: 'red' });
      setCandidatos([]);
    } finally {
      setIsSearchingMatch(false);
    }
  };

  const handleUsarCandidato = (candidato: IngresoCandidato) => {
    const motivo = sinFolioConfiable
      ? `Corregido mediante búsqueda en Ingresos: coincide monto y fecha${candidato.coincide_exacto ? ' (coincidencia exacta)' : ''} — factura original no confiable`
      : `Corregido mediante búsqueda en Ingresos: coincide folio y monto${candidato.coincide_exacto ? ' (coincidencia exacta)' : ''}`;
    updatePago.mutate(
      {
        id: pago.id,
        data: {
          uuid: candidato.uuid,
          ...(candidato.folio ? { factura: candidato.folio } : {}),
          motivo,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['pagos'] });
          queryClient.invalidateQueries({ queryKey: ['conciliacion'] });
          setIsMatchModalOpen(false);
          notifications.show({ title: 'Guardado', message: 'UUID y factura actualizados desde Ingresos', color: 'teal' });
        },
      }
    );
  };

  return (
    <>
      <Group gap="xs" wrap="nowrap">
        <ActionIcon size="sm" variant="subtle" color="violet" onClick={() => setIsEditModalOpen(true)} title="Editar">
          <IconEdit size={16} />
        </ActionIcon>
        <ActionIcon size="sm" variant="subtle" color="blue" onClick={handleBuscarCoincidencia} title="Buscar en Ingresos">
          <IconSearch size={16} />
        </ActionIcon>
        <ActionIcon size="sm" variant="subtle" color="red" onClick={() => setIsDeleteModalOpen(true)} title="Eliminar">
          <IconTrash size={16} />
        </ActionIcon>
      </Group>

      {/* Edit Modal */}
      <Modal opened={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={<Text fw={600}>Editar Fila (ID: {pago.id})</Text>}>
         <Stack>
            <TextInput label="Tipo de Movimiento" value={formData.tipo_movimiento} onChange={(e) => setFormData({...formData, tipo_movimiento: e.currentTarget.value})} />
            <TextInput label="Factura" value={formData.factura} onChange={(e) => setFormData({...formData, factura: e.currentTarget.value})} />
            <TextInput label="Fecha" type="date" value={formData.fecha} onChange={(e) => setFormData({...formData, fecha: e.currentTarget.value})} />
            <TextInput label="UUID" value={formData.uuid} onChange={(e) => setFormData({...formData, uuid: e.currentTarget.value})} />
            {uuidCambiado && (
              <Stack gap={4}>
                <TextInput
                  label="Motivo del cambio"
                  description="Explica por qué se corrigió el UUID (para el reporte de auditoría)"
                  placeholder="Ej. CFDI cancelado, se sustituyó por el nuevo"
                  required
                  value={formData.motivo}
                  onChange={(e) => setFormData({...formData, motivo: e.currentTarget.value})}
                />
                <Group gap={6}>
                  {MOTIVOS_RAPIDOS.map((m) => (
                    <Button
                      key={m.label}
                      size="compact-xs"
                      variant="light"
                      color="gray"
                      onClick={() => setFormData({...formData, motivo: m.texto})}
                    >
                      {m.label}
                    </Button>
                  ))}
                </Group>
              </Stack>
            )}
            <Select
              label="Estado"
              data={[
                {value: EstadoPago.ENCONTRADO, label: 'Encontrado'},
                {value: EstadoPago.NO_PAGADO, label: 'No Pagado'},
                {value: EstadoPago.DUPLICADO, label: 'Duplicado'},
              ]}
              value={formData.estado}
              onChange={(v) => setFormData({...formData, estado: v as EstadoPago})}
            />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setIsEditModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} loading={updatePago.isPending} disabled={uuidCambiado && !formData.motivo.trim()} color="violet">Guardar Cambios</Button>
            </Group>
         </Stack>
      </Modal>

      {/* Delete Modal */}
      <Modal opened={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title={<Text fw={600} c="red">Confirmar Eliminación</Text>}>
         <Stack>
            <Text>¿Estás seguro de que deseas eliminar este registro (Factura: <b>{pago.factura}</b>)? Esta acción no se puede deshacer y el registro no aparecerá en el archivo Excel generado.</Text>
            <TextInput
              label="Motivo de la eliminación"
              description="Queda registrado en el reporte de auditoría"
              placeholder="Ej. Cancelado y vuelto a pagar"
              required
              value={motivoEliminacion}
              onChange={(e) => setMotivoEliminacion(e.currentTarget.value)}
            />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setIsDeleteModalOpen(false)}>Cancelar</Button>
              <Button color="red" loading={deletePago.isPending} disabled={!motivoEliminacion.trim()} onClick={handleDelete}>Eliminar</Button>
            </Group>
         </Stack>
      </Modal>

      {/* Buscar en Ingresos Modal */}
      <Modal
        opened={isMatchModalOpen}
        onClose={() => setIsMatchModalOpen(false)}
        title={
          <Text fw={600}>
            {sinFolioConfiable
              ? `Coincidencias en Ingresos (Monto: $${pago.datos_extra?.['8'] ?? '—'})`
              : `Coincidencias en Ingresos (Factura: ${pago.factura})`}
          </Text>
        }
        size="lg"
      >
        {isSearchingMatch ? (
          <Group justify="center" py="xl">
            <Loader size="sm" />
            <Text c="dimmed">Buscando en Ingresos...</Text>
          </Group>
        ) : candidatos.length === 0 ? (
          <Text c="dimmed" ta="center" py="lg">
            {sinFolioConfiable
              ? 'No se encontraron coincidencias en Ingresos por monto y fecha.'
              : 'No se encontraron coincidencias en Ingresos para esta factura.'}
          </Text>
        ) : (
          <Table striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Monto</Table.Th>
                <Table.Th>Fecha</Table.Th>
                <Table.Th>Emisor</Table.Th>
                <Table.Th>UUID</Table.Th>
                <Table.Th></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {candidatos.map((c) => (
                <Table.Tr key={c.uuid}>
                  <Table.Td>
                    {c.monto ? `$${c.monto}` : '—'}
                    {c.coincide_exacto && (
                      <Badge color="teal" size="xs" ml={6}>Coincidencia exacta</Badge>
                    )}
                  </Table.Td>
                  <Table.Td>{c.fecha || '—'}</Table.Td>
                  <Table.Td>
                    <Text size="xs" truncate maw={150}>{c.nombre_emisor || '—'}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" ff="monospace">{c.uuid}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Button
                      size="xs"
                      color="violet"
                      loading={updatePago.isPending}
                      onClick={() => handleUsarCandidato(c)}
                    >
                      Usar este UUID
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Modal>
    </>
  );
}

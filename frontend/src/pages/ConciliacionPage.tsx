import React, { useState } from 'react';
import {
  Container,
  Title,
  Text,
  Card,
  Table,
  Badge,
  Group,
  Stack,
  Loader,
  Alert,
  ActionIcon,
  Collapse,
  TextInput,
  Select,
  Pagination,
  Box,
  NumberInput,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconChevronDown, IconChevronUp, IconAlertCircle, IconSearch } from '@tabler/icons-react';
import { useConciliacion } from '../api/hooks';
import { PagoRowActions } from '../components/PagoRowActions';
import { EstadoPago } from '../types';
import { SEMANTIC_COLORS } from '../theme/tokens';
import { ESTADO_PAGO_CONFIG } from '../theme/estadoPago';

interface PagoAsociado {
  id: number;
  uuid: string | null;
  factura: string;
  tipo_movimiento: string;
  fecha: string | null;
  estado: EstadoPago;
  observaciones: string | null;
  datos_extra: Record<string, any> | null;
  archivo_id: number | null;
  created_at: string;
  uuid_verificado: boolean;
}

interface Ingreso {
  id: number;
  uuid: string;
  rfc_emisor: string | null;
  nombre_emisor: string | null;
  datos_extra: Record<string, any> | null;
}

interface ConciliacionRecord {
  ingreso: Ingreso;
  pagos_asociados: PagoAsociado[];
  estado_conciliacion: 'conciliado' | 'faltante' | 'multiples';
  cantidad_pagos: number;
  mismo_factura: boolean;
}

const estadoConfig: Record<string, { color: string; label: string }> = {
  conciliado: { color: SEMANTIC_COLORS.success, label: 'Conciliado (1)' },
  faltante: { color: SEMANTIC_COLORS.error, label: 'Faltante (0)' },
  multiples: { color: SEMANTIC_COLORS.warning, label: 'Múltiples Pagos' },
};

export const ConciliacionPage = () => {
  const [buscar, setBuscar] = useState('');
  const [debouncedBuscar] = useDebouncedValue(buscar, 300);
  const [estado, setEstado] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Filtro de fecha (Mes/Año), igual que en Pagos
  const [filterMes, setFilterMes] = useState<string | null>(String(new Date().getMonth() + 1));
  const [filterAnio, setFilterAnio] = useState<number | ''>(new Date().getFullYear());

  let fecha_desde: string | undefined = undefined;
  let fecha_hasta: string | undefined = undefined;
  if (filterMes && filterAnio) {
    const month = parseInt(filterMes, 10);
    const year = Number(filterAnio);
    if (!isNaN(month) && !isNaN(year)) {
      fecha_desde = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      fecha_hasta = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
    }
  }

  // Resetea la página cuando cambian los filtros
  React.useEffect(() => {
    setPage(1);
  }, [debouncedBuscar, estado, filterMes, filterAnio]);

  const { data: result, isLoading: loading, isError, error } = useConciliacion({
    page,
    page_size: pageSize,
    estado: estado || undefined,
    buscar: debouncedBuscar || undefined,
    fecha_desde,
    fecha_hasta,
  });

  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [expandedUuid, setExpandedUuid] = useState<string | null>(null);

  const data: ConciliacionRecord[] = result?.data || [];
  const meta = result?.meta || { total: 0, page: 1, pages: 1 };

  // Mantiene visible (y actualizada) la fila que se está editando, aunque
  // deje de calificar para el filtro de Estado activo tras guardar un cambio.
  const { data: pinnedResult } = useConciliacion({
    buscar: expandedUuid || undefined,
    page: 1,
    page_size: 1,
  });
  const pinnedRecord: ConciliacionRecord | undefined = expandedUuid
    ? pinnedResult?.data?.[0]
    : undefined;

  const mainIds = new Set(data.map((r) => r.ingreso.id));
  const displayData =
    pinnedRecord && !mainIds.has(pinnedRecord.ingreso.id)
      ? [pinnedRecord, ...data]
      : data;

  const toggleRow = (record: ConciliacionRecord) => {
    if (expandedRow === record.ingreso.id) {
      setExpandedRow(null);
      setExpandedUuid(null);
    } else {
      setExpandedRow(record.ingreso.id);
      setExpandedUuid(record.ingreso.uuid);
    }
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={2}>Conciliación de Ingresos vs Pagos</Title>
          <Text c="dimmed">
            Vista comparativa donde Ingresos Recibidos es el documento base. Permite detectar faltantes y múltiples pagos asignados al mismo UUID.
          </Text>
        </div>

        <Card shadow="sm" padding="md" radius="md" withBorder>
          <Group align="flex-end">
            <TextInput
              label="Buscar"
              placeholder="UUID o RFC..."
              value={buscar}
              onChange={(e) => setBuscar(e.currentTarget.value)}
              leftSection={<IconSearch size="1rem" />}
              style={{ flex: 1 }}
            />
            <Select
              label="Estado"
              placeholder="Todos"
              data={[
                { value: 'conciliado', label: 'Conciliado (1)' },
                { value: 'multiples', label: 'Múltiples Pagos' },
              ]}
              value={estado}
              onChange={setEstado}
              clearable
              style={{ width: 250 }}
            />
            <Select
              label="Mes"
              placeholder="Mes"
              clearable
              data={[
                { value: '1', label: 'Enero' },
                { value: '2', label: 'Febrero' },
                { value: '3', label: 'Marzo' },
                { value: '4', label: 'Abril' },
                { value: '5', label: 'Mayo' },
                { value: '6', label: 'Junio' },
                { value: '7', label: 'Julio' },
                { value: '8', label: 'Agosto' },
                { value: '9', label: 'Septiembre' },
                { value: '10', label: 'Octubre' },
                { value: '11', label: 'Noviembre' },
                { value: '12', label: 'Diciembre' },
              ]}
              value={filterMes}
              onChange={setFilterMes}
              w={140}
            />
            <NumberInput
              label="Año"
              placeholder="2026"
              value={filterAnio}
              onChange={(val) => setFilterAnio(val as number)}
              w={100}
            />
          </Group>
        </Card>

        {isError && (
          <Alert icon={<IconAlertCircle size="1rem" />} title="Error" color="red">
            {(error as any)?.response?.data?.detail || (error as Error)?.message || 'Error al cargar datos'}
          </Alert>
        )}

        <Card shadow="sm" padding={0} radius="md" withBorder style={{ overflowX: 'auto' }}>
          <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: 40 }}></Table.Th>
                <Table.Th>UUID (Ingreso)</Table.Th>
                <Table.Th>Folio / Factura</Table.Th>
                <Table.Th>Monto</Table.Th>
                <Table.Th>Fecha</Table.Th>
                <Table.Th>Emisor</Table.Th>
                <Table.Th>Estado</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {loading ? (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Group justify="center" py="xl">
                      <Loader size="sm" />
                      <Text c="dimmed">Cargando conciliación...</Text>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ) : displayData.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Text ta="center" c="dimmed" py="lg">
                      No se encontraron resultados.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                displayData.map((record) => {
                  const isExpanded = expandedRow === record.ingreso.id;
                  const config = estadoConfig[record.estado_conciliacion];
                  const hasPagos = record.cantidad_pagos > 0;

                  return (
                    <React.Fragment key={record.ingreso.id}>
                      <Table.Tr bg={record.estado_conciliacion === 'multiples' ? 'orange.0' : record.estado_conciliacion === 'faltante' ? 'red.0' : undefined}>
                        <Table.Td>
                          {hasPagos && (
                            <ActionIcon onClick={() => toggleRow(record)} variant="subtle" color="gray">
                              {isExpanded ? <IconChevronUp size="1rem" /> : <IconChevronDown size="1rem" />}
                            </ActionIcon>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" ff="monospace" fw={500}>{record.ingreso.uuid}</Text>
                        </Table.Td>
                        <Table.Td>{record.ingreso.datos_extra?.folio || '—'}</Table.Td>
                        <Table.Td fw={500}>
                          {record.ingreso.datos_extra?.monto ? `$${record.ingreso.datos_extra.monto}` : '—'}
                        </Table.Td>
                        <Table.Td>{record.ingreso.datos_extra?.fecha || '—'}</Table.Td>
                        <Table.Td>
                          <Text size="xs" truncate maw={150}>
                            {record.ingreso.nombre_emisor || '—'}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge color={config?.color || 'gray'} variant="light">
                            {record.estado_conciliacion === 'multiples'
                              ? record.mismo_factura
                                ? 'Múltiples (misma factura)'
                                : 'Múltiples (facturas distintas)'
                              : config?.label || record.estado_conciliacion}
                          </Badge>
                        </Table.Td>
                      </Table.Tr>
                      
                      {/* Expanded Row Content */}
                      {hasPagos && (
                        <Table.Tr style={{ display: isExpanded ? 'table-row' : 'none' }}>
                          <Table.Td colSpan={7} p={0}>
                            <Collapse in={isExpanded}>
                              <div
                                style={{
                                  padding: '16px 32px',
                                  backgroundColor: 'var(--mantine-color-default-hover)',
                                }}
                              >
                                <Text fw={600} size="sm" mb="sm">Pagos Asociados ({record.cantidad_pagos})</Text>
                                <Table withColumnBorders withTableBorder bg="var(--mantine-color-body)">
                                  <Table.Thead>
                                    <Table.Tr>
                                      <Table.Th>ID Pago</Table.Th>
                                      <Table.Th>Factura Pago</Table.Th>
                                      <Table.Th>Monto Pago (Col 8)</Table.Th>
                                      <Table.Th>Fecha Pago (Col 3)</Table.Th>
                                      <Table.Th>UUID</Table.Th>
                                      <Table.Th>Estado Pagos</Table.Th>
                                      <Table.Th>Acciones</Table.Th>
                                    </Table.Tr>
                                  </Table.Thead>
                                  <Table.Tbody>
                                    {record.pagos_asociados.map(pago => (
                                      <Table.Tr key={pago.id}>
                                        <Table.Td>{pago.id}</Table.Td>
                                        <Table.Td>{pago.factura}</Table.Td>
                                        <Table.Td>{pago.datos_extra?.['8'] || '—'}</Table.Td>
                                        <Table.Td>{pago.datos_extra?.['3'] || pago.fecha || '—'}</Table.Td>
                                        <Table.Td>
                                          <Text size="xs" ff="monospace" truncate maw={220}>
                                            {pago.uuid || 'NO SE PAGO'}
                                          </Text>
                                        </Table.Td>
                                        <Table.Td>
                                          <Badge
                                            color={ESTADO_PAGO_CONFIG[pago.estado]?.color || 'gray'}
                                            variant="dot"
                                            size="sm"
                                          >
                                            {ESTADO_PAGO_CONFIG[pago.estado]?.label || pago.estado}
                                          </Badge>
                                        </Table.Td>
                                        <Table.Td>
                                          <PagoRowActions pago={pago} />
                                        </Table.Td>
                                      </Table.Tr>
                                    ))}
                                  </Table.Tbody>
                                </Table>
                              </div>
                            </Collapse>
                          </Table.Td>
                        </Table.Tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </Table.Tbody>
          </Table>
          
          {/* Pagination */}
          {!loading && meta.pages > 1 && (
            <Box p="md" style={{ display: 'flex', justifyContent: 'center' }}>
              <Pagination
                total={meta.pages}
                value={page}
                onChange={setPage}
                color="blue"
                size="sm"
              />
            </Box>
          )}
        </Card>
      </Stack>
    </Container>
  );
};

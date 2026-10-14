/**
 * AmarreCostoPage — "Amarre de Costo de Ventas" (Inventarios). Módulo 5,
 * independiente del resto del sistema. Cada mes se sube 12 archivos crudos
 * de Novohit (uno por almacén/tipo, en cualquier orden) y el backend arma
 * los 3 reportes finales: Amarre COSTO, 2DATOS ENTRYSAL, 4Resumen INV.
 * Ver `services/amarre_costo_parsing.py` para el detalle de qué campos se
 * calculan automáticamente y cuáles quedan como huecos manuales (sin
 * fuente en ningún reporte de origen).
 */

import { Badge, Button, Card, Group, NumberInput, Progress, SimpleGrid, Stack, Table, Tabs, Text, TextInput, Title } from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { Dropzone, MS_EXCEL_MIME_TYPE } from '@mantine/dropzone';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconBuildingWarehouse, IconCheck, IconDownload, IconFileUpload, IconPlus, IconTrash, IconUpload, IconX } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import {
  TIPOS_ARCHIVO_AMARRE_COSTO,
  useAmarreCostoAgregarConsignacion,
  useAmarreCostoDetalle,
  useAmarreCostoEliminarConsignacion,
  useAmarreCostoExport,
  useAmarreCostoManual,
  useAmarreCostoPeriodos,
  useAmarreCostoUpload,
  useComparacionBalanza2,
  type TipoArchivoAmarreCosto,
} from '../api/hooks';

const formatoMoneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

function moneda(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? '—' : formatoMoneda.format(valor);
}

function fechaAPeriodo(fecha: Date | null): string | null {
  if (!fecha) return null;
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${anio}-${mes}`;
}

function periodoAFecha(periodo: string | null): Date | null {
  if (!periodo) return null;
  const [anio, mes] = periodo.split('-').map(Number);
  return new Date(anio, mes - 1, 1);
}

function TarjetaUpload({ periodo, tipo, etiqueta, cargado }: { periodo: string; tipo: TipoArchivoAmarreCosto; etiqueta: string; cargado: boolean }) {
  const upload = useAmarreCostoUpload();

  const onDrop = (archivos: File[]) => {
    const archivo = archivos[0];
    if (!archivo) return;
    upload.mutate(
      { periodo, tipo, archivo },
      {
        onSuccess: () => notifications.show({ color: 'green', message: `${etiqueta}: archivo cargado` }),
        onError: (err: any) => notifications.show({ color: 'red', message: err?.response?.data?.detail || 'Error al subir el archivo' }),
      },
    );
  };

  return (
    <Card withBorder padding="sm" radius="md">
      <Group justify="space-between" mb={4}>
        <Text size="sm" fw={500}>{etiqueta}</Text>
        {cargado ? <Badge color="green" leftSection={<IconCheck size={12} />}>Cargado</Badge> : <Badge color="gray">Pendiente</Badge>}
      </Group>
      <Dropzone onDrop={onDrop} accept={MS_EXCEL_MIME_TYPE} loading={upload.isPending} maxFiles={1} multiple={false}>
        <Group justify="center" gap="xs" py="xs" style={{ pointerEvents: 'none' }}>
          <Dropzone.Accept><IconUpload size={20} /></Dropzone.Accept>
          <Dropzone.Reject><IconX size={20} /></Dropzone.Reject>
          <Dropzone.Idle><IconFileUpload size={20} /></Dropzone.Idle>
          <Text size="xs" c="dimmed">{cargado ? 'Reemplazar archivo' : 'Arrastra o haz clic'}</Text>
        </Group>
      </Dropzone>
    </Card>
  );
}

function SeccionCarga({ periodo, archivosCargados }: { periodo: string; archivosCargados: string[] }) {
  const grupos = useMemo(() => {
    const mapa = new Map<string, typeof TIPOS_ARCHIVO_AMARRE_COSTO[number][]>();
    for (const item of TIPOS_ARCHIVO_AMARRE_COSTO) {
      if (!mapa.has(item.grupo)) mapa.set(item.grupo, []);
      mapa.get(item.grupo)!.push(item);
    }
    return Array.from(mapa.entries());
  }, []);

  const totalCargados = archivosCargados.length;
  const totalArchivos = TIPOS_ARCHIVO_AMARRE_COSTO.length;

  return (
    <Card withBorder padding="md" radius="md" mb="md">
      <Group justify="space-between" mb="sm">
        <Title order={5}>Archivos del periodo</Title>
        <Text size="sm" c="dimmed">{totalCargados}/{totalArchivos} cargados</Text>
      </Group>
      <Progress value={(totalCargados / totalArchivos) * 100} mb="md" />
      <Stack gap="lg">
        {grupos.map(([grupo, items]) => (
          <div key={grupo}>
            <Text size="sm" fw={600} mb="xs" c="dimmed">{grupo}</Text>
            <SimpleGrid cols={{ base: 1, sm: 2, md: items.length > 4 ? 3 : items.length }}>
              {items.map((item) => (
                <TarjetaUpload
                  key={item.tipo}
                  periodo={periodo}
                  tipo={item.tipo}
                  etiqueta={item.etiqueta}
                  cargado={archivosCargados.includes(item.tipo)}
                />
              ))}
            </SimpleGrid>
          </div>
        ))}
      </Stack>
    </Card>
  );
}

function CampoManual({
  periodo,
  campo,
  etiqueta,
  valor,
}: {
  periodo: string;
  campo: 'inv_final_mantenimiento' | 'entrysal_cafeteria_bebidas' | 'resumen_lavanderia';
  etiqueta: string;
  valor: number | null;
}) {
  const [local, setLocal] = useState<number | ''>(valor ?? '');
  const [debounced] = useDebouncedValue(local, 600);
  const manual = useAmarreCostoManual();

  useEffect(() => setLocal(valor ?? ''), [valor]);

  useEffect(() => {
    if (debounced === (valor ?? '')) return;
    manual.mutate({ periodo, campos: { [campo]: debounced === '' ? null : Number(debounced) } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <NumberInput
      label={etiqueta}
      placeholder="Sin capturar"
      prefix="$ "
      thousandSeparator=","
      decimalScale={2}
      value={local}
      onChange={(v) => setLocal(v === '' ? '' : Number(v))}
      styles={{ label: { fontWeight: 400 } }}
      w={220}
    />
  );
}

function TablaAmarreCosto({ periodo, detalle }: { periodo: string; detalle: ReturnType<typeof useAmarreCostoDetalle>['data'] }) {
  const agregar = useAmarreCostoAgregarConsignacion();
  const eliminar = useAmarreCostoEliminarConsignacion();
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState<number | ''>('');

  if (!detalle) return null;
  const { lineas, totales, consignacion } = detalle.amarre_costo;

  return (
    <Stack>
      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Almacén</Table.Th>
            <Table.Th>Inv. Inicial</Table.Th>
            <Table.Th>Entradas</Table.Th>
            <Table.Th>Salidas/Traspasos</Table.Th>
            <Table.Th>Inv. en Libros</Table.Th>
            <Table.Th>Inv. Final</Table.Th>
            <Table.Th>Diferencia Costo Ventas</Table.Th>
            <Table.Th>Costo Contabilizado</Table.Th>
            <Table.Th>Dif. a Contabilizar</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {lineas.map((l) => (
            <Table.Tr key={l.almacen}>
              <Table.Td fw={500}>{l.almacen}</Table.Td>
              <Table.Td>{moneda(l.inventario_inicial)}</Table.Td>
              <Table.Td>{moneda(l.entradas)}</Table.Td>
              <Table.Td>{moneda(l.salidas_traspasos)}</Table.Td>
              <Table.Td>{moneda(l.inventario_en_libros)}</Table.Td>
              <Table.Td>
                {l.inventario_final === null ? (
                  <CampoManual periodo={periodo} campo="inv_final_mantenimiento" etiqueta="" valor={detalle.huecos_manuales.inv_final_mantenimiento} />
                ) : (
                  moneda(l.inventario_final)
                )}
              </Table.Td>
              <Table.Td>{moneda(l.diferencia_costo_ventas)}</Table.Td>
              <Table.Td>{moneda(l.costo_contabilizado)}</Table.Td>
              <Table.Td>{moneda(l.diferencia_a_contabilizar)}</Table.Td>
            </Table.Tr>
          ))}
          <Table.Tr fw={700} bg="gray.1">
            <Table.Td>Total</Table.Td>
            <Table.Td>{moneda(totales.inventario_inicial)}</Table.Td>
            <Table.Td>{moneda(totales.entradas)}</Table.Td>
            <Table.Td>—</Table.Td>
            <Table.Td>—</Table.Td>
            <Table.Td>{moneda(totales.inventario_final)}</Table.Td>
            <Table.Td colSpan={3}>—</Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>

      <Card withBorder padding="md" radius="md">
        <Title order={6} mb="sm">Mercancía en Consignación / No Forma Parte del Inventario</Title>
        <Text size="xs" c="dimmed" mb="sm">Captura manual — sin fuente en ningún reporte de origen.</Text>
        <Table withTableBorder>
          <Table.Tbody>
            {consignacion.renglones.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td>{r.concepto}</Table.Td>
                <Table.Td>{moneda(r.monto)}</Table.Td>
                <Table.Td w={40}>
                  <Button
                    variant="subtle"
                    color="red"
                    size="xs"
                    px={4}
                    onClick={() => eliminar.mutate({ periodo, renglonId: r.id })}
                  >
                    <IconTrash size={14} />
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
            <Table.Tr>
              <Table.Td><TextInput placeholder="Concepto" value={concepto} onChange={(e) => setConcepto(e.currentTarget.value)} size="xs" /></Table.Td>
              <Table.Td>
                <NumberInput placeholder="Monto" prefix="$ " decimalScale={2} value={monto} onChange={(v) => setMonto(v === '' ? '' : Number(v))} size="xs" />
              </Table.Td>
              <Table.Td w={40}>
                <Button
                  variant="subtle"
                  size="xs"
                  px={4}
                  disabled={!concepto || monto === ''}
                  onClick={() => {
                    agregar.mutate({ periodo, concepto, monto: Number(monto) });
                    setConcepto('');
                    setMonto('');
                  }}
                >
                  <IconPlus size={14} />
                </Button>
              </Table.Td>
            </Table.Tr>
            <Table.Tr fw={700}>
              <Table.Td>Total</Table.Td>
              <Table.Td>{moneda(consignacion.total)}</Table.Td>
              <Table.Td />
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  );
}

function TablaEntrySal({ detalle }: { detalle: ReturnType<typeof useAmarreCostoDetalle>['data'] }) {
  if (!detalle) return null;
  const { despachos, despachos_a_centros_de_costo, entradas } = detalle.datos_entrysal;

  const etiquetasDepto: Record<string, string> = {
    cafeteria_alimentos: 'Cafetería Alimentos', cafeteria_bebidas: 'Cafetería Bebidas',
    souvenir_y_cafe: 'Souvenir y Café', carreta_alimentos: 'Carreta Alimentos',
    carreta_bebidas: 'Carreta Bebidas', restaurant: 'Restaurant', palapa_bar: 'Palapa Bar', tienda: 'Tienda',
  };
  const etiquetasEntrada: Record<string, string> = {
    cafeteria: 'Cafetería', alm_gral: 'Almacén General', mantenimiento: 'Mantenimiento',
    restaurant_bar: 'Restaurant-Bar', tienda: 'Tienda',
  };

  return (
    <Stack>
      <Card withBorder padding="md" radius="md">
        <Title order={6} mb="sm">Despachos</Title>
        <Table withTableBorder>
          <Table.Tbody>
            <Table.Tr><Table.Td>Almacén General a Gasto</Table.Td><Table.Td>{moneda(despachos.almacen_general_a_gasto)}</Table.Td></Table.Tr>
            <Table.Tr><Table.Td>Mantenimiento</Table.Td><Table.Td>{moneda(despachos.mantenimiento)}</Table.Td></Table.Tr>
          </Table.Tbody>
        </Table>
      </Card>

      <Card withBorder padding="md" radius="md">
        <Title order={6} mb="sm">Despachos a Centros de Costo</Title>
        <Table withTableBorder>
          <Table.Tbody>
            {Object.entries(etiquetasDepto).map(([clave, etiqueta]) => (
              <Table.Tr key={clave}>
                <Table.Td>{etiqueta}</Table.Td>
                <Table.Td>{moneda(despachos_a_centros_de_costo[clave])}</Table.Td>
              </Table.Tr>
            ))}
            <Table.Tr fw={700}><Table.Td>Total</Table.Td><Table.Td>{moneda(despachos_a_centros_de_costo.total)}</Table.Td></Table.Tr>
          </Table.Tbody>
        </Table>
      </Card>

      <Card withBorder padding="md" radius="md">
        <Title order={6} mb="sm">Entradas</Title>
        <Table withTableBorder>
          <Table.Thead>
            <Table.Tr><Table.Th>Almacén</Table.Th><Table.Th>Subtotal</Table.Th><Table.Th>Descuento</Table.Th><Table.Th>IVA</Table.Th><Table.Th>Total</Table.Th></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {Object.entries(etiquetasEntrada).map(([clave, etiqueta]) => {
              const d = entradas[clave];
              return (
                <Table.Tr key={clave}>
                  <Table.Td>{etiqueta}</Table.Td>
                  <Table.Td>{moneda(d.subtotal)}</Table.Td>
                  <Table.Td>{moneda(d.descuento)}</Table.Td>
                  <Table.Td>{moneda(d.iva)}</Table.Td>
                  <Table.Td>{moneda(d.total)}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  );
}

function TablaResumenInv({ periodo, detalle }: { periodo: string; detalle: ReturnType<typeof useAmarreCostoDetalle>['data'] }) {
  if (!detalle) return null;
  const { almacenes, huecos, totales } = detalle.resumen_inv;

  return (
    <Stack>
      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr><Table.Th>Almacén</Table.Th><Table.Th>Saldo Contable</Table.Th><Table.Th>Saldo Real</Table.Th><Table.Th>Diferencia</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {almacenes.map((a) => (
            <Table.Tr key={a.almacen}>
              <Table.Td fw={500}>{a.almacen}</Table.Td>
              <Table.Td>{moneda(a.saldo_contable)}</Table.Td>
              <Table.Td>{moneda(a.saldo_real)}</Table.Td>
              <Table.Td c={Math.abs(a.diferencia) > 1 ? 'red' : undefined}>{moneda(a.diferencia)}</Table.Td>
            </Table.Tr>
          ))}
          <Table.Tr fw={700} bg="gray.1">
            <Table.Td>Total</Table.Td>
            <Table.Td>{moneda(totales.saldo_contable)}</Table.Td>
            <Table.Td>{moneda(totales.saldo_real)}</Table.Td>
            <Table.Td>{moneda(totales.diferencia)}</Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>

      <Card withBorder padding="md" radius="md">
        <Title order={6} mb="sm">Rubros sin fuente en los reportes (captura manual)</Title>
        <Group>
          <CampoManual periodo={periodo} campo="resumen_lavanderia" etiqueta="Fichas de Lavandería" valor={huecos.fichas_lavanderia} />
          <NumberInput
            label="Mercancía en Consignación"
            value={huecos.mercancia_consignacion}
            prefix="$ "
            thousandSeparator=","
            decimalScale={2}
            disabled
            description="Se captura en el tab Amarre COSTO"
            w={220}
          />
        </Group>
      </Card>
    </Stack>
  );
}

function TablaComparacionBalanza2({ periodo }: { periodo: string }) {
  const comparacion = useComparacionBalanza2(periodo);

  if (comparacion.isLoading) return <Text c="dimmed">Cargando…</Text>;
  if (!comparacion.data?.disponible) {
    return (
      <Text c="dimmed">
        Sube el archivo de "Balanza 2 (para comparar)" en la sección de arriba para ver esta comparación.
      </Text>
    );
  }

  const { renglones, archivo } = comparacion.data;

  return (
    <Stack>
      {archivo && <Text size="sm" c="dimmed">Comparando contra: {archivo}</Text>}
      <Table striped highlightOnHover withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Código</Table.Th>
            <Table.Th>Concepto</Table.Th>
            <Table.Th>Saldo Real</Table.Th>
            <Table.Th>Balanza 2</Table.Th>
            <Table.Th>Diferencia</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {renglones.map((r) => (
            <Table.Tr key={r.codigo} bg={r.cuadra ? undefined : 'red.0'}>
              <Table.Td>{r.codigo}</Table.Td>
              <Table.Td fw={500}>{r.nombre}</Table.Td>
              <Table.Td>{moneda(r.saldo_real)}</Table.Td>
              <Table.Td>{moneda(r.balanza_2)}</Table.Td>
              <Table.Td c={r.cuadra ? 'green' : 'red'} fw={r.cuadra ? undefined : 700}>{moneda(r.diferencia)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

export default function AmarreCostoPage() {
  const [periodo, setPeriodo] = useState<string | null>(null);
  const periodos = useAmarreCostoPeriodos();
  const detalle = useAmarreCostoDetalle(periodo);
  const exportar = useAmarreCostoExport();

  const infoPeriodo = periodos.data?.periodos.find((p) => p.periodo === periodo);
  const archivosCargados = infoPeriodo?.archivos_cargados ?? [];

  const onExportar = () => {
    if (!periodo) return;
    exportar.mutate(periodo, {
      onSuccess: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Amarre_Costo_${periodo}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      onError: async (err: any) => {
        // La respuesta viene como Blob (responseType: 'blob'); si el backend
        // regresó un error JSON (400/500), hay que leerlo como texto para
        // mostrar el detalle real en vez de un mensaje genérico.
        let detalle = 'Error al exportar';
        const data = err?.response?.data;
        if (data instanceof Blob) {
          try {
            const texto = await data.text();
            detalle = JSON.parse(texto)?.detail || detalle;
          } catch {
            /* deja el mensaje genérico si no se pudo leer/parsear */
          }
        } else if (data?.detail) {
          detalle = data.detail;
        }
        notifications.show({ color: 'red', message: detalle, autoClose: 12000 });
      },
    });
  };

  return (
    <Stack p="md">
      <Group justify="space-between">
        <Group>
          <IconBuildingWarehouse size={28} />
          <Title order={3}>Amarre de Costo de Ventas</Title>
        </Group>
        <Group>
          <MonthPickerInput
            label="Periodo"
            placeholder="Selecciona mes y año"
            value={periodoAFecha(periodo)}
            onChange={(v) => setPeriodo(fechaAPeriodo(v))}
            w={220}
          />
          {periodo && detalle.data && (
            <Button leftSection={<IconDownload size={16} />} onClick={onExportar} loading={exportar.isPending} mt={22}>
              Exportar a Excel
            </Button>
          )}
        </Group>
      </Group>

      {!periodo && <Text c="dimmed">Selecciona un periodo (mes/año) para empezar a cargar los archivos.</Text>}

      {periodo && (
        <>
          <SeccionCarga periodo={periodo} archivosCargados={archivosCargados} />

          {detalle.data && (
            <Tabs defaultValue="amarre-costo" variant="pills">
              <Tabs.List mb="md">
                <Tabs.Tab value="amarre-costo">Amarre de Costo</Tabs.Tab>
                <Tabs.Tab value="entrysal">Datos Entry/Sal</Tabs.Tab>
                <Tabs.Tab value="resumen-inv">Resumen de Inventarios</Tabs.Tab>
                <Tabs.Tab value="comparacion-balanza-2">Comparación Balanza 2</Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel value="amarre-costo"><TablaAmarreCosto periodo={periodo} detalle={detalle.data} /></Tabs.Panel>
              <Tabs.Panel value="entrysal"><TablaEntrySal detalle={detalle.data} /></Tabs.Panel>
              <Tabs.Panel value="resumen-inv"><TablaResumenInv periodo={periodo} detalle={detalle.data} /></Tabs.Panel>
              <Tabs.Panel value="comparacion-balanza-2"><TablaComparacionBalanza2 periodo={periodo} /></Tabs.Panel>
            </Tabs>
          )}
        </>
      )}
    </Stack>
  );
}

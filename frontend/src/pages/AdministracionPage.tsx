/**
 * AdministracionPage — solo para quien tiene el módulo "administracion": usuarios, roles y permisos
 * (matriz módulo × nivel) y bitácora de seguridad.
 */

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Code,
  CopyButton,
  Group,
  Loader,
  Menu,
  Modal,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconCopy, IconDots, IconHistory, IconKey, IconLockOpen, IconPlus, IconShieldLock, IconTrash, IconUsers } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';

import {
  mensajeErrorAdmin,
  useAdminAuditoria,
  useAdminModulos,
  useAdminRoles,
  useAdminUsuarios,
  useBorrarRol,
  useCerrarSesionesUsuario,
  useCrearRol,
  useCrearUsuario,
  useDesbloquearUsuario,
  useEditarUsuario,
  useGuardarPermisos,
  useRestablecerPassword,
  type AdminRol,
  type AdminUsuario,
} from '../api/adminHooks';
import { useAuth } from '../auth/AuthContext';

const fechaHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export default function AdministracionPage() {
  useEffect(() => {
    document.title = 'Administración';
  }, []);
  return (
    <Stack gap="md">
      <Group gap="xs">
        <IconShieldLock size={26} />
        <div>
          <Title order={3}>Administración</Title>
          <Text size="sm" c="dimmed">
            Usuarios, permisos por módulo y bitácora de seguridad.
          </Text>
        </div>
      </Group>
      <Tabs defaultValue="usuarios" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="usuarios" leftSection={<IconUsers size={16} />}>
            Usuarios
          </Tabs.Tab>
          <Tabs.Tab value="roles" leftSection={<IconKey size={16} />}>
            Roles y permisos
          </Tabs.Tab>
          <Tabs.Tab value="bitacora" leftSection={<IconHistory size={16} />}>
            Bitácora de seguridad
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="usuarios" pt="md">
          <PanelUsuarios />
        </Tabs.Panel>
        <Tabs.Panel value="roles" pt="md">
          <PanelRoles />
        </Tabs.Panel>
        <Tabs.Panel value="bitacora" pt="md">
          <PanelBitacora />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

// ── Usuarios ────────────────────────────────────────────────────────────────

function PanelUsuarios() {
  const { usuario: yo } = useAuth();
  const { data: usuarios, isLoading } = useAdminUsuarios();
  const { data: roles } = useAdminRoles();
  const editar = useEditarUsuario();
  const desbloquear = useDesbloquearUsuario();
  const restablecer = useRestablecerPassword();
  const cerrarSesiones = useCerrarSesionesUsuario();
  const [nuevo, setNuevo] = useState(false);
  const [temporal, setTemporal] = useState<{ email: string; password: string } | null>(null);

  const avisar = (mensaje: string) => notifications.show({ color: 'green', message: mensaje });
  const fallo = (e: unknown) => notifications.show({ color: 'red', title: 'No se pudo', message: mensajeErrorAdmin(e) });

  if (isLoading) return <Loader />;
  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {usuarios?.length ?? 0} usuario(s). Los nuevos reciben una contraseña temporal y deben cambiarla al entrar.
        </Text>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setNuevo(true)}>
          Nuevo usuario
        </Button>
      </Group>

      <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
        <Table.ScrollContainer minWidth={760}>
          <Table verticalSpacing="xs" fz="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Usuario</Table.Th>
                <Table.Th>Rol</Table.Th>
                <Table.Th>Estado</Table.Th>
                <Table.Th>Último acceso</Table.Th>
                <Table.Th w={50} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {usuarios?.map((u) => (
                <Table.Tr key={u.id} style={{ opacity: u.is_active ? 1 : 0.55 }}>
                  <Table.Td>
                    <Text fw={600}>{u.nombre || '—'}</Text>
                    <Text size="xs" c="dimmed">
                      {u.email}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Select
                      size="xs"
                      w={210}
                      value={u.rol_id ? String(u.rol_id) : null}
                      data={(roles ?? []).map((r) => ({ value: String(r.id), label: r.nombre }))}
                      disabled={u.id === yo?.id}
                      allowDeselect={false}
                      onChange={(v) =>
                        v &&
                        editar.mutate({ id: u.id, cambios: { rol_id: Number(v) } }, { onSuccess: () => avisar('Rol actualizado. Sus sesiones se cerraron.'), onError: fallo })
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      {!u.is_active && <Badge color="gray">Desactivado</Badge>}
                      {u.bloqueado && <Badge color="red">Bloqueado</Badge>}
                      {u.must_change_password && <Badge color="yellow">Debe cambiar contraseña</Badge>}
                      {u.is_active && !u.bloqueado && !u.must_change_password && <Badge color="green" variant="light">Activo</Badge>}
                    </Group>
                  </Table.Td>
                  <Table.Td>{fechaHora(u.last_login_at)}</Table.Td>
                  <Table.Td>
                    <Menu position="bottom-end" withinPortal>
                      <Menu.Target>
                        <ActionIcon variant="subtle" color="gray" aria-label={`Acciones de ${u.email}`}>
                          <IconDots size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        {u.bloqueado && (
                          <Menu.Item leftSection={<IconLockOpen size={14} />} onClick={() => desbloquear.mutate(u.id, { onSuccess: () => avisar('Cuenta desbloqueada.'), onError: fallo })}>
                            Desbloquear
                          </Menu.Item>
                        )}
                        <Menu.Item
                          leftSection={<IconKey size={14} />}
                          onClick={() => {
                            const escrita = window.prompt(
                              `Restablecer la contraseña de ${u.email}.

Escribe la contraseña nueva (mín. 10 caracteres) o déjalo vacío para generar una automática.
Se cerrarán sus sesiones y tendrá que cambiarla al entrar.`,
                              '',
                            );
                            if (escrita === null) return;
                            restablecer.mutate({ id: u.id, password: escrita.trim() || undefined }, { onSuccess: (d) => setTemporal({ email: u.email, password: d.password_temporal ?? '' }), onError: fallo });
                          }}
                        >
                          Restablecer contraseña
                        </Menu.Item>
                        <Menu.Item onClick={() => cerrarSesiones.mutate(u.id, { onSuccess: () => avisar('Sesiones cerradas.'), onError: fallo })}>Cerrar sus sesiones</Menu.Item>
                        <Menu.Divider />
                        <Menu.Item
                          color={u.is_active ? 'red' : 'green'}
                          disabled={u.id === yo?.id}
                          onClick={() => editar.mutate({ id: u.id, cambios: { is_active: !u.is_active } }, { onSuccess: () => avisar(u.is_active ? 'Usuario desactivado.' : 'Usuario activado.'), onError: fallo })}
                        >
                          {u.is_active ? 'Desactivar' : 'Activar'}
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      <ModalNuevoUsuario opened={nuevo} onClose={() => setNuevo(false)} roles={roles ?? []} onCreado={(email, password) => setTemporal({ email, password })} />
      <ModalPasswordTemporal datos={temporal} onClose={() => setTemporal(null)} />
    </Stack>
  );
}

function ModalNuevoUsuario({ opened, onClose, roles, onCreado }: { opened: boolean; onClose: () => void; roles: AdminRol[]; onCreado: (email: string, password: string) => void }) {
  const crear = useCrearUsuario();
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [rolId, setRolId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const guardar = () => {
    setError('');
    crear.mutate(
      { email, nombre, rol_id: Number(rolId) },
      {
        onSuccess: (u: AdminUsuario) => {
          onCreado(u.email, u.password_temporal ?? '');
          setEmail('');
          setNombre('');
          setRolId(null);
          onClose();
        },
        onError: (e) => setError(mensajeErrorAdmin(e)),
      },
    );
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Nuevo usuario" centered>
      <Stack gap="sm">
        <TextInput label="Nombre completo" value={nombre} onChange={(e) => setNombre(e.currentTarget.value)} data-autofocus />
        <TextInput label="Usuario de acceso (ej. jperez)" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
        <Select label="Rol" value={rolId} onChange={setRolId} data={roles.map((r) => ({ value: String(r.id), label: r.nombre }))} />
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} loading={crear.isPending} disabled={!email.trim() || !nombre.trim() || !rolId}>
            Crear usuario
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function ModalPasswordTemporal({ datos, onClose }: { datos: { email: string; password: string } | null; onClose: () => void }) {
  return (
    <Modal opened={datos !== null} onClose={onClose} title="Contraseña temporal" centered closeOnClickOutside={false}>
      <Stack gap="sm">
        <Text size="sm">
          Entrégale esta contraseña a <b>{datos?.email}</b>. <b>Solo se muestra ahora</b>; al entrar tendrá que cambiarla.
        </Text>
        <Group gap="xs" wrap="nowrap">
          <Code fz="lg" p="xs" style={{ flex: 1, userSelect: 'all' }}>
            {datos?.password}
          </Code>
          <CopyButton value={datos?.password ?? ''}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Copiada' : 'Copiar'}>
                <ActionIcon variant="light" color={copied ? 'green' : 'violet'} onClick={copy} aria-label="Copiar contraseña">
                  {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        </Group>
        <Group justify="flex-end">
          <Button onClick={onClose}>Listo</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ── Roles y permisos ────────────────────────────────────────────────────────

function PanelRoles() {
  const { data: roles, isLoading } = useAdminRoles();
  const { data: catalogo } = useAdminModulos();
  const guardar = useGuardarPermisos();
  const borrar = useBorrarRol();
  const [pendientes, setPendientes] = useState<Record<number, Record<string, number>>>({});
  const [nuevo, setNuevo] = useState(false);

  const filas = useMemo(() => [...(catalogo?.modulos ?? []), ...(catalogo?.capacidades ?? [])], [catalogo]);
  if (isLoading || !roles || !catalogo) return <Loader />;

  const nivelDe = (rol: AdminRol, modulo: string) => pendientes[rol.id]?.[modulo] ?? rol.permisos[modulo] ?? 0;
  const cambiar = (rol: AdminRol, modulo: string, valor: number) =>
    setPendientes((p) => ({ ...p, [rol.id]: { ...p[rol.id], [modulo]: valor } }));

  const aplicar = (rol: AdminRol) =>
    guardar.mutate(
      { rolId: rol.id, permisos: pendientes[rol.id] },
      {
        onSuccess: () => {
          setPendientes((p) => {
            const { [rol.id]: _omitido, ...resto } = p;
            return resto;
          });
          notifications.show({ color: 'green', message: `Permisos de “${rol.nombre}” guardados. Sus usuarios deberán iniciar sesión de nuevo.` });
        },
        onError: (e) => notifications.show({ color: 'red', title: 'No se pudo guardar', message: mensajeErrorAdmin(e) }),
      },
    );

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          Cada módulo puede quedar en <b>Sin acceso</b>, <b>Solo ver</b> o <b>Ver y editar</b>. El rol Administrador no se modifica.
        </Text>
        <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => setNuevo(true)}>
          Nuevo rol
        </Button>
      </Group>

      <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
        <Table.ScrollContainer minWidth={Math.max(720, 220 + roles.length * 210)}>
          <Table verticalSpacing="xs" fz="sm" withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Módulo</Table.Th>
                {roles.map((r) => (
                  <Table.Th key={r.id}>
                    <Group gap={4} justify="space-between" wrap="nowrap">
                      <div>
                        <Text fw={700} size="sm">
                          {r.nombre}
                        </Text>
                        <Text size="xs" c="dimmed" fw={400}>
                          {r.usuarios} usuario(s)
                        </Text>
                      </div>
                      {!r.es_sistema && (
                        <Tooltip label="Borrar rol">
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            size="sm"
                            aria-label={`Borrar rol ${r.nombre}`}
                            onClick={() =>
                              window.confirm(`¿Borrar el rol “${r.nombre}”?`) &&
                              borrar.mutate(r.id, { onError: (e) => notifications.show({ color: 'red', title: 'No se pudo borrar', message: mensajeErrorAdmin(e) }) })
                            }
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Group>
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filas.map((m) => (
                <Table.Tr key={m.clave}>
                  <Table.Td>
                    <Text fw={600} size="sm">
                      {m.nombre}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {m.descripcion}
                    </Text>
                  </Table.Td>
                  {roles.map((r) => {
                    const esCapacidad = catalogo.capacidades.some((c) => c.clave === m.clave);
                    return (
                      <Table.Td key={r.id}>
                        {r.es_sistema ? (
                          <Badge color="violet" variant="light">
                            Ver y editar
                          </Badge>
                        ) : esCapacidad ? (
                          <Switch
                            checked={nivelDe(r, m.clave) >= 2}
                            onChange={(e) => cambiar(r, m.clave, e.currentTarget.checked ? 2 : 0)}
                            label={nivelDe(r, m.clave) >= 2 ? 'Sí' : 'No'}
                            aria-label={`${m.nombre} — ${r.nombre}`}
                          />
                        ) : (
                          <SegmentedControl
                            size="xs"
                            value={String(nivelDe(r, m.clave))}
                            onChange={(v) => cambiar(r, m.clave, Number(v))}
                            data={[
                              { value: '0', label: 'Sin acceso' },
                              { value: '1', label: 'Ver' },
                              { value: '2', label: 'Editar' },
                            ]}
                            color={nivelDe(r, m.clave) === 2 ? 'violet' : nivelDe(r, m.clave) === 1 ? 'blue' : 'gray'}
                            aria-label={`${m.nombre} — ${r.nombre}`}
                          />
                        )}
                      </Table.Td>
                    );
                  })}
                </Table.Tr>
              ))}
              <Table.Tr>
                <Table.Td />
                {roles.map((r) => (
                  <Table.Td key={r.id}>
                    {pendientes[r.id] && (
                      <Group gap={6}>
                        <Button size="xs" onClick={() => aplicar(r)} loading={guardar.isPending}>
                          Guardar cambios
                        </Button>
                        <Button
                          size="xs"
                          variant="default"
                          onClick={() =>
                            setPendientes((p) => {
                              const { [r.id]: _omitido, ...resto } = p;
                              return resto;
                            })
                          }
                        >
                          Descartar
                        </Button>
                      </Group>
                    )}
                  </Table.Td>
                ))}
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>
      <ModalNuevoRol opened={nuevo} onClose={() => setNuevo(false)} roles={roles} />
    </Stack>
  );
}

function ModalNuevoRol({ opened, onClose, roles }: { opened: boolean; onClose: () => void; roles: AdminRol[] }) {
  const crear = useCrearRol();
  const [nombre, setNombre] = useState('');
  const [copiar, setCopiar] = useState<string | null>(null);
  const [error, setError] = useState('');

  const guardar = () => {
    const clave = nombre
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    crear.mutate(
      { clave: /^[a-z]/.test(clave) ? clave : `rol_${clave}`, nombre: nombre.trim(), copiar_de: copiar ? Number(copiar) : undefined },
      {
        onSuccess: () => {
          setNombre('');
          setCopiar(null);
          setError('');
          onClose();
        },
        onError: (e) => setError(mensajeErrorAdmin(e)),
      },
    );
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Nuevo rol" centered>
      <Stack gap="sm">
        <TextInput label="Nombre del rol" value={nombre} onChange={(e) => setNombre(e.currentTarget.value)} data-autofocus />
        <Select label="Empezar con los permisos de…" placeholder="Sin permisos" clearable value={copiar} onChange={setCopiar} data={roles.filter((r) => !r.es_sistema).map((r) => ({ value: String(r.id), label: r.nombre }))} />
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} loading={crear.isPending} disabled={nombre.trim().length < 3}>
            Crear rol
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ── Bitácora ────────────────────────────────────────────────────────────────

function PanelBitacora() {
  const [evento, setEvento] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [soloFallos, setSoloFallos] = useState(false);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [pagina, setPagina] = useState(1);
  const { data, isLoading, isFetching } = useAdminAuditoria({ evento: evento ?? undefined, email, solo_fallos: soloFallos, desde, hasta, pagina });

  const reiniciar = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPagina(1);
  };
  const paginas = data ? Math.max(1, Math.ceil(data.total / data.por_pagina)) : 1;

  return (
    <Stack gap="sm">
      <Group align="flex-end" gap="sm" wrap="wrap">
        <Select label="Evento" placeholder="Todos" clearable value={evento} onChange={reiniciar(setEvento)} data={data?.eventos ?? []} w={210} />
        <TextInput label="Usuario" value={email} onChange={(e) => reiniciar(setEmail)(e.currentTarget.value)} w={220} />
        <TextInput label="Desde" type="date" value={desde} onChange={(e) => reiniciar(setDesde)(e.currentTarget.value)} />
        <TextInput label="Hasta" type="date" value={hasta} onChange={(e) => reiniciar(setHasta)(e.currentTarget.value)} />
        <Switch label="Solo fallos" checked={soloFallos} onChange={(e) => reiniciar(setSoloFallos)(e.currentTarget.checked)} mb={6} />
      </Group>

      <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
        <Table.ScrollContainer minWidth={760}>
          <Table verticalSpacing={5} fz="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Fecha</Table.Th>
                <Table.Th>Evento</Table.Th>
                <Table.Th>Usuario</Table.Th>
                <Table.Th>Detalle</Table.Th>
                <Table.Th>IP</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {isLoading && (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Loader size="sm" />
                  </Table.Td>
                </Table.Tr>
              )}
              {data?.filas.map((f) => (
                <Table.Tr key={f.id}>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>{fechaHora(f.ts)}</Table.Td>
                  <Table.Td>
                    <Badge color={f.exito ? 'green' : 'red'} variant="light">
                      {f.evento}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{f.email ?? '—'}</Table.Td>
                  <Table.Td>{f.detalle ?? ''}</Table.Td>
                  <Table.Td>{f.ip ?? ''}</Table.Td>
                </Table.Tr>
              ))}
              {data && data.filas.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Text c="dimmed" ta="center" py="md">
                      Sin eventos con esos filtros.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {data?.total ?? 0} evento(s) {isFetching && '· actualizando…'}
        </Text>
        <Group gap="xs">
          <Button size="xs" variant="default" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
            Anterior
          </Button>
          <Text size="sm">
            {pagina} / {paginas}
          </Text>
          <Button size="xs" variant="default" disabled={pagina >= paginas} onClick={() => setPagina((p) => p + 1)}>
            Siguiente
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}

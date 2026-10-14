/**
 * AppLayout — Main application shell with sidebar navigation.
 *
 * Uses Mantine AppShell for a consistent layout across all pages. Sidebar
 * and header keep a fixed dark-navy / violet-gradient brand identity
 * regardless of the light/dark content toggle (see theme/tokens.ts).
 */

import {
  ActionIcon,
  AppShell,
  Avatar,
  Box,
  Burger,
  Button,
  Divider,
  Group,
  Indicator,
  Kbd,
  Menu,
  Modal,
  NavLink,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconBell,
  IconBellRinging,
  IconBuildingBank,
  IconBuildingWarehouse,
  IconChartBar,
  IconChevronDown,
  IconConfetti,
  IconDashboard,
  IconFilter,
  IconListDetails,
  IconLogout,
  IconMoonStars,
  IconPackages,
  IconReceipt2,
  IconSearch,
  IconShieldLock,
  IconSun,
  IconToolsKitchen2,
  IconUser,
} from '@tabler/icons-react';
import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import FormCambioPassword from '../auth/FormCambioPassword';
import { MODULO_DE_RUTA } from '../auth/guardas';
import apiClient from '../api/client';
import { HEADER_GRADIENT, SIDEBAR_ACTIVE_GRADIENT, SIDEBAR_BG } from '../theme/tokens';

// Todo el módulo vive dentro del menú colapsable "Contabilidad" en el
// sidebar (ver AppShell.Navbar más abajo) — este arreglo sigue siendo la
// lista plana de páginas, solo cambia cómo se renderiza.
const navItems = [
  { label: 'Dashboard', icon: IconDashboard, path: '/' },
  { label: 'Flujo de Trabajo', icon: IconListDetails, path: '/workspace' },
  { label: 'Reporte 601', icon: IconFilter, path: '/reporte-601' },
  { label: 'Facturación', icon: IconReceipt2, path: '/facturacion' },
  { label: 'Pagos de Recepción', icon: IconBellRinging, path: '/pagos-recepcion' },
  { label: 'Catálogo de Productos', icon: IconToolsKitchen2, path: '/catalogo-productos' },
  { label: 'Amarre de Costo', icon: IconBuildingWarehouse, path: '/amarre-costo' },
];

// Grupo independiente de Contabilidad; aquí se irán agregando las secciones
// de Almacén.
const almacenItems = [
  { label: 'Almacén General', icon: IconPackages, path: '/almacen-general' },
];

// Grupo independiente de Fiesta de Fin de Año.
const fiestaItems = [
  { label: 'Fiesta de Fin de Año', icon: IconConfetti, path: '/fiesta-fin-anio' },
];

// Solo para el administrador.
const adminItems = [{ label: 'Usuarios y permisos', icon: IconShieldLock, path: '/administracion' }];

export default function AppLayout() {
  const [opened, { toggle }] = useDisclosure();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const location = useLocation();
  const navigate = useNavigate();

  // Visual-only for now — not wired to any search/notifications logic yet.
  const [busqueda, setBusqueda] = useState('');
  const sidebarBg = colorScheme === 'dark' ? SIDEBAR_BG.dark : SIDEBAR_BG.light;

  const { usuario, authActiva, puede, logout, actualizarPerfil } = useAuth();
  const [nombrePerfil, setNombrePerfil] = useState('');
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);
  const [miCuenta, setMiCuenta] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const cerrarTodas = async () => {
    try {
      await apiClient.post('/auth/logout-todas');
    } catch {
      // se cierra localmente de todos modos
    }
    await logout();
    navigate('/login');
  };

  // Solo se muestran las secciones que el rol puede abrir.
  const visibles = (items: typeof navItems) => items.filter((i) => puede(MODULO_DE_RUTA[i.path] ?? ''));
  const contabilidad = visibles(navItems);
  const almacen = visibles(almacenItems);
  const fiesta = visibles(fiestaItems);
  const administracion = visibles(adminItems);

  const renderItems = (items: typeof navItems) =>
    items.map((item) => {
      const active = location.pathname === item.path;
      return (
        <NavLink
          key={item.path}
          label={item.label}
          leftSection={<item.icon size={18} stroke={1.5} />}
          active={active}
          onClick={() => {
            navigate(item.path);
            toggle();
          }}
          style={{
            borderRadius: 10,
            marginBottom: 4,
            background: active ? SIDEBAR_ACTIVE_GRADIENT : 'transparent',
            color: active ? '#fff' : 'rgba(255,255,255,0.75)',
          }}
          styles={{
            label: { fontWeight: active ? 600 : 500 },
            section: { color: active ? '#fff' : 'rgba(255,255,255,0.75)' },
          }}
        />
      );
    });

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 260,
        breakpoint: 'sm',
        collapsed: { mobile: !opened },
      }}
      padding="md"
    >
      {/* ── Header ──────────────────────────────────── */}
      <AppShell.Header style={{ background: HEADER_GRADIENT, border: 'none' }}>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" color="white" />
            <ThemeIcon size={32} radius="sm" variant="white" color="violet">
              <IconChartBar size={18} stroke={2} />
            </ThemeIcon>
            <Title order={4} c="white" style={{ letterSpacing: '-0.3px' }} visibleFrom="xs">
              Análisis Contable
            </Title>
          </Group>

          <Box visibleFrom="md" style={{ flex: 1, maxWidth: 420, marginInline: 'auto' }}>
            <TextInput
              value={busqueda}
              onChange={(event) => setBusqueda(event.currentTarget.value)}
              placeholder="Buscar por folio, UUID, factura..."
              leftSection={<IconSearch size={16} color="rgba(255,255,255,0.7)" />}
              rightSection={
                <Kbd size="xs" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none' }}>
                  Ctrl K
                </Kbd>
              }
              rightSectionWidth={60}
              size="sm"
              styles={{
                input: {
                  backgroundColor: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 10,
                  color: '#fff',
                },
              }}
            />
          </Box>

          <Group gap="xs" wrap="nowrap">
            <ActionIcon
              variant="subtle"
              color="white"
              onClick={toggleColorScheme}
              size="lg"
              aria-label="Cambiar tema"
            >
              {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoonStars size={18} />}
            </ActionIcon>

            <Indicator color="red" size={7} offset={4} disabled={false}>
              <ActionIcon variant="subtle" color="white" size="lg" aria-label="Notificaciones">
                <IconBell size={18} />
              </ActionIcon>
            </Indicator>

            <Menu shadow="md" width={230} position="bottom-end">
              <Menu.Target>
                <Group gap={6} style={{ cursor: 'pointer' }} wrap="nowrap">
                  <Avatar radius="xl" size={32} color="white" variant="filled" style={{ color: '#4F46E5' }}>
                    <IconUser size={18} />
                  </Avatar>
                  <Box visibleFrom="sm" style={{ display: 'flex' }}>
                    <IconChevronDown size={14} color="rgba(255,255,255,0.8)" />
                  </Box>
                </Group>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>
                  {usuario?.nombre || usuario?.email}
                  <Text size="xs" c="dimmed">
                    {usuario?.rol_nombre ?? ''}
                  </Text>
                </Menu.Label>
                {authActiva && (
                  <Menu.Item leftSection={<IconUser size={16} />} onClick={() => { setNombrePerfil(usuario?.nombre ?? ''); setMiCuenta(true); }}>
                    Mi cuenta
                  </Menu.Item>
                )}
                <Menu.Divider />
                {authActiva && (
                  <Menu.Item leftSection={<IconLogout size={16} />} color="red" onClick={handleLogout}>
                    Cerrar sesión
                  </Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      {/* ── Navbar ──────────────────────────────────── */}
      <AppShell.Navbar
        p="md"
        style={{ background: sidebarBg, border: 'none', color: '#fff' }}
      >
        <AppShell.Section grow>
          <Text size="xs" c="rgba(255,255,255,0.45)" tt="uppercase" fw={700} mb="xs" px={4}>
            Navegación
          </Text>
          {contabilidad.length > 0 && (
          <NavLink
            label="Contabilidad"
            leftSection={<IconBuildingBank size={20} stroke={1.5} />}
            defaultOpened={navItems.some((item) => location.pathname === item.path)}
            style={{ borderRadius: 10, marginBottom: 4, color: 'rgba(255,255,255,0.75)' }}
            styles={{
              label: { fontWeight: 600 },
              section: { color: 'rgba(255,255,255,0.75)' },
            }}
          >
            {renderItems(contabilidad)}
          </NavLink>
          )}
          {almacen.length > 0 && (
          <NavLink
            label="Almacén"
            leftSection={<IconBuildingWarehouse size={20} stroke={1.5} />}
            defaultOpened={almacenItems.some((item) => location.pathname === item.path)}
            style={{ borderRadius: 10, marginBottom: 4, color: 'rgba(255,255,255,0.75)' }}
            styles={{
              label: { fontWeight: 600 },
              section: { color: 'rgba(255,255,255,0.75)' },
            }}
          >
            {renderItems(almacen)}
          </NavLink>
          )}
          {fiesta.length > 0 && (
          <NavLink
            label="Fiesta de Fin de Año"
            leftSection={<IconConfetti size={20} stroke={1.5} />}
            defaultOpened={fiestaItems.some((item) => location.pathname === item.path)}
            style={{ borderRadius: 10, marginBottom: 4, color: 'rgba(255,255,255,0.75)' }}
            styles={{
              label: { fontWeight: 600 },
              section: { color: 'rgba(255,255,255,0.75)' },
            }}
          >
            {renderItems(fiesta)}
          </NavLink>
          )}
          {administracion.length > 0 && (
          <NavLink
            label="Administración"
            leftSection={<IconShieldLock size={20} stroke={1.5} />}
            defaultOpened={adminItems.some((item) => location.pathname === item.path)}
            style={{ borderRadius: 10, marginBottom: 4, color: 'rgba(255,255,255,0.75)' }}
            styles={{
              label: { fontWeight: 600 },
              section: { color: 'rgba(255,255,255,0.75)' },
            }}
          >
            {renderItems(administracion)}
          </NavLink>
          )}
        </AppShell.Section>

        <AppShell.Section>
          <Divider mb="sm" color="rgba(255,255,255,0.1)" />
          {authActiva && (
            <NavLink
              label="Cerrar sesión"
              leftSection={<IconLogout size={20} stroke={1.5} />}
              onClick={handleLogout}
              style={{ borderRadius: 10, marginBottom: 8, color: '#FCA5A5' }}
              styles={{ section: { color: '#FCA5A5' } }}
            />
          )}
          <Box
            style={{
              borderRadius: 10,
              padding: 'var(--mantine-spacing-sm)',
              backgroundColor: 'rgba(255,255,255,0.06)',
            }}
          >
            <Text size="sm" fw={600} c="white">
              Sistema de Análisis Contable
            </Text>
            <Text size="xs" c="rgba(255,255,255,0.5)">
              v0.1.0
            </Text>
          </Box>
        </AppShell.Section>
      </AppShell.Navbar>

      {/* ── Main content ────────────────────────────── */}
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>

      <Modal opened={miCuenta} onClose={() => setMiCuenta(false)} title="Mi cuenta" centered>
        <Stack gap="md">
          <div>
            <Text size="sm" c="dimmed">
              Usuario: <b>{usuario?.email}</b> · Rol: <b>{usuario?.rol_nombre}</b>
            </Text>
          </div>
          <Divider label="Mi perfil" labelPosition="left" />
          <TextInput label="Nombre" value={nombrePerfil} onChange={(e) => setNombrePerfil(e.currentTarget.value)} />
          <Button
            variant="light"
            loading={guardandoPerfil}
            disabled={nombrePerfil.trim().length < 2 || nombrePerfil.trim() === usuario?.nombre}
            onClick={async () => {
              setGuardandoPerfil(true);
              const r = await actualizarPerfil(nombrePerfil.trim());
              setGuardandoPerfil(false);
              notifications.show({ color: r.ok ? 'green' : 'red', message: r.ok ? 'Perfil actualizado.' : (r.mensaje ?? 'No se pudo guardar.') });
            }}
          >
            Guardar nombre
          </Button>
          <Divider label="Cambiar contraseña" labelPosition="left" />
          <FormCambioPassword alTerminar={() => setMiCuenta(false)} />
          <Divider />
          <Button variant="light" color="red" onClick={cerrarTodas}>
            Cerrar sesión en todos mis dispositivos
          </Button>
        </Stack>
      </Modal>
    </AppShell>
  );
}

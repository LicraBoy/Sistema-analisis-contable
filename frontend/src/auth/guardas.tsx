/**
 * Guardas de ruta: `RequireAuth` (hay que iniciar sesión) y `RequireModulo` (hace falta permiso en el módulo).
 * También el mapa ruta → módulo que usan el menú lateral y la redirección inicial.
 */

import { Alert, Center, Loader, Stack, Text, Title } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from './AuthContext';

/** Módulo de permisos que protege cada pantalla. */
export const MODULO_DE_RUTA: Record<string, string> = {
  '/': 'cfdi',
  '/workspace': 'cfdi',
  '/upload': 'cfdi',
  '/pagos': 'cfdi',
  '/conciliacion': 'cfdi',
  '/reporte-601': 'cfdi',
  '/facturacion': 'facturacion',
  '/pagos-recepcion': 'pagos_recepcion',
  '/catalogo-productos': 'catalogo_productos',
  '/amarre-costo': 'amarre_costo',
  '/almacen-general': 'almacen_general',
  '/fiesta-fin-anio': 'fiesta',
  '/administracion': 'administracion',
};

const ORDEN_INICIO = ['/', '/facturacion', '/pagos-recepcion', '/catalogo-productos', '/amarre-costo', '/almacen-general', '/fiesta-fin-anio', '/administracion'];

export function primeraRutaPermitida(puede: (modulo: string) => boolean): string | null {
  return ORDEN_INICIO.find((ruta) => puede(MODULO_DE_RUTA[ruta])) ?? null;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { estado, usuario, authActiva } = useAuth();
  const location = useLocation();
  if (estado === 'cargando') {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (estado === 'anonimo') return <Navigate to="/login" replace state={{ desde: location.pathname }} />;
  if (authActiva && usuario?.must_change_password && location.pathname !== '/cambiar-password') {
    return <Navigate to="/cambiar-password" replace />;
  }
  return <>{children}</>;
}

export function RequireModulo({ ruta, children }: { ruta: string; children: ReactNode }) {
  const { puede } = useAuth();
  const modulo = MODULO_DE_RUTA[ruta];
  if (modulo && !puede(modulo)) {
    return (
      <Center mih="50vh">
        <Stack align="center" gap="xs" maw={420} ta="center">
          <IconLock size={40} color="var(--mantine-color-gray-6)" />
          <Title order={3}>No tienes acceso a este módulo</Title>
          <Text c="dimmed" size="sm">
            Tu rol no incluye esta sección. Si la necesitas, pídele al administrador que te la habilite.
          </Text>
        </Stack>
      </Center>
    );
  }
  return <>{children}</>;
}

/** `/` para quien no tiene CFDI: lo manda a la primera pantalla que sí puede usar. */
export function InicioSegunPermisos({ children }: { children: ReactNode }) {
  const { puede } = useAuth();
  if (puede('cfdi')) return <>{children}</>;
  const destino = primeraRutaPermitida(puede);
  if (destino && destino !== '/') return <Navigate to={destino} replace />;
  return (
    <Center mih="50vh">
      <Alert color="yellow" title="Sin módulos asignados" maw={460}>
        Tu cuenta todavía no tiene acceso a ningún módulo. Pídele al administrador que te asigne un rol.
      </Alert>
    </Center>
  );
}

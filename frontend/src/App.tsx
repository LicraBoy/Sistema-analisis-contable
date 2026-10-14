/**
 * App — Root component with Mantine, React Query, and React Router providers.
 */

import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import AppLayout from './components/AppLayout';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import PagosPage from './pages/PagosPage';
import UploadPage from './pages/UploadPage';
import Reporte601Page from './pages/Reporte601Page';
import FacturacionPage from './pages/FacturacionPage';
import { ConciliacionPage } from './pages/ConciliacionPage';
import WorkspacePage from './pages/WorkspacePage';
import PagosRecepcionPage from './pages/PagosRecepcionPage';
import CatalogoProductosPage from './pages/CatalogoProductosPage';
import AmarreCostoPage from './pages/AmarreCostoPage';
import AlmacenGeneralPage from './pages/AlmacenGeneralPage';
import FiestaFinAnioPage from './pages/FiestaFinAnioPage';
import AdministracionPage from './pages/AdministracionPage';
import CambiarPasswordPage from './pages/CambiarPasswordPage';
import { AuthProvider } from './auth/AuthContext';
import { InicioSegunPermisos, RequireAuth, RequireModulo } from './auth/guardas';
import { cssVariablesResolver, theme } from './theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

/** Pantalla protegida: exige permiso en el módulo de esa ruta (el menú ya oculta lo que no se puede usar). */
const protegida = (ruta: string, pantalla: React.ReactNode) => <RequireModulo ruta={ruta}>{pantalla}</RequireModulo>;

export default function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light" cssVariablesResolver={cssVariablesResolver}>
      <Notifications position="top-right" />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
          <Routes>
            {/* Public route */}
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/cambiar-password"
              element={
                <RequireAuth>
                  <CambiarPasswordPage />
                </RequireAuth>
              }
            />

            {/* Protected routes */}
            <Route
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            >
              <Route path="/" element={<InicioSegunPermisos><DashboardPage /></InicioSegunPermisos>} />
              <Route path="/workspace" element={protegida('/workspace', <WorkspacePage />)} />
              <Route path="/upload" element={protegida('/upload', <UploadPage />)} />
              <Route path="/pagos" element={protegida('/pagos', <PagosPage />)} />
              <Route path="/reporte-601" element={protegida('/reporte-601', <Reporte601Page />)} />
              <Route path="/facturacion" element={protegida('/facturacion', <FacturacionPage />)} />
              <Route path="/conciliacion" element={protegida('/conciliacion', <ConciliacionPage />)} />
              <Route path="/pagos-recepcion" element={protegida('/pagos-recepcion', <PagosRecepcionPage />)} />
              <Route path="/catalogo-productos" element={protegida('/catalogo-productos', <CatalogoProductosPage />)} />
              <Route path="/amarre-costo" element={protegida('/amarre-costo', <AmarreCostoPage />)} />
              <Route path="/almacen-general" element={protegida('/almacen-general', <AlmacenGeneralPage />)} />
              <Route path="/fiesta-fin-anio" element={protegida('/fiesta-fin-anio', <FiestaFinAnioPage />)} />
              <Route path="/administracion" element={protegida('/administracion', <AdministracionPage />)} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </MantineProvider>
  );
}

/**
 * Axios HTTP client configured to talk to the backend API.
 */

import axios, { type InternalAxiosRequestConfig } from 'axios';

import { fijarToken, notificarSesionExpirada, obtenerToken, renovarSesion } from '../auth/sesion';

// Ruta relativa por defecto (no 'http://localhost:8000'): "localhost" en el
// navegador siempre es la máquina del cliente, no el servidor — si se abre
// el frontend desde otro dispositivo por la IP de red (ej. la URL "Network"
// que imprime Vite), un localhost hardcodeado nunca encuentra el backend.
// Con ruta relativa, el navegador llama al mismo origen que sirve el
// frontend, y el proxy de Vite (server.proxy en vite.config.ts) reenvía
// /api/* a http://127.0.0.1:8000 desde DENTRO de la máquina servidor, donde
// ese host sí es correcto. Mismo origen = la cookie de sesión viaja sin CORS.
const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Rutas de autenticación: un 401 ahí es una respuesta normal ("contraseña incorrecta"), no una sesión vencida.
const RUTAS_SIN_RENOVAR = ['/auth/login', '/auth/refresh', '/auth/logout'];

// ── Request interceptor: token de acceso (en memoria) ──────────────
apiClient.interceptors.request.use((config) => {
  const token = obtenerToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

type ConfigReintento = InternalAxiosRequestConfig & { _reintento?: boolean };

// ── Response interceptor: renovar sesión en 401 + blob error bodies ───
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config as ConfigReintento | undefined;
    if (error.response?.status === 401 && config && !config._reintento && !RUTAS_SIN_RENOVAR.some((r) => config.url?.startsWith(r))) {
      config._reintento = true;
      const renovada = await renovarSesion();
      if (renovada) {
        config.headers.Authorization = `Bearer ${renovada.access_token}`;
        return apiClient.request(config);
      }
      fijarToken(null);
      notificarSesionExpirada();
    }

    // Requests with responseType: 'blob' (Excel downloads) also parse ERROR
    // responses as a Blob, so `error.response.data.detail` would otherwise
    // always be undefined even when the backend sent valid JSON. Detect and
    // parse it so callers can read `.detail` normally.
    if (error.response?.data instanceof Blob && error.response.data.type.includes('json')) {
      const texto = await error.response.data.text();
      try {
        error.response.data = JSON.parse(texto);
      } catch {
        // Not valid JSON — leave the blob as-is.
      }
    }

    return Promise.reject(error);
  },
);

/**
 * Extrae el `detail` que manda el backend en un error de Axios (p. ej. un
 * HTTPException de FastAPI), con un mensaje de respaldo si no viene o el
 * error no es de Axios (de red, CORS, etc.) — para mostrar la causa real en
 * vez de un genérico "no se pudo guardar".
 */
export function detalleErrorApi(error: unknown, mensajeRespaldo: string): string {
  const detalle = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detalle === 'string' && detalle) return detalle;
  if (error instanceof Error && error.message) return `${mensajeRespaldo} (${error.message})`;
  return mensajeRespaldo;
}

export default apiClient;

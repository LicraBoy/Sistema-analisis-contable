/**
 * sesion — token de acceso en memoria (nunca en localStorage: un script ajeno no puede leerlo) y renovación
 * de sesión con el refresh token, que vive en una cookie httpOnly que el navegador manda solo.
 */

import axios from 'axios';

export interface UsuarioSesion {
  id: number;
  email: string;
  nombre: string;
  rol: string | null;
  rol_nombre: string | null;
  es_admin: boolean;
  must_change_password: boolean;
  /** módulo → 0 sin acceso · 1 solo ver · 2 ver y editar */
  permisos: Record<string, number>;
}

export interface RespuestaSesion {
  access_token: string;
  expira_en_seg: number;
  usuario: UsuarioSesion;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

let accessToken: string | null = null;
let alExpirar: (() => void) | null = null;
let alRenovar: ((usuario: UsuarioSesion) => void) | null = null;

export const obtenerToken = () => accessToken;
export const fijarToken = (token: string | null) => {
  accessToken = token;
};

/** El contexto de autenticación se registra aquí para enterarse de renovaciones y de sesiones vencidas. */
export function registrarEscuchas(expirar: () => void, renovar: (u: UsuarioSesion) => void) {
  alExpirar = expirar;
  alRenovar = renovar;
}
export const notificarSesionExpirada = () => alExpirar?.();

let renovando: Promise<RespuestaSesion | null> | null = null;

/**
 * Pide un token nuevo con la cookie de refresh. Una sola petición a la vez: varias pantallas que reciben 401
 * juntas comparten la misma renovación (el refresh token rota y no se puede usar dos veces).
 */
export function renovarSesion(): Promise<RespuestaSesion | null> {
  if (!renovando) {
    renovando = axios
      .post<RespuestaSesion>(`${API_BASE_URL}/auth/refresh`, null, {
        withCredentials: true,
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      })
      .then((r) => {
        accessToken = r.data.access_token;
        alRenovar?.(r.data.usuario);
        return r.data;
      })
      .catch(() => {
        accessToken = null;
        return null;
      })
      .finally(() => {
        renovando = null;
      });
  }
  return renovando;
}

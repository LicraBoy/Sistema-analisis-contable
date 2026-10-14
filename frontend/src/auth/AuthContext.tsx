/**
 * AuthContext — estado de sesión del usuario: restaura la sesión al abrir la app (refresh con cookie httpOnly),
 * inicia/cierra sesión, cambia contraseña, expone `puede(modulo, nivel)` y cierra la sesión por inactividad.
 */

import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import apiClient from '../api/client';
import { guardarCapturista } from '../components/fiesta/fiestaUtils';
import { fijarToken, registrarEscuchas, renovarSesion, type RespuestaSesion, type UsuarioSesion } from './sesion';

// Por omisión, hasta que el servidor diga cuánto dura la sesión (GET /auth/estado → inactividad_min).
const INACTIVIDAD_POR_OMISION_MIN = 240;

type Estado = 'cargando' | 'anonimo' | 'autenticado';

export interface ResultadoLogin {
  ok: boolean;
  mensaje?: string;
  /** Minutos que faltan para que se desbloquee la cuenta (423). */
  bloqueadaMinutos?: number;
}

export interface ResultadoPassword {
  ok: boolean;
  mensaje?: string;
  errores?: string[];
}

interface Contexto {
  estado: Estado;
  usuario: UsuarioSesion | null;
  /** false = el servidor está en modo abierto (desarrollo): no hay login. */
  authActiva: boolean;
  login: (email: string, password: string) => Promise<ResultadoLogin>;
  logout: (motivo?: string) => Promise<void>;
  cambiarPassword: (actual: string, nueva: string) => Promise<ResultadoPassword>;
  /** El usuario edita su propio nombre. */
  actualizarPerfil: (nombre: string) => Promise<{ ok: boolean; mensaje?: string }>;
  /** ¿Tiene el módulo en ese nivel o más? (1 = ver, 2 = editar) */
  puede: (modulo: string, nivel?: number) => boolean;
}

const AuthCtx = createContext<Contexto | null>(null);

export function useAuth(): Contexto {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>('cargando');
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [authActiva, setAuthActiva] = useState(true);
  const queryClient = useQueryClient();
  const ultimaActividad = useRef(Date.now());
  const avisado = useRef(false);
  const inactividadMin = useRef(INACTIVIDAD_POR_OMISION_MIN);

  const aplicarSesion = useCallback((r: RespuestaSesion) => {
    fijarToken(r.access_token);
    guardarCapturista(r.usuario.nombre || r.usuario.email); // los formularios de la Fiesta se rellenan con quien capturó
    setUsuario(r.usuario);
    setEstado('autenticado');
    ultimaActividad.current = Date.now();
    avisado.current = false;
  }, []);

  const cerrarLocal = useCallback(() => {
    fijarToken(null);
    setUsuario(null);
    setEstado('anonimo');
    queryClient.clear(); // que el siguiente usuario no vea datos en caché del anterior
  }, [queryClient]);

  // Al abrir: ¿el servidor exige login? Si sí, intentar restaurar la sesión con la cookie.
  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const { data } = await apiClient.get<{ auth_activa: boolean; inactividad_min?: number }>('/auth/estado');
        if (!vigente) return;
        if (data.inactividad_min) inactividadMin.current = data.inactividad_min;
        setAuthActiva(data.auth_activa);
        if (!data.auth_activa) {
          const yo = await apiClient.get<UsuarioSesion>('/auth/yo');
          if (!vigente) return;
          setUsuario(yo.data);
          setEstado('autenticado');
          return;
        }
        const r = await renovarSesion();
        if (!vigente) return;
        if (r) aplicarSesion(r);
        else setEstado('anonimo');
      } catch {
        if (vigente) setEstado('anonimo');
      }
    })();
    return () => {
      vigente = false;
    };
  }, [aplicarSesion]);

  // El cliente HTTP avisa cuando renueva el token (perfil al día) o cuando la sesión ya no se puede renovar.
  useEffect(() => {
    registrarEscuchas(
      () => {
        notifications.show({ color: 'orange', title: 'Sesión terminada', message: 'Tu sesión expiró. Inicia sesión de nuevo.' });
        cerrarLocal();
      },
      (u) => setUsuario(u),
    );
  }, [cerrarLocal]);

  const login = useCallback<Contexto['login']>(
    async (email, password) => {
      try {
        const { data } = await apiClient.post<RespuestaSesion>('/auth/login', { email, password });
        aplicarSesion(data);
        return { ok: true };
      } catch (e) {
        if (axios.isAxiosError(e) && e.response) {
          const d = e.response.data as { detail?: string; bloqueada_minutos?: number };
          return { ok: false, mensaje: d.detail ?? 'No se pudo iniciar sesión.', bloqueadaMinutos: d.bloqueada_minutos };
        }
        return { ok: false, mensaje: 'No se pudo conectar con el servidor.' };
      }
    },
    [aplicarSesion],
  );

  const logout = useCallback<Contexto['logout']>(
    async (motivo) => {
      try {
        await apiClient.post('/auth/logout');
      } catch {
        // aunque el servidor no responda, se cierra localmente
      }
      cerrarLocal();
      if (motivo) notifications.show({ color: 'orange', title: 'Sesión cerrada', message: motivo });
    },
    [cerrarLocal],
  );

  const cambiarPassword = useCallback<Contexto['cambiarPassword']>(
    async (actual, nueva) => {
      try {
        const { data } = await apiClient.post<RespuestaSesion>('/auth/cambiar-password', { actual, nueva });
        aplicarSesion(data);
        return { ok: true };
      } catch (e) {
        if (axios.isAxiosError(e) && e.response) {
          const d = e.response.data as { detail?: string; errores?: string[] };
          return { ok: false, mensaje: d.detail ?? 'No se pudo cambiar la contraseña.', errores: d.errores };
        }
        return { ok: false, mensaje: 'No se pudo conectar con el servidor.' };
      }
    },
    [aplicarSesion],
  );

  const actualizarPerfil = useCallback<Contexto['actualizarPerfil']>(async (nombre) => {
    try {
      const { data } = await apiClient.patch<UsuarioSesion>('/auth/perfil', { nombre });
      setUsuario(data);
      guardarCapturista(data.nombre || data.email);
      return { ok: true };
    } catch (e) {
      const d = axios.isAxiosError(e) ? (e.response?.data as { detail?: string } | undefined)?.detail : undefined;
      return { ok: false, mensaje: typeof d === 'string' ? d : 'No se pudo guardar el perfil.' };
    }
  }, []);

  const puede = useCallback<Contexto['puede']>((modulo, nivel = 1) => (usuario?.permisos?.[modulo] ?? 0) >= nivel, [usuario]);

  // Cierre por inactividad (solo con login real).
  useEffect(() => {
    if (estado !== 'autenticado' || !authActiva) return;
    const marcar = () => {
      ultimaActividad.current = Date.now();
      avisado.current = false;
    };
    const eventos = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const;
    eventos.forEach((ev) => window.addEventListener(ev, marcar, { passive: true }));
    const reloj = window.setInterval(() => {
      const minutos = (Date.now() - ultimaActividad.current) / 60_000;
      const limite = inactividadMin.current;
      if (minutos >= limite) {
        void logout(`Se cerró tu sesión por ${limite >= 120 ? `${Math.round(limite / 60)} horas` : `${limite} minutos`} sin actividad.`);
      } else if (minutos >= limite - 2 && !avisado.current) {
        avisado.current = true;
        notifications.show({
          color: 'yellow',
          title: 'Tu sesión está por cerrarse',
          message: 'Por inactividad se cerrará en 2 minutos. Mueve el mouse o presiona una tecla para continuar.',
          autoClose: 8000,
        });
      }
    }, 15_000);
    return () => {
      eventos.forEach((ev) => window.removeEventListener(ev, marcar));
      window.clearInterval(reloj);
    };
  }, [estado, authActiva, logout]);

  const valor = useMemo<Contexto>(
    () => ({ estado, usuario, authActiva, login, logout, cambiarPassword, actualizarPerfil, puede }),
    [estado, usuario, authActiva, login, logout, cambiarPassword, actualizarPerfil, puede],
  );
  return <AuthCtx.Provider value={valor}>{children}</AuthCtx.Provider>;
}

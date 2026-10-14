/**
 * Hooks de Administración (usuarios, roles y permisos, bitácora de seguridad).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import apiClient from './client';

export interface AdminUsuario {
  id: number;
  email: string;
  nombre: string;
  rol_id: number | null;
  rol: string | null;
  is_active: boolean;
  must_change_password: boolean;
  bloqueado: boolean;
  locked_until: string | null;
  failed_attempts: number;
  last_login_at: string | null;
  created_at: string | null;
  /** Solo viene al crear o restablecer: se muestra una vez. */
  password_temporal?: string;
}

export interface AdminRol {
  id: number;
  clave: string;
  nombre: string;
  descripcion: string | null;
  es_sistema: boolean;
  usuarios: number;
  permisos: Record<string, number>;
}

export interface AdminModulos {
  modulos: { clave: string; nombre: string; descripcion: string }[];
  capacidades: { clave: string; nombre: string; descripcion: string }[];
  niveles: { valor: number; nombre: string }[];
}

export interface FilaAuditoria {
  id: number;
  ts: string;
  evento: string;
  email: string | null;
  modulo: string | null;
  detalle: string | null;
  exito: boolean;
  ip: string | null;
}

export interface FiltrosAuditoria {
  evento?: string;
  email?: string;
  solo_fallos?: boolean;
  desde?: string;
  hasta?: string;
  pagina: number;
}

const CLAVE = ['admin'];

export function useAdminUsuarios() {
  return useQuery({
    queryKey: [...CLAVE, 'usuarios'],
    queryFn: async () => (await apiClient.get<AdminUsuario[]>('/administracion/usuarios')).data,
  });
}

export function useAdminRoles() {
  return useQuery({
    queryKey: [...CLAVE, 'roles'],
    queryFn: async () => (await apiClient.get<AdminRol[]>('/administracion/roles')).data,
  });
}

export function useAdminModulos() {
  return useQuery({
    queryKey: [...CLAVE, 'modulos'],
    queryFn: async () => (await apiClient.get<AdminModulos>('/administracion/modulos')).data,
    staleTime: Infinity,
  });
}

export function useAdminAuditoria(filtros: FiltrosAuditoria) {
  return useQuery({
    queryKey: [...CLAVE, 'auditoria', filtros],
    queryFn: async () => {
      const params = Object.fromEntries(Object.entries({ ...filtros, por_pagina: 50 }).filter(([, v]) => v !== undefined && v !== '' && v !== false));
      return (await apiClient.get<{ total: number; pagina: number; por_pagina: number; eventos: string[]; filas: FilaAuditoria[] }>('/administracion/auditoria', { params })).data;
    },
    placeholderData: (previa) => previa,
  });
}

function useMutacion<T, R = unknown>(fn: (p: T) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: CLAVE }),
  });
}

export const useCrearUsuario = () =>
  useMutacion(async (p: { email: string; nombre: string; rol_id: number }) => (await apiClient.post<AdminUsuario>('/administracion/usuarios', p)).data);

export const useEditarUsuario = () =>
  useMutacion(async (p: { id: number; cambios: { nombre?: string; rol_id?: number; is_active?: boolean } }) =>
    (await apiClient.patch<AdminUsuario>(`/administracion/usuarios/${p.id}`, p.cambios)).data,
  );

export const useDesbloquearUsuario = () => useMutacion(async (id: number) => (await apiClient.post(`/administracion/usuarios/${id}/desbloquear`)).data);

export const useRestablecerPassword = () =>
  useMutacion(async (p: { id: number; password?: string }) => (await apiClient.post<AdminUsuario>(`/administracion/usuarios/${p.id}/restablecer-password`, { password: p.password || null })).data);

export const useCerrarSesionesUsuario = () => useMutacion(async (id: number) => (await apiClient.post(`/administracion/usuarios/${id}/cerrar-sesiones`)).data);

export const useGuardarPermisos = () =>
  useMutacion(async (p: { rolId: number; permisos: Record<string, number> }) =>
    (await apiClient.put<AdminRol>(`/administracion/roles/${p.rolId}/permisos`, { permisos: p.permisos })).data,
  );

export const useCrearRol = () =>
  useMutacion(async (p: { clave: string; nombre: string; descripcion?: string; copiar_de?: number }) =>
    (await apiClient.post<AdminRol>('/administracion/roles', p)).data,
  );

export const useBorrarRol = () => useMutacion(async (id: number) => (await apiClient.delete(`/administracion/roles/${id}`)).data);

export function mensajeErrorAdmin(e: unknown): string {
  const d = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof d === 'string' ? d : 'No se pudo completar la acción.';
}

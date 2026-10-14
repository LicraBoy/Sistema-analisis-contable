/**
 * SupervisorPin — autorización de supervisor antes de las acciones que cambian precios (precios y corte de
 * preventa, autorizar/quitar preventa, cambiar el tipo o el precio de un boleto, corregir pagos, bloquear sillas).
 * El supervisor confirma su contraseña (si quien opera ya es supervisor, solo la suya) y el servidor devuelve una
 * autorización de un solo uso (2 min) que viaja en la cabecera X-Autorizacion. Quien autorizó queda en la bitácora.
 *
 * Uso: `const pedirPin = useSupervisor(); const aut = await pedirPin('cambiar precios'); if (aut === null) return;`
 * y mandar `aut` (cadena vacía si no hace falta) al hook de la acción como `pin`.
 */

import { Button, Group, Modal, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { IconShieldLock } from '@tabler/icons-react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

import apiClient from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { mensajeErrorFiesta } from '../../api/fiestaHooks';

/** Devuelve la autorización, '' si no hace falta (autenticación apagada), o null si el usuario canceló. */
export type PedirPin = (accion: string) => Promise<string | null>;

const ContextoSupervisor = createContext<PedirPin>(async () => '');

export function useSupervisor(): PedirPin {
  return useContext(ContextoSupervisor);
}

export function SupervisorProvider({ children }: { children: ReactNode }) {
  const { authActiva, puede, usuario } = useAuth();
  const esSupervisor = puede('fiesta_supervisor', 2);

  const [accion, setAccion] = useState<string | null>(null);
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [verificando, setVerificando] = useState(false);
  const resolver = useRef<((v: string | null) => void) | null>(null);

  const pedir = useCallback<PedirPin>(
    (nombreAccion) => {
      if (!authActiva) return Promise.resolve('');
      resolver.current?.(null); // si había otra solicitud abierta, se cancela
      setCorreo('');
      setPassword('');
      setError('');
      setAccion(nombreAccion);
      return new Promise<string | null>((resolve) => {
        resolver.current = resolve;
      });
    },
    [authActiva],
  );

  const cerrar = (valor: string | null) => {
    resolver.current?.(valor);
    resolver.current = null;
    setAccion(null);
    setPassword('');
  };

  const confirmar = async () => {
    if (!password || (!esSupervisor && !correo.trim())) return;
    setVerificando(true);
    setError('');
    try {
      const { data } = await apiClient.post<{ autorizacion: string }>('/auth/autorizar', {
        password,
        email: esSupervisor ? undefined : correo.trim(),
      });
      cerrar(data.autorizacion);
    } catch (e) {
      setError(mensajeErrorFiesta(e));
    } finally {
      setVerificando(false);
    }
  };

  return (
    <ContextoSupervisor.Provider value={pedir}>
      {children}
      <Modal
        opened={accion !== null}
        onClose={() => cerrar(null)}
        title={
          <Group gap="xs">
            <IconShieldLock size={20} />
            <Text fw={600}>Autorización de supervisor</Text>
          </Group>
        }
        size="sm"
        zIndex={600}
        centered
      >
        <Stack gap="sm">
          <Text size="sm">
            Para <b>{accion}</b> {esSupervisor ? `confirma tu contraseña, ${usuario?.nombre ?? ''}.` : 'un supervisor debe autorizar con su usuario y contraseña.'}
          </Text>
          {!esSupervisor && (
            <TextInput label="Usuario del supervisor" value={correo} onChange={(e) => setCorreo(e.currentTarget.value)} autoComplete="off" data-autofocus />
          )}
          <PasswordInput
            label={esSupervisor ? 'Tu contraseña' : 'Contraseña del supervisor'}
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirmar()}
            error={error || undefined}
            data-autofocus={esSupervisor ? true : undefined}
            autoComplete="off"
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => cerrar(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmar} loading={verificando} disabled={!password || (!esSupervisor && !correo.trim())}>
              Autorizar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </ContextoSupervisor.Provider>
  );
}

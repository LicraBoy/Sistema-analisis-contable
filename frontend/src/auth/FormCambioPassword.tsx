/**
 * FormCambioPassword — formulario de cambio de contraseña con indicador de fuerza. Lo usan la pantalla
 * obligatoria del primer acceso y "Mi cuenta". La política real la valida el servidor; esto es solo guía.
 */

import { Alert, Button, List, PasswordInput, Progress, Stack, Text } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { useState } from 'react';

import { useAuth } from './AuthContext';

const REGLAS: { texto: string; ok: (p: string) => boolean }[] = [
  { texto: 'Al menos 10 caracteres', ok: (p) => p.length >= 10 },
  { texto: 'Combina 3 de: minúsculas, mayúsculas, números y símbolos', ok: (p) => [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length >= 3 },
];

export function fuerza(p: string): number {
  if (!p) return 0;
  let puntos = REGLAS.filter((r) => r.ok(p)).length * 30;
  if (p.length >= 14) puntos += 25;
  if (p.length >= 18) puntos += 15;
  return Math.min(puntos, 100);
}

export default function FormCambioPassword({ alTerminar, etiquetaBoton = 'Cambiar contraseña' }: { alTerminar?: () => void; etiquetaBoton?: string }) {
  const { cambiarPassword } = useAuth();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [errores, setErrores] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  const nivel = fuerza(nueva);
  const distintas = repetir.length > 0 && repetir !== nueva;
  const listo = actual && nueva && repetir === nueva && REGLAS.every((r) => r.ok(nueva));

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setErrores([]);
    const r = await cambiarPassword(actual, nueva);
    setGuardando(false);
    if (r.ok) alTerminar?.();
    else setErrores(r.errores?.length ? r.errores : [r.mensaje ?? 'No se pudo cambiar la contraseña.']);
  };

  return (
    <form onSubmit={enviar}>
      <Stack gap="sm">
        <PasswordInput label="Contraseña actual" value={actual} onChange={(e) => setActual(e.currentTarget.value)} autoComplete="current-password" required />
        <PasswordInput label="Contraseña nueva" value={nueva} onChange={(e) => setNueva(e.currentTarget.value)} autoComplete="new-password" required />
        <div>
          <Progress value={nivel} color={nivel < 50 ? 'red' : nivel < 80 ? 'yellow' : 'green'} size="sm" />
          <List size="xs" mt={6} spacing={2} center>
            {REGLAS.map((r) => (
              <List.Item
                key={r.texto}
                icon={r.ok(nueva) ? <IconCheck size={14} color="var(--mantine-color-green-6)" /> : <IconX size={14} color="var(--mantine-color-gray-5)" />}
              >
                <Text span size="xs" c={r.ok(nueva) ? undefined : 'dimmed'}>
                  {r.texto}
                </Text>
              </List.Item>
            ))}
          </List>
        </div>
        <PasswordInput
          label="Repite la contraseña nueva"
          value={repetir}
          onChange={(e) => setRepetir(e.currentTarget.value)}
          error={distintas ? 'No coinciden' : undefined}
          autoComplete="new-password"
          required
        />
        {errores.length > 0 && (
          <Alert color="red" variant="light">
            {errores.map((m) => (
              <Text key={m} size="sm">
                {m}
              </Text>
            ))}
          </Alert>
        )}
        <Button type="submit" loading={guardando} disabled={!listo}>
          {etiquetaBoton}
        </Button>
      </Stack>
    </form>
  );
}

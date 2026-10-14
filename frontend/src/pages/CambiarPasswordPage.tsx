/**
 * CambiarPasswordPage — pantalla obligatoria cuando la cuenta es nueva o el administrador restableció la
 * contraseña: hay que elegir una propia antes de entrar al sistema.
 */

import { Alert, Box, Card, Stack, Text, Title } from '@mantine/core';
import { IconShieldLock } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';

import FormCambioPassword from '../auth/FormCambioPassword';

export default function CambiarPasswordPage() {
  const navigate = useNavigate();
  return (
    <Box style={{ minHeight: '100vh', backgroundColor: 'var(--mantine-color-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Card shadow="xl" padding="xl" radius="lg" w={440} maw="100%">
        <Stack gap="md">
          <Stack gap={4} align="center">
            <IconShieldLock size={36} color="var(--mantine-color-violet-6)" />
            <Title order={3}>Elige tu contraseña</Title>
            <Text size="sm" c="dimmed" ta="center">
              Por seguridad, antes de continuar tienes que cambiar la contraseña temporal.
            </Text>
          </Stack>
          <Alert variant="light" color="violet">
            Usa algo que solo tú conozcas: no tu correo, tu nombre ni “contraseña123”.
          </Alert>
          <FormCambioPassword etiquetaBoton="Guardar y entrar" alTerminar={() => navigate('/', { replace: true })} />
        </Stack>
      </Card>
    </Box>
  );
}

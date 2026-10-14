/**
 * LoginPage — inicio de sesión real: mensajes claros, aviso de cuenta bloqueada y regreso a la página pedida.
 */

import { Alert, Box, Button, Card, Center, PasswordInput, Stack, Text, TextInput, ThemeIcon, Title } from '@mantine/core';
import { IconAlertTriangle, IconChartBar, IconLock, IconMail } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { BRAND_GRADIENT } from '../theme/tokens';

export default function LoginPage() {
  const { estado, usuario, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [bloqueada, setBloqueada] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const desde = (location.state as { desde?: string } | null)?.desde ?? '/';

  useEffect(() => {
    document.title = 'Iniciar sesión';
  }, []);

  if (estado === 'autenticado') return <Navigate to={usuario?.must_change_password ? '/cambiar-password' : desde} replace />;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError('');
    setBloqueada(false);
    const r = await login(email.trim(), password);
    setEnviando(false);
    if (r.ok) {
      setPassword('');
      navigate(desde, { replace: true });
    } else {
      setError(r.mensaje ?? 'No se pudo iniciar sesión.');
      setBloqueada(r.bloqueadaMinutos !== undefined);
      setPassword('');
    }
  };

  return (
    <Box
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--mantine-color-body)',
        backgroundImage:
          'radial-gradient(circle at 20% 20%, var(--mantine-color-violet-1) 0%, transparent 45%), radial-gradient(circle at 80% 80%, var(--mantine-color-violet-1) 0%, transparent 45%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <Card shadow="xl" padding="xl" radius="lg" w={420} maw="100%">
        <form onSubmit={enviar}>
          <Stack gap="lg">
            <Center>
              <Stack gap={8} align="center">
                <ThemeIcon size={56} radius="md" variant="gradient" gradient={BRAND_GRADIENT}>
                  <IconChartBar size={28} stroke={2} />
                </ThemeIcon>
                <Title order={2} ta="center" style={{ letterSpacing: '-0.5px' }}>
                  Análisis Contable
                </Title>
                <Text c="dimmed" size="sm" ta="center">
                  Inicia sesión para continuar
                </Text>
              </Stack>
            </Center>

            <TextInput
              id="login-email"
              label="Usuario"
              placeholder="Tu usuario"
              leftSection={<IconMail size={16} />}
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              autoComplete="username"
              required
              size="md"
              data-autofocus
            />

            <PasswordInput
              id="login-password"
              label="Contraseña"
              placeholder="Tu contraseña"
              leftSection={<IconLock size={16} />}
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              autoComplete="current-password"
              required
              size="md"
            />

            {error && (
              <Alert color={bloqueada ? 'orange' : 'red'} variant="light" icon={<IconAlertTriangle size={16} />} role="alert">
                {error}
              </Alert>
            )}

            <Button id="login-submit" type="submit" fullWidth size="md" loading={enviando} variant="gradient" gradient={BRAND_GRADIENT} style={{ fontWeight: 600 }}>
              Iniciar sesión
            </Button>
            <Text size="xs" c="dimmed" ta="center">
              ¿Olvidaste tu contraseña o se bloqueó tu cuenta? Pídele al administrador que la restablezca.
            </Text>
          </Stack>
        </form>
      </Card>
    </Box>
  );
}

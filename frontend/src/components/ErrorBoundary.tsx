/**
 * ErrorBoundary — si un componente falla al dibujarse, en vez de dejar toda la pantalla en blanco se muestra un
 * aviso con botón para recargar (y el detalle técnico para reportarlo). Se reinicia al cambiar de ruta (`resetKey`).
 */

import { Alert, Button, Code, Group, Stack, Text, Title } from '@mantine/core';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  resetKey?: string;
}

interface Estado {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, Estado> {
  state: Estado = { error: null };

  static getDerivedStateFromError(error: Error): Estado {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Queda en la consola del navegador para poder reportarlo.
    console.error('Error de pantalla:', error, info.componentStack);
  }

  componentDidUpdate(anterior: Props) {
    if (this.state.error && anterior.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Stack maw={640} mx="auto" mt="xl" p="md" gap="sm">
        <Title order={3}>Algo salió mal en esta pantalla</Title>
        <Text size="sm" c="dimmed">
          Tu información está a salvo: lo que ya se registró no se perdió. Recarga la página para continuar y, si se repite,
          avisa al administrador con el texto de abajo.
        </Text>
        <Alert color="red" variant="light">
          <Code block>{this.state.error.message}</Code>
        </Alert>
        <Group>
          <Button onClick={() => window.location.reload()}>Recargar la página</Button>
          <Button variant="default" onClick={() => this.setState({ error: null })}>
            Intentar de nuevo
          </Button>
        </Group>
      </Stack>
    );
  }
}

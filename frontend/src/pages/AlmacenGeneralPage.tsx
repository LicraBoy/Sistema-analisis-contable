/**
 * AlmacenGeneralPage — punto de entrada del módulo Almacén General.
 *
 * Vive en su propio grupo del sidebar ("Almacén"), independiente de
 * Contabilidad. Por ahora es solo el cascarón; las secciones se agregan aquí.
 */

import { Stack, Text, Title } from '@mantine/core';

export default function AlmacenGeneralPage() {
  return (
    <Stack gap="xs">
      <Title order={2}>Almacén General</Title>
      <Text c="dimmed" size="sm">
        Módulo en construcción.
      </Text>
    </Stack>
  );
}

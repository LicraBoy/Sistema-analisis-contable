/**
 * GuiaCajeras — guía rápida de la Fiesta dentro del sistema (mismo contenido que docs/GUIA_CAJERAS_FIESTA.md).
 * Se abre desde el botón "Guía rápida" de la pantalla de la Fiesta; se puede imprimir.
 */

import { Accordion, Alert, Button, Group, List, Modal, Stack, Text } from '@mantine/core';
import { IconBook2, IconPrinter } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useState } from 'react';

interface Tema {
  clave: string;
  titulo: string;
  texto: string[]; // cada línea; las que empiezan con "- " se muestran como viñetas
}

const TEMAS: Tema[] = [
  {
    clave: 'entrar',
    titulo: '1. Entrar al sistema',
    texto: [
      '- Escribe tu usuario y tu contraseña. La primera vez el sistema te pedirá cambiarla por una propia (mínimo 10 caracteres, mezcla letras y números).',
      '- Para salir usa "Cerrar sesión" en el menú. Si pasas 4 horas sin usarlo, se cierra solo.',
      '- ¿Olvidaste tu contraseña o se bloqueó tu cuenta (5 intentos fallidos)? Pídele al administrador que la restablezca.',
      '- No compartas tu usuario: todo lo que haces queda registrado con tu nombre.',
    ],
  },
  {
    clave: 'reservar',
    titulo: '2. Reservar mesas o sillas',
    texto: [
      '- En Croquis, haz clic en la mesa, elige las sillas libres y el tipo de boleto de cada una: adulto, niño o cortesía.',
      '- Captura nombre, teléfono y correo del cliente. Son obligatorios: sin ellos el botón "Reservar" no se activa.',
      '- Presiona Reservar. Aquí solo se aparta el lugar; el dinero se registra después como abono.',
      '- También puedes reservar desde Reservaciones → Nueva reservación.',
      'Una silla solo puede estar en una reservación. Si otra caja la tomó un segundo antes, el sistema te avisa y no se duplica.',
    ],
  },
  {
    clave: 'cobrar',
    titulo: '3. Cobrar (abonar)',
    texto: [
      '- En Reservaciones busca al cliente (nombre, mesa o teléfono) y presiona Abonar.',
      '- Escribe el importe, elige la forma de pago y, si aplica, la referencia. Puedes usar los botones de sugerencia (25 %, 50 %, 75 %, 100 %).',
      '- Presiona Registrar pago. Verás el aviso verde "Pago registrado".',
      'Si paga con dos formas de pago (parte efectivo y parte tarjeta): escribe el TOTAL en "Importe", presiona "Pagar con otra forma de pago" y captura cuánto se paga con la otra. El sistema calcula el resto de la primera forma y lo registra como un solo cobro.',
      'Para que el dinero vaya a ciertas sillas, elígelas en "Aplicar a".',
    ],
  },
  {
    clave: 'corregir',
    titulo: '4. Corregir o cancelar un cobro',
    texto: [
      '- Haz clic en el monto de Pago 1, 2 o 3 de una silla para corregirlo, o usa el lápiz de la tabla de pagos.',
      '- Para cancelar un cobro que no se debió registrar, usa el botón de cancelar del pago. Queda registrado quién y cuándo.',
    ],
  },
  {
    clave: 'cancelar',
    titulo: '5. Cancelar una reservación',
    texto: [
      '- Presiona "Cancelar reservación" al final del detalle y escribe el motivo. Las sillas quedan libres.',
      '- Si ya tenía dinero cobrado, queda "por devolver": el dinero no desaparece de Cobros hasta que se registre la devolución (tema 7).',
    ],
  },
  {
    clave: 'cortesias',
    titulo: '6. Cortesías (las autoriza un supervisor)',
    texto: [
      '- Elige el tipo "cortesía" para la silla y escribe el motivo (obligatorio).',
      '- Guarda la reservación: no pide contraseña. Las sillas quedan apartadas como "Cortesía por autorizar" y a los supervisores les llega el aviso (campana).',
      '- Si el supervisor la autoriza, queda como cortesía; si la rechaza, las sillas se liberan.',
      '- Convertir una silla ya vendida en cortesía lo hace un supervisor. Cambiar el precio de una silla o autorizar la preventa fuera de fecha sí piden su contraseña.',
    ],
  },
  {
    clave: 'devoluciones',
    titulo: '7. Devoluciones (necesitan supervisor)',
    texto: [
      '- Cuando a un cliente se le regresa dinero (cancelación o cobro de más), abre la reservación: en "Devoluciones" verás "Por devolver $…".',
      '- Captura importe, forma, fecha y motivo, y presiona "Registrar devolución". Un supervisor debe autorizar con su contraseña.',
      '- Así Cobros muestra lo cobrado neto (menos lo devuelto).',
    ],
  },
  {
    clave: 'confirmar',
    titulo: '8. Confirmar al cliente',
    texto: [
      '- Arriba de la reservación están los botones Correo, WhatsApp y Copiar mensaje.',
      '- Correo y WhatsApp abren tu correo o WhatsApp con el mensaje ya escrito (mesa, sillas, total, pagado y saldo). Tú presionas enviar.',
      '- Si el cliente no tiene correo o un teléfono de 10 dígitos, el botón aparece apagado: corrige el dato en la reservación.',
      '- También puedes Imprimir recibo para dárselo en papel.',
    ],
  },
  {
    clave: 'oro',
    titulo: '9. Reglas de oro',
    texto: [
      '- Nunca captures un cobro que no tengas en la mano (efectivo, voucher, comprobante).',
      '- Revisa nombre, teléfono y correo antes de reservar: es la única forma de contactar al cliente.',
      '- Si te equivocaste, corrige o cancela en el sistema; no lo arregles "de palabra".',
      '- Cortesías (las autoriza un supervisor desde la campana) y devoluciones siempre con motivo.',
      '- Cierra tu sesión al terminar o si te levantas de la caja.',
    ],
  },
  {
    clave: 'problemas',
    titulo: '10. ¿Algo no funciona?',
    texto: [
      '- Pantalla en blanco o "Algo salió mal": presiona "Recargar la página" (o Ctrl+F5). Lo que ya registraste no se pierde.',
      '- No entra con la contraseña correcta: puede que el servidor esté reiniciándose; espera un minuto y reintenta. Si sigue, avisa al administrador.',
      '- Un cliente dice que ya pagó y no aparece: busca su reservación y revisa Pago 1/2/3. Si no está, no lo captures de nuevo hasta confirmar con un supervisor (evita cobros duplicados).',
    ],
  },
];

function Lineas({ lineas }: { lineas: string[] }) {
  const items: ReactNode[] = [];
  let viñetas: string[] = [];
  const cerrar = () => {
    if (viñetas.length) {
      items.push(
        <List key={`l${items.length}`} size="sm" spacing={4}>
          {viñetas.map((t) => (
            <List.Item key={t}>{t}</List.Item>
          ))}
        </List>,
      );
      viñetas = [];
    }
  };
  lineas.forEach((l) => {
    if (l.startsWith('- ')) viñetas.push(l.slice(2));
    else {
      cerrar();
      items.push(
        <Alert key={`a${items.length}`} variant="light" color="violet" p="xs">
          <Text size="sm">{l}</Text>
        </Alert>,
      );
    }
  });
  cerrar();
  return <Stack gap="xs">{items}</Stack>;
}

function imprimirGuia() {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cuerpo = TEMAS.map(
    (t) =>
      `<h2>${esc(t.titulo)}</h2>` +
      t.texto.map((l) => (l.startsWith('- ') ? `<p class="v">• ${esc(l.slice(2))}</p>` : `<p class="n">${esc(l)}</p>`)).join(''),
  ).join('');
  const marco = document.createElement('iframe');
  marco.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0';
  document.body.appendChild(marco);
  const doc = marco.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Guía rápida — Fiesta de Fin de Año</title><style>
    body{font-family:Arial,sans-serif;font-size:11px;margin:16px}h1{font-size:16px;margin:0 0 6px}h2{font-size:12px;margin:10px 0 3px;color:#5f3dc4}
    p{margin:2px 0}p.v{margin-left:10px}p.n{background:#f3f0ff;padding:3px 5px;border-radius:3px}
    </style></head><body><h1>Guía rápida para cajeras — Fiesta de Fin de Año</h1>${cuerpo}</body></html>`,
  );
  doc.close();
  marco.contentWindow?.focus();
  window.setTimeout(() => {
    marco.contentWindow?.print();
    window.setTimeout(() => marco.remove(), 2000);
  }, 300);
}

export default function GuiaCajeras() {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <Button variant="light" leftSection={<IconBook2 size={16} />} onClick={() => setAbierta(true)}>
        Guía rápida
      </Button>
      <Modal opened={abierta} onClose={() => setAbierta(false)} title="Guía rápida para cajeras" size="lg" zIndex={400}>
        <Stack gap="sm">
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Lo básico para reservar, cobrar, corregir y confirmar.
            </Text>
            <Button size="xs" variant="default" leftSection={<IconPrinter size={14} />} onClick={imprimirGuia}>
              Imprimir
            </Button>
          </Group>
          <Accordion variant="separated" defaultValue="reservar">
            {TEMAS.map((t) => (
              <Accordion.Item key={t.clave} value={t.clave}>
                <Accordion.Control>{t.titulo}</Accordion.Control>
                <Accordion.Panel>
                  <Lineas lineas={t.texto} />
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        </Stack>
      </Modal>
    </>
  );
}

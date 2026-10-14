# Plataforma de Inteligencia de Abastecimiento Hotelero

## 1. Concepto general

Actualmente existe un software empresarial utilizado por el hotel para gestionar las operaciones del almacén.

La propuesta **no busca reemplazar ese software**, sino crear una plataforma independiente y complementaria que utilice la información disponible del almacén para ayudar en la **toma de decisiones de abastecimiento**.

El objetivo principal es responder de forma inteligente:

> **¿Qué debemos pedir, cuánto debemos pedir y cuándo debemos pedirlo, evitando tanto faltantes como exceso de inventario?**

La plataforma funcionaría como una **capa de inteligencia sobre el sistema existente**.

### Sistema actual

Se encarga principalmente de:

* Registrar entradas.
* Registrar salidas.
* Registrar movimientos.
* Mantener el inventario oficial.
* Gestionar la operación cotidiana del almacén.

### Nueva plataforma

Se encargaría principalmente de:

* Analizar inventarios.
* Analizar consumos históricos.
* Detectar tendencias.
* Detectar riesgos de faltantes.
* Detectar sobreinventario.
* Pronosticar necesidades.
* Recomendar compras.
* Analizar proveedores.
* Generar escenarios.
* Explicar por qué se recomienda una determinada compra.
* Apoyar a Almacén, Compras, Contraloría y Dirección en la toma de decisiones.

---

# 2. Objetivo del proyecto

Desarrollar una plataforma de inteligencia para el **Almacén General del hotel** que permita mejorar la planeación de compras y el control de inventarios, utilizando información histórica y operativa para reducir:

* Faltantes de productos.
* Compras innecesarias.
* Exceso de inventario.
* Capital inmovilizado.
* Productos de baja rotación.
* Compras basadas únicamente en criterio manual.
* Errores al calcular las cantidades necesarias.

Al mismo tiempo, debe ayudar a mantener:

* Disponibilidad adecuada de productos.
* Inventarios saludables.
* Niveles de seguridad adecuados.
* Mayor previsibilidad de las compras.
* Mejor planeación mensual.

---

# 3. Problema actual

Actualmente Almacén necesita determinar qué productos debe solicitar durante el mes.

Existe un **Excel utilizado para apoyar el proceso de pedido mensual**, pero se necesita entender exactamente cómo funciona esa metodología.

El problema no necesariamente es que el proceso actual esté mal, sino que puede estar limitado por depender de:

* cálculos manuales;
* información histórica limitada;
* revisión de existencias;
* criterios individuales;
* promedios simples;
* falta de análisis de tendencias;
* falta de consideración de la operación futura del hotel.

La oportunidad consiste en evolucionar de:

> **“¿Qué compramos este mes?”**

a:

> **“¿Qué vamos a necesitar, cuánto, cuándo y por qué?”**

---

# 4. Principio fundamental del proyecto

La plataforma debe funcionar como:

> **Sistema empresarial → registra**
>
> **Plataforma de inteligencia → analiza y recomienda**

La plataforma **no debe convertirse en otro sistema operativo de almacén**.

Su función principal es transformar información en decisiones.

---

# 5. Preguntas que debemos responder sobre el pedido mensual

Antes de desarrollar el módulo de inteligencia, es necesario entender completamente cómo se realiza actualmente el pedido.

## 5.1 Funcionamiento actual

* ¿Quién realiza actualmente el pedido mensual?
* ¿Cada cuánto se realiza?
* ¿Se hace una sola compra mensual o existen pedidos adicionales?
* ¿Todos los productos se solicitan bajo la misma metodología?
* ¿Cómo determinan actualmente cuánto pedir?
* ¿La cantidad la calcula una persona?
* ¿Se utiliza el consumo del mes anterior?
* ¿Se utiliza un promedio de varios meses?
* ¿Se considera el inventario actual?
* ¿Se consideran pedidos que ya fueron realizados pero todavía no llegan?
* ¿Existe una cantidad mínima por producto?
* ¿Existe una cantidad máxima?
* ¿Existe un nivel mínimo de inventario?
* ¿Existe inventario de seguridad?
* ¿Cómo determinan que ya es necesario volver a comprar?

---

# 6. Preguntas sobre el Excel actual

El Excel del pedido mensual debe estudiarse antes de diseñar la lógica definitiva.

### Información que debemos identificar

* ¿Qué representa cada fila?
* ¿Cada fila corresponde a un producto?
* ¿Qué representa cada columna?
* ¿Qué columna identifica al producto?
* ¿Qué columna indica la existencia actual?
* ¿Qué columna representa el consumo?
* ¿Qué periodo representa el consumo?
* ¿Cuántos meses históricos se utilizan?
* ¿Existe una columna de cantidad sugerida?
* ¿Cómo se calcula actualmente esa cantidad?
* ¿Existen productos que no deberían solicitarse?
* ¿Cómo identifican productos con exceso?
* ¿Cómo identifican productos próximos a agotarse?
* ¿Existen diferentes unidades de medida?
* ¿Se manejan cajas, piezas, paquetes, litros, kilos, etc.?
* ¿Las cantidades deben redondearse a una presentación comercial?
* ¿Existe una compra mínima?
* ¿Existen productos que sólo pueden comprarse en determinadas presentaciones?

---

# 7. Módulos propuestos

## Módulo 1 — Dashboard de Almacén

Vista ejecutiva del estado general del almacén.

### Indicadores posibles

* Inventario total.
* Valor estimado del inventario.
* Productos en riesgo de faltante.
* Productos con sobreinventario.
* Productos sin movimiento.
* Productos de alta rotación.
* Productos de baja rotación.
* Pedidos recomendados.
* Compras que podrían reducirse.
* Capital potencialmente inmovilizado.

### Ejemplo

```text
Inventario total              $1,850,000
Sobreinventario                 $320,000
Productos en riesgo                    18
Productos sin movimiento                43
Pedidos recomendados                    26
Compras potencialmente reducibles   $125,000
```

---

# 8. Módulo 2 — Inventario

Permitir analizar el inventario actual sin reemplazar el sistema oficial.

### Información por producto

* Producto.
* Categoría.
* Subcategoría.
* Existencia actual.
* Unidad de medida.
* Entradas.
* Salidas.
* Consumo promedio.
* Pedidos pendientes.
* Días de cobertura.
* Nivel mínimo.
* Nivel máximo.
* Inventario de seguridad.
* Estado del inventario.

### Indicadores

**Cobertura de inventario**

> ¿Cuántos días o meses puede operar el hotel con el inventario actual?

Ejemplo:

```text
Stock actual: 2,500
Consumo mensual: 1,200

Cobertura aproximada: 62 días
```

---

# 9. Módulo 3 — Análisis de consumo

La plataforma debe estudiar cómo se comporta cada producto.

### Análisis

* Consumo mensual.
* Promedio histórico.
* Tendencia.
* Variación mensual.
* Crecimiento o disminución.
* Estacionalidad.
* Rotación.
* Consumos atípicos.
* Comportamientos anormales.

### Importante

No todos los consumos deben utilizarse directamente para hacer pronósticos.

Por ejemplo:

Si durante un mes hubo un evento extraordinario y se consumieron 5,000 unidades de un producto, la plataforma no debería asumir automáticamente:

> “El hotel consume 5,000 unidades todos los meses.”

Debe detectar que ese consumo fue **atípico**.

---

# 10. Módulo 4 — Pedido Inteligente

Este sería uno de los módulos principales del proyecto.

Su función sería determinar:

> **Qué comprar + cuánto comprar + cuándo comprar**

La recomendación debe utilizar diferentes variables.

### Variables posibles

* Consumo histórico.
* Promedio de consumo.
* Tendencia de consumo.
* Existencia actual.
* Pedidos pendientes.
* Tiempo de entrega.
* Inventario de seguridad.
* Nivel mínimo.
* Nivel máximo.
* Presentación de compra.
* Compra mínima.
* Temporada.
* Ocupación proyectada.
* Operación esperada del hotel.
* Eventos especiales.

---

# 11. Recomendación explicable

La plataforma nunca debería entregar solamente:

> “Comprar 763 unidades.”

Debe explicar:

> **Recomendación: comprar 763 unidades**

### Motivo

* Consumo promedio de los últimos 6 meses.
* Tendencia de crecimiento.
* Inventario disponible.
* Pedido pendiente.
* Tiempo promedio de entrega.
* Inventario de seguridad requerido.
* Ocupación proyectada.
* Temporada.
* Presentación comercial del producto.

De esta manera la persona puede **entender, revisar y validar la recomendación**.

La IA debe ser una herramienta de apoyo, no una caja negra.

---

# 12. Módulo 5 — Detección de sobreinventario

El proyecto no debe enfocarse únicamente en evitar faltantes.

También debe evitar comprar de más.

### Clasificación propuesta

#### 🔴 Riesgo de faltante

El producto puede agotarse antes de la próxima reposición.

#### 🟡 Vigilar

El inventario está disminuyendo, pero todavía no requiere una compra.

#### 🟢 Inventario óptimo

El nivel se encuentra dentro de los parámetros esperados.

#### 🔵 Sobreinventario

Existe mucho más producto del necesario.

#### ⚫ Producto inmovilizado

Existe inventario, pero tiene poco o ningún movimiento.

### Ejemplo

```text
Producto: Producto X

Stock actual:              2,500 unidades
Consumo mensual promedio:   300 unidades
Cobertura:                  8.3 meses

Estado:
🔵 SOBREINVENTARIO

Recomendación:
No realizar nueva compra.
Revisar consumo y posible redistribución.
```

---

# 13. Módulo 6 — Alertas y riesgos

El sistema debe detectar situaciones que requieran atención.

### Posibles alertas

* Producto próximo a agotarse.
* Producto con consumo anormal.
* Producto con crecimiento acelerado.
* Producto con caída significativa del consumo.
* Producto con sobreinventario.
* Producto sin movimiento.
* Producto con demasiada cobertura.
* Pedido retrasado.
* Producto con riesgo de no llegar antes del agotamiento.
* Producto próximo a caducidad.
* Producto con consumo superior al comportamiento histórico.

---

# 14. Módulo 7 — Proveedores

La plataforma también puede utilizar información de proveedores para mejorar la planeación.

### Datos potenciales

* Proveedor.
* Producto.
* Precio.
* Tiempo promedio de entrega.
* Tiempo mínimo.
* Tiempo máximo.
* Cumplimiento histórico.
* Compra mínima.
* Presentación.
* Variaciones de precio.

### Objetivo

No solamente preguntar:

> “¿Cuánto necesitamos?”

sino también:

> “¿Con quién y cuándo conviene abastecernos?”

---

# 15. Módulo 8 — Inteligencia hotelera

Esta sería una de las principales diferencias frente a un sistema genérico de inventarios.

Un hotel no tiene un consumo completamente constante.

El consumo puede estar relacionado con:

* Ocupación.
* Habitaciones ocupadas.
* Número de huéspedes.
* Temporada.
* Eventos.
* Grupos.
* Operación de restaurantes.
* Incrementos esperados de demanda.

### Ejemplo

Históricamente:

```text
80% de ocupación
↓
1,000 unidades consumidas
```

Próximo mes:

```text
95% de ocupación
```

La plataforma podría proyectar:

```text
Incremento esperado de consumo
≈ +12%

Necesidad estimada
≈ 1,180 unidades
```

Esto permitiría que el pedido no dependa solamente del consumo del mes anterior.

---

# 16. Relación entre operación e inventario

La visión de largo plazo es conectar diferentes fuentes de información:

```text
              OPERACIÓN HOTELERA
                     │
                     ▼
             Ocupación / Eventos
                     │
                     ▼
                 CONSUMO
                     │
                     ▼
                INVENTARIO
                     │
                     ▼
              PRONÓSTICO
                     │
                     ▼
             PEDIDO ÓPTIMO
```

Esto convertiría al sistema en una herramienta de **planeación de abastecimiento hotelero**.

---

# 17. Módulo 9 — Simulador de escenarios

Una característica avanzada sería permitir realizar preguntas de tipo:

> **¿Qué pasaría si...?**

### Ejemplo 1

```text
¿Qué pasa si la ocupación sube al 95%?
```

Resultado:

```text
Consumo estimado: +12%
Inventario requerido: +$85,000
```

### Ejemplo 2

```text
¿Qué pasa si reducimos el inventario de seguridad?
```

Resultado:

```text
Capital liberado: $120,000
Riesgo de faltante: +4%
```

### Ejemplo 3

```text
¿Qué pasa si cambiamos de proveedor?
```

Resultado:

```text
Precio: -6%
Tiempo de entrega: +4 días
```

Este módulo permitiría evaluar decisiones antes de ejecutarlas.

---

# 18. Centro de Decisiones del Almacén

La pantalla principal podría convertirse en un verdadero **Centro de Decisiones**.

### Ejemplo

```text
CENTRO DE DECISIONES

🔴 12 productos requieren compra inmediata.

🔴 7 productos pueden agotarse antes de la próxima entrega.

🔵 8 productos presentan sobreinventario.

⚫ 43 productos tienen baja o nula rotación.

🟡 5 productos presentan aumentos de consumo superiores al 30%.

💰 $125,000 de compras podrían ser reducidas.
```

Cada recomendación debe poder abrirse para mostrar:

* Producto.
* Situación.
* Datos analizados.
* Cálculo.
* Riesgo.
* Recomendación.
* Justificación.

---

# 19. Clasificación inteligente de productos

La plataforma podría clasificar automáticamente los productos según comportamiento.

### Por rotación

* Alta.
* Media.
* Baja.
* Sin movimiento.

### Por criticidad

* Crítico.
* Importante.
* Normal.
* Bajo impacto.

### Por riesgo

* Alto.
* Medio.
* Bajo.

### Por inventario

* Faltante.
* Óptimo.
* Exceso.
* Inmovilizado.

Esto permitiría priorizar los productos realmente importantes.

---

# 20. Indicadores clave propuestos

La plataforma podría manejar indicadores como:

### Inventario

* Valor total.
* Existencia.
* Cobertura.
* Inventario de seguridad.
* Inventario máximo.

### Consumo

* Consumo mensual.
* Promedio.
* Tendencia.
* Variación.
* Rotación.

### Abastecimiento

* Número de pedidos recomendados.
* Valor de compras recomendado.
* Productos en riesgo.
* Tiempo promedio de abastecimiento.

### Optimización

* Sobreinventario.
* Capital inmovilizado.
* Productos sin movimiento.
* Compras potencialmente evitables.

---

# 21. Ejemplo de análisis individual

## Shampoo

```text
Stock actual:                 340
Consumo promedio mensual:     520
Tendencia:                    +8%
Pedido pendiente:               0
Tiempo de entrega:             10 días
Inventario de seguridad:      150
Ocupación proyectada:          95%

Estado:
🔴 RIESGO DE FALTANTE

Recomendación:
Comprar 700 unidades.

Motivos:
- El consumo está aumentando.
- La ocupación proyectada es superior al promedio.
- El inventario actual tiene poca cobertura.
- El proveedor tarda aproximadamente 10 días.
- Se debe mantener inventario de seguridad.
```

---

# 22. Objetivo de negocio

El éxito de la plataforma no debería medirse solamente por tener una pantalla bonita o generar un pedido automáticamente.

Debe medirse por su capacidad para ayudar al hotel a:

* Comprar mejor.
* Comprar sólo lo necesario.
* Reducir inventario innecesario.
* Reducir faltantes.
* Anticiparse al consumo.
* Detectar problemas antes de que ocurran.
* Justificar las compras.
* Tomar decisiones basadas en datos.

---

# 23. Arquitectura conceptual

La solución podría manejarse como una plataforma independiente:

```text
┌──────────────────────────────┐
│     SISTEMA EMPRESARIAL      │
│                              │
│ Entradas / Salidas / Stock   │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ DATOS ADICIONALES            │
│                              │
│ Excel / Proveedores /        │
│ Ocupación / Eventos / Otros  │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│ PLATAFORMA DE INTELIGENCIA   │
│                              │
│ Análisis                     │
│ Pronósticos                  │
│ Riesgos                      │
│ Sobreinventario              │
│ Recomendaciones               │
│ Simulaciones                 │
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│         DECISIONES           │
│                              │
│ Qué comprar                  │
│ Cuánto comprar               │
│ Cuándo comprar               │
│ Qué evitar comprar           │
│ Qué productos revisar        │
└──────────────────────────────┘
```

---

# 24. Principio de diseño

La plataforma debe ser:

### Complementaria

No reemplaza el sistema empresarial.

### Predictiva

No solamente muestra lo que pasó; intenta anticipar lo que viene.

### Explicable

Cada recomendación debe poder justificarse.

### Orientada a decisiones

No mostrar información solamente por mostrarla.

### Hotelera

Debe considerar las particularidades de la operación de un hotel.

### Escalable

Debe permitir incorporar posteriormente:

* Compras.
* Proveedores.
* Ocupación.
* Restaurantes.
* Eventos.
* Presupuestos.
* Costos.
* Forecast.
* Planeación operativa.

---

# 25. Preguntas que debemos resolver antes de desarrollar

## Información

* ¿Qué información tenemos disponible?
* ¿De dónde proviene?
* ¿Con qué frecuencia se actualiza?
* ¿Qué tan confiable es?
* ¿Cuántos meses de histórico existen?

## Pedido

* ¿Cómo se calcula actualmente?
* ¿Qué reglas utiliza Almacén?
* ¿Qué productos necesitan trato especial?
* ¿Qué decisiones son manuales?

## Inventario

* ¿Cuáles son los mínimos y máximos?
* ¿Existe stock de seguridad?
* ¿Existen productos críticos?
* ¿Cómo se mide la rotación?

## Proveedores

* ¿Cuánto tardan?
* ¿Qué condiciones manejan?
* ¿Existen mínimos de compra?
* ¿Hay proveedores alternativos?

## Operación hotelera

* ¿Podemos conocer la ocupación futura?
* ¿Existen temporadas?
* ¿Existen eventos?
* ¿Hay productos cuyo consumo dependa directamente de la ocupación?

## Resultados

* ¿Qué espera exactamente Almacén?
* ¿Qué necesita Contraloría?
* ¿Qué información necesita Compras?
* ¿Qué indicadores interesan a Dirección?

---

# 26. Primera fase recomendada

No intentar desarrollar toda la inteligencia desde el inicio.

La primera fase debería enfocarse en entender el proceso actual.

### Fase 1 — Investigación

1. Analizar el Excel actual.
2. Documentar cada columna.
3. Entender el cálculo del pedido.
4. Identificar las fuentes de información.
5. Identificar las reglas actuales.
6. Identificar problemas actuales.
7. Identificar información faltante.

### Fase 2 — Inteligencia básica

Implementar:

* Inventario.
* Consumo histórico.
* Cobertura.
* Rotación.
* Alertas de faltante.
* Sobreinventario.
* Pedido recomendado.

### Fase 3 — Inteligencia avanzada

Agregar:

* Pronóstico.
* Tendencias.
* Anomalías.
* Proveedores.
* Tiempo de entrega.
* Ocupación.
* Estacionalidad.
* Simulaciones.

### Fase 4 — Centro de decisiones

Crear una pantalla ejecutiva donde el sistema presente:

> **Qué está pasando + por qué está pasando + qué recomienda hacer.**

---

# 27. Visión final

La finalidad del proyecto no es construir simplemente un sistema que diga cuánto inventario hay.

La visión es crear una:

> **Plataforma de Inteligencia de Abastecimiento Hotelero**

que permita pasar de una operación reactiva:

```text
Se acaba el producto
        ↓
Nos damos cuenta
        ↓
Hacemos el pedido
        ↓
Esperamos al proveedor
```

a una operación preventiva:

```text
Analizamos consumo
        ↓
Pronosticamos necesidad
        ↓
Detectamos riesgo
        ↓
Calculamos pedido óptimo
        ↓
Consideramos tiempo de entrega
        ↓
Recomendamos compra
        ↓
Evitamos faltante y sobreinventario
```

El objetivo final es que **Almacén no solamente tenga información sobre lo que tiene**, sino que pueda saber **qué debería hacer con esa información**.

---

# 28. Nombre conceptual del proyecto

### Nombre recomendado

**Plataforma de Inteligencia de Abastecimiento Hotelero**

### Descripción corta

> Plataforma complementaria al sistema empresarial del hotel que analiza inventarios, consumos, pedidos y variables operativas para recomendar qué comprar, cuánto comprar y cuándo hacerlo, reduciendo faltantes y exceso de inventario y apoyando la toma de decisiones de Almacén, Compras y Contraloría.

### Propósito

> **Convertir los datos del almacén en decisiones inteligentes de abastecimiento.**

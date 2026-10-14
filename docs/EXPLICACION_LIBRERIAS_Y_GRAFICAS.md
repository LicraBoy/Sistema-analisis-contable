# Explicación del sistema: librerías, funcionamiento y gráficas

Guía en lenguaje simple de qué librerías usa el proyecto, cómo se conectan al código y cómo están hechas las gráficas.

---

## 1. Panorama general

El sistema tiene dos partes que hablan entre sí por HTTP (peticiones web tipo `fetch`):

```
Navegador (Frontend: React)  <---- JSON por HTTP ---->  Servidor (Backend: FastAPI)
                                                              |
                                                         Base de datos (SQLite/Postgres)
```

- **Backend** (`backend/`): recibe archivos Excel, los procesa con Python, guarda/lee de la base de datos, y expone "endpoints" (URLs como `/pagos`, `/ingresos`) que el frontend consume.
- **Frontend** (`frontend/`): la página web que ve el usuario. Pide datos al backend, los muestra en tablas/tarjetas/gráficas, y permite subir archivos.

---

## 2. Backend — librerías y para qué sirve cada una

| Librería | Para qué se usa | Dónde se nota en el código |
|---|---|---|
| **FastAPI** | Framework web: define las URLs (`/pagos`, `/ingresos`, etc.) y qué hace cada una | `app/api/*.py`, cada archivo es un grupo de rutas ("router") |
| **SQLAlchemy (async)** | ORM: permite escribir clases de Python (`Pago`, `CfdiIngreso`) en vez de SQL a mano | `app/models/*.py` (las tablas), `app/db/session.py` (la conexión) |
| **Alembic** | Lleva el historial de cambios a la base de datos ("migraciones") | `backend/alembic/versions/` |
| **Pydantic** | Valida datos de entrada/salida (que un número sea número, que una fecha sea fecha) | `app/schemas/*.py` y los parámetros de las rutas |
| **Pandas** | Lee y transforma los Excel (filtros, cálculos, agrupaciones) | `app/services/excel_processor.py`, `cfdi_analysis.py`, etc. |
| **openpyxl / xlrd** | Leer/escribir archivos `.xlsx`/`.xls` reales (colores, fórmulas, celdas) | mismo lugar que Pandas, para generar los reportes descargables |
| **Celery + Redis** | Cola de tareas en segundo plano | `app/tasks/` — en este proyecto está configurada en modo "instantáneo" (`task_always_eager=True`), o sea que en la práctica **no** corre en segundo plano de verdad; el procesamiento pesado ocurre directo dentro de la petición |
| **python-jose / passlib** | Login con JWT (tokens) y hash de contraseñas | `app/core/security.py` — hoy está simplificado/deshabilitado para desarrollo |

### Cómo se conecta una petición típica (backend)

1. El navegador llama, por ejemplo, `GET /pagos`.
2. FastAPI busca esa ruta en `app/api/pagos.py`.
3. La función de esa ruta usa SQLAlchemy para leer la tabla `Pago` (`app/models/pago.py`).
4. Pydantic (`app/schemas/pago.py`) da forma a la respuesta antes de convertirla en JSON.
5. FastAPI regresa ese JSON al navegador.

---

## 3. Frontend — librerías y para qué sirve cada una

| Librería | Para qué se usa | Dónde se nota en el código |
|---|---|---|
| **React** | Construye la interfaz como "componentes" (piezas reutilizables) | todo `frontend/src` |
| **TypeScript** | JavaScript con tipos, para detectar errores antes de ejecutar | archivos `.ts`/`.tsx` |
| **Vite** | Levanta el servidor de desarrollo y arma el build final | `npm run dev`, `npm run build` |
| **React Router** | Cambia de "página" sin recargar el navegador (`/pagos`, `/facturacion`, etc.) | `App.tsx` |
| **Mantine** (`@mantine/core`, `/dates`, `/dropzone`, `/hooks`, `/notifications`) | Todos los componentes visuales: botones, tablas, modales, selector de fecha, zona para arrastrar archivos, notificaciones | prácticamente todas las páginas y `theme/index.ts` |
| **@tanstack/react-query** | Pide datos al backend, los guarda en caché y los refresca automáticamente | `api/hooks.ts` (todas las peticiones pasan por aquí) |
| **axios** | Hace la petición HTTP real (el "mensajero" hacia el backend) | `api/client.ts` |
| **recharts** | **Las gráficas** (barras, líneas) | `pages/DashboardPage.tsx`, `PagosRecepcionPage.tsx`, `FacturacionPage.tsx` |
| **@tabler/icons-react** | Iconos (ej. reloj, check, gráfica) | en botones, tarjetas, menú lateral |
| **dayjs** | Manejo de fechas (formatear, comparar) | filtros de fecha, calendarios |

### Cómo se conecta una petición típica (frontend)

1. Un componente de página (ej. `PagosPage.tsx`) llama a un hook, ej. `usePagos()`.
2. Ese hook vive en `api/hooks.ts` y usa **React Query** + **axios** para pedir `GET /pagos` al backend.
3. React Query guarda la respuesta en caché y se la entrega al componente.
4. El componente dibuja esos datos con componentes de **Mantine** (tablas, tarjetas, badges).

```
Página (PagosPage.tsx)
   └─ usa hook usePagos() ──┐
                             ▼
                   api/hooks.ts (React Query)
                             │
                             ▼
                    api/client.ts (axios) ──HTTP──► Backend FastAPI
                             │
                             ▼
                   datos en caché → se muestran con Mantine
```

---

## 4. Cómo están hechas las gráficas (recharts)

Las gráficas usan la librería **recharts**, que dibuja SVG (no imágenes) a partir de un arreglo de datos tipo:

```ts
const ingresosVsPagos = [
  { mes: 'Ene', ingresos: 120000, pagos: 95000 },
  { mes: 'Feb', ingresos: 130000, pagos: 110000 },
  // ...
];
```

Ejemplo real simplificado (`DashboardPage.tsx`):

```tsx
<ResponsiveContainer width="100%" height={280}>
  <BarChart data={ingresosVsPagos}>
    <CartesianGrid stroke="var(--mantine-color-default-border)" />
    <XAxis dataKey="mes" />
    <YAxis tickFormatter={(v) => `${v / 1000}k`} />
    <Tooltip formatter={(v) => currency(Number(v))} />
    <Legend />
    <Bar dataKey="ingresos" name="Ingresos" fill="..." />
    <Bar dataKey="pagos" name="Pagos" fill="..." />
  </BarChart>
</ResponsiveContainer>
```

Explicación pieza por pieza:

- **`ResponsiveContainer`**: hace que la gráfica se ajuste al ancho de la pantalla/tarjeta.
- **`BarChart` / `LineChart`**: el tipo de gráfica (barras o líneas). El proyecto usa ambas según la vista.
- **`data={...}`**: el arreglo de objetos que se va a graficar — normalmente viene de una petición al backend (ej. `/facturacion/tablas-forma-pago/analitica`), no está escrito a mano.
- **`XAxis` / `YAxis`**: qué campo del objeto va en cada eje (`dataKey="mes"`).
- **`Bar` / `Line`**: una barra o línea por cada serie de datos (ej. una barra para "ingresos" y otra para "pagos").
- **`Tooltip`**: el texto que aparece al pasar el mouse sobre una barra.
- **Colores**: en vez de poner colores fijos, se usan variables del tema de Mantine (`var(--mantine-color-...)`) para que combinen igual en modo claro y oscuro.

### ¿De dónde salen los datos de las gráficas?

1. El backend calcula totales/agrupaciones (por mes, por punto de venta, etc.) en endpoints como `GET /facturacion/tablas-forma-pago/analitica` o `GET /pagos-recepcion/analitica`.
2. El frontend pide esos datos con un hook de React Query (ej. `useAnaliticaTablasFormaPago()`).
3. Ese resultado se transforma un poco en el componente (a veces con `useMemo`) para que quede en el formato `[{ mes, valor1, valor2 }, ...]` que recharts necesita.
4. Se pasa ese arreglo directo a `<BarChart data={...}>`.

Dónde están las gráficas en el proyecto:

- `pages/DashboardPage.tsx` — gráfica de barras "Ingresos vs. Pagos".
- `pages/PagosRecepcionPage.tsx` — panel de analítica del módulo de recepción.
- `pages/FacturacionPage.tsx` — pestaña "Análisis": barras de ventas por punto de venta, línea de tendencia diaria, comparativo PUE vs. PPD, totales por mes.

---

## 5. Resumen ultra corto

- **Backend = Python**: FastAPI (rutas) + SQLAlchemy (base de datos) + Pandas/openpyxl (Excel).
- **Frontend = React**: Mantine (visual) + React Query/axios (traer datos) + recharts (gráficas).
- **Las gráficas no tienen datos "quemados"**: siempre llegan del backend vía un hook de React Query y se pasan tal cual a un componente de recharts (`BarChart`, `LineChart`) dentro de un `ResponsiveContainer`.

# Sistema de Análisis Contable

Sistema web para el Departamento de Contabilidad que automatiza el análisis de CFDI,
pagos e ingresos recibidos. Migración de un script de consola en Python a una
aplicación web completa.

## Stack Tecnológico

| Capa           | Tecnología                                      |
| -------------- | ----------------------------------------------- |
| **Backend**    | Python 3.12, FastAPI, SQLAlchemy 2.0 (async)    |
| **Frontend**   | React 18, Vite, TypeScript, Mantine v7          |
| **BD**         | PostgreSQL 16                                   |
| **Cola**       | Celery + Redis                                  |
| **Migraciones**| Alembic                                         |
| **Infra**      | Docker + Docker Compose                         |

## Requisitos Previos

- [Docker](https://docs.docker.com/get-docker/) y Docker Compose v2+
- (Opcional para desarrollo local) Python 3.12, Node.js 20+

## Levantar el proyecto (primera vez)

### Método Rápido (Windows sin Docker - RECOMENDADO)

Si no tienes Docker instalado, puedes iniciar toda la aplicación localmente de forma muy sencilla:

1. Asegúrate de configurar tus variables de entorno si no lo has hecho:
   ```powershell
   copy .env.example .env
   ```
2. Haz doble clic en el archivo `iniciar_servidores.bat` que se encuentra en la raíz de este proyecto (o ejecútalo desde la consola).
3. Esto levantará automáticamente tanto el Backend (FastAPI) como el Frontend (React) en ventanas separadas y abrirá la aplicación en tu navegador web.

---

### Método con Docker


### 1. Clonar y configurar variables de entorno

```bash
git clone <repo-url>
cd sistema-analisis-contable
cp .env.example .env
```

> Edita `.env` si necesitas cambiar contraseñas o puertos.

### 2. Levantar todos los servicios

```bash
docker compose up --build
```

Esto levanta:

| Servicio         | Puerto  | Descripción                   |
| ---------------- | ------- | ----------------------------- |
| `backend`        | 8000    | API FastAPI                   |
| `frontend`       | 5173    | App React (Vite dev server)   |
| `postgres`       | 5432    | Base de datos PostgreSQL      |
| `redis`          | 6379    | Broker para Celery            |
| `celery-worker`  | —       | Worker de tareas en segundo plano |

### 3. Ejecutar migraciones de base de datos

```bash
docker compose exec backend alembic upgrade head
```

### 4. Verificar que todo funciona

- **Backend**: http://localhost:8000/health
- **API Docs**: http://localhost:8000/docs
- **Frontend**: http://localhost:5173

## Desarrollo Local (sin Docker)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000 --reload-dir app
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Worker de Celery

```bash
cd backend
celery -A app.tasks.celery_app worker --loglevel=info
```

## Estructura del Proyecto

```
sistema-analisis-contable/
├── backend/
│   ├── app/
│   │   ├── api/              # Routers de FastAPI
│   │   ├── core/             # Config, seguridad, settings
│   │   ├── models/           # Modelos SQLAlchemy
│   │   ├── schemas/          # Schemas Pydantic v2
│   │   ├── services/         # Lógica de negocio
│   │   ├── tasks/            # Tareas de Celery
│   │   ├── db/               # Conexión y sesión de BD
│   │   └── main.py
│   ├── alembic/              # Migraciones
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/       # Componentes reutilizables
│   │   ├── pages/            # Páginas de la aplicación
│   │   ├── api/              # Cliente HTTP y hooks React Query
│   │   ├── types/            # Interfaces TypeScript
│   │   └── App.tsx
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

## Endpoints de la API

| Método | Ruta                  | Descripción                              |
| ------ | --------------------- | ---------------------------------------- |
| GET    | `/health`             | Healthcheck                              |
| POST   | `/auth/login`         | Autenticación JWT                        |
| POST   | `/ingresos/upload`    | Subir Excel de Ingresos Recibidos        |
| POST   | `/pagos/upload`       | Subir Excel de Pagos (dispara Celery)    |
| GET    | `/pagos/{id}/status`  | Estado del procesamiento                 |
| GET    | `/pagos`              | Listar pagos con filtros                 |
| GET    | `/pagos/export`       | Exportar resultados a Excel              |

## Licencia

Uso interno — Departamento de Contabilidad.

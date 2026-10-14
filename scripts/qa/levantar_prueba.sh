#!/bin/bash
# Entorno de PRUEBAS aislado: copia de la BD real, backend en 8011 con login activo, Vite en 5180.
ESC="$(cd "$(dirname "$0")" && pwd)/tmp"; mkdir -p "$ESC"
cd "$(dirname "$0")/../.."
cp backups/local_db_*.sqlite3 "$ESC/bd_e2e.sqlite3" 2>/dev/null || cp backend/local_db.sqlite3 "$ESC/bd_e2e.sqlite3"
cd backend
export PYTHONPATH=. DATABASE_URL="sqlite+aiosqlite:///$ESC/bd_e2e.sqlite3" AUTH_ENABLED=true
# usuarios de prueba (contraseña conocida) en la COPIA
cat > "$ESC/sembrar_e2e.py" <<'EOF'
import asyncio
from sqlalchemy import select
from app.core.security import hash_password
from app.db.session import async_session_factory
from app.models.usuario import Rol, Usuario
from app.services.seguridad import sembrar_roles
PASS = "Prueba-QA-2026"
async def main():
    async with async_session_factory() as s:
        await sembrar_roles(s)
        for rol in (await s.execute(select(Rol))).scalars():
            email = f"qa_{rol.clave}"
            u = (await s.execute(select(Usuario).where(Usuario.email == email))).scalar_one_or_none()
            if u is None:
                s.add(Usuario(email=email, nombre=f"QA {rol.nombre}", rol_id=rol.id, hashed_password=hash_password(PASS), must_change_password=False))
            else:
                u.hashed_password = hash_password(PASS); u.must_change_password = False; u.failed_attempts = 0; u.locked_until = None; u.is_active = True
        await s.commit()
asyncio.run(main())
print("usuarios QA listos")
EOF
timeout 120 .venv/Scripts/python.exe "$ESC/sembrar_e2e.py"
nohup .venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8011 > "$ESC/e2e_backend.log" 2>&1 &
cd ../frontend
VITE_PORT=5180 VITE_PROXY_TARGET=http://127.0.0.1:8011 nohup npm run dev > "$ESC/e2e_front.log" 2>&1 &
for i in $(seq 1 40); do
  b=$(curl -s -m 2 http://127.0.0.1:8011/health); f=$(curl -s -m 2 -o /dev/null -w "%{http_code}" http://127.0.0.1:5180/)
  [ -n "$b" ] && [ "$f" = "200" ] && { echo "LISTO backend=$b front=$f"; exit 0; }
  sleep 3
done
echo "NO LEVANTÓ"; tail -5 "$ESC/e2e_backend.log" "$ESC/e2e_front.log"

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // VITE_PORT / VITE_PROXY_TARGET solo se usan para levantar un entorno de PRUEBAS aparte (QA) sin tocar el real.
    port: Number(process.env.VITE_PORT ?? 5173),
    host: true,
    proxy: {
      '/api': {
        // 127.0.0.1 y no "localhost": en Windows "localhost" intenta primero IPv6 (::1) y cada petición perdía ~210 ms;
        // el backend escucha en 127.0.0.1 (ver iniciar_servidores.bat)
        target: process.env.VITE_PROXY_TARGET ?? 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});

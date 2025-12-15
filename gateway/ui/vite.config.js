import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/tools': 'http://localhost:3333',
      '/gemini/v1/execute': 'http://localhost:3333',
      '/servers': 'http://localhost:3333',
      '/servers/test': 'http://localhost:3333',
      '/rag/upload': 'http://localhost:3333',
      '/rag/uploads': 'http://localhost:3333',
      '/rag/uploads/delete': 'http://localhost:3333',
      '/rag/saved': 'http://localhost:3333',
      '/rag/indexes': 'http://localhost:3333',
    },
  },
});

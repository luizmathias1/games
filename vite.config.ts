import { defineConfig } from 'vite';

// O cliente fica em /client; o build vai para /dist (servido pelo Node na produção).
export default defineConfig({
  root: 'client',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // Permite importar arquivos de /shared, que ficam fora da raiz do Vite
    fs: { allow: ['..'] },
    // Em desenvolvimento, o WebSocket e o /health vão para o servidor Node
    proxy: {
      '/ws': { target: 'ws://localhost:3000', ws: true },
      '/health': 'http://localhost:3000',
    },
  },
});

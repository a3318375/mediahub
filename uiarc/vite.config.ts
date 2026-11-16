import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => ({
  base: './',
  define: { 'import.meta.env.STATIC_DEMO': mode === 'demo' },
  plugins: [viteSingleFile()],
  resolve: { dedupe: ['react', 'react-dom'] },
  build: { target: 'esnext', outDir: mode === 'demo' ? 'dist-demo' : 'dist' },
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:18080', changeOrigin: true },
    },
  },
}));

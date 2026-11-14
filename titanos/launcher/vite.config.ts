import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  build: {
    target: 'es2019',
    assetsInlineLimit: 8192,
  },
  server: { port: 5173, host: true },
});

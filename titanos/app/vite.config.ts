import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import adapterNode from '@sveltejs/adapter-node';

/* One app on the Pi: adapter-node serves the SPA + all /api routes.
   Kit 3: adapter config goes through the sveltekit() plugin. */
export default defineConfig({
  plugins: [sveltekit({
    adapter: adapterNode(),
    alias: { '$lib': 'src/lib' }, // kit 3 renamed $lib → #lib; keep $lib for the existing code
  })],
  build: {
    target: 'es2019',
    assetsInlineLimit: 8192,
  },
  server: { port: 5173, host: true },
});

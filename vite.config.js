import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Multi-page build: without this, `vite build` only emits index.html and the
// case study would 404 in production.
export default defineConfig({
    appType: 'mpa',
    build: {
        rollupOptions: {
            input: {
                main: resolve(import.meta.dirname, 'index.html'),
                timer: resolve(import.meta.dirname, 'timer.html')
            }
        }
    }
});

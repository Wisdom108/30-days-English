import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// base: './' keeps asset paths relative so the built app works whether it is
// served from a domain root, a sub-path (e.g. GitHub Pages), or previewed locally.
export default defineConfig({
    plugins: [react()],
    base: './',
});

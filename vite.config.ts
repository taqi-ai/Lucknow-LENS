import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    // Pre-bundle the animation libraries up front. Discovering them mid-session made Vite
    // re-optimise and serve two copies of React (hooks crashed with 'reading useRef').
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-dom/client', 'motion/react', 'gsap', 'gsap/ScrollTrigger', 'gsap/SplitText', '@gsap/react', '@hugeicons/react', '@hugeicons/core-free-icons', 'lenis'],
    },
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            three: ['three'],
            react: ['react', 'react-dom'],
          },
        },
      },
    },
  };
});

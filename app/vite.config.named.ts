import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../dist-named',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/index.js',
        assetFileNames: (info) => {
          if (info.name?.endsWith('.css')) return 'assets/index.css'
          return 'assets/[name][extname]'
        },
      },
    },
  },
})

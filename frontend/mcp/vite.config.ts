import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: [
      { find: /^react$/, replacement: path.resolve(__dirname, 'src/lib/reactDefault.ts') },
    ],
  },
  build: {
    // Mantine bundle expects React default export in some paths (React.default.useId).
    // Ensure CJS interop provides a default export for React to avoid runtime crashes.
    commonjsOptions: {
      defaultIsModuleExports: true,
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})

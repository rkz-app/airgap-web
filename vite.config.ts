import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig(({ command }) => {
  // `vite dev` / `vite preview` → serve the demo app normally
  if (command === 'serve') return {
    server: {
      allowedHosts: true,
      hmr: { timeout: 60000 },
    },
  }

  // `vite build` → emit library bundle
  return {
    build: {
      lib: {
        entry: resolve(__dirname, 'src/index.ts'),
        formats: ['es'],
        fileName: 'index',
      },
      rollupOptions: {
        // `airgap` ships a WASM binary — keep it external so consumers
        // can let their own bundler handle the .wasm asset correctly.
        external: ['airgap'],
      },
    },
  }
})

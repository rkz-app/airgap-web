import { defineConfig } from 'vite'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import dts from 'vite-plugin-dts'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ command }) => {
  // `vite dev` / `vite preview` → serve the demo app normally
  if (command === 'serve') return {
    server: {
      allowedHosts: true,
      hmr: { timeout: 60000 },
    },
  }

  // `vite build` → emit library bundle + declarations
  return {
    plugins: [
      dts({ include: ['src/index.ts', 'src/wasm.ts', 'src/player.ts', 'src/scanner.ts', 'src/modal.ts', 'src/detector'], outDirs: ['dist'] }),
    ],
    build: {
      copyPublicDir: false,
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

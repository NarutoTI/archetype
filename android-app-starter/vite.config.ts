/// <reference types="vitest" />

import legacy from '@vitejs/plugin-legacy'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import { visualizer } from 'rollup-plugin-visualizer'

const OTA_BUILD_METADATA_FILE = 'ota-build-metadata.json'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const loadedEnv = loadEnv(mode, __dirname, '')
  const resolveEnv = (key: string): string => process.env[key] ?? loadedEnv[key] ?? ''
  const otaBuildMetadata = {
    schemaVersion: 1,
    mode,
    otaEnabled: resolveEnv('VITE_OTA_ENABLED') === 'true',
    otaChannel: resolveEnv('VITE_OTA_CHANNEL') || 'production',
    otaRequireSigned: resolveEnv('VITE_OTA_REQUIRE_SIGNED') === 'true',
  }

  return {

  base: './',
  server: {
    host: '0.0.0.0',
    port: 8101,
    strictPort: true,
  },

  plugins: [
    vue(),
    legacy(),
    {
      name: 'ota-build-metadata',
      apply: 'build',
      generateBundle() {
        // Viaja junto do www para o --no-build validar o ambiente realmente assado.
        this.emitFile({
          type: 'asset',
          fileName: OTA_BUILD_METADATA_FILE,
          source: `${JSON.stringify(otaBuildMetadata, null, 2)}\n`,
        })
      },
    },
    visualizer({
      filename: 'www/bundle-analyzer.html',
      open: false,
      gzipSize: true
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts']
  },
  build: {
    outDir: 'www',
    rollupOptions: {
      output: {
        // Vite 8 / Rolldown: prefer codeSplitting.groups over deprecated manualChunks.
        strictExecutionOrder: true,
        codeSplitting: {
          groups: [
            {
              name: 'vue-vendor',
              test: /\/node_modules\/(vue|vue-router|pinia)(\/|$)|\/node_modules\/@vue\//,
            },
            { name: 'ionic-core', test: /\/node_modules\/@ionic\/vue\// },
            { name: 'ionic-icons', test: /\/node_modules\/ionicons\// },
            {
              name: 'capacitor-vendor',
              test: /\/node_modules\/@capacitor\/(core|app|browser)\//,
            },
            {
              name: 'app-utils',
              test: /\/src\/services\/(toast|notification)\.service|\/src\/utils\/(date\.utils|logger)/,
            },
          ],
        },
      },
    },
    chunkSizeWarningLimit: 1000
  }

  }
})

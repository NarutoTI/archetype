/// <reference types="vitest" />

import legacy from '@vitejs/plugin-legacy'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { defineConfig } from 'vite'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vitejs.dev/config/
export default defineConfig({

  base: './',
  server: {
    host: '0.0.0.0',
    port: 8101,
    strictPort: true,
  },

  plugins: [
    vue(),
    legacy(),
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

})

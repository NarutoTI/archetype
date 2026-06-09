/// <reference types="vitest" />

import legacy from '@vitejs/plugin-legacy'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { defineConfig } from 'vite'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vitejs.dev/config/
export default defineConfig({

  base: './',

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
        manualChunks: {
          // Core Vue and routing
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
          
          // Ionic core
          'ionic-core': ['@ionic/vue'],
          
          // Ionic icons
          'ionic-icons': ['ionicons/icons'],
          
          // Capacitor plugins
          'capacitor-vendor': ['@capacitor/core', '@capacitor/app', '@capacitor/browser'],
          
          // Utilities and services
          'app-utils': [
            './src/services/toast.service.ts',
            './src/services/notification.service.ts',
            './src/utils/date.utils.ts',
            './src/utils/logger.ts'
          ]
        }
      }
    },
    chunkSizeWarningLimit: 1000
  }
  
})

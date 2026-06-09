<template>
  <ion-app>
    <ion-router-outlet animated="false" />
  </ion-app>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { IonApp, IonRouterOutlet } from '@ionic/vue';
import { Capacitor } from '@capacitor/core';
import { logger } from './utils/logger';

onMounted(async () => {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { StatusBar } = await import('@capacitor/status-bar');
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.show();
  } catch (error) {
    logger.error('Error setting status bar:', error);
  }
});
</script>

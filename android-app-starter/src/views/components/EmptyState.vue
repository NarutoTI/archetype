<template>
  <div class="empty-state">
    <ion-icon v-if="icon" :icon="icon" class="empty-state-icon" />
    <p class="empty-state-title">{{ title }}</p>
    <p v-if="subtitle" class="empty-state-subtitle">{{ subtitle }}</p>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { IonIcon } from '@ionic/vue';

defineProps<{
  title: string;
  subtitle?: string;
  icon?: string;
}>();
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  padding: 24px 16px;
  color: var(--ion-color-medium);
}

.empty-state-icon {
  font-size: 42px;
  opacity: 0.6;
}

.empty-state-title {
  margin: 0;
  font-weight: 500;
}

.empty-state-subtitle {
  margin: 0;
  font-size: 0.85rem;
}
</style>

<template>
  <ion-page>
    <ion-tabs>
      <ion-router-outlet animated="false" />

      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="tasks" href="/tabs/tasks">
          <ion-icon :icon="checkboxOutline" />
          <ion-label>{{ $t('tasks.title') }}</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="media" href="/tabs/media">
          <ion-icon :icon="imagesOutline" />
          <ion-label>{{ $t('media.title') }}</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="notifications" href="/tabs/notifications">
          <ion-icon :icon="notificationsOutline" />
          <ion-label>{{ $t('notifications.title') }}</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="menu" href="/tabs/menu">
          <ion-icon :icon="menuOutline" />
          <ion-label>{{ $t('common.menu') }}</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonIcon,
  IonLabel,
  IonPage,
  IonRouterOutlet,
  IonTabBar,
  IonTabButton,
  IonTabs,
} from '@ionic/vue';
import { checkboxOutline, imagesOutline, menuOutline, notificationsOutline } from 'ionicons/icons';
</script>

<style scoped>
ion-tab-bar {
  --background: var(--ion-color-primary);
  --color: rgba(var(--ion-color-primary-contrast-rgb), 0.7);
  --color-selected: var(--ion-color-primary-contrast);
}
</style>

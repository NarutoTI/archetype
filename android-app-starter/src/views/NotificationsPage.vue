<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ $t('notifications.title') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <!-- `scroll-events` + `scrolls-under-bar`: ver TasksPage e docs/APP-CHROME-LAYOUT.md. -->
    <ion-content class="ion-padding scrolls-under-bar" :scroll-events="true">
      <ion-list inset>
        <ion-item button @click="scheduleTest">
          <ion-icon :icon="alarmOutline" slot="start" color="primary" />
          <ion-label>{{ $t('notifications.scheduleTest') }}</ion-label>
        </ion-item>
        <ion-item button @click="clearAll">
          <ion-icon :icon="trashOutline" slot="start" color="danger" />
          <ion-label>{{ $t('notifications.clearAll') }}</ion-label>
        </ion-item>
      </ion-list>

      <ion-list v-if="pending.length" inset>
        <ion-item v-for="notification in pending" :key="notification.id">
          <ion-label>
            <h2>{{ notification.title }}</h2>
            <p>{{ notification.body }}</p>
          </ion-label>
          <ion-note slot="end">#{{ notification.id }}</ion-note>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';
import { alarmOutline, trashOutline } from 'ionicons/icons';
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { localNotificationService } from '@/services/localNotification.service';
import { useLocalNotificationStore } from '@/stores/localNotificationStore';
import { toastService } from '@/services/toast.service';

const { t } = useI18n();
// A bandeja do aparelho mora na store: a página só lê e dispara ações.
const localNotificationStore = useLocalNotificationStore();
const pending = computed(() => localNotificationStore.pending);

const refresh = () => localNotificationStore.loadPending();

const scheduleTest = async () => {
  const ok = await localNotificationService.testNotification();
  if (ok) await toastService.presentToastSuccess(t('notifications.scheduled'));
  await refresh();
};

const clearAll = async () => {
  await localNotificationStore.cancelAll();
};

onMounted(refresh);
</script>

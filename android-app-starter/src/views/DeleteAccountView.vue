<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ $t('account.deleteTitle') }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <p>{{ $t('account.deleteDescription') }}</p>
      <ion-button expand="block" color="danger" :disabled="loading" @click="requestDeletion">
        <ion-spinner v-if="loading" name="dots" />
        <span v-else>{{ $t('account.deleteButton') }}</span>
      </ion-button>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonButton, IonContent, IonHeader, IonPage, IonSpinner, IonTitle, IonToolbar } from '@ionic/vue';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { authService } from '@/services/auth.service';
import { toastService } from '@/services/toast.service';

const { t } = useI18n();
const loading = ref(false);

const requestDeletion = async () => {
  loading.value = true;
  try {
    const result = await authService.requestAccountDeletion();
    if (result.success) {
      await toastService.presentToastSuccess(result.message || t('account.deleteRequested'));
    } else {
      await toastService.presentToastError(result.message || t('account.deleteAccountError'));
    }
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ $t('auth.resetPassword') }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-list inset>
        <ion-item>
          <ion-input
            v-model="password"
            type="password"
            :label="$t('auth.password')"
            label-placement="stacked"
          />
        </ion-item>
      </ion-list>
      <ion-button expand="block" :disabled="password.length < 6 || loading" @click="resetPassword">
        <ion-spinner v-if="loading" name="dots" />
        <span v-else>{{ $t('common.save') }}</span>
      </ion-button>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonList,
  IonPage,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { authService } from '@/services/auth.service';
import { toastService } from '@/services/toast.service';

const route = useRoute();
const router = useRouter();
const password = ref('');
const loading = ref(false);

const resetPassword = async () => {
  const token = route.query.token as string | undefined;
  if (!token) return;

  loading.value = true;
  try {
    const result = await authService.resetPassword(token, password.value);
    if (result.success) {
      await toastService.presentToastSuccess(result.message);
      await router.replace('/login');
    } else {
      await toastService.presentToastError(result.message);
    }
  } finally {
    loading.value = false;
  }
};
</script>

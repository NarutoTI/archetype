<template>
  <ion-page>
    <ion-content class="ion-padding">
      <div class="callback-container">
        <ion-card>
          <ion-card-content class="ion-text-center">
            <ion-spinner v-if="isProcessing" name="dots" />
            <ion-icon v-else-if="hasError" :icon="alertCircle" color="danger" size="large" />
            <ion-icon v-else :icon="checkmarkCircle" color="success" size="large" />
            <h2>{{ statusMessage }}</h2>
            <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
          </ion-card-content>
        </ion-card>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { IonCard, IonCardContent, IonContent, IonIcon, IonPage, IonSpinner } from '@ionic/vue';
import { alertCircle, checkmarkCircle } from 'ionicons/icons';
import { useI18n } from 'vue-i18n';
import { AUTH_ACTIONS, authService } from '@/services/auth.service';
import { shareEntry } from '@/services/shareEntry';
import { toastService } from '@/services/toast.service';
import { logger } from '@/utils/logger';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const isProcessing = ref(true);
const hasError = ref(false);
const errorMessage = ref('');
const isSuccess = ref(false);

const statusMessage = computed(() => {
  if (isProcessing.value) return t('auth.processing');
  if (hasError.value) return t('auth.callbackError');
  if (isSuccess.value) return t('auth.loginSuccess');
  return t('auth.processing');
});

const navigateAfterSuccess = async (delay = 800) => {
  setTimeout(async () => {
    const dispatched = await shareEntry.dispatchIfPending('post-oauth');
    if (!dispatched) await router.replace('/tabs/tasks');
  }, delay);
};

onMounted(async () => {
  try {
    const token = route.query.token as string | undefined;
    const error = route.query.error as string | undefined;
    if (error) throw new Error(`OAuth error: ${error}`);
    if (!token) throw new Error('Invalid callback - missing token');

    const result = await authService.handleOAuthCallback(token);
    if (!result.success) throw new Error(result.message || 'Callback failed');

    if (result.action === AUTH_ACTIONS.PASSWORD_RESET_READY) {
      isProcessing.value = false;
      await router.replace(`/reset-password?token=${token}`);
      return;
    }

    if (result.action === AUTH_ACTIONS.ACCOUNT_DELETED) {
      isProcessing.value = false;
      isSuccess.value = true;
      await toastService.presentToastSuccess(t('account.deletionSuccessMessage'));
      setTimeout(() => router.replace('/login'), 1200);
      return;
    }

    isProcessing.value = false;
    isSuccess.value = true;
    await toastService.presentToastSuccess(result.message || t('auth.loginSuccess'));
    await navigateAfterSuccess();
  } catch (error: any) {
    if (error.message === 'TOKEN_ALREADY_PROCESSED') {
      isProcessing.value = false;
      isSuccess.value = true;
      await navigateAfterSuccess(300);
      return;
    }

    logger.error('Callback error:', error);
    isProcessing.value = false;
    hasError.value = true;
    errorMessage.value = error.message || 'Unknown error';
    await toastService.presentToastError(t('auth.callbackFailed'));
    setTimeout(() => router.replace('/login'), 2500);
  }
});
</script>

<style scoped>
.callback-container {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

ion-card {
  width: 100%;
  max-width: 420px;
}

.error-message {
  color: var(--ion-color-danger);
}
</style>

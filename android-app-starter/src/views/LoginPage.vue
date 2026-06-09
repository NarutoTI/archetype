<template>
  <ion-page>
    <ion-content class="ion-padding">
      <div class="login-container">
        <ion-card>
          <ion-card-header>
            <ion-card-title class="ion-text-center">{{ $t('app.name') }}</ion-card-title>
            <ion-card-subtitle class="ion-text-center">{{ $t('auth.loginTitle') }}</ion-card-subtitle>
          </ion-card-header>

          <ion-card-content>
            <EmailAuthForm
              @login-success="handleLoginSuccess"
              @registration-success="handleRegistrationSuccess"
            />

            <div class="divider">
              <span>{{ $t('auth.or') }}</span>
            </div>

            <ion-button expand="block" class="google-button" @click="signInWithGoogle">
              <ion-icon :icon="logoGoogle" slot="start" />
              {{ $t('auth.loginWithGoogle') }}
            </ion-button>
          </ion-card-content>
        </ion-card>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonIcon,
  IonPage,
} from '@ionic/vue';
import { logoGoogle } from 'ionicons/icons';
import { onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import EmailAuthForm from '@/views/components/EmailAuthForm.vue';
import { alertService } from '@/services/alert.service';
import { authService } from '@/services/auth.service';
import { biometricService } from '@/services/biometric.service';
import { shareEntry } from '@/services/shareEntry';
import { toastService } from '@/services/toast.service';
import { useSettingsStore } from '@/stores/settingsStore';
import { logger } from '@/utils/logger';

const router = useRouter();
const { t } = useI18n();
const settingsStore = useSettingsStore();

const promptBiometricSetup = async () => {
  if (!(await biometricService.isAvailable()) || settingsStore.biometryEnabled) return;

  await alertService.presentCustomAlert({
    header: t('biometric.enableTitle'),
    message: t('biometric.enableMessage'),
    buttons: [
      {
        text: t('biometric.notNowButton'),
        role: 'cancel',
      },
      {
        text: t('biometric.enableButton'),
        role: 'confirm',
        handler: async () => {
          await settingsStore.setBiometryEnabled(true);
          await toastService.presentToastSuccess(t('biometric.enabled'));
        },
      },
    ],
  });
};

const goAfterLogin = async () => {
  await promptBiometricSetup();
  const dispatched = await shareEntry.dispatchIfPending('post-login');
  if (!dispatched) {
    await router.push('/tabs/tasks');
  }
};

const handleLoginSuccess = async () => {
  await toastService.presentToastSuccess(t('auth.loginSuccess'));
  await goAfterLogin();
};

const handleRegistrationSuccess = async (message: string) => {
  await toastService.presentToastSuccess(message);
};

const signInWithGoogle = async () => {
  try {
    await authService.signInWithGoogle();
    await goAfterLogin();
  } catch (error: any) {
    if (error.message === 'REDIRECT_PENDING') {
      await toastService.presentToastSuccess(t('auth.redirectingToProvider'));
      return;
    }
    logger.error('Google login error:', error);
    await toastService.presentToastError(`${t('auth.loginFailed')} ${error.message || ''}`);
  }
};

onMounted(() => {
  authService.onLoginGoogleSuccess(goAfterLogin);
});

onUnmounted(() => {
  authService.removeLoginGoogleSuccessCallback(goAfterLogin);
});
</script>

<style scoped>
.login-container {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

ion-card {
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
}

ion-card-title {
  color: var(--ion-color-primary);
}

.google-button {
  --background: #4285f4;
  --background-hover: #357abd;
  --background-activated: #357abd;
  --color: var(--ion-color-primary-contrast);
}

.divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 22px 0;
  color: var(--ion-color-medium);
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--ion-color-light-shade);
}
</style>

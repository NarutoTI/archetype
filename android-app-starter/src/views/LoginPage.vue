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

            <ion-button
              expand="block"
              class="google-button"
              :disabled="connectingGoogle"
              @click="signInWithGoogle"
            >
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
import { onMounted, onUnmounted, ref } from 'vue';
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
// Segura o duplo toque enquanto o seletor ou o Custom Tab está abrindo.
const connectingGoogle = ref(false);

const promptBiometricSetup = async () => {
  if (!(await biometricService.canPromptForAuth()) || settingsStore.biometryEnabled) return;

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

/**
 * Login pelo Google. Dois jeitos de terminar, cada um navega uma vez só:
 * - seletor nativo e fake login devolvem o usuário aqui → `goAfterLogin()` abaixo;
 * - Custom Tab lança `REDIRECT_PENDING` e o deep link, que volta depois, chama
 *   `goAfterLogin` pelo `onLoginGoogleSuccess`.
 */
const signInWithGoogle = async () => {
  if (connectingGoogle.value) return;
  connectingGoogle.value = true;

  try {
    await authService.signInWithGoogle();
    await goAfterLogin();
  } catch (error: any) {
    if (error.message === 'REDIRECT_PENDING') {
      await toastService.presentToastSuccess(t('auth.redirectingToProvider'));
      return;
    }
    // Fechou o seletor de contas: desistência, não falha.
    if (error?.code === 'USER_CANCELLED') return;
    logger.error('Google login error:', error);
    await toastService.presentToastError(`${t('auth.loginFailed')} ${error.message || ''}`);
  } finally {
    connectingGoogle.value = false;
  }
};

onMounted(() => {
  authService.onLoginGoogleSuccess(goAfterLogin);

  // Aquece o seletor nativo aqui, não no boot. Sem `await`: falhando, o
  // `signInWithGoogle` tenta de novo e, não dando, cai no Custom Tab.
  void authService.initSocialLogin().catch((error) => {
    logger.warn('SocialLogin warm-up failed:', error);
  });
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

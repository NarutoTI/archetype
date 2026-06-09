<template>
  <div class="email-auth-form">
    <ion-segment v-model="mode" @ionChange="onModeChange">
      <ion-segment-button value="login">
        <ion-label>{{ $t('auth.login') }}</ion-label>
      </ion-segment-button>
      <ion-segment-button value="register">
        <ion-label>{{ $t('auth.register') }}</ion-label>
      </ion-segment-button>
    </ion-segment>

    <form class="auth-form" @submit.prevent="handleSubmit">
      <ion-item v-if="mode === 'register'">
        <ion-input
          v-model="form.name"
          :label="$t('auth.name')"
          label-placement="stacked"
          autocomplete="name"
          required
        />
      </ion-item>

      <ion-item v-if="mode === 'register'" :class="{ 'ion-invalid': birthDateError }">
        <ion-input
          v-model="form.birthDate"
          type="date"
          :label="`${$t('auth.birthDate')} (${$t('common.optional')})`"
          label-placement="stacked"
          @ionInput="validateBirthDateRealTime(String($event.detail.value || ''))"
        />
        <ion-note v-if="birthDateError" slot="error">{{ birthDateError }}</ion-note>
      </ion-item>

      <ion-item v-if="mode === 'register'" :class="{ 'ion-invalid': phoneError }">
        <ion-input
          v-model="form.phone"
          type="tel"
          :label="`${$t('auth.phone')} (${$t('common.optional')})`"
          label-placement="stacked"
          :placeholder="$t('auth.phonePlaceholder')"
          autocomplete="tel"
          @ionInput="validatePhoneRealTime(String($event.detail.value || ''))"
        />
        <ion-note v-if="phoneError" slot="error">{{ phoneError }}</ion-note>
      </ion-item>

      <ion-item>
        <ion-input
          v-model="form.email"
          type="email"
          :label="$t('auth.email')"
          label-placement="stacked"
          autocomplete="email"
          required
        />
      </ion-item>

      <ion-item>
        <ion-input
          v-model="form.password"
          :type="showPassword ? 'text' : 'password'"
          :label="$t('auth.password')"
          label-placement="stacked"
          :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
          required
        />
        <ion-button
          fill="clear"
          slot="end"
          type="button"
          @click="showPassword = !showPassword"
        >
          <ion-icon :icon="showPassword ? eyeOffOutline : eyeOutline" />
        </ion-button>
      </ion-item>

      <ion-button expand="block" type="submit" :disabled="loading || !isFormValid" class="submit-button">
        <ion-spinner v-if="loading" name="dots" />
        <span v-else>{{ mode === 'login' ? $t('auth.signIn') : $t('auth.signUp') }}</span>
      </ion-button>

      <div v-if="mode === 'login'" class="link-row">
        <ion-button fill="clear" size="small" type="button" @click="showForgotPassword = true">
          {{ $t('auth.forgotPassword') }}
        </ion-button>
      </div>

      <div v-if="mode === 'login' && showResendButton" class="link-row">
        <ion-button fill="clear" size="small" type="button" @click="showResendConfirmation = true">
          {{ $t('auth.resendConfirmation') }}
        </ion-button>
      </div>
    </form>

    <ion-modal :is-open="showForgotPassword" @didDismiss="showForgotPassword = false">
      <ion-header>
        <ion-toolbar>
          <ion-title>{{ $t('auth.resetPassword') }}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <p>{{ $t('auth.resetPasswordInstructions') }}</p>
        <ion-item>
          <ion-input
            v-model="forgotPasswordEmail"
            type="email"
            :label="$t('auth.email')"
            label-placement="stacked"
            required
          />
        </ion-item>
      </ion-content>
      <ion-footer>
        <ion-toolbar>
          <ion-buttons slot="secondary">
            <ion-button @click="showForgotPassword = false">{{ $t('common.cancel') }}</ion-button>
          </ion-buttons>
          <ion-buttons slot="primary">
            <ion-button
              class="modal-primary-action"
              :disabled="!forgotPasswordEmail || forgotPasswordLoading"
              @click="handleForgotPassword"
            >
              <ion-spinner v-if="forgotPasswordLoading" name="dots" />
              <span v-else>{{ $t('auth.sendResetEmail') }}</span>
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-footer>
    </ion-modal>

    <ion-modal :is-open="showResendConfirmation" @didDismiss="showResendConfirmation = false">
      <ion-header>
        <ion-toolbar>
          <ion-title>{{ $t('auth.resendConfirmation') }}</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content class="ion-padding">
        <p>{{ $t('auth.resendConfirmationInstructions') }}</p>
        <ion-item>
          <ion-input
            v-model="resendConfirmationEmail"
            type="email"
            :label="$t('auth.email')"
            label-placement="stacked"
            required
          />
        </ion-item>
      </ion-content>
      <ion-footer>
        <ion-toolbar>
          <ion-buttons slot="secondary">
            <ion-button @click="showResendConfirmation = false">{{ $t('common.cancel') }}</ion-button>
          </ion-buttons>
          <ion-buttons slot="primary">
            <ion-button
              class="modal-primary-action"
              :disabled="!resendConfirmationEmail || resendConfirmationLoading"
              @click="handleResendConfirmation"
            >
              <ion-spinner v-if="resendConfirmationLoading" name="dots" />
              <span v-else>{{ $t('auth.sendConfirmationEmail') }}</span>
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-footer>
    </ion-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonModal,
  IonNote,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/vue';
import { eyeOffOutline, eyeOutline } from 'ionicons/icons';
import { useI18n } from 'vue-i18n';
import { authService } from '@/services/auth.service';
import { toastService } from '@/services/toast.service';
import { createLocalDate } from '@/utils/date.utils';
import { logger } from '@/utils/logger';

const emit = defineEmits<{
  loginSuccess: [user: unknown];
  registrationSuccess: [message: string];
}>();

const { t } = useI18n();
const mode = ref<'login' | 'register'>('login');
const loading = ref(false);
const showPassword = ref(false);
const showForgotPassword = ref(false);
const forgotPasswordEmail = ref('');
const forgotPasswordLoading = ref(false);
const showResendButton = ref(false);
const showResendConfirmation = ref(false);
const resendConfirmationEmail = ref('');
const resendConfirmationLoading = ref(false);
const birthDateError = ref('');
const phoneError = ref('');

const form = ref({
  name: '',
  email: '',
  password: '',
  birthDate: '',
  phone: '',
});

const validateBirthDate = (date: string): boolean => {
  if (!date) return true;
  const selectedDate = createLocalDate(date);
  const minDate = createLocalDate('1900-01-01');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return selectedDate >= minDate && selectedDate <= today;
};

const validatePhone = (phone: string): boolean => {
  if (!phone) return true;
  const cleanPhone = phone.replace(/[\s()\-.]/g, '');
  return /^(\+?[1-9]\d{1,2}\s?\d{6,14}|\d{10,15})$/.test(cleanPhone);
};

const validateBirthDateRealTime = (date: string) => {
  birthDateError.value = date && !validateBirthDate(date) ? t('auth.invalidBirthDate') : '';
};

const validatePhoneRealTime = (phone: string) => {
  phoneError.value = phone && !validatePhone(phone) ? t('auth.invalidPhone') : '';
};

const isFormValid = computed(() => {
  if (mode.value === 'register') {
    return (
      form.value.name.trim().length >= 2 &&
      form.value.email.includes('@') &&
      form.value.password.length >= 6 &&
      validateBirthDate(form.value.birthDate) &&
      validatePhone(form.value.phone)
    );
  }
  return form.value.email.includes('@') && form.value.password.length > 0;
});

const onModeChange = (event: CustomEvent) => {
  mode.value = event.detail.value;
  form.value = { name: '', email: '', password: '', birthDate: '', phone: '' };
  birthDateError.value = '';
  phoneError.value = '';
};

const handleSubmit = async () => {
  if (!isFormValid.value) return;
  loading.value = true;

  try {
    if (mode.value === 'register') {
      const result = await authService.registerWithEmail(
        form.value.name.trim(),
        form.value.email.trim().toLowerCase(),
        form.value.password,
        form.value.birthDate,
        form.value.phone.trim(),
      );

      if (result.success) {
        await toastService.presentToastSuccess(result.message);
        emit('registrationSuccess', result.message);
        mode.value = 'login';
        form.value = { name: '', email: form.value.email, password: '', birthDate: '', phone: '' };
      } else {
        await toastService.presentToastError(result.message);
      }
      return;
    }

    const user = await authService.loginWithEmail(
      form.value.email.trim().toLowerCase(),
      form.value.password,
    );
    await toastService.presentToastSuccess(t('auth.loginSuccess'));
    emit('loginSuccess', user);
  } catch (error: any) {
    logger.error('Auth error:', error);
    if (String(error.message).includes('EMAIL_NOT_VERIFIED')) {
      showResendButton.value = true;
    }
    await toastService.presentToastError(error.message || t('auth.loginFailed'));
  } finally {
    loading.value = false;
  }
};

const handleForgotPassword = async () => {
  if (!forgotPasswordEmail.value.includes('@')) {
    await toastService.presentToastError(t('auth.invalidEmail'));
    return;
  }

  forgotPasswordLoading.value = true;
  try {
    const result = await authService.forgotPassword(forgotPasswordEmail.value.trim().toLowerCase());
    await toastService.presentToastSuccess(result.message);
    showForgotPassword.value = false;
    forgotPasswordEmail.value = '';
  } finally {
    forgotPasswordLoading.value = false;
  }
};

const handleResendConfirmation = async () => {
  if (!resendConfirmationEmail.value.includes('@')) {
    await toastService.presentToastError(t('auth.invalidEmail'));
    return;
  }

  resendConfirmationLoading.value = true;
  try {
    const result = await authService.resendConfirmationEmail(resendConfirmationEmail.value.trim().toLowerCase());
    await toastService.presentToastSuccess(result.message);
    showResendConfirmation.value = false;
    resendConfirmationEmail.value = '';
  } finally {
    resendConfirmationLoading.value = false;
  }
};
</script>

<style scoped>
.email-auth-form {
  width: 100%;
}

.auth-form {
  margin-top: 20px;
}

.auth-form ion-item {
  margin-bottom: 12px;
}

.submit-button {
  margin-top: 20px;
}

.link-row {
  text-align: center;
  margin-top: 12px;
}
</style>

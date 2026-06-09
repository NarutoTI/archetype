<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ $t('common.menu') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list inset>
        <ion-item>
          <ion-avatar slot="start">
            <ion-icon :icon="personCircleOutline" size="large" />
          </ion-avatar>
          <ion-label>
            <h2>{{ userStore.currentUser?.name || $t('common.user') }}</h2>
            <p>{{ userStore.currentUser?.email }}</p>
          </ion-label>
        </ion-item>
      </ion-list>

      <ion-list inset>
        <ion-item>
          <ion-icon :icon="languageOutline" slot="start" color="primary" />
          <ion-select
            :label="$t('common.language')"
            :value="settingsStore.language"
            interface="popover"
            @ionChange="settingsStore.setLanguage($event.detail.value)"
          >
            <ion-select-option value="pt">Português</ion-select-option>
            <ion-select-option value="en">English</ion-select-option>
          </ion-select>
        </ion-item>

        <ion-item>
          <ion-icon :icon="moonOutline" slot="start" color="primary" />
          <ion-select
            :label="$t('settings.theme')"
            :value="settingsStore.theme"
            interface="popover"
            @ionChange="settingsStore.setTheme($event.detail.value)"
          >
            <ion-select-option value="system">{{ $t('settings.themeSystem') }}</ion-select-option>
            <ion-select-option value="light">{{ $t('settings.themeLight') }}</ion-select-option>
            <ion-select-option value="dark">{{ $t('settings.themeDark') }}</ion-select-option>
          </ion-select>
        </ion-item>

        <ion-item v-if="biometricAvailable">
          <ion-icon :icon="fingerPrintOutline" slot="start" color="success" />
          <ion-label>
            <h3>{{ $t('biometric.enable') }}</h3>
            <p>{{ settingsStore.biometryEnabled ? $t('biometric.enabled') : $t('biometric.disabled') }}</p>
          </ion-label>
          <ion-toggle
            slot="end"
            :checked="settingsStore.biometryEnabled"
            @ionChange="settingsStore.setBiometryEnabled($event.detail.checked)"
          />
        </ion-item>
      </ion-list>

      <ion-list inset>
        <ion-item button @click="testNotification">
          <ion-icon :icon="notificationsOutline" slot="start" color="warning" />
          <ion-label>{{ $t('settings.testNotification') }}</ion-label>
        </ion-item>
        <ion-item button @click="openSettings">
          <ion-icon :icon="settingsOutline" slot="start" color="primary" />
          <ion-label>{{ $t('settings.openNotificationSettings') }}</ion-label>
        </ion-item>
        <ion-item button @click="checkForUpdates">
          <ion-icon :icon="cloudDownloadOutline" slot="start" color="success" />
          <ion-label>{{ $t('version.checkForUpdates') }}</ion-label>
        </ion-item>
        <ion-item button @click="debugNotificationStatus">
          <ion-icon :icon="bugOutline" slot="start" color="secondary" />
          <ion-label>{{ $t('settings.debugNotificationStatus') }}</ion-label>
        </ion-item>
        <ion-item button @click="debugLocationStatus">
          <ion-icon :icon="locationOutline" slot="start" color="tertiary" />
          <ion-label>{{ $t('settings.debugLocationStatus') }}</ion-label>
        </ion-item>
        <ion-item button @click="isLocationPickerOpen = true">
          <ion-icon :icon="mapOutline" slot="start" color="primary" />
          <ion-label>{{ $t('location.demoEntry') }}</ion-label>
        </ion-item>
        <ion-item v-if="isDevelopmentMode" button @click="testAlerts">
          <ion-icon :icon="alertCircleOutline" slot="start" color="tertiary" />
          <ion-label>{{ $t('settings.testAlerts') }}</ion-label>
        </ion-item>
      </ion-list>

      <ion-list inset>
        <ion-item button router-link="/tabs/delete-account">
          <ion-icon :icon="trashOutline" slot="start" color="danger" />
          <ion-label color="danger">{{ $t('account.deleteTitle') }}</ion-label>
        </ion-item>
        <ion-item button @click="signOut">
          <ion-icon :icon="logOutOutline" slot="start" />
          <ion-label>{{ $t('auth.signOut') }}</ion-label>
        </ion-item>
      </ion-list>

      <MapLocationPicker
        :is-open="isLocationPickerOpen"
        @select="onLocationSelected"
        @close="isLocationPickerOpen = false"
      />
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonAvatar,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/vue';
import {
  alertCircleOutline,
  bugOutline,
  cloudDownloadOutline,
  fingerPrintOutline,
  languageOutline,
  locationOutline,
  logOutOutline,
  mapOutline,
  moonOutline,
  notificationsOutline,
  personCircleOutline,
  settingsOutline,
  trashOutline,
} from 'ionicons/icons';
import { actionSheetController } from '@ionic/vue';
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import MapLocationPicker from '@/views/components/MapLocationPicker.vue';
import { authService } from '@/services/auth.service';
import { biometricService } from '@/services/biometric.service';
import { capacitorService } from '@/services/capacitor.service';
import { LocationService, type AppLocation } from '@/services/location.service';
import { notificationService } from '@/services/notification.service';
import { toastService } from '@/services/toast.service';
import { versionService } from '@/services/version.service';
import { alertService } from '@/services/alert.service';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUserStore } from '@/stores/userStore';

const router = useRouter();
const { t } = useI18n();
const settingsStore = useSettingsStore();
const userStore = useUserStore();
const biometricAvailable = ref(false);
const isLocationPickerOpen = ref(false);
const isDevelopmentMode = import.meta.env.DEV;

const testNotification = async () => {
  await notificationService.testNotification();
};

const openSettings = async () => {
  await capacitorService.openSettings();
};

const checkForUpdates = async () => {
  await versionService.checkAndPromptForUpdate(true);
};

const debugNotificationStatus = async () => {
  await alertService.presentAlertInfo(
    String(settingsStore.language === 'pt' ? 'Notificações' : 'Notifications'),
    await notificationService.debugNotificationStatus(),
  );
};

const debugLocationStatus = async () => {
  await alertService.presentAlertInfo(
    String(settingsStore.language === 'pt' ? 'Localização' : 'Location'),
    await LocationService.debugLocationStatus(),
  );
};

const onLocationSelected = async (location: AppLocation) => {
  isLocationPickerOpen.value = false;
  await toastService.presentToastSuccess(
    t('location.selected', { address: LocationService.formatLocationForDisplay(location) }),
  );
};

// Ajuda de desenvolvimento para pré-visualizar todas as cores de alerta.
const testAlerts = async () => {
  const actionSheet = await actionSheetController.create({
    header: t('settings.testAlerts'),
    buttons: [
      {
        text: `🚨 ${t('settings.testAlertDanger')}`,
        handler: () => {
          void alertService.presentAlertError(t('settings.testAlertDanger'), t('settings.testAlertMessage'));
        },
      },
      {
        text: `✅ ${t('settings.testAlertSuccess')}`,
        handler: () => {
          void alertService.presentAlertSuccess(t('settings.testAlertSuccess'), t('settings.testAlertMessage'));
        },
      },
      {
        text: `⚠️ ${t('settings.testAlertWarning')}`,
        handler: () => {
          void alertService.presentAlertWarning(t('settings.testAlertWarning'), t('settings.testAlertMessage'));
        },
      },
      {
        text: `ℹ️ ${t('settings.testAlertInfo')}`,
        handler: () => {
          void alertService.presentAlertInfo(t('settings.testAlertInfo'), t('settings.testAlertMessage'));
        },
      },
      {
        text: t('common.cancel'),
        role: 'cancel',
      },
    ],
  });

  await actionSheet.present();
};

const signOut = async () => {
  await authService.signOut();
  await router.replace('/login');
};

onMounted(async () => {
  biometricAvailable.value = await biometricService.isAvailable();
});
</script>

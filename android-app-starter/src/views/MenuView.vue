<template>
  <ion-page>
    <!-- Superfície neutra (Material 3): o primary fica nos acentos, não na faixa do topo.
         Era o único cabeçalho colorido do app, e destoava de todas as outras páginas.
         Ver docs/APP-CHROME-LAYOUT.md. -->
    <ion-header :translucent="false" data-bottom-bar-reveal="ignore">
      <ion-toolbar>
        <ion-title>{{ $t('common.menu') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content
      :fullscreen="false"
      :class="{ 'scrolls-under-bar': !bundleLabel && !appVersion }"
    >
      <!-- Perfil -->
      <ion-item lines="full" class="user-profile-item">
        <ion-avatar slot="start">
          <ion-icon :icon="personCircleOutline" size="large" />
        </ion-avatar>
        <ion-label>
          <h2>{{ userStore.currentUser?.name || $t('common.user') }}</h2>
          <p>{{ userStore.currentUser?.email }}</p>
        </ion-label>
      </ion-item>

      <!-- Preferências -->
      <ion-list>
        <ion-list-header>
          <ion-label>{{ $t('settings.sections.preferences') }}</ion-label>
        </ion-list-header>

        <ion-item button @click="showLanguageModal = true">
          <ion-icon :icon="languageOutline" slot="start" color="primary" />
          <ion-label>
            <h3>{{ $t('common.language') }}</h3>
            <p>{{ currentLanguageName }}</p>
          </ion-label>
        </ion-item>

        <ion-item button @click="showThemeModal = true">
          <ion-icon :icon="moonOutline" slot="start" color="primary" />
          <ion-label>
            <h3>{{ $t('settings.theme') }}</h3>
            <p>{{ currentThemeName }}</p>
          </ion-label>
        </ion-item>

        <!-- Flutuante: some após 2,5s. Encostada: fica sempre visível. A preferência é do
             aparelho e sobrevive ao logout. Ver docs/APP-CHROME-LAYOUT.md. -->
        <ion-item>
          <ion-icon :icon="tabletPortraitOutline" slot="start" color="primary" />
          <ion-label>
            <h3>{{ $t('settings.bottomBarFloating') }}</h3>
            <p>{{ $t('settings.bottomBarFloatingHint') }}</p>
          </ion-label>
          <ion-toggle
            slot="end"
            data-test="bottom-bar-floating-toggle"
            :checked="settingsStore.bottomBarFloating"
            @ionChange="settingsStore.setBottomBarFloating($event.detail.checked)"
          />
        </ion-item>

        <ion-item v-if="biometricAvailable">
          <ion-icon :icon="fingerPrintOutline" slot="start" color="success" />
          <ion-label>
            <h3>{{ $t('biometric.enable') }}</h3>
            <p>{{ settingsStore.biometryEnabled ? $t('biometric.enabled') : $t('biometric.disabled') }}</p>
          </ion-label>
          <ion-toggle
            slot="end"
            color="success"
            :checked="settingsStore.biometryEnabled"
            @ionChange="settingsStore.setBiometryEnabled($event.detail.checked)"
          />
        </ion-item>
      </ion-list>

      <!-- Notificações -->
      <ion-list>
        <ion-list-header>
          <ion-label>{{ $t('settings.sections.notifications') }}</ion-label>
        </ion-list-header>

        <ion-item v-if="supportsServerPush">
          <ion-icon :icon="serverOutline" slot="start" color="primary" />
          <ion-label>
            <h3>{{ $t('settings.reminderDelivery') }}</h3>
            <p>{{ reminderDeliveryDescription }}</p>
          </ion-label>
          <ion-select
            slot="end"
            interface="popover"
            :value="desiredDeliveryMode"
            :disabled="deliveryModeBusy"
            @ionChange="onDeliveryModeChange($event.detail.value)"
          >
            <ion-select-option value="push">{{ $t('settings.reminderDeliveryPush') }}</ion-select-option>
            <ion-select-option value="local">{{ $t('settings.reminderDeliveryLocal') }}</ion-select-option>
          </ion-select>
        </ion-item>

        <!-- Toque na linha dispara; descrição indica canal efetivo (push vs local). -->
        <ion-item button :disabled="isTestingNotification" @click="testNotification">
          <ion-icon :icon="notificationsOutline" slot="start" color="warning" />
          <ion-label>
            <h3>{{ $t('settings.testNotification') }}</h3>
            <p>{{ testNotificationDescription }}</p>
          </ion-label>
          <ion-spinner v-if="isTestingNotification" slot="end" name="crescent" />
        </ion-item>

        <ion-item button @click="openSettings">
          <ion-icon :icon="settingsOutline" slot="start" color="primary" />
          <ion-label>{{ $t('settings.openNotificationSettings') }}</ion-label>
        </ion-item>
      </ion-list>

      <!-- Manutenção -->
      <ion-list>
        <ion-list-header>
          <ion-label>{{ $t('settings.sections.maintenance') }}</ion-label>
        </ion-list-header>

        <ion-item button @click="checkForUpdates">
          <ion-icon :icon="cloudDownloadOutline" slot="start" color="success" />
          <ion-label>{{ $t('version.checkForUpdates') }}</ion-label>
        </ion-item>
      </ion-list>

      <!-- Diagnóstico (accordion; demos e status) -->
      <ion-accordion-group>
        <ion-accordion value="diagnostics">
          <ion-item slot="header">
            <ion-icon :icon="bugOutline" slot="start" color="secondary" />
            <ion-label>{{ $t('settings.sections.diagnostics') }}</ion-label>
          </ion-item>
          <div slot="content">
            <ion-item button @click="debugNotificationStatus">
              <ion-icon :icon="notificationsOutline" slot="start" color="secondary" />
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
          </div>
        </ion-accordion>
      </ion-accordion-group>

      <!-- Conta -->
      <ion-list>
        <ion-list-header>
          <ion-label>{{ $t('settings.sections.account') }}</ion-label>
        </ion-list-header>

        <ion-item button router-link="/tabs/delete-account">
          <ion-icon :icon="trashOutline" slot="start" color="danger" />
          <ion-label color="danger">{{ $t('account.deleteTitle') }}</ion-label>
        </ion-item>

        <ion-item button @click="signOut">
          <ion-icon :icon="logOutOutline" slot="start" color="danger" />
          <ion-label color="danger">{{ $t('auth.signOut') }}</ion-label>
        </ion-item>
      </ion-list>

      <!-- Modal de idioma -->
      <ion-modal :is-open="showLanguageModal" @did-dismiss="showLanguageModal = false">
        <ion-header>
          <ion-toolbar>
            <ion-title>{{ $t('common.language') }}</ion-title>
            <ion-buttons slot="end">
              <ion-button @click="showLanguageModal = false">
                <ion-icon :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content>
          <ion-list>
            <ion-item button @click="changeLanguage('pt')">
              <ion-label>
                <h3>Português</h3>
              </ion-label>
              <ion-icon
                v-if="settingsStore.language === 'pt'"
                :icon="checkmarkOutline"
                slot="end"
                color="primary"
              />
            </ion-item>
            <ion-item button @click="changeLanguage('en')">
              <ion-label>
                <h3>English</h3>
              </ion-label>
              <ion-icon
                v-if="settingsStore.language === 'en'"
                :icon="checkmarkOutline"
                slot="end"
                color="primary"
              />
            </ion-item>
          </ion-list>
        </ion-content>
      </ion-modal>

      <!-- Modal de tema (sem emoji na linha principal do menu) -->
      <ion-modal :is-open="showThemeModal" @did-dismiss="showThemeModal = false">
        <ion-header>
          <ion-toolbar>
            <ion-title>{{ $t('settings.theme') }}</ion-title>
            <ion-buttons slot="end">
              <ion-button @click="showThemeModal = false">
                <ion-icon :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content>
          <ion-list>
            <ion-item button @click="changeTheme('system')">
              <ion-label>
                <h3>{{ $t('settings.themeSystem') }}</h3>
                <p>{{ $t('settings.themeSystemDescription') }}</p>
              </ion-label>
              <ion-icon
                v-if="settingsStore.theme === 'system'"
                :icon="checkmarkOutline"
                slot="end"
                color="primary"
              />
            </ion-item>
            <ion-item button @click="changeTheme('light')">
              <ion-label>
                <h3>{{ $t('settings.themeLight') }}</h3>
                <p>{{ $t('settings.themeLightDescription') }}</p>
              </ion-label>
              <ion-icon
                v-if="settingsStore.theme === 'light'"
                :icon="checkmarkOutline"
                slot="end"
                color="primary"
              />
            </ion-item>
            <ion-item button @click="changeTheme('dark')">
              <ion-label>
                <h3>{{ $t('settings.themeDark') }}</h3>
                <p>{{ $t('settings.themeDarkDescription') }}</p>
              </ion-label>
              <ion-icon
                v-if="settingsStore.theme === 'dark'"
                :icon="checkmarkOutline"
                slot="end"
                color="primary"
              />
            </ion-item>
          </ion-list>
        </ion-content>
      </ion-modal>

      <MapLocationPicker
        :is-open="isLocationPickerOpen"
        @select="onLocationSelected"
        @close="isLocationPickerOpen = false"
      />
    </ion-content>

    <!-- A linha reserva a pílula enquanto ela aparece. O atributo impede que os 12 toques do
         canal OTA devolvam a barra; um ancestral cobre toolbar, item e chip. -->
    <ion-footer
      v-if="bundleLabel || appVersion"
      class="menu-version-footer"
      data-bottom-bar-reveal="ignore"
    >
      <ion-toolbar>
        <ion-item lines="none" @click="registerOtaTap" @contextmenu.prevent>
          <ion-label>{{ $t('version.label', { version: bundleLabel || appVersion }) }}</ion-label>
          <ion-chip
            v-if="otaChannel === 'staging'"
            slot="end"
            color="warning"
            @click.stop="openOtaChannelPrompt"
          >
            {{ $t('version.ota.channelTestBadge') }}
          </ion-chip>
        </ion-item>
      </ion-toolbar>
    </ion-footer>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonAccordion,
  IonAccordionGroup,
  IonAvatar,
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonModal,
  IonPage,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToggle,
  IonToolbar,
  actionSheetController,
} from '@ionic/vue';
import {
  alertCircleOutline,
  bugOutline,
  checkmarkOutline,
  closeOutline,
  cloudDownloadOutline,
  fingerPrintOutline,
  languageOutline,
  locationOutline,
  logOutOutline,
  mapOutline,
  moonOutline,
  tabletPortraitOutline,
  notificationsOutline,
  personCircleOutline,
  serverOutline,
  settingsOutline,
  trashOutline,
} from 'ionicons/icons';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import MapLocationPicker from '@/views/components/MapLocationPicker.vue';
import { alertService } from '@/services/alert.service';
import { authService } from '@/services/auth.service';
import { biometricService } from '@/services/biometric.service';
import { capacitorService } from '@/services/capacitor.service';
import { LocationService, type AppLocation } from '@/services/location.service';
import { localNotificationService } from '@/services/localNotification.service';
import { pushNotificationService } from '@/services/pushNotification.service';
import {
  reminderDeliveryService,
  type ReminderDeliveryMode,
} from '@/services/reminderDelivery.service';
import { toastService } from '@/services/toast.service';
import { versionService } from '@/services/version.service';
import { getOtaChannel, setOtaChannel, type OtaChannel } from '@/services/ota-channel.service';
import { useSettingsStore, type ThemeOption } from '@/stores/settingsStore';
import { useUserStore } from '@/stores/userStore';
import { logger } from '@/utils/logger';

const router = useRouter();
const { t } = useI18n();
const settingsStore = useSettingsStore();
const userStore = useUserStore();

const biometricAvailable = ref(false);
const isLocationPickerOpen = ref(false);
const showLanguageModal = ref(false);
const showThemeModal = ref(false);
const deliveryModeBusy = ref(false);
const isTestingNotification = ref(false);
const isDevelopmentMode = import.meta.env.DEV;
const supportsServerPush = reminderDeliveryService.supportsServerPush;

const desiredDeliveryMode = computed(() => reminderDeliveryService.desiredMode.value);
const effectiveDeliveryMode = computed(() => reminderDeliveryService.effectiveMode.value);

const currentLanguageName = computed(() =>
  settingsStore.language === 'pt' ? 'Português' : 'English',
);

const currentThemeName = computed(() => {
  if (settingsStore.theme === 'light') return t('settings.themeLight');
  if (settingsStore.theme === 'dark') return t('settings.themeDark');
  return t('settings.themeSystem');
});

const reminderDeliveryDescription = computed(() => {
  if (desiredDeliveryMode.value === 'push' && effectiveDeliveryMode.value === 'local') {
    return t('settings.reminderDeliveryLocalFallback');
  }
  return effectiveDeliveryMode.value === 'push'
    ? t('settings.reminderDeliveryPushDescription')
    : t('settings.reminderDeliveryLocalDescription');
});

const testNotificationDescription = computed(() =>
  effectiveDeliveryMode.value === 'push'
    ? t('settings.testNotificationPushDescription')
    : t('settings.testNotificationLocalDescription'),
);

const changeLanguage = async (language: 'pt' | 'en') => {
  await settingsStore.setLanguage(language);
  showLanguageModal.value = false;
};

const changeTheme = async (theme: ThemeOption) => {
  await settingsStore.setTheme(theme);
  showThemeModal.value = false;
  await toastService.presentToastSuccess(t('settings.themeUpdated'));
};

const onDeliveryModeChange = async (mode: ReminderDeliveryMode) => {
  if (!mode || mode === desiredDeliveryMode.value || deliveryModeBusy.value) return;
  deliveryModeBusy.value = true;
  try {
    const effective = await pushNotificationService.setDeliveryMode(mode);
    if (mode === 'push' && effective !== 'push') {
      await toastService.presentToastWarning(t('settings.reminderDeliveryPushFailed'));
    }
  } catch {
    await toastService.presentToastError(t('settings.reminderDeliveryPushFailed'));
  } finally {
    deliveryModeBusy.value = false;
  }
};

const testNotification = async () => {
  if (isTestingNotification.value) return;
  isTestingNotification.value = true;
  try {
    if (effectiveDeliveryMode.value === 'push') {
      // Sem toast de sucesso: a prova é a mensagem FCM (foreground/background).
      await pushNotificationService.sendTestPush();
      return;
    }
    const success = await localNotificationService.testNotification();
    if (success) {
      await toastService.presentToastSuccess(t('settings.notificationTestScheduled'));
    } else {
      await toastService.presentToastError(t('settings.notificationTestFailed'));
    }
  } catch (error) {
    logger.error('Error in test notification:', error);
    await toastService.presentToastError(t('settings.notificationTestFailed'));
  } finally {
    isTestingNotification.value = false;
  }
};

const openSettings = async () => {
  await capacitorService.openSettings();
};

const checkForUpdates = async () => {
  await versionService.checkAndPromptForUpdate(true);
};

// --- OTA: rodapé de versão + canal local (12 toques na linha da versão) ---
const bundleLabel = ref<string | null>(null);
const appVersion = ref('');
const otaChannel = ref<OtaChannel>('production');
const otaChannelPromptOpen = ref(false);

const OTA_TAP_TARGET = 12;
const OTA_TAP_WINDOW_MS = 2000;
const otaTapCount = ref(0);
const otaTapTimer = ref<ReturnType<typeof setTimeout> | null>(null);

const openOtaChannelPrompt = async () => {
  if (!Capacitor.isNativePlatform() || otaChannelPromptOpen.value) return;
  otaChannelPromptOpen.value = true;
  try {
    const currentChannel = await getOtaChannel();
    const enteringStaging = currentChannel === 'production';
    const result = await alertService.presentCustomAlert({
      header: enteringStaging ? t('version.ota.channelEnterTitle') : t('version.ota.channelLeaveTitle'),
      message: enteringStaging ? t('version.ota.channelEnterMessage') : t('version.ota.channelLeaveMessage'),
      buttons: [
        { text: t('common.cancel'), role: 'cancel', cssClass: 'alert-button-secondary' },
        {
          text: enteringStaging ? t('version.ota.channelEnterConfirm') : t('version.ota.channelLeaveConfirm'),
          role: 'confirm',
          cssClass: 'alert-button-primary',
        },
      ],
      cssClass: 'alert-primary',
    });
    if (result.role === 'confirm') {
      const nextChannel: OtaChannel = enteringStaging ? 'staging' : 'production';
      await setOtaChannel(nextChannel);
      otaChannel.value = nextChannel;

      // Trocar de canal é uma ação de desenvolvimento. Reseta pela API do
      // Capgo para a próxima checagem partir do builtin do último cap sync,
      // sem manipular arquivos privados do plugin.
      const { resetToBuiltin } = await import('@/services/ota.service');
      await resetToBuiltin();

      await toastService.presentToastSuccess(
        nextChannel === 'staging'
          ? t('version.ota.channelStagingEnabled')
          : t('version.ota.channelProductionEnabled'),
      );
    }
  } catch (error) {
    logger.error('Falha ao trocar o canal OTA local:', error);
    await toastService.presentToastError(t('version.errorChecking'));
  } finally {
    otaChannelPromptOpen.value = false;
  }
};

// 12 toques na linha da versão (janela ~2 s; pausa zera a contagem).
const registerOtaTap = () => {
  if (!Capacitor.isNativePlatform()) return;
  if (otaTapTimer.value) {
    clearTimeout(otaTapTimer.value);
    otaTapTimer.value = null;
  }
  otaTapCount.value += 1;
  if (otaTapCount.value >= OTA_TAP_TARGET) {
    otaTapCount.value = 0;
    void openOtaChannelPrompt();
    return;
  }
  otaTapTimer.value = setTimeout(() => {
    otaTapCount.value = 0;
    otaTapTimer.value = null;
  }, OTA_TAP_WINDOW_MS);
};

onBeforeUnmount(() => {
  if (otaTapTimer.value) clearTimeout(otaTapTimer.value);
});

const debugNotificationStatus = async () => {
  await alertService.presentAlertInfo(
    t('settings.debugNotificationStatus'),
    await localNotificationService.debugNotificationStatus(),
  );
};

const debugLocationStatus = async () => {
  await alertService.presentAlertInfo(
    t('settings.debugLocationStatus'),
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
  await reminderDeliveryService.initialize();

  // Rodapé de versão: label do bundle OTA ativo + canal local (só nativo).
  try {
    const { getActiveBundleLabel } = await import('@/services/ota.service');
    const [label, channel] = await Promise.all([getActiveBundleLabel(), getOtaChannel()]);
    bundleLabel.value = label;
    otaChannel.value = channel;
    if (Capacitor.isNativePlatform()) {
      appVersion.value = (await App.getInfo()).version;
    }
  } catch (error) {
    logger.error('Falha ao carregar info de versão OTA:', error);
  }
});
</script>

<style scoped>
.menu-version-footer ion-toolbar {
  /* A faixa volta ao conteúdo quando a barra some. Fora das abas a variável vale zero. */
  padding-bottom: var(--bar-cover, 0px);
  transition: padding-bottom 180ms ease;
}

.user-profile-item {
  --padding-top: 20px;
  --padding-bottom: 20px;
  --background: rgba(var(--ion-color-primary-rgb), 0.1);
  border-radius: 8px;
  margin: 10px;
}

.user-profile-item ion-avatar {
  width: 60px;
  height: 60px;
}

.user-profile-item h2 {
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--ion-color-primary);
}

.user-profile-item p {
  color: var(--ion-color-medium);
  font-size: 0.9em;
}
</style>

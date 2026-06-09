import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { IonicVue } from '@ionic/vue';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';
import App from './App.vue';
import router from './router';
import i18n from './i18n';
import { authService } from './services/auth.service';
import { biometricService } from './services/biometric.service';
import { notificationService } from './services/notification.service';
import { versionService } from './services/version.service';
import { shareEntry } from './services/shareEntry';
import { resolveBootReadyPromise } from './services/boot';
import { useSettingsStore } from './stores/settingsStore';
import { logger } from './utils/logger';

import '@ionic/vue/css/core.css';
import '@ionic/vue/css/normalize.css';
import '@ionic/vue/css/structure.css';
import '@ionic/vue/css/typography.css';
import '@ionic/vue/css/padding.css';
import '@ionic/vue/css/float-elements.css';
import '@ionic/vue/css/text-alignment.css';
import '@ionic/vue/css/text-transformation.css';
import '@ionic/vue/css/flex-utils.css';
import '@ionic/vue/css/display.css';
import '@ionic/vue/css/palettes/dark.class.css';
import 'leaflet/dist/leaflet.css';
import './theme/variables.css';
import './theme/global.css';

addIcons({ close });

const app = createApp(App)
  .use(IonicVue, {
    mode: 'md',
    rippleEffect: false,
    swipeBackEnabled: false,
  })
  .use(createPinia())
  .use(router)
  .use(i18n);

const mountApp = async () => {
  await router.isReady();
  app.mount('#app');
};

const initializeApp = async () => {
  try {
    shareEntry.install(router);

    await biometricService.checkBiometricAuth();
    await authService.initializeAuth();

    resolveBootReadyPromise();

    const settingsStore = useSettingsStore();
    await settingsStore.loadBootSettings();
    await mountApp();

    void settingsStore.loadSettings();
    void shareEntry.dispatchIfPending('cold-start');

    setTimeout(() => {
      void notificationService.requestPermissions().catch((error) => {
        logger.error('Error requesting notification permissions:', error);
      });

      void versionService.checkAndPromptForUpdate(false).catch((error) => {
        logger.error('Error checking app version:', error);
      });
    }, 1000);
  } catch (error) {
    logger.error('Error during app initialization:', error);
    resolveBootReadyPromise();
    await mountApp();
  }
};

void initializeApp();

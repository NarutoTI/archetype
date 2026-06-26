import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { IonicVue } from '@ionic/vue';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';
import { LocalNotifications } from '@capacitor/local-notifications';
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
import { DEFAULT_NOTIFICATION_OPEN_PATH } from './constants/notificationRoutes';

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

    void LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      const routePath = (event as any)?.notification?.extra?.routePath;
      const target = typeof routePath === 'string' && routePath.startsWith('/')
        ? routePath
        : DEFAULT_NOTIFICATION_OPEN_PATH;

      router.isReady()
        .then(() => router.push(target))
        .catch((error) => logger.error('Error routing from notification action:', error));
    }).catch((error) => logger.debug('LocalNotifications listener bind skipped:', error));

    resolveBootReadyPromise();

    const settingsStore = useSettingsStore();
    await settingsStore.loadBootSettings();
    await mountApp();

    void settingsStore.loadSettings();

    // Cold-start share dispatch starts now, after mount, but we keep its Promise
    // so Phase 3 can give share priority over the lower-priority delivered
    // notification prompt (launcher-icon/badge case).
    const coldStartShareDispatch = shareEntry.dispatchIfPending('cold-start')
      .catch((error) => {
        logger.error('Error dispatching cold-start share entry:', error);
        return false;
      });

    setTimeout(() => {
      // Lazy-load the delivered-notification entry flow only after first paint.
      // Keeping it here protects startup: no static import, no module evaluation
      // and no App.addListener bridge competing with the critical boot awaits.
      // It is always installed (the resume listener must stay active for the
      // session); only the cold-start dispatch waits on the share result.
      const notificationEntryReady = import('@/services/notificationEntry')
        .then(({ notificationEntry }) => {
          notificationEntry.install(router);
          return notificationEntry;
        });

      void (async () => {
        try {
          const [notificationEntry, shareDispatched] = await Promise.all([
            notificationEntryReady,
            coldStartShareDispatch,
          ]);

          // Share has priority over launcher-badge prompts; dispatch delivered
          // notifications only when cold-start share did not navigate.
          if (!shareDispatched) {
            await notificationEntry.dispatchIfDelivered('cold-start');
          }
        } catch (error) {
          logger.error('Error dispatching cold-start notification entry:', error);
        }
      })();

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

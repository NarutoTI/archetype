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
import { localNotificationService } from './services/localNotification.service';
import { pushNotificationService } from './services/pushNotification.service';
import { reminderDeliveryService } from './services/reminderDelivery.service';
import { versionService } from './services/version.service';
import { shareEntry } from './services/shareEntry';
import { resolveBootReadyPromise } from './services/boot';
import { useSettingsStore } from './stores/settingsStore';
import { useUserStore } from './stores/userStore';
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
    await reminderDeliveryService.initialize();
    await pushNotificationService.install(router);

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

    // OTA: confirma que o bundle ativo subiu saudável logo após montar. Pular isso
    // além do appReadyTimeout faz o plugin reverter pro bundle anterior/builtin.
    // Import dinâmico p/ o código do updater não pesar o caminho crítico do boot.
    void import('./services/ota.service').then(({ notifyAppReady }) => notifyAppReady());

    void settingsStore.loadSettings();

    // O despacho de compartilhamento no cold start começa agora, depois do mount,
    // mas sua Promise é mantida para a Fase 3 priorizar o compartilhamento sobre
    // o aviso de notificação entregue pelo ícone ou badge do launcher.
    const coldStartShareDispatch = shareEntry.dispatchIfPending('cold-start')
      .catch((error) => {
        logger.error('Error dispatching cold-start share entry:', error);
        return false;
      });

    setTimeout(() => {
      // Carrega sob demanda o fluxo de notificação entregue só depois da primeira pintura.
      // Mantê-lo aqui protege a abertura: nenhum import estático, avaliação de módulo ou
      // ponte App.addListener disputa com os awaits críticos do boot. A instalação ocorre
      // sempre para manter o listener de retomada ativo durante a sessão; apenas o despacho
      // do cold start aguarda o resultado do compartilhamento.
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

          // O compartilhamento tem prioridade sobre avisos do badge do launcher;
          // só processa notificações entregues se o compartilhamento não navegou.
          if (!shareDispatched) {
            await notificationEntry.dispatchIfDelivered('cold-start');
          }
        } catch (error) {
          logger.error('Error dispatching cold-start notification entry:', error);
        }
      })();

      void (async () => {
        try {
          if (useUserStore().isAuthenticated) {
            await pushNotificationService.reconcileAfterLogin();
          }
          if (await reminderDeliveryService.shouldScheduleLocally()) {
            await localNotificationService.requestPermissions();
          }
        } catch (error) {
          logger.error('Error reconciling reminder delivery / permissions:', error);
        }
      })();

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

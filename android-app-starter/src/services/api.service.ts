import axios from 'axios';
import { Preferences } from '@capacitor/preferences';
import { alertController } from '@ionic/vue';
import i18n from '@/i18n';
import { authService } from '@/services/auth.service';
import { logger } from '@/utils/logger';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Não abrir o alerta de sessão nem chamar signOut neste 401. */
    skipAuthHandling?: boolean;
  }
}

const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: `${baseUrl}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: false,
  timeout: import.meta.env.DEV ? 300000 : 10000,
});

// Só um 401 dispara alerta/logout; o resto (boot paralelo ou DELETE no signOut) só rejeita.
// Ordem do logout: JSDoc de `auth.service` (`signOut` / `clearToken`) e DECISOES §10.
let handlingUnauthorized = false;

api.interceptors.request.use(async (config) => {
  const result = await Preferences.get({ key: 'auth_token' });
  if (result.value) {
    config.headers.Authorization = `Bearer ${result.value}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      if (error.config?.skipAuthHandling || handlingUnauthorized) {
        return Promise.reject(error);
      }

      handlingUnauthorized = true;
      try {
        const token = await Preferences.get({ key: 'auth_token' });
        if (!token.value) return Promise.reject(error);

        logger.error(i18n.global.t('services.api.authError'), error);
        const alert = await alertController.create({
          header: i18n.global.t('services.api.authError'),
          message: i18n.global.t('services.api.authErrorMessage'),
          buttons: [{ text: i18n.global.t('common.ok'), role: 'confirm' }],
        });
        await alert.present();
        await alert.onDidDismiss();
        await authService.signOut();
        window.location.href = '/login';
      } finally {
        // Sem reset, falha no alerta/signOut deixava a flag true e os 401 seguintes mudos.
        handlingUnauthorized = false;
      }
    }
    return Promise.reject(error);
  },
);

export default api;

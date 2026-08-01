import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { PendingLocalNotificationSchema } from '@capacitor/local-notifications';
import { localNotificationService } from '@/services/localNotification.service';
import { logger } from '@/utils/logger';

/**
 * Estado da bandeja de notificações LOCAIS — o que este aparelho tem agendado agora.
 *
 * De propósito, a única store que fala com o SO. As telas leem daqui em vez de chamar o
 * serviço direto, para que a lista fique consistente entre elas e para que o dia em que o
 * app for só push essa peça saia inteira, junto com o `localNotification.service`.
 *
 * Em modo push a lista fica vazia: quem agenda é o servidor, e os métodos abaixo caem no
 * guard de modo do serviço.
 */
export const useLocalNotificationStore = defineStore('localNotification', () => {
  const pending = ref<PendingLocalNotificationSchema[]>([]);
  const isLoading = ref(false);

  const loadPending = async (): Promise<void> => {
    isLoading.value = true;
    try {
      pending.value = await localNotificationService.getPendingNotifications();
    } catch (error) {
      logger.error('Error loading pending notifications:', error);
    } finally {
      isLoading.value = false;
    }
  };

  /** Cancela um agendamento e tira da lista sem esperar um reload. */
  const cancelPending = async (notification: PendingLocalNotificationSchema): Promise<void> => {
    await localNotificationService.cancelNotification(notification.id);
    pending.value = pending.value.filter((item) => item.id !== notification.id);
  };

  const cancelAll = async (): Promise<void> => {
    await localNotificationService.cancelAllNotifications();
    pending.value = [];
  };

  const clearCache = (): void => {
    pending.value = [];
    isLoading.value = false;
  };

  return {
    pending,
    isLoading,
    loadPending,
    cancelPending,
    cancelAll,
    clearCache,
  };
});

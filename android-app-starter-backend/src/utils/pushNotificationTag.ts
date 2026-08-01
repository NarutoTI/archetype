/**
 * Tag da notificação Android usada como carona para o destino do push.
 *
 * Por que existe: no Android o app lê a bandeja com
 * `PushNotifications.getDeliveredNotifications()`, que devolve os extras da `StatusBarNotification`
 * — e esses extras **não** incluem o mapa `data` do FCM. O `data` só chega no toque direto
 * (`pushNotificationActionPerformed`). Quando o usuário abre o app pelo ícone com a notificação
 * ainda na bandeja, sem a tag não há como saber para onde navegar.
 *
 * Formato: `push:route:<rota percent-encoded>:<epoch ms>`
 * - a rota é o mesmo `data.routePath` do toque, então os dois caminhos abrem a mesma tela;
 * - o sufixo em ms mantém a tag única por disparo, para uma notificação não substituir a outra.
 *
 * ⚠️ Mantenha em sincronia com `android-app-starter/src/utils/pushNotificationTag.ts`.
 */

export const REMINDER_TAG_PREFIX = 'push:route:';

export function buildReminderPushNotificationTag(routePath: string, occurrenceAtMs: number): string {
  return `${REMINDER_TAG_PREFIX}${encodeURIComponent(routePath)}:${occurrenceAtMs}`;
}

/** Contraparte de leitura — usada nos testes; em produção quem lê é o app. */
export function routePathFromPushNotificationTag(tag: string | undefined | null): string | null {
  if (!tag || !tag.startsWith(REMINDER_TAG_PREFIX)) return null;

  const rest = tag.slice(REMINDER_TAG_PREFIX.length).replace(/:\d+$/, '');
  if (!rest) return null;

  try {
    const routePath = decodeURIComponent(rest);
    return routePath.startsWith('/') ? routePath : null;
  } catch {
    return null;
  }
}

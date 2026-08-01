/**
 * Leitura da tag de notificação Android no caminho "abriu pelo ícone".
 *
 * No Android, `PushNotifications.getDeliveredNotifications()` devolve os extras da
 * `StatusBarNotification` — que **não** incluem o mapa `data` do FCM (`routePath`, `taskId`, …).
 * O `data` só existe no toque direto (`pushNotificationActionPerformed`). Então, quando o usuário
 * abre o app pelo ícone com a notificação ainda na bandeja, o destino se perde e tudo cairia na
 * rota padrão.
 *
 * A saída é o backend mandar a rota na `android.notification.tag`, que o plugin devolve como
 * `tag`. Formato: `push:route:<rota percent-encoded>:<epoch ms>`.
 *
 * ⚠️ Mantenha em sincronia com `android-app-starter-backend/src/utils/pushNotificationTag.ts`.
 *
 * Tags antigas (`task-<id>-<ms>`) não são recuperáveis de propósito: elas carregavam o id do
 * documento, não a rota, e a tela de destino não era derivável dele sem regra de negócio aqui.
 * Notificações antigas na bandeja simplesmente caem no fallback de rota padrão, como antes.
 */

const REMINDER_TAG_PREFIX = 'push:route:';

export function routePathFromPushNotificationTag(tag: string | undefined | null): string | null {
  if (!tag || !tag.startsWith(REMINDER_TAG_PREFIX)) return null;

  // O sufixo de ms existe só para manter a tag única por disparo.
  const encodedRoute = tag.slice(REMINDER_TAG_PREFIX.length).replace(/:\d+$/, '');
  if (!encodedRoute) return null;

  try {
    const routePath = decodeURIComponent(encodedRoute);
    return routePath.startsWith('/') ? routePath : null;
  } catch {
    return null;
  }
}

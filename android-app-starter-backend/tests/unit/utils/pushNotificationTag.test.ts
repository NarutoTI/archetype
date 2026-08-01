import { describe, expect, it } from 'vitest';
import {
  buildReminderPushNotificationTag,
  routePathFromPushNotificationTag,
} from '../../../src/utils/pushNotificationTag.js';

/**
 * Contrato com android-app-starter/src/utils/pushNotificationTag.ts.
 *
 * A tag é o único lugar de onde o app consegue tirar o destino quando o usuário abre pelo ícone
 * com a notificação ainda na bandeja: no Android o `getDeliveredNotifications()` não devolve o
 * mapa `data` do FCM. Mudar o formato aqui sem mudar lá quebra esse caminho em silêncio.
 */
describe('pushNotificationTag', () => {
  it('gera a tag no formato que o app sabe ler', () => {
    expect(buildReminderPushNotificationTag('/tabs/tasks', 1_720_000_000_000))
      .toBe('push:route:%2Ftabs%2Ftasks:1720000000000');
  });

  it('faz round-trip de uma rota com id e query', () => {
    const routePath = '/tabs/tasks/42?from=push';
    const tag = buildReminderPushNotificationTag(routePath, 1_720_000_000_001);
    expect(routePathFromPushNotificationTag(tag)).toBe(routePath);
  });

  it('mantém a tag única por disparo', () => {
    const first = buildReminderPushNotificationTag('/tabs/tasks', 1_720_000_000_000);
    const second = buildReminderPushNotificationTag('/tabs/tasks', 1_720_000_060_000);
    expect(first).not.toBe(second);
  });

  it('ignora tag antiga e valores inválidos', () => {
    expect(routePathFromPushNotificationTag('task-abc-1720000000000')).toBeNull();
    expect(routePathFromPushNotificationTag(undefined)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { routePathFromPushNotificationTag } from '@/utils/pushNotificationTag';

// Contrato com android-app-starter-backend/src/utils/pushNotificationTag.ts. Mudar o formato
// lá sem mudar aqui quebra silenciosamente a abertura pelo ícone no Android.
describe('routePathFromPushNotificationTag', () => {
  it('recupera a rota da tag emitida pelo backend', () => {
    expect(routePathFromPushNotificationTag('push:route:%2Ftabs%2Ftasks:1720000000000'))
      .toBe('/tabs/tasks');
  });

  it('aceita rota com id e query percent-encoded', () => {
    const tag = `push:route:${encodeURIComponent('/tabs/tasks/42?from=push')}:1720000000000`;
    expect(routePathFromPushNotificationTag(tag)).toBe('/tabs/tasks/42?from=push');
  });

  it('tolera tag sem o sufixo de timestamp', () => {
    expect(routePathFromPushNotificationTag('push:route:%2Ftabs%2Ftasks')).toBe('/tabs/tasks');
  });

  it('ignora tag antiga, tag de teste, rota inválida e vazio', () => {
    expect(routePathFromPushNotificationTag('task-664a1b2c3d4e5f6a7b8c9d01-1720000000000')).toBeNull();
    expect(routePathFromPushNotificationTag('test-device-1')).toBeNull();
    expect(routePathFromPushNotificationTag('push:route:tabs%2Ftasks:1')).toBeNull(); // sem barra inicial
    expect(routePathFromPushNotificationTag(undefined)).toBeNull();
    expect(routePathFromPushNotificationTag('')).toBeNull();
  });

  it('não explode com percent-encoding quebrado', () => {
    expect(routePathFromPushNotificationTag('push:route:%E0%A4%A:1')).toBeNull();
  });
});

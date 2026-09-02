import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const present = vi.fn().mockResolvedValue(undefined);
  const onDidDismiss = vi.fn().mockResolvedValue({ role: 'cancel' });
  const create = vi.fn();
  return { present, onDidDismiss, create };
});

vi.mock('@ionic/vue', () => ({
  alertController: { create: hoisted.create },
  actionSheetController: { create: vi.fn() },
}));

vi.mock('@/i18n', () => ({
  default: {
    global: {
      t: vi.fn((key: string) => key),
    },
  },
}));

describe('alertService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.create.mockResolvedValue({
      present: hoisted.present,
      onDidDismiss: hoisted.onDidDismiss,
    });
  });

  it('aplica a classe de cor e o OK traduzido num alerta simples', async () => {
    const { alertService } = await import('@/services/alert.service');

    await alertService.presentAlertSuccess('Header', 'Message');

    expect(hoisted.create).toHaveBeenCalledTimes(1);
    const options = hoisted.create.mock.calls[0][0];
    expect(options).toMatchObject({
      header: 'Header',
      message: 'Message',
      cssClass: 'alert-success',
    });
    expect(options.buttons[0]).toMatchObject({
      text: 'common.ok',
      role: 'cancel',
      cssClass: 'alert-button-success',
    });
    expect(hoisted.present).toHaveBeenCalled();
  });

  /**
   * O Ionic mantém o alerta aberto enquanto o handler devolve uma promessa, e o botão
   * continua clicável. Num aparelho lento o duplo toque em "Excluir" dispara duas vezes.
   */
  describe('presentAlertConfirmWithColor: confirmar não reentrante', () => {
    const confirmButton = () => hoisted.create.mock.calls[0][0].buttons[1];

    it('ignora o segundo toque enquanto o primeiro está no ar', async () => {
      const { alertService } = await import('@/services/alert.service');
      let finishFirst: () => void = () => undefined;
      const confirmHandler = vi.fn(
        () => new Promise<void>((resolve) => { finishFirst = () => resolve(); }),
      );

      void alertService.presentAlertConfirmWithColor(
        'Header', 'Message', 'Excluir', 'Cancelar', confirmHandler,
      );
      await Promise.resolve();

      const confirm = confirmButton();
      void confirm.handler();
      await Promise.resolve();
      const second = await confirm.handler();

      expect(confirmHandler).toHaveBeenCalledTimes(1);
      expect(second).toBe(false);

      finishFirst();
    });

    it('volta a aceitar depois que a ação termina', async () => {
      const { alertService } = await import('@/services/alert.service');
      const confirmHandler = vi.fn().mockResolvedValue(undefined);

      void alertService.presentAlertConfirmWithColor(
        'Header', 'Message', 'Excluir', 'Cancelar', confirmHandler,
      );
      await Promise.resolve();

      const confirm = confirmButton();
      await confirm.handler();
      await confirm.handler();

      expect(confirmHandler).toHaveBeenCalledTimes(2);
    });
  });
});

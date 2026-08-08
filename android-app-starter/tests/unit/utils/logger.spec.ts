import { afterEach, describe, expect, it, vi } from 'vitest';

// O setup.ts mocka o logger para todo spec; este é o único que precisa do módulo real —
// é ele que testa o módulo.
vi.unmock('@/utils/logger');

import { logger } from '@/utils/logger';

describe('logger.simulatorDebugLog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sempre escreve em console.log com a tag entre colchetes', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logger.simulatorDebugLog('mytag', 'hello');

    expect(logSpy).toHaveBeenCalledOnce();
    expect(logSpy).toHaveBeenCalledWith('[mytag]', 'hello');
  });

  it('serializa objetos para a linha do logcat ficar legível', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logger.simulatorDebugLog('sim', 'state', { count: 2, ok: true });

    expect(logSpy).toHaveBeenCalledWith('[sim]', 'state', '{"count":2,"ok":true}');
  });

  it('continua logando com os logs desligados, ao contrário do logger.log', async () => {
    // É este o ponto do método: sobreviver ao build de produção, onde `logger.log` cala.
    vi.stubEnv('DEV', '');
    vi.stubEnv('VITE_ENABLE_LOGS', 'false');
    vi.resetModules();

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const { logger: prodLogger } = await vi.importActual<typeof import('@/utils/logger')>(
      '@/utils/logger'
    );

    prodLogger.log('escondido em produção');
    prodLogger.simulatorDebugLog('sim', 'visível no apk');

    expect(debugSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledOnce();
    expect(logSpy).toHaveBeenCalledWith('[sim]', 'visível no apk');

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('deixa o error passar mesmo com os logs desligados', async () => {
    vi.stubEnv('DEV', '');
    vi.stubEnv('VITE_ENABLE_LOGS', 'false');
    vi.resetModules();

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { logger: prodLogger } = await vi.importActual<typeof import('@/utils/logger')>(
      '@/utils/logger'
    );

    prodLogger.error('quebrou');

    expect(errorSpy).toHaveBeenCalledWith('quebrou');

    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

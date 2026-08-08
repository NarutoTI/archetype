import { describe, expect, it, vi } from 'vitest';
import * as mockedLogger from '@/utils/logger';

/**
 * O `tests/setup.ts` mocka `@/utils/logger` para todo spec, para que nenhum precise trazer o
 * próprio dublê. O que este spec protege é a **cobertura** do dublê: ele nasce do módulo
 * real, então uma função nova entra sozinha.
 *
 * Se alguém trocar isso por uma lista escrita à mão, o buraco aparece aqui — e não meses
 * depois, num spec sem relação, com `logger.<nível> is not a function` parecendo bug do
 * produto. Foi assim que um `logger.warn` num `catch` derrubou o spec de `signOut()`; e a
 * lista escrita à mão depois já nasceu velha quando o `simulatorDebugLog` entrou no logger.
 */
describe('setup dos testes — dublê global do logger', () => {
  it('espiona toda função do módulo real', async () => {
    const real = await vi.importActual<Record<string, Record<string, unknown>>>('@/utils/logger');
    const mocked = mockedLogger as unknown as Record<string, Record<string, unknown>>;

    const missing: string[] = [];
    for (const [exportName, exported] of Object.entries(real)) {
      for (const [key, value] of Object.entries(exported)) {
        if (typeof value !== 'function') continue;
        if (!vi.isMockFunction(mocked[exportName]?.[key])) missing.push(`${exportName}.${key}`);
      }
    }

    expect(missing).toEqual([]);
    // Guarda contra o inverso: um módulo vazio passaria no laço acima sem espionar nada.
    expect(vi.isMockFunction(mockedLogger.logger.warn)).toBe(true);
    expect(vi.isMockFunction(mockedLogger.logger.simulatorDebugLog)).toBe(true);
  });

  it('registra as chamadas, que é o que os specs afirmam', () => {
    mockedLogger.logger.error('falhou', { id: 1 });
    expect(mockedLogger.logger.error).toHaveBeenCalledWith('falhou', { id: 1 });
  });
});

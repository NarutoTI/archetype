/**
 * Dublês e ajudantes compartilhados pelos testes.
 *
 * Casa do que é **idêntico** em vários specs. O critério para algo morar aqui é ser a mesma
 * coisa em toda parte: um dublê que cada spec configura de um jeito (o `taskStore`, que vem
 * de um `vi.hoisted` para o próprio spec afirmar sobre ele) fica onde está — centralizar o
 * que varia troca duplicação por indireção, que é pior.
 */
import { vi } from 'vitest';

/**
 * Troca **toda** função exportada por um espião, mantendo a forma do módulo — inclusive as
 * funções dentro de objetos exportados (`logger.warn`).
 *
 * A entrada é o módulo real (`importOriginal`), e é isso que torna o dublê imune a desvio:
 * uma função nova já nasce mockada. Escrever a lista à mão é o que produziu o bug que
 * motivou isto — um `logger.warn` num `catch` derrubou o spec de `signOut()` com
 * `logger.warn is not a function`, erro com cara de bug do produto; e a lista escrita depois
 * já nasceu velha quando o `simulatorDebugLog` entrou no logger.
 *
 * Valores que não são função passam intactos (constantes, flags).
 */
export const mockModuleFunctions = <T extends Record<string, unknown>>(actual: T): T => {
  const spyIfFunction = (value: unknown): unknown =>
    typeof value === 'function' ? vi.fn() : value;

  const mocked: Record<string, unknown> = {};

  for (const [name, exported] of Object.entries(actual)) {
    if (typeof exported === 'function') {
      mocked[name] = vi.fn();
      continue;
    }

    // Objeto exportado (o caso do `logger`): espiona os métodos, preserva o resto.
    if (exported !== null && typeof exported === 'object' && !Array.isArray(exported)) {
      mocked[name] = Object.fromEntries(
        Object.entries(exported as Record<string, unknown>).map(([key, value]) => [
          key,
          spyIfFunction(value),
        ])
      );
      continue;
    }

    mocked[name] = exported;
  }

  return mocked as T;
};

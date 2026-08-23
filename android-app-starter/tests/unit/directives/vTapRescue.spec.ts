import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import { vTapRescue } from '@/directives/vTapRescue';

/**
 * A diretiva completa o `click` que o browser às vezes não sintetiza depois de um toque
 * limpo. Ver `docs/APP-CHROME-LAYOUT.md` § Toque perdido.
 *
 * O jsdom não tem `elementFromPoint`, e é ele quem escolhe o alvo — então cada teste instala
 * um duplo controlável. Isso também permite simular a janela em que o slide ainda cobre a
 * grade: basta devolver o próprio container.
 *
 * O relógio também é nosso: a diretiva mede duração de toque e teto de espera por
 * `performance.now()`, então `advance()` anda com o relógio e com os timers juntos. Sem isso
 * um timer "congelado" (app em segundo plano) seria impossível de simular.
 */

interface Handles {
  host: HTMLElement;
  cell: HTMLElement;
  clicks: string[];
}

const mountHost = () => {
  const clicks: string[] = [];

  const Host = defineComponent({
    directives: { tapRescue: vTapRescue },
    setup() {
      return () =>
        h('div', { class: 'host', onClick: () => clicks.push('host') }, [
          h('div', { class: 'cell', onClick: () => clicks.push('cell') }, 'dia')
        ]);
    }
  });

  const wrapper = mount(Host, {
    attachTo: document.body,
    global: { directives: { tapRescue: vTapRescue } }
  });

  // `mount` não aplica a diretiva sem `v-tap-rescue` no template; aplicamos na mão para
  // manter o teste focado no comportamento, não na sintaxe do template.
  const host = wrapper.element as HTMLElement;
  const cell = host.querySelector('.cell') as HTMLElement;
  vTapRescue.mounted?.(host, { value: undefined } as never, null as never, null as never);

  return { wrapper, handles: { host, cell, clicks } as Handles };
};

/** `elementFromPoint` controlado: decide o que está sob o dedo em cada instante. */
const stubHitTest = (resolve: () => Element | null) => {
  (document as unknown as { elementFromPoint: () => Element | null }).elementFromPoint = resolve;
};

/** Relógio da diretiva; `advance` mantém ele e os timers no mesmo instante. */
let now = 0;

const advance = (ms: number) => {
  now += ms;
  vi.advanceTimersByTime(ms);
};

const pointer = (type: string, init: Partial<PointerEvent> = {}, bubbles = true) =>
  Object.assign(new Event(type, { bubbles }), {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    clientX: 10,
    clientY: 10,
    ...init
  }) as unknown as PointerEvent;

/** Click de verdade: qualquer um que não seja o sintético da própria diretiva. */
const realClick = (target: HTMLElement) => {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
};

const tap = (host: HTMLElement, init: Partial<PointerEvent> = {}, holdMs = 0) => {
  host.dispatchEvent(pointer('pointerdown', init) as unknown as Event);
  if (holdMs) advance(holdMs);
  host.dispatchEvent(pointer('pointerup', init) as unknown as Event);
};

let handles: Handles;
let unmount: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const mounted = mountHost();
  handles = mounted.handles;
  unmount = () => mounted.wrapper.unmount();
  stubHitTest(() => handles.cell);
});

afterEach(() => {
  unmount();
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
});

describe('vTapRescue', () => {
  it('despacha o click que o browser não emitiu', () => {
    tap(handles.host);
    expect(handles.clicks).toEqual([]);

    advance(100);
    expect(handles.clicks).toEqual(['cell', 'host']);
  });

  it('não resgata quando o click real chegou antes da janela', () => {
    tap(handles.host);
    realClick(handles.cell);

    advance(500);
    // Só o click real: uma ativação, não duas.
    expect(handles.clicks.filter(c => c === 'cell')).toHaveLength(1);
  });

  it('resgata uma vez só, mesmo com o click real chegando atrasado', () => {
    tap(handles.host);
    advance(100);
    expect(handles.clicks.filter(c => c === 'cell')).toHaveLength(1);

    // Click real tardio: é duplicata do que já foi resgatado e tem de ser engolido.
    realClick(handles.cell);
    expect(handles.clicks.filter(c => c === 'cell')).toHaveLength(1);
  });

  it('espera a animação sair da frente antes de escolher o alvo', () => {
    // Enquanto o slide corre, o hit-test devolve o próprio container: alvo sem handler.
    stubHitTest(() => handles.host);

    tap(handles.host);
    advance(100);
    expect(handles.clicks).toEqual([]); // não despacha em cima do container

    stubHitTest(() => handles.cell);
    advance(60);
    expect(handles.clicks).toEqual(['cell', 'host']);
  });

  it('desiste quando a coordenada nunca vira um alvo utilizável', () => {
    stubHitTest(() => handles.host);

    tap(handles.host);
    advance(1000);
    expect(handles.clicks).toEqual([]);
  });

  it('ignora gesto que virou arrasto', () => {
    handles.host.dispatchEvent(pointer('pointerdown') as unknown as Event);
    handles.host.dispatchEvent(pointer('pointermove', { clientX: 200 }) as unknown as Event);
    handles.host.dispatchEvent(pointer('pointerup', { clientX: 200 }) as unknown as Event);

    advance(500);
    expect(handles.clicks).toEqual([]);
  });

  it('ignora gesto cancelado pelo browser', () => {
    handles.host.dispatchEvent(pointer('pointerdown') as unknown as Event);
    handles.host.dispatchEvent(pointer('pointercancel') as unknown as Event);
    handles.host.dispatchEvent(pointer('pointerup') as unknown as Event);

    advance(500);
    expect(handles.clicks).toEqual([]);
  });

  it('não interfere no mouse, onde o click é confiável', () => {
    tap(handles.host, { pointerType: 'mouse' });

    advance(500);
    expect(handles.clicks).toEqual([]);
  });

  it('atende caneta como toque', () => {
    tap(handles.host, { pointerType: 'pen' });

    advance(100);
    expect(handles.clicks).toEqual(['cell', 'host']);
  });

  it('ignora `pointerup` de um ponteiro que não é o rastreado', () => {
    handles.host.dispatchEvent(pointer('pointerdown', { pointerId: 1 }) as unknown as Event);
    handles.host.dispatchEvent(pointer('pointerup', { pointerId: 2 }) as unknown as Event);

    advance(500);
    expect(handles.clicks).toEqual([]);
  });

  it('não resgata gesto de dois dedos', () => {
    const second = { pointerId: 2, isPrimary: false };

    handles.host.dispatchEvent(pointer('pointerdown', { pointerId: 1 }) as unknown as Event);
    // Quem chega em segundo não é primário — e o browser também não daria click a ele.
    handles.host.dispatchEvent(pointer('pointerdown', second) as unknown as Event);
    handles.host.dispatchEvent(pointer('pointerup', second) as unknown as Event);
    handles.host.dispatchEvent(pointer('pointerup', { pointerId: 1 }) as unknown as Event);

    advance(500);
    expect(handles.clicks).toEqual([]);
  });

  it('resgata apesar do `pointerleave` que todo toque emite', () => {
    tap(handles.host);
    // Ordem normativa em aparelho sem hover: pointerup → pointerout → pointerleave. Registrar
    // um `reset` neles apagaria o timer recém-agendado e desligaria a diretiva em silêncio.
    //
    // Os dois vêm com ponteiro de verdade, e não como `Event` cru: assim a sentinela também
    // pega a implementação "cuidadosa", que filtraria por `pointerId` e passaria batido.
    handles.host.dispatchEvent(pointer('pointerout') as unknown as Event);
    handles.host.dispatchEvent(pointer('pointerleave', {}, false) as unknown as Event);
    advance(100);

    expect(handles.clicks).toEqual(['cell', 'host']);
  });

  it('se recupera de um gesto que nunca terminou', () => {
    // Sem `pointerup` nem `pointercancel`: o rastreio fica aberto.
    handles.host.dispatchEvent(pointer('pointerdown', { pointerId: 1 }) as unknown as Event);

    // O toque seguinte é primário como qualquer outro, e não pode ser lido como segundo dedo.
    tap(handles.host, { pointerId: 2 });
    advance(100);

    expect(handles.clicks).toEqual(['cell', 'host']);
  });

  it('ignora arrasto que não gerou `pointermove`', () => {
    handles.host.dispatchEvent(pointer('pointerdown', { clientX: 10 }) as unknown as Event);
    // Nenhum `pointermove` observado; só o deslocamento entre descer e subir denuncia.
    handles.host.dispatchEvent(pointer('pointerup', { clientX: 200 }) as unknown as Event);

    advance(500);
    expect(handles.clicks).toEqual([]);
  });

  it('ignora pressão longa: quem tratou a pressão já decidiu', () => {
    tap(handles.host, {}, 1500);

    advance(500);
    expect(handles.clicks).toEqual([]);
  });

  it('desiste quando o aparelho abre menu de contexto', () => {
    handles.host.dispatchEvent(pointer('pointerdown') as unknown as Event);
    // Em parte dos aparelhos o menu chega antes do teto de duração e antes do `pointerup`.
    handles.host.dispatchEvent(new Event('contextmenu', { bubbles: true }));
    handles.host.dispatchEvent(pointer('pointerup') as unknown as Event);

    advance(500);
    expect(handles.clicks).toEqual([]);
  });

  it('não despacha quando o timer acorda tarde demais', () => {
    tap(handles.host);
    // App em segundo plano: o timer congelou e só rodou segundos depois.
    now += 5000;
    vi.advanceTimersByTime(100);

    expect(handles.clicks).toEqual([]);
  });

  it('despacha um click com a cara de ponteiro', () => {
    let detail = -1;
    handles.cell.addEventListener('click', event => { detail = (event as MouseEvent).detail; });

    tap(handles.host);
    advance(100);

    // `detail: 0` seria ativação por teclado — e há guard de swipe que precisa distinguir.
    expect(detail).toBe(1);
  });

  it('para de escutar depois de desmontada', () => {
    vTapRescue.unmounted?.(handles.host, null as never, null as never, null as never);

    tap(handles.host);
    advance(500);
    expect(handles.clicks).toEqual([]);
  });
});

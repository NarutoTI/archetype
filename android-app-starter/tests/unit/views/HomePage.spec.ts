import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import HomePage from '@/views/HomePage.vue';
import homePageSource from '@/views/HomePage.vue?raw';
import tasksPageSource from '@/views/TasksPage.vue?raw';
import mediaPageSource from '@/views/MediaPage.vue?raw';
import notificationsPageSource from '@/views/NotificationsPage.vue?raw';
import menuViewSource from '@/views/MenuView.vue?raw';

const hoisted = vi.hoisted(() => ({ route: { path: '/tabs/tasks' } }));

/**
 * Plataforma controlável, porque ela decide o formato inicial da barra: flutuante no app,
 * encostada na web. Quase todo este arquivo exercita o formato flutuante, então o padrão
 * aqui é o app; o bloco da web liga o contrário. Sem isto, o jsdom pareceria web e a
 * suíte inteira testaria a barra encostada por acidente.
 */
const platformMock = vi.hoisted(() => ({ isNative: true }));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => platformMock.isNative },
  SystemBars: { setStyle: vi.fn(async () => {}) },
  SystemBarsStyle: { Dark: 'DARK', Light: 'LIGHT' },
}));

// A rota precisa ser reativa: o HomePage devolve a barra num `watch` sobre `route.path`, e um
// objeto comum nunca dispararia esse watch — o teste passaria por engano.
vi.mock('vue-router', async () => {
  const { reactive } = await import('vue');
  hoisted.route = reactive(hoisted.route);
  return { useRoute: () => hoisted.route };
});

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      tasks: { title: 'Tarefas' },
      media: { title: 'Mídia' },
      notifications: { title: 'Notificações' },
      common: { menu: 'Menu' },
    },
  },
});

const stubs = {
  IonPage: { template: '<div><slot /></div>' },
  IonTabs: { template: '<div class="tabs" :class="$attrs.class"><slot /></div>', inheritAttrs: false },
  IonRouterOutlet: { template: '<div />' },
  IonTabBar: { template: '<div class="tab-bar"><slot /></div>' },
  IonTabButton: { template: '<button><slot /></button>' },
  IonIcon: { template: '<span />' },
};

const mountHome = () => mount(HomePage, { global: { plugins: [i18n], stubs } });

describe('HomePage — abas', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    hoisted.route.path = '/tabs/tasks';
  });

  it('dá nome acessível a cada aba, já que o rótulo escrito saiu', () => {
    // Sem `ion-label` e sem `aria-label` o leitor de tela anuncia só "botão": a barra só de
    // ícones troca 8dp de altura por um nome que precisa vir de outro lugar.
    const wrapper = mountHome();

    const labels = wrapper.findAll('button').map((b) => b.attributes('aria-label'));
    expect(labels).toEqual(['Tarefas', 'Mídia', 'Notificações', 'Menu']);

    wrapper.unmount();
  });
});

describe('HomePage — formato da barra segue a preferência', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    platformMock.isNative = true;
  });

  it('nasce flutuante e volta a encostar quando a preferência é desligada', async () => {
    const { useSettingsStore } = await import('@/stores/settingsStore');
    const settings = useSettingsStore();

    const wrapper = mountHome();
    expect(wrapper.find('.tabs').classes()).toContain('tabs--floating');

    settings.bottomBarFloating = false;
    await nextTick();
    expect(wrapper.find('.tabs').classes()).not.toContain('tabs--floating');

    wrapper.unmount();
  });

  /**
   * O defeito que motivou a regra: no navegador o ponteiro não gera o gesto que revela a
   * pílula, então ela sumia depois de 2,5s e a página ficava **sem navegação nenhuma** até
   * um clique qualquer. Na web a barra nasce encostada, e a contagem nem chega a armar.
   */
  it('na web nasce encostada, e nenhuma contagem chega a esconder a navegação', async () => {
    platformMock.isNative = false;

    vi.useFakeTimers();
    try {
      const wrapper = mountHome();
      expect(wrapper.find('.tabs').classes()).not.toContain('tabs--floating');

      vi.advanceTimersByTime(5000);
      await nextTick();
      expect(wrapper.find('.tabs').classes()).not.toContain('tabs--chrome-hidden');

      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * Mexeu, aparece. Depois de 2,5s, some.
 *
 * Os ouvintes ficam na fase de captura para enxergar o app inteiro sem cancelar a ação do
 * elemento tocado e sem obrigar cada página a declarar o comportamento.
 */
describe('HomePage — toque ou rolagem mostra; 2,5s depois some', () => {
  const escondida = (wrapper: ReturnType<typeof mountHome>) =>
    wrapper.find('.tabs').classes().includes('tabs--chrome-hidden');

  const noCorpo = <T extends Element>(element: T): T => {
    document.body.appendChild(element);
    return element;
  };

  /** O jsdom não implementa PointerEvent; o código só usa o tipo e o caminho do evento. */
  const gestoEm = async (element: Element, type: 'pointerup' | 'pointercancel') => {
    const event = new Event(type, { bubbles: true, composed: true, cancelable: true });
    element.dispatchEvent(event);
    await nextTick();
    return event;
  };

  const regiaoIgnorada = () => {
    const region = noCorpo(document.createElement('div'));
    region.setAttribute('data-bottom-bar-reveal', 'ignore');
    return region;
  };

  beforeEach(() => {
    setActivePinia(createPinia());
    hoisted.route.path = '/tabs/tasks';
    // Todo este bloco é sobre o formato flutuante, que só nasce sozinho no app.
    platformMock.isNative = true;
    document.body.innerHTML = '';
  });

  it('volta ao fim de um toque', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mountHome();
      vi.advanceTimersByTime(2500);
      await nextTick();
      expect(escondida(wrapper)).toBe(true);

      const area = noCorpo(document.createElement('div'));
      await gestoEm(area, 'pointerup');
      expect(escondida(wrapper)).toBe(false);

      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('o início da rolagem devolve a barra quando o navegador manda `pointercancel`', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mountHome();
      vi.advanceTimersByTime(2500);
      await nextTick();
      expect(escondida(wrapper)).toBe(true);

      const area = noCorpo(document.createElement('div'));
      area.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
      await gestoEm(area, 'pointercancel');
      expect(escondida(wrapper)).toBe(false);

      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('o `pointercancel` inicia os 2,5s sem esperar um `pointerup`', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mountHome();
      vi.advanceTimersByTime(2500);
      await nextTick();
      expect(escondida(wrapper)).toBe(true);

      const area = noCorpo(document.createElement('div'));
      area.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
      await gestoEm(area, 'pointercancel');
      expect(escondida(wrapper)).toBe(false);

      vi.advanceTimersByTime(2499);
      await nextTick();
      expect(escondida(wrapper)).toBe(false);

      vi.advanceTimersByTime(1);
      await nextTick();
      expect(escondida(wrapper)).toBe(true);

      area.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
      await gestoEm(area, 'pointercancel');
      expect(escondida(wrapper)).toBe(false);

      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('o toque que devolve a barra também conclui o `click` do item', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mountHome();
      vi.advanceTimersByTime(2500);
      await nextTick();
      expect(escondida(wrapper)).toBe(true);

      const recebeuPointerUp = vi.fn();
      const abriu = vi.fn();
      const item = noCorpo(document.createElement('button'));
      item.addEventListener('pointerup', recebeuPointerUp);
      item.addEventListener('click', abriu);

      const inicio = new Event('pointerdown', { bubbles: true, composed: true, cancelable: true });
      const fim = new Event('pointerup', { bubbles: true, composed: true, cancelable: true });
      item.dispatchEvent(inicio);
      item.dispatchEvent(fim);
      item.click();
      await nextTick();

      expect(inicio.defaultPrevented).toBe(false);
      expect(fim.defaultPrevented).toBe(false);
      expect(recebeuPointerUp).toHaveBeenCalledTimes(1);
      expect(abriu).toHaveBeenCalledTimes(1);
      expect(escondida(wrapper)).toBe(false);

      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('eventos de rolagem isolados não devolvem a barra', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mountHome();
      vi.advanceTimersByTime(2500);
      await nextTick();
      expect(escondida(wrapper)).toBe(true);

      const area = noCorpo(document.createElement('div'));
      area.dispatchEvent(new Event('scroll'));
      area.dispatchEvent(new CustomEvent('ionScroll', {
        detail: { scrollTop: 100 },
        bubbles: true,
        composed: true,
      }));
      await nextTick();

      expect(escondida(wrapper)).toBe(true);
      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('registra os três ouvintes de ponteiro e nenhum de rolagem', () => {
    const addEventListener = vi.spyOn(document, 'addEventListener');
    const wrapper = mountHome();
    const eventTypes = addEventListener.mock.calls.map(([type]) => type);

    expect(eventTypes).toContain('pointerdown');
    expect(eventTypes).toContain('pointerup');
    expect(eventTypes).toContain('pointercancel');
    expect(eventTypes).not.toContain('scroll');
    expect(eventTypes).not.toContain('ionScroll');

    wrapper.unmount();
    addEventListener.mockRestore();
  });

  it('fica visível por 2,5s depois da montagem', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mountHome();

      vi.advanceTimersByTime(2499);
      await nextTick();
      expect(escondida(wrapper)).toBe(false);

      vi.advanceTimersByTime(1);
      await nextTick();
      expect(escondida(wrapper)).toBe(true);

      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('o `pointerdown` segura a contagem até o `pointerup`', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mountHome();
      const area = noCorpo(document.createElement('div'));

      vi.advanceTimersByTime(2400);
      area.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
      vi.advanceTimersByTime(5000);
      await nextTick();
      expect(escondida(wrapper)).toBe(false);

      await gestoEm(area, 'pointerup');
      vi.advanceTimersByTime(2499);
      await nextTick();
      expect(escondida(wrapper)).toBe(false);

      vi.advanceTimersByTime(1);
      await nextTick();
      expect(escondida(wrapper)).toBe(true);

      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ['toque', 'pointerup' as const],
    ['rolagem', 'pointercancel' as const],
  ])('região marcada não devolve a barra — nem por %s', async (_name, type) => {
    vi.useFakeTimers();
    try {
      const wrapper = mountHome();
      vi.advanceTimersByTime(2500);
      await nextTick();
      expect(escondida(wrapper)).toBe(true);

      const region = regiaoIgnorada();
      const recebeu = vi.fn();
      region.addEventListener(type, recebeu);
      region.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
      const event = await gestoEm(region, type);

      expect(recebeu).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(false);
      expect(escondida(wrapper)).toBe(true);

      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('o toque numa região marcada conclui o `click` sem devolver a barra', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mountHome();
      vi.advanceTimersByTime(2500);
      await nextTick();

      const agiu = vi.fn();
      const item = document.createElement('button');
      item.addEventListener('click', agiu);
      regiaoIgnorada().appendChild(item);

      const inicio = new Event('pointerdown', { bubbles: true, composed: true, cancelable: true });
      const fim = new Event('pointerup', { bubbles: true, composed: true, cancelable: true });
      item.dispatchEvent(inicio);
      item.dispatchEvent(fim);
      item.click();
      await nextTick();

      expect(inicio.defaultPrevented).toBe(false);
      expect(fim.defaultPrevented).toBe(false);
      expect(agiu).toHaveBeenCalledTimes(1);
      expect(escondida(wrapper)).toBe(true);

      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a marca vale para os descendentes, não só para o elemento marcado', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mountHome();
      vi.advanceTimersByTime(2500);
      await nextTick();

      const child = document.createElement('button');
      regiaoIgnorada().appendChild(child);
      await gestoEm(child, 'pointerup');

      expect(escondida(wrapper)).toBe(true);
      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('região marcada dá 2,5s completos à barra que já está visível', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mountHome();
      const region = regiaoIgnorada();

      vi.advanceTimersByTime(2400);
      region.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
      await gestoEm(region, 'pointerup');

      vi.advanceTimersByTime(2499);
      await nextTick();
      expect(escondida(wrapper)).toBe(false);

      vi.advanceTimersByTime(1);
      await nextTick();
      expect(escondida(wrapper)).toBe(true);

      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('um elemento fora da região marcada continua devolvendo a barra', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mountHome();
      vi.advanceTimersByTime(2500);
      await nextTick();

      regiaoIgnorada();
      const content = noCorpo(document.createElement('button'));
      await gestoEm(content, 'pointerup');

      expect(escondida(wrapper)).toBe(false);
      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('encostada, permanece visível e não arma a contagem', async () => {
    const { useSettingsStore } = await import('@/stores/settingsStore');
    useSettingsStore().bottomBarFloating = false;

    vi.useFakeTimers();
    try {
      const wrapper = mountHome();
      vi.advanceTimersByTime(5000);
      await nextTick();
      expect(escondida(wrapper)).toBe(false);

      document.dispatchEvent(new Event('pointercancel', { bubbles: true }));
      vi.advanceTimersByTime(5000);
      await nextTick();
      expect(escondida(wrapper)).toBe(false);

      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('desligar o formato flutuante devolve a barra escondida e cancela a contagem', async () => {
    const { useSettingsStore } = await import('@/stores/settingsStore');
    const settings = useSettingsStore();

    vi.useFakeTimers();
    try {
      const wrapper = mountHome();
      vi.advanceTimersByTime(2500);
      await nextTick();
      expect(escondida(wrapper)).toBe(true);

      settings.bottomBarFloating = false;
      await nextTick();
      expect(escondida(wrapper)).toBe(false);

      vi.advanceTimersByTime(5000);
      await nextTick();
      expect(escondida(wrapper)).toBe(false);

      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('uma rota nova mostra a barra e recomeça os 2,5s', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mountHome();
      vi.advanceTimersByTime(2500);
      await nextTick();
      expect(escondida(wrapper)).toBe(true);

      hoisted.route.path = '/tabs/menu';
      await nextTick();
      expect(escondida(wrapper)).toBe(false);

      vi.advanceTimersByTime(2499);
      await nextTick();
      expect(escondida(wrapper)).toBe(false);

      vi.advanceTimersByTime(1);
      await nextTick();
      expect(escondida(wrapper)).toBe(true);

      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ['TasksPage', tasksPageSource],
    ['MediaPage', mediaPageSource],
    ['NotificationsPage', notificationsPageSource],
    ['MenuView', menuViewSource],
  ])('%s não liga scroll-events só para controlar a barra', (_name, source) => {
    expect(source).not.toMatch(/scroll-events/);
  });

  it.each([
    ['TasksPage', tasksPageSource],
    ['MediaPage', mediaPageSource],
    ['NotificationsPage', notificationsPageSource],
  ])('%s reserva o espaço da pílula no conteúdo rolável', (_name, source) => {
    expect(source).toMatch(/<ion-content[^>]*scrolls-under-bar/);
  });

  it.each([
    ['TasksPage', tasksPageSource],
    ['MediaPage', mediaPageSource],
    ['NotificationsPage', notificationsPageSource],
    ['MenuView', menuViewSource],
  ])('%s marca o cabeçalho externo como região ignorada', (_name, source) => {
    expect(source).toMatch(/<ion-header[^>]*data-bottom-bar-reveal="ignore"/);
  });

  it('marca uma vez o rodapé da versão e não repete o atributo nos filhos', () => {
    expect(menuViewSource).toMatch(
      /<ion-footer[^>]*data-bottom-bar-reveal="ignore"/,
    );
    expect(menuViewSource.match(/data-bottom-bar-reveal="ignore"/g) ?? []).toHaveLength(2);
    expect(menuViewSource).toMatch(
      /<ion-content[^>]*:class="\{ 'scrolls-under-bar': !bundleLabel && !appVersion \}"/,
    );
  });
});

/**
 * CSS puro, que o jsdom nunca aplica — e tanto o rail quanto a pílula só aparecem no
 * aparelho (girado, ou com a preferência ligada). Estes invariantes existem porque o rail
 * quebrou duas vezes ali no app que originou esta moldura, sem que nenhum teste de
 * comportamento pudesse notar.
 *
 * Ver docs/APP-CHROME-LAYOUT.md.
 */
const RAIL_QUERY = '@media (orientation: landscape) and (max-height: 600px)';
const FLOATING_QUERY = '@media not all and (orientation: landscape) and (max-height: 600px)';

/** Índice do `}` que fecha o bloco aberto a partir de `from`. */
const closingBraceOf = (source: string, from: number): number => {
  let depth = 0;
  for (let i = source.indexOf('{', from); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}' && (depth -= 1) === 0) return i;
  }
  return source.length;
};

describe('HomePage — moldura da barra inferior', () => {
  const railBlock =
    homePageSource.match(/@media \(orientation: landscape\)[\s\S]*?\n\}\n/)?.[0] ?? '';
  const floatingBar =
    homePageSource.match(/\.tabs--floating ion-tab-bar \{[^}]*\}/)?.[0] ?? '';

  it('baixa a barra para 48px fora de qualquer media query (retrato também)', () => {
    const base = homePageSource.match(/^ion-tab-bar \{[^}]*\}/m)?.[0] ?? '';

    // `height`, não `--height`: o Ionic fixa 56px no `:host` e não expõe custom property.
    expect(base).toMatch(/height:\s*48px/);
    expect(base).not.toMatch(/--height/);
  });

  it('neutraliza os insets que o Ionic aplica no eixo errado quando a barra deita', () => {
    // O `:host` do ion-tab-bar aplica padding-left/right/bottom da safe area com
    // `box-sizing: content-box !important`: cada um SOMA à largura. De pé, só o de baixo é
    // real; deitada, só o da borda inicial. Deixar o da direita passar soma a barra de
    // navegação do sistema à largura do rail sem entrar em `--rail-width`.
    expect(railBlock).toMatch(/padding-bottom:\s*0/);
    expect(railBlock).toMatch(/padding-inline-end:\s*0/);
    expect(railBlock).toMatch(/padding-inline-start:\s*var\(--ion-safe-area-left/);
  });

  it('recua o outlet exatamente a largura que o rail ocupa', () => {
    // A largura mora numa custom property no ion-tabs porque o outlet é filho light dele e
    // herda — é o que impede os dois de saírem de sincronia.
    expect(railBlock).toMatch(/--rail-width:\s*calc\(48px \+ var\(--ion-safe-area-left/);
    expect(railBlock).toMatch(/ion-router-outlet \{\s*inset-inline-start:\s*var\(--rail-width\)/);

    const bar = railBlock.match(/ion-tab-bar \{[^}]*\}/)?.[0] ?? '';
    expect(bar).toMatch(/width:\s*48px/);
  });

  it('mantém o rail fora do fluxo — virar o eixo do flex deixa a tela em branco', () => {
    // O IonTabs do @ionic/vue escreve `flex-direction: column` no style INLINE do host, e
    // inline vence folha de estilo: a barra fica com 100% da altura e o conteúdo com 0.
    const bar = railBlock.match(/ion-tab-bar \{[^}]*\}/)?.[0] ?? '';
    expect(bar).toMatch(/position:\s*absolute/);
    expect(bar).toMatch(/height:\s*auto/);
  });

  it('flutuando, o outlet recua o inset do sistema — e nada além dele', () => {
    // Duas regressões opostas moram nesta linha. Recuar a barra inteira devolve a faixa que
    // lê como rodapé, que é o que o formato flutuante não pode parecer. Não recuar nada põe o
    // conteúdo debaixo da barra de navegação do Android: encostada, o `ion-tab-bar` segurava
    // esse inset para a página toda; fora do fluxo, ninguém segura. O `ion-footer` não cobre
    // (desliga o próprio inset quando existe um `ion-tab-bar slot="bottom"`) e o
    // `ion-content` só ganha o dele dentro de modal.
    const outlet =
      homePageSource.match(/\.tabs--floating ion-router-outlet \{[^}]*\}/)?.[0] ?? '';
    expect(outlet).toMatch(/inset-block-end:\s*var\(--ion-safe-area-bottom, 0px\);/);
    expect(outlet).not.toMatch(/--bar-inset|--bar-height|--bar-cover/);

    expect(floatingBar).toMatch(/position:\s*absolute/);
    expect(floatingBar).toMatch(/border-radius:/);
  });

  it('publica a medida da pílula como variável herdada', () => {
    // Custom property no `<ion-tabs>`: tudo dentro das abas é descendente dele e herda,
    // então uma tela reserva espaço sem saber qual formato está ativo. `--bar-inset` só
    // existe flutuando — encostada, todo `var(…, 0px)` do app zera sozinho.
    const floatingVars = homePageSource.match(/\.tabs--floating \{[^}]*\}/)?.[0] ?? '';
    expect(floatingVars).toMatch(/--bar-inset:/);
    expect(floatingVars).toMatch(/--bar-cover:\s*var\(--bar-inset\)/);
    expect(homePageSource.match(/--bar-inset:/g) ?? []).toHaveLength(1);

    const hiddenVars =
      homePageSource.match(/\.tabs--floating\.tabs--chrome-hidden \{[^}]*\}/)?.[0] ?? '';
    expect(hiddenVars).toMatch(/--bar-cover:\s*0px/);
    expect(hiddenVars).not.toMatch(/--bar-inset/);
    expect(menuViewSource).toMatch(
      /\.menu-version-footer ion-toolbar \{[\s\S]*?padding-bottom:\s*var\(--bar-cover, 0px\)/,
    );
  });

  it('centraliza a pílula por margem automática, não por transform', () => {
    // O transform já é do esconder; somar a centralização ali deixaria a saída da
    // pílula dependente da conta de centro.
    expect(floatingBar).toMatch(/inset-inline:\s*0/);
    expect(floatingBar).toMatch(/margin-inline:\s*auto/);
  });

  it('solta o size containment do Ionic, ou a pílula colapsa para zero', () => {
    // O `:host` do ion-tab-bar traz `contain: strict`, e o `size` dali dimensiona o elemento
    // **como se não tivesse conteúdo** — e com isso `fit-content` resolve para zero.
    // Invisível no jsdom e no desktop: só apareceria com a preferência ligada, no aparelho.
    expect(floatingBar).toMatch(/contain:\s*layout paint style/);
    expect(floatingBar).toMatch(/width:\s*fit-content/);
  });

  it('só deixa a barra sair de cena no formato flutuante', () => {
    // Encostada, a barra ocupa espaço no fluxo e precisa ficar sempre visível. O seletor
    // exige as duas classes justamente para isso.
    const hidden = homePageSource.match(
      /\.tabs--floating\.tabs--chrome-hidden ion-tab-bar \{[^}]*\}/
    )?.[0] ?? '';
    expect(hidden).toMatch(/transform:\s*translateY/);
    // Fora de cena não pode continuar clicável.
    expect(hidden).toMatch(/pointer-events:\s*none/);
  });

  it('deitado o flutuante não existe — o bloco dele é o complemento exato do rail', () => {
    // Ordem no arquivo NÃO resolve isto: o bloco de paisagem seleciona `ion-tab-bar` cru
    // (0,0,1) e perde para `.tabs--floating ion-tab-bar` (0,1,1) — media query não soma
    // especificidade. Sem a separação, o rail herdava `fit-content`, `margin-inline: auto` e
    // o `translateY` do esconder: uma pílula deitada que sumia sozinha e levava a
    // navegação junto.
    const style = homePageSource.slice(homePageSource.indexOf('<style scoped>'));
    const start = style.indexOf(FLOATING_QUERY);
    expect(start).toBeGreaterThan(-1);
    expect(style).toContain(RAIL_QUERY);

    // Nenhuma regra do formato flutuante pode morar fora dele (menções em comentário são no
    // meio da linha; seletor de verdade abre a linha).
    const end = closingBraceOf(style, start);
    for (const match of style.matchAll(/^[ \t]*\.tabs--floating/gm)) {
      expect(match.index).toBeGreaterThan(start);
      expect(match.index).toBeLessThan(end);
    }

    const bar = railBlock.match(/ion-tab-bar \{[^}]*\}/)?.[0] ?? '';
    expect(bar).toMatch(/inset-inline-start:\s*0/);
  });
});

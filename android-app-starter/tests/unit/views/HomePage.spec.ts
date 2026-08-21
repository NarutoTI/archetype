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
});

/**
 * Esconder ao rolar: um ouvinte só, na fase de captura, em vez de um por tela. Evento de
 * scroll não borbulha, mas passa pela captura — então o documento vê a rolagem de qualquer
 * elemento do light DOM sem que nenhuma página declare nada.
 */
describe('HomePage — moldura some ao rolar', () => {
  const scroller = () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return el;
  };

  const scrollTo = async (el: HTMLElement, top: number) => {
    Object.defineProperty(el, 'scrollTop', { value: top, configurable: true });
    el.dispatchEvent(new Event('scroll', { bubbles: false }));
    await nextTick();
  };

  /** O que o `ion-content` emite: `scrollTop` no detail, não no alvo. */
  const ionScrollTo = async (el: HTMLElement, top: number) => {
    el.dispatchEvent(new CustomEvent('ionScroll', {
      detail: { scrollTop: top },
      bubbles: true,
      composed: true,
    }));
    await nextTick();
  };

  beforeEach(() => {
    setActivePinia(createPinia());
    hoisted.route.path = '/tabs/tasks';
    document.body.innerHTML = '';
  });

  it('esconde ao descer e devolve ao subir', async () => {
    const wrapper = mountHome();
    const el = scroller();

    await scrollTo(el, 400);
    expect(wrapper.find('.tabs').classes()).toContain('tabs--chrome-hidden');

    await scrollTo(el, 300);
    expect(wrapper.find('.tabs').classes()).not.toContain('tabs--chrome-hidden');

    wrapper.unmount();
  });

  it('fica visível no topo, por menor que seja a rolagem', async () => {
    const wrapper = mountHome();
    const el = scroller();

    await scrollTo(el, 40);
    expect(wrapper.find('.tabs').classes()).not.toContain('tabs--chrome-hidden');

    wrapper.unmount();
  });

  it('ignora tremor de dedo parado', async () => {
    const wrapper = mountHome();
    const el = scroller();

    await scrollTo(el, 400);
    expect(wrapper.find('.tabs').classes()).toContain('tabs--chrome-hidden');

    // Menor que SCROLL_DELTA_PX: sem o limiar a barra piscaria com o dedo parado.
    await scrollTo(el, 396);
    expect(wrapper.find('.tabs').classes()).toContain('tabs--chrome-hidden');

    wrapper.unmount();
  });

  it('vê a rolagem que acontece dentro do shadow DOM, via ionScroll', async () => {
    // O `scroll` nativo do `.inner-scroll` não é `composed` e nunca sai do shadow: sem o
    // `ionScroll` (e sem `scroll-events` na página) a tela rolava com a barra parada.
    const wrapper = mountHome();
    const el = scroller();

    await ionScrollTo(el, 400);
    expect(wrapper.find('.tabs').classes()).toContain('tabs--chrome-hidden');

    wrapper.unmount();
  });

  /**
   * Uma tira de rodapé que devolve o espaço quando a barra some não rola, mas divide a coluna
   * flex com quem rola: encolhê-la faz o scroller crescer, o navegador corrige o `scrollTop`
   * para caber no novo máximo, e essa correção era lida como "o usuário subiu" — a barra
   * voltava e a inércia recomeçava tudo, com a tela tremendo no fim da rolagem.
   */
  it('não esconde nada com a barra encostada', async () => {
    const { useSettingsStore } = await import('@/stores/settingsStore');
    useSettingsStore().bottomBarFloating = false;

    const wrapper = mountHome();
    const el = scroller();

    await scrollTo(el, 400);
    expect(wrapper.find('.tabs').classes()).not.toContain('tabs--chrome-hidden');

    wrapper.unmount();
  });

  it('sai de cena sozinha depois de um tempo parada, e volta ao fim do toque', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mountHome();
      expect(wrapper.find('.tabs').classes()).not.toContain('tabs--chrome-hidden');

      vi.advanceTimersByTime(5000);
      await nextTick();
      expect(wrapper.find('.tabs').classes()).toContain('tabs--chrome-hidden');

      // O começo do toque NÃO devolve a barra: ela subiria embaixo do dedo no meio do gesto,
      // deslocando o que estiver embaixo — o dedo pousa num controle e levanta sobre a aba
      // que subiu no lugar dele. Só o fim do gesto devolve, com o alvo do clique decidido.
      document.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      await nextTick();
      expect(wrapper.find('.tabs').classes()).toContain('tabs--chrome-hidden');

      document.dispatchEvent(new Event('pointerup', { bubbles: true }));
      await nextTick();
      expect(wrapper.find('.tabs').classes()).not.toContain('tabs--chrome-hidden');

      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('um arrasto que vira rolagem também devolve a barra', async () => {
    vi.useFakeTimers();
    try {
      const wrapper = mountHome();
      vi.advanceTimersByTime(5000);
      await nextTick();
      expect(wrapper.find('.tabs').classes()).toContain('tabs--chrome-hidden');

      // O navegador assume o gesto e o `pointerup` nunca chega: só o `pointercancel`.
      document.dispatchEvent(new Event('pointercancel', { bubbles: true }));
      await nextTick();
      expect(wrapper.find('.tabs').classes()).not.toContain('tabs--chrome-hidden');

      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('encostada, não some por inatividade', async () => {
    const { useSettingsStore } = await import('@/stores/settingsStore');
    useSettingsStore().bottomBarFloating = false;

    vi.useFakeTimers();
    try {
      const wrapper = mountHome();
      vi.advanceTimersByTime(5000);
      await nextTick();

      expect(wrapper.find('.tabs').classes()).not.toContain('tabs--chrome-hidden');

      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('tela nova nunca começa sem navegação', async () => {
    const wrapper = mountHome();
    const el = scroller();

    await scrollTo(el, 400);
    expect(wrapper.find('.tabs').classes()).toContain('tabs--chrome-hidden');

    hoisted.route.path = '/tabs/menu';
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.tabs').classes()).not.toContain('tabs--chrome-hidden');

    wrapper.unmount();
  });

  /**
   * O teste do `ionScroll` acima dispara o evento na mão e por isso não diz nada sobre quem o
   * emite — e o `ion-content` só emite com `scroll-events` ligado. Sem o atributo, a tela
   * rola com a barra parada, em silêncio. Não dá para verificar montando as telas (o jsdom
   * não roda o Ionic), então o atributo é conferido no fonte de cada aba.
   */
  it.each([
    ['TasksPage', tasksPageSource],
    ['MediaPage', mediaPageSource],
    ['NotificationsPage', notificationsPageSource],
    ['MenuView', menuViewSource],
  ])('%s liga scroll-events e reserva o espaço da pílula', (_name, source) => {
    expect(source).toMatch(/<ion-content[^>]*:scroll-events="true"/);
    expect(source).toMatch(/<ion-content[^>]*scrolls-under-bar/);
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
    expect(homePageSource.match(/--bar-inset:/g) ?? []).toHaveLength(1);
  });

  it('centraliza a pílula por margem automática, não por transform', () => {
    // O transform já é do esconder-ao-rolar; somar a centralização ali deixaria a saída da
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

  it('esconde a barra ao rolar, e só no formato flutuante', () => {
    // Encostada, a barra ocupa espaço no fluxo: escondê-la exigiria refazer o layout a cada
    // scroll. O seletor exige as duas classes justamente para isso.
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
    // o `translateY` do esconder-ao-rolar: uma pílula deitada que sumia sozinha e levava a
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

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import HomePage from '@/views/HomePage.vue';
import homePageSource from '@/views/HomePage.vue?raw';

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
  IonTabs: { template: '<div><slot /></div>' },
  IonRouterOutlet: { template: '<div />' },
  IonTabBar: { template: '<div><slot /></div>' },
  IonTabButton: { template: '<button><slot /></button>' },
  IonIcon: { template: '<span />' },
};

describe('HomePage — abas', () => {
  it('dá nome acessível a cada aba, já que o rótulo escrito saiu', () => {
    // Sem `ion-label` e sem `aria-label` o leitor de tela anuncia só "botão": a barra só de
    // ícones troca 8dp de altura por um nome que precisa vir de outro lugar.
    const wrapper = mount(HomePage, { global: { plugins: [i18n], stubs } });

    const labels = wrapper.findAll('button').map((b) => b.attributes('aria-label'));
    expect(labels).toEqual(['Tarefas', 'Mídia', 'Notificações', 'Menu']);

    wrapper.unmount();
  });
});

/**
 * CSS puro, que o jsdom nunca aplica — e o rail em paisagem é justamente o que só aparece
 * no aparelho girado, com barra de navegação e recorte de câmera nas laterais. Estes
 * invariantes existem porque o rail quebrou duas vezes ali no app que originou este cromo,
 * sem que nenhum teste de comportamento pudesse notar.
 *
 * Ver docs/APP-CHROME-LAYOUT.md.
 */
describe('HomePage — cromo da barra inferior', () => {
  const railBlock =
    homePageSource.match(/@media \(orientation: landscape\)[\s\S]*?\n\}\n/)?.[0] ?? '';

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
});

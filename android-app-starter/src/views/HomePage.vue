<template>
  <ion-page>
    <ion-tabs
      :class="{
        'tabs--floating': settingsStore.bottomBarFloating,
        'tabs--chrome-hidden': chromeHidden,
      }"
    >
      <ion-router-outlet animated="false" />

      <!-- Barra só de ícones: o rótulo escrito custava 8dp de altura em toda tela do app.
           O `aria-label` é obrigatório aqui — sem o `ion-label` o botão fica sem nome
           acessível e o leitor de tela anuncia só "botão". -->
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="tasks" href="/tabs/tasks" :aria-label="$t('tasks.title')">
          <ion-icon :icon="checkboxOutline" />
        </ion-tab-button>

        <ion-tab-button tab="media" href="/tabs/media" :aria-label="$t('media.title')">
          <ion-icon :icon="imagesOutline" />
        </ion-tab-button>

        <ion-tab-button
          tab="notifications"
          href="/tabs/notifications"
          :aria-label="$t('notifications.title')"
        >
          <ion-icon :icon="notificationsOutline" />
        </ion-tab-button>

        <ion-tab-button tab="menu" href="/tabs/menu" :aria-label="$t('common.menu')">
          <ion-icon :icon="menuOutline" />
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  </ion-page>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  IonIcon,
  IonPage,
  IonRouterOutlet,
  IonTabBar,
  IonTabButton,
  IonTabs,
} from '@ionic/vue';
import { checkboxOutline, imagesOutline, menuOutline, notificationsOutline } from 'ionicons/icons';
import { useRoute } from 'vue-router';
import { useSettingsStore } from '@/stores/settingsStore';

const route = useRoute();
const settingsStore = useSettingsStore();

/** Movimento mínimo para reagir. Sem isto, o tremor do dedo parado faz a barra piscar. */
const SCROLL_DELTA_PX = 10;

/**
 * Abaixo disto a barra fica sempre visível: no topo da lista não há o que ganhar
 * escondendo, e some o caso irritante de a barra sumir no primeiro milímetro de rolagem.
 */
const ALWAYS_VISIBLE_ABOVE_PX = 56;

/** Tempo parado até a barra sair de cena sozinha. */
const IDLE_HIDE_MS = 2500;

/** Barra fora de cena (só no formato flutuante — ver o CSS). */
const chromeHidden = ref(false);
let lastScrollTop = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

const clearIdleTimer = () => {
  if (idleTimer === null) return;
  clearTimeout(idleTimer);
  idleTimer = null;
};

/**
 * Mostra a barra e reinicia a contagem de inatividade. Chamada por qualquer sinal de que o
 * usuário está ali: toque, arrasto, rolagem para cima, troca de tela.
 */
const showChrome = () => {
  chromeHidden.value = false;
  clearIdleTimer();
  if (!settingsStore.bottomBarFloating) return;
  idleTimer = setTimeout(() => { chromeHidden.value = true; }, IDLE_HIDE_MS);
};

const hideChrome = () => {
  clearIdleTimer();
  chromeHidden.value = true;
};

/**
 * `scrollTop` da rolagem, venha ela de onde vier.
 *
 * São **duas** origens porque o `scroll` nativo não é `composed`: ele não sai do shadow DOM.
 * Quem rola um elemento do light DOM é visto pela captura no documento; quem rola o próprio
 * `ion-content` rola o `.inner-scroll` de dentro do shadow, e só aparece pelo `ionScroll` —
 * evento do Stencil, esse sim `composed`, e que exige `scroll-events` ligado no
 * `ion-content`. Toda tela de aba liga o atributo: é mais barato que descobrir uma por uma
 * que a barra ficou parada, porque a falha é silenciosa (a tela rola, nada quebra).
 */
const scrollTopOf = (event: Event): number | null => {
  const detail = (event as CustomEvent<{ scrollTop?: number }>).detail;
  if (detail && typeof detail.scrollTop === 'number') return detail.scrollTop;

  const target = event.target as HTMLElement | null;
  return target && typeof target.scrollTop === 'number' ? target.scrollTop : null;
};

const onAnyScroll = (event: Event) => {
  if (!settingsStore.bottomBarFloating) return;

  const top = scrollTopOf(event);
  if (top === null) return;

  const delta = top - lastScrollTop;
  if (Math.abs(delta) < SCROLL_DELTA_PX) return;

  lastScrollTop = top;
  if (delta > 0 && top > ALWAYS_VISIBLE_ABOVE_PX) hideChrome();
  else showChrome();
};

/**
 * Toque em qualquer lugar traz a barra de volta — inclusive o fim de um arrasto.
 *
 * É o **fim** do gesto (`pointerup`), e não o começo. Voltando no `pointerdown`, a pílula
 * sobe embaixo do dedo no meio do toque, e qualquer tira que a página desenhe no rodapé se
 * desloca junto: o dedo pousa num controle e levanta sobre a aba que subiu no lugar dele.
 * No fim do gesto o alvo do clique já está decidido.
 *
 * `pointercancel` entra junto porque um arrasto que vira rolagem nem sempre termina em
 * `pointerup`.
 */
const onAnyPointerEnd = () => {
  if (!settingsStore.bottomBarFloating) return;
  showChrome();
};

const resetChrome = () => {
  lastScrollTop = 0;
  showChrome();
};

// Tela nova nunca começa sem navegação, e desligar a preferência devolve a barra na hora.
watch(() => route.path, resetChrome);
watch(() => settingsStore.bottomBarFloating, resetChrome);

onMounted(() => {
  document.addEventListener('scroll', onAnyScroll, true);
  document.addEventListener('ionScroll', onAnyScroll, true);
  document.addEventListener('pointerup', onAnyPointerEnd, true);
  document.addEventListener('pointercancel', onAnyPointerEnd, true);
  showChrome();
});

onBeforeUnmount(() => {
  document.removeEventListener('scroll', onAnyScroll, true);
  document.removeEventListener('ionScroll', onAnyScroll, true);
  document.removeEventListener('pointerup', onAnyPointerEnd, true);
  document.removeEventListener('pointercancel', onAnyPointerEnd, true);
  clearIdleTimer();
});
</script>

<style scoped>
/* Moldura do app — ver docs/APP-CHROME-LAYOUT.md.
   Superfície neutra com o primary só no item ativo (Material 3): a faixa saturada embaixo
   emoldurava o conteúdo e fazia a tela parecer menor do que é.
   A altura é `height`, não uma custom property: o Ionic fixa 56px no `:host` do componente
   e não expõe `--height`. Regra externa vence o `:host` sem `!important`. */
ion-tab-bar {
  height: 48px;
  --background: var(--ion-background-color, #fff);
  --color: var(--ion-color-medium);
  --color-selected: var(--ion-color-primary);
}

ion-tab-button {
  --color: var(--ion-color-medium);
  --color-selected: var(--ion-color-primary);
}

/* O formato flutuante só existe onde NÃO existe rail: deitado a barra vai para a lateral, e
   uma pílula centralizada embaixo não faria sentido no eixo que já falta.

   Precisa ser uma media query, e não a ordem no arquivo: o bloco de paisagem seleciona
   `ion-tab-bar` cru (0,0,1) e perderia para `.tabs--floating ion-tab-bar` (0,1,1) — media
   query não soma especificidade. Sem a separação, com o flutuante ligado (o padrão), o rail
   herdaria `width: fit-content`, `margin-inline: auto` e o `translateY` do esconder-ao-rolar:
   viraria uma pílula deitada que some sozinha depois da inatividade, levando a navegação
   junto.

   A condição é o complemento exato da do rail. Escrita na forma `not all and (...)`, que é a
   que todo WebView entende — `not (...)` com parênteses é sintaxe de Media Queries 4.

   De quebra, `--bar-inset` deixa de existir deitado, e quem a consome cai no `var(…, 0px)`:
   some a faixa reservada embaixo para uma barra que ali não está. */
@media not all and (orientation: landscape) and (max-height: 600px) {
  /* A barra vira uma pílula solta: encolhe para o tamanho do conteúdo, ganha raio e sombra,
     sai do fluxo e **passa a cobrir o conteúdo** — a tela vai até a borda de baixo, sem
     faixa reservada. Recuar o outlet deixaria sobrando uma faixa que lê como rodapé, que é
     exatamente o que um formato flutuante não deve parecer.

     Quem rola termina acima da pílula por `--bar-inset`, consumido uma vez em
     `theme/global.css` (a classe `.scrolls-under-bar`). Uma tela que preencha a altura sem
     rolar fica com o canto de baixo debaixo da pílula: é o preço do formato.

     Se alguma página desenhar uma tira fixa no próprio rodapé, publique aqui uma segunda
     variável que acompanhe o esconder (`--bar-cover`, zerada em `.tabs--chrome-hidden`) e
     consuma ela ali. `--bar-inset` tem de ficar **constante** para quem rola: encolher um
     scroller no meio da rolagem faz o navegador corrigir o `scrollTop`, e o conteúdo pula. */
  .tabs--floating {
    --bar-height: 48px;
    --bar-gap: 10px;
    --bar-inset: calc(var(--bar-height) + var(--bar-gap) * 2);
  }

  /* O inset do sistema volta para a página — e **só** ele.
     Encostada, a barra segurava esse espaço para todo mundo: ficava abaixo do conteúdo na
     coluna flex do `ion-tabs`, com `padding-bottom: var(--ion-safe-area-bottom)` no próprio
     `:host`. Fora do fluxo, sumiu — e o conteúdo passa a correr por baixo da barra de
     navegação do Android. Nada cobre isso sozinho: o `ion-content` só ganha inset inferior
     dentro de modal, e o `ion-footer` **desliga** o dele de propósito quando existe um
     `ion-tab-bar slot="bottom"` (`footer-toolbar-padding`) — a pílula ainda é um.

     Recuar o inset é diferente de recuar a barra inteira, que deixaria uma faixa lendo como
     rodapé: este espaço não é faixa, é onde a barra do sistema já desenha por cima. Com ele
     de volta, `--bar-inset` volta a ser medido do lugar certo. */
  .tabs--floating ion-router-outlet {
    inset-block-end: var(--ion-safe-area-bottom, 0px);
  }

  .tabs--floating ion-tab-bar {
    position: absolute;
    inset-block-end: calc(var(--bar-gap) + var(--ion-safe-area-bottom, 0px));
    /* Centralizada: as duas insets em zero + `margin-inline: auto` sobre uma largura de
       conteúdo. Preferido a `left: 50%` + `translateX(-50%)` porque o transform já é do
       esconder-ao-rolar — somar os dois deixaria a saída da pílula dependente da conta de
       centralização. */
    inset-inline: 0;
    width: fit-content;
    margin-inline: auto;
    /* O Ionic declara `contain: strict` no `:host`, e o `size` dali dimensiona o elemento
       **como se não tivesse conteúdo**. Fora do fluxo, a largura é shrink-to-fit sobre o
       conteúdo — que a contenção zera: a pílula colapsaria para 0. Mantemos
       layout/paint/style (o paint ainda recorta os botões no raio) e soltamos o size. */
    contain: layout paint style;
    /* O `:host` do Ionic soma os insets do sistema por fora (`box-sizing: content-box`);
       fora do fluxo, quem resolve o inset de baixo é o `inset-block-end` acima. */
    padding-bottom: 0;
    border-top: 0;
    border-radius: calc(var(--bar-height) / 2);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.16);
    transition: transform 180ms ease, opacity 180ms ease;
  }

  /* Sai de cena ao rolar para baixo, volta ao rolar para cima — é o que faz o formato
     flutuante se pagar: a pílula cobre o conteúdo, mas some justamente quando o conteúdo é o
     que importa. Só aqui: encostada, a barra ocupa espaço no fluxo, e escondê-la exigiria
     refazer o layout a cada scroll. */
  .tabs--floating.tabs--chrome-hidden ion-tab-bar {
    transform: translateY(calc(100% + var(--bar-gap) + var(--ion-safe-area-bottom, 0px)));
    opacity: 0;
    /* Fora de cena não recebe toque: sem isto a pílula invisível continuaria clicável. */
    pointer-events: none;
  }

  /* Quem pediu menos movimento não leva a barra deslizando na tela. */
  @media (prefers-reduced-motion: reduce) {
    .tabs--floating ion-tab-bar {
      transition: none;
    }
  }

  /* Indicador do item ativo (pílula do Material 3). Só no formato flutuante: encostada, a
     barra usa o realce por cor, que é o que o Ionic desenha. */
  .tabs--floating ion-tab-button::part(native) {
    border-radius: 999px;
  }

  .tabs--floating ion-tab-button.tab-selected::part(native) {
    background: color-mix(in srgb, var(--ion-color-primary) 14%, transparent);
  }
}

/* Celular em paisagem: a barra vira um rail na borda inicial.
   Ali a altura é o eixo escasso (~360dp, dos quais a moldura tomava mais da metade) e a
   largura é a sobra, então 48px de largura compram 48px de altura de volta.
   Tablets ficam de fora pelo teto de altura — lá a barra embaixo não incomoda.

   **Por que o rail é `position: absolute` e não uma troca de eixo do flex.**
   O `IonTabs` do @ionic/vue escreve `flex-direction: column` no `style` INLINE do
   `<ion-tabs>` (dist/index.js, ramo do router outlet). Estilo inline vence folha de estilo,
   então virar o eixo por CSS exigiria `!important` — e a barra com `height: 100%` dentro de
   uma coluna toma a tela inteira, deixando o conteúdo com altura zero (tela em branco).
   Tirando a barra do fluxo, o `.tabs-inner` volta a ser o único item flex e mantém 100% da
   altura; o outlet só recua a largura do rail.

   Aqui não há o que desempatar com o formato flutuante: o bloco dele é o complemento exato
   desta media query, e as duas nunca valem ao mesmo tempo. */
@media (orientation: landscape) and (max-height: 600px) {
  ion-tabs {
    /* Largura do rail incluindo o inset do sistema. Custom property no host: o outlet é
       filho light do ion-tabs e herda, então os dois nunca saem de sincronia. */
    --rail-width: calc(48px + var(--ion-safe-area-left, 0px));
  }

  ion-tab-bar {
    position: absolute;
    inset-block: 0;
    inset-inline-start: 0;
    width: 48px;
    height: auto;
    flex-direction: column;
    /* O `:host` do Ionic aplica os TRÊS insets (`padding-left/right/bottom`) e força
       `box-sizing: content-box !important`, então cada um deles SOMA à largura. Deitada,
       só o da borda que a barra encosta continua fazendo sentido: o de baixo virou lateral
       e o da direita caiu no meio da tela, onde não há recorte nenhum. Deixar o da direita
       passar soma a barra de navegação do sistema (~48dp) à largura do rail sem entrar em
       `--rail-width`, e o rail cobre uma faixa do conteúdo.
       Exceção consciente à regra de não compensar safe area na mão — ver
       docs/EDGE-TO-EDGE-SAFE-AREA.md. */
    padding-bottom: 0;
    padding-inline-end: 0;
    padding-inline-start: var(--ion-safe-area-left, 0);
    border-top: 0;
    border-inline-end: 1px solid var(--ion-color-step-150, rgba(0, 0, 0, 0.07));
  }

  ion-router-outlet {
    inset-inline-start: var(--rail-width);
  }
}
</style>

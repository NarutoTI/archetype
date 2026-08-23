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
      <!-- `v-tap-rescue`: flutuando, a barra desliza 180ms ao voltar à cena, e toque em alvo
           em movimento é o caso em que o browser deixa de emitir o click. -->
      <ion-tab-bar slot="bottom" v-tap-rescue>
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
import { vTapRescue } from '@/directives/vTapRescue';

const route = useRoute();
const settingsStore = useSettingsStore();

/** Tempo parado até a barra sair de cena sozinha. */
const IDLE_HIDE_MS = 2500;

/** Barra fora de cena (só no formato flutuante — ver o CSS). */
const chromeHidden = ref(false);
let idleTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Marca uma região que não deve devolver a barra.
 *
 * O atributo vai no ancestral e vale para tudo dentro dele, inclusive componentes do Ionic.
 * Assim cada tela escolhe regiões concretas, sem a HomePage precisar conhecê-la.
 */
const REVEAL_IGNORE_ATTR = 'data-bottom-bar-reveal';

const clearIdleTimer = () => {
  if (idleTimer === null) return;
  clearTimeout(idleTimer);
  idleTimer = null;
};

/** Recomeça a contagem. Só flutuando: encostada, a barra nunca sai de cena. */
const armIdleTimer = () => {
  clearIdleTimer();
  if (!settingsStore.bottomBarFloating) return;
  idleTimer = setTimeout(() => { chromeHidden.value = true; }, IDLE_HIDE_MS);
};

/**
 * Mostra a barra e recomeça a contagem.
 *
 * É o único caminho que a mostra, assim como o fim da contagem é o único que a esconde.
 * Em resumo: mexeu, aparece; depois de 2,5s, some.
 */
const showChrome = () => {
  chromeHidden.value = false;
  armIdleTimer();
};

/** A região tocada pediu para não mexer na barra? */
const ignoresReveal = (event: Event): boolean =>
  event
    .composedPath()
    .some((node) => node instanceof Element && node.getAttribute(REVEAL_IGNORE_ATTR) === 'ignore');

/**
 * Mostra a barra no fim de um toque ou no início de uma rolagem.
 *
 * - `pointerup`: o dedo terminou o toque.
 * - `pointercancel`: o navegador assumiu o arrasto para rolar. Os 2,5s começam aqui, então a
 *   barra pode sumir durante uma rolagem longa; outro gesto a mostra novamente.
 *
 * A barra não usa `scroll`, pois o navegador também dispara esse evento ao ajustar o layout.
 * O evento não é cancelado: o mesmo toque abre o item e mostra a barra.
 */
const onPointerEnd = (event: Event) => {
  if (!settingsStore.bottomBarFloating) return;

  if (ignoresReveal(event)) {
    // Não revela, mas solta a contagem que o `pointerdown` segurou.
    if (!chromeHidden.value) armIdleTimer();
    return;
  }

  showChrome();
};

/**
 * Pausa a contagem quando o dedo encosta na tela.
 *
 * Isso evita que a barra suma no meio de um toque, mova o conteúdo e faça o dedo terminar
 * sobre outro controle. A contagem recomeça no `pointerup` ou no `pointercancel`. Se a barra
 * já estiver escondida, não há contagem para pausar.
 */
const onPointerDown = () => {
  if (chromeHidden.value) return;
  clearIdleTimer();
};

const resetChrome = () => showChrome();

// Tela nova nunca começa sem navegação, e desligar a preferência devolve a barra na hora.
watch(() => route.path, resetChrome);
watch(() => settingsStore.bottomBarFloating, resetChrome);

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointerup', onPointerEnd, true);
  document.addEventListener('pointercancel', onPointerEnd, true);
  showChrome();
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown, true);
  document.removeEventListener('pointerup', onPointerEnd, true);
  document.removeEventListener('pointercancel', onPointerEnd, true);
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
   herdaria `width: fit-content`, `margin-inline: auto` e o `translateY` usado para esconder:
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
     `theme/global.css` (a classe `.scrolls-under-bar`). A linha da versão no Menu usa
     `--bar-cover`: reserva a mesma faixa enquanto a barra aparece e a devolve quando ela
     some. `--bar-inset` continua constante para não redimensionar uma lista durante a
     rolagem. */
  .tabs--floating {
    --bar-height: 48px;
    --bar-gap: 10px;
    --bar-inset: calc(var(--bar-height) + var(--bar-gap) * 2);
    --bar-cover: var(--bar-inset);
  }

  /* A reserva da tira fixa acompanha a barra. Como a barra não reage ao evento `scroll`,
     uma correção de layout do navegador não consegue mostrá-la nem reiniciar um tremor. */
  .tabs--floating.tabs--chrome-hidden {
    --bar-cover: 0px;
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
       esconder — somar os dois deixaria a saída da pílula dependente da conta de
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

  /* A barra flutuante sai de cena após 2,5s e volta com um toque ou uma nova rolagem. Numa
     rolagem longa, pode sumir antes de o dedo sair; isso é intencional e libera mais espaço.
     A barra encostada permanece visível porque faz parte do layout. */
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

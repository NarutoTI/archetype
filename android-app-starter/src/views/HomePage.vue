<template>
  <ion-page>
    <ion-tabs>
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
import {
  IonIcon,
  IonPage,
  IonRouterOutlet,
  IonTabBar,
  IonTabButton,
  IonTabs,
} from '@ionic/vue';
import { checkboxOutline, imagesOutline, menuOutline, notificationsOutline } from 'ionicons/icons';
</script>

<style scoped>
/* Cromo do app — ver docs/APP-CHROME-LAYOUT.md.
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

/* Celular em paisagem: a barra vira um rail na borda inicial.
   Ali a altura é o eixo escasso (~360dp, dos quais o cromo tomava mais da metade) e a
   largura é a sobra, então 48px de largura compram 48px de altura de volta.
   Tablets ficam de fora pelo teto de altura — lá a barra embaixo não incomoda.

   **Por que o rail é `position: absolute` e não uma troca de eixo do flex.**
   O `IonTabs` do @ionic/vue escreve `flex-direction: column` no `style` INLINE do
   `<ion-tabs>` (dist/index.js, ramo do router outlet). Estilo inline vence folha de estilo,
   então virar o eixo por CSS exigiria `!important` — e a barra com `height: 100%` dentro de
   uma coluna toma a tela inteira, deixando o conteúdo com altura zero (tela em branco).
   Tirando a barra do fluxo, o `.tabs-inner` volta a ser o único item flex e mantém 100% da
   altura; o outlet só recua a largura do rail. */
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

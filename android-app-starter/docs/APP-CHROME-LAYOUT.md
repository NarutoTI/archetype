# Cromo do app — 48px embaixo, rail em paisagem, superfície neutra

**Cromo** = a moldura fixa que envolve o conteúdo: a barra de cima (`ion-toolbar`) e a de
baixo (`ion-tab-bar`). É tudo que ocupa espaço em **toda** tela do app sem ser conteúdo.

Este documento cobre só a moldura. O que cada página desenha dentro dela é assunto dela.

## Por que mexer nisso

Num celular de 360×640dp, a moldura padrão do Ionic custa **112dp** (56 em cima + 56
embaixo): ~17% da tela, em toda tela. Em paisagem o mesmo cromo come **31%** da altura, e é
justamente onde ela falta.

| | Antes | Depois |
|---|---|---|
| Barra inferior (retrato) | 56dp | **48dp** |
| Barra inferior (paisagem) | 56dp de altura | **0** — vira rail de 48dp de largura |
| Altura útil em paisagem | ~248dp | **~304dp** (+23%) |

## 1. Barra inferior: 48px e só ícones

```css
ion-tab-bar {
  height: 48px;                                    /* regra externa vence o :host do Ionic */
  --background: var(--ion-background-color, #fff);
  --color: var(--ion-color-medium);
  --color-selected: var(--ion-color-primary);
}
```

Duas coisas que não são óbvias:

**A altura é `height`, não uma custom property.** O Ionic fixa `height: 56px` no `:host` do
`ion-tab-bar` e **não expõe `--height`**. Uma regra externa vence `:host` no cascade sem
precisar de `!important` — estilo inline, não.

**Os 48px só cabem porque a barra é de ícones.** Com `ion-label` o piso real é 56px (ícone
24 + rótulo + margens). Trocar o rótulo escrito por `aria-label` em cada `ion-tab-button` é
o que paga os 8dp — e o `aria-label` **não é opcional**: sem ele o botão fica sem nome
acessível e o leitor de tela anuncia só "botão". Fixado em teste.

Se o seu app quiser os rótulos de volta, tire o `height: 48px` junto: o resto (cores, rail)
continua valendo.

## 2. Rail em paisagem

```css
@media (orientation: landscape) and (max-height: 600px) {
  ion-tabs { --rail-width: calc(48px + var(--ion-safe-area-left, 0px)); }

  ion-tab-bar {
    position: absolute;                     /* fora do fluxo — ver abaixo */
    inset-block: 0;
    inset-inline-start: 0;
    width: 48px; height: auto;
    flex-direction: column;
    padding-bottom: 0;                      /* insets do Ionic no eixo errado — ver abaixo */
    padding-inline-end: 0;
    padding-inline-start: var(--ion-safe-area-left, 0);
  }

  ion-router-outlet { inset-inline-start: var(--rail-width); }
}
```

Em paisagem paga-se 48px de largura (que sobra) para receber 48px de altura (que falta).
Tablets ficam de fora pelo teto de `max-height: 600px` — lá a barra embaixo não incomoda.

⚠️ **Por que `position: absolute` e não virar o eixo do flex.** A tentativa natural é
`ion-tabs { flex-direction: row }` + `order: -1` na barra. **Não funciona, e deixa o modo
paisagem com a tela em branco**: o `IonTabs` do `@ionic/vue` escreve
`flex-direction: column` no `style` **inline** do `<ion-tabs>` (`dist/index.js`, ramo do
router outlet), e estilo inline vence folha de estilo. O container segue coluna, a barra com
`height: 100%` toma a tela inteira e o `.tabs-inner` fica com altura zero.

Tirando a barra do fluxo, nada disso importa: o `.tabs-inner` volta a ser o único item flex
e mantém 100% da altura, a barra se posiciona contra o host (que é `position: absolute`), e
o outlet recua a largura do rail. A largura mora numa custom property no `ion-tabs` porque o
outlet é **filho light** dele e herda — os dois não saem de sincronia.

⚠️ **Safe area: o Ionic aplica os três insets, não só o de baixo.** O `:host` do
`ion-tab-bar` tem:

```css
padding-right: var(--ion-safe-area-right);
padding-bottom: var(--ion-safe-area-bottom, 0);
padding-left: var(--ion-safe-area-left);
box-sizing: content-box !important;        /* cada padding SOMA à largura */
```

De pé isso está certo: o inset de baixo é real, os laterais são zero. **Deitada, não**: o de
baixo virou lateral e o da direita caiu no meio da tela, onde não há recorte nenhum. Zerar
só o de baixo (o erro que já custou uma rodada de teste em aparelho) deixa o `padding-right`
somando a barra de navegação do sistema (~48dp em 3 botões) a uma largura que o
`--rail-width` não conhece: o rail fica ~3× mais largo que os 48px e **cobre uma faixa do
conteúdo**.

Daí o `padding-inline-end: 0`. Como o rail encosta na borda inicial, o único inset que
sobrevive é o dessa borda. É o único desvio autorizado da regra "não compensar safe area na
mão" da [EDGE-TO-EDGE-SAFE-AREA.md](EDGE-TO-EDGE-SAFE-AREA.md).

> Em RTL o rail vai para a borda direita e o inset externo passa a ser
> `--ion-safe-area-right`; as propriedades lógicas viram junto, mas o *valor* não. Só
> importa se o app tiver um idioma RTL.

Os três estados possíveis da barra (embaixo / rail / flutuante) são o **mesmo seletor** com
corpos diferentes. Flutuante seria `position: absolute` + `border-radius` +
`backdrop-filter`; ao sair do fluxo flex o `.tabs-inner` cresce sozinho, e o que passa a
exigir decisão é o que fica coberto, não o CSS.

## 3. Superfície neutra (Material 3)

Nenhuma barra usa `color="primary"`. A faixa saturada em cima e embaixo emoldura o conteúdo
e faz a tela parecer menor do que é; no M3 o primary vive nos **acentos** (item ativo, botão
de ação, badge), não na superfície.

Regra prática: **cor na barra só quando ela é o aviso.** Um modal de apagar (`danger`) ou de
exportar (`warning`) mantém a cor porque ali ela informa; um cabeçalho de página em
`primary` é decoração.

## Como isto é testado

`tests/unit/views/HomePage.spec.ts`. O rail é CSS que só existe girado — nenhum teste de
comportamento o alcança, e o jsdom não aplica CSS nenhum. Os invariantes são lidos do fonte
do componente (`?raw`), o que é feio e é o único jeito de a próxima pessoa não reintroduzir
os dois bugs (eixo do flex, inset da direita) sem aviso.

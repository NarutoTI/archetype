# Moldura do app — 48px embaixo, barra flutuante, rail em paisagem

**Moldura** = a armação que envolve o conteúdo: a barra de cima (`ion-toolbar`) e a de
baixo (`ion-tab-bar`). É tudo que ocupa espaço em **toda** tela do app sem ser conteúdo.

Este documento cobre só a moldura. O que cada página desenha dentro dela é assunto dela.

## Por que mexer nisso

Num celular de 360×640dp, a moldura padrão do Ionic custa **112dp** (56 em cima + 56
embaixo): ~17% da tela, em toda tela. Em paisagem a mesma moldura come **31%** da altura, e é
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

## 2. Formato flutuante (padrão)

A barra é uma **pílula centralizada que flutua sobre o conteúdo** e some ao rolar. É o
padrão; Menu → `settings.bottomBarFloating` desliga e devolve a barra encostada na borda. A
preferência é **do aparelho** (chave `bottom-bar-floating`), sobrevive ao logout, e é lida no
`loadBootSettings` — chegando depois do mount, quem escolheu a barra encostada vê a pílula
aparecer e o conteúdo pular.

```css
/* complemento exato da media query do rail — ver § 3 */
@media not all and (orientation: landscape) and (max-height: 600px) {
  .tabs--floating {
    --bar-inset: calc(var(--bar-height) + var(--bar-gap) * 2);
  }

  .tabs--floating ion-tab-bar {
    position: absolute;
    inset-block-end: calc(var(--bar-gap) + var(--ion-safe-area-bottom, 0px));
    inset-inline: 0; width: fit-content; margin-inline: auto;      /* pílula, centralizada */
    contain: layout paint style;
    border-radius: calc(var(--bar-height) / 2);
  }

  .tabs--floating.tabs--chrome-hidden ion-tab-bar {
    transform: translateY(calc(100% + var(--bar-gap) + var(--ion-safe-area-bottom, 0px)));
    opacity: 0;
    pointer-events: none;
  }
}
```

**O outlet não recua.** A tela vai até a borda de baixo; quem rola termina acima da pílula
por `--bar-inset`, consumido pela classe `.scrolls-under-bar` em `theme/global.css`. Recuar o
outlet deixa sobrando uma faixa que lê como rodapé — exatamente o que um formato flutuante
não deve parecer. Uma tela que preencha a altura **sem rolar** fica com o canto de baixo
debaixo da pílula: é o preço do formato.

A variável mora no `<ion-tabs>` e **herda** para tudo que está dentro das abas, então a
página reserva espaço sem saber qual formato está ativo. Fora das abas ela não existe e todo
`var(…, 0px)` zera sozinho.

> Se alguma página desenhar uma **tira fixa** no próprio rodapé (um segmento, uma linha de
> versão), publique uma segunda variável que acompanhe o esconder (`--bar-cover`, zerada em
> `.tabs--chrome-hidden`) e consuma ela ali. `--bar-inset` tem de ficar constante para quem
> rola: encolher um scroller no meio da rolagem faz o navegador corrigir o `scrollTop`, e o
> conteúdo pula.

### Três armadilhas que custaram caro

**`contain: layout paint style` não é enfeite.** O `:host` do `ion-tab-bar` traz
`contain: strict`, e o `size` dali dimensiona o elemento **como se não tivesse conteúdo** —
com isso `width: fit-content` resolve para **zero**. Some no desktop; só quebra no aparelho.

**`scroll` não é `composed`.** Quem rola o próprio `ion-content` rola o `.inner-scroll`
dentro do shadow DOM, e esse evento nunca sai de lá. Por isso o HomePage ouve também
`ionScroll` (evento do Stencil, `composed`), que o `ion-content` só emite com
`scroll-events` ligado. **Toda tela de aba liga o atributo** — a falha é silenciosa (a tela
rola, a barra fica parada) e sai mais barato ligar em todas.

**A barra volta no `pointerup`, não no `pointerdown`.** Voltando no começo do toque, a pílula
sobe embaixo do dedo e desloca o que estiver embaixo dela: o dedo pousa num controle e
levanta sobre a aba que subiu no lugar. No fim do gesto os alvos já estão registrados, o
clique vai para onde o usuário mirou, e o deslocamento acontece depois. `pointercancel` entra
junto porque um arrasto que vira rolagem nem sempre termina em `pointerup`.

### E some sozinha depois de 2,5s parada

Além da rolagem, a barra sai de cena após `IDLE_HIDE_MS` sem sinal de vida. Guardas que
existem por motivo: limiar de 10px (tremor de dedo parado faria a barra piscar), piso de 56px
de `scrollTop` (sumir no primeiro milímetro é irritante), devolver a barra em toda troca de
rota, e nada disso valer com a barra encostada.

⚠️ **O que isso custa:** quem fica parado olhando a tela perde a navegação até tocar. É
deliberado — a barra cobre conteúdo, então some quando ninguém a está usando —, mas é o
primeiro candidato a ajustar se o seu app tiver telas de leitura longa.

### O pull-to-refresh mora na mesma topologia

Este starter não tem scroller interno, mas assim que o seu app tiver um (um calendário, um
grid que rola por dentro do `ion-content`), o `ion-refresher` passa a armar no lugar errado.
O portão dele é uma linha:

```js
canStart: () => ... && this.scrollEl.scrollTop === 0   // e o gesto arma com 5px
```

`scrollEl` é o `.inner-scroll` do `ion-content`. Se quem rola é um filho
(`position: absolute; inset: 0; overflow-y: auto`), o `ion-content` fica **eternamente** em
`scrollTop === 0` e esse portão nunca fecha: no meio da lista, um arrasto de 5px para baixo
vira puxar-para-atualizar. A saída é fechar o portão na mão, pelo `disabled` do refresher,
enquanto o scroller de dentro não estiver no topo.

## 3. Rail em paisagem

Deitado só existe o rail: o bloco do formato flutuante (§ 2) é o **complemento exato** desta
media query, e as duas nunca valem ao mesmo tempo. Isso não pode depender da ordem no
arquivo — as regras daqui selecionam `ion-tab-bar` cru (0,0,1) e perderiam para
`.tabs--floating ion-tab-bar` (0,1,1), porque media query não soma especificidade.

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

## 4. Superfície neutra (Material 3)

Nenhuma barra usa `color="primary"`. A faixa saturada em cima e embaixo emoldura o conteúdo
e faz a tela parecer menor do que é; no M3 o primary vive nos **acentos** (item ativo, botão
de ação, badge), não na superfície.

Regra prática: **cor na barra só quando ela é o aviso.** Um modal de apagar (`danger`) ou de
exportar (`warning`) mantém a cor porque ali ela informa; um cabeçalho de página em
`primary` é decoração.

## Como isto é testado

`tests/unit/views/HomePage.spec.ts` e `tests/unit/stores/settingsStore.spec.ts`.

O comportamento (esconder ao rolar, inatividade, `pointerup`, preferência) é testado montando
o componente. O resto é CSS que só existe no aparelho — girado, ou com a preferência ligada —
e o jsdom não aplica CSS nenhum: esses invariantes são lidos do fonte do componente (`?raw`),
o que é feio e é o único jeito de a próxima pessoa não reintroduzir sem aviso os bugs que
custaram caro (eixo do flex, inset da direita, `contain: strict`, e a media query que separa
a pílula do rail).

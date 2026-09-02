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

## 2. Formato flutuante (padrão no app)

A barra é uma **pílula centralizada que flutua sobre o conteúdo**. Cada toque ou nova
rolagem a mostra; 2,5s depois ela sai de cena para devolver espaço. Menu →
`settings.bottomBarFloating` desliga a ocultação automática e devolve a barra encostada,
sempre visível.
A preferência é **do aparelho** (chave `bottom-bar-floating`), sobrevive ao logout e é lida
no `loadBootSettings` para decidir o layout do primeiro quadro.

### O padrão depende da plataforma: flutuante no app, encostada na web

`defaultBottomBarFloating()` (no `settingsStore`) devolve `Capacitor.isNativePlatform()`.
A escolha explícita do usuário continua vencendo nas duas plataformas; o que muda é só o
ponto de partida de quem nunca mexeu no interruptor.

O motivo é o gesto. A pílula troca altura de tela por navegação que some sozinha, e a
devolve no `pointerup`/`pointercancel` de um dedo. **No navegador esse ciclo não fecha:**
altura sobra, ninguém arrasta a página com o dedo, e quem abre a página encontra uma tela
sem navegação nenhuma 2,5s depois — o defeito real que motivou a regra. Vale também para
o `npm run dev`, onde o app é desenvolvido.

**Ainda pendente:** no app, um leitor de tela ativo também deveria forçar o formato
encostado e sempre visível. Não descreva essa regra como pronta até o código e os testes
entrarem.

```css
/* complemento exato da media query do rail — ver § 3 */
@media not all and (orientation: landscape) and (max-height: 600px) {
  .tabs--floating {
    --bar-inset: calc(var(--bar-height) + var(--bar-gap) * 2);
    --bar-cover: var(--bar-inset);
  }

  .tabs--floating.tabs--chrome-hidden {
    --bar-cover: 0px;
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

**O outlet recua o inset do sistema, e nada além dele.** A tela vai até a borda de baixo
sob a pílula; quem rola termina acima dela por `--bar-inset`, consumido pela classe
`.scrolls-under-bar` em `theme/global.css`. Recuar a **barra inteira** deixaria sobrando uma
faixa que lê como rodapé — o que um formato flutuante não pode parecer. Uma tela que preencha
a altura **sem rolar** fica com o canto de baixo debaixo da pílula: é o preço do formato.

⚠️ **O inset precisa voltar na mão.** Encostada, o `ion-tab-bar` segurava esse espaço para a
página inteira: ficava abaixo do conteúdo na coluna flex, com
`padding-bottom: var(--ion-safe-area-bottom)` no próprio `:host`. Fora do fluxo, sumiu para
todo mundo — e o conteúdo passa a correr por baixo da barra de navegação do Android. Nenhum
componente cobre isso sozinho: o `ion-content` só ganha inset inferior **dentro de modal**, e
o `ion-footer` **desliga** o dele de propósito quando existe um `ion-tab-bar slot="bottom"`
(`['footer-toolbar-padding']: !keyboardVisible && (!tabBar || tabBar.slot !== 'bottom')`) — e
a pílula ainda é um.

⚠️ **Some no simulador.** O defeito escala com `--ion-safe-area-bottom`: com navegação por
gestos são ~16–24px e quase não aparece; com os três botões são ~48px. Testar o formato
flutuante exige aparelho ou simulador com barra de 3 botões.

As variáveis moram no `<ion-tabs>` e **herdam** para tudo que está dentro das abas, então a
página reserva espaço sem saber qual formato está ativo. Fora das abas elas não existem e
todo `var(…, 0px)` zera sozinho.

Existem duas reservas porque elas servem a caixas diferentes:

- `--bar-inset` fica **constante** enquanto a barra flutua e é usado por quem rola. Assim a
  lista não muda de altura no meio da rolagem.
- `--bar-cover` acompanha a barra e é usado por tiras fixas. No starter, a linha da versão no
  Menu reserva essa faixa enquanto a pílula aparece e a devolve quando ela some.

O rodapé da versão é condicional. Enquanto seus dados ainda não existem — ou se a leitura
falhar — o Menu aplica `.scrolls-under-bar` ao próprio `ion-content`. Quando o rodapé monta,
essa classe sai e `--bar-cover` assume a reserva, sem somar as duas faixas.

Essa segunda variável já provocou tremor no app que originou o starter: a tira mudava de
tamanho, o navegador corrigia o `scrollTop`, e o listener da barra interpretava a correção
como rolagem do usuário. Hoje o ciclo é impossível por construção: a barra não escuta
`scroll` nem `ionScroll`, portanto a correção de layout não consegue mostrá-la novamente.

### Armadilhas que custaram caro

**`contain: layout paint style` não é enfeite.** O `:host` do `ion-tab-bar` traz
`contain: strict`, e o `size` dali dimensiona o elemento **como se não tivesse conteúdo** —
com isso `width: fit-content` resolve para **zero**. Some no desktop; só quebra no aparelho.

**A barra não escuta `scroll`.** A versão anterior ouvia `scroll` nativo e `ionScroll`, o que
obrigava todas as páginas a ligar `scroll-events`. Isso também deixava correções automáticas
de layout chegarem ao estado da barra. Agora a rolagem entra pela sequência física do dedo:
quando o navegador assume o arrasto, ele envia `pointercancel`. Os quatro `ion-content`
continuam rolando normalmente sem `scroll-events`; apenas deixam de emitir um evento que não
tem mais consumidor.

**A barra nunca aparece no `pointerdown`.** No começo do toque, a contagem apenas pausa. Se a
pílula subisse sob o dedo naquele instante, poderia mover o conteúdo e trocar o controle que
recebe o fim do toque. Um toque revela no `pointerup`; uma rolagem revela no `pointercancel`,
normalmente perto do começo.

### Cada gesto dá 2,5s à barra

O contrato do formato flutuante é simples:

> Um toque concluído ou o reconhecimento de uma nova rolagem mostra a barra, salvo em região
> marcada. Esse sinal inicia uma contagem de 2,5s; ao final, somente o timer esconde a barra.

| Sinal | Efeito |
|---|---|
| `pointerdown` | pausa a contagem; não mostra a barra |
| `pointerup` fora de região marcada | mostra e recomeça os 2,5s |
| `pointercancel` fora de região marcada | mostra e recomeça os 2,5s |
| `pointerup` ou `pointercancel` dentro de região marcada | não mostra; se já estava visível, recomeça os 2,5s |
| troca de rota ou desligar o formato flutuante | mostra e recomeça a regra adequada ao formato |
| fim dos 2,5s | esconde somente no formato flutuante |

**Pan** é simplesmente arrastar o dedo para deslocar o conteúdo. Quando o Chrome assume esse
arrasto, normalmente envia `pointercancel` perto do começo e não envia `pointerup` depois.
Por isso a barra pode sumir 2,5s mais tarde enquanto a mesma rolagem ainda continua. Isso é
intencional: aumenta a área de leitura; um novo gesto a devolve.

O ouvinte fica no documento, em captura, mas não chama `preventDefault` nem
`stopPropagation`. Assim o mesmo toque que mostra a barra também abre o item tocado. Mostrar
a barra sem querer é aceitável; não existe ação destrutiva e ela volta a sair sozinha.

#### Regiões que não devolvem a barra

`data-bottom-bar-reveal="ignore"` vai em um ancestral e vale para tudo dentro dele porque
`composedPath()` sobe até a raiz, inclusive através dos componentes do Ionic. No starter:

- os quatro cabeçalhos externos das abas;
- o rodapé da versão no Menu, incluindo o gesto de 12 toques do canal OTA.

Não marque o conteúdo: ele é a saída universal de toda tela. Também não repita o atributo nos
filhos; marcar o `<ion-footer>` já cobre toolbar, item, rótulo e chip.

#### Limites aceitos

- Continuação do mesmo pan, inércia, roda do mouse e teclado não geram um novo sinal para a
  barra. No app, um novo toque a devolve.
- Em paisagem, o CSS mantém o rail visível mesmo que o timer deixe `chromeHidden` verdadeiro.
  Ao voltar ao retrato, a pílula pode já estar escondida até o próximo gesto.
- A barra visualmente escondida usa `transform`, `opacity` e `pointer-events: none`, mas ainda
  pode ser anunciada por TalkBack ou receber foco. O modo flutuante aceita esse limite hoje.

**Pendente de implementação:** no app, leitor de tela ativo deveria forçar o formato
encostado e sempre visível. (A metade web deste contrato **já entrou** — ver § 2.) Não use
`inert` isoladamente: além de precisar de uma forma acessível de revelar a navegação,
`chromeHidden` também pode ficar verdadeiro enquanto o rail de paisagem continua visível.

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

### O que observar ao adicionar uma tela que preenche a altura

As abas atuais usam o `ion-content` como rolador principal. Uma tela que **preenche a altura**
ou **rola por dentro** (calendário, mapa, timeline) acrescenta os dois primeiros problemas
abaixo. O terceiro já aparece no rodapé da versão e serve como exemplo para qualquer nova
tira fixa.

**1. `height: 100%` ignora os irmãos.** Uma tela que pede 100% da caixa de rolagem não sabe
que alguém pode entrar acima dela (um filtro, um aviso). A soma passa da tela e o rodapé da
sua tela cai para fora — silenciosamente. Use `min-height: 100%` (cresce) ou peça a **sobra**:

```css
.content-stack { display: flex; flex-direction: column; height: 100%; }
.content-stack > .content-fill { flex: 1; min-height: 0; }
```

Só para quem preenche a altura. Uma lista quer o contrário — crescer com o conteúdo e deixar
a página rolar —, e `flex: 1` com base zero a prenderia na sobra.

**2. O `ion-refresher` arma no lugar errado.** O portão dele é
`this.scrollEl.scrollTop === 0`, e `scrollEl` é o `.inner-scroll` do `ion-content`. Se quem
rola é um filho, o `ion-content` fica eternamente em zero e o portão nunca fecha: um arrasto
de 5px no meio da lista vira puxar-para-atualizar. Feche o portão na mão, pelo `disabled` do
refresher, enquanto o scroller de dentro não estiver no topo.

**3. Separe a reserva de quem rola da reserva de uma tira fixa.** Um scroller usa
`--bar-inset` constante; mudar sua altura sob o dedo provoca salto. Uma tira fixa pode usar
`--bar-cover`, que acompanha a pílula e devolve a faixa quando ela some. Foi o que o rodapé da
versão passou a fazer.

Mudar o tamanho da tira pode fazer o navegador corrigir a rolagem do irmão, mas isso sozinho
não forma um ciclo. O tremor só volta se algum caminho alimentar essa correção de `scroll`
de volta no estado da barra. Por isso a HomePage não deve voltar a ouvir `scroll` ou
`ionScroll` para mostrar/esconder a navegação.

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
corpos diferentes. Flutuante usa `position: absolute`, `border-radius` e sombra; ao sair do
fluxo flex o `.tabs-inner` cresce sozinho, e o que passa a exigir decisão é o que fica
coberto, não o CSS.

## 4. Superfície neutra (Material 3)

Nenhuma barra usa `color="primary"`. A faixa saturada em cima e embaixo emoldura o conteúdo
e faz a tela parecer menor do que é; no M3 o primary vive nos **acentos** (item ativo, botão
de ação, badge), não na superfície.

Regra prática: **cor na barra só quando ela é o aviso.** Um modal de apagar (`danger`) ou de
exportar (`warning`) mantém a cor porque ali ela informa; um cabeçalho de página em
`primary` é decoração.

## 5. Toque perdido na barra que volta à cena

Flutuando, a barra volta com 180ms de `translateY`. Tocar um botão **durante** essa entrada
ficava surdo: o toque chegava inteiro — dedo desce e sobe no mesmo lugar, nó vivo, nada
cancelado — e o browser simplesmente não emitia o `click` de compatibilidade. Alvo em
movimento é o caso em que ele desiste, e aí nenhum handler roda.

**Fix:** `v-tap-rescue` no `ion-tab-bar` (`src/directives/vTapRescue.ts`). Num toque que
qualifica como tap, se o click real não chegar em 80ms a diretiva despacha um sintético no
elemento sob o dedo. Não substitui o click — completa o que faltou —, então nenhum botão
muda de API.

Três coisas que **não** são óbvias e não devem ser "consertadas" sem medição:

- **O toque que revela a barra continua sem acionar nada.** Escondida, ela é
  `pointer-events: none`: o `pointerdown` nem passa por ela, então a diretiva não o vê. O
  comportamento *mexeu, aparece* fica intacto.
- **Se o resgate cair antes de a barra chegar sob o dedo**, o hit-test não acha descendente e a
  tentativa é reagendada até ela assentar. Como a barra se move na vertical e os botões se
  distribuem na horizontal, não há risco de acertar o vizinho.
- **A diretiva não escuta `pointerleave`**, e isso é deliberado: em aparelho sem hover a
  especificação manda disparar `pointerout` e `pointerleave` logo **depois** do `pointerup`, e
  um `reset` ali limparia o timer recém-agendado — desligaria o resgate em todo toque. Há
  teste sentinela para isso.

Nunca aninhar duas instâncias: sobre o mesmo toque elas despachariam **dois** clicks.

`tests/unit/directives/vTapRescue.spec.ts` cobre 19 casos (resgate, click real antes da janela,
duplicata tardia, espera da animação, desistência, arrasto com e sem `pointermove`, multitoque,
pressão longa, `contextmenu`, timer congelado, `pointerleave`, mouse ignorado, caneta atendida).

O dossiê da investigação que originou tudo isto (13 rodadas de medição em aparelho, com as
hipóteses derrubadas por número) está no my-memories, em
`docs/qa/INVESTIGACAO-TOQUE-PERDIDO.md` e `docs/qa/TOQUE-PERDIDO-DELTA-POS-REVISAO.md`.

## Como isto é testado

`tests/unit/views/HomePage.spec.ts` e `tests/unit/stores/settingsStore.spec.ts`.

O comportamento é testado montando o componente: `pointerup`, `pointercancel`, pausa no
`pointerdown`, prazo exato de 2,5s, ação do mesmo toque, regiões ignoradas, troca de rota e
formato encostado. Dois testes travam decisões estruturais: a HomePage registra os três
ouvintes de ponteiro e nenhum de rolagem, e as páginas não ligam `scroll-events` apenas para
a barra.

Os dois specs dublam `@capacitor/core` com uma plataforma controlável (`platformMock`), e o
padrão deles é **app** — sem isso o jsdom pareceria web e a suíte inteira passaria a testar
a barra encostada por acidente. O caso da web é explícito nos dois: no store, o formato
inicial; na HomePage, que a contagem nem chega a esconder a navegação.

O restante é CSS que só existe no aparelho — girado ou com a preferência ligada — e o jsdom
não aplica media queries. Esses invariantes são lidos do fonte do componente (`?raw`): eixo
do flex, insets, `contain: strict`, separação entre pílula e rail e as duas reservas
`--bar-inset`/`--bar-cover`.

O jsdom também não cria o `click` que um navegador gera depois do `pointerup`; o teste do
mesmo toque despacha a sequência explicitamente. Ele prova que a moldura não cancela a ação,
mas o hit-testing visual final continua sendo teste de aparelho.

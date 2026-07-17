# Edge-to-edge e safe areas (Android)

Como o archetype lida com as barras do sistema (status bar e barra de navegação/gestos) e por que **não deve existir código customizado de insets** nos projetos gerados.

## Arquitetura

Com targetSdk 36 (Android 16), o edge-to-edge é obrigatório: o WebView sempre desenha atrás das barras do sistema. Quem compensa isso é o plugin **SystemBars**, embutido no core do Capacitor 8 (`@capacitor/android`, sempre registrado — não é um pacote extra):

- Mede os insets da janela nativamente (listener no pai do WebView) e entrega para a camada web via variáveis CSS `--safe-area-inset-*` — ou, em WebViews com Chromium ≥ 140 e `viewport-fit=cover` (já presente no `index.html`), deixa o próprio Chromium reportar via `env(safe-area-inset-*)`.
- O Ionic 8.8+ consome a cadeia `--safe-area-inset-*` → `--ion-safe-area-*`; `ion-tab-bar`, `ion-header` e `ion-footer` (modais) se ajustam sozinhos.
- **Reaplica os valores após o carregamento da página** (`onPageCommitVisible` + `DOMContentLoaded` via bridge) — imune a corrida de cold start.
- Trata teclado (IME), inclusive workarounds para WebViews antigos.
- Aparência dos ícones das barras: API JS `SystemBars.setStyle` de `@capacitor/core` — usada em `settingsStore.syncStatusBar()` para acompanhar o tema do app (`ion-palette-dark`), cobrindo as **duas** barras.
- Android ≤ 14: sem edge-to-edge forçado → layout clássico, sem bug. Capacitor 8.4.0+ disponibiliza `--safe-area-inset-*` também em API ≤ 34.

## O que NÃO fazer (lição aprendida no My Memories, jul/2026)

O My Memories tinha um `MainActivity` customizado (de 2025, pré-Capacitor 8) com listener de insets próprio + injeção de `--ion-safe-area-*` via `evaluateJavascript`. Após o upgrade para o Capacitor 8, esse código passou a **conflitar com o SystemBars** e causou regressão: menu atrás da barra de navegação na primeira abertura (cold start), corrigindo sozinho na segunda. Dois defeitos:

- O listener retornava `WindowInsetsCompat.CONSUMED` no content view, o que **impedia o listener do SystemBars** (numa view filha) de receber os insets.
- A injeção era registrada num listener `DOMContentLoaded` — só funcionava se executasse na janela exata entre a criação do documento e o evento. Cold start perdia a corrida.

Portanto, nos projetos gerados a partir deste archetype:

- **Não** adicionar `OnApplyWindowInsetsListener` no `MainActivity` — ele deve permanecer um `BridgeActivity` puro.
- **Não** injetar `--ion-safe-area-*` inline via `evaluateJavascript`.
- **Não** instalar `@capacitor/status-bar` — com targetSdk 36 suas APIs (`overlaysWebView`, `backgroundColor`) são no-op; usar `SystemBars` de `@capacitor/core`.
- **Não** setar `android:fitsSystemWindows` no tema.
- **Não** compensar com CSS próprio (padding/margin manuais) em tab bar/headers — os componentes Ionic já resolvem via `--ion-safe-area-*`.

## Troubleshooting

Se um menu/cabeçalho ficar atrás das barras do sistema na primeira abertura:

1. Conferir a versão do **Android System WebView** do device (Play Store) — comportamento pleno exige Chromium ≥ 140.
2. Conferir `@capacitor/android` ≥ 8.4.x e rodar `npx cap sync android`.
3. Verificar se alguém reintroduziu customização de insets (`MainActivity`, `styles.xml`, `StatusBar.setOverlaysWebView`).
4. Issues úteis: [capacitor#8287](https://github.com/ionic-team/capacitor/issues/8287) (teclado × safe area), [Chromium 40699457](https://issues.chromium.org/issues/40699457) (env() no WebView < 140).

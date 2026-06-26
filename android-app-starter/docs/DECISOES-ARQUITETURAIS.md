# Decisões arquiteturais e como o framework funciona

Este documento explica **as decisões de arquitetura** do starter e **como as peças
se encaixam** — não como rodar o projeto (ver [RUN_LOCALLY.md](./RUN_LOCALLY.md))
nem como renomear (ver [CREATE_NEW_PROJECT_FROM_ARCHETYPE.md](./CREATE_NEW_PROJECT_FROM_ARCHETYPE.md)).

A entidade `Task` é só o **exemplo de domínio**. Onde este doc fala em "tarefa",
leia "a sua entidade real". O objetivo é registrar o *porquê* de cada escolha,
para quem for construir um app sobre este molde não precisar redescobrir.

> Princípio que atravessa tudo: **performance de cold start e UX percebida**.
> Quase toda decisão abaixo existe para o app abrir rápido, mostrar UI cedo e
> nunca bloquear o caminho crítico com trabalho adiável.

---

## 1. Sequência de boot e o `bootReadyPromise`

O `main.ts` inicializa em **fases**, com um ponto de sincronização único.

| Fase | O quê | Bloqueia UI? |
|------|-------|--------------|
| **0** | `shareEntry.install(router)` + listener de toque em notificação | Não |
| **1** | Biometria → `authService.initializeAuth()` | Sim (até biometria/auth) |
| **1** | `resolveBootReadyPromise()` | Libera os guards do router |
| **2** | `settingsStore.loadBootSettings()` (tema, idioma, modos de view) | Sim, antes do mount (evita flash) |
| **2** | `app.mount()` | — (UI visível) |
| **2b** | `settingsStore.loadSettings()` (resto das prefs, em background) | Não |
| **2b** | `shareEntry.dispatchIfPending('cold-start')` | Não |
| **3** (+1s) | Prompt de notificação entregue (lazy), permissões, check de versão | Não |

### Por que `bootReadyPromise` existe

É um **contrato de segurança**. Antes dele, o router podia navegar antes do token
carregar — causando redirects indevidos para `/login`, `isAuthenticated`
momentaneamente errado e "flash" de tela errada.

Quando `resolveBootReadyPromise()` é chamado, **garante-se**: biometria
verificada (ou pulada), token lido do storage, `userStore` atualizado e
`isAuthenticated` confiável. Por isso o `router.beforeEach` **aguarda**
`bootReadyPromise` ([router/index.ts](../src/router/index.ts)) — nenhuma rota
resolve antes do estado de auth ser real.

**Regra:** não mova `resolveBootReadyPromise()` sem entender que tudo que
precede é "garantia de auth", e tudo que segue "já pode confiar no usuário".

### Por que tema/idioma vêm **antes** do mount

`loadBootSettings()` é `await` antes de `app.mount()` só com o essencial de UI
(tema, idioma, modos de view) para **não piscar** cor/idioma na primeira pintura.
O resto das preferências (`loadSettings()`) roda depois do mount, em background,
e paraleliza leituras independentes do storage com `Promise.all`.

Arquivos âncora: [main.ts](../src/main.ts), [services/boot.ts](../src/services/boot.ts),
[router/index.ts](../src/router/index.ts).

---

## 2. Stores, cache e rede

### Padrão geral: cache local primeiro, rede depois

Nenhuma store de domínio é inicializada no boot. Cada uma carrega **sob demanda**
(quando a view abre) seguindo: **lê Preferences → mostra UI imediata → revalida
da rede em background**. O `initialize()` é o ponto de entrada padrão.

### Cache escopado por usuário

Todo cache de domínio é **user-scoped** — a chave inclui o id (ou email) do
usuário. Assim, contas diferentes no mesmo aparelho não se misturam, e o logout
não precisa apagar nada para evitar vazamento entre contas (o próximo usuário lê
outra chave). Ver `getScope()` em [useEntityBucketCache.ts](../src/composables/useEntityBucketCache.ts).

### O composable `useEntityBucketCache`

A **mecânica** de cache (Map em memória, persistência por bucket no Preferences,
guarda de escopo, dedupe de fetch) fica num composable genérico, reutilizável por
qualquer entidade. A store guarda só **regras de domínio, política de rede/loading
e estado de view**. Decisões embutidas nele:

- **Guarda de escopo (`ensureScope`):** quando `getScope()` muda (troca de
  usuário), a memória é descartada e respostas atrasadas do escopo anterior são
  ignoradas — evita que um fetch do usuário A popule a tela do usuário B.
- **Dedupe de fetch (`inFlightFetches`):** dois callers pedindo o mesmo bucket ao
  mesmo tempo compartilham a **mesma** Promise, em vez de disparar duas requests.
- **`initPromise` re-entrante + short-circuit `isLoaded`:** chamadas paralelas de
  `initialize()` compartilham uma execução; chamadas sequenciais (cada mount de
  uma tela) não re-rodam o init inteiro.
- **Partição por bucket:** os dados são particionados (no exemplo de Task, por
  ano). Carrega-se só o bucket visível, não a base inteira.

> **Decisão de fronteira (adiada de propósito):** separar "store de view" (o que a
> tela mostra: data selecionada, filtros) de "store de cache/rede" (o que está no
> disco). Hoje a store mistura os dois; o pacote de guards de concorrência acima
> resolveu os bugs reais sem o split. Só reabrir quando um PR puder focar **só**
> em fronteiras de responsabilidade, com testes de regressão.

Arquivos âncora: [composables/useEntityBucketCache.ts](../src/composables/useEntityBucketCache.ts),
[stores/taskStore.ts](../src/stores/taskStore.ts).

---

## 3. Share intent (compartilhar conteúdo para o app)

Quando o usuário compartilha mídia de outro app (Fotos, Galeria) para este,
ele cai direto na tela de criação com o conteúdo já carregado. A entrada é
dividida em **2 camadas** com responsabilidades separadas:

- **Camada baixa — `share-intake.service.ts`:** recebe do plugin nativo, copia
  bytes para staging, persiste um *manifest*, materializa blobs sob demanda.
  **Não conhece router nem auth.**
- **Camada alta — `shareEntry.ts`:** decide **quando** e **para onde** navegar.
  É o único lugar que conhece a rota de destino, o `userStore` e o ciclo de vida.

`main.ts` e as telas de auth ficam alheios ao share: só chamam
`shareEntry.install(router)` (uma vez, cedo) e `shareEntry.dispatchIfPending(reason)`.

### Razões de dispatch — intenção preservada no login

`dispatchIfPending(reason)` é chamado em **5 momentos**: `cold-start` (pós-mount),
`hot-path` (chegou share com app aberto), `app-resume`, `post-login` e
`post-oauth`. As telas de login chamam `dispatchIfPending('post-login')` **antes**
do redirect padrão; se retornar `true`, o share tem prioridade.

> É isto que faz o share **lembrar do destino** mesmo se o usuário compartilhou
> deslogado: o manifesto fica pendente, o login acontece, e o `post-login`
> retoma a navegação. (Contraste com o toque em notificação — §4 — que **não**
> tem essa continuidade.)

### Cold start e retenção nativa

O maior risco do share é o **cold-start race**: o evento nativo chegar antes do
listener JS registrar. Camadas de defesa:

1. **Listener registrado na Fase 0** (antes da biometria), o quanto antes.
2. **Retenção nativa** do plugin (`retainUntilConsumed`): o evento fica retido
   até o JS consumir.
3. **`Promise.all` antes do `addListener`:** restore do manifesto termina antes
   de qualquer evento ser entregue, sem atropelar manifesto mais novo.
4. **Manifesto persistido (TTL):** protege crash entre receber e consumir
   (two-phase `claim` + `ack` — só apaga o staging após o consumo confirmado).

Arquivos âncora: [services/share-intake.service.ts](../src/services/share-intake.service.ts),
[services/shareEntry.ts](../src/services/shareEntry.ts).

---

## 4. Notificações locais e abertura do app

Há **três** caminhos de entrada distintos, tratados em lugares diferentes de
propósito.

### 4.1 Toque direto na notificação

Listener `localNotificationActionPerformed` registrado **cedo** no
[main.ts](../src/main.ts) (Fase 0/1). Ele lê `extra.routePath` e navega para a
tela certa. **Decisão:** esse listener tem que ser cedo — o toque pode *lançar* o
app, e se ele morasse num módulo lazy (Fase 3) o evento de cold-start seria
perdido.

### 4.2 Abertura pelo ícone com badge (notificação já entregue)

Quando o usuário abre o app pelo **ícone do launcher** (em vez de tocar na
notificação), o Android inicia via intent `MAIN`/`LAUNCHER`, **sem** o payload da
notificação. Para cobrir isso:

- `notification.service.ts` grava um **índice local mínimo** ao agendar
  (`notificationId → key/title/body/routePath`), em
  [notificationLaunchIndex.service.ts](../src/services/notificationLaunchIndex.service.ts)
  (user-scoped, com teto de entradas mantendo as agendadas mais próximas).
- [notificationEntry.ts](../src/services/notificationEntry.ts) consulta
  `getDeliveredNotifications()` (o que está na bandeja/badge), cruza com o índice
  e mostra um prompt com ações **Abrir** / **Ver notificações** / **Fechar**.

**Decisão de carregamento:** o `notificationEntry` é **lazy** (`import()` na
Fase 3), porque o caso do badge é secundário e pode aparecer depois da primeira
pintura. Ele é **sempre instalado** (o listener de `appStateChange`/resume precisa
ficar ativo a sessão toda), mas o *dispatch de cold-start* só roda se o share
**não** navegou — share tem prioridade de UX.

**Só conta o que já tocou:** o fluxo usa **notificações entregues** (na bandeja),
não lembretes apenas agendados para o futuro. A checagem ocorre no **cold-start**
e no **resume**.

### 4.3 `extra.routePath` unifica os dois

Tanto o toque direto (§4.1) quanto o **Abrir** do prompt (§4.2) usam o mesmo
`extra.routePath` para decidir o destino, com fallback para a constante padrão.
As rotas vivem em [constants/notificationRoutes.ts](../src/constants/notificationRoutes.ts)
(`DEFAULT_NOTIFICATION_OPEN_PATH`, `NOTIFICATIONS_PATH`) — fonte única, sem
duplicar strings entre `main.ts` e `notificationEntry.ts`.

> O `routePath` passado pelo domínio (ex.: o lembrete de Task em `taskStore.ts`)
> é **literal de propósito**: representa "para onde *esta* notificação abre", uma
> decisão de domínio, não o fallback genérico. Não troque por constante ali.

### 4.4 Decisão: não interromper a edição

No My Memories (origem deste padrão), o prompt do badge é **suprimido enquanto o
usuário está numa tela de edição** — para não cobrir um formulário sendo
preenchido. A checagem é momentânea (cold-start/resume), então só segura o prompt
se a tela de edição for a rota ativa *naquele instante*.

> **No starter:** o `notificationEntry` mantém uma versão **mínima** desse guard
> (autenticação + prompt já aberto + ids já tratados na sessão), porque o exemplo
> `Task` não tem rota de detalhe/edição. **Se o seu app tiver telas de edição,
> adicione um guard de rota** no `dispatchIfDelivered` para não promptar por cima
> delas.

### 4.5 Trade-off conhecido: intenção não preservada no login

Se o usuário tocar na notificação **deslogado**, o guard de auth do router o leva
para `/login` e, após autenticar, ele cai na tela inicial — o destino do toque
**se perde** (diferente do share, §3, que tem `post-login`). É **aceito no
starter** por ser exceção rara. Apps que precisem de continuidade devem guardar o
destino e redirecionar após o login. (Documentado também no README e no guia de
criação de projeto.)

Arquivos âncora: [services/notification.service.ts](../src/services/notification.service.ts),
[services/notificationEntry.ts](../src/services/notificationEntry.ts),
[services/notificationLaunchIndex.service.ts](../src/services/notificationLaunchIndex.service.ts),
[constants/notificationRoutes.ts](../src/constants/notificationRoutes.ts).

---

## 5. Deep link (OAuth) vs ícone do launcher

O login social usa um **deep link** (`appUrlOpen` com scheme próprio,
ex.: `meuapp://auth`) tratado no `auth.service`. É um intent-filter
`ACTION_VIEW`, **independente** do share (`ACTION_SEND`) — fluxos separados, não
unificar.

**O que NÃO é deep link:** abrir o app pelo ícone do launcher (intent
`MAIN`/`LAUNCHER`) não passa por `appUrlOpen` nem carrega payload — esse caso é
exatamente o tratado em §4.2.

---

## 6. Permissões: um fluxo único via `capacitorService`

Em vez de cada tela repetir a dança de "checar → pedir → se negado, mandar para
Settings → ouvir o retorno → revalidar", isso fica centralizado no
[capacitor.service.ts](../src/services/capacitor.service.ts):

- `verifyAndRequestCameraPermissions()` — fluxo completo de câmera.
- `openSettingsWithCallback({ checkPermission, successMessage, deniedMessage,
  onReturn })` — genérico para **qualquer** permissão (notificações, localização,
  etc.): abre Settings, ouve o `appStateChange`, revalida e dá feedback.

**Decisão:** UX de permissão consistente em todo o app e telas livres de
boilerplate. Para uma permissão nova, reaproveite `openSettingsWithCallback`.

---

## 7. Datas e timezone

Regra dura: **nunca** usar `date.toISOString()` nem `new Date(stringISO)` — ambos
quebram timezone (interpretam como UTC e exibem o dia errado em fusos negativos).
Sempre usar os helpers de [utils/date.utils.ts](../src/utils/date.utils.ts), que
constroem datas **locais** (`new Date(year, month-1, day, ...)`):
`createLocalDate`, `createLocalDateTime`, `dateToISOString` (gera `YYYY-MM-DD`
local), `formatISODateToLocalString`, etc.

---

## 8. Tratamento de erros (padrão)

- **Erros de API:** `ErrorTranslationService` converte o contrato
  `{ code, message }` do backend em mensagem traduzida; exibir com
  `toastService`.
- **Erros de serviços locais** (câmera, arquivos, imagens): erros **tipados**
  mapeados para chaves i18n; cancelamento de picker nativo é silencioso.
- **Confirmações destrutivas:** `alertService.presentAlertConfirmDanger(...)`.
- **Falhas best-effort** (ex.: índice de notificação, agendamento): logadas com
  `logger.warn`, **nunca** quebram o fluxo principal (CRUD, agendar).

---

## 9. Performance como princípio de design

Padrões recorrentes, já aplicados acima, que valem manter ao crescer o app:

- **Lazy o que é secundário:** `import()` de fluxos não-críticos (ex.:
  `notificationEntry` na Fase 3); rotas com `component: () => import(...)`.
- **Paralelizar o independente:** `Promise.all` em leituras de storage que não
  dependem entre si.
- **Deduplicar fetch:** `inFlight` Maps para não disparar a mesma request duas
  vezes.
- **Não bloquear o caminho crítico:** permissões, check de versão e prompts
  secundários rodam em `setTimeout` após a primeira pintura.
- **Patch local barato sobre frescor perfeito** quando o risco restante é raro,
  recuperável e sem perda de dados: ao alterar um item de um cache já carregado,
  prefira atualizar só aquele id em RAM + salvar Preferences, em vez de limpar o
  bucket inteiro ou refazer fetch — exceto quando a estrutura mudou ou o bucket
  está frio/inseguro. Integridade de dados nunca é negociada; isso vale só para o
  cache de exibição.

---

## 10. Limpeza no logout / troca de usuário

Como o cache é **user-scoped**, a troca de usuário só descarrega a memória das
stores (`reset({ removePersisted: false })`) — o cache em disco do usuário
anterior fica isolado pela chave e é relido se ele voltar. No logout, limpam-se as
preferências user-scoped e o `userStore`. O índice de notificações também é
user-scoped, então não vaza entre contas.

---

## 11. iOS (estado e esforço)

O frontend Vue/Ionic é **portável sem refator** — Ionic detecta a plataforma e
aplica o "mode" iOS automaticamente; ~95% dos services já são
plataforma-agnósticos. O trabalho de iOS **não** está na lógica do app, e sim em:

- **Scaffold nativo** (`@capacitor/ios`, `cap add ios`, Xcode/CocoaPods).
- **Info.plist**: *purpose strings* de cada permissão usada (rejeição automática
  se faltar) e `CFBundleURLTypes` para o deep link.
- **Share Extension** + **App Group** (o share no iOS é um target separado no
  Xcode, não só um intent-filter).
- **Conformidade App Store**: Sign in with Apple (obrigatório se houver login
  social de terceiros), StoreKit para compras digitais, Privacy Manifest.
- **Notificações**: sem `channels` (Android-only); usar `categories` para actions;
  permissão pedida uma vez via `UNUserNotificationCenter`.

Pontos a generalizar no código quando for portar: branches `Capacitor.getPlatform()
=== 'android'` em billing/version, e o tratamento de URI do share (`content://` no
Android, `file://` no iOS).

---

## 12. i18n (onde tocar ao mexer)

Mensagens em [i18n](../src/i18n) (hoje `en`, `pt`). Ao adicionar um locale:
criar o JSON copiando a estrutura completa, registrar em `i18n/index.ts`
(`supportedLocales` + `messages`), atualizar a lista em `settingsStore.ts` e os
seletores visíveis de idioma. Usar **sempre o mesmo código curto** (`en`, `pt`,
`es`, …) em todos os lugares e no backend (templates de email, tipos padrão de
usuário novo).

---

## 13. Mapa rápido de arquivos âncora

| Tópico | Arquivo |
|--------|---------|
| Boot + fases | [main.ts](../src/main.ts) |
| Ponto de sincronização de auth | [services/boot.ts](../src/services/boot.ts) |
| Guards de rota aguardando boot | [router/index.ts](../src/router/index.ts) |
| Cache genérico por bucket | [composables/useEntityBucketCache.ts](../src/composables/useEntityBucketCache.ts) |
| Exemplo de store de domínio | [stores/taskStore.ts](../src/stores/taskStore.ts) |
| Share — camada baixa | [services/share-intake.service.ts](../src/services/share-intake.service.ts) |
| Share — navegação | [services/shareEntry.ts](../src/services/shareEntry.ts) |
| Notificação — agendar + índice + entregues | [services/notification.service.ts](../src/services/notification.service.ts) |
| Notificação — prompt do badge | [services/notificationEntry.ts](../src/services/notificationEntry.ts) |
| Notificação — índice local | [services/notificationLaunchIndex.service.ts](../src/services/notificationLaunchIndex.service.ts) |
| Rotas de notificação (constantes) | [constants/notificationRoutes.ts](../src/constants/notificationRoutes.ts) |
| Permissões (fluxo único) | [services/capacitor.service.ts](../src/services/capacitor.service.ts) |
| Datas/timezone | [utils/date.utils.ts](../src/utils/date.utils.ts) |
| Erros traduzidos | [services/errorTranslation.service.ts](../src/services/errorTranslation.service.ts) |

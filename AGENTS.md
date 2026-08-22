# Convenções do Archetype Android App Starter

## Idioma e comentários

- Documentação Markdown em português.
- Comentários no código em português neste archetype.
- Projetos gerados a partir do archetype escolhem o idioma dos comentários na criação (português ou inglês); se o usuário não informar, a IA deve perguntar — ver `android-app-starter/docs/CREATE_NEW_PROJECT_FROM_ARCHETYPE.md`.
- Nomes de variáveis, funções, tipos, rotas e contratos continuam em inglês quando isso combinar com o ecossistema ou com APIs existentes.

## Simplicidade de manutenção

- Priorizar a solução mais simples que preserve o comportamento esperado.
- Foco principal: performance percebida na abertura do app e manutenibilidade do código.
- Evitar espalhar guards defensivos em cada store quando a regra puder morar em uma camada reutilizável.
- Quando houver troca de usuário, o fluxo de autenticação deve resetar explicitamente as stores user-scoped. O cache genérico ainda deve proteger contra respostas antigas de requests em andamento.
- Stores de domínio devem ficar com regras de domínio, política de rede/loading e estado de tela. Mecânica repetível de cache deve ficar em composables reutilizáveis.

## Performance de abertura

- Abrir o app deve ser instantâneo sempre que houver cache local.
- `initialize()` de stores com cache deve restaurar dados locais primeiro e só depois sincronizar com o backend em background.
- Não limpar cache persistido ao iniciar o app com token salvo.
- Login, logout e troca de usuário podem descarregar apenas a memória das stores com `reset({ removePersisted: false })`, preservando o cache em disco para próxima abertura.
- Evitar requests bloqueantes no primeiro frame quando já houver dados locais suficientes para renderizar.

## Cache local

- Para caches por partição, usar `useEntityBucketCache`.
- Logout: RAM fora, disco fica (`reset({ removePersisted: false })`). Por que o My Memories apaga o disco: `android-app-starter/docs/CACHE-STARTER-VS-MY-MEMORIES.md`.
- A store expõe aliases de domínio (`loadedYears`, `yearCache`, etc.); views não devem consumir o composable diretamente.
- Em logout/troca de usuário, descarregar memória com `reset({ removePersisted: false })` para preservar o cache em disco.
- Não reordenar `clearToken()`: token → gancho de settings **com `currentUser` ainda setado** → `setCurrentUser(null)`. Ver `docs/DECISOES-ARQUITETURAIS.md` §10.
- Ao remover definitivamente dados locais, usar reset/clear com remoção persistida explícita.

## Padrão de store

- Criar stores Pinia em formato setup (`defineStore('nome', () => { ... })`).
- Expor estado de tela (`isLoading`, `isLoaded`, `selectedDate`, etc.) na store quando ele pertence ao fluxo do domínio.
- Incluir `initialize()` quando a store tiver boot/cache/rede.
- Em `initialize()`, a ordem padrão é: garantir escopo, restaurar cache local, renderizar, marcar loaded, disparar sync silenciosa em background.
- Mutação de domínio deve passar por actions da store (`addX`, `updateX`, `removeX`, `toggleX`), nunca por mutação direta de arrays expostos para a view.
- Computeds derivados de arrays devem criar cópia ou usar filtros que retornam array novo antes de ordenar. Nunca ordenar diretamente o estado da store.
- Regras genéricas de cache ficam no composable; regras específicas do domínio ficam na store.
- A store pode expor aliases de domínio para conceitos genéricos do cache, como `loadedYears` e `yearCache`.
- Store nova de domínio: `useEntityBucketCache` + `reset({ removePersisted: false })` e **registrar** em `auth.service` `resetUserScopedStores()`. Sem isso, a RAM do usuário anterior sobrevive à troca de conta. Sem rede no logout; sem `initialize()` nas fases 0–2. Ordem do `clearToken()`: `docs/DECISOES-ARQUITETURAIS.md` §10.

## Datas

- Não usar `date.toISOString()` nem `new Date('YYYY-MM-DD')`.
- Usar os helpers de `src/utils/date.utils.ts`.
- Datas de calendário continuam como `YYYY-MM-DD`; timestamps técnicos podem usar epoch ms.

## Testes e validação

- Preferir testes focados para regras reutilizáveis e bugs de corrida.
- Não rodar build final automaticamente; use lint, typecheck e testes unitários para validação durante alterações.

## OTA / Live Updates

- Atualização do bundle web sem passar pela loja, **backend-driven** (alvo vem do `GET /version`). Guia operacional e fonte da verdade: `android-app-starter/docs/native/OTA.md`.
- Nasce **dormente**: `VITE_OTA_ENABLED` ausente/false e mapas `ota`/`otaStaging` do backend vazios. Não ligar por padrão em projetos gerados.
- Release de loja: `node scripts/build-and-sync.js` (`build:android`) — bump só no frontend. AAB recusa canal staging; `assertSignedPublicKey` só se o gate signed-only estiver ligado. `ota:release` continua exigindo OTA ligado.
- Antes de alterar `ota.service`, `ota-channel.service`, `version.service`, o `versionService` do backend ou `scripts/ota/*`, ler o guia. Nunca assar `VITE_OTA_CHANNEL=staging` num build de produção (o `ota:release` aborta se detectar).

## Navegação por gesto (armadilha conhecida)

O starter não tem swipe hoje. **Se for adicionar**, leia isto antes — custou doze rodadas de
medição no my-memories, e o sintoma não denuncia a causa.

**O sintoma:** depois de um gesto que navega, o toque seguinte às vezes não faz nada. Nenhum
handler roda. Repetir funciona. Aparece em qualquer alvo da tela, não só no que se acabou de
tocar, e é intermitente (~1 em 3).

**A causa não é do app.** Os eventos de ponteiro chegam perfeitos — `pointerdown` e
`pointerup` no alvo certo, dedo parado, nó vivo, sem `preventDefault` — e o `click`
simplesmente não é sintetizado. Clicks de toque no Chrome nascem de *gesture tap events*
internos, com bugs conhecidos de propagação de estado. A Ionic convive com o mesmo sintoma
desde 2021 (issue #23793, aberta).

**Não perca tempo com:** fila da thread, remoção de nó, hit-test, rolagem, `touch-action`,
sobreposição de elementos animados. Todas foram medidas e derrubadas.

**A saída** é não depender do click sintetizado: reconhecer o tap no `pointerup` e despachar
um click sintético se o real não chegar. Implementação pronta e comentada, mais o dossiê da
investigação e a instrumentação de medição:

- `my-memories-frontend/src/directives/vTapRescue.ts` — a diretiva (delegação por container)
- `my-memories-frontend/src/composables/useSwipeNavigation.ts` — detecção de swipe; note o
  guard por **contador de geração**, não por `setTimeout` (a versão com relógio descartava
  toque legítimo e ainda corria com o timer)
- `my-memories-frontend/docs/qa/INVESTIGACAO-TOQUE-PERDIDO.md` — o dossiê
- `my-memories-frontend/docs/qa/INSTRUMENTACAO-TOQUE.md` — como medir

Copiados sob demanda, não duplicados aqui: sem consumidor no starter, virariam código morto
com duas cópias divergindo.

**Antes de escrever swipe do zero, considere o [Swiper](https://swiperjs.com/element)**, que é
o que a Ionic recomenda desde que `ion-slides` saiu (deprecado na v6, removido na v7). Ele dá
arrasto que segue o dedo, inércia e arbitragem de gesto prontos. Em troca, pesa no bundle — o
que briga com a prioridade de abertura instantânea — e não resolve a armadilha acima por si
(tanto que ele próprio expõe `preventClicks` e `preventClicksPropagation` para o mesmo
problema). Vale para carrossel de verdade; para "trocar o conteúdo de uma tela ao arrastar",
um detector de ~120 linhas continua sendo mais barato.

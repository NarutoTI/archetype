# Convenções do Archetype Android App Starter

## Idioma e comentários

- Documentação Markdown em português.
- Comentários no código em português neste archetype.
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
- A store expõe aliases de domínio (`loadedYears`, `yearCache`, etc.); views não devem consumir o composable diretamente.
- Em logout/troca de usuário, descarregar memória com `reset({ removePersisted: false })` para preservar o cache em disco.
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

## Datas

- Não usar `date.toISOString()` nem `new Date('YYYY-MM-DD')`.
- Usar os helpers de `src/utils/date.utils.ts`.
- Datas de calendário continuam como `YYYY-MM-DD`; timestamps técnicos podem usar epoch ms.

## Testes e validação

- Preferir testes focados para regras reutilizáveis e bugs de corrida.
- Não rodar build final automaticamente; use lint, typecheck e testes unitários para validação durante alterações.

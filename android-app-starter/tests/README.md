# Testes do Frontend

Suíte mínima para validar o arcabouço do starter e servir de molde para novos projetos.

## Comandos

```bash
npm run test:unit
npm run test:unit -- --run
```

Use `--run` para executar uma vez (CI e validação local rápida). Sem essa flag, o Vitest fica em modo watch.

## Estrutura

```
tests/
├── setup.ts                         # Mocks globais: browser APIs (Ionic/Pinia) + logger
├── test.utils.ts                    # Ajudantes compartilhados entre specs
├── unit/
│   ├── test-setup.spec.ts           # Contrato do dublê global do logger
│   ├── composables/
│   │   └── useEntityBucketCache.spec.ts
│   ├── services/
│   │   ├── api.service.spec.ts
│   │   ├── auth.service.spec.ts
│   │   ├── boot.spec.ts
│   │   ├── file.service.spec.ts
│   │   └── localNotification.service.spec.ts
│   ├── stores/
│   │   ├── settingsStore.spec.ts
│   │   ├── taskStore.spec.ts
│   │   └── userStore.spec.ts
│   ├── utils/
│   │   └── date.utils.spec.ts
│   └── views/
│       └── TasksPage.spec.ts        # Exemplo com mount() do @vue/test-utils
```

## Logger: dublê global, nenhum spec precisa do seu

`@/utils/logger` é mockado no `setup.ts` para **todos** os specs.

```ts
// ❌ não faça isto no seu spec
vi.mock('@/utils/logger', () => ({ logger: { log: vi.fn(), error: vi.fn() } }));

// ✅ para afirmar sobre chamadas, importe o módulo — ele já está mockado
import { logger } from '@/utils/logger';
expect(logger.error).toHaveBeenCalledWith('...');
```

**Por que centralizado.** Cada spec trazia o seu, todos parciais em graus diferentes. Um
dublê parcial não silencia o nível que falta: ele quebra com
`logger.<nível> is not a function` na primeira vez que o código chamar esse nível, e o erro
aparece com cara de bug do produto. Foi assim que um `logger.warn` num `catch` derrubou o
spec de `signOut()` — e a quebra rápida ainda escondia, por baixo, um teste que levava 5s
porque puxava a cadeia real de push.

**Por que derivado do módulo real** (`mockModuleFunctions` em [`test.utils.ts`](test.utils.ts)):
a lista escrita à mão já nasceu velha quando o `simulatorDebugLog` entrou no logger.
`unit/test-setup.spec.ts` trava esse contrato — e falha nominalmente, listando o que ficou
de fora.

**Exceção:** `unit/utils/logger.spec.ts` testa o módulo de verdade e usa
`vi.unmock('@/utils/logger')`.

## O que cada grupo cobre

- **composables**: regras reutilizáveis (`useEntityBucketCache` — cache, escopo, corrida).
- **stores**: padrão Pinia setup + integração com cache e serviços mockados (`taskStore`).
- **services**: contratos de infraestrutura (auth, API, notificações, arquivos, boot).
- **utils**: helpers críticos (`date.utils` — suíte completa com mock de relógio e cenários de fuso; sempre usar em vez de `toISOString()` / `new Date('YYYY-MM-DD')`).
- **views**: montagem de componente com Ionic stubs e store mockada (`TasksPage`).

## Convenções

- Mocks de Capacitor com `vi.hoisted()` quando o módulo é importado no topo do spec.
- Stores de domínio: mockar serviços, não o composable de cache diretamente na view.
- Ao remover a fatia `Tasks`, remova `taskStore.spec.ts` e `TasksPage.spec.ts`.
- Testes de view usam `mount()` do `@vue/test-utils`, não Cypress/E2E.

## Backend

O pacote `android-app-starter-backend` tem testes em `tests/unit/` com Vitest:

```bash
cd ../android-app-starter-backend
npm test -- --run
```

Ver também `android-app-starter-backend/tests/README.md`.

## Trabalho futuro: cobertura de código (`--coverage`)

Ainda **não está configurado** neste starter. Quando for prioridade:

1. Instalar o provider no frontend e no backend:
   ```bash
   npm install -D @vitest/coverage-v8
   ```
2. Adicionar em `vite.config.ts` (frontend) e criar `vitest.config.ts` ou equivalente no backend:
   ```ts
   test: {
     coverage: {
       provider: 'v8',
       reporter: ['text', 'html'],
       include: ['src/**/*.{ts,vue}'], // backend: src/**/*.ts
       exclude: ['src/main.ts', 'src/vite-env.d.ts'],
     },
   }
   ```
3. Adicionar script opcional: `"test:unit:coverage": "vitest run --coverage"`.
4. Ignorar a pasta gerada no `.gitignore`: `/coverage`.
5. (Opcional) Definir `thresholds` no CI quando a suíte estiver estável — ex.: 70% em `composables/` e `utils/`.

**O que muda ao ativar:** os testes continuam iguais, mas a execução fica mais lenta e gera relatório HTML (`coverage/index.html`) mostrando linhas não exercitadas. Útil para evitar regressão em `useEntityBucketCache`, `date.utils` e stores — não substitui testes de comportamento.

O my-memories menciona `--coverage` na documentação, mas também não traz o pacote nem o bloco de config no `package.json` / `vite.config.ts` hoje.

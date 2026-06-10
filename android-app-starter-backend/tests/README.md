# Testes do Backend

Testes unitários com Vitest e mock de MongoDB via `setMockDb()`.

## Comandos

```bash
npm test
npm test -- --run
```

## Estrutura

```
tests/unit/
├── services/
│   └── taskService.test.ts
└── utils/
    └── errorHandler.test.ts
```

## Convenções

- Mockar `collection` do MongoDB; não sobe banco real em testes unitários.
- `mongodb-memory-server` está disponível para testes de integração futuros, se necessário.
- Ao remover a fatia `Tasks`, remova `taskService.test.ts` e rotas/controllers relacionados.

## Trabalho futuro: cobertura de código

Ver a seção **Trabalho futuro: cobertura de código** em `android-app-starter/tests/README.md`. O passo é o mesmo no backend (`include: ['src/**/*.ts']`), com `@vitest/coverage-v8` e relatório em `coverage/`.

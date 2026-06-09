# Testes do Frontend

Este starter mantém uma suíte mínima para validar o arcabouço e demonstrar o
molde de testes do projeto.

## Comandos

```bash
npm run test:unit
```

## Estrutura

- `tests/setup.ts`: mocks globais de browser APIs usadas por Ionic/Pinia.
- `tests/unit/stores/taskStore.spec.ts`: teste da fatia de exemplo `Tasks`.

Ao remover a fatia `Tasks`, remova também o teste correspondente.

# Android App Starter

Starter Ionic Vue + Capacitor para novos apps Android.
O backend complementar fica em [`../android-app-starter-backend`](../android-app-starter-backend/README.md).

## O que vem pronto

- Autenticação por email/senha e Google OAuth.
- Deep link mobile `androidstarter://auth`.
- Biometria opcional no boot do app.
- Serviços base de alert, toast, API, versionamento, localização, notificações locais, imagem/galeria, arquivos e share intent Android.
- Shell com tabs: `Tasks`, `Media`, `Notifications` e `Menu`.
- Tela `Media` com galeria, lightbox com zoom e exemplo de arquivos anexos.
- Seletor de localização com mapa (Leaflet + OpenStreetMap), acessível pelo Menu.
- Fatia vertical de exemplo `Tasks` com tipo, serviço, store com cache local,
  tela com criação/edição, lembrete por notificação local, teste e backend.
- Dark mode (sistema/claro/escuro) e i18n PT/EN.

## Pré-requisitos

- Node.js 18+ (recomendado 20).
- Docker (para o MongoDB do backend) ou um MongoDB acessível.
- Para rodar no Android: Android Studio + JDK 17 + um emulador ou dispositivo.

## Do zero ao primeiro run

Na ordem, a partir da raiz do repositório:

```bash
# 1. Suba o MongoDB do backend
cd android-app-starter-backend
docker compose up -d

# 2. Configure e suba o backend
cp .env.example .env
npm install
npm run dev          # http://localhost:3000

# 3. Configure e suba o frontend (outro terminal)
cd ../android-app-starter
cp .env.example .env # ajuste VITE_USE_FAKE_LOGIN=true para testar sem OAuth
npm install
npm run dev          # http://localhost:8100
```

Com `VITE_USE_FAKE_LOGIN=true`, o botão "Continuar com Google" usa o endpoint
`/auth/fake-login` do backend (apenas em desenvolvimento) — você entra sem
configurar OAuth nem SMTP. Para o fluxo real, configure as variáveis de OAuth
do backend (ver README do backend).

Guia detalhado: [`docs/RUN_LOCALLY.md`](docs/RUN_LOCALLY.md).

Para Android (emulador):

```bash
npm run cap:build    # build web + sync nativo
npx cap open android # abre no Android Studio
```

No emulador, use `VITE_API_URL=http://10.0.2.2:3000` (`10.0.2.2` é o alias do
emulador para o `localhost` da sua máquina). No navegador, use
`http://localhost:3000`.

## Testes e lint

```bash
npm run test:unit -- --run  # testes unitários (Vitest)
npm run lint                # ESLint
npx vue-tsc --noEmit        # type-check
```

O CI do repositório (`.github/workflows/ci.yml`) roda lint, type-check e testes
do frontend e do backend a cada push/PR.

## Estrutura de pastas

```
src/
  composables/ # lógica reutilizável de stores (ex.: useEntityBucketCache)
  i18n/        # mensagens PT/EN (manter as duas sincronizadas)
  router/      # rotas com guard de autenticação
  services/    # acesso a API, Capacitor e regras sem estado
  stores/      # Pinia; toda store tem initialize() storage-first
  theme/       # variables.css (tokens) e global.css
  types/       # interfaces TypeScript do domínio
  utils/       # date.utils (sempre usar p/ datas), logger, mediaUri
  views/       # páginas Ionic
    components/  # componentes reutilizáveis (ver abaixo)
tests/unit/    # specs Vitest
android/       # projeto nativo (versionado; ver seção abaixo)
docs/          # checklist de rename e docs do starter
```

## Componentes reutilizáveis

- `DateTime.vue`: date/time picker padrão (ion-datetime-button + modal),
  com `v-model:date`, `v-model:time` ou `v-model` (date-time).
- `EmptyState.vue`: estado vazio com ícone, título e subtítulo.
- `ImageGallery.vue`: captura por câmera/galeria/arquivo com limite e resize.
- `ImageLightbox.vue`: visualização com pinch-zoom, double-tap, swipe e download.
- `MapLocationPicker.vue`: modal com mapa Leaflet, busca por endereço
  (Nominatim), marcador arrastável e reverse geocoding.

E em `src/composables/`:

- `useEntityBucketCache<T, TBucket>`: cache genérico particionado para stores
  de domínio. O bucket é qualquer chave derivada do item — ano (`2026`, caso
  default), chave composta (`'BR:2026'`), mês etc. Possui: buckets em memória
  (`shallowRef` + `triggerRef`), persistência por escopo em `Preferences`
  (bucket + índice; buckets vazios ficam só em memória como marcador de
  "carregado"), guarda de escopo (troca de usuário derruba a memória e
  descarta fetches atrasados do usuário anterior), `upsertItem`/`removeItem`
  (cobrem add, update e mudança de bucket), `replaceAll` e `fetchBucket` com
  dedupe de chamadas concorrentes. A store de domínio mantém só regras de
  negócio, política de rede/loading e estado de view (ver `taskStore.ts`).
  O fluxo de auth também chama `reset({ removePersisted: false })` nas stores
  user-scoped ao trocar usuário/logout: essa limpeza explícita mantém a store
  simples, enquanto a guarda do cache continua como defesa contra requests
  antigas que resolvem tarde.

## Fatia de exemplo: Tasks

`Tasks` existe para demonstrar o molde do projeto:

- tipo em `src/types/Task.ts`;
- serviço HTTP em `src/services/task.service.ts`;
- store Pinia com `initialize()` em `src/stores/taskStore.ts`, usando o cache
  genérico de `src/composables/useEntityBucketCache.ts` com anos como buckets
  (a store fica só com domínio, rede e view; o cache é reutilizável por
  qualquer entidade e particionamento);
- tela Ionic em `src/views/TasksPage.vue` com criação, edição (toque no item ou
  swipe), exclusão com confirmação, pull-to-refresh e skeleton de carregamento;
- lembrete por notificação local no dia do vencimento (09:00). O lembrete é
  local ao dispositivo: não sincroniza entre aparelhos;
- teste em `tests/unit/stores/taskStore.spec.ts`.

O backend complementar expõe `/api/tasks` (ver README do backend).

Quando o domínio real entrar, remova esses arquivos, a rota/tab `tasks` e os
endpoints de Tasks do backend.

## Tratamento de erros (padrão)

- Erros de API: `ErrorTranslationService.translateError(error)` converte o
  contrato `{ code, message }` do backend em mensagem traduzida; exiba com
  `toastService.presentToastError(...)`. Veja `TasksPage.vue`.
- Erros de serviços locais (câmera, arquivos, imagens): erros tipados
  (`FileValidationError`, `ImageLimitError`) mapeados para chaves i18n; o
  cancelamento do picker nativo é silencioso. Veja `MediaPage.vue` e
  `ImageGallery.vue`.
- Confirmações destrutivas: `alertService.presentAlertConfirmDanger(...)`.

## Pasta Android no Git

Mantenha a pasta `android/` versionada. Este starter já traz configuração
nativa que faz parte do arcabouço Android:

- `applicationId` e `namespace`;
- `AndroidManifest.xml` com deep link e share target;
- `MainActivity`;
- recursos em `android/app/src/main/res`;
- arquivos Gradle do projeto.

O que não deve ser commitado são artefatos locais ou gerados:

- `android/.gradle`;
- `android/build`;
- `android/app/build`;
- `android/app/src/main/assets`;
- `android/local.properties`;
- keystores (`*.jks`, `*.keystore`).

O `.gitignore` já cobre esses casos. Depois de alterar web assets, rode
`npm run cap:sync` para regenerar o que for necessário localmente.

## Variáveis principais

Crie `.env` a partir do `.env.example`:

```bash
VITE_API_URL=http://10.0.2.2:3000
VITE_USE_FAKE_LOGIN=false
VITE_DEEP_LINK_SCHEME=androidstarter
VITE_DEEP_LINK_HOST=auth
```

Mantenha `VITE_DEEP_LINK_SCHEME` alinhado com:

- `android/app/src/main/AndroidManifest.xml`;
- backend `MOBILE_DEEP_LINK_SCHEME`.

## Renomeando para um app real

Para criar dois novos projetos a partir do archetype, use
[`docs/CREATE_NEW_PROJECT_FROM_ARCHETYPE.md`](docs/CREATE_NEW_PROJECT_FROM_ARCHETYPE.md).

Para o rename nativo Android, veja também
[`docs/ANDROID_RENAME_CHECKLIST.md`](docs/ANDROID_RENAME_CHECKLIST.md).

Este projeto é uma base viva: renomeie, conecte seu backend e cresça o domínio real
a partir dela. A fatia `Tasks` é apenas o exemplo removível.

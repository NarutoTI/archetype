# Android App Starter

Starter Ionic Vue + Capacitor para novos apps Android.

## O que vem pronto

- Autenticação por email/senha e Google OAuth.
- Deep link mobile `androidstarter://auth`.
- Biometria opcional no boot do app.
- Serviços base de alert, toast, API, versionamento, localização, notificações locais, imagem/galeria, arquivos e share intent Android.
- Shell com tabs: `Tasks`, `Media`, `Notifications` e `Menu`.
- Tela `Media` com galeria, lightbox com zoom e exemplo de arquivos anexos.
- Fatia vertical de exemplo `Tasks` com tipo, serviço, store com cache local,
  tela, teste e backend opcional.

## Rodando

```bash
npm install
npm run dev
```

Para Android:

```bash
npm run cap:sync
npx cap open android
```

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

## Fatia de exemplo: Tasks

`Tasks` existe para demonstrar o molde do projeto:

- tipo em `src/types/Task.ts`;
- serviço HTTP em `src/services/task.service.ts`;
- store Pinia com `initialize()`, cache por ano em memória e `Preferences` em
  `src/stores/taskStore.ts`;
- tela Ionic em `src/views/TasksPage.vue`;
- teste em `tests/unit/stores/taskStore.spec.ts`.

O backend complementar fica em `android-app-starter-backend`:

- `GET /api/tasks`;
- `GET /api/tasks/year/:year`;
- `POST /api/tasks`;
- `PUT /api/tasks/:id`;
- `DELETE /api/tasks/:id`.

Quando o domínio real entrar, remova esses arquivos, a rota/tab `tasks` e os
endpoints de Tasks do backend.

## Variáveis principais

Crie `.env` a partir deste modelo:

```bash
VITE_API_URL=http://10.0.2.2:3000
VITE_USE_FAKE_LOGIN=false
VITE_DEEP_LINK_SCHEME=androidstarter
VITE_DEEP_LINK_HOST=auth
```

Sobre `VITE_API_URL`: use `http://localhost:3000` ao rodar no navegador
(`npm run dev`) e `http://10.0.2.2:3000` ao rodar no emulador Android
(`10.0.2.2` é o alias do emulador para o `localhost` da sua máquina).

Mantenha `VITE_DEEP_LINK_SCHEME` alinhado com:

- `android/app/src/main/AndroidManifest.xml`;
- backend `MOBILE_DEEP_LINK_SCHEME`.

## Renomeando para um app real

Veja `docs/ANDROID_RENAME_CHECKLIST.md`.

Este projeto é uma base viva: renomeie, conecte seu backend e cresça o domínio real
a partir dela. A fatia `Tasks` é apenas o exemplo removível.

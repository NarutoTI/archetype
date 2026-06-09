# Android App Starter

Starter Ionic Vue + Capacitor para novos apps Android.

## O que vem pronto

- Autenticação por email/senha e Google OAuth.
- Deep link mobile `androidstarter://auth`.
- Biometria opcional no boot do app.
- Serviços base de alert, toast, API, versionamento, localização, notificações locais, imagem/galeria, arquivos e share intent Android.
- Shell com tabs: `Tasks`, `Media`, `Notifications` e `Menu`.
- Fatia vertical de exemplo `Tasks` com tipo, serviço, store, tela e teste.

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

## Fatia de exemplo: Tasks

`Tasks` existe para demonstrar o molde do projeto:

- tipo em `src/types/Task.ts`;
- serviço local-first em `src/services/task.service.ts`;
- store Pinia com `initialize()` em `src/stores/taskStore.ts`;
- tela Ionic em `src/views/TasksPage.vue`;
- teste em `tests/unit/stores/taskStore.spec.ts`.

Quando o domínio real entrar, remova esses arquivos e a rota/tab `tasks`.

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

# Rodar Localmente

Guia para uma pessoa clonar os dois projetos do archetype e testar no navegador
ou no emulador Android.

## Pré-requisitos

- Node.js 20+.
- Docker Desktop, ou outro MongoDB acessível.
- Para Android: Android Studio, JDK 17 e um emulador/dispositivo.

## Estrutura Esperada

Os dois projetos devem ficar como diretórios irmãos:

```text
archetype/
  android-app-starter/
  android-app-starter-backend/
```

## Subir Backend

```bash
cd android-app-starter-backend
docker compose up -d
cp .env.example .env
npm install
npm run dev
```

O backend sobe em `http://localhost:3000`.

Checks rápidos:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/auth/routes
```

Notas:

- Sem `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `GOOGLE_CALLBACK_URL`, o
  login Google fica desabilitado. Isso é esperado.
- Em desenvolvimento, se SMTP não estiver configurado, emails são apenas
  registrados no log.
- Se o `bcrypt` falhar por binário nativo ausente no Windows, rode:

```bash
npm rebuild bcrypt
```

## Subir Frontend

Em outro terminal:

```bash
cd android-app-starter
cp .env.example .env
npm install
npm run dev
```

O frontend sobe em `http://localhost:8100`.

Para testar sem OAuth nem confirmação de email, ajuste no `.env` do frontend:

```bash
VITE_API_URL=http://localhost:3000
VITE_USE_FAKE_LOGIN=true
VITE_DEEP_LINK_SCHEME=androidstarter
VITE_DEEP_LINK_HOST=auth
```

Com `VITE_USE_FAKE_LOGIN=true`, o botão "Continuar com Google" chama
`/auth/fake-login` no backend e cria uma sessão local de desenvolvimento.

## Testar Fluxos Principais

- Login pelo botão Google com `VITE_USE_FAKE_LOGIN=true`.
- Criar, editar, concluir, excluir e puxar para atualizar em `Tasks`.
- Adicionar imagem, abrir lightbox, dar zoom e remover em `Media`.
- Adicionar, abrir e remover arquivo em `Media`.
- Agendar teste em `Notifications`.
- Abrir o seletor de mapa pelo `Menu`.
- Testar tema claro/escuro/sistema no `Menu`.

## Rodar no Emulador Android

No `.env` do frontend, use:

```bash
VITE_API_URL=http://10.0.2.2:3000
```

`10.0.2.2` é o alias do emulador Android para o `localhost` da máquina.

Depois:

```bash
npm run cap:build
npx cap open android
```

O projeto nativo `android/` é versionado. O que é gerado/local fica ignorado:

- `android/.gradle`;
- `android/build`;
- `android/app/build`;
- `android/app/src/main/assets`;
- `android/local.properties`;
- keystores (`*.jks`, `*.keystore`).

## Testes e Lint

Frontend:

```bash
cd android-app-starter
npm run lint
npx vue-tsc --noEmit
npm run test:unit -- --run
```

Backend:

```bash
cd android-app-starter-backend
npm run typecheck
npm test -- --run
```

## Problemas Comuns

- Porta `3000` ocupada: pare o processo antigo ou altere `PORT` no backend.
- Porta `8100` ocupada: rode `npm run dev -- --port 8101`.
- Mongo não conecta: confirme `docker ps` e o valor de `MONGODB_URI`.
- Mudou `.env` do frontend: reinicie o Vite; variáveis `VITE_*` são lidas no
  start do servidor.
- Google OAuth abre erro: configure as variáveis do backend ou use
  `VITE_USE_FAKE_LOGIN=true` para desenvolvimento local.

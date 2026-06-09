# Android App Starter Backend

Backend Node.js + Express + MongoDB para o Android App Starter.

## O que vem pronto

- Auth por email/senha com confirmação de email.
- Login Google OAuth com escopos `profile` e `email`.
- Reset de senha por email.
- Solicitação de exclusão de conta por email.
- `fake-login` para desenvolvimento.
- Endpoint `/api/version` para checagem de versão do app.
- Contrato de erro `{ success: false, code, message, details? }`.

## Rodando

```bash
npm install
cp .env.example .env
npm run dev
```

## Variáveis principais

Veja `.env.example`.

Para Android local, use normalmente:

```bash
FRONTEND_URL=http://10.0.2.2:8100
BACKEND_URL=http://10.0.2.2:3000
MOBILE_DEEP_LINK_SCHEME=androidstarter
```

## OAuth

Configure por env:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL`

Sem essas variáveis, o login Google fica desabilitado.

## Relação com o frontend

O deep link precisa bater com o frontend e Android nativo:

- backend: `MOBILE_DEEP_LINK_SCHEME`;
- frontend: `VITE_DEEP_LINK_SCHEME`;
- Android: `AndroidManifest.xml`.

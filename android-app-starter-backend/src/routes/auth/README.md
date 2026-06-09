# Auth

Este módulo concentra a autenticação genérica do Android App Starter.

## Endpoints

- `POST /auth/register`: cria usuário por email/senha e envia confirmação.
- `POST /auth/login`: autentica usuário confirmado e retorna JWT.
- `GET /auth/google`: inicia OAuth com Google usando escopos `profile` e `email`.
- `GET /auth/google/callback`: recebe retorno do Google e redireciona para web ou deep link mobile.
- `POST /auth/process-token`: processa tokens de confirmação, reset, deleção e login OAuth.
- `POST /auth/forgot-password`: envia email de redefinição.
- `POST /auth/reset-password`: troca senha usando token.
- `POST /auth/delete-account-request`: envia confirmação de exclusão de conta.
- `POST /auth/resend-confirmation`: reenvia confirmação de email.
- `POST /auth/fake-login`: login local para desenvolvimento, desabilitado em produção.
- `POST /auth/logout`: endpoint stateless para compatibilidade do cliente.
- `GET /auth/verify`: valida JWT atual.

## Contrato

Respostas de sucesso usam `{ success, token?, user?, message, action? }`.
Erros usam `{ success: false, code, message, details? }`.

O deep link mobile é configurado por `MOBILE_DEEP_LINK_SCHEME`, com default
`androidstarter`, gerando callbacks como `androidstarter://auth?token=...`.

## Variáveis

Configure OAuth por env (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_CALLBACK_URL`). Sem essas variáveis, o login Google fica desabilitado.

# Android App Starter Backend

Backend Node.js + Express + MongoDB para o Android App Starter.

## O que vem pronto

- Auth por email/senha com confirmação de email.
- Login Google OAuth com escopos `profile` e `email`.
- Reset de senha por email.
- Solicitação de exclusão de conta por email.
- `fake-login` para desenvolvimento.
- Endpoint `/api/version` para checagem de versão do app.
- Exemplo full-stack `Tasks` em `/api/tasks`, usado pelo frontend starter para
  demonstrar store com cache local + backend.
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

## Exemplo Tasks

Rotas protegidas por JWT:

- `GET /api/tasks`: lista todas as tarefas do usuário.
- `GET /api/tasks/year/:year`: lista tarefas por ano de vencimento.
- `POST /api/tasks`: cria tarefa com `title` e `dueDate` (`YYYY-MM-DD`).
- `PUT /api/tasks/:id`: atualiza `title`, `dueDate` ou `completed`.
- `DELETE /api/tasks/:id`: remove uma tarefa do usuário.

Esse módulo é uma vertical slice de referência. Ao criar um domínio real,
remova `src/routes/taskRoutes.js`, `src/controllers/taskController.js`,
`src/services/taskService.js`, os índices de `tasks` em `src/config/db.js` e
os testes relacionados.

# Android App Starter Backend

Backend TypeScript + Node.js + Express + MongoDB para o Android App Starter.

## O que vem pronto

- Auth por email/senha com confirmação de email.
- Login Google OAuth com escopos `profile` e `email`.
- Reset de senha por email.
- Solicitação de exclusão de conta por email.
- `fake-login` para desenvolvimento.
- Endpoint `/api/version` para checagem de versão do app.
- Exemplo full-stack `Tasks` em `/api/tasks`, usado pelo frontend starter para
  demonstrar store com cache local + backend.
- Push FCM: `/api/push/*`, materialização de `push` nas Tasks, scheduler tick
  (~60s) com kill switch `PUSH_SCHEDULER_ENABLED`.
- Contrato de erro `{ success: false, code, message, details? }`.

## Rodando

```bash
docker compose up -d   # sobe o MongoDB local (root/example, porta 27017)
npm install
cp .env.example .env
npm run dev
```

O `MONGODB_URI` do `.env.example` já aponta para o Mongo do `docker-compose.yml`.
Se preferir um Mongo próprio, ajuste a URI.

## Testes

```bash
npm run typecheck
npm test -- --run
```

Para produção, gere `dist/` antes de iniciar:

```bash
npm run build
npm start
```

## Variáveis principais

Veja `.env.example`.

Para Android local, use normalmente:

```bash
FRONTEND_URL=http://10.0.2.2:8101
BACKEND_URL=http://10.0.2.2:3001
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

Convenção de datas: `dueDate` é uma data de calendário local (`YYYY-MM-DD`,
sem timezone); `createdAt` e `updatedAt` são timestamps em epoch ms gerados
pelo servidor. Lembrete push one-shot: `dueDate` + `09:00` no timezone da
conta (`users.timezone` / device), cursor embutido em `push` (não vai no wire).

## Push / FCM

Rotas JWT em `/api/push` (devices, delivery-mode, timezone, test). O tick só
arma com `PUSH_SCHEDULER_ENABLED=true` e `FIREBASE_SERVICE_ACCOUNT_B64` válido.
Detalhes: frontend `docs/PUSH-NOTIFICATIONS.md`.

Esse módulo Tasks é uma vertical slice de referência. Ao criar um domínio real,
remova as rotas/serviços de tasks (e adapte a materialização de `push` para a
nova entidade), os índices relacionados em `src/config/db.ts` e os testes.

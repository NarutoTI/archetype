# Criar Novo Projeto a Partir do Archetype

Guia operacional para uma IA criar dois novos projetos (frontend Android +
backend Node) a partir de:

- `android-app-starter`;
- `android-app-starter-backend`.

Use este documento quando o pedido for algo como: "crie um novo app baseado no
archetype".

## Informações Que a IA Deve Coletar

Antes de alterar arquivos, confirme ou defina:

- Nome do produto exibido ao usuário.
- Nome dos diretórios novos:
  - frontend, por exemplo `meu-app-frontend`;
  - backend, por exemplo `meu-app-backend`.
- Nome dos pacotes npm.
- Android application id, por exemplo `com.empresa.meuapp`.
- Deep link scheme, por exemplo `meuapp`.
- Nome do banco Mongo, por exemplo `meu-app`.
- URLs de desenvolvimento:
  - frontend web, normalmente `http://localhost:8100`;
  - backend web, normalmente `http://localhost:3000`;
  - backend no emulador, normalmente `http://10.0.2.2:3000`.
- Domínios de produção, se já existirem.
- Se as demos `Tasks`, `Media`, `Notifications` e mapa devem ser mantidas,
  renomeadas ou removidas.

## Copiar os Projetos

Copie os dois diretórios para o destino novo, sem levar artefatos locais:

- não copiar `.git`;
- não copiar `node_modules`;
- não copiar `.env`;
- não copiar `www`;
- não copiar `dist`;
- não copiar `coverage`;
- não copiar `android/.gradle`;
- não copiar `android/build`;
- não copiar `android/app/build`;
- não copiar `android/app/src/main/assets`;
- não copiar `android/local.properties`;
- não copiar keystores (`*.jks`, `*.keystore`).

Depois de copiar, inicialize Git nos novos projetos conforme a organização do
usuário (um monorepo ou dois repos separados).

## Renomear Frontend

Arquivos principais:

- `package.json`: `name`, `version`, `description`.
- `ionic.config.json`: `name`.
- `capacitor.config.ts`: `appId`, `appName`, `server.allowNavigation`,
  `android.buildOptions` quando houver assinatura.
- `.env.example`: `VITE_API_URL`, `VITE_DEEP_LINK_SCHEME`,
  `VITE_DEEP_LINK_HOST`.
- `README.md`: título, links e instruções do projeto real.
- `public/manifest.json`: `name`, `short_name`, cores e descrição.
- `public/privacy-policy.html`: produto, contato e política real.
- `src/i18n/pt.json` e `src/i18n/en.json`: `app.name` e textos de exemplo que
  continuarem no produto.

Android nativo:

- `android/app/build.gradle`: `namespace`, `applicationId`, `versionCode`,
  `versionName`.
- `android/app/src/main/res/values/strings.xml`: `app_name`,
  `title_activity_main`, `package_name`, `custom_url_scheme`.
- `android/app/src/main/AndroidManifest.xml`: deep link em
  `<data android:scheme="..." android:host="auth" />`, permissões e share
  target.
- `android/app/src/main/java/.../MainActivity.java`: mover diretório para o
  novo pacote e alterar a linha `package`.
- Ícones e splash em `android/app/src/main/res` e `public/` quando houver marca
  final.

Mantenha `android/` versionado. Ignore apenas build/cache/config local/keystore.

## Renomear Backend

Arquivos principais:

- `package.json`: `name`, `version`, `description`.
- `.env.example`: `MONGODB_URI`, `MONGODB_DB`, `FRONTEND_URL`, `BACKEND_URL`,
  `MOBILE_DEEP_LINK_SCHEME`, `GOOGLE_CALLBACK_URL`, SMTP e versões.
- `README.md`: título, comandos e fluxos do projeto real.
- `render.yaml`: nome do serviço e envs reais, se for usar Render.
- `src/config/db.js`: manter o nome do banco vindo de `MONGODB_DB`; se houver
  índices de demos removidas, remover também.
- `src/config/passport.js`: confirmar callbacks OAuth via env.
- `src/services/emailTemplates.js`: marca e texto do produto.
- `src/services/email.service.js`: `EMAIL_FROM` pelo env, sem domínio fake em
  produção.

OAuth:

- Configurar `GOOGLE_CLIENT_ID`.
- Configurar `GOOGLE_CLIENT_SECRET`.
- Configurar `GOOGLE_CALLBACK_URL`.
- No Google Cloud Console, cadastrar callback web e deep link mobile quando o
  fluxo mobile for usado.

## Decidir Sobre as Demos

As demos existem para ensinar padrões. Em um produto real, escolha caso a caso.

### Tasks

Mantém exemplos de:

- store Pinia com `initialize()`;
- cache por ano via composable genérico `useEntityYearCache`
  (memória + `Preferences` + dedupe de fetch);
- CRUD backend protegido por JWT;
- edição, swipe, pull-to-refresh, skeleton;
- notificação local por vencimento.

Para remover:

- frontend:
  - `src/types/Task.ts`;
  - `src/services/task.service.ts`;
  - `src/stores/taskStore.ts`;
  - `src/views/TasksPage.vue`;
  - rota/tab `tasks`;
  - testes `tests/unit/stores/taskStore.spec.ts`;
  - **manter** `src/composables/useEntityYearCache.ts` (e o teste
    `tests/unit/composables/useEntityYearCache.spec.ts`): é genérico e serve
    para a store do domínio real;
- backend:
  - `src/routes/taskRoutes.js`;
  - `src/controllers/taskController.js`;
  - `src/services/taskService.js`;
  - índices `tasks` em `src/config/db.js`;
  - testes relacionados.

### Media

Mantém exemplos de:

- imagem/galeria;
- lightbox com zoom;
- arquivos anexos;
- share intent Android.

Se mantiver como base real, renomeie chaves/coleções de demonstração como
`starter-demo` para nomes do domínio real.

### Notifications

Mantém exemplo de notificação local genérica. Se o produto tiver lembretes de
domínio, crie uma camada do domínio chamando `notification.service.ts`.

### Mapa

Mantém exemplo de localização com Leaflet/OpenStreetMap. Se o produto não usar
mapa, remova a tela/componente e as dependências relacionadas.

## Verificações Obrigatórias de Rename

Depois de renomear, rode buscas nos dois projetos:

```bash
rg -n "Android App Starter|androidstarter|com.example.androidstarter|android-app-starter|starter-demo|noreply@example.com"
```

Também procure nomes do archetype em minúsculas/variações:

```bash
rg -n "starter|example.androidstarter|Android Starter"
```

Nem toda ocorrência é erro (docs de archetype removidas podem citar), mas o
produto final não deve exibir essas marcas em runtime.

## Instalar e Validar

Frontend:

```bash
npm install
npm run lint
npx vue-tsc --noEmit
npm run test:unit -- --run
```

Backend:

```bash
npm install
npm test -- --run
```

Check de sintaxe JS do backend:

```powershell
$files = rg --files src tests | Where-Object { $_ -match '\.js$' }
foreach ($file in $files) {
  node --check $file
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

Android:

```bash
npm run cap:sync
```

Abra no Android Studio apenas depois de confirmar que:

- `applicationId` não é `com.example.*`;
- deep link do manifest bate com `VITE_DEEP_LINK_SCHEME` e
  `MOBILE_DEEP_LINK_SCHEME`;
- `android/local.properties` não será commitado;
- keystore não será commitado.

## Hardening Antes de Produção

- Remover `VITE_USE_FAKE_LOGIN=true`.
- Desabilitar `ENABLE_DEV_BYPASS`.
- Configurar SMTP real.
- Configurar OAuth real.
- Trocar `server.androidScheme: 'http'` por configuração adequada a HTTPS.
- Remover `server.cleartext: true` quando não for mais necessário.
- Restringir `server.allowNavigation` aos domínios reais.
- Configurar keystore fora do Git.
- Revisar política de privacidade.
- Revisar permissões Android.
- Revisar limites de mídia/arquivo em `Preferences`.

## Entrega Esperada da IA

Ao terminar, responda com:

- nomes dos dois projetos criados;
- lista curta dos principais arquivos renomeados;
- decisão sobre demos mantidas/removidas;
- comandos de validação executados;
- pendências que dependem de credenciais ou publicação (OAuth, SMTP, keystore,
  loja, domínios).

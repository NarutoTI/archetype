# Checklist de Rename Android

Ao criar um app real a partir do starter, troque:

- `package.json`: `name`, `version` e `description`.
- `ionic.config.json`: `name`.
- `capacitor.config.ts`: `appId` e `appName`.
- `android/app/build.gradle`: `namespace`, `applicationId`, `versionCode`, `versionName`.
- `android/app/src/main/res/values/strings.xml`: `app_name`, `title_activity_main`, `package_name`, `custom_url_scheme`.
- `android/app/src/main/AndroidManifest.xml`: deep link em `<data android:scheme="..." android:host="auth" />`.
- Pacote Java/Kotlin do `MainActivity`: mover a pasta e alterar a linha `package`.
- Backend: `MOBILE_DEEP_LINK_SCHEME` no `.env`.
- Frontend: `VITE_DEEP_LINK_SCHEME` no `.env`.
- Google OAuth: callback web e callback mobile no Google Cloud Console.

Evite publicar com `com.example.*`: é bom para template, mas deve ser substituído
antes da Play Store.

## Antes de publicar (hardening)

O `capacitor.config.ts` vem com defaults de desenvolvimento que devem ser
revisados antes de gerar o build de produção:

- `server.androidScheme: 'http'` e `server.cleartext: true` permitem tráfego
  sem TLS — troque para `androidScheme: 'https'` e remova `cleartext` quando o
  backend estiver em HTTPS.
- `server.allowNavigation` libera `10.0.2.2` e `localhost` — remova ou
  substitua pelos domínios reais.
- `android.buildOptions`: configure `keystorePath` e `keystoreAlias` para o
  build assinado (nunca commite o keystore).

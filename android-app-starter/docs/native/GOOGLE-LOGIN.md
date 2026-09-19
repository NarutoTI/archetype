# Login com Google — seletor nativo + Custom Tab

No Android, "Continuar com Google" abre o **seletor de contas nativo** (a folha que sobe de
baixo, via Credential Manager) e o login termina sem sair da tela. O **Custom Tab** — o
navegador por cima do app, com `GET /auth/google` e volta por deep link — continua como
fallback. Na web nada muda: redirect.

Nasce **dormente**: sem `VITE_GOOGLE_WEB_CLIENT_ID`, o app usa só o Custom Tab, como antes.
O seletor liga quando o projeto gerado tiver o app criado no Google Cloud (passos abaixo).

## Fluxo

```
toque → pickGoogleIdToken()  ── plugin @capgo/capacitor-social-login, mode 'online'
          │ ID token
          ▼
        POST /auth/google/native  ── verifica o token, confere email_verified,
          │ JWT do app                cria ou acha o usuário
          ▼
        finalizeAuthenticatedSession() → LoginPage navega pelo retorno (goAfterLogin)
```

| Situação | O que acontece |
|---|---|
| Sem `VITE_GOOGLE_WEB_CLIENT_ID` (estado de fábrica) | Custom Tab |
| Seletor falha (sem Google Play Services, SHA-1 não cadastrado, AAB antiga sem o plugin) | Custom Tab |
| Usuário fecha o seletor (`USER_CANCELLED`) | Nada — volta à tela de login, sem toast |
| Backend recusa o ID token (401 / 403 / 503) | Toast de erro; **não** abre o Custom Tab |

O último caso é de propósito: o seletor já funcionou, então o problema é de configuração
(`GOOGLE_CLIENT_ID` diferente do client web, por exemplo). Abrir o navegador esconderia a
causa e ainda contornaria a checagem de `email_verified`, que o callback do Custom Tab não
faz.

O login nativo **não** emite `onLoginGoogleSuccess`: o `signInWithGoogle` devolve o usuário
e a `LoginPage` navega, como no fake login. O evento é só do deep link do Custom Tab, que
chega fora da chamada. Emitir nos dois rodaria o `goAfterLogin` duas vezes.

Os invariantes estão em `tests/unit/services/auth.service.spec.ts` (`native Google sign-in`)
e, no backend, em `tests/unit/routes/authController.googleNative.test.ts`.

## Ligar o seletor num projeto gerado

São **dois papéis** no Google Cloud (APIs e serviços → Credenciais). Um não substitui o outro.

| Client | Tipo | Para que serve | Vai no código? |
|---|---|---|---|
| Web | Aplicativo da Web | Audience do ID token: o seletor pede o token **para este** client e o backend valida contra ele. É o mesmo do Custom Tab. | Sim: `GOOGLE_CLIENT_ID` no backend e `VITE_GOOGLE_WEB_CLIENT_ID` no front, **mesmo valor** |
| Android (debug) | Android | O Credential Manager só abre o seletor se pacote + SHA-1 do APK estiverem cadastrados. | Não |
| Android (Play) | Android | Idem, com o SHA-1 que a loja usa para assinar. | Não |

1. **Client web** — se o Custom Tab já funciona, ele existe. Copie o client ID para
   `VITE_GOOGLE_WEB_CLIENT_ID` no `.env` do front. No backend o seletor só precisa do
   `GOOGLE_CLIENT_ID`; secret e callback são do Custom Tab.
2. **Client Android de debug** — pacote do app (o `applicationId`, depois do rename) + SHA-1
   da keystore de debug do projeto ([abaixo](#keystore-de-debug-do-projeto)).
3. **Client Android da loja** — depois da primeira AAB na Play: Play Console → Protegido com
   o Google Play → Proteção da Google Play Store → Gerencie a Assinatura de Apps do Google
   Play → **Chave de assinatura do app** → SHA-1. **Não** é o SHA-1 da chave de upload: a
   Play reassina o que o usuário instala.

Armadilhas:

- O console aceita **um SHA-1 por client**: debug e Play são dois clients Android, mesmo pacote.
- O JSON baixado do client Android (`"installed"`) **não** entra no `.env` e **não** substitui
  o `google-services.json`.
- Não precisa rebuild depois de criar o client; o Google propaga em alguns minutos.
- **Não** aperte "Fazer upgrade da chave" no Play Console: troca o certificado da loja, e o
  seletor quebra até cadastrar mais um client Android.
- O **compartilhamento interno de apps** (link rápido de AAB) assina com outra chave; tracks
  internal/closed usam a chave de assinatura do app.
- O aviso de "100 logins até verificar a tela de consentimento" vale para escopo sensível ou
  restrito. Identidade (`openid`, e-mail, perfil) não é — não abra verificação por isso.
- Sem `scopes` no `SocialLogin.login`: o plugin já pede e-mail, perfil e openid, e qualquer
  `scopes` exige `MainActivity` modificada — senão o login rejeita sempre e cai no fallback.

Sintoma no Logcat quando o SHA-1 da casca que está rodando não está no console (o app cai
no Custom Tab, que usa o client web e continua funcionando):

```
Auth: This android application is not registered to use OAuth2.0
GoogleProvider: UNREGISTERED_ON_API_CONSOLE / [16] Account reauth failed
GoogleProvider: signingSha1=… package=…
```

## Keystore de debug do projeto

O SHA-1 de debug padrão é o de `~/.android/debug.keystore` — muda de máquina para máquina, e
o client Android de debug deixaria de valer em outro computador. A saída é cada projeto
gerado ter a **sua** keystore de debug versionada.

O archetype **não** traz uma: a senha `android` é pública, e todo projeto gerado herdaria a
mesma chave. Gere na criação do projeto:

```bash
keytool -genkeypair -v -keystore android/app/debug.keystore \
  -storepass android -keypass android -alias androiddebugkey \
  -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
```

Em `android/app/build.gradle`, dentro de `android { }`:

```gradle
signingConfigs {
    debug {
        storeFile file('debug.keystore')
        storePassword 'android'
        keyAlias 'androiddebugkey'
        keyPassword 'android'
    }
}
buildTypes {
    debug {
        signingConfig signingConfigs.debug
    }
    release { /* o que já existe — sem signingConfig */ }
}
```

No `.gitignore` da raiz, logo depois de `*.keystore`, libere só essa:

```
!/android/app/debug.keystore
```

A chave de **upload** da Play continua ignorada em qualquer pasta. Para ler o SHA-1:

```bash
keytool -list -v -keystore android/app/debug.keystore -alias androiddebugkey -storepass android
```

No Windows em PT-BR, se o `keytool -v` quebrar com `%2$s`, prefixe
`JAVA_TOOL_OPTIONS=-Duser.language=en`. Versione a keystore só se o repositório do projeto
for privado.

## O SDK do Facebook fica fora (`AD_ID`)

O plugin embute o SDK do Facebook **por padrão**, mesmo usando só o Google. O `facebook-core`
injeta `com.google.android.gms.permission.AD_ID`, quatro `ACCESS_ADSERVICES_*` e o install
referrer no manifesto, e a Play **recusa** a AAB se a declaração do Console diz "não usa ID
de publicidade".

Por isso o `capacitor.config.ts` tem `plugins.SocialLogin.providers.facebook: false`. O hook
do plugin (`capacitor:sync:before`) grava isso no `gradle.properties` dele a cada
`npx cap sync` — sem o sync, a config não vale. Ligar login com Facebook traz tudo de volta
(declaração do ID de publicidade e o SDK na Segurança dos dados), além de exigir outro
endpoint: no Android o Facebook não devolve ID token, e o Meta não atesta `email_verified`.

## OTA

O plugin é nativo: a primeira AAB com ele tem que ir pela loja. JS novo chegando por OTA numa
AAB antiga é compatível — o plugin responde `UNIMPLEMENTED` e o app cai no Custom Tab.

## Onde está no código

| Peça | Arquivo |
|---|---|
| Seletor + troca do token + fallback | `src/services/auth.service.ts` — `initSocialLogin`, `pickGoogleIdToken`, `signInWithGoogleIdToken`, `signInWithGoogle` |
| Tela | `src/views/LoginPage.vue` — `connectingGoogle` contra duplo toque; aquece o plugin no `onMounted` (fora do boot) |
| Verificação do ID token | backend `src/config/passport.ts` — `verifyGoogleIdToken` (`google-auth-library`, `audience` = `GOOGLE_CLIENT_ID`) |
| Endpoint | backend `src/routes/auth/authController.ts` — `handleGoogleNativeAuth`; rota em `authRoutes.ts` |

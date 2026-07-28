# Toolchain de build Android — AGP, Gradle, JDK

Documento **vivo** da cadeia de build Android do archetype. Sempre que AGP, Gradle, JDK ou
as flags de `android/gradle.properties` mudarem, este arquivo é o que deve ser atualizado.

Projetos criados a partir do archetype herdam estas versões — ver
[CREATE_NEW_PROJECT_FROM_ARCHETYPE.md](./CREATE_NEW_PROJECT_FROM_ARCHETYPE.md).

## Matriz de versões

| Componente | Versão | Onde |
|---|---|---|
| AGP (Android Gradle Plugin) | **9.2.1** | `android/build.gradle` |
| Gradle wrapper | **9.4.1** | `android/gradle/wrapper/gradle-wrapper.properties` |
| `com.google.gms:google-services` | 4.4.4 | `android/build.gradle` |
| compileSdk / targetSdk | 36 | `android/variables.gradle` |
| minSdk | 27 | `android/variables.gradle` |
| Kotlin (plugins Capacitor) | **2.4.10** | `android/variables.gradle` (`kotlin_version`) |
| JDK (toolchain) | **exatamente 21** | exigido pelos plugins Capacitor — ver *JDK* abaixo |
| Capacitor | 8.4.2 | `package.json` |

O upgrade AGP 8.13.2 → 9.2.1 / Gradle 8.14.3 → 9.4.1 foi feito em **jul/2026**.

`kotlin_version` existe porque os plugins Capacitor que aplicam `kotlin-android` caem num
default próprio (2.2.20) quando o projeto raiz não declara nada — declarar aqui mantém
todos os módulos na mesma versão de Kotlin.

## Flags AGP 9 em `android/gradle.properties`

O AGP 9 mudou vários padrões. As duas flags abaixo restauram o comportamento anterior
porque os **módulos de plugin do Capacitor em `node_modules`** ainda não migraram —
nenhuma delas é exigida pelo código do app.

| Flag | Por que existe | Quando pode sair |
|---|---|---|
| `android.builtInKotlin=false` | Plugins Capacitor (camera, filesystem, geolocation) aplicam `kotlin-android` por conta própria, incompatível com o Kotlin embutido do AGP | Quando os plugins pararem de aplicar o plugin Kotlin |
| `android.newDsl=false` | `kotlin-android` não é compatível com o DSL novo, então acompanha a flag acima. Além disso, algum plugin do classpath ainda chama a API legada de variantes | Junto com `builtInKotlin` |

**As duas andam em par** e **as duas são depreciadas, com remoção no AGP 10**. É um bloqueio
datado que depende de um release do Capacitor, não de mudança aqui.

O build acusa `libraryVariants`, `testVariants` e `unitTestVariants` como obsoletas, mas
**nenhum `build.gradle` de plugin Capacitor chama essas APIs diretamente** — a chamada vem
de algum plugin do classpath (candidato provável: o próprio Kotlin Gradle Plugin, aplicado
por camera/filesystem/geolocation). Para identificar o autor com precisão:
`./gradlew :app:assembleDebug -Pandroid.debug.obsoleteApi=true`.

Não adicione as demais flags que o assistente de upgrade do Android Studio sugere sem
justificativa: cada uma é um bloqueio a mais no AGP 10. Se precisar devolver alguma,
registre aqui **qual módulo** quebrou sem ela.

## ProGuard / R8

O AGP 9 **removeu** `getDefaultProguardFile('proguard-android.txt')`. A mensagem do
próprio AGP:

> `getDefaultProguardFile('proguard-android.txt')` is no longer supported since it includes
> `-dontoptimize`, which prevents R8 from performing many optimizations.

Por isso `android/app/build.gradle` usa `proguard-android-optimize.txt`. Como
`getDefaultProguardFile()` é resolvido na **fase de configuração**, manter o nome antigo
faria o build falhar mesmo com `minifyEnabled false` (que é o padrão do archetype).

## Biometria

O plugin é o `@capgo/capacitor-native-biometric` (8.x). O plugin legado
`capacitor-native-biometric@4.2.2` **não serve** a partir do Gradle 9: ele chama `jcenter()`,
repositório removido nessa versão.

Comportamento do prompt em `src/services/biometric.service.ts`:

- **Sem botão "Cancelar"** no Android. `allowedBiometryTypes` inclui `DEVICE_CREDENTIAL`, e o
  `BiometricPrompt` não aceita botão negativo junto de credencial do aparelho — a saída passa
  a ser o PIN/padrão/senha da tela de bloqueio.
- `MULTIPLE` é obrigatório junto de `DEVICE_CREDENTIAL`: a combinação com `FINGERPRINT` sozinho
  vira `BIOMETRIC_STRONG | DEVICE_CREDENTIAL`, que o `androidx.biometric` rejeita nas **APIs
  28-29** — e o `minSdk` daqui é 27.
- **iOS se comporta diferente:** `useFallback: true` adiciona o passcode do aparelho mas
  **mantém** o botão Cancelar. `allowedBiometryTypes` é ignorado lá.
- `description` fica sem valor de propósito — preenchê-lo com o mesmo texto do `subtitle`
  imprime a frase duas vezes no diálogo nativo.

### Armadilha ao testar no emulador

Testar biometria exige cadastrar padrão/PIN no aparelho. No emulador, isso cria um efeito
colateral confuso: depois de reiniciar, o AVD fica com o **usuário 0 travado** (Direct Boot,
armazenamento credential-encrypted ainda não liberado). Nesse estado o Android só expõe
componentes `directBootAware="true"`, então o app não sobe e o erro que aparece é:

> Activity class {…/.MainActivity} does not exist

A mensagem é enganosa — o APK está correto. Sintomas que confirmam: `ceDataInode=0` em
`adb shell dumpsys package <pkg>`, `adb shell monkey -p <pkg> 1` respondendo *No activities
found to run*, e `Failed to query usage stats for locked user 0` no logcat.

O AVD ainda pode ficar com a **tela preta** e não acordar — o `keyevent 224` (WAKEUP) pode não
funcionar, só o `keyevent 26` (POWER), e ele volta a dormir em segundos. Aí nem dá para digitar
o PIN.

**Solução:** Device Manager → *Wipe Data* no AVD (apaga o lock). Para evitar de vez, **teste
biometria em aparelho físico** — no emulador ainda seria preciso cadastrar digital simulada
(Extended Controls → Fingerprint → Touch Sensor).

Dois comportamentos conhecidos, congelados em `tests/unit/services/biometric.service.spec.ts`:

1. **Unlock que não conclui apaga o `auth_token`** e força login completo. Sem botão cancelar
   isso ficou raro, mas o gesto de voltar ainda chega lá.
2. **Se a biometria deixar de estar disponível** (usuário remove as digitais, sensor falha), o
   gate é **pulado** e o token continua valendo. O botão de senha do aparelho é uma saída
   *dentro* do prompt, não uma entrada: quem não tem biometria cadastrada não vê prompt nenhum.
   Mudar isso é decisão de produto de cada app gerado.

## Estado de validação

| Cenário | Status |
|---|---|
| `:app:assembleDebug` com AGP 9.2.1 / Gradle 9.4.1 / JBR 21 | ✅ passou (2026-07-28) |
| `:app:bundleRelease` (empacotamento AAB) | ✅ passou (2026-07-28) |

O Gradle na linha de comando precisa de um **JDK 21** detectável (ex.: JBR do Android
Studio). Com só o Java 25 do sistema, o build falha pedindo toolchain
`languageVersion=21`. Exemplo no PowerShell:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat :app:assembleDebug :app:bundleRelease
```

**Não é o Gradle rejeitando o Java 25** — ele roda em 25 (`Daemon JVM: jdk-25`). A exigência
vem de três plugins Capacitor, que declaram `kotlin { jvmToolchain(21) }` no próprio
`build.gradle`:

```
node_modules/@capacitor/camera/android/build.gradle:66
node_modules/@capacitor/filesystem/android/build.gradle:65
node_modules/@capacitor/geolocation/android/build.gradle:66
```

O casamento de toolchain no Gradle é por **igualdade** de `languageVersion`: um JDK 25 não
satisfaz `languageVersion=21`. Não é "21 ou mais novo" — é 21. E o Gradle não descobre
sozinho a JBR do Studio no Windows.

Quem decide esse número é o Capacitor. Ao subir a versão dos plugins, confira se o número
mudou: `grep -rn "jvmToolchain" node_modules/@capacitor/*/android/build.gradle`.

Alternativa permanente, sem setar `JAVA_HOME` a cada terminal — registrar a JBR em
**`~/.gradle/gradle.properties`** (arquivo do usuário, fora do repositório, então o caminho
absoluto não é versionado):

```properties
org.gradle.java.installations.paths=C:\\Program Files\\Android\\Android Studio\\jbr
```

## Comandos

```bash
cd android
./gradlew :app:assembleDebug        # smoke test de configuração + compilação
./gradlew :app:bundleRelease        # empacotamento AAB
./gradlew :app:dependencies         # resolução de dependências
```

Depois de qualquer mudança em `package.json` que envolva plugin nativo: `npx cap sync android`.

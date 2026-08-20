# OTA / Live Updates — guia operacional

Sistema de atualização do bundle web sem passar pela loja, **backend-driven**: o
alvo OTA vem do endpoint público **`GET /version`** (o mesmo que já dá o update de
loja), não de um `version.json` no R2. O R2 hospeda **só os zips**.

Este starter nasce com o OTA **desligado** (dormente): a flag `VITE_OTA_ENABLED`
fica ausente/false e os mapas do backend nascem vazios. Ligue quando tiver R2 +
uma release de loja contendo o plugin.

## Estado atual (código)

| Item | Status |
|---|---|
| Plugin `@capgo/capacitor-updater` + config `autoUpdate: "off"` | Pronto |
| `ota.service.ts` (aplica um descriptor) + `version.service.ts` (coordenador) | Pronto |
| Backend `versionService` devolve `ota` / `otaStaging` por linha nativa | Pronto (mapas vazios = OTA off) |
| `node scripts/ota/ota-release.js --upload` imprime a entrada TS pra colar no backend | Pronto; starter nasce sem assinatura |
| OTA ativo em runtime | **Dormente** até `VITE_OTA_ENABLED=true` na build + descriptor no backend |
| Custom domain R2 (cache dos zips) | A configurar (r2.dev não cacheia) |

## Como executar

Rodar na pasta do app. Há duas frentes: **jogar seu código pro emulador** (casca
local/builtin) e **publicar um OTA** (zip promovível).

### Jogar pro emulador (staging)

1. **Suba o backend local** — o app do emulador fala com `http://10.0.2.2:3001`
   (alias do host).
2. **`npm run build:simulator`** — `vite build --mode simulator` (lê o
   `.env.simulator`: staging + OTA ligado + API local) + `cap sync android`.
3. **Instale/rode no emulador** — Android Studio (Run ▶) ou `npx cap run android`.
   `build:simulator` sozinho **não** instala no device.
4. **Se o app ficar preso num OTA antigo** (Menu/versão "não muda") — rode
   `npm run ota:reset-device`, abra o app e dê os 12 toques na versão confirmando;
   volta pro builtin. Só é preciso quando havia um OTA aplicado (ver "Armadilha").

Esse fluxo **não gera OTA nenhum** — é a casca local. Pra testar a *entrega* de um
OTA de verdade, veja "Publicar um OTA".

### Publicar um OTA (`ota:release`)

O comando principal chama o Node diretamente. Como o starter não traz uma chave
privada real, ele nasce publicando sem assinatura:

```powershell
node scripts/ota/ota-release.js --upload
```

Config de URL/bucket/prefixo em `scripts/ota/ota.properties` (copie do
`ota.properties.example`; gitignored). O exemplo define `OTA_SIGN=false`.

Depois de gerar a key-v2, embarcar a `publicKey` e ligar
`VITE_OTA_REQUIRE_SIGNED=true`, o comando principal do app passa a ser:

```powershell
node scripts/ota/ota-release.js --sign --upload
```

Se preferir o atalho npm, use `npm run ota:release -- --upload` ou
`npm run ota:release -- --sign --upload`. O segundo `--` é obrigatório para o npm
repassar as flags ao script.

## Como funciona

```
[ cold start — pós-mount (Phase 3) ]
  versionService.checkAndPromptForUpdate()
    → GET /version (público; já chamado pro check de loja)
      { android: { version, storeUrl, ota:{…}, otaStaging:{…} } }
    → escolhe ota[versãoNativaDoDevice]  (canal local; produção por padrão)
    → 1) loja primeiro; recusou + tem OTA → baixa OTA silencioso (next())
      2) sem update de loja → OTA normal (Agora/Depois/Cancelar)   (1 diálogo/sessão)
  ota.service.checkForOtaUpdate(descriptor)
    → compara com o bundle rodando + gate minNativeVersion
    → diálogo → download(url,checksum) → set()/next()
notifyAppReady() roda logo após montar (fora da Phase 3): confirma que o bundle
subiu ok; pular além do appReadyTimeout reverte pro bundle anterior/builtin.
```

Zero request a mais que hoje: o `/version` **já** é chamado no boot; o OTA pega
carona. Sem `version.json` no R2 = sem Cache Rule de JSON.

## Camadas de configuração (não misturar)

| Camada | Onde | Controla | Muda como |
|---|---|---|---|
| **App** (bake-time) | `.env` → `VITE_OTA_ENABLED` / `VITE_OTA_CHANNEL` | Se a casca **tenta** OTA; canal **inicial** se não houver preferência no aparelho | Rebuild do `www/` |
| **Dispositivo** (local) | `@capacitor/preferences` → interruptor oculto na versão | De qual mapa (`ota` ou `otaStaging`) o aparelho lê | 12 toques na versão no Menu; sem rebuild |
| **Servidor** (runtime) | backend `versionService` → `ota` / `otaStaging` | **O que** está disponível ou **desligado** | Editar + deploy do backend |

`VITE_OTA_ENABLED` é a **trava dura**. Não há flag `otaEnabled` no servidor —
`ota: {}` (mapa vazio) já é o kill switch.

## Variáveis do app (Vite)

| Variável | Default | O que faz |
|---|---|---|
| `VITE_OTA_ENABLED` | off (ausente) | Só `'true'` permite `checkForOtaUpdate` |
| `VITE_OTA_CHANNEL` | `production` | Canal **inicial** (`production` \| `staging`) quando não há preferência no aparelho |
| `VITE_OTA_REQUIRE_SIGNED` | off (ausente) | Só `'true'` — rejeita descriptor OTA **sem** `sessionKey` (gate key-v2). Ligar bake-time na mesma AAB que leva a `publicKey` |

`VITE_OTA_CHANNEL=staging` fica **só no `.env.simulator`** (usado pelo
`build:simulator`), nunca em produção. `ota:release` **aborta** se o build de
produção resolver `staging` **ou se `VITE_OTA_ENABLED` não for exatamente
`true`**. O guard via `loadEnv` em
`scripts/ota/assert-production-channel.js` — cobre `.env.production.local`, aspas e
variável de ambiente). A preferência do aparelho (12 toques) sempre vence o
bake-time.

## Canal local de teste

No Menu, toque **12 vezes** na linha da versão (janela ~2 s; se pausar, zera). O
app pergunta se deve entrar/sair do canal de teste e grava só naquele aparelho.

- Produção é o padrão (mapa `ota`); teste corresponde ao mapa `otaStaging`.
- A escolha permanece após cold start e após aplicar uma OTA (fica no armazenamento
  nativo do app, imune à OTA).
- No canal de teste, o rodapé mostra um chip **`TESTE`**; um toque nele reabre o
  diálogo (`@click.stop` evita contar nos 12 toques).
- É operacional, não uma barreira de segurança; os descriptors/ZIPs são públicos.

## Backend — `ota` / `otaStaging` por linha nativa

Em `../../../android-app-starter-backend/src/services/versionService.ts`, cada
plataforma tem dois mapas **`versãoNativa` → descriptor** (tipados
`Record<string, OtaDescriptor>`, então o editor rejeita descriptor malformado):

```ts
const androidOtaStaging: Record<string, OtaDescriptor> = {
  '1.0.0': {
    bundleVersion: '1.0.0+ota.1',
    url: 'https://ota.example.com/bundles/app-1.0.0-ota.1.zip',
    checksum: '…',
    minNativeVersion: '1.0.0',
    mandatory: false,
    changelog: { pt: '…', en: '…' },
  },
};
```

- O device pega **a entrada da sua própria versão nativa** no mapa do canal local.
- **Kill switch:** esvaziar o mapa ou remover a chave da linha → nenhum OTA (após deploy).
- **Contrato validado no app:** `bundleVersion`, `url`, `checksum` e
  `minNativeVersion` são obrigatórios, e a **chave do mapa tem que ser igual à base
  do `bundleVersion`**. O app **recusa** (fail-closed) um descriptor incompleto ou
  colado na linha errada.

### Múltiplas versões nativas ao mesmo tempo

Ex.: `1.1.0` (com `+ota.2`) e `1.2.0` (com `+ota.3`) convivendo. Um device em
`1.1.0` olha só `ota["1.1.0"]`; um em `1.2.0` → `ota["1.2.0"]`.

**Coordenação loja × OTA** (1 diálogo por sessão) — **loja tem prioridade**:
1. **Update de loja primeiro.** Se aceitar, abre a loja (OTA não roda nessa sessão).
2. **Recusou a loja e a linha tem OTA** → baixa o OTA **silencioso** e aplica na
   **próxima abertura** (`next()`), sem 2º diálogo.
3. **Sem update de loja** → OTA da linha oferecido normalmente (Agora/Depois/Cancelar).

## Script `ota:release`

Gera www → zipa (checksum do `@capgo/cli`) → sobe o **zip** no R2 → **imprime a
entrada TS** pra colar no backend. Não há `version.json` nem `--channel`: o canal é
decidido por **onde** você cola (`androidOtaStaging` vs `androidOta`).

| Flag / properties | Default | O que faz |
|---|---|---|
| `--ota <n>` / `OTA_COUNTER` | auto (`last+1`) | Força o contador `+ota.n`. **Aborta se `≤` o último reservado** |
| `--min-native <ver>` / `OTA_MIN_NATIVE` | = `versionName` | Gate no descriptor |
| `--mandatory` / `OTA_MANDATORY` | `false` | `mandatory:true` no descriptor (aplica sem diálogo) |
| `--sign` / `OTA_SIGN` | `false` no starter (`ota.properties.example`) | Cifra/assina o zip (key-v2): `--key-v2` + `bundle encrypt` → `checksum` ASSINADO + `sessionKey`; sobe o zip cifrado. Depois da ativação da key-v2, defina `OTA_SIGN=true` no `ota.properties` do app e mantenha coerência com `VITE_OTA_REQUIRE_SIGNED` |
| `--no-build` / `OTA_NO_BUILD` | `false` | Usa `www/` existente somente se `ota-build-metadata.json` comprovar build `production` e flags OTA coerentes |
| `--upload` / `OTA_UPLOAD` | `false` | Sobe o zip no R2 e **reserva** o contador |
| `OTA_BASE_URL`, `OTA_R2_BUCKET`, `OTA_ZIP_PREFIX` | ver `ota.properties.example` | URL pública / bucket / prefixo do zip |

Todo build Vite grava `www/ota-build-metadata.json` com o modo e as flags OTA
realmente assadas. Antes de zipar, o release exige `production`, canal
`production`, OTA ligado e gate coerente com `--sign`. Assim, `--no-build`
**aborta** se o `www/` veio de simulator/dev, é antigo sem metadado ou foi gerado
com configuração diferente — o `.env.production` atual sozinho não mascara o
artefato errado.

### Contador (`ota-state.json`, versionado) — **GLOBAL por base**
- Um número por `base` → nomes de zip nunca colidem entre staging/produção.
- **Reservado ANTES do upload:** upload que falha **queima** o número (gap seguro);
  nunca reusa (zip é imutável). Forçar um número já usado **aborta** (fail-closed).
- Dry-run (sem `--upload`) não reserva.

### Fluxo de publicação
```powershell
# 1) Build + zip + upload do zip; imprime a entrada TS
node scripts/ota/ota-release.js --upload

# Depois de ativar key-v2 no app, publique assinado:
node scripts/ota/ota-release.js --sign --upload

# 2) Cole a entrada em androidOtaStaging["<base>"], preencha changelog, deploy do backend
# 3) Numa build com VITE_OTA_ENABLED=true, ative o canal de teste (12 toques)
# 4) Promova: copie a MESMA entrada pra androidOta["<base>"], deploy do backend
```
**Promover = copiar a entrada validada** (mesma url/checksum/bundleVersion). Nunca
rode outro upload pra "produzir" a mesma release.

## Zips no R2 e custo

- Sem manifest JSON → **sem Cache Rule de JSON**. As leituras de "qual versão" são
  o `/version` (backend, já chamado).
- Só os **zips** tocam o R2, e só quando alguém aceita um update. Zip cacheia por
  extensão; com **custom domain** vira cache hit na borda (r2.dev não cacheia).
- Cache-Control do zip (`immutable`) já é setado pelo `--upload`.

## Comportamento de aplicação

| Escolha | O que acontece |
|---|---|
| **Agora** | Toast "Baixando…" → `set()` → reinicia na hora |
| **Depois** | Baixa em silêncio → `next()` → toast; aplica na próxima abertura |
| **Cancelar** | Não baixa |
| **`mandatory: true`** | Sem diálogo; aplica na hora (`set()`) |

## Pausar / reverter (sem loja)

| Quero… | Como |
|---|---|
| **Pausar/desligar** OTA (global) | `ota: {}` no backend + deploy → kill switch |
| **Pausar uma linha** | Remover a chave daquela `versãoNativa` |
| **Corrigir** bug | Publicar `+ota.n+1` (fix-forward) e atualizar o descriptor |
| **Reverter** bundle ruim | **Fix-forward**: publicar `+ota.n+1` com o conteúdo bom. Reapontar pra `+ota.k` menor **não** reverte quem já aplicou (app só aceita versão estritamente maior) |

## Armadilha: `cap sync` não substitui OTA já aplicado

Se o aparelho já baixou um bundle Capgo, o WebView **continua** nesse zip antigo
depois de `npm run build && npx cap sync`. O sync só atualiza o `www` embutido
(builtin). Sintoma: Menu/versão "não muda".

Para voltar ao builtin após sync local, use o reset oficial do Capgo pelo app:
```powershell
npm run ota:reset-device
# mais de um device conectado:
npm run ota:reset-device -- --serial emulator-5554
# ou zerar tudo (inclui login/Preferences):
npm run ota:reset-device -- --clear-all
```
No modo normal o script só abre o app; faça 12 toques na versão e confirme — a
confirmação chama `CapacitorUpdater.reset()`, que recarrega o builtin do último
`cap sync` e preserva login/Preferences. Com mais de um device, o script aborta
até receber `--serial`.

## Disponibilidade

Se o `/version` cair, o check de loja **e** o OTA falham (fail-closed = seguro;
nenhum update ruim entra). É a mesma dependência do check de loja.

## Ligar a assinatura (key-v2)

Cifra/assina o zip OTA ponta a ponta. Serve pra defender contra origem/R2/`/version`
comprometido: o checksum simples é só integridade; a assinatura é **autenticidade**
(só quem tem a chave privada produz um bundle que a casca aceita). `--sign` está
**implementado**; nasce **desligado** (sem `.capgo_key_v2`, `--sign` falha cedo).

**Estado:** o starter continua **dormente**: não traz chave real, o gate fica desligado,
`VITE_OTA_ENABLED` nasce ausente/false e os mapas do backend ficam vazios. Se um app
ativar OTA sem fazer esta migração, o pipeline começa em texto puro. Gere uma chave
própria somente **no app criado a partir do starter**; nunca coloque uma chave privada
real neste archetype compartilhado.

### Validar no emulador antes da AAB

A `publicKey` e o gate são bake-time. Portanto, a casca do emulador também precisa
ser reconstruída com ambos antes de conseguir validar uma OTA assinada. Faça o teste
já na versão nativa que será a próxima release (por exemplo, `1.0.1`):

1. **Gerar a chave** na raiz do frontend do app:
   `npx --no-install @capgo/cli key create`
   Cria `.capgo_key_v2` (privada — **NUNCA** commitar; faça **backup seguro**, pois
   perdê-la impede assinar futuras OTAs) e `.capgo_key_v2.pub`, e injeta a
   `publicKey` no `capacitor.config.ts`.
2. **Ligar o gate nos dois builds usados pelo ensaio:** adicione
   `VITE_OTA_REQUIRE_SIGNED=true` ao `.env.simulator` (casca do emulador) **e** ao
   `.env.production` (o zip gerado por `ota:release` usa o build de produção). Sem
   isso, o guard aborta `--sign` ou a casca ainda aceita descriptor plano.
3. **Reconstruir e instalar a casca do emulador:** `npm run build:simulator` e depois
   Android Studio (Run ▶) ou `npx cap run android`. Confirme que
   `android/app/src/main/assets/capacitor.config.json` contém a `publicKey`; `cap sync`
   sozinho não altera o APK já instalado. Se houver OTA antiga ativa, volte ao builtin
   com `npm run ota:reset-device` antes do ensaio.
4. **Gerar a OTA assinada de teste:** `node scripts/ota/ota-release.js --sign --upload`.
   Cole a entrada impressa, incluindo `sessionKey`, em
   `androidOtaStaging["<versão-nativa>"]` e faça deploy do backend.
5. **Validar ponta a ponta:** no canal TESTE, confirme download, aplicação, cold start,
   versão OTA ativa e ausência de rollback. Como teste negativo, ofereça um descriptor
   sem `sessionKey` e confirme que a casca o rejeita sem baixar o zip.

Esse ensaio valida geração, cifra, checksum assinado, download e decriptação antes de
submeter uma AAB. Ele não valida a atualização pela Play nem o `resetWhenUpdate` entre
duas versões nativas; esses pontos ainda precisam da faixa de teste interno da loja.

### Fechar a release nativa e promover

1. Depois do ensaio, faça **novamente** o build de produção e
   `npx cap sync android` antes de gerar a AAB. O `build:simulator` deixa o `www`
   sincronizado com API/canal de teste e esse builtin não pode ir para a loja.
2. Gere a AAB com `publicKey`, `VITE_OTA_ENABLED=true`, canal `production` e
   `VITE_OTA_REQUIRE_SIGNED=true`; publique primeiro na faixa interna da Play.
3. Instale essa AAB e repita uma OTA assinada no `otaStaging` da **mesma linha nativa**.
   Só depois copie a MESMA entrada para `ota` e faça deploy do backend.

O script usa `--key-v2` no zip e depois `bundle encrypt`; o descriptor recebe o
**checksum assinado** e o `ivSessionKey` como `sessionKey`. O guard exige coerência:
aborta ao assinar sem gate ou ao tentar publicar plano com o gate ligado.

**Transição limpa:** a linha nativa antiga continua com OTA plano (roda a AAB antiga),
e a nova linha recebe somente descriptors assinados. O mapa por `nativeVersion` isola
as duas. **Nunca promova** para uma linha antiga um zip assinado apenas porque ele
funcionou numa casca reconstruída no emulador: a AAB antiga não leva a `publicKey` e
não conseguirá decriptá-lo.

## Pendências para ligar em produção

- Criar bucket **R2 + custom domain** (r2.dev é só teste) e preencher
  `scripts/ota/ota.properties`.
- Release de loja **contendo o plugin** (rode `npx cap sync android` antes da AAB).
- Flip `VITE_OTA_ENABLED=true` na build de produção.
- Colar o descriptor no `versionService` do backend + deploy.

## Arquivos principais

- `src/services/version.service.ts` — GET `/version`, seleção por linha/canal, coordenador loja↔OTA
- `src/services/ota.service.ts` — aplica o descriptor (compara/pergunta/baixa/aplica), `notifyAppReady`, label
- `src/services/ota-channel.service.ts` — canal local (Preferences)
- `../../../android-app-starter-backend/src/services/versionService.ts` — `ota` / `otaStaging` por linha nativa
- `scripts/ota/ota-release.js` — build → zip → upload → imprime a entrada TS
- `scripts/ota/ota-reset-device.js` — abre o app pro reset oficial do Capgo
- `scripts/ota/assert-production-channel.js` — guards do env e metadado do `www`
- `vite.config.ts` — emite `www/ota-build-metadata.json` em todo build
- `capacitor.config.ts` → `plugins.CapacitorUpdater`
- `src/main.ts` — `notifyAppReady` pós-mount; Phase 3 chama o coordenador
- `src/views/MenuView.vue` — "Verificar atualizações" + rodapé com a versão (12 toques / chip TESTE)

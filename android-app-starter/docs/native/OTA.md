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
| `npm run ota:release` imprime a entrada TS pra colar no backend | Pronto |
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

No PowerShell/npm, flags do script precisam do `--` no meio (senão o npm engole a
flag e vira dry-run local, **sem** upload):

```powershell
npm run ota:release -- --upload
# ou chamar o Node direto:
node scripts/ota/ota-release.js --upload
```

Config de URL/bucket/prefixo em `scripts/ota/ota.properties` (copie do
`ota.properties.example`; gitignored).

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
| `--no-build` / `OTA_NO_BUILD` | `false` | Usa `www/` existente |
| `--upload` / `OTA_UPLOAD` | `false` | Sobe o zip no R2 e **reserva** o contador |
| `OTA_BASE_URL`, `OTA_R2_BUCKET`, `OTA_ZIP_PREFIX` | ver `ota.properties.example` | URL pública / bucket / prefixo do zip |

### Contador (`ota-state.json`, versionado) — **GLOBAL por base**
- Um número por `base` → nomes de zip nunca colidem entre staging/produção.
- **Reservado ANTES do upload:** upload que falha **queima** o número (gap seguro);
  nunca reusa (zip é imutável). Forçar um número já usado **aborta** (fail-closed).
- Dry-run (sem `--upload`) não reserva.

### Fluxo de publicação
```powershell
# 1) Build + zip + upload do zip; imprime a entrada TS
node scripts/ota/ota-release.js --upload

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

**Estado:** o starter roda OTA em texto puro por padrão. Ligue key-v2 só quando for
preparar a próxima AAB — gerar a chave antes só cria risco de perdê-la.

**Passos (uma vez, na release nativa que vai passar a assinar):**

1. **Gerar a chave** na raiz do frontend:
   `npx --no-install @capgo/cli key create`
   Cria `.capgo_key_v2` (privada — **NUNCA** commitar, já no `.gitignore`; faça
   **backup seguro**, perdê-la impede assinar futuras OTAs) e `.capgo_key_v2.pub`,
   e injeta a `publicKey` no `capacitor.config.ts`.
2. **Release de loja** (AAB) com essa `publicKey` embarcada. A publicKey mora no
   nativo — **um OTA não consegue injetá-la** numa casca já instalada, por isso
   precisa de UMA nova versão de loja. Depois dela, as próximas voltam a ser só OTA.
3. **Publicar assinado:** `node scripts/ota/ota-release.js --sign --upload`. O script
   zipa, roda `@capgo/cli bundle encrypt` (retorna o **checksum ASSINADO** + o
   `ivSessionKey`), sobe o **zip cifrado** e imprime a entrada TS já com `sessionKey`.
   ⚠️ O `checksum` do descriptor é o retornado pelo **encrypt** (assinado), não o do
   `bundle zip` (texto puro, que é só o argumento de entrada) — o script já cuida disso.
4. **Fechar o portão:** ligue `VITE_OTA_REQUIRE_SIGNED=true` na **mesma** release
   nativa. Aí a casca rejeita qualquer descriptor **sem** `sessionKey`. Sem esse
   portão, a publicKey sozinha não obriga cifra — alguém que edite o `/version`
   poderia servir um bundle plano. **Portão (exige sessionKey) + cripto (decripta-
   ou-falha no plugin) juntos = autenticidade.**

**Transição limpa:** a linha nativa antiga continua com OTA plano (roda a AAB antiga);
a nova linha (ex. `1.0.1`) recebe só descriptors assinados. O mapa por `nativeVersion`
isola as duas — a casca nova só lê `ota["1.0.1"]`, então pode exigir assinatura sem
afetar quem está na linha antiga. Promoção segue igual: copie a MESMA entrada de
`otaStaging` para `ota`. Teste no `otaStaging` antes (baixa, reinicia, versão OTA;
e confirme que um descriptor sem `sessionKey` é rejeitado).

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
- `scripts/ota/assert-production-channel.js` — guard anti-staging nos builds promovíveis
- `capacitor.config.ts` → `plugins.CapacitorUpdater`
- `src/main.ts` — `notifyAppReady` pós-mount; Phase 3 chama o coordenador
- `src/views/MenuView.vue` — "Verificar atualizações" + rodapé com a versão (12 toques / chip TESTE)

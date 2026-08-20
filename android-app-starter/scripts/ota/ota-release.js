import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { assertProductionChannel, assertSignConsistency } from './assert-production-channel.js';

/**
 * Pipeline de release OTA (manual, self-hosted). Ver docs/native/OTA.md.
 *
 * Builda o bundle web, zipa com o @capgo/cli (checksum autoritativo), sobe o zip
 * no Cloudflare R2 e IMPRIME uma entrada TS pronta pra colar no `versionService`
 * do backend (não há manifest no R2 — o app lê o alvo OTA da resposta de
 * `/version`).
 *
 * Versionamento em duas camadas:
 * - App de loja -> "1.0.0"            (versionName)
 * - Bundle OTA  -> "1.0.0+ota.<n>"    (contador bumpado aqui)
 *
 * O contador é GLOBAL por versão base (não por canal) para os nomes de zip nunca
 * colidirem. Staging vs produção é decidido por ONDE você cola a entrada no
 * backend (`androidOtaStaging` vs `androidOta`) — promova copiando a MESMA
 * entrada, nunca re-subindo.
 *
 * Uso:
 *   node scripts/ota/ota-release.js [--ota <n>] [--min-native <ver>]
 *                                   [--mandatory] [--sign] [--no-build] [--upload]
 *
 * --sign cifra o bundle ponta a ponta (key-v2): roda `@capgo/cli bundle encrypt`
 * com a chave privada local .capgo_key_v2, então o descriptor leva o checksum
 * ASSINADO + ivSessionKey e o zip publicado é o cifrado (o checksum em texto puro
 * é só o argumento de entrada do encrypt). A casca nativa precisa já embarcar a
 * publicKey correspondente (um release de loja) — ver docs/native/OTA.md.
 *
 * Config (prioridade: flag CLI > env do shell > scripts/ota/ota.properties > default):
 *   OTA_BASE_URL, OTA_R2_BUCKET, OTA_ZIP_PREFIX, OTA_COUNTER, OTA_MIN_NATIVE,
 *   OTA_MANDATORY, OTA_SIGN, OTA_UPLOAD, OTA_NO_BUILD
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const otaDir = __dirname;
const frontendDir = path.join(__dirname, '../..');
const PROPERTIES_PATH = path.join(otaDir, 'ota.properties');

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

/** Lê KEY=VALUE do ota.properties (comentários e linhas em branco ignorados). */
function loadOtaProperties(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const raw of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function truthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? '').trim());
}

function resolveConfig(key, props, fallback) {
  if (process.env[key] != null && process.env[key] !== '') return process.env[key];
  if (props[key] != null && props[key] !== '') return props[key];
  return fallback;
}

const props = loadOtaProperties(PROPERTIES_PATH);
const OTA_BASE_URL = String(
  resolveConfig('OTA_BASE_URL', props, 'https://ota.example.com/bundles'),
).replace(/\/$/, '');
const OTA_R2_BUCKET = String(resolveConfig('OTA_R2_BUCKET', props, 'app-ota'));
const OTA_ZIP_PREFIX = String(resolveConfig('OTA_ZIP_PREFIX', props, 'app'));

// ---------------------------------------------------------------------------
// Args (CLI sobrepõe ota.properties / defaults de env)
// ---------------------------------------------------------------------------
function parseArgs(argv, defaults) {
  const args = { ...defaults };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ota') args.ota = Number(argv[++i]);
    else if (a === '--min-native') args.minNative = argv[++i];
    else if (a === '--no-build') args.build = false;
    else if (a === '--upload') args.upload = true;
    else if (a === '--mandatory') args.mandatory = true;
    else if (a === '--sign') args.sign = true;
  }
  return args;
}

const counterRaw = resolveConfig('OTA_COUNTER', props, '');
const counterFromConfig =
  counterRaw !== '' && Number.isFinite(Number(counterRaw)) ? Number(counterRaw) : null;

const args = parseArgs(process.argv.slice(2), {
  ota: counterFromConfig,
  minNative: resolveConfig('OTA_MIN_NATIVE', props, null) || null,
  build: !truthy(resolveConfig('OTA_NO_BUILD', props, 'false')),
  upload: truthy(resolveConfig('OTA_UPLOAD', props, 'false')),
  mandatory: truthy(resolveConfig('OTA_MANDATORY', props, 'false')),
  sign: truthy(resolveConfig('OTA_SIGN', props, 'false')),
});

// --sign precisa da chave privada presente logo de cara — falha cedo com
// orientação em vez de buildar um bundle inteiro à toa.
if (args.sign && !fs.existsSync(path.join(frontendDir, '.capgo_key_v2'))) {
  fail(
    '--sign pedido mas .capgo_key_v2 (chave privada key-v2) não existe. ' +
    'Gere uma vez com `npx --no-install @capgo/cli key create` (ao preparar a próxima AAB) ' +
    'e faça backup seguro da privada. Ver docs/native/OTA.md § Ligar a assinatura (key-v2).'
  );
}

// Um zip OTA é promovível para produção — nunca pode assar o canal staging.
// (Roda mesmo com --no-build para um www/ staging obsoleto também tropeçar.)
assertProductionChannel(frontendDir, fail);
// --sign tem que casar com o gate bake-time (VITE_OTA_REQUIRE_SIGNED) desta linha
// nativa, para assinado/plano nunca divergirem do que a casca instalada exige.
assertSignConsistency(frontendDir, args.sign, fail);

// ---------------------------------------------------------------------------
// Versão base nativa (do versionName no android build.gradle; fallback package.json)
// ---------------------------------------------------------------------------
function readBaseVersion() {
  const buildGradlePath = path.join(frontendDir, 'android', 'app', 'build.gradle');
  if (fs.existsSync(buildGradlePath)) {
    const m = fs.readFileSync(buildGradlePath, 'utf8').match(/versionName\s+["']([^"']+)["']/);
    if (m) return m[1];
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(frontendDir, 'package.json'), 'utf8'));
  if (!pkg.version) fail('Não foi possível resolver a versão base (build.gradle / package.json)');
  return pkg.version;
}

// ---------------------------------------------------------------------------
// Estado do contador OTA — GLOBAL por versão base (versionado em scripts/ota/)
// ---------------------------------------------------------------------------
const statePath = path.join(otaDir, 'ota-state.json');

function readState() {
  if (!fs.existsSync(statePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return {};
  }
}

function nextOtaCounter(state, base, forced) {
  if (Number.isFinite(forced) && forced > 0) return forced;
  const last = state?.[base] ?? 0;
  return last + 1;
}

function saveState(state, base, counter) {
  state[base] = counter;
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------
const base = readBaseVersion();
const state = readState();
const lastCounter = state?.[base] ?? 0;
const counter = nextOtaCounter(state, base, args.ota);
const bundleVersion = `${base}+ota.${counter}`;          // campo do descriptor
const fileTag = `${base}-ota.${counter}`;                // seguro p/ arquivo/URL (sem '+')
const zipName = `${OTA_ZIP_PREFIX}-${fileTag}.zip`;
const minNativeVersion = args.minNative || base;

// Zips são imutáveis: reusar um contador sobrescreveria um objeto já publicado
// e possivelmente cacheado. Um --ota forçado tem que ser estritamente maior que
// o último reservado — falha fechado em vez de sobrescrever.
if (Number.isFinite(args.ota) && args.ota <= lastCounter) {
  fail(
    `--ota ${args.ota} <= último reservado (${lastCounter}) para a base ${base}. ` +
    `Reusar um número sobrescreveria um zip imutável (uns aparelhos ficariam com a versão antiga em cache). ` +
    `Use um número > ${lastCounter}.`
  );
}

console.log(`\n📦 OTA release`);
console.log(`   base (loja):    ${base}`);
console.log(`   bundleVersion:  ${bundleVersion}`);
console.log(`   minNative:      ${minNativeVersion}`);
console.log(`   mandatory:      ${args.mandatory}`);
console.log(`   signed (key-v2):${args.sign}`);
console.log(`   upload:         ${args.upload}`);
console.log(`   baseUrl:        ${OTA_BASE_URL}`);
console.log(`   bucket:         ${OTA_R2_BUCKET}`);
console.log(`   zip:            ${zipName}\n`);

// 1) Build do bundle web -> www/
if (args.build) {
  console.log('🔨 Build...');
  try {
    execSync('npm run build', { stdio: 'inherit', cwd: frontendDir });
  } catch {
    fail('Erro no build');
  }
} else {
  console.log('⏭️  --no-build: usando www/ existente');
}
if (!fs.existsSync(path.join(frontendDir, 'www', 'index.html'))) {
  fail('www/index.html não encontrado — rode o build antes (ou remova --no-build)');
}

// 2) Zip via @capgo/cli (checksum autoritativo, formato correto pro plugin)
console.log('🗜️  Zip via @capgo/cli...');
let checksum = null;
// --key-v2 no zip quando for assinar: alinha o checksum ao contrato oficial da
// cifra v2 (não cifra sozinho; o passo 2b é que cifra). Sem --sign, zip normal.
const zipKeyV2 = args.sign ? ' --key-v2' : '';
try {
  const out = execSync(
    `npx --no-install @capgo/cli bundle zip --path www --bundle ${bundleVersion} --name ${zipName}${zipKeyV2} --json`,
    { cwd: frontendDir, encoding: 'utf8' }
  );
  // --json pode vir cercado de outras linhas de log; extrai o último bloco {...}.
  const match = out.match(/\{[\s\S]*\}/);
  if (match) {
    const parsed = JSON.parse(match[0]);
    checksum = parsed.checksum || parsed.hash || parsed.signature || null;
  }
} catch (e) {
  fail(`Erro ao gerar o zip: ${e.message}`);
}
if (!checksum) {
  fail('Não foi possível extrair o checksum do output do @capgo/cli --json. Abortando (não publicar sem checksum).');
}

// 2b) Assina (key-v2). Cifra o zip em texto puro com a .capgo_key_v2 local para
// a casca nativa (que carrega a publicKey correspondente) poder verificar/decriptar.
// O `checksum` acima é só a ENTRADA do encrypt; o descriptor passa a levar o
// checksum ASSINADO + ivSessionKey retornados pelo encrypt, e o arquivo publicado
// vira o zip CIFRADO (mantido com o mesmo nome limpo).
let sessionKey = null;
if (args.sign) {
  console.log('🔐 Assinando (key-v2) via @capgo/cli bundle encrypt...');
  let signedChecksum = null;
  let encFilename = `${zipName}_encrypted.zip`;
  try {
    const out = execSync(
      `npx --no-install @capgo/cli bundle encrypt ${zipName} ${checksum} --json`,
      { cwd: frontendDir, encoding: 'utf8' }
    );
    const match = out.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      signedChecksum = parsed.checksum || null;   // checksum assinado (substitui o texto puro)
      sessionKey = parsed.ivSessionKey || null;   // iv:sessionKey cifrada -> vai no descriptor
      if (parsed.filename) encFilename = parsed.filename;
    }
  } catch (e) {
    fail(`Erro ao assinar (bundle encrypt): ${e.message}`);
  }
  if (!signedChecksum || !sessionKey) {
    fail('bundle encrypt não retornou checksum/ivSessionKey. Abortando (não publicar assinatura incompleta).');
  }
  // Troca o zip em texto puro pelo cifrado, mantendo o mesmo nome limpo (nome/
  // extensão é cosmético; o que importa para o plugin é o conteúdo). Remove o plano
  // primeiro: no Windows, renameSync não sobrescreve um destino existente (EPERM).
  const encPath = path.join(frontendDir, path.basename(encFilename));
  if (!fs.existsSync(encPath)) fail(`Arquivo cifrado esperado não encontrado: ${encPath}`);
  const cleanPath = path.join(frontendDir, zipName);
  fs.rmSync(cleanPath, { force: true });
  fs.renameSync(encPath, cleanPath);
  checksum = signedChecksum; // o descriptor passa a usar o checksum assinado
  console.log('✓ Bundle cifrado + assinado (key-v2)');
}

// 3) Stage do zip localmente em ota-dist/bundles/
const zipSrc = path.join(frontendDir, zipName);
if (!fs.existsSync(zipSrc)) fail(`Zip esperado não encontrado: ${zipSrc}`);
const distDir = path.join(frontendDir, 'ota-dist');
const bundlesDir = path.join(distDir, 'bundles');
fs.mkdirSync(bundlesDir, { recursive: true });
const zipDest = path.join(bundlesDir, zipName);
fs.rmSync(zipDest, { force: true }); // Windows: renameSync não sobrescreve destino existente (EPERM)
fs.renameSync(zipSrc, zipDest);

// Monta o descriptor para colar no versionService do backend.
const descriptor = {
  bundleVersion,
  url: `${OTA_BASE_URL}/${zipName}`,
  checksum,
  ...(sessionKey ? { sessionKey } : {}),
  minNativeVersion,
  mandatory: args.mandatory,
  changelog: { pt: '', en: '' },
};
const descriptorPath = path.join(distDir, `descriptor-${fileTag}.json`);
fs.writeFileSync(descriptorPath, JSON.stringify({ [base]: descriptor }, null, 2) + '\n');

console.log(`\n✓ zip:        ${path.relative(frontendDir, zipDest)}`);
console.log(`✓ descriptor: ${path.relative(frontendDir, descriptorPath)}`);
console.log(`✓ checksum:   ${checksum}`);

// 4) Sobe o zip imutável no R2. Reserva o contador ANTES para um upload falho
// queimar o número (gap seguro) em vez de um retry reusar+sobrescrever.
const CACHE_ZIP = 'public, max-age=31536000, immutable';
const putZip = `npx wrangler r2 object put "${OTA_R2_BUCKET}/bundles/${zipName}" --file "${zipDest}" --content-type application/zip --cache-control "${CACHE_ZIP}" --remote`;

if (args.upload) {
  saveState(state, base, counter); // reserva ANTES do upload (gap-safe, nunca reusa)
  console.log('\n☁️  Upload do zip para R2...');
  try {
    execSync(putZip, { stdio: 'inherit', cwd: frontendDir });
    console.log('✓ Upload concluído');
  } catch {
    fail(`Upload falhou. +ota.${counter} já foi reservado (gap seguro, NÃO reuse). Rode de novo → número novo.`);
  }
} else {
  console.log('\n📋 Dry-run (contador NÃO reservado). Para publicar:');
  console.log(`   ${putZip}`);
  console.log('   (ou rode de novo com --upload)');
}

// 5) Diz ao operador o que colar onde — entrada TS (casa com os mapas tipados do
// versionService: chaves sem aspas, aspas simples), pronta pra colar como está.
const changelogTs = Object.keys(descriptor.changelog)
  .map((l) => `${l}: ''`)
  .join(', ');
const sessionKeyLine = sessionKey ? `    sessionKey: '${sessionKey}',\n` : '';
const tsEntry =
  `  '${base}': {\n` +
  `    bundleVersion: '${bundleVersion}',\n` +
  `    url: '${descriptor.url}',\n` +
  `    checksum: '${checksum}',\n` +
  sessionKeyLine +
  `    minNativeVersion: '${minNativeVersion}',\n` +
  `    mandatory: ${args.mandatory},\n` +
  `    changelog: { ${changelogTs} },\n` +
  `  },`;

console.log('\n📌 Cole esta entrada no versionService do backend, dentro do mapa da linha nativa:');
console.log('   teste → const androidOtaStaging    |    produção → const androidOta');
console.log('   Promover = copiar a MESMA entrada de androidOtaStaging p/ androidOta. Depois, deploy do backend.');
console.log('   Changelog opcional (qualquer locale do app; vazio cai na mensagem genérica).\n');
console.log(tsEntry);

console.log(`\n✅ OTA ${bundleVersion} pronto.`);

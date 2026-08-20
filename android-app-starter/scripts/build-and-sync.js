import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { assertStoreReleaseGuards } from './ota/assert-production-channel.js';
import { parseBumpArgs, parseSemver, resolveNextVersion } from './android-version.js';

/**
 * Release nativo de loja: bump de versionName/versionCode no FRONTEND, build de
 * produção e `cap sync android`. Não gera AAB (isso é Android Studio).
 *
 * Este starter **não** edita o backend: a versão de loja no
 * `android-app-starter-backend` vem de `ANDROID_APP_VERSION` (env), não de um
 * literal no `versionService.ts`. Ao gerar um app que hardcodar a versão no
 * backend (estilo My Memories), estenda este script para substituir esse
 * literal e abortar se package.json / Gradle / backend divergirem — ver
 * docs/CREATE_NEW_PROJECT_FROM_ARCHETYPE.md.
 *
 * Flags: --patch (default) | --minor | --major | --version X.Y.Z | --keep
 * No PowerShell chame o Node direto: `node scripts/build-and-sync.js --minor`
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const frontendDir = path.join(__dirname, '..');

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

const versionCodeRegex = /versionCode\s+(\d+)/;
const versionNameRegex = /versionName\s+["']([^"']+)["']/;

let bumpArgs;
try {
  bumpArgs = parseBumpArgs(process.argv.slice(2));
} catch (error) {
  fail(error.message);
}

// ---------------------------------------------------------------------------
// Fase 1 — ler e validar TUDO antes de gravar.
// ---------------------------------------------------------------------------

assertStoreReleaseGuards(frontendDir, fail);

const packageJsonPath = path.join(frontendDir, 'package.json');
if (!fs.existsSync(packageJsonPath)) fail(`package.json não encontrado em ${packageJsonPath}`);
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const oldVersion = packageJson.version;
if (!oldVersion) fail('Campo "version" ausente no package.json do frontend');
try {
  parseSemver(oldVersion);
} catch (error) {
  fail(error.message);
}

let newVersion;
try {
  newVersion = resolveNextVersion(oldVersion, bumpArgs);
} catch (error) {
  fail(error.message);
}

const buildGradlePath = path.join(frontendDir, 'android', 'app', 'build.gradle');
if (!fs.existsSync(buildGradlePath)) fail(`build.gradle não encontrado em ${buildGradlePath}`);
let buildGradleContent = fs.readFileSync(buildGradlePath, 'utf8');
const versionCodeMatch = buildGradleContent.match(versionCodeRegex);
if (!versionCodeMatch) fail('Não foi possível encontrar versionCode no build.gradle');
const versionNameMatch = buildGradleContent.match(versionNameRegex);
if (!versionNameMatch) fail('Não foi possível encontrar versionName no build.gradle');

const gradleName = versionNameMatch[1];
if (gradleName !== oldVersion) {
  fail(
    `Versões desalinhadas antes do bump: package.json=${oldVersion}, ` +
      `build.gradle versionName=${gradleName}. Alinhe os dois e rode de novo.`,
  );
}

const oldVersionCode = Number(versionCodeMatch[1]);
if (!Number.isInteger(oldVersionCode) || oldVersionCode < 1) {
  fail(`versionCode inválido no build.gradle: "${versionCodeMatch[1]}".`);
}
const newVersionCode = bumpArgs.bump === 'keep' ? oldVersionCode : oldVersionCode + 1;
if (newVersionCode < oldVersionCode) {
  fail(`versionCode não pode diminuir (${oldVersionCode} → ${newVersionCode}).`);
}

console.log(`\n📦 Release nativo`);
console.log(`   bump:         ${bumpArgs.bump}${bumpArgs.exact ? ` (${bumpArgs.exact})` : ''}`);
console.log(`   versionName:  ${oldVersion} → ${newVersion}`);
console.log(`   versionCode:  ${oldVersionCode} → ${newVersionCode}\n`);

// ---------------------------------------------------------------------------
// Fase 2 — fontes validadas; agora grava.
// ---------------------------------------------------------------------------

if (bumpArgs.bump !== 'keep') {
  packageJson.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log(`✓ package.json: ${oldVersion} → ${newVersion}`);

  buildGradleContent = buildGradleContent.replace(versionCodeRegex, `versionCode ${newVersionCode}`);
  buildGradleContent = buildGradleContent.replace(versionNameRegex, `versionName "${newVersion}"`);
  fs.writeFileSync(buildGradlePath, buildGradleContent);
  console.log(`✓ build.gradle versionCode: ${oldVersionCode} → ${newVersionCode}`);
  console.log(`✓ build.gradle versionName: ${gradleName} → ${newVersion}`);
} else {
  console.log('⏭️  --keep: versionName/versionCode inalterados; só build + cap sync.');
}

// ---------------------------------------------------------------------------
// Fase 3 — build + sync Android.
// ---------------------------------------------------------------------------

console.log('\n🔨 Executando build...');
try {
  execSync('npm run build', { stdio: 'inherit', cwd: frontendDir });
  console.log('✓ Build concluído com sucesso!');
} catch {
  fail('Erro ao executar build');
}

console.log('\n📱 Sincronizando com Android...');
try {
  execSync('npx cap sync android', { stdio: 'inherit', cwd: frontendDir });
  console.log('✓ Sincronização Android concluída!');
} catch {
  fail('Erro ao sincronizar com Android');
}

console.log(`\n✅ Processo completo! Versão: ${newVersion} (versionCode ${newVersionCode})`);
console.log('   No PowerShell, chame o Node direto (npm + --flag pode virar dry-run):');
console.log('   node scripts/build-and-sync.js --minor');

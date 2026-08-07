/**
 * Abre o app para o desenvolvedor resetar o bundle Capgo ativo via
 * CapacitorUpdater.reset(). O CLI do Capgo não tem comando de reset de device, e
 * este script de propósito NÃO mexe nos arquivos privados do Capgo.
 *
 * Uso:
 *   node scripts/ota/ota-reset-device.js
 *   node scripts/ota/ota-reset-device.js --serial emulator-5554
 *   node scripts/ota/ota-reset-device.js --clear-all   # pm clear (apaga login/prefs)
 *   npm run ota:reset-device
 *   npm run ota:reset-device -- --clear-all
 */
import { execFileSync, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const PACKAGE_ID = 'com.example.androidstarter';
const clearAll = process.argv.includes('--clear-all');

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Uso: npm run ota:reset-device -- [--serial <adb-serial>] [--clear-all]');
  console.log('  Sem --clear-all: abre o app para o reset oficial do Capgo (preserva dados).');
  console.log('  Com --clear-all: limpa todos os dados do app, incluindo login/Preferences.');
  process.exit(0);
}

const serialFlagIndex = process.argv.indexOf('--serial');
const requestedSerial = serialFlagIndex === -1 ? null : process.argv[serialFlagIndex + 1];
if (serialFlagIndex !== -1 && (!requestedSerial || requestedSerial.startsWith('-'))) {
  fail('--serial precisa receber o serial mostrado por `adb devices`.');
}

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function resolveAdb() {
  const fromPath = (() => {
    try {
      const which = process.platform === 'win32' ? 'where adb' : 'which adb';
      const out = execSync(which, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .trim()
        .split(/\r?\n/)[0];
      if (out && fs.existsSync(out)) return out;
    } catch {
      /* fora do PATH */
    }
    return null;
  })();
  if (fromPath) return fromPath;

  const sdkRoots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk'),
    path.join(os.homedir(), 'Library', 'Android', 'sdk'),
    path.join(os.homedir(), 'Android', 'Sdk'),
  ].filter(Boolean);

  for (const root of sdkRoots) {
    const candidate = path.join(
      root,
      'platform-tools',
      process.platform === 'win32' ? 'adb.exe' : 'adb',
    );
    if (fs.existsSync(candidate)) return candidate;
  }

  fail('adb não encontrado. Instale platform-tools ou adicione ao PATH / ANDROID_HOME.');
}

function adb(adbPath, args, { allowFail = false } = {}) {
  try {
    return execFileSync(adbPath, args, { encoding: 'utf8' }).trim();
  } catch (error) {
    if (allowFail) return '';
    const detail = error.stderr?.toString?.() || error.message;
    fail(`adb ${args.join(' ')} falhou:\n${detail}`);
  }
}

const adbPath = resolveAdb();
const devices = adb(adbPath, ['devices'])
  .split(/\r?\n/)
  .slice(1)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('*'))
  .map((line) => {
    const [serial, state] = line.split(/\s+/);
    return { serial, state };
  })
  .filter((d) => d.state === 'device');

if (devices.length === 0) {
  fail('Nenhum device/emulator conectado (`adb devices`).');
}
if (requestedSerial) {
  const selected = devices.find((device) => device.serial === requestedSerial);
  if (!selected) {
    fail(
      `O serial "${requestedSerial}" não está conectado como device pronto. ` +
        `Disponíveis: ${devices.map((device) => device.serial).join(', ') || '(nenhum)'}`,
    );
  }
} else if (devices.length > 1) {
  fail(
    `Há ${devices.length} devices conectados. Informe um explicitamente: ` +
      `npm run ota:reset-device -- --serial ${devices[0].serial}`,
  );
}

const serial = requestedSerial || devices[0].serial;
const withSerial = ['-s', serial];

console.log(`Device: ${serial}`);
console.log(`Package: ${PACKAGE_ID}`);

if (clearAll) {
  console.log('Limpando dados do app (pm clear) — login e Preferences também saem…');
  adb(adbPath, [...withSerial, 'shell', 'pm', 'clear', PACKAGE_ID]);
  console.log('✓ App data limpa. Reabra o app (builtin).');
  process.exit(0);
}

console.log('Parando o app…');
adb(adbPath, [...withSerial, 'shell', 'am', 'force-stop', PACKAGE_ID], {
  allowFail: true,
});

console.log('Abrindo o app…');
adb(adbPath, [...withSerial, 'shell', 'monkey', '-p', PACKAGE_ID, '1']);
console.log('✓ App aberto.');
console.log('  Faça 12 toques na linha da versão e confirme a troca de canal.');
console.log('  A confirmação chama CapacitorUpdater.reset() e volta ao builtin do último cap sync.');
console.log('  Se o OTA ativo for anterior a essa ação, use --clear-all uma única vez para migrar.');

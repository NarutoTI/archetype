/**
 * Gera os ícones do Android a partir de public/android-chrome-512x512.png.
 * Cada densidade recebe o tamanho que o Android espera. Não cria
 * ic_launcher_foreground.png: o manifesto usa só ic_launcher e ic_launcher_round.
 *
 * A origem deve ser um quadrado cheio e opaco. Se tiver transparência, o
 * ícone herda uma moldura translúcida, e o script avisa no final.
 * Requer Python 3 com Pillow (`pip install pillow`).
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'node:child_process';

const source = 'public/android-chrome-512x512.png';
const resRoot = 'android/app/src/main/res';

const densities = [
  ['mipmap-mdpi', 48],
  ['mipmap-hdpi', 72],
  ['mipmap-xhdpi', 96],
  ['mipmap-xxhdpi', 144],
  ['mipmap-xxxhdpi', 192],
];

const outputs = ['ic_launcher.png', 'ic_launcher_round.png'];

function pngSize(file) {
  const buf = fs.readFileSync(file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function createDirectories() {
  for (const [folder] of densities) {
    fs.mkdirSync(path.join(resRoot, folder), { recursive: true });
  }
}

function removeStaleForegrounds() {
  for (const [folder] of densities) {
    const stale = path.join(resRoot, folder, 'ic_launcher_foreground.png');
    if (fs.existsSync(stale)) {
      fs.unlinkSync(stale);
      console.log(`🗑️  Removido: ${stale}`);
    }
  }
}

function resizeWithPillow() {
  const jobs = densities.flatMap(([folder, size]) =>
    outputs.map((name) => ({
      dest: path.join(resRoot, folder, name).replaceAll('\\', '/'),
      size,
    })),
  );
  const code = `
import json, sys
from PIL import Image
src, jobs = sys.argv[1], json.loads(sys.argv[2])
image = Image.open(src).convert("RGBA")
for job in jobs:
    image.resize((job["size"], job["size"]), Image.Resampling.LANCZOS).save(job["dest"], "PNG", optimize=True)
print(image.getchannel("A").getextrema()[0])
`;
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const result = spawnSync(python, ['-c', code, source, JSON.stringify(jobs)], {
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.log('❌ Não foi possível redimensionar. É preciso Python com Pillow.');
    return null;
  }
  // O Python devolve o menor alfa da origem; abaixo de 255 o ícone sai translúcido.
  return Number(result.stdout.trim());
}

function verifySizes() {
  let ok = true;
  for (const [folder, size] of densities) {
    for (const name of outputs) {
      const file = path.join(resRoot, folder, name);
      const { width, height } = pngSize(file);
      if (width !== size || height !== size) {
        console.log(`❌ ${file} ficou ${width}x${height}; esperado ${size}x${size}`);
        ok = false;
      } else {
        console.log(`✅ ${file} ${size}x${size}`);
      }
    }
  }
  return ok;
}

function organizeIcons() {
  console.log('📱 Gerando ícones do Android a partir de 512x512...\n');

  if (!fs.existsSync('android')) {
    console.log('⚠️  Pasta android/ não encontrada. Execute primeiro:');
    console.log('   npx cap add android');
    return false;
  }
  if (!fs.existsSync(source)) {
    console.log(`⚠️  Arquivo não encontrado: ${source}`);
    return false;
  }

  createDirectories();
  removeStaleForegrounds();
  const minAlpha = resizeWithPillow();
  if (minAlpha === null || !verifySizes()) {
    return false;
  }

  console.log('\n🎉 Ícones gerados nos tamanhos de cada densidade.');
  console.log('   Só ic_launcher.png e ic_launcher_round.png.');
  if (minAlpha < 255) {
    console.log(`\n⚠️  ${source} tem transparência (alfa mínimo ${minAlpha}).`);
    console.log('   O ícone do Android sai com moldura translúcida. Deixe a origem opaca.');
  }
  return true;
}

process.exit(organizeIcons() ? 0 : 1);

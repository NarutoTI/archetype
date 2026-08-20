/**
 * Regras de bump da versão de loja (semver X.Y.Z). Usado por build-and-sync.js.
 * OTA não passa daqui: o contador +ota.n vive em scripts/ota/.
 */

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseSemver(version) {
  const match = String(version ?? '').trim().match(SEMVER);
  if (!match) {
    throw new Error(`Versão inválida "${version}". Use semver X.Y.Z (ex.: 1.0.129).`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function formatSemver({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}

/** -1 se a < b, 0 se iguais, 1 se a > b. */
export function compareSemver(left, right) {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;
  return 0;
}

export function bumpSemver(version, kind) {
  const parsed = parseSemver(version);
  if (kind === 'major') return formatSemver({ major: parsed.major + 1, minor: 0, patch: 0 });
  if (kind === 'minor') return formatSemver({ major: parsed.major, minor: parsed.minor + 1, patch: 0 });
  if (kind === 'patch') return formatSemver({ major: parsed.major, minor: parsed.minor, patch: parsed.patch + 1 });
  throw new Error(`Tipo de bump desconhecido: "${kind}". Use patch, minor ou major.`);
}

/**
 * Flags: --patch (default) | --minor | --major | --version X.Y.Z | --keep
 * --keep não muda versionName (já editado à mão); o script ainda pode só buildar.
 */
export function parseBumpArgs(argv) {
  let bump = null;
  let exact = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--patch' || arg === '--minor' || arg === '--major' || arg === '--keep') {
      if (bump) {
        throw new Error(`Flags de versão conflitantes (--${bump} e ${arg}). Use só uma.`);
      }
      bump = arg.slice(2);
    } else if (arg === '--version') {
      if (bump) {
        throw new Error(`Flags de versão conflitantes (--${bump} e --version). Use só uma.`);
      }
      bump = 'exact';
      exact = argv[++i];
      if (!exact || String(exact).startsWith('-')) {
        throw new Error('--version exige um semver (ex.: --version 1.1.0).');
      }
    } else if (String(arg).startsWith('-')) {
      throw new Error(
        `Flag desconhecida: ${arg}. Use --patch, --minor, --major, --version X.Y.Z ou --keep.`,
      );
    }
  }
  return { bump: bump || 'patch', exact };
}

export function resolveNextVersion(current, { bump, exact }) {
  parseSemver(current);
  if (bump === 'keep') return current;
  if (bump === 'exact') {
    parseSemver(exact);
    if (compareSemver(exact, current) <= 0) {
      throw new Error(
        `--version ${exact} precisa ser maior que a atual ${current}. ` +
          `Se já está em ${current}, use --keep para só gerar o build.`,
      );
    }
    return exact;
  }
  return bumpSemver(current, bump);
}

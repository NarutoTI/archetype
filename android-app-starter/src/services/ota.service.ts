import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater, type CurrentBundleResult } from '@capgo/capacitor-updater';
import { alertService } from './alert.service';
import { toastService } from './toast.service';
import { logger } from '@/utils/logger';
import i18n from '@/i18n';

/**
 * Serviço de OTA / Live Update (modo manual, self-hosted).
 *
 * O alvo OTA vem da resposta do backend em `/version` (ver version.service.ts) —
 * NÃO de um manifest no R2. Este módulo só APLICA um descriptor: compara com o
 * bundle rodando, pergunta, baixa e aplica. O R2 hospeda só os zips.
 * Ver docs/native/OTA.md.
 *
 * Versionamento em duas camadas:
 * - App de loja -> semver limpo no versionName ("1.0.0").
 * - Bundle OTA  -> "<versionName>+ota.<n>" ("1.0.0+ota.3").
 *
 * O plugin vem com autoUpdate: 'off', então nada acontece sozinho — este serviço
 * dirige cada passo pelo JS.
 */

// Lê env vars custom do Vite de forma defensiva (podem não estar em env.d.ts).
const env = import.meta.env as unknown as Record<string, string | undefined>;

/**
 * Trava de compatibilidade bake-time: só cascas buildadas com esta flag tentam
 * OTA. A disponibilidade quem decide é o SERVIDOR (descriptor presente ou não);
 * esta flag só libera se a casca instalada pode sequer tentar.
 */
const OTA_ENABLED = env.VITE_OTA_ENABLED === 'true';

/**
 * Endurecimento bake-time do key-v2. Quando uma casca leva publicKey e assume a
 * linha nativa como assinada, ligue isto para REJEITAR descriptor SEM sessionKey.
 * A publicKey sozinha não obriga cifra — quem editar o `/version` poderia servir
 * um bundle plano; este é o portão da frente para que só o caminho decripta-ou-
 * falha do plugin seja aceito. Desligado por padrão: linhas planas e cascas
 * pré-key-v2 seguem funcionando.
 */
const OTA_REQUIRE_SIGNED = env.VITE_OTA_REQUIRE_SIGNED === 'true';

/** O plugin reporta este id de bundle quando nenhum OTA foi aplicado ainda. */
const BUILTIN_BUNDLE_ID = 'builtin';

/** Alvo OTA de uma linha nativa, entregue pela resposta do backend em `/version`. */
export interface OtaDescriptor {
  /** "<versaoNativa>+ota.<n>", ex.: "1.0.0+ota.3". */
  bundleVersion: string;
  /** URL absoluta do zip do bundle (R2). */
  url: string;
  /**
   * Checksum verificado pelo plugin. Em OTA plana, vem de `bundle zip --json`;
   * com key-v2, é o checksum assinado devolvido por `bundle encrypt`. Obrigatório.
   */
  checksum: string;
  /** Session key (ivSessionKey) para bundles cifrados com key-v2. */
  sessionKey?: string;
  /** versionName nativo mínimo capaz de rodar este bundle (gate de compat). Obrigatório. */
  minNativeVersion: string;
  /** Quando true, aplica sem perguntar. Use com parcimônia; nunca na splash. */
  mandatory?: boolean;
  /** Changelog por locale mostrado no prompt de aceite. */
  changelog?: Record<string, string>;
}

/**
 * Faz o parse de "<maj>.<min>.<pat>[+ota.<n>]" -> [maj, min, pat, otaCounter].
 * "1.0.0" puro (sem +ota) conta como otaCounter 0 — igual ao mapeamento builtin.
 */
export function parseOtaVersion(v: string): [number, number, number, number] {
  const [base, meta] = String(v).split('+');
  const [maj, min, pat] = base.split('.');
  const ota = meta?.startsWith('ota.') ? Number(meta.slice(4)) : 0;
  const safe = (n: number) => (Number.isFinite(n) ? n : 0);
  return [safe(Number(maj)), safe(Number(min)), safe(Number(pat)), safe(ota)];
}

/**
 * True se `latest` é um pacote OTA mais novo que `current`.
 * A base nativa (major.minor.patch) manda; o contador +ota.<n> só desempata.
 * Base-first também bloqueia reinstalar uma linha web antiga numa casca nativa
 * mais nova (ex.: device em 1.2.0+ota.0 NÃO pode aceitar 1.1.0+ota.5).
 */
export function isNewerOtaBundle(latest: string, current: string): boolean {
  const a = parseOtaVersion(latest);
  const b = parseOtaVersion(current);
  for (let i = 0; i < 4; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false; // igual
}

/**
 * O bundle builtin não tem label OTA — seu conteúdo web É o que veio no
 * versionName nativo instalado, então compare como "<versaoNativa>+ota.0".
 * `current.native` é o versionName de loja reportado pelo plugin.
 */
export function effectiveBundleVersion(current: CurrentBundleResult): string {
  if (current.bundle.id === BUILTIN_BUNDLE_ID || !current.bundle.version) {
    return `${current.native}+ota.0`;
  }
  return current.bundle.version;
}

/**
 * O versionName nativo (de loja) tem que ser >= minNativeVersion. Gate de
 * compat para nunca aplicar um bundle feito p/ casca mais nova numa mais antiga.
 */
export function satisfiesNative(minNativeVersion: string | undefined, nativeVersion: string): boolean {
  if (!minNativeVersion) return true;
  return !isNewerOtaBundle(minNativeVersion, nativeVersion);
}

/**
 * Valida um descriptor vindo do `/version` (editado à mão) antes de usar.
 * Falha fechado (retorna null, logando o motivo) quando falta campo obrigatório,
 * ou quando a chave do mapa (versão nativa deste device) não bate com a base do
 * bundle — o que significaria descriptor colado na linha nativa errada.
 */
export function sanitizeOtaDescriptor(
  raw: unknown,
  nativeVersion: string,
): OtaDescriptor | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const candidate = raw as Partial<OtaDescriptor>;
  const nonEmpty = (v: unknown): boolean => typeof v === 'string' && v.trim() !== '';
  if (!nonEmpty(candidate.bundleVersion) || !nonEmpty(candidate.url) || !nonEmpty(candidate.checksum) || !nonEmpty(candidate.minNativeVersion)) {
    logger.error('OTA descriptor rejeitado: falta bundleVersion/url/checksum/minNativeVersion', raw);
    return null;
  }
  const descriptor = candidate as OtaDescriptor;
  const base = descriptor.bundleVersion.split('+')[0].trim();
  if (base !== nativeVersion) {
    logger.error(`OTA descriptor rejeitado: chave "${nativeVersion}" != base do bundle "${base}"`, raw);
    return null;
  }
  // Portão key-v2 (assinado): casca que exige cifra rejeita descriptor sem
  // sessionKey, deixando o decripta-ou-falha do plugin como único caminho aceito.
  // No-op a menos que VITE_OTA_REQUIRE_SIGNED tenha sido assado.
  if (OTA_REQUIRE_SIGNED && !nonEmpty(descriptor.sessionKey)) {
    logger.error('OTA descriptor rejeitado: bundle assinado exigido mas sessionKey ausente', raw);
    return null;
  }
  return descriptor;
}

/** Como aplicar após o download, ou null se o usuário cancelou. */
type OtaApplyMode = 'now' | 'next';

/** Opções de {@link checkForOtaUpdate}. */
export interface OtaCheckOptions {
  /**
   * Pula o prompt: baixa e aplica na PRÓXIMA abertura (nunca recarrega agora).
   * Usado como fix de consolação depois que o usuário recusou o update de loja,
   * pra quem não atualiza ainda receber o patch da sua linha sem um 2º diálogo.
   */
  silent?: boolean;
}

async function promptUser(descriptor: OtaDescriptor): Promise<OtaApplyMode | null> {
  const locale = i18n.global.locale.value as string;
  // Entradas de changelog vazias/em branco caem na mensagem genérica
  // (?? só pega null/undefined, não '').
  const changelog = (descriptor.changelog?.[locale] || descriptor.changelog?.en || '').trim();
  const message = changelog || i18n.global.t('version.ota.message');

  const result = await alertService.presentCustomAlert({
    header: i18n.global.t('version.ota.updateAvailable'),
    message,
    cssClass: 'alert-primary',
    buttons: [
      {
        text: i18n.global.t('common.cancel'),
        role: 'cancel',
        cssClass: 'alert-button-secondary',
      },
      {
        text: i18n.global.t('version.ota.applyNextOpen'),
        role: 'next',
        cssClass: 'alert-button-secondary',
      },
      {
        text: i18n.global.t('version.ota.applyNow'),
        role: 'confirm',
        cssClass: 'alert-button-primary',
      },
    ],
  });

  if (result.role === 'confirm') return 'now';
  if (result.role === 'next') return 'next';
  return null; // cancel / backdrop
}

async function downloadAndApply(descriptor: OtaDescriptor, mode: OtaApplyMode): Promise<void> {
  // "now" ganha um toast de download (o set() recarrega antes de um toast final).
  // "next" espera um único toast no fim — evita dois popups em sequência.
  if (mode === 'now') {
    toastService.presentToastSuccess(i18n.global.t('version.ota.downloading'));
  }

  const bundle = await CapacitorUpdater.download({
    url: descriptor.url,
    version: descriptor.bundleVersion,
    checksum: descriptor.checksum,     // o plugin verifica a integridade quando passado
    sessionKey: descriptor.sessionKey, // setado só para bundles cifrados key-v2
  });

  if (mode === 'now') {
    // Terminal: troca o bundle e recarrega a WebView na hora.
    await CapacitorUpdater.set({ id: bundle.id });
    return;
  }

  // Caminho silencioso: instala no próximo cold start sem interromper agora.
  await CapacitorUpdater.next({ id: bundle.id });
  toastService.presentToastSuccess(i18n.global.t('version.ota.willApplyNextOpen'));
}

/**
 * Chamar em toda abertura (só nativo), logo após montar e ANTES de qualquer
 * request de rede. Confirma que o bundle ativo está saudável; pular isso além do
 * appReadyTimeout faz o plugin reverter pro bundle anterior/builtin.
 */
export async function notifyAppReady(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await CapacitorUpdater.notifyAppReady();
  } catch (error) {
    logger.error('OTA notifyAppReady falhou:', error);
  }
}

/**
 * Reseta o bundle ativo pela API pública do Capgo e volta ao www builtin da
 * casca nativa. O Capgo recarrega o app imediatamente.
 */
export async function resetToBuiltin(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await CapacitorUpdater.reset();
}

/**
 * Aplica o descriptor OTA da linha nativa DESTE device (selecionado pelo
 * version.service a partir da resposta de `/version`). Só nativo, nunca bloqueia
 * o boot. Retorna true se agiu nesta sessão (prompt mostrado, ou aplicação
 * mandatory/silenciosa) para o chamador tratar a linha como resolvida.
 */
export async function checkForOtaUpdate(
  descriptor: OtaDescriptor | null | undefined,
  options: OtaCheckOptions = {},
): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || !OTA_ENABLED || !descriptor) return false;
  try {
    const current = await CapacitorUpdater.current();
    if (!isNewerOtaBundle(descriptor.bundleVersion, effectiveBundleVersion(current))) return false;
    if (!satisfiesNative(descriptor.minNativeVersion, current.native)) return false;

    // Caminho silencioso (recusou a loja): sem diálogo. Baixa e aplica na próxima
    // abertura — recarregar logo depois do "depois" seria agressivo.
    if (options.silent) {
      try {
        await downloadAndApply(descriptor, 'next');
      } catch (error) {
        logger.error('OTA download/aplicação silenciosa falhou:', error);
        return false;
      }
      return true;
    }

    // Há update disponível. Retorna true após mostrar uma superfície (prompt ou
    // aplicação mandatory) para o Menu não dizer "em dia".
    if (descriptor.mandatory === true) {
      try {
        await downloadAndApply(descriptor, 'now');
      } catch (error) {
        logger.error('OTA download/aplicação falhou:', error);
        toastService.presentToastError(i18n.global.t('version.errorChecking'));
      }
      return true;
    }

    const mode = await promptUser(descriptor);
    if (!mode) return true; // cancelou — mostrou o diálogo, sem download

    try {
      await downloadAndApply(descriptor, mode);
    } catch (error) {
      logger.error('OTA download/aplicação falhou:', error);
      toastService.presentToastError(i18n.global.t('version.errorChecking'));
    }
    return true;
  } catch (error) {
    logger.error('Checagem de OTA falhou:', error);
    return false;
  }
}

/**
 * Formata o bundle ativo como "<base> (<otaCounter>)", ex.: "1.0.0 (3)".
 * No bundle builtin (nenhum OTA aplicado ainda) mostra só o versionName nativo.
 */
export function formatBundleLabel(current: CurrentBundleResult): string {
  if (current.bundle.id === BUILTIN_BUNDLE_ID || !current.bundle.version) {
    return current.native; // ex.: "1.0.0"
  }
  const [maj, min, pat, ota] = parseOtaVersion(current.bundle.version);
  return `${maj}.${min}.${pat} (${ota})`; // ex.: "1.0.0 (3)"
}

/** Label do bundle ativo para uma linha de menu/debug (só nativo). */
export async function getActiveBundleLabel(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    return formatBundleLabel(await CapacitorUpdater.current());
  } catch {
    return null;
  }
}

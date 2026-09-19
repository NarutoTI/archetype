import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import {
  BiometricAuthError,
  BiometryType,
  NativeBiometric,
  type BiometricOptions,
} from '@capgo/capacitor-native-biometric';
import i18n from '@/i18n';
import { logger } from '@/utils/logger';

/**
 * Desfecho de uma tentativa de unlock biométrico.
 *
 * `dismissed` separa "o usuário saiu do prompt / o sistema o interrompeu" de `failed`
 * ("a digital foi recusada ou o aparelho não consegue destravar"). A distinção existe
 * porque só `failed` pode derrubar a sessão: fechar o app ou mandá-lo para segundo
 * plano com o prompt na tela faz o Android disparar USER_CANCEL/SYSTEM_CANCEL, e tratar
 * isso como falha apagava o token sem o usuário ter errado a digital.
 */
export type BiometricAuthOutcome = 'success' | 'dismissed' | 'failed';

/**
 * Margem para a Activity morrer depois de `exitApp()` antes de o boot ser liberado.
 * Se o processo continuar vivo além disso, o unlock volta ao caminho seguro (apagar o
 * token) em vez de deixar o app abrir destravado ou congelar para sempre.
 */
export const EXIT_GRACE_PERIOD_MS = 5000;

class BiometricService {
  private isAvailableCache: boolean | null = null;
  private biometryTypeCache: BiometryType | null = null;
  private canPromptCache: boolean | null = null;

  /**
   * Há digital/face cadastrada neste aparelho? (`useFallback: false` no nativo.)
   *
   * Sem chamador de produção hoje: interruptor, convite pós-login e boot usam
   * `canPromptForAuth`. Mantido para tela futura que precise dessa pergunta
   * estreita — **não** para decidir prompt nem o toggle. Testes em
   * `biometric.service.spec.ts`.
   */
  async isAvailable(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
    if (this.isAvailableCache !== null) return this.isAvailableCache;

    try {
      const result = await NativeBiometric.isAvailable();
      this.isAvailableCache = result.isAvailable;
      this.biometryTypeCache = result.biometryType;
      return result.isAvailable;
    } catch (error) {
      logger.error('Biometric availability check failed:', error);
      this.isAvailableCache = false;
      return false;
    }
  }

  /**
   * Disponibilidade medida pelo que o prompt realmente aceita, e não só pela digital.
   *
   * `isAvailable()` usa o default `useFallback: false` do nativo. O prompt em
   * `authenticateWithOutcome` permite `DEVICE_CREDENTIAL` (PIN/padrão/senha do
   * aparelho) — perguntar sem fallback reprovava aparelhos que o prompt destravaria.
   * Quem apagava as digitais e mantinha o PIN abria o app sem autenticação.
   *
   * O menu e o boot usam **este** método. Cache próprio, separado do
   * `isAvailableCache`: o portão do `checkBiometricAuth` preenche e o de
   * `authenticateWithOutcome` só lê — **uma consulta nativa de disponibilidade**
   * por inicialização. O prompt (`verifyIdentity`) é outra ida.
   */
  async canPromptForAuth(): Promise<boolean> {
    try {
      if (!Capacitor.isNativePlatform()) return false;
      if (this.canPromptCache !== null) return this.canPromptCache;

      const result = await NativeBiometric.isAvailable({ useFallback: true });
      this.canPromptCache = result.isAvailable;
      // O tipo de biometria não depende do fallback; aproveita a mesma ida ao nativo.
      this.biometryTypeCache = result.biometryType;
      return result.isAvailable;
    } catch (error) {
      logger.error('Biometric prompt availability check failed:', error);
      this.canPromptCache = false;
      return false;
    }
  }

  /**
   * Tipo cadastrado (digital, face, etc.). Sem chamador de produção hoje.
   * Não decide prompt nem interruptor — isso é `canPromptForAuth`.
   */
  async getBiometryType(): Promise<BiometryType | null> {
    if (this.biometryTypeCache !== null) return this.biometryTypeCache;
    try {
      const result = await NativeBiometric.isAvailable();
      this.biometryTypeCache = result.biometryType;
      return result.biometryType;
    } catch {
      return null;
    }
  }

  async authenticate(
    reason = 'Authentication required',
    title?: string,
    subtitle?: string,
  ): Promise<boolean> {
    return (await this.authenticateWithOutcome(reason, title, subtitle)) === 'success';
  }

  /**
   * Mesma solicitação de `authenticate`, devolvendo o desfecho em três estados.
   * Hoje só o `checkBiometricAuth` precisa do motivo; o menu continua em `authenticate`.
   */
  async authenticateWithOutcome(
    reason = 'Authentication required',
    title?: string,
    subtitle?: string,
  ): Promise<BiometricAuthOutcome> {
    try {
      if (!(await this.canPromptForAuth())) {
        logger.warn('Biometric authentication not available');
        return 'failed';
      }

      const options: BiometricOptions = {
        reason,
        title,
        subtitle,
        // Sem `description`: o diálogo nativo desenha subtitle e description em
        // linhas separadas; repetir o subtitle imprimia duas vezes.
        //
        // DEVICE_CREDENTIAL troca o botão cancelar pelo PIN/padrão/senha do sistema —
        // o BiometricPrompt não aceita os dois. MULTIPLE mantém todas as classes
        // biométricas cadastradas; DEVICE_CREDENTIAL + FINGERPRINT sozinho é combinação
        // que o androidx.biometric rejeita na API 28-29. Sem `negativeButtonText` pelo
        // mesmo motivo: não há botão negativo.
        allowedBiometryTypes: [BiometryType.MULTIPLE, BiometryType.DEVICE_CREDENTIAL],
        // No iOS, oferece o código do aparelho depois de uma leitura biométrica recusada.
        useFallback: true,
        maxAttempts: 5,
      };

      await NativeBiometric.verifyIdentity(options);
      return 'success';
    } catch (error: unknown) {
      const code = Number((error as { code?: unknown })?.code);

      if (
        code === BiometricAuthError.USER_CANCEL ||
        code === BiometricAuthError.USER_FALLBACK
      ) {
        logger.log('Biometric authentication cancelled by user');
        return 'dismissed';
      }
      if (
        code === BiometricAuthError.APP_CANCEL ||
        code === BiometricAuthError.SYSTEM_CANCEL
      ) {
        logger.log('Biometric authentication interrupted');
        return 'dismissed';
      }
      if (code === BiometricAuthError.AUTHENTICATION_FAILED) {
        logger.warn('Biometric authentication rejected');
      } else if (
        code === BiometricAuthError.USER_LOCKOUT ||
        code === BiometricAuthError.USER_TEMPORARY_LOCKOUT
      ) {
        logger.warn('Too many biometric authentication attempts');
      } else if (
        code === BiometricAuthError.BIOMETRICS_UNAVAILABLE ||
        code === BiometricAuthError.BIOMETRICS_NOT_ENROLLED ||
        code === BiometricAuthError.PASSCODE_NOT_SET
      ) {
        logger.warn('Biometric unavailable or not enrolled on this device');
      } else {
        logger.error('Biometric authentication failed:', error);
      }
      return 'failed';
    }
  }

  /**
   * Unlock biométrico do cold start, chamado na Fase 1 do `main.ts`.
   *
   * Só mostra o prompt com `auth_token` salvo, `biometry-enabled` = `'true'` e algo
   * com que destravar — digital **ou** bloqueio de tela (`canPromptForAuth`).
   *
   * - **Dispensado/interrompido:** sessão preservada, `exitWithoutClearingSession`.
   *   Sem botão cancelar no Android junto de `DEVICE_CREDENTIAL`; sair do prompt é
   *   o caminho comum. Apagar o token aqui punia quem só fechou o app.
   * - **Recusado** (digital negada, lockout): apaga o `auth_token` e cai no login.
   *
   * LIMITE CONHECIDO: sem digital **e** sem bloqueio de tela, a saída rápida devolve
   * `false` e o boot restaura a sessão. Não há segundo fator a pedir. O portão só
   * roda na inicialização do JS. Retomar a mesma instância já autenticada não pede
   * de novo. `exitApp()` pode encerrar a Activity e deixar o processo vivo; a
   * próxima WebView pede outra vez.
   *
   * SÓ-PIN: biometria já ligada, digitais apagadas, tela de bloqueio no lugar — o
   * boot pede o PIN do aparelho. O interruptor do menu usa o mesmo critério e
   * continua visível para ligar/desligar.
   *
   * NÃO ENDURECER O `catch` DESTE MÉTODO. Não é política de todo `Preferences.remove`.
   * Devolver `false` com o token ainda lá — e o `main.ts` seguir — é deliberado.
   * No `clearToken()` do `auth.service` a rejeição hipotética do `remove` do token
   * deve continuar **propagando**.
   *
   * @returns `true` só quando o usuário destravou; `false` em qualquer outro caso.
   */
  async checkBiometricAuth(): Promise<boolean> {
    try {
      const [tokenResult, biometryEnabledResult] = await Promise.all([
        Preferences.get({ key: 'auth_token' }),
        Preferences.get({ key: 'biometry-enabled' }),
      ]);

      if (!tokenResult.value) return false;
      if (biometryEnabledResult.value !== 'true') return false;
      if (!(await this.canPromptForAuth())) return false;

      const outcome = await this.authenticateWithOutcome(
        i18n.global.t('biometric.authenticateToLogin'),
        i18n.global.t('biometric.authenticationRequired'),
        i18n.global.t('biometric.authenticatePrompt'),
      );

      if (outcome === 'success') return true;

      if (outcome === 'dismissed') {
        logger.warn('Biometric unlock dismissed, keeping the session and closing the app');
        await this.exitWithoutClearingSession();
        return false;
      }

      logger.warn('Biometric authentication failed, clearing token');
      await Preferences.remove({ key: 'auth_token' });
      return false;
    } catch (error) {
      logger.error('Error during biometric check:', error);
      return false;
    }
  }

  /**
   * Encerra o app preservando o `auth_token` depois de um unlock apenas dispensado.
   *
   * `exitApp()` resolve a Promise **antes** de a Activity terminar, e o boot em
   * `main.ts` continua logo após este método. Sem a espera, `initializeAuth()` e o
   * `mount()` podem desenhar tela autenticada no intervalo. Se `exitApp` não existir
   * (Web, iOS) ou o processo sobreviver à margem, volta-se a apagar o token.
   */
  private async exitWithoutClearingSession(): Promise<void> {
    try {
      const { App } = await import('@capacitor/app');
      await App.exitApp();
    } catch (error) {
      logger.error('Failed to close the app after a dismissed unlock:', error);
      await Preferences.remove({ key: 'auth_token' });
      return;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, EXIT_GRACE_PERIOD_MS));

    logger.warn('App still running after exitApp, clearing token as a fallback');
    await Preferences.remove({ key: 'auth_token' });
  }

  resetCache(): void {
    this.isAvailableCache = null;
    this.biometryTypeCache = null;
    this.canPromptCache = null;
  }
}

export const biometricService = new BiometricService();

import type { AppVersionInfo, OtaDescriptor } from '../types/version.js';

/**
 * Version Service
 *
 * Serve o payload público de `GET /version`: a versão de LOJA por plataforma
 * (dispara o prompt de atualização nativo) E o alvo OTA por linha nativa.
 *
 * O controle de OTA mora aqui de propósito — `/version` é público e já é chamado
 * em todo cold start, então é o lugar único para decidir o que está no ar:
 * - `ota`        -> alvo OTA de produção, por versão nativa.
 * - `otaStaging` -> alvo OTA de staging (só builds de teste leem).
 * - mapa vazio / chave ausente -> sem OTA para aquela linha (kill switch).
 *
 * Para publicar um OTA: rode `npm run ota:release` no app e cole a entrada
 * impressa sob a chave da versão nativa abaixo. Os mapas são tipados
 * `Record<string, OtaDescriptor>`, então o editor rejeita um descriptor
 * malformado ou colado sem a chave da versão. Promova um bundle validado copiando
 * a MESMA entrada de `androidOtaStaging` para `androidOta`, depois faça deploy.
 *
 * No starter os mapas nascem VAZIOS = OTA desligado por padrão.
 *
 * A versão de loja (`android.version`) vem de `ANDROID_APP_VERSION`. O
 * `build:android` do frontend não edita este arquivo — depois do bump, alinhe
 * esse env no deploy. Se o app gerado hardcodar a versão aqui, estenda o
 * script (ver android-app-starter/docs/CREATE_NEW_PROJECT_FROM_ARCHETYPE.md).
 */

// Android — alvos OTA de produção, por versão nativa. Vazio = OTA desligado.
const androidOta: Record<string, OtaDescriptor> = {};

// Android — alvos OTA de staging (só o canal staging / builds de teste leem).
const androidOtaStaging: Record<string, OtaDescriptor> = {};

export const getAppVersionInfo = (): AppVersionInfo => ({
  android: {
    version: process.env.ANDROID_APP_VERSION || '1.0.0',
    minSupportedVersion: process.env.ANDROID_MIN_SUPPORTED_VERSION || '1.0.0',
    storeUrl: process.env.ANDROID_STORE_URL || '',
    ota: androidOta,
    otaStaging: androidOtaStaging,
  },
  ios: {
    version: process.env.IOS_APP_VERSION || '1.0.0',
    minSupportedVersion: process.env.IOS_MIN_SUPPORTED_VERSION || '1.0.0',
    storeUrl: process.env.IOS_STORE_URL || '',
    ota: {},
    otaStaging: {},
  },
});

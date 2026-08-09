import { loadEnv } from 'vite';

/**
 * Guard para caminhos de build que produzem artefatos PROMOVÍVEIS (AAB de loja,
 * zip OTA): o bundle nunca pode assar `staging` como canal inicial e precisa
 * manter OTA ligado. Um bundle promovido carregando `staging` jogaria devices
 * de produção (sem preferência local) para o `otaStaging`; um ZIP com OTA
 * desligado impediria a própria casca atualizada de buscar os próximos OTAs.
 *
 * Resolve VITE_OTA_CHANNEL exatamente como o Vite faria para o build de produção
 * — todas as camadas .env em ordem (.env, .env.local, .env.production,
 * .env.production.local) mais variáveis VITE_ do ambiente — então aspas,
 * `.env.production.local` e export no shell também são cobertos, não só o
 * literal do .env.production.
 *
 * @param {string} frontendDir  raiz do app (o envDir do Vite)
 * @param {(message: string) => never} fail  callback de abort (loga + sai)
 */
export function assertProductionChannel(frontendDir, fail) {
  const env = loadEnv('production', frontendDir);
  if (env.VITE_OTA_CHANNEL === 'staging') {
    fail(
      'VITE_OTA_CHANNEL=staging resolvido para o build de produção — vazaria staging ' +
        'num bundle promovível. staging só no .env.simulator (build:simulator). ' +
      'Ponha production (ou remova) em .env.production / .env.production.local / variável de ambiente.',
    );
  }
  if (env.VITE_OTA_ENABLED !== 'true') {
    fail(
      'VITE_OTA_ENABLED precisa resolver exatamente para true no build de produção. ' +
        'Sem isso, um ZIP OTA aplicado deixa de procurar as próximas atualizações. ' +
        'Defina VITE_OTA_ENABLED=true em .env.production / .env.production.local / variável de ambiente.',
    );
  }
}

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

/**
 * Trava a coerência assinatura↔gate no momento do release. O gate
 * `VITE_OTA_REQUIRE_SIGNED` é assado na casca da linha nativa atual (mesmo
 * `.env.production` que gera o AAB dessa linha), então `--sign` tem que casar com
 * ele — senão você publica ou (a) um ZIP assinado numa casca que ainda aceita OTA
 * plano (falsa sensação de segurança), ou (b) um ZIP plano numa casca que o
 * rejeita (a própria casca recusa o descriptor sem sessionKey).
 *
 * @param {string} frontendDir raiz do app (envDir do Vite)
 * @param {boolean} sign se o release está rodando com --sign
 * @param {(message: string) => never} fail callback de abort (loga e encerra)
 */
export function assertSignConsistency(frontendDir, sign, fail) {
  const env = loadEnv('production', frontendDir);
  const requireSigned = env.VITE_OTA_REQUIRE_SIGNED === 'true';
  if (requireSigned && !sign) {
    fail(
      'VITE_OTA_REQUIRE_SIGNED=true (a casca desta linha exige OTA assinada) mas você ' +
        'não passou --sign: a casca rejeitaria este descriptor por falta de sessionKey. ' +
        'Rode com --sign.',
    );
  }
  if (sign && !requireSigned) {
    fail(
      '--sign passado mas VITE_OTA_REQUIRE_SIGNED != true: a casca ainda aceitaria OTA ' +
        'plano, então a assinatura não protege de fato. Ligue VITE_OTA_REQUIRE_SIGNED=true ' +
        'na build da casca (mesma release nativa) — ou rode sem --sign.',
    );
  }
}

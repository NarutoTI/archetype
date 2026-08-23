import type { Directive } from 'vue';

/**
 * Resgata o `click` que o Chrome às vezes não sintetiza depois de um toque limpo.
 *
 * **O problema (medido, ago/2026).** Logo depois de navegar no calendário, ~20% dos toques
 * morriam: chegavam `pointerdown` e `pointerup` no alvo certo, com o dedo parado (`max=0px`,
 * zero `pointermove`), nó vivo, nada de `preventDefault` — e **nenhum `click`**. Não é do
 * app: doze rodadas de instrumentação eliminaram fila de thread, remoção de nó, hit-test,
 * rolagem, sobreposição de grades e o guard de swipe.
 *
 * **O que está provado e o que não está.** Provado: o click de compatibilidade não foi
 * emitido, com a sequência de ponteiro íntegra. **Não** provado: qual subsistema do browser
 * decidiu não emitir — isso exigiria instrumentar o motor, não a página. A issue #23793 da
 * Ionic (fechada, e específica de `ion-item-sliding`) serve de analogia de sintoma, não de
 * prova de causa. Ver `docs/APP-CHROME-LAYOUT.md` § Toque perdido.
 *
 * **A saída.** Não substituir o click: **completá-lo**. Num toque que qualifica como tap, se
 * o `click` real não chegar dentro de uma janela curta, esta diretiva despacha um sintético
 * no elemento sob o dedo. Handlers existentes (`@click`, listeners do Ionic, fallthrough de
 * componente) continuam sendo o único caminho — ninguém precisa mudar de API.
 *
 * **Por que `elementFromPoint` e não um seletor de alvos.** A primeira versão recebia o
 * seletor dos alvos acionáveis, e as falhas que sobraram foram todas de alvos fora dele:
 * barras de execução, cartões do ano, e — o caso decisivo — taps iniciados durante o slide,
 * quando as grades estão `pointer-events: none` e o alvo do `pointerdown` passa a ser o
 * próprio viewport. A regra passou a ser **ativação pela coordenada de soltura**: onde o dedo
 * subiu decide o alvo, resolvido no instante do despacho (ver `resolveTarget`).
 *
 * Isto é política deste app, não a semântica portável do browser: a recomendação de Pointer
 * Events diz que, sob captura, o click usa o alvo capturado, sem novo hit-test. Escolhemos a
 * coordenada porque é o que casa com o que o usuário vê — e é também o que o browser produziu
 * nos casos em que ele acertou, onde o click nasceu na célula **já assentada**, não no alvo do
 * `pointerdown`.
 *
 * **Por que delegação num container.** Um ponto de aplicação cobre alvos que nascem e morrem
 * (as células trocam a cada navegação) e não obriga componentes de terceiros a expor o alvo
 * interno.
 *
 * **Sem `pointerleave`.** Parece faltar — o swipe da lista termina nele —, mas em dispositivo
 * sem hover a especificação manda disparar `pointerout` e `pointerleave` logo **depois** do
 * `pointerup`. Um `reset` ali limparia o timer recém-agendado e mataria o resgate em todo
 * toque, com a suíte inteira passando. O rastreio preso que ele pareceria resolver já se
 * resolve sozinho: um toque novo é sempre `isPrimary`, e reinicia o estado.
 *
 * **Nunca aninhar.** Duas instâncias sobre o mesmo toque despacham **dois** clicks: cada uma
 * tem seu timer, e a segunda ignora o click da primeira por reconhecê-lo como nosso. Ação
 * dobrada. Por isso o resgate da barra da página fica no `ion-buttons slot="end"`, e não no
 * `ion-toolbar` — que contém o `.cal-header`, já coberto.
 *
 * Uso: `v-tap-rescue` no container, sem valor.
 *
 * ```html
 * <div class="cal-header" v-tap-rescue> … </div>
 * <div class="mg-viewport" v-tap-rescue> … </div>
 * ```
 */

/** Acima disto o gesto foi arrasto: aí a ausência de click é decisão legítima do browser. */
const TAP_MAX_MOVE_PX = 10;

/**
 * Acima disto o gesto foi pressão longa, não toque. Aí a ausência de click costuma ser decisão
 * de quem tratou a pressão — menu de contexto, action sheet — e completar o click abriria a
 * ação por baixo do que acabou de abrir. O piso de referência é o long-press do
 * `MemoryListItem`, em 1450ms; um tap de verdade não chega perto disto.
 */
const TAP_MAX_DURATION_MS = 700;

/**
 * Quanto esperar pelo `click` real antes de despachar o sintético. Nos logs o click nasce
 * 1–3ms depois do `pointerup`; 80ms é margem larga e imperceptível — e só custa alguma coisa
 * no caso que já estava quebrado.
 */
const CLICK_WAIT_MS = 80;

/** Janela em que um click real tardio é tratado como duplicata do que já resgatamos. */
const DUPLICATE_WINDOW_MS = 400;

/** Intervalo entre tentativas quando o hit-test ainda cai no container (animação em curso). */
const RESOLVE_RETRY_MS = 40;

/**
 * Teto total da espera por um alvo utilizável. Cobre com folga os 260ms do slide; passou
 * disso, o toque provavelmente caiu em área sem handler mesmo, e desistir é o certo.
 */
const RESOLVE_MAX_WAIT_MS = 360;

interface TapState {
  tracking: boolean;
  x: number;
  y: number;
  pointerId: number;
  moved: boolean;
  startedAt: number;
  timer: number | null;
  rescuedElement: Element | null;
  rescuedAt: number;
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
  onPointerCancel: () => void;
  onContextMenu: () => void;
  onClickCapture: (event: MouseEvent) => void;
}

const states = new WeakMap<HTMLElement, TapState>();

/** Os clicks que esta diretiva despachou — ver `onClickCapture`. */
const rescued = new WeakSet<Event>();

const clearTimer = (state: TapState): void => {
  if (state.timer !== null) {
    window.clearTimeout(state.timer);
    state.timer = null;
  }
};

const reset = (state: TapState): void => {
  clearTimer(state);
  state.tracking = false;
  state.moved = false;
};

/**
 * Resolve quem está sob a coordenada, **na hora de despachar** — não no `pointerup`.
 *
 * A diferença decide o caso mais difícil. Num toque muito rápido durante o slide, o dedo sobe
 * enquanto as grades ainda estão `pointer-events: none`: o hit-test devolve o próprio
 * container, que não tem handler nenhum. Congelar esse alvo produzia um click que não abria
 * nada — e, pior, o placar da instrumentação contava como sucesso, porque *houve* click.
 *
 * Por isso só o **descendente estrito** vale como alvo: acertar o container é sinal de que a
 * animação ainda está no caminho, e aí a tentativa é reagendada até ela terminar.
 */
const resolveTarget = (host: HTMLElement, x: number, y: number): Element | null => {
  // O `typeof` cobre ambientes sem hit-test (jsdom); sem ele um throw vazaria do listener.
  if (typeof document.elementFromPoint !== 'function') return null;

  const hit = document.elementFromPoint(x, y);
  return hit && hit !== host && host.contains(hit) ? hit : null;
};

const scheduleRescue = (
  host: HTMLElement,
  state: TapState,
  x: number,
  y: number,
  startedAt: number,
  delay: number
): void => {
  state.timer = window.setTimeout(() => {
    state.timer = null;

    // O teto também vale aqui, não só na hora de reagendar: com o app em segundo plano o
    // timer congela e acordaria segundos depois — aí o click já seria fantasma.
    if (performance.now() - startedAt > RESOLVE_MAX_WAIT_MS) return;

    const target = resolveTarget(host, x, y);
    if (!target) {
      // Ainda coberto pela animação: tenta de novo até o teto, depois desiste em silêncio.
      if (performance.now() - startedAt < RESOLVE_MAX_WAIT_MS) {
        scheduleRescue(host, state, x, y, startedAt, RESOLVE_RETRY_MS);
      }
      return;
    }

    state.rescuedElement = target;
    state.rescuedAt = performance.now();

    const click = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      composed: true,
      // Um click de ponteiro carrega `detail: 1`; o de teclado vem com 0. Sem isto o
      // sintético se apresentaria como ativação por teclado.
      detail: 1,
      clientX: x,
      clientY: y
    });
    rescued.add(click);
    target.dispatchEvent(click);
  }, delay);
};

const attach = (host: HTMLElement): void => {
  const state: TapState = {
    tracking: false,
    x: 0,
    y: 0,
    pointerId: -1,
    moved: false,
    startedAt: 0,
    timer: null,
    rescuedElement: null,
    rescuedAt: 0,
    onPointerDown: () => {},
    onPointerMove: () => {},
    onPointerUp: () => {},
    onPointerCancel: () => {},
    onContextMenu: () => {},
    onClickCapture: () => {}
  };

  state.onPointerDown = (event: PointerEvent) => {
    // Só toque: no mouse o `click` é confiável e tem semântica própria (arrastar para fora
    // do botão cancela), que não queremos reescrever.
    if (event.pointerType === 'mouse') return reset(state);

    // Segundo dedo: o browser não sintetiza click de multitoque, e nós também não. `isPrimary`
    // é do ponteiro, não do estado desta instância — vale também entre dois hosts irmãos.
    if (!event.isPrimary) return reset(state);

    clearTimer(state);
    state.tracking = true;
    state.x = event.clientX;
    state.y = event.clientY;
    state.pointerId = event.pointerId;
    state.moved = false;
    state.startedAt = performance.now();
  };

  state.onPointerMove = (event: PointerEvent) => {
    if (!state.tracking || event.pointerId !== state.pointerId || state.moved) return;
    if (Math.hypot(event.clientX - state.x, event.clientY - state.y) > TAP_MAX_MOVE_PX) {
      state.moved = true;
    }
  };

  state.onPointerUp = (event: PointerEvent) => {
    if (!state.tracking || event.pointerId !== state.pointerId) return reset(state);

    // `moved` cobre a excursão máxima; esta conta cobre o arrasto que não gerou `pointermove`
    // observável — sem ela, descer em 10 e subir em 200 ainda passaria por tap.
    const travelled = Math.hypot(event.clientX - state.x, event.clientY - state.y);
    if (state.moved || travelled > TAP_MAX_MOVE_PX) return reset(state);

    const { clientX, clientY } = event;
    const heldFor = performance.now() - state.startedAt;
    reset(state);
    if (heldFor > TAP_MAX_DURATION_MS) return;

    scheduleRescue(host, state, clientX, clientY, performance.now(), CLICK_WAIT_MS);
  };

  state.onPointerCancel = () => reset(state);

  // O menu de contexto chega **antes** do `pointerup` e antes do teto de duração em parte
  // dos aparelhos; quem abriu menu já tratou o gesto.
  state.onContextMenu = () => reset(state);

  state.onClickCapture = (event: MouseEvent) => {
    // Nosso próprio resgate passa direto; qualquer outro click — do browser ou de terceiros —
    // conta como ativação de verdade. Marcar os nossos é mais preciso que olhar `isTrusted`:
    // um click programático de outra biblioteca **deve** cancelar o resgate e agir.
    if (rescued.has(event)) return;

    // Chegou o click de verdade: o resgate não é mais necessário.
    if (state.timer !== null) return clearTimer(state);
    if (!state.rescuedElement) return;

    // Click atrasado, depois de já termos resgatado: engolir para não agir duas vezes.
    const landed = event.target as Node | null;
    const sameBranch = landed instanceof Node
      && (landed === state.rescuedElement || state.rescuedElement.contains(landed) || landed.contains(state.rescuedElement));

    if (sameBranch && performance.now() - state.rescuedAt < DUPLICATE_WINDOW_MS) {
      event.stopPropagation();
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  };

  const passive: AddEventListenerOptions = { passive: true };
  host.addEventListener('pointerdown', state.onPointerDown, passive);
  host.addEventListener('pointermove', state.onPointerMove, passive);
  host.addEventListener('pointerup', state.onPointerUp, passive);
  host.addEventListener('pointercancel', state.onPointerCancel, passive);
  host.addEventListener('contextmenu', state.onContextMenu, passive);
  host.addEventListener('click', state.onClickCapture, { capture: true });

  states.set(host, state);
};

const detach = (host: HTMLElement): void => {
  const state = states.get(host);
  if (!state) return;

  clearTimer(state);
  host.removeEventListener('pointerdown', state.onPointerDown);
  host.removeEventListener('pointermove', state.onPointerMove);
  host.removeEventListener('pointerup', state.onPointerUp);
  host.removeEventListener('pointercancel', state.onPointerCancel);
  host.removeEventListener('contextmenu', state.onContextMenu);
  host.removeEventListener('click', state.onClickCapture, { capture: true });
  states.delete(host);
};

export const vTapRescue: Directive<HTMLElement, void> = {
  mounted(host: HTMLElement) {
    attach(host);
  },
  unmounted(host: HTMLElement) {
    detach(host);
  }
};

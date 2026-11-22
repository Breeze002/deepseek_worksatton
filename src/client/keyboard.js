/** The window keyboard layer. */
import { focusState, getCurrentShellSessionId, getGroupChat, groupMembersOf, latestBoardState, memberOfSession, noteReadingGesture, setFocus, exitFocus, enterFocus, openMember, popSessionHistory, stepMember } from './state.js';
import { revealInScroller } from './view/parts.js';

/**
 * Build the keyboard layer and install its listeners. The layer owns everything the user can press:
 * member switching, the question-card cursor, approval answers and pane scrolling.
 *
 * @param ctx plugin context (used for the workspace and layout services)
 * @param deps `publish` for the inspection marker
 */
export function createKeyboardLayer(ctx, deps) {
  const publish = deps.publish;
    const memberCombo = (event) => {
      // `Alt+digit` is often taken by the window manager on Linux, so three combinations are
      // accepted: Alt, Alt+Shift and Ctrl+Alt.
      const plain = event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
      const withShift = event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey;
      const withCtrl = event.altKey && event.ctrlKey && !event.metaKey;
      if (!plain && !withShift && !withCtrl) return null;
      const digit = /^Digit([0-9])$/u.exec(event.code);
      if (digit !== null) return `digit:${digit[1]}`;
      if (event.code === 'Backquote') return 'back';
      if (event.code === 'KeyG') return 'chat';
      // Arrow stepping stays on plain Alt (and Ctrl+Alt); Alt+Shift+arrows belong to scrolling.
      if (withShift) return null;
      if (event.code === 'ArrowUp') return 'prev';
      if (event.code === 'ArrowDown') return 'next';
      if (event.code === 'ArrowLeft') return 'back';
      return null;
    };

    const goBack = () => {
      const previous = popSessionHistory();
      if (previous === undefined) {
        exitFocus();
        return;
      }
      setFocus({ memberId: undefined });
      ctx.get('uiWorkspace')?.openSession(previous);
    };

    /** Which group the shortcuts act on: the one owning the visible Session, else the first. */
    const activeGroup = () => {
      const groups = (latestBoardState?.data?.groups ?? []).filter((group) => group.archived !== true);
      const owner = memberOfSession(latestBoardState, getCurrentShellSessionId());
      if (owner !== null) return owner.group;
      return groups[0] ?? null;
    };

    const onMemberKey = (event) => {
      const combo = memberCombo(event);
      if (combo === null) return;
      if (combo === 'chat') {
        const group = activeGroup();
        if (group === null) return;
        event.preventDefault();
        event.stopPropagation();
        publish('sessionCardsChat=shortcut');
        void getGroupChat()?.open(group.id);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const members = groupMembersOf(latestBoardState);
      publish(`sessionCardsKey=${combo}:members=${members.length}`);
      if (combo === 'back') {
        goBack();
        return;
      }
      if (combo === 'prev') {
        stepMember(-1);
        return;
      }
      if (combo === 'next') {
        stepMember(1);
        return;
      }
      const index = Number(combo.slice('digit:'.length));
      if (index === 0) {
        exitFocus();
        return;
      }
      const member = members[index - 1];
      if (member === undefined) return;
      publish(`sessionCardsKey=${combo}:members=${members.length}:focus=${String(focusState.on)}:to=${member.alias}`);
      if (focusState.on) {
        openMember(member);
        return;
      }
      // Enter the group view and switch in one press: the sidebar takeover re-renders the shell, so
      // the navigation goes out after it settles instead of being overwritten by it.
      enterFocus({ clearPanel: false });
      window.setTimeout(() => openMember(member), 0);
    };
    // Keyboard scrolling: DSH binds no key to the Conversation scroller (the shell's SCROLL_KEYS
    // only stop tail-following), and a plain container only scrolls while focused. This scrolls the
    // nearest scrollable ancestor of whatever sits under the pointer — no class names, no structure.
    let pointerX = 0;
    let pointerY = 0;
    const onPointerMove = (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
    };
    const scrollableUnderPointer = () => {
      const points = [
        [pointerX, pointerY],
        [window.innerWidth / 2, window.innerHeight / 2],
      ];
      for (const [x, y] of points) {
        let node = document.elementFromPoint(x, y);
        while (node instanceof HTMLElement) {
          const overflowY = window.getComputedStyle(node).overflowY;
          if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
            && node.scrollHeight > node.clientHeight + 1) return node;
          node = node.parentElement;
        }
      }
      return null;
    };
    const hasSelection = () => {
      const selection = window.getSelection?.();
      return selection !== undefined && selection !== null && selection.isCollapsed === false;
    };
    // Held keys run a per-frame scroll instead of one jump per repeat event, so holding Shift+↓
    // scrolls continuously and stops the moment the key is released or the window loses focus.
    const scrollLoop = { frame: 0, speed: 0, target: null, code: '' };
    /** The scroll diagnostics report the first key of a run only, so they cannot stomp other ones. */
    let scrollReported = false;
    const stopScrollLoop = () => {
      scrollReported = false;
      if (scrollLoop.frame !== 0) window.cancelAnimationFrame(scrollLoop.frame);
      scrollLoop.frame = 0;
      scrollLoop.speed = 0;
      scrollLoop.target = null;
      scrollLoop.code = '';
    };
    const runScrollLoop = (target, speed, code) => {
      stopScrollLoop();
      scrollLoop.target = target;
      scrollLoop.speed = speed;
      scrollLoop.code = code;
      let last = performance.now();
      const step = (now) => {
        // The arrows really are scrolling now, so the reading memory must follow them instead of
        // holding the place pinned at send time — that fight is what looked like a freeze.
        noteReadingGesture();
        if (scrollLoop.target === null) return;
        const elapsed = Math.min(64, now - last);
        last = now;
        scrollLoop.target.scrollTop += (scrollLoop.speed * elapsed) / 1000;
        scrollLoop.frame = window.requestAnimationFrame(step);
      };
      scrollLoop.frame = window.requestAnimationFrame(step);
    };
    const onScrollKeyUp = (event) => {
      if (scrollLoop.code !== '' && event.code === scrollLoop.code) stopScrollLoop();
    };

    const onScrollKey = (event) => {
      // A card that already consumed the key (question navigation) keeps it.
      if (event.defaultPrevented || event.ctrlKey || event.metaKey) return;
      const plain = !event.shiftKey && !event.altKey;
      const plainShift = event.shiftKey && !event.altKey;
      const altWith = event.altKey;
      if (!plain && !plainShift && !altWith) return;
      const page = window.innerHeight * 0.85;
      let delta;
      if (event.code === 'PageDown') delta = page;
      else if (event.code === 'PageUp') delta = -page;
      else if (event.code === 'ArrowDown') delta = 70;
      else if (event.code === 'ArrowUp') delta = -70;
      else return;
      if (!plain && !plainShift && !(altWith && event.shiftKey)) return; // Alt alone only pages
      // A pending card owns the plain arrows: letting the scroller take them moved the card out from
      // under the user, which read as the cursor jumping to a different box. Page keys still scroll.
      if (plain && (event.code === 'ArrowUp' || event.code === 'ArrowDown') && pendingCard() !== null) {
        publish(`sessionCardsScroll=${event.code}:held-by-card`);
        return;
      }
      const held = (why) => {
        publish(`sessionCardsScroll=${event.code}:${why}`);
      };
      const focused = document.activeElement;
      if (focused instanceof HTMLElement
        && focused.closest('.dsc-root, .dsc-members, .dsc-picks, .dsc-ws-list, .dsc-overlay') !== null) {
        return; // our own list is navigating with these keys
      }
      const field = editableField(focused);
      const arrow = event.code === 'ArrowUp' || event.code === 'ArrowDown';
      const edge = event.code === 'ArrowUp' ? 'start' : 'end';
      // The shell's own popup owns the plain arrows while it is open, and this listener is a window
      // capture listener — so consuming here made the `@`/`/` menu impossible to navigate. The menu
      // is a `role="listbox"` mounted only while it is up, so `role` alone identifies it.
      // `caretAtEdge` cannot cover this case: a rich-text composer keeps its paragraphs in elements,
      // so every arrow used to look like an exit at the edge of the draft.
      if (plain && arrow && document.querySelector('[role="listbox"], [role="menu"]') !== null) {
        held('held-by-shell-popup');
        return;
      }
      if (field !== null) {
        // Page keys never scroll out of a focused field.
        if (!arrow) {
          held('held-by-field');
          return;
        }
        // Shift+Arrow selects text in single-line fields and in dialog fields: leave those alone.
        if (plainShift
          && (field.tagName === 'INPUT'
            || field.closest('[role="dialog"], [aria-modal="true"], .dsc-overlay, .dsc-modal') !== null)) {
          held('held-by-field');
          return;
        }
        // Multiline text keeps the caret until it reaches the edge the arrow would leave from.
        if (!caretAtEdge(field, edge)) {
          held('held-by-caret');
          return;
        }
      } else if (plainShift && hasSelection()) {
        held('held-by-selection');
        return;
      }
      // Resolve the pane *before* consuming the key: a capture-phase listener that stops every
      // arrow would hide them from the shell's own controls (question cards, selects, lists).
      const target = scrollableUnderPointer();
      if (target === null) {
        publish(`sessionCardsScroll=${event.code}:no-scrollable-pane`);
        return;
      }
      if (scrollReported !== true) {
        scrollReported = true;
        publish(`sessionCardsScroll=${event.code}:scrolling`);
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return; // the loop already runs; swallow the repeats
      const perSecond = delta < 0 ? -1 : 1;
      const speed = Math.abs(delta) > 100 ? 1500 : 560;
      runScrollLoop(target, perSecond * speed, event.code);
    };

    // The editable the user actually types in (the composer), remembered across focus moves. The
    // approval card takes focus to answer a key, so "what was focused" is the card — not the field
    // the caret must return to.
    const FIELD_SELECTOR = 'input, textarea, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';
    const CARD_SELECTOR = '[data-approval-key], [data-question-key], [data-plan-review-key]';
    let lastComposer = null;
    const onFocusIn = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest(CARD_SELECTOR) !== null) return;
      const field = target.closest(FIELD_SELECTOR);
      if (field instanceof HTMLElement) lastComposer = field;
    };
    /** Fallback when the remembered field was replaced by a re-render. */
    const visibleComposer = () => {
      const nodes = [...document.querySelectorAll('textarea, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]')];
      for (let index = nodes.length - 1; index >= 0; index -= 1) {
        const node = nodes[index];
        if (!(node instanceof HTMLElement)) continue;
        if (node.offsetParent === null) continue;
        if (node.closest('.dsc-overlay, [role="dialog"], [aria-modal="true"]') !== null) continue;
        return node;
      }
      return null;
    };
    /** Hand the caret back after a card was answered with the keyboard. */
    const restoreFocus = (preferred, options) => {
      // A late retry from an earlier card must not pull the caret out of a card the user has since
      // moved to.
      const origin = options?.card ?? null;
      const take = () => {
        const focused = document.activeElement;
        const focusedCard = focused instanceof HTMLElement ? focused.closest(CARD_SELECTOR) : null;
        if (focusedCard !== null && focusedCard !== origin) return;
        const usable = [preferred, lastComposer].find(
          (node) => node instanceof HTMLElement && node.isConnected && node.closest(CARD_SELECTOR) === null,
        );
        const element = usable ?? visibleComposer();
        if (element === null) return;
        const active = document.activeElement;
        if (active === element) return;
        // Never steal from a field the user is typing in right now — but the answered card's own
        // field must not hold the caret: the user just finished with that card.
        const activeInCard = active instanceof HTMLElement && active.closest(CARD_SELECTOR) !== null;
        if (active instanceof HTMLElement && active.closest(FIELD_SELECTOR) !== null && !activeInCard) return;
        element.focus();
      };
      // Once synchronously (before React tears the answered card down), then while the continuation
      // render settles, and finally for a short window in case the shell re-renders the composer.
      // `defer` is for the path where the shell still has to see the key being dispatched: moving
      // focus now would make its own handler think the user left the card.
      if (options?.defer !== true) take();
      for (const delay of [0, 40, 150, 400, 800]) window.setTimeout(take, delay);
      let deadline = performance.now() + 1500;
      const cancelWatch = () => {
        deadline = 0;
      };
      window.addEventListener('pointerdown', cancelWatch, true);
      const tick = () => {
        if (performance.now() > deadline) {
          window.removeEventListener('pointerdown', cancelWatch, true);
          return;
        }
        take();
        window.requestAnimationFrame(tick);
      };
      window.requestAnimationFrame(tick);
    };

    // Approval cards answer Enter/Escape from inside themselves. When focus is elsewhere (usually the
    // composer) the shell ignores the key, so move focus into the card and replay the key there.
    const onApprovalKey = (event) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== 'Enter' && event.key !== 'Escape') return;
      const active = document.activeElement;
      // A focused field only owns Enter while the user is actually writing something; an empty
      // composer is exactly the state in which Enter should approve.
      const owner = active instanceof HTMLElement
        ? active.closest('input, textarea, [contenteditable="true"], [contenteditable=""]')
        : null;
      if (owner !== null && !fieldIsEmpty(owner)) return;
      // The newest visible card: an answered one may still sit in the transcript above it.
      const card = [...document.querySelectorAll('[data-approval-key]')].filter(shownCard).pop();
      if (card === undefined || card.getAttribute('aria-busy') === 'true') return;
      if (card.contains(active)) {
        // Focus is already inside the card, so the shell's own handler answers this key. Do not
        // touch the event, and only hand the caret back after that handler has run.
        restoreFocus(active, { defer: true, card });
        return;
      }
      // Answering needs focus inside the card, so remember where the user was and put it back:
      // approving must not cost the composer its caret.
      const previous = active instanceof HTMLElement ? active : null;
      event.preventDefault();
      event.stopPropagation();
      card.querySelector('button, [role="button"]')?.focus();
      card.dispatchEvent(new KeyboardEvent('keydown', { key: event.key, bubbles: true }));
      restoreFocus(previous);
    };

    // Question cards (ask_user_question / plan review): digit selects an option, arrows walk the
    // options and Enter submits — the shells's own card submits on Enter over an option button.
    const editableField = (node) => (node instanceof HTMLElement
      ? node.closest('input, textarea, [contenteditable="true"], [contenteditable=""]')
      : null);
    /** Whether a focused field already holds text the user would lose. */
    const fieldIsEmpty = (field) => {
      if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) return field.value.trim() === '';
      if (field instanceof HTMLElement && field.isContentEditable) return (field.textContent ?? '').trim() === '';
      return true;
    };
    /**
     * The shell renders responsive duplicates of some parts (inline/block variants, hidden mirrors),
     * which have no boxes at all. Counting them as targets made the cursor step onto an invisible
     * node — the highlight blinked and one visible option took two presses.
     */
    const onScreen = (node) => node instanceof HTMLElement
      && node.getClientRects().length > 0
      && node.closest('[aria-hidden="true"]') === null;
    const optionButtons = (card) => {
      // A choice is a radio/checkbox; the shell also puts copy and expand icon buttons inside the same
      // option row, and treating those as choices parked the cursor on a tiny corner button.
      const choices = [...card.querySelectorAll('[data-option-row] button[role="radio"]:not([disabled]), [data-option-row] button[role="checkbox"]:not([disabled])')]
        .filter(onScreen);
      if (choices.length > 0) return choices;
      const fallback = [...card.querySelectorAll('[role="radio"]:not([disabled]), [role="checkbox"]:not([disabled])')].filter(onScreen);
      if (fallback.length > 0) return fallback;
      return [...card.querySelectorAll('[data-option-row] button:not([disabled])')].filter(onScreen);
    };
    /**
     * One block per question. The host declares each question's choices as a `radiogroup` (single) or
     * `group` (multi-select), which is the only grouping a card exposes — a flat list over the whole
     * card would mix the questions together.
     */
    const questionBlocks = (card) => {
      // Every question counts, even one whose options the shell has not revealed yet: dropping those
      // collapsed the whole ring to a single question and made left/right look dead.
      const groups = [...card.querySelectorAll('[role="radiogroup"], [role="group"]')]
        .filter((node) => node instanceof HTMLElement);
      const blockOf = (element) => {
        const options = optionButtons(element);
        const fields = [...element.querySelectorAll('textarea, input:not([type="hidden"]), [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]')]
          .filter((node) => onScreen(node) && node.disabled !== true);
        return { element, options, targets: [...options, ...fields] };
      };
      if (groups.length === 0) return [blockOf(card)];
      // The shell renders a question's free-text row beside its options container, inside a
      // per-question wrapper: use that wrapper so the arrows can reach the text box too.
      return groups.map((group) => {
        const parent = group.parentElement;
        const ownsOne = parent instanceof HTMLElement
          && parent !== card
          && parent.querySelectorAll('[role="radiogroup"], [role="group"]').length === 1;
        return blockOf(ownsOne ? parent : group);
      });
    };
    // Painting a class onto the shell's nodes loses the highlight whenever the card re-renders, which
    // is what the user saw as a flicker. The class stays (harmless, and a static hint), while the
    // visible cursor is our own overlay cursorRing, repositioned every frame and immune to that.
    let cursorMark = null;
    let cursorRing = null;
    let ringFrame = 0;
    let paints = 0;
    let marks = 0;
    const ensureRing = () => {
      if (cursorRing !== null && cursorRing.isConnected === true) return cursorRing;
      cursorRing = document.createElement('div');
      cursorRing.className = 'dsc-card-ring';
      document.body.appendChild(cursorRing);
      return cursorRing;
    };
    const placeRing = () => {
      const node = ensureRing();
      const target = cursorMark;
      if (target === null || target.isConnected !== true || !onScreen(target)) {
        node.style.display = 'none';
        return;
      }
      const box = target.getBoundingClientRect();
      const width = box.width > 0 ? box.width : 0;
      const height = box.height > 0 ? box.height : 0;
      if (width === 0 || height === 0) {
        node.style.display = 'none';
        return;
      }
      paints += 1;
      node.style.display = 'block';
      node.style.left = `${box.left - 2}px`;
      node.style.top = `${box.top - 2}px`;
      node.style.width = `${width + 4}px`;
      node.style.height = `${height + 4}px`;
    };
    const runRing = () => {
      if (ringFrame !== 0) return;
      const step = () => {
        placeRing();
        if (cursorCard !== null && cursorCard.isConnected === true) {
          ringFrame = window.requestAnimationFrame(step);
          return;
        }
        ringFrame = 0;
        if (cursorRing !== null) cursorRing.style.display = 'none';
      };
      ringFrame = window.requestAnimationFrame(step);
    };
    const markCursor = (element) => {
      marks += 1;
      if (cursorMark === element) {
        runRing();
        return;
      }
      cursorMark?.classList?.remove('dsc-card-cursor');
      cursorMark = element;
      cursorMark?.classList?.add('dsc-card-cursor');
      runRing();
    };

    /** Own cursor {card, question, item}: the shell paints selection, not focus. */
    let questionCursor = { key: '', block: 0, index: -1 };
    // The card re-renders while the user navigates it, which replaces the marked node; the cursor is
    // therefore kept as (question, item) and re-applied whenever the card's DOM changes.
    let cursorCard = null;
    let cursorObserver = null;
    const repaintCursor = () => {
      if (cursorCard === null || cursorMark === null) return;
      const live = questionBlocks(cursorCard);
      const block = Math.min(Math.max(questionCursor.block, 0), live.length - 1);
      const target = live[block]?.targets[questionCursor.index];
      if (target === undefined || !onScreen(target) || target === cursorMark) return;
      cursorMark.classList?.remove('dsc-card-cursor');
      cursorMark = target;
      target.classList?.add('dsc-card-cursor');
    };
    const watchCursor = (card) => {
      if (cursorCard === card && cursorObserver !== null) return;
      cursorObserver?.disconnect();
      cursorCard = card;
      // Report the shape on sight: a wrong assumption about the shell's DOM is then readable without
      // asking anyone to press a key.
      const shape = questionBlocks(card);
      publish(`sessionCardsShape=b${shape.length}:o${shape.map((block) => block.options.length).join('.')}:t${shape.map((block) => block.targets.length).join('.')}`);
      if (typeof MutationObserver !== 'function') return;
      cursorObserver = new MutationObserver(() => window.requestAnimationFrame(repaintCursor));
      cursorObserver.observe(card, { childList: true, subtree: true });
    };
    // Rolling trace: the only way to see the order of actions a user actually performed.
    const questionTrace = [];
    const trace = (entry) => {
      questionTrace.push(entry);
      if (questionTrace.length > 24) questionTrace.shift();
      publish(`sessionCardsTrace=${questionTrace.join('|')}`);
    };
    const cardKeyOf = (card) => card.getAttribute('data-question-key')
      ?? card.getAttribute('data-plan-review-key')
      ?? 'card';
    /** Whether a vertical arrow may leave `field` in `edge`'s direction. */
    const caretAtEdge = (field, edge) => {
      if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) {
        if (!field.value.includes('\n')) return true; // single line: nothing to move through
        const position = field.selectionStart ?? 0;
        return edge === 'start' ? position <= 0 : position >= field.value.length;
      }
      if (field instanceof HTMLElement && field.isContentEditable) {
        const text = field.textContent ?? '';
        // A rich-text composer keeps its paragraphs in elements, so `textContent` carries no `\n`
        // and a plain `includes('\n')` test read every draft as single-line — which handed the
        // caret's own arrows to the scroller. Counting blocks is what tells them apart.
        const blocks = field.querySelectorAll('p, div, li, br').length;
        if (blocks <= 1 && !text.includes('\n')) return true;
        const selection = window.getSelection?.();
        if (selection === undefined || selection === null || selection.rangeCount === 0 || !selection.isCollapsed) return false;
        const range = selection.getRangeAt(0);
        const before = range.cloneRange();
        before.selectNodeContents(field);
        before.setEnd(range.startContainer, range.startOffset);
        const offset = before.toString().length;
        return edge === 'start' ? offset === 0 : offset >= text.length;
      }
      return false;
    };
    // The shell renders its own question navigation (labels from its eight dictionaries). Clicking it
    // keeps the shell's flow in sync — far more reliable than a second question model on our side.
    const STEP_LABELS = {
      next: new Set(['下一题', 'Next question', 'Next', '次の質問', '次へ', 'Siguiente pregunta', 'Siguiente', 'Question suivante', 'Suivant', 'Nächste Frage', 'Weiter', 'Следующий вопрос', 'Далее', 'Próxima pergunta', 'Próximo']),
      prev: new Set(['上一题', 'Previous question', '前の質問', 'Pregunta anterior', 'Question précédente', 'Vorherige Frage', 'Предыдущий вопрос', 'Pergunta anterior']),
    };
    const questionNavControl = (card, step) => {
      const labels = step > 0 ? STEP_LABELS.next : STEP_LABELS.prev;
      return [...card.querySelectorAll('button:not([disabled])')]
        .filter((node) => onScreen(node) && node.getAttribute('role') !== 'radio' && node.getAttribute('role') !== 'checkbox')
        .find((node) => labels.has((node.textContent ?? '').trim()) || labels.has((node.getAttribute('aria-label') ?? '').trim()))
        ?? null;
    };

    /**
     * A card counts as on screen when it has boxes: `offsetParent` is null both for hidden elements
     * and for anything inside a fixed overlay, which is exactly how the shell renders a dialog — the
     * keyboard layer used to ignore those cards entirely.
     */
    const shownCard = (node) => node instanceof HTMLElement
      && (typeof node.getClientRects === 'function' ? node.getClientRects().length > 0 : node.offsetParent !== null);
    /**
     * The card to act on: the one holding focus when the user is inside a card, otherwise the newest
     * one that is on screen (an answered card may still sit in the transcript).
     */
    const pendingCard = () => {
      const cards = [...document.querySelectorAll('[data-question-key], [data-plan-review-key]')].filter(shownCard);
      const focused = document.activeElement;
      if (focused instanceof HTMLElement) {
        const owning = cards.find((card) => card.contains(focused));
        if (owning !== undefined) return owning;
      }
      return cards[cards.length - 1] ?? null;
    };
    const onQuestionKey = (event) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const card = pendingCard();
      if (card === null) return;
      // Report what the card actually looks like: the only way to tell a wrong assumption about the
      // shell's DOM from a wrong decision in here.
      watchCursor(card);
      const probeBlocks = questionBlocks(card);
      trace(`?${event.code.replace('Arrow', '')}:cur=${questionCursor.block}.${questionCursor.index}:mk${marks}:pt${paints}:b${probeBlocks.length}:o${probeBlocks.map((block) => block.options.length).join('.')}:t${probeBlocks.map((block) => block.targets.length).join('.')}:a${document.activeElement?.tagName ?? '-'}`);
      const active = document.activeElement;
      const field = editableField(active);
      const inCardField = field !== null && card.contains(field);
      const isArrow = event.code === 'ArrowUp' || event.code === 'ArrowDown'
        || event.code === 'ArrowLeft' || event.code === 'ArrowRight';
      if (!inCardField && field !== null && !fieldIsEmpty(field)) {
        // The user is writing somewhere else. Typing keys (and Space) stay with that field, but the
        // arrows still drive the card: handing them to the scroller moved the card out from under
        // the user, which read as the cursor jumping to another box.
        if (!isArrow) return;
        const edge = event.code === 'ArrowUp' || event.code === 'ArrowLeft' ? 'start' : 'end';
        if (!caretAtEdge(field, edge)) return; // the caret still has room in the text
      }
      if (inCardField) {
        // Inside the card's own box: digits and Enter belong to it (the card submits on Enter), and
        // arrows leave only from the edge of the text.
        if (/^Digit([1-9])$/u.test(event.code)) return;
        const leaveUp = event.code === 'ArrowUp' || event.code === 'ArrowLeft';
        const leaveDown = event.code === 'ArrowDown' || event.code === 'ArrowRight';
        if (!leaveUp && !leaveDown) return;
        // Arrows leave the card's text box only once the caret has no room left, so typing and
        // selecting text keep working.
        if (leaveUp && !caretAtEdge(field, 'start')) return;
        if (leaveDown && !caretAtEdge(field, 'end')) return;
      }
      const blocks = questionBlocks(card);
      const key = cardKeyOf(card);
      if (questionCursor.key !== key) questionCursor = { key, block: 0, index: -1 };
      const blockCount = blocks.length;
      const usable = blocks.map((block) => block.targets.length);
      if (usable.every((count) => count === 0)) {
        publish(`sessionCardsQ=${event.code}:no-options:blocks=${blockCount}`);
        return;
      }
      // Keep the cursor on a question (and item) that still exists. A cursor of -1 means "not in the
      // list yet": the first arrow then enters at the top (or bottom). The focused control is only
      // used as an anchor for a cursor that already exists — the shell preselects recommended
      // options and focuses them, which otherwise made the first ↓ look like it skipped one.
      // Stay on the cursor's own question even when it has nothing to land on: skipping to the next
      // question that has controls is exactly what made the first question look skipped.
      const block = Math.min(Math.max(questionCursor.block, 0), blockCount - 1);
      const stored = questionCursor.index;
      const anchor = stored < 0 ? -1 : blocks[block].targets.indexOf(active);
      const index = (anchor >= 0 ? anchor : stored) < 0
        ? -1
        : Math.min(anchor >= 0 ? anchor : stored, Math.max(0, usable[block] - 1));
      const settle = (target, question, item, mode) => {
        questionCursor = { key, block: question, index: item };
        const scroller = (() => {
          let node = target.parentElement;
          while (node instanceof HTMLElement) {
            const overflowY = window.getComputedStyle(node).overflowY;
            if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
              && node.scrollHeight > node.clientHeight + 1) return node;
            node = node.parentElement;
          }
          return null;
        })();
        const before = scroller?.scrollTop ?? 0;
        event.preventDefault();
        event.stopPropagation();
        markCursor(target);
        // Arrows only move the cursor: selecting here made the shell treat the question as answered
        // and advance to the next one, which read as "↓ jumped to the second question". Choosing is
        // an explicit act — a digit, or Space on the focused option (native button activation).
        const clicked = mode === 'select';
        const selectedBefore = blocks[question].options.findIndex((option) => option.getAttribute('aria-checked') === 'true');
        if (clicked) target.click();
        const selectedAfter = blocks[question].options.findIndex((option) => option.getAttribute('aria-checked') === 'true');
        // Moving the cursor must not take focus away from wherever the user is working.
        revealInScroller(target);
        const moved = (scroller?.scrollTop ?? 0) - before;
        publish(`sessionCardsQ=${event.code}:q${question + 1}/${blockCount}:i${item + 1}/${usable[question]}:scroll${moved >= 0 ? '+' : ''}${Math.round(moved)}`);
        trace(`${event.code === 'ArrowDown' ? 'D' : event.code === 'ArrowUp' ? 'U' : event.code === 'ArrowLeft' ? 'L' : event.code === 'ArrowRight' ? 'R' : event.code}=q${question + 1}/${blockCount}i${item + 1}/${usable[question]}${clicked ? '+c' : ''}:sel${selectedBefore}->${selectedAfter}`);
      };
      if (event.code === 'Space') {
        // Our own activation: the cursor item is chosen without focusing it first.
        // Same rule as the other keys: a field only owns the space bar while it holds text.
        if (field !== null && !card.contains(field) && !fieldIsEmpty(field)) return;
        const target = blocks[block].targets[index >= 0 ? index : 0];
        if (target === undefined) return;
        settle(target, block, index >= 0 ? index : 0, 'select');
        return;
      }
      const digit = /^Digit([1-9])$/u.exec(event.code);
      if (digit !== null) {
        // Numbers address the choices of the question the cursor is on, matching the labels shown.
        const option = blocks[block].options[Number(digit[1]) - 1];
        if (option === undefined) return;
        settle(option, block, Number(digit[1]) - 1, 'select');
        return;
      }
      if (event.code === 'Enter') {
        // Enter confirms instead of submitting an unfinished card: the shell answers a half-filled
        // request with "please answer this question first".
        const chosenIn = (blockIndex) => blocks[blockIndex].options.some((option) => option.getAttribute('aria-checked') === 'true');
        const unanswered = blocks.findIndex((candidate, blockIndex) => usable[blockIndex] > 0 && !chosenIn(blockIndex));
        if (unanswered >= 0) {
          if (!chosenIn(block)) {
            const cursorIndex = index >= 0 && index < blocks[block].options.length ? index : 0;
            const target = blocks[block].options[cursorIndex] ?? blocks[block].targets[cursorIndex];
            if (target === undefined) return;
            trace(`E=q${block + 1}:confirm`);
            settle(target, block, cursorIndex, 'select');
            return;
          }
          const targets = blocks[unanswered].targets;
          if (targets.length === 0) return;
          trace(`E=goto${unanswered + 1}`);
          settle(targets[0], unanswered, 0, 'follow');
          return;
        }
        const current = blocks[block];
        const target = current.options.find((option) => option.getAttribute('aria-checked') === 'true')
          ?? current.options[0]
          ?? current.targets[0];
        if (target === undefined) return;
        event.preventDefault();
        event.stopPropagation();
        const previous = active instanceof HTMLElement ? active : null;
        target.focus?.();
        target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        restoreFocus(previous, { card });
        trace('E=submit');
        return;
      }
      if (event.code === 'ArrowDown' || event.code === 'ArrowUp') {
        // Up/down stay inside the current question — never hop, so the first question is never
        // skipped. A question without reachable controls is still marked so the user sees it.
        if (usable[block] === 0) {
          event.preventDefault();
          markCursor(blocks[block].element);
          revealInScroller(blocks[block].element);
          trace(`${event.code === 'ArrowDown' ? 'D' : 'U'}=q${block + 1}/${blockCount}:empty`);
          return;
        }
        const step = event.code === 'ArrowDown' ? 1 : -1;
        const nextIndex = index < 0
          ? (step > 0 ? 0 : usable[block] - 1)
          : (index + step + usable[block]) % usable[block];
        const target = blocks[block].targets[nextIndex];
        if (target === undefined) return;
        settle(target, block, nextIndex, 'follow');
        return;
      }
      if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
        // Left/right switch questions. The shell's own control comes first: it also advances whatever
        // the shell shows, which is what the user sees as "the next question".
        const navStep = event.code === 'ArrowRight' ? 1 : -1;
        const navControl = questionNavControl(card, navStep);
        if (navControl !== null) {
          event.preventDefault();
          event.stopPropagation();
          navControl.click();
          trace(`${navStep > 0 ? 'R' : 'L'}=shell-nav`);
          return;
        }
        if (blockCount < 2) return;
        const step = navStep;
        // Prefer the next question that can actually be answered, but always move: a question whose
        // options the shell has not revealed yet still takes the cursor so paging is felt.
        let landed = -1;
        let target;
        let stopAt = -1;
        let chosenBlock = block;
        for (let hop = 1; hop < blockCount; hop += 1) {
          const candidate = (block + step * hop + blockCount * blockCount) % blockCount;
          if (usable[candidate] > 0) {
            chosenBlock = candidate;
            const targets = blocks[candidate].targets;
            const chosen = targets.find((node) => node.getAttribute('aria-checked') === 'true');
            target = chosen ?? targets[step > 0 ? 0 : targets.length - 1];
            landed = targets.indexOf(target);
            break;
          }
          if (blocks[candidate].options.length > 0) {
            // The question exists but its choices are not revealed yet: stop there so paging is felt,
            // instead of wrapping back to the question the user is already on (which looked like
            // left/right doing nothing at all).
            stopAt = candidate;
            break;
          }
        }
        if (landed < 0 || target === undefined) {
          const fallback = stopAt >= 0 ? stopAt : (block + step + blockCount) % blockCount;
          questionCursor = { key, block: fallback, index: -1 };
          event.preventDefault();
          event.stopPropagation();
          markCursor(blocks[fallback].element);
          revealInScroller(blocks[fallback].element);
          trace(`${step > 0 ? 'R' : 'L'}=q${fallback + 1}/${blockCount}:no-targets`);
          return;
        }
        settle(target, chosenBlock, landed, 'follow');
      }
    };

    ctx.effect(() => {
      const target = window;
      target.addEventListener('keydown', onMemberKey, true);
      target.addEventListener('keydown', onQuestionKey, true);
      target.addEventListener('keydown', onScrollKey, true);
      target.addEventListener('keydown', onApprovalKey, true);
      target.addEventListener('keyup', onScrollKeyUp, true);
      target.addEventListener('blur', stopScrollLoop);
      target.addEventListener('focusin', onFocusIn, true);
      target.addEventListener('pointermove', onPointerMove, { passive: true });
      return () => {
        stopScrollLoop();
        target.removeEventListener('keydown', onMemberKey, true);
        target.removeEventListener('keydown', onQuestionKey, true);
        target.removeEventListener('keydown', onScrollKey, true);
        target.removeEventListener('keydown', onApprovalKey, true);
        target.removeEventListener('keyup', onScrollKeyUp, true);
        target.removeEventListener('blur', stopScrollLoop);
        target.removeEventListener('focusin', onFocusIn, true);
        target.removeEventListener('pointermove', onPointerMove);
      };
    }, 'session-cards: keyboard layer');
}


/**
 * Reading memory.
 *
 * Every Session's place in its conversation is remembered, and while the reader is *not* at the
 * bottom that place is held even as the answer streams in — the shell otherwise pulls the view down
 * to the newest output. Being at the bottom is left entirely to the shell, so live streaming keeps
 * following along as usual.
 *
 * The conversation's scroller is found from the page itself (the shell exposes it through no
 * plugin contract): the tallest scrollable, tall-enough element outside this plugin's own panel.
 */
import { setReadingGesture } from './state.js';

const BOTTOM_SLACK = 24;
const MIN_VIEWPORT = 200;
const SCROLL_KEYS = new Set(['PageUp', 'PageDown', 'Home', 'End', 'Space', 'ArrowUp', 'ArrowDown']);
/** A message was sent: the drafting field went from real text to empty (works for every send path). */
const MIN_SENT_LENGTH = 2;
/** A gesture owns the scrolls that follow it within this window. */
const DRIVING_MS = 200;
/** Output arriving is what makes the shell scroll: a scroll that follows growth is its follow. */
const GROWTH_PX = 8;

export function createReadingMemory(deps) {
  const memory = new Map(); // sessionId -> scrollTop, only while the reader is not at the bottom
  const drafts = new WeakMap(); // drafting field -> its last value
  let scroller = null;
  let frame = 0;
  let current = null;
  let pinned = null; // session whose place is held: after sending, and wherever the user scrolls to
  let ourWrite = false; // a scroll event we caused ourselves must not be read as the user's
  let userDriving = false; // a scroll gesture is in flight, so the reader owns the place
  let userDrivingTimer = 0;
  let lastScrollHeight = 0;
  let lastState = ''; // so the diagnostic only reports when the recognition changes
  let lastGestureReport = 0;

  /**
   * The conversation's scroller, found from the header anchor this plugin places: the tallest
   * scrollable region below it that spans the main column. Without the anchor nothing is touched —
   * guessing from geometry alone once grabbed an unrelated pane and fought the user's scrolling.
   */
  const conversationScroller = () => {
    if (scroller !== null && scroller.isConnected === true) return scroller;
    scroller = null;
    const anchor = document.querySelector('.dsc-reading-anchor');
    if (anchor === null) {
      if (lastState !== 'no-anchor') {
        lastState = 'no-anchor';
        report('no-anchor');
      }
      return null;
    }
    const anchorBox = anchor.getBoundingClientRect();
    const minWidth = Math.max(360, window.innerWidth * 0.5);
    let best = null;
    for (const node of document.querySelectorAll('div')) {
      if (typeof node.closest === 'function' && node.closest('.dsc-member-panel') !== null) continue;
      if (node.scrollHeight <= node.clientHeight + BOTTOM_SLACK) continue;
      if (node.clientHeight < MIN_VIEWPORT) continue;
      const style = getComputedStyle(node);
      if (style.overflowY !== 'auto' && style.overflowY !== 'scroll') continue;
      const box = node.getBoundingClientRect();
      if (box.width < minWidth) continue;
      if (box.top < anchorBox.top) continue; // the conversation sits below its header
      if (best === null || node.clientHeight > best.clientHeight) best = node;
    }
    scroller = best;
    const state = best === null ? 'no-scroller' : 'scroller';
    if (state !== lastState) {
      lastState = state;
      report(state);
    }
    return scroller;
  };

  const atBottom = (node) => node.scrollHeight - node.scrollTop - node.clientHeight <= BOTTOM_SLACK;

  const remember = (sessionId, node) => {
    if (sessionId === null || sessionId === undefined || node === null || node === undefined) return;
    if (atBottom(node)) memory.delete(sessionId);
    else memory.set(sessionId, node.scrollTop);
  };

  /**
   * After sending, the view must stay at the beginning of the reply rather than following it: the
   * place is pinned, and the shell's own scroll-to-newest is undone until the user scrolls again.
   */
  const report = (note) => {
    const node = conversationScroller();
    const anchor = document.querySelector('.dsc-reading-anchor');
    const shape = node === null ? 'none' : `${Math.round(node.clientWidth)}x${Math.round(node.clientHeight)}/${Math.round(node.scrollHeight)}`;
    deps.publish?.(`sessionCardsReading=${note}:sid=${String(current)}:pin=${String(pinned)}:drive=${userDriving ? 'y' : 'n'}:anchor=${anchor === null ? 'no' : 'yes'}:scroller=${shape}:at=${node === null ? '-' : Math.round(node.scrollTop)}`);
  };

  const isTextField = (target) =>
    target instanceof HTMLTextAreaElement
    || (target instanceof HTMLInputElement && ['text', 'search', 'url', 'email', ''].includes(target.type))
    || target?.isContentEditable === true;

  const pin = () => {
    const node = conversationScroller();
    if (node === null || current === null) return;
    memory.set(current, node.scrollTop);
    pinned = current;
    report(`pinned@${Math.round(node.scrollTop)}`);
  };

  const write = (node, value) => {
    ourWrite = true;
    node.scrollTop = value;
    // A timer, not a frame: a throttled or background page may not run animation frames at all, and
    // a flag that never clears would silently ignore every later scroll.
    window.setTimeout(() => {
      ourWrite = false;
    }, 0);
  };

  /** Put the reader back where they were; a no-op unless that place is remembered. */
  const hold = () => {
    const node = conversationScroller();
    if (node === null || current === null) return;
    const saved = memory.get(current);
    if (saved === undefined) return;
    if (Math.abs(node.scrollTop - saved) > 1) write(node, saved);
  };

  const schedule = () => {
    if (frame !== 0) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      hold();
    });
  };

  const enter = (sessionId) => {
    const next = sessionId ?? null;
    if (next === current) return;
    remember(current, conversationScroller());
    current = next;
    scroller = null; // the shell may have rebuilt the conversation on the way in
    const saved = current === null ? undefined : memory.get(current);
    if (saved === undefined) return;
    // Entering lands at the bottom; hold the remembered place for a few frames until it settles.
    let tries = 0;
    const restore = () => {
      const node = conversationScroller();
      tries += 1;
      if (node === null || tries > 12) return;
      if (Math.abs(node.scrollTop - saved) > 1) node.scrollTop = saved;
      window.requestAnimationFrame(restore);
    };
    window.requestAnimationFrame(restore);
  };

  const onScroll = (event) => {
    const node = event.target;
    if (node !== conversationScroller() || ourWrite) return;
    const saved = current === null ? undefined : memory.get(current);
    const grew = node.scrollHeight > lastScrollHeight + GROWTH_PX;
    lastScrollHeight = node.scrollHeight;
    if (userDriving && saved !== undefined) {
      // The shell scrolls only because output arrived, so a downward jump that follows growth is its
      // follow and gets undone; anything else within the gesture window is the reader's own and the
      // pin moves with them. The bottom always hands control back.
      // Synchronous and reliable: the shell scrolls only after output made the content taller, while
      // the reader's own scrolling cannot change scrollHeight at all.
      const followsGrowth = grew && node.scrollTop - saved > 40;
      if (atBottom(node) && followsGrowth === false) {
        memory.delete(current);
        pinned = null;
        report('bottom');
        return;
      }
      if (followsGrowth) {
        hold();
        return;
      }
      memory.set(current, node.scrollTop);
      pinned = current;
      onUserScroll(); // extend the window while they keep scrolling
      return;
    }
    if (pinned !== null && pinned === current) {
      // The shell scrolled to the newest output on its own; that must not win.
      hold();
      return;
    }
    remember(current, node);
  };

  /** A scroll gesture: the reader drives from here, and the pin follows them instead of fighting. */
  const onUserScroll = () => {
    const now = Date.now();
    if (now - lastGestureReport > 150) {
      lastGestureReport = now;
      report('gesture'); // throttled: enough for diagnosis without spamming the marker
    }
    userDriving = true;
    window.clearTimeout(userDrivingTimer);
    userDrivingTimer = window.setTimeout(() => {
      userDriving = false;
    }, DRIVING_MS);
  };
  const onInput = (event) => {
    const target = event.target;
    if (target === null || target === undefined) return;
    const value = typeof target.value === 'string' ? target.value : target.textContent ?? '';
    const previous = drafts.get(target) ?? '';
    drafts.set(target, value);
    if (previous.trim().length >= MIN_SENT_LENGTH && value.trim() === '') pin();
  };
  const onKeyDown = (event) => {
    if (isTextField(event.target)) {
      // Enter sends the draft (the shell may clear the field without firing `input`), so this is the
      // trigger that does not depend on that event.
      if (event.key === 'Enter' && event.shiftKey !== true && event.metaKey !== true && event.ctrlKey !== true && event.altKey !== true) {
        window.setTimeout(pin, 0);
      }
      return;
    }
    if (SCROLL_KEYS.has(event.key) && event.metaKey !== true && event.ctrlKey !== true) {
      onUserScroll();
    }
  };

  const observer = typeof MutationObserver === 'function' ? new MutationObserver(hold) : null;
  observer?.observe(document.body, { childList: true, subtree: true, characterData: true });
  document.addEventListener('scroll', onScroll, true);
  document.addEventListener('wheel', onUserScroll, { passive: true, capture: true });
  document.addEventListener('touchmove', onUserScroll, { passive: true, capture: true });
  document.addEventListener('input', onInput, true);
  document.addEventListener('keydown', onKeyDown, true);
  setReadingGesture(onUserScroll); // the keyboard layer reports real scroll gestures
  const onPointerDown = (event) => {
    if (event.target !== conversationScroller()) return;
    onUserScroll();
  };
  document.addEventListener('pointerdown', onPointerDown, true);
  const unsubscribe = deps.subscribeCurrentSession(() => enter(deps.currentSessionId()));
  enter(deps.currentSessionId());

  return () => {
    observer?.disconnect();
    document.removeEventListener('scroll', onScroll, true);
    document.removeEventListener('wheel', onUserScroll, true);
    document.removeEventListener('touchmove', onUserScroll, true);
    document.removeEventListener('input', onInput, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('pointerdown', onPointerDown, true);
    window.clearTimeout(userDrivingTimer);
    unsubscribe();
    if (frame !== 0) window.cancelAnimationFrame(frame);
  };
}

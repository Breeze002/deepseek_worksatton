/**
 * Keep the keyboard in the conversation when a Session is entered.
 *
 * With a file or a subagent open on the right, entering a Session could leave the focus there, so
 * typing and the wheel acted on the right pane. The conversation is located from this plugin's own
 * header anchor — the same way the reading memory finds the scroller — so no shell class name is
 * involved, and the focus is only moved when it is *outside* the conversation: clicking into the
 * right pane deliberately is never undone.
 */
import { reportDiagnostic } from './diagnostics.js';

/**
 * The conversation's scroller.
 *
 * The header and the scroller are *siblings* in the real DOM, so an ancestor walk finds nothing;
 * this is the same geometric rule the reading memory uses (the tallest scrollable region below this
 * plugin's own header anchor, spanning the main column), which is verified against the live app.
 */
export function conversationRegion() {
  const anchor = document.querySelector('.dsc-reading-anchor');
  if (anchor === null) return null;
  const anchorBox = anchor.getBoundingClientRect();
  const minWidth = Math.max(360, window.innerWidth * 0.5);
  let best = null;
  for (const node of document.querySelectorAll('div')) {
    if (node.closest('.dsc-member-panel') !== null) continue;
    if (node.scrollHeight <= node.clientHeight) continue;
    if (node.clientHeight < 200) continue;
    const style = getComputedStyle(node);
    if (style.overflowY !== 'auto' && style.overflowY !== 'scroll' && style.overflowY !== 'overlay') continue;
    const box = node.getBoundingClientRect();
    if (box.width < minWidth) continue;
    if (box.top < anchorBox.top) continue;
    if (best === null || node.clientHeight > best.clientHeight) best = node;
  }
  return best;
}

/** The composer in the conversation's own column: the shell puts it below the scroller. */
export const composerIn = (region) => {
  if (region === null || region === undefined) return null;
  const box = region.getBoundingClientRect();
  let best = null;
  for (const node of document.querySelectorAll('[contenteditable="true"], textarea')) {
    if (node.closest('.dsc-member-panel') !== null) continue;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0) continue;
    if (rect.left < box.left - 40 || rect.right > box.right + 40) continue;
    // The shell puts the composer directly under the scroller; a field anywhere else is somebody
    // else's input (a search box, a dialog) and taking the focus there would be wrong.
    if (rect.top < box.bottom - 80) continue;
    if (best === null || rect.top < best.getBoundingClientRect().top) best = node;
  }
  return best;
};

/**
 * Put the keyboard back in the conversation.
 *
 * @returns which route was taken, for the markers: `already-left` means it was left alone.
 */
export const focusConversation = (region = conversationRegion()) => {
  if (region === null) return 'no-region';
  const active = document.activeElement;
  if (active !== null && active !== undefined && region.contains(active)) return 'already-left';
  const composer = composerIn(region);
  if (composer !== null) {
    composer.focus({ preventScroll: true });
    return 'composer';
  }
  try {
    region.tabIndex = -1;
    region.focus({ preventScroll: true });
    return 'region';
  } catch {
    return 'failed';
  }
};

/**
 * Move the focus into the conversation whenever the visible Session changes.
 *
 * @param deps.currentSessionId - reads the Session the main view shows.
 * @param deps.subscribe - subscribes to that changing; returns its disposer.
 * @param deps.publish - inspection marker.
 */
export const createFocusKeeper = (deps = {}) => {
  let last = null;
  const apply = () => {
    const current = deps.currentSessionId?.() ?? null;
    if (current === null || current === last) return;
    last = current;
    // Two frames: the shell renders the entered Session (and its composer) after the switch.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const outcome = focusConversation();
        deps.publish?.(`sessionCardsFocus=${outcome}`.slice(0, 160));
      });
    });
  };
  const unsubscribe = deps.subscribe?.(apply);
  return { apply, stop: () => unsubscribe?.() };
};

export { reportDiagnostic };

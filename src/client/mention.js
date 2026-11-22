/**
 * The `@member` trigger source for a group chat's composer.
 *
 * The shell owns that composer — a Lexical `contentEditable` — and renders one `@` menu for every
 * registered trigger source. Contributing members as a source (instead of drawing our own list over
 * the editor) is what keeps this working when the composer's internals change: the shell resolves
 * the caret, filters and inserts; this module only answers "which members may this Session address".
 *
 * A pick inserts plain `@alias ` and the aliases are also published as this source's lexicon, so the
 * shell decorates the token in the draft while the submitted message keeps the literal mention that
 * `chat.js` routes on. Nothing here reads or writes the DOM.
 */
import { latestBoardState } from './state.js';

/** Registered source name: unique per trigger, hidden by `showGroupTitle: false`. */
export const SOURCE_NAME = 'sessionCardsMembers';
const TRIGGER = '@';
const MAX_ROWS = 8;

/** The group whose chat Session is `sessionId`, or null when that Session is not a group chat. */
function chatGroupOf(board, sessionId) {
  if (sessionId === undefined || sessionId === null) return null;
  for (const group of board?.data?.groups ?? []) {
    if (group.archived === true) continue;
    if (group.chatSessionId !== undefined && group.chatSessionId !== null && group.chatSessionId === sessionId) {
      return group;
    }
  }
  return null;
}

/**
 * Build the source. `board` and `subscribe` are injected so the source reads the same live snapshot
 * as the rest of the Client and so a test can drive it without a Harness.
 *
 * @param deps.board - reads the latest board snapshot (defaults to the Client-wide mirror).
 * @param deps.subscribe - subscribes to board changes, for the lexicon re-poll.
 * @param deps.publish - inspection marker.
 * @returns an `InputTriggerSource` for `trigger: '@'`.
 */
export function createMemberMentionSource(deps = {}) {
  const board = deps.board ?? (() => latestBoardState);
  const subscribe = deps.subscribe ?? (() => () => {});
  const publish = deps.publish ?? (() => {});
  const membersOf = (sessionId) => chatGroupOf(board(), sessionId)?.members ?? [];
  // Report the roll size whenever it changes. This is the only externally visible proof that the
  // shell really asked this source for candidates, and for which kind of Session.
  let lastReported = -1;

  return {
    trigger: TRIGGER,
    name: SOURCE_NAME,
    // Group chat members are the primary intent there, so they lead the shell's own candidates.
    order: -1,
    // The shipped `@` reference source hides its title too; a bare source name is not user-facing copy.
    showGroupTitle: false,
    async candidates(session, request) {
      const rows = membersOf(session?.sessionId);
      if (rows.length !== lastReported) {
        lastReported = rows.length;
        publish(`sessionCardsMentionAsked=members:${rows.length}`);
      }
      if (rows.length === 0) return [];
      const query = String(request?.query ?? '').trim().toLowerCase();
      const matched = query === ''
        ? rows
        : rows.filter(
          (member) => (member.alias ?? '').toLowerCase().includes(query)
            || (member.title ?? '').toLowerCase().includes(query),
        );
      if (request?.signal?.aborted === true) return [];
      return matched.slice(0, MAX_ROWS).map((member) => ({
        // `name` is the pick payload, the exact-match key and the first search key: the alias itself.
        name: member.alias,
        label: member.alias,
        description: member.title || member.cwd || '',
        icon: 'session',
        value: member.id,
      }));
    },
    onPick(pick) {
      const alias = String(pick?.candidate?.name ?? '');
      if (alias === '') return undefined;
      publish(`sessionCardsMentionPick=${alias}`);
      // Plain text, not a reference chip: the router matches the literal `@alias` in the message.
      return { text: `${TRIGGER}${alias} ` };
    },
    lexicon(session) {
      return membersOf(session?.sessionId).map((member) => member.alias);
    },
    subscribeLexicon(_session, listener) {
      return subscribe(listener);
    },
  };
}

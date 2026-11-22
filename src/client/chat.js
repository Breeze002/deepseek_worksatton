/**
 * The group chat is an ordinary Session: the shell renders it, you type into its normal composer,
 * and this module is the router around it.
 *
 * In:  a `user/message` in the chat Session is routed to the member named with `@alias`, and the
 *      chat Session's own agent is cancelled so the group does not answer itself.
 * Out: a settled `assistant/message` in a member's Session is written into the chat Session as a
 *      prompt line (`@alias：…`), again cancelled. The platform exposes no way to append an
 *      assistant-side line, so member answers appear on the user side — the cost of having the
 *      chat be a real conversation.
 */
const MENTION = /@([^\s@,，。!！?？:：]+)/gu;
const MAX_READ = 40;

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** The member named by the first `@…` token matching an alias, longest alias first. */
export function mentionedMember(text, members) {
  const names = [...members].sort((a, b) => (b.alias ?? '').length - (a.alias ?? '').length);
  const tokens = [...String(text).matchAll(MENTION)].map((match) => match[1]);
  for (const token of tokens) {
    const exact = names.find((member) => (member.alias ?? '').toLowerCase() === token.toLowerCase());
    if (exact !== undefined) return exact;
  }
  return null;
}

/** The text of a settled assistant message, ignoring reasoning and tool traffic. */
export function assistantText(event) {
  const content = event?.data?.message;
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

/** The plain text of a user message event. */
export function userText(event) {
  const content = event?.data?.message ?? event?.data?.content;
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

export function createGroupChat(deps) {
  // sessionId -> { reference, unsubscribe, seen: Set<seq>, handlers: Map<name, fn> }
  const watched = new Map();

  const sessions = () => deps.sessions?.() ?? null;

  /**
   * Start (or re-point) one named handler on a Session's event stream. The name matters: a Session
   * could be watched lazily before its real handler was known, and the earlier `if (watched.has(…))
   * return` kept that placeholder forever — which is how a member's answers stopped being mirrored.
   * Naming the slot also makes a repeated `follow` replace its handler instead of stacking a copy.
   */
  const watch = async (sessionId, name, onEvent) => {
    const service = sessions();
    if (service === null || service === undefined) return;
    const existing = watched.get(sessionId);
    if (existing !== undefined) {
      existing.handlers.set(name, onEvent);
      return;
    }
    const entry = { reference: null, unsubscribe: null, seen: new Set(), handlers: new Map([[name, onEvent]]) };
    watched.set(sessionId, entry);
    try {
      const reference = service.retain(sessionId, { source: 'gateway' });
      entry.reference = reference;
      await reference.ready;
      const source = reference.binding.eventSource;
      // Seed whatever the window already holds, so arming a handler later cannot replay history as
      // new traffic — otherwise a member armed at mention time would dump its older answers into the
      // chat the moment it next speaks.
      for (const item of source.getSnapshot()?.entries ?? []) {
        if (item?.type === 'event' && item.event?.seq !== undefined) entry.seen.add(item.event.seq);
      }
      entry.unsubscribe = source.subscribe(() => {
        const window = source.getSnapshot();
        for (const item of (window?.entries ?? []).slice(-MAX_READ)) {
          if (item?.type !== 'event') continue;
          const event = item.event;
          if (entry.seen.has(event?.seq)) continue;
          entry.seen.add(event?.seq);
          for (const handler of entry.handlers.values()) void handler(event, reference);
        }
      });
    } catch (failure) {
      watched.delete(sessionId);
      deps.publish?.(`sessionCardsChatWatch=${failure instanceof Error ? failure.message : String(failure)}`.slice(0, 180));
    }
  };

  const prompt = async (sessionId, text) => {
    const service = sessions();
    if (service === null || service === undefined) return false;
    try {
      let entry = watched.get(sessionId);
      if (entry === undefined) {
        await watch(sessionId, 'keepalive', () => {});
        entry = watched.get(sessionId);
      }
      const reference = entry?.reference;
      if (reference == null) return false;
      await reference.ready;
      const result = await reference.binding.session.prompt([{ type: 'text', text }], 'queue');
      return result?.ok !== false;
    } catch (failure) {
      deps.publish?.(`sessionCardsChatPrompt=${failure instanceof Error ? failure.message : String(failure)}`.slice(0, 180));
      return false;
    }
  };

  /** The chat Session's own agent must not answer: the group's answers come from its members. */
  const silence = async (sessionId) => {
    const reference = watched.get(sessionId)?.reference;
    if (reference == null) return;
    try {
      await reference.binding.session.cancel();
    } catch {
      /* a chat Session that is not running needs no cancel */
    }
  };

  const seeded = new Set();

  /** The group to act on: the named one, else the first the Host reports (the board may not be
   *  loaded yet — a shortcut must not depend on a snapshot that has not arrived). */
  const resolveGroup = async (groupId) => {
    if (groupId !== null && groupId !== undefined) return groupId;
    const controller = deps.controller?.();
    if (controller === null || controller === undefined) return null;
    try {
      const options = await controller.options();
      const group = (options?.groups ?? []).find((candidate) => candidate.archived !== true);
      return group?.id ?? null;
    } catch {
      return null;
    }
  };

  /** Open (creating on first use) the group's chat Session in the shell. */
  const open = async (groupId) => {
    const controller = deps.controller?.();
    deps.publish?.(`sessionCardsChatOpen=begin:${groupId ?? 'none'}:controller=${controller === null || controller === undefined ? 'no' : 'yes'}`.slice(0, 180));
    if (controller === null || controller === undefined) return null;
    const resolved = await resolveGroup(groupId);
    if (resolved === null) {
      deps.publish?.('sessionCardsChatNoGroup');
      return null;
    }
    groupId = resolved;
    try {
      const sessionId = await controller.chatSession(groupId);
      await follow(groupId); // routing starts the moment the chat is opened
      if (seeded.has(sessionId) !== true) {
        // A brand-new Session renders the shell's start page; one opening line turns the chat into
        // an ordinary conversation right away.
        seeded.add(sessionId);
        const line = deps.seedLine?.() ?? 'Group chat ready — mention @name to ask someone';
        await prompt(sessionId, line);
        await silence(sessionId);
      }
      deps.publish?.(`sessionCardsChat=open:${sessionId}`.slice(0, 180));
      deps.openSession?.(sessionId);
      return sessionId;
    } catch (failure) {
      deps.publish?.(`sessionCardsChatOpen=${failure instanceof Error ? failure.message : String(failure)}`.slice(0, 180));
      return null;
    }
  };

  const stop = () => {
    for (const entry of watched.values()) {
      entry.unsubscribe?.();
      entry.reference?.release?.();
    }
    watched.clear();
  };

  /** Route one member's settled answer back into the chat Session as a line. */
  const mirrorFrom = (chatId, member) => async (event) => {
    if (event.type !== 'assistant/message') return;
    const text = assistantText(event);
    if (text === '') return;
    await prompt(chatId, `@${member.alias}：${text}`);
    await silence(chatId);
  };

  /**
   * Route one mention in the chat Session into the named member's Session.
   *
   * The mirror handler for that member is installed here, before the message is handed over: a member
   * can join the group after the last `follow`, and if its Session is first watched lazily (by the
   * prompt itself) its answers would be routed to a placeholder that never mirrors them.
   */
  const forwardFrom = (chatId, groupId) => async (event) => {
    if (event.type !== 'user/message') return;
    const text = userText(event);
    if (text === '') return;
    const named = mentionedMember(text, deps.membersOf?.(groupId) ?? []);
    if (named === null) return;
    await watch(named.sessionId, 'mirror', mirrorFrom(chatId, named));
    const body = text.replace(new RegExp(`@${escapeRegExp(named.alias)}`, 'iu'), '').trim();
    if (body !== '') await prompt(named.sessionId, body);
    await silence(chatId);
  };

  /** Start routing for one group: watch its chat Session and every member it may address. */
  const follow = async (groupId) => {
    const controller = deps.controller?.();
    if (controller === null || controller === undefined) return;
    let chatId = null;
    try {
      chatId = await controller.chatSession(groupId);
    } catch {
      return; // no chat Session yet: it is created when the user opens the chat
    }
    await watch(chatId, 'forward', forwardFrom(chatId, groupId));
    for (const member of deps.membersOf?.(groupId) ?? []) {
      await watch(member.sessionId, 'mirror', mirrorFrom(chatId, member));
    }
  };

  return { open, follow, prompt, silence, stop, watched };
}

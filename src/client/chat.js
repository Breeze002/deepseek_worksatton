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
  const watched = new Map(); // sessionId -> { reference, unsubscribe, seen }

  const sessions = () => deps.sessions?.() ?? null;

  const watch = async (sessionId, onEvent) => {
    const service = sessions();
    if (service === null || service === undefined) return;
    if (watched.has(sessionId)) return;
    const entry = { reference: null, unsubscribe: null, seen: new Set() };
    watched.set(sessionId, entry);
    try {
      const reference = service.retain(sessionId, { source: 'gateway' });
      entry.reference = reference;
      await reference.ready;
      const source = reference.binding.eventSource;
      entry.unsubscribe = source.subscribe(() => {
        const window = source.getSnapshot();
        for (const item of (window?.entries ?? []).slice(-MAX_READ)) {
          if (item?.type !== 'event') continue;
          const event = item.event;
          if (entry.seen.has(event?.seq)) continue;
          entry.seen.add(event?.seq);
          void onEvent(event, reference);
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
        await watch(sessionId, () => {});
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

  /** Open (creating on first use) the group's chat Session in the shell. */
  const open = async (groupId) => {
    const controller = deps.controller?.();
    if (controller === null || controller === undefined) return null;
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
      deps.publish?.(`sessionCardsChatOpen=${sessionId}`.slice(0, 180));
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
    const members = deps.membersOf?.(groupId) ?? [];
    await watch(chatId, async (event) => {
      if (event.type !== 'user/message') return;
      const text = userText(event);
      if (text === '') return;
      const named = mentionedMember(text, deps.membersOf?.(groupId) ?? []);
      if (named === null) return;
      const body = text.replace(new RegExp(`@${escapeRegExp(named.alias)}`, 'iu'), '').trim();
      if (body !== '') await prompt(named.sessionId, body);
      await silence(chatId);
    });
    for (const member of members) {
      await watch(member.sessionId, async (event) => {
        if (event.type !== 'assistant/message') return;
        const text = assistantText(event);
        if (text === '') return;
        await prompt(chatId, `@${member.alias}：${text}`);
        await silence(chatId);
      });
    }
  };

  return { open, follow, prompt, silence, stop, watched };
}

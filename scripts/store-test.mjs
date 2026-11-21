#!/usr/bin/env node
/**
 * Host-side store tests. Reordering decides the Alt+1…9 mapping, so it is a persisted command and
 * deserves the same care as the others: order, clamping, idempotency and refusal.
 *
 *   node scripts/store-test.mjs
 */
import { CardStore } from '../lib/store.js';
import { newId } from '../lib/model.js';

let passed = 0;
const failures = [];
const check = (label, condition, detail = '') => {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label}`);
    return;
  }
  failures.push(label);
  console.log(`  FAIL ${label}${detail === '' ? '' : ` — ${detail}`}`);
};

const made = (n) => ({ sessionId: `session-${n}`, alias: `a${n}`, title: `t${n}`, cwd: `/tmp/${n}` });

let saved = null;
const store = new CardStore({
  load: async () => saved,
  save: async (state) => {
    saved = structuredClone(state);
  },
});
await store.initialize();

await store.execute({
  commandId: newId(),
  action: 'createGroup',
  name: 'group',
  goal: '',
  members: [made(1), made(2), made(3)],
});
const group = store.snapshot().groups[0];
const [first, second, third] = group.members.map((member) => member.id);
const order = () => store.snapshot().groups[0].members.map((member) => member.sessionId).join();

check('members start in the submitted order', order() === 'session-1,session-2,session-3', order());

await store.execute({ commandId: newId(), action: 'moveMember', groupId: group.id, memberId: third, toIndex: 0 });
check('moving the last member to the front reorders them', order() === 'session-3,session-1,session-2', order());

await store.execute({ commandId: newId(), action: 'moveMember', groupId: group.id, memberId: first, toIndex: 9 });
check('an out-of-range target clamps to the end', order() === 'session-3,session-2,session-1', order());

await store.execute({ commandId: newId(), action: 'moveMember', groupId: group.id, memberId: second, toIndex: 0 });
check('moving the middle member to the front works too', order() === 'session-2,session-3,session-1', order());
await store.execute({ commandId: newId(), action: 'moveMember', groupId: group.id, memberId: second, toIndex: 2 });
check('and moving it back down works', order() === 'session-3,session-1,session-2', order());

const repeated = newId();
await store.execute({ commandId: repeated, action: 'moveMember', groupId: group.id, memberId: third, toIndex: 0 });
const once = order();
await store.execute({ commandId: repeated, action: 'moveMember', groupId: group.id, memberId: third, toIndex: 0 });
check('a repeated command id is a no-op', order() === once, once);

check('the reordered list was persisted', Array.isArray(saved?.groups?.[0]?.members) && saved.groups[0].members.map((member) => member.sessionId).join() === order(), order());

await store.execute({
  commandId: newId(),
  action: 'postChatMessage',
  groupId: group.id,
  from: 'you',
  alias: '你',
  text: '@a1 请看这个',
});
const chat = store.snapshot().groups[0].messages;
check('a chat line is stored with its author', chat.length === 1 && chat[0].from === 'you' && chat[0].alias === '你', JSON.stringify(chat[0] ?? null));
await store.execute({
  commandId: newId(),
  action: 'postChatMessage',
  groupId: group.id,
  from: second,
  alias: 'a2',
  text: '收到，我来处理',
});
const chat2 = store.snapshot().groups[0].messages;
check('and lines keep their order', chat2.length === 2 && chat2[1].from === second, chat2.map((line) => line.from).join(','));
const repeatedChat = newId();
await store.execute({ commandId: repeatedChat, action: 'postChatMessage', groupId: group.id, from: 'you', alias: '你', text: 'only once' });
await store.execute({ commandId: repeatedChat, action: 'postChatMessage', groupId: group.id, from: 'you', alias: '你', text: 'only once' });
check('a repeated chat command stays a no-op', store.snapshot().groups[0].messages.length === 3, String(store.snapshot().groups[0].messages.length));
check('and the chat is persisted', Array.isArray(saved?.groups?.[0]?.messages) && saved.groups[0].messages.length === 3);

await store.execute({ commandId: newId(), action: 'setChatSession', groupId: group.id, sessionId: 'session-chat' });
check('the group remembers its chat session', store.snapshot().groups[0].chatSessionId === 'session-chat');
check('and it is persisted', saved?.groups?.[0]?.chatSessionId === 'session-chat');
check('a fresh group starts without one', store.snapshot().groups.every((entry) => entry.chatSessionId !== undefined));

let refused = false;
try {
  await store.execute({ commandId: newId(), action: 'moveMember', groupId: group.id, memberId: 'missing', toIndex: 0 });
} catch {
  refused = true;
}
check('moving an unknown member is refused', refused);

let badIndex = false;
try {
  await store.execute({ commandId: newId(), action: 'moveMember', groupId: group.id, memberId: second, toIndex: -3 });
} catch {
  badIndex = true;
}
check('a negative index is refused by the schema', badIndex);

await store.close();

if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} of ${failures.length + passed} store checks failed`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`PASS: ${passed} store checks passed`);

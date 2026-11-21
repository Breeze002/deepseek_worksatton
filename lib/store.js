/**
 * The board's durable state: one serialized mutation chain, a revision per committed change,
 * and subscribers for the Remote `watch` long-poll.
 *
 * Every mutation clones the current state, applies the change, persists the result, and only
 * then publishes it — so a failed save never leaves the board claiming a change it lost. A
 * command id that was already applied is a no-op, which keeps a retried submission safe.
 */
import { blankSnapshot, memberSchema, newId, resolvedCommandSchema, snapshotSchema } from './model.js';

export class CardStore {
  #state = blankSnapshot();
  #chain = Promise.resolve();
  #listeners = new Set();
  #closed = false;

  constructor(persistence) {
    this.persistence = persistence;
  }

  async initialize() {
    const stored = await this.persistence.load();
    if (stored === null || stored === undefined) {
      // Materialize the unit on first boot: a fresh profile then has a readable record, and the
      // storage file's existence reports whether this board ever came up.
      this.#state = blankSnapshot();
      await this.persistence.save(this.#state);
      return;
    }
    this.#state = snapshotSchema.parse(stored);
  }

  snapshot() {
    return structuredClone(this.#state);
  }

  get revision() {
    return this.#state.revision;
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async #mutate(operation) {
    const run = this.#chain.then(async () => {
      if (this.#closed) throw new Error('会话卡片服务已停止');
      const next = structuredClone(this.#state);
      const changed = await operation(next);
      if (changed === false) return;
      next.revision = this.#state.revision + 1;
      await this.persistence.save(next);
      this.#state = next;
      for (const listener of this.#listeners) listener();
    });
    // Keep the chain alive for the next caller, and surface this caller's failure.
    this.#chain = run.catch(() => {});
    return run;
  }

  #group(state, groupId) {
    const group = state.groups.find((candidate) => candidate.id === groupId);
    if (!group) throw new Error('群组不存在');
    if (group.archived) throw new Error('群组已归档');
    return group;
  }

  #record(state, commandId) {
    state.commands.push(commandId);
    if (state.commands.length > 512) state.commands.splice(0, state.commands.length - 512);
  }

  /** Apply one resolved command. Member facts are resolved by the caller before this runs. */
  async execute(raw) {
    const command = resolvedCommandSchema.parse(raw);
    if (this.#state.commands.includes(command.commandId)) return;
    await this.#mutate((state) => {
      switch (command.action) {
        case 'createGroup': {
          state.groups.push({
            id: newId(),
            name: command.name,
            goal: command.goal,
            archived: false,
            createdAt: Date.now(),
            members: command.members.map((member) => memberSchema.parse({ ...member, id: newId() })),
          });
          break;
        }
        case 'addMember': {
          const group = this.#group(state, command.groupId);
          if (group.members.length >= 16) throw new Error('一个群组最多 16 位成员');
          if (group.members.some((member) => member.sessionId === command.member.sessionId)) {
            throw new Error('该会话已经在群里');
          }
          group.members.push(memberSchema.parse({ ...command.member, id: newId() }));
          break;
        }
        case 'removeMember': {
          const group = this.#group(state, command.groupId);
          const before = group.members.length;
          group.members = group.members.filter((member) => member.id !== command.memberId);
          if (group.members.length === before) throw new Error('成员不存在');
          break;
        }
        case 'moveMember': {
          const group = this.#group(state, command.groupId);
          const from = group.members.findIndex((member) => member.id === command.memberId);
          if (from < 0) throw new Error('成员不存在');
          const to = Math.max(0, Math.min(group.members.length - 1, command.toIndex));
          if (to !== from) {
            const [moved] = group.members.splice(from, 1);
            group.members.splice(to, 0, moved);
          }
          break;
        }
        case 'archiveGroup': {
          this.#group(state, command.groupId).archived = true;
          break;
        }
        default:
          throw new Error(`不支持的指令：${command.action}`);
      }
      this.#record(state, command.commandId);
    });
  }

  async close() {
    this.#closed = true;
    await this.#chain.catch(() => {});
    this.#listeners.clear();
  }
}

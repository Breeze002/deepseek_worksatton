/**
 * Host half of the session card board.
 *
 * M2: owns the durable board — a Harness storage KV unit plus one serialized mutation chain —
 * and exposes it to the Client through the Typert Remote namespace `sessionCards`
 * (`options`, `snapshot`, `watch`, `execute`). Task dispatch and member execution state
 * arrive in M3.
 *
 * Boot runs from the constructor as well as from the inherited `Service.init` hook: a linked
 * package installed outside the profile did not receive the init call in this deployment, and
 * `_boot` is idempotent, so whichever path cordis takes, the unit and the namespace are
 * registered exactly once. The `[session-cards]` lines on stderr make that path observable.
 */
import { Service } from '@deepseek-ai/cordis';
import { RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { commandSchema, newId } from './lib/model.js';
import { remoteInfo } from './lib/rpc.js';
import { CardStore } from './lib/store.js';

/** How long a `watch` call parks before answering with the unchanged revision. */
const WATCH_HEARTBEAT_MS = 20_000;

/** Startup trail for this plugin; harmless in production and decisive when a row is inert. */
function bootLog(line) {
  try {
    process.stderr.write(`[session-cards] ${line}\n`);
  } catch {
    /* a closed stderr must not take the plugin down */
  }
}

/** A Session's display title: the `title` projection snapshot carried by the list hints. */
function sessionTitleOf(row) {
  const value = row?.projections?.values?.title;
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && typeof value.title === 'string') return value.title.trim();
  return '';
}

/** Trailing separators removed, so equal directories compare equal. */
function canonicalPath(path) {
  return path.length > 1 ? path.replace(/[\\/]+$/u, '') : path;
}

/** Last path segment, used when a Workspace has no title. */
function baseName(path) {
  const trimmed = canonicalPath(path);
  const index = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return index >= 0 ? trimmed.slice(index + 1) || trimmed : trimmed;
}

bootLog('module evaluated');

export default class SessionCardsService extends TypertRemoteService {
  static inject = ['sessionController', 'storage', 'storage.backend.json', 'typert'];

  _store;
  _closed = false;
  _booted = false;
  _bootError;
  _served = new Set();

  constructor(ctx, config = {}) {
    super(ctx, 'sessionCards');
    this.config = config;
    bootLog('constructed');
    void this._boot().catch((error) => {
      bootLog(`boot failed from constructor: ${error?.message ?? error}`);
    });
  }

  async [Service.init]() {
    bootLog('Service.init invoked');
    await this._boot();
  }

  async _boot() {
    if (this._booted) {
      if (this._bootError) throw this._bootError;
      return;
    }
    this._booted = true;
    try {
      const storage = this.ctx.get('storage');
      if (!storage) throw new Error('缺少 storage 服务');
      const backend = storage.backend.get(this.config.backend ?? 'json');
      if (!backend?.kv) throw new Error('存储后端不提供 KV unit');
      bootLog('opening storage unit session_cards');
      const unit = await backend.kv.open({
        name: 'session_cards',
        version: 1,
        tables: [],
        hasGlobal: true,
        layout: 'single',
      });
      this._store = new CardStore({
        load: async () => (await unit.loadAll()).global,
        save: (value) => unit.setGlobal(value),
      });
      await this._store.initialize();
      bootLog(`store ready: revision ${this._store.revision}, groups ${this._store.snapshot().groups.length}`);
      const typert = this.ctx.get('typert');
      if (!typert) throw new Error('缺少 typert 服务');
      typert.register({
        package: remoteInfo.package,
        face: 'host',
        schemas: [],
        invocations: remoteInfo.descriptors,
        model: { services: [], events: [], objects: [] },
      });
      bootLog(`typert registered: ${remoteInfo.descriptors.length} descriptors in namespace ${remoteInfo.descriptors[0]?.namespace}`);
      this.ctx.effect(
        () => async () => {
          this._closed = true;
          await this._store?.close();
          await unit.close();
        },
        'session-cards: durable lifecycle',
      );
    } catch (error) {
      this._bootError = error;
      bootLog(`boot FAILED: ${error?.message ?? error}`);
      throw error;
    }
  }

  /** Report the first successful Remote call per method, so a live Client is observable. */
  _note(method) {
    if (this._served.has(method)) return;
    this._served.add(method);
    bootLog(`remote call served: ${method}`);
  }

  /** The board is owner-only, like every other surface that drives the operator's sessions. */
  _owner() {
    const invocation = this.ctx.invocation;
    if (!invocation) return;
    const { peer } = invocation;
    if (peer.principal?.kind === 'owner') return;
    const connection = this.ctx.get('connection');
    if (!('principal' in peer) && connection?.operator === peer) return;
    throw new RemoteError('gateway/bad-request', '会话卡片仅允许 Host 所有者访问', {});
  }

  _require() {
    if (this._closed || !this._store) throw new Error('会话卡片服务不可用');
    return this._store;
  }

  /** Real top-level sessions that can become members, grouped by owning Workspace. */
  async _sessionGroups(signal) {
    const rows = (await this.ctx.get('sessionController').list({}, signal)).items ?? [];
    const registry = this.ctx.get('workspaceRegistry');
    let workspaces = [];
    try {
      workspaces = (await registry?.list?.()) ?? [];
    } catch {
      /* a missing registry only costs the group titles */
    }
    const byPath = new Map();
    for (const workspace of workspaces) {
      const path = workspace?.path ?? workspace?.cwd;
      if (typeof path === 'string' && path.length > 0) byPath.set(canonicalPath(path), workspace);
    }
    const groups = new Map();
    for (const row of rows) {
      if (row.origin === 'subagent' || row.parentId) continue;
      const sessionId = row.sessionId ?? row.id;
      const cwd = typeof row.cwd === 'string' ? row.cwd : '';
      const workspace = cwd ? byPath.get(canonicalPath(cwd)) : undefined;
      const key = workspace ? String(workspace.id ?? workspace.workspaceId ?? canonicalPath(cwd)) : `cwd:${canonicalPath(cwd)}`;
      let group = groups.get(key);
      if (group === undefined) {
        const title = workspace?.title ?? workspace?.name;
        group = {
          id: key,
          title: typeof title === 'string' && title.length > 0 ? title : cwd.length > 0 ? baseName(cwd) : '未归属工作区',
          cwd,
          sessions: [],
        };
        groups.set(key, group);
      }
      group.sessions.push({ sessionId, title: sessionTitleOf(row), cwd });
    }
    return [...groups.values()];
  }

  /** Read one Session's logged title from its projection, when the list hints omit it. */
  async _titleOf(sessionId, signal) {
    try {
      const view = await this.ctx.get('sessionController').projections({ sessionId }, signal);
      const value = view?.values?.title;
      if (typeof value === 'string') return value.trim();
      if (value && typeof value === 'object' && typeof value.title === 'string') return value.title.trim();
    } catch {
      /* an unavailable projection must not block member resolution */
    }
    return '';
  }

  /** Resolve submitted members against the live Session list and freeze their card facts. */
  async _resolveMembers(inputs, signal) {
    const rows = (await this.ctx.get('sessionController').list({}, signal)).items ?? [];
    const resolved = [];
    for (const input of inputs) {
      const row = rows.find((candidate) => (candidate.sessionId ?? candidate.id) === input.sessionId);
      if (!row) throw new Error('会话不存在，或已不在当前 Host 列表中');
      if (row.origin === 'subagent' || row.parentId) throw new Error('子代理会话不能作为群成员');
      const cwd = row.cwd ? await realpath(row.cwd).catch(() => resolve(row.cwd)) : '';
      const title = sessionTitleOf(row) || (await this._titleOf(input.sessionId, signal));
      resolved.push({ sessionId: input.sessionId, alias: input.alias, title, cwd });
    }
    return resolved;
  }

  /** Candidate sessions for the member picker. */
  async options(_request, signal) {
    this._owner();
    this._note('options');
    signal.throwIfAborted();
    return { groups: await this._sessionGroups(signal) };
  }

  /** Current board state. */
  snapshot(_request, signal) {
    this._owner();
    this._note('snapshot');
    signal.throwIfAborted();
    return this._require().snapshot();
  }

  /** Answer on the next committed revision, or after the heartbeat with the current one. */
  async watch(request, signal) {
    this._owner();
    this._note('watch');
    signal.throwIfAborted();
    const store = this._require();
    if (store.revision !== request.revision) return store.snapshot();
    await new Promise((settle, fail) => {
      let done = false;
      const finish = (error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        unsubscribe();
        signal.removeEventListener('abort', onAbort);
        if (error) fail(error);
        else settle();
      };
      const onAbort = () => finish(signal.reason ?? new Error('aborted'));
      const unsubscribe = store.subscribe(() => finish());
      const timer = setTimeout(() => finish(), WATCH_HEARTBEAT_MS);
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
      if (store.revision !== request.revision) finish();
    });
    return this._require().snapshot();
  }

  /** Validate one user operation against live Session facts, then commit it durably. */
  /**
   * The Session hosting one group's chat: created on first use, so the chat is an ordinary
   * conversation the shell itself renders. Returns the Session identity.
   */
  async chatSession(request, signal) {
    this._owner();
    this._note('chatSession');
    signal?.throwIfAborted?.();
    const group = this._require().snapshot().groups.find((candidate) => candidate.id === request.groupId);
    if (group === undefined) throw new RemoteError('gateway/bad-request', '群组不存在', {});
    if (group.chatSessionId !== null && group.chatSessionId !== undefined) return group.chatSessionId;
    const controller = this.ctx.get('sessionController');
    const created = await controller.create({ cwd: group.members[0]?.cwd });
    signal?.throwIfAborted?.();
    try {
      // A name in the session list makes the chat identifiable next to the members.
      await controller.rename({ sessionId: created.sessionId, title: `群聊 · ${group.name}`.slice(0, 80) });
    } catch {
      /* a chat that cannot be renamed is still usable */
    }
    await this._require().execute({
      commandId: newId(),
      action: 'setChatSession',
      groupId: group.id,
      sessionId: created.sessionId,
    });
    return created.sessionId;
  }

  async execute(raw, signal) {
    this._owner();
    this._note('execute');
    signal.throwIfAborted();
    try {
      const command = commandSchema.parse(raw);
      let normalized = command;
      if (command.action === 'createGroup') {
        normalized = { ...command, members: await this._resolveMembers(command.members, signal) };
      } else if (command.action === 'addMember') {
        const [member] = await this._resolveMembers([command.member], signal);
        normalized = { ...command, member };
      }
      signal.throwIfAborted();
      await this._require().execute(normalized);
      return this._require().snapshot();
    } catch (error) {
      if (error instanceof RemoteError) throw error;
      throw new RemoteError('gateway/bad-request', error instanceof Error ? error.message : String(error), {});
    }
  }
}

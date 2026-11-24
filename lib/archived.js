/**
 * Which Sessions the Workspace layer has archived.
 *
 * The Host's session list carries no archive flag (`SessionSummary` has none), and no Client service
 * exposes the archived ids, so the one authority is the Workspace store's `global.archivedSessionIds`.
 * This reads that value read-only and degrades to "nothing archived" on any surprise: showing an
 * archived Session again is a far smaller failure than hiding the picker.
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CACHE_MS = 5000;

/** Pull the archived ids out of a parsed Workspace store. */
export function archivedIdsOf(store) {
  const ids = store?.global?.archivedSessionIds;
  if (Array.isArray(ids) !== true) return [];
  return ids.filter((id) => typeof id === 'string' && id.length > 0);
}

/** Drop the rows whose Session is archived. */
export function withoutArchived(rows, archived) {
  if (archived.size === 0) return rows;
  return rows.filter((row) => archived.has(row?.sessionId ?? row?.id) !== true);
}

export function workspaceStorePath(env = process.env) {
  const home = typeof env.DSH_HOME === 'string' && env.DSH_HOME.length > 0 ? env.DSH_HOME : join(homedir(), '.dsh');
  return join(home, 'storages', 'workspace.json');
}

/** A reader with a short cache, so a dialog that opens repeatedly costs one read. */
export function createArchivedReader(options = {}) {
  const path = options.path ?? workspaceStorePath(options.env);
  const now = options.now ?? (() => Date.now());
  let cache = { at: 0, ids: new Set() };
  return {
    async read() {
      if (now() - cache.at < CACHE_MS) return cache.ids;
      try {
        const parsed = JSON.parse(await readFile(path, 'utf8'));
        cache = { at: now(), ids: new Set(archivedIdsOf(parsed)) };
      } catch {
        // An unreadable or reshaped store means "unknown": filter nothing.
        cache = { at: now(), ids: new Set() };
      }
      return cache.ids;
    },
  };
}

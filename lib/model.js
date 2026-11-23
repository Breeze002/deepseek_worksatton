/**
 * Durable shapes for the card board: member/group records, the snapshot the Client reads,
 * and the command union the Client submits. Every shape is strict, so a stored snapshot
 * round-trips through `snapshotSchema.parse` without gaining or losing fields.
 */
import { z } from 'zod';

export const id = z.string().min(1).max(160);

/** A member as the Client submits it: the Host owns the member id, title and cwd. */
export const memberInputSchema = z
  .object({
    sessionId: id,
    alias: z.string().trim().min(1).max(32),
  })
  .strict();

/** A member as stored: identity plus the resolved Session facts the card shows. */
export const memberSchema = z
  .object({
    id,
    sessionId: id,
    alias: z.string().trim().min(1).max(32),
    title: z.string().max(400),
    cwd: z.string().max(4096),
  })
  .strict();

/** A member after the Host resolved it against the live Session list, before it is stored. */
export const resolvedMemberSchema = memberSchema.omit({ id: true });

/** One line of the group chat: what the user sent, and what a member answered. */
export const chatMessageSchema = z
  .object({
    id,
    at: z.number(),
    /** 'you' or the member id that produced it. */
    from: z.string().trim().min(1).max(64),
    /** Display name kept with the line, so a removed member's words stay readable. */
    alias: z.string().trim().min(1).max(64),
    text: z.string().min(1).max(8000),
  })
  .strict();

export const groupSchema = z
  .object({
    id,
    name: z.string().trim().min(1).max(80),
    goal: z.string().max(4000),
    archived: z.boolean(),
    createdAt: z.number(),
    members: z.array(memberSchema).max(16),
    /** The group chat's transcript; older snapshots simply have none. */
    messages: z.array(chatMessageSchema).max(400).default([]),
    /** The Session that hosts this group's chat, created on first use. */
    chatSessionId: z.string().trim().max(160).nullable().default(null),

  })
  .strict();

/**
 * The plugin's own UI state — group order and each group's last member.
 *
 * It lives in a *separate* storage unit on purpose: the board snapshot's shape must not change, or an
 * older build would reject the whole snapshot and show no groups at all.
 */
export const uiStateSchema = z
  .object({
    groupOrder: z.array(z.string().trim().min(1).max(160)).max(64).default([]),
    lastMember: z.record(z.string().trim().min(1).max(120)).default({}),
  })
  .strict();

export const uiStatePatchSchema = z
  .object({
    groupOrder: z.array(z.string().trim().min(1).max(160)).max(64).optional(),
    lastMember: z.record(z.string().trim().min(1).max(120)).optional(),
  })
  .strict();

export const snapshotSchema = z
  .object({
    formatVersion: z.literal(1),
    revision: z.number().int().nonnegative(),
    /** Recent command ids, so a retried submission stays a no-op. */
    commands: z.array(id).max(512),
    groups: z.array(groupSchema),
  })
  .strict();

const base = { commandId: id, groupId: id };

/** The wire command the Client submits; the Host resolves members before storing them. */
export const commandSchema = z.discriminatedUnion('action', [
  z
    .object({
      commandId: id,
      action: z.literal('createGroup'),
      name: z.string().trim().min(1).max(80),
      goal: z.string().max(4000).default(''),
      members: z.array(memberInputSchema).min(1).max(16),
    })
    .strict(),
  z.object({ ...base, action: z.literal('addMember'), member: memberInputSchema }).strict(),
  z.object({ ...base, action: z.literal('removeMember'), memberId: id }).strict(),
  z.object({ ...base, action: z.literal('moveMember'), memberId: id, toIndex: z.number().int().min(0).max(15) }).strict(),
  z
    .object({
      ...base,
      action: z.literal('setChatSession'),
      sessionId: z.string().trim().min(1).max(160),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal('postChatMessage'),
      from: z.string().trim().min(1).max(64),
      alias: z.string().trim().min(1).max(64),
      text: z.string().min(1).max(8000),
    })
    .strict(),
  z.object({ ...base, action: z.literal('archiveGroup') }).strict(),
]);

/** The same command after member resolution: what the store is allowed to commit. */
export const resolvedCommandSchema = z.discriminatedUnion('action', [
  z
    .object({
      commandId: id,
      action: z.literal('createGroup'),
      name: z.string().trim().min(1).max(80),
      goal: z.string().max(4000),
      members: z.array(resolvedMemberSchema).min(1).max(16),
    })
    .strict(),
  z.object({ ...base, action: z.literal('addMember'), member: resolvedMemberSchema }).strict(),
  z.object({ ...base, action: z.literal('removeMember'), memberId: id }).strict(),
  z.object({ ...base, action: z.literal('moveMember'), memberId: id, toIndex: z.number().int().min(0).max(15) }).strict(),
  z
    .object({
      ...base,
      action: z.literal('postChatMessage'),
      from: z.string().trim().min(1).max(64),
      alias: z.string().trim().min(1).max(64),
      text: z.string().min(1).max(8000),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal('setChatSession'),
      sessionId: z.string().trim().min(1).max(160),
    })
    .strict(),
  z.object({ ...base, action: z.literal('archiveGroup') }).strict(),
]);

/** Candidate sessions the picker offers; the Host resolves them from the Session Controller. */
export const sessionOptionSchema = z
  .object({
    sessionId: id,
    title: z.string().max(400),
    cwd: z.string().max(4096),
  })
  .strict();

/** Sessions grouped by the Workspace that owns their working directory. */
export const sessionGroupSchema = z
  .object({
    id: z.string().max(160),
    title: z.string().max(400),
    cwd: z.string().max(4096),
    sessions: z.array(sessionOptionSchema),
  })
  .strict();

export const optionsSchema = z.object({ groups: z.array(sessionGroupSchema) }).strict();

export function blankSnapshot() {
  return { formatVersion: 1, revision: 0, commands: [], groups: [] };
}

export function newId() {
  return globalThis.crypto.randomUUID();
}

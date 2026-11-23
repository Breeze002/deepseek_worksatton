/**
 * Typert Remote descriptors for the `sessionCards` namespace. Each method declares a strict
 * codec, so both ends reject a payload that does not match the shared shape in `model.js`.
 */
import { z } from 'zod';
import { commandSchema, id, optionsSchema, snapshotSchema, uiStatePatchSchema, uiStateSchema } from './model.js';

const codec = (name, create) => ({ mode: 'strict', typeSymbol: `dsh-session-cards#${name}`, create });

function method(name, input, result = snapshotSchema) {
  const value = codec(`${name}Input`, () => input);
  return {
    service: 'sessionCards',
    invocation: { kind: 'direct' },
    parameters: [{ name: 'request', source: 'json', codec: value, strictCodec: value }],
    cancellation: { parameter: 'signal' },
    result: codec(`${name}Result`, () => result),
  };
}

export const methods = {
  options: method('options', z.object({}).strict(), optionsSchema),
  snapshot: method('snapshot', z.object({}).strict()),
  watch: method('watch', z.object({ revision: z.number().int().nonnegative() }).strict()),
  execute: method('execute', commandSchema),
  chatSession: method('chatSession', z.object({ groupId: id }).strict(), z.string().min(1).max(160)),
  uiState: method('uiState', z.object({}).strict(), uiStateSchema),
  setUiState: method('setUiState', uiStatePatchSchema, uiStateSchema),
};

export const packageName = 'dsh-session-cards';

export const remoteInfo = {
  package: packageName,
  descriptors: Object.entries(methods).map(([name, definition]) => ({
    ...definition,
    id: `${packageName}#sessionCards/${name}`,
    namespace: 'sessionCards',
    method: name,
    parameters: definition.parameters.map((parameter) => ({ ...parameter, wire: parameter.name })),
  })),
};

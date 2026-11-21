/** Dialogs: the session picker, the create/add flows and the workspace chooser. */
import React from 'react';
import { Btn, Icon } from './parts.js';
import { newCommandId } from '../state.js';
import { sessionTitleFrom } from '../diagnostics.js';

const h = React.createElement;

function Modal({ title, onClose, onSubmit, submitLabel, busy, error, disabled, children }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    // Only text entry claims focus; a checkbox would take the list's arrow keys away.
    const first = ref.current?.querySelector('input:not([type="checkbox"]):not([type="radio"]), textarea, select');
    first?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return h(
    'div',
    {
      className: 'dsc-overlay',
      role: 'presentation',
      onMouseDown: (event) => {
        if (event.target === event.currentTarget) onClose();
      },
    },
    h(
      'form',
      {
        ref,
        className: 'dsc-modal',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': title,
        onSubmit: (event) => {
          event.preventDefault();
          onSubmit();
        },
      },
      h('h3', null, title),
      children,
      error ? h('p', { className: 'dsc-error', role: 'alert' }, error) : null,
      h(
        'div',
        { className: 'dsc-foot' },
        h(Btn, { onClick: onClose, disabled: busy }, submitLabel.cancel),
        h(Btn, { type: 'submit', primary: true, disabled: busy || disabled }, busy ? submitLabel.busy : submitLabel.submit),
      ),
    ),
  );
}

/** Session picker shared by the create and add flows. `picked` maps sessionId to an alias. */
/** Session picker shared by the create and add flows, grouped by owning Workspace. */

function SessionPicker({ t, groups, exclude, picked, onToggle, onAlias, onCreate, creating, loading }) {
  const [cursor, setCursor] = React.useState(0);
  const container = React.useRef(null);
  // Every hook runs before the early returns: the visible rows are therefore computed up front.
  const visible = loading
    ? []
    : groups
        .map((group) => ({ ...group, sessions: group.sessions.filter((session) => !exclude?.has(session.sessionId)) }))
        .filter((group) => group.sessions.length > 0);
  const flat = visible.flatMap((group) => group.sessions);
  const index = Math.min(cursor, Math.max(0, flat.length - 1));
  React.useEffect(() => {
    container.current?.focus?.();
  }, []);
  React.useEffect(() => {
    container.current?.querySelector('.dsc-pick.is-cursor')?.scrollIntoView({ block: 'nearest' });
  }, [index]);
  React.useEffect(() => {
    const active = container.current?.querySelector('.dsc-pick.is-cursor');
    active?.scrollIntoView({ block: 'nearest' });
  }, [index]);
  if (loading) return h('p', { className: 'dsc-note' }, t('waiting'));
  if (!visible.length) return h('p', { className: 'dsc-note' }, t('noSessions'));
  const onKeyDown = (event) => {
    if (event.target instanceof HTMLInputElement && event.target.type !== 'checkbox') return;
    if (event.target instanceof HTMLInputElement && event.target.type === 'checkbox' && event.key === ' ') return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((current) => (flat.length === 0 ? 0 : (current + (event.key === 'ArrowDown' ? 1 : -1) + flat.length) % flat.length));
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setCursor(event.key === 'Home' ? 0 : Math.max(0, flat.length - 1));
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      const session = flat[index];
      if (session === undefined) return;
      event.preventDefault();
      onToggle(session.sessionId);
    }
  };
  return h(
    'div',
    { className: 'dsc-picks', tabIndex: 0, ref: container, onKeyDown },
    visible.map((group) =>
      h(
        'section',
        { className: 'dsc-pick-group', key: group.id },
        h(
          'div',
          { className: 'dsc-pick-grouphead' },
          h('span', null, `${group.title} · ${group.sessions.length}`),
          onCreate && !group.id.startsWith('cwd:')
            ? h(
                'button',
                { type: 'button', className: 'dsc-head-new', disabled: creating, onClick: () => onCreate(group) },
                h(Icon, { name: 'plus', size: 12 }),
                creating ? t('creating') : t('newBlank'),
              )
            : null,
        ),
        h(
          'ul',
          { className: 'dsc-pick-list' },
          group.sessions.map((session) =>
            h(
              'li',
              {
                className: `dsc-pick${flat[index]?.sessionId === session.sessionId ? ' is-cursor' : ''}`,
                key: session.sessionId,
                onClick: () => setCursor(flat.findIndex((candidate) => candidate.sessionId === session.sessionId)),
              },
              h('input', {
                type: 'checkbox',
                checked: Object.prototype.hasOwnProperty.call(picked, session.sessionId),
                onChange: () => onToggle(session.sessionId),
                'aria-label': session.title,
              }),
              h(
                'span',
                { className: 'dsc-pick-text' },
                h('span', { className: 'dsc-pick-title' }, session.title),
                session.cwd ? h('span', { className: 'dsc-pick-path' }, session.cwd) : null,
              ),
              Object.prototype.hasOwnProperty.call(picked, session.sessionId)
                ? h('input', {
                    type: 'text',
                    value: picked[session.sessionId] ?? '',
                    maxLength: 32,
                    placeholder: t('aliasPlaceholder'),
                    onChange: (event) => onAlias(session.sessionId, event.target.value),
                  })
                : null,
            ),
          ),
        ),
      ),
    ),
  );
}

/** Read one candidate's title out of the grouped picker data. */

function CreateGroupForm({ t, controller, groups, loading, onDone, onCancel, controllerError, onCreateSession, creating }) {
  const [name, setName] = React.useState('');
  const [goal, setGoal] = React.useState('');
  const [picked, setPicked] = React.useState({});
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  const toggle = (sessionId) =>
    setPicked((current) => {
      const next = { ...current };
      if (Object.prototype.hasOwnProperty.call(next, sessionId)) delete next[sessionId];
      else next[sessionId] = '';
      return next;
    });

  const submit = async () => {
    const chosen = Object.entries(picked);
    if (!name.trim()) return setError(t('needName'));
    if (!chosen.length) return setError(t('needMember'));
    setError(null);
    setBusy(true);
    try {
      await controller.execute({
        commandId: newCommandId(),
        action: 'createGroup',
        name: name.trim(),
        goal: goal.trim(),
        members: chosen.map(([sessionId, alias]) => ({
          sessionId,
          alias: alias.trim() || sessionTitleFrom(groups, sessionId).slice(0, 32),
        })),
      });
      onDone();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  return h(
    Modal,
    {
      title: t('create'),
      onClose: onCancel,
      onSubmit: submit,
      submitLabel: { cancel: t('cancel'), submit: t('confirmCreate'), busy: t('busy') },
      busy,
      error: error ?? controllerError,
      disabled: loading,
    },
    h(
      'div',
      { className: 'dsc-field' },
      h('label', { htmlFor: 'dsc-name' }, t('name')),
      h('input', {
        id: 'dsc-name',
        className: 'dsc-input',
        value: name,
        maxLength: 80,
        placeholder: t('namePlaceholder'),
        onChange: (event) => setName(event.target.value),
      }),
    ),
    h(
      'div',
      { className: 'dsc-field' },
      h('label', { htmlFor: 'dsc-goal' }, t('goal')),
      h('textarea', {
        id: 'dsc-goal',
        className: 'dsc-textarea',
        value: goal,
        maxLength: 4000,
        rows: 2,
        placeholder: t('goalPlaceholder'),
        onChange: (event) => setGoal(event.target.value),
      }),
    ),
    h('p', { className: 'dsc-note' }, t('pickHint')),
    h(SessionPicker, {
      t,
      groups,
      picked,
      onToggle: toggle,
      onAlias: (sessionId, alias) => setPicked((current) => ({ ...current, [sessionId]: alias })),
      onCreate: async (group) => {
        const sessionId = await onCreateSession(group);
        if (sessionId !== undefined) setPicked((current) => ({ ...current, [sessionId]: '' }));
      },
      creating,
      loading,
    }),
  );
}


function AddMemberForm({ t, controller, group, existing, groups, loading, onDone, onCancel, controllerError, onCreateSession, creating }) {
  const [picked, setPicked] = React.useState({});
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const exclude = new Set(existing);

  const submit = async () => {
    const chosen = Object.entries(picked);
    if (!chosen.length) return setError(t('needMember'));
    setError(null);
    setBusy(true);
    try {
      for (const [sessionId, alias] of chosen) {
        await controller.execute({
          commandId: newCommandId(),
          action: 'addMember',
          groupId: group.id,
          member: {
            sessionId,
            alias: alias.trim() || sessionTitleFrom(groups, sessionId).slice(0, 32),
          },
        });
      }
      onDone();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  return h(
    Modal,
    {
      title: t('addMember'),
      onClose: onCancel,
      onSubmit: submit,
      submitLabel: { cancel: t('cancel'), submit: t('confirmAdd'), busy: t('busy') },
      busy,
      error: error ?? controllerError,
      disabled: loading,
    },
    h('p', { className: 'dsc-note' }, `${t('groups')}: ${group.name}`),
    h(SessionPicker, {
      t,
      groups,
      exclude,
      onCreate: async (workspaceGroup) => {
        const sessionId = await onCreateSession(workspaceGroup);
        if (sessionId === undefined) return;
        try {
          await controller.execute({
            commandId: newCommandId(),
            action: 'addMember',
            groupId: group.id,
            member: { sessionId, alias: t('unnamed').slice(0, 32) },
          });
          onDone();
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure));
        }
      },
      creating,
      picked,
      onToggle: (sessionId) =>
        setPicked((current) => {
          const next = { ...current };
          if (Object.prototype.hasOwnProperty.call(next, sessionId)) delete next[sessionId];
          else next[sessionId] = '';
          return next;
        }),
      onAlias: (sessionId, alias) => setPicked((current) => ({ ...current, [sessionId]: alias })),
      loading,
    }),
  );
}

// Focus mode: the member list owns the sidebar browsing region while it is on, and the main area
// shows the selected member's own Conversation. `focusCtx` is set by apply().

function NewSessionForm({ t, workspaces, busy, controllerError, onCancel, onSubmit }) {
  const [workspaceId, setWorkspaceId] = React.useState(workspaces[0]?.workspaceId ?? workspaces[0]?.id ?? '');
  const [alias, setAlias] = React.useState('');
  const [error, setError] = React.useState(null);

  const submit = () => {
    if (workspaceId === '') return setError(t('noWorkspace'));
    setError(null);
    onSubmit({ workspaceId, alias: alias.trim() });
  };

  return h(
    Modal,
    {
      title: t('newSessionTitle'),
      onClose: onCancel,
      onSubmit: submit,
      submitLabel: { cancel: t('cancel'), submit: t('createAndJoin'), busy: t('creating') },
      busy,
      error: error ?? controllerError,
      disabled: busy || workspaces.length === 0,
    },
    h('p', { className: 'dsc-note' }, t('newSessionHint')),
    h(
      'div',
      { className: 'dsc-field' },
      h('label', null, t('pickWorkspace')),
      h(
        'div',
        {
          className: 'dsc-ws-list',
          tabIndex: 0,
          onKeyDown: (event) => {
            if (event.target instanceof HTMLInputElement && event.target.type !== 'radio') return;
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            const currentIndex = workspaces.findIndex((item) => (item.workspaceId ?? item.id) === workspaceId);
            const next = workspaces[(Math.max(0, currentIndex) + step + workspaces.length) % workspaces.length];
            if (next !== undefined) setWorkspaceId(next.workspaceId ?? next.id);
          },
        },
        workspaces.length === 0
          ? h('p', { className: 'dsc-note' }, t('noWorkspace'))
          : workspaces.map((workspace) => {
              const id = workspace.workspaceId ?? workspace.id;
              return h(
                'label',
                { key: id, className: `dsc-ws${id === workspaceId ? ' is-active' : ''}` },
                h('input', {
                  type: 'radio',
                  name: 'dsc-workspace',
                  checked: id === workspaceId,
                  onChange: () => setWorkspaceId(id),
                }),
                h(
                  'span',
                  { className: 'dsc-ws-text' },
                  h('span', { className: 'dsc-ws-title' }, workspace.title ?? id),
                  h('span', { className: 'dsc-ws-path' }, workspace.path ?? ''),
                ),
              );
            }),
      ),
    ),
    h(
      'div',
      { className: 'dsc-field' },
      h('label', { htmlFor: 'dsc-new-alias' }, t('alias')),
      h('input', {
        id: 'dsc-new-alias',
        className: 'dsc-input',
        value: alias,
        maxLength: 32,
        placeholder: t('aliasPlaceholder'),
        onChange: (event) => setAlias(event.target.value),
      }),
    ),
  );
}


export { Modal, SessionPicker, CreateGroupForm, AddMemberForm, NewSessionForm };

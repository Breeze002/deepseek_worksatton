/** The sidebar panel icon, which also reports which Session the main view retains. */
import React from 'react';
import { Glyph } from './parts.js';
import { MemberPanel } from './member-panel.js';
import { followProbe, setCurrentShellSessionId } from '../state.js';

const h = React.createElement;

function SidebarEntry(props) {
  const { size, active, useSessions } = props;
  // This icon is always mounted, so it is the source of "which Session the main view shows": the
  // member keys and the status strip then follow the visible session, whichever route the user took.
  // Fallback reporter: apply() normally derives the visible session from ctx.sessions.list.
  const read = typeof useSessions === 'function' ? useSessions : (selector) => selector({ byId: {} });
  const current = read((state) => Object.values(state?.byId ?? {}).find((session) => session.retainedBy?.mainView > 0)?.id);
  React.useEffect(() => {
    followProbe.props = typeof useSessions === 'function' ? 'yes' : 'no';
    followProbe.current = current === undefined || current === null ? 'none' : String(current).slice(-8);
    setCurrentShellSessionId(current);
  }, [current, useSessions]);
  return h(React.Fragment, null, h(Glyph, { size, active }), h(MemberPanel));
}

export { SidebarEntry };

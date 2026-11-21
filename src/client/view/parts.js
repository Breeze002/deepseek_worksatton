/** Presentational parts shared by the board, the focus list and the dialogs. */
import React from 'react';
import { CSS } from '../styles.js';

const h = React.createElement;

function Glyph({ size = 18, active = false }) {
  const card = active ? 0.34 : 0.24;
  return h(
    'svg',
    { width: size, height: size, viewBox: '0 0 36 36', 'aria-hidden': true, style: { display: 'block' } },
    h('rect', { x: 6, y: 8, width: 14, height: 20, rx: 3, fill: 'currentColor', opacity: card }),
    h('circle', { cx: 10.6, cy: 12.4, r: 1.7, fill: 'currentColor', opacity: active ? 1 : 0.85 }),
    h('rect', { x: 9, y: 17, width: 8, height: 2, rx: 1, fill: 'currentColor', opacity: 0.55 }),
    h('rect', { x: 9, y: 21, width: 5.5, height: 2, rx: 1, fill: 'currentColor', opacity: 0.4 }),
    h('rect', { x: 22, y: 8, width: 8, height: 9, rx: 2.5, fill: 'currentColor', opacity: card }),
    h('rect', { x: 22, y: 19, width: 8, height: 9, rx: 2.5, fill: 'currentColor', opacity: card }),
  );
}


function Btn({ primary, danger, ...rest }) {
  const className = ['dsc-btn', primary ? 'is-primary' : '', danger ? 'is-danger' : ''].filter(Boolean).join(' ');
  return h('button', { type: 'button', className, ...rest });
}


function Icon({ name, size = 16 }) {
  const paths = {
    open: 'M6 3.5 11 8l-5 4.5',
    remove: 'M4 4l8 8M12 4l-8 8',
    back: 'M10 3.5 5.5 8l4.5 4.5',
    plus: 'M8 3.5v9M3.5 8h9',
    users: 'M6 7.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4ZM2 13.2c0-1.8 1.8-2.9 4-2.9s4 1.1 4 2.9M11 6.4a1.8 1.8 0 1 0 0-3.6M12 13.2c0-1.4-.7-2.4-2-2.8',
    up: 'M8 12.5V3.5M4.5 7 8 3.5 11.5 7',
    down: 'M8 3.5v9M4.5 9 8 12.5 11.5 9',
  };
  return h(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 16 16',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
      style: { display: 'block' },
    },
    h('path', { d: paths[name] ?? paths.open }),
  );
}

/** One member row, shared by the board list and the sidebar focus list. */

function MemberRow({ t, member, busy, active, hint, onSelect, onOpen, onRemove, onMove, canUp, canDown }) {
  const moveKeyDown = (event) => {
    if (onMove === undefined || event.ctrlKey !== true) return;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    onMove(member, event.key === 'ArrowUp' ? -1 : 1);
  };
  const initial = (member.alias ?? '?').trim().slice(0, 1).toUpperCase();
  return h(
    'div',
    { className: `dsc-row${active ? ' is-active' : ''}` },
    h(
      'button',
      {
        type: 'button',
        className: 'dsc-row-main',
        onClick: () => onSelect(member),
        onKeyDown: moveKeyDown,
        title: member.title,
      },
      h('span', { className: 'dsc-avatar', 'aria-hidden': true }, initial),
      h(
        'span',
        { className: 'dsc-row-text' },
        h(
          'span',
          { className: 'dsc-row-top' },
          h('span', { className: 'dsc-row-alias' }, member.alias),
          hint ? h('span', { className: 'dsc-row-key' }, hint) : null,
        ),
        h('span', { className: 'dsc-row-sub' }, member.title || t('unnamed')),
      ),
    ),
    h('span', { className: 'dsc-badge', title: t('idle') }, h('span', { className: 'dsc-dot' })),
    h(
      'span',
      { className: 'dsc-row-actions' },
      onMove
        ? h(
            'button',
            { type: 'button', className: 'dsc-icon-btn', title: t('moveUp'), disabled: busy || canUp === false, onClick: () => onMove(member, -1) },
            h(Icon, { name: 'up', size: 13 }),
          )
        : null,
      onMove
        ? h(
            'button',
            { type: 'button', className: 'dsc-icon-btn', title: t('moveDown'), disabled: busy || canDown === false, onClick: () => onMove(member, 1) },
            h(Icon, { name: 'down', size: 13 }),
          )
        : null,
      onOpen
        ? h(
            'button',
            { type: 'button', className: 'dsc-icon-btn', title: t('openSession'), disabled: busy, onClick: () => onOpen(member) },
            h(Icon, { name: 'open' }),
          )
        : null,
      onRemove
        ? h(
            'button',
            { type: 'button', className: 'dsc-icon-btn is-danger', title: t('remove'), disabled: busy, onClick: () => onRemove(member) },
            h(Icon, { name: 'remove' }),
          )
        : null,
    ),
  );
}


function revealInScroller(element) {
  let node = element.parentElement;
  while (node instanceof HTMLElement) {
    const overflowY = window.getComputedStyle(node).overflowY;
    const scrollable = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay')
      && node.scrollHeight > node.clientHeight + 1;
    if (scrollable) {
      const target = element.getBoundingClientRect();
      const box = node.getBoundingClientRect();
      if (target.top < box.top) node.scrollTop -= box.top - target.top + 8;
      else if (target.bottom > box.bottom) node.scrollTop += target.bottom - box.bottom + 8;
      return;
    }
    node = node.parentElement;
  }
}

/** 16px line icons drawn like the shell's own controls (stroke, currentColor). */

export { Btn, Glyph, Icon, MemberRow, revealInScroller };

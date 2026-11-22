/** CSS and injected card styles. */

// Injected into <head>: the question-card cursor must be visible even when our panel is closed.
export const CARD_CSS = '.dsc-card-ring{position:fixed;z-index:2147483000;pointer-events:none;display:none;'
  + 'border:2px solid var(--dsw-alias-state-business-primary,#2f6fed);border-radius:var(--dsw-radius-sm,6px);'
  + 'background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#2f6fed) 16%,transparent)}'
  + '.dsc-card-cursor{outline:2px solid var(--dsw-alias-state-business-primary,#2f6fed) !important;'
  + 'outline-offset:2px !important;background-color:color-mix(in srgb,var(--dsw-alias-state-business-primary,#2f6fed) 16%,transparent) !important;'
  + 'border-radius:var(--dsw-radius-sm,6px) !important}';const RECONNECT_MS = 2_000;


export const CSS = [
  // The stylesheet follows the shell's own conventions: `.5px` hairlines, `--dsw-radius-*`
  // corners, `--dsw-alias-interactive-bg-hover` for hover/selection, `--dsw-alias-label-caption`
  // for secondary text, and the business colour for the active member.
  '.dsc-root{display:flex;flex-direction:column;box-sizing:border-box;width:100%;height:100%;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base,Canvas);color:var(--dsw-alias-label-primary,CanvasText);font:inherit}',
  '.dsc-root *,.dsc-side *{box-sizing:border-box}',
  '.dsc-head{display:flex;flex:none;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px 0}',
  '.dsc-head-title{display:flex;align-items:baseline;gap:8px;margin:0;font-size:14px;font-weight:600;letter-spacing:-.1px}',
  '.dsc-count{font-size:11px;font-weight:400;color:var(--dsw-alias-label-caption,GrayText)}',
  '.dsc-actions{display:flex;flex:none;align-items:center;gap:6px}',
  '.dsc-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;height:28px;padding:0 10px;border:.5px solid var(--dsw-alias-border-l4,rgba(127,127,127,.38));border-radius:var(--dsw-radius-md,8px);background:transparent;color:var(--dsw-alias-label-primary,CanvasText);font:inherit;font-size:12.5px;white-space:nowrap;cursor:pointer}',
  '.dsc-btn:hover:enabled{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}',
  '.dsc-btn:disabled{opacity:.45;cursor:default}',
  '.dsc-btn.is-primary{border-color:transparent;background:var(--dsw-alias-button-elevated-fill,rgba(127,127,127,.2))}',
  '.dsc-btn.is-danger:hover:enabled{color:var(--dsw-alias-state-error-primary,#c0392b)}',
  '.dsc-groups{display:flex;flex:none;flex-wrap:wrap;gap:4px;padding:10px 18px 0}',
  '.dsc-chip{height:24px;padding:0 9px;border:.5px solid transparent;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary,GrayText);font:inherit;font-size:11.5px;white-space:nowrap;cursor:pointer}',
  '.dsc-chip:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}',
  '.dsc-chip.is-active{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary,CanvasText);font-weight:500}',
  '.dsc-groupbar{display:flex;flex:none;flex-wrap:wrap;align-items:baseline;gap:10px;padding:12px 18px 0}',
  '.dsc-groupname{margin:0;font-size:13px;font-weight:600}',
  '.dsc-goal{margin:0;font-size:11.5px;color:var(--dsw-alias-label-caption,GrayText)}',
  '.dsc-body{flex:1;min-height:0;overflow:auto;padding:12px 18px 18px}',
  '.dsc-box .dsc-row-alias{font-size:12px}',
  '.dsc-box{border:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.28));border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-bg-layer-1,transparent);padding:4px;max-width:360px}',
  '.dsc-members{display:flex;flex-direction:column;gap:1px}',
  '.dsc-row{position:relative;display:flex;align-items:center;gap:8px;height:34px;padding:0 4px 0 6px;border-radius:var(--dsw-radius-sm,6px)}',
  '.dsc-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}',
  '.dsc-row.is-active{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}',
  '.dsc-row.is-active .dsc-row-alias{color:var(--dsw-alias-state-business-primary,#2f6fed)}',
  '.dsc-row-main{display:flex;flex:1;min-width:0;align-items:center;gap:9px;height:100%;margin:0;padding:0;border:0;background:0 0;color:inherit;font:inherit;text-align:left;cursor:pointer}',
  '.dsc-row-main:focus-visible,.dsc-icon-btn:focus-visible,.dsc-btn:focus-visible{outline:var(--dsw-focus-cursorRing-width,2px) solid var(--dsw-focus-cursorRing-color,Highlight);outline-offset:1px}',
  '.dsc-avatar{flex:none;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-button-elevated-fill,rgba(127,127,127,.2));color:var(--dsw-alias-label-secondary,GrayText);font-size:11px;font-weight:600;line-height:1}',
  '.dsc-row.is-active .dsc-avatar{color:var(--dsw-alias-state-business-primary,#2f6fed)}',
  '.dsc-row-text{display:flex;flex:1;min-width:0;flex-direction:column;gap:1px;line-height:1.25}',
  '.dsc-row-top{display:flex;align-items:center;gap:6px;min-width:0}',
  '.dsc-row-alias{flex:1;min-width:0;font-size:12.5px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dsc-row-key{flex:none;font-size:10px;color:var(--dsw-alias-label-caption,GrayText)}',
  '.dsc-row-sub{font-size:11px;color:var(--dsw-alias-label-caption,GrayText);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dsc-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-caption,GrayText)}',
  '.dsc-badge{display:inline-flex;align-items:center;flex:none}',
  '.dsc-badge.is-running .dsc-dot{background:var(--dsw-alias-state-business-primary,#2f6fed)}',
  '.dsc-badge.is-waiting .dsc-dot{background:var(--dsw-alias-state-warn-primary,#d97706)}',
  '.dsc-badge.is-done .dsc-dot{background:var(--dsw-alias-state-done-primary,#16a34a)}',
  '.dsc-chip.is-running .dsc-dot{background:var(--dsw-alias-state-business-primary,#2f6fed)}',
  '.dsc-chip.is-waiting .dsc-dot{background:var(--dsw-alias-state-warn-primary,#d97706)}',
  '.dsc-chip.is-done .dsc-dot{background:var(--dsw-alias-state-done-primary,#16a34a)}',
  '.dsc-strip{display:inline-flex;align-items:center;gap:2px;max-width:42vw;overflow:hidden;padding:2px 3px;'
    + 'border:1px solid var(--dsw-alias-border-secondary,rgba(127,127,127,.22));border-radius:8px;'
    + 'background:var(--dsw-alias-bg-elevated,rgba(127,127,127,.06))}',
  '.dsc-strip-label{flex:none;padding:0 6px 0 4px;font-size:11px;white-space:nowrap;'
    + 'color:var(--dsw-alias-label-caption,GrayText)}',
  '.dsc-chip{display:inline-flex;align-items:center;gap:5px;flex:none;height:22px;padding:0 7px;border:0;'
    + 'border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-primary,CanvasText));'
    + 'font:inherit;font-size:11px;line-height:1;cursor:pointer;transition:background-color .12s ease}',
  '.dsc-chip:hover{background:var(--dsw-alias-bg-hover,rgba(127,127,127,.14))}',
  '.dsc-chip.is-waiting{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#d97706) 14%,transparent)}',
  '.dsc-chip.is-current{font-weight:600;color:var(--dsw-alias-label-primary,CanvasText)}',
  '.dsc-chip-alias{max-width:8em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dsc-member-panel{position:fixed;z-index:40;display:flex;flex-direction:column;box-sizing:border-box;'
    + 'background:var(--dsw-alias-bg-base,Canvas);border-right:1px solid var(--dsw-alias-border-secondary,rgba(127,127,127,.2));'
    + 'color:var(--dsw-alias-label-primary,CanvasText);font:inherit}',
  '.dsc-mention{position:fixed;z-index:60;display:flex;flex-direction:column;gap:1px;padding:4px;box-sizing:border-box;'
    + 'border:1px solid var(--dsw-alias-border-secondary,rgba(127,127,127,.24));border-radius:8px;'
    + 'background:var(--dsw-alias-bg-elevated,Canvas);box-shadow:0 6px 24px rgba(0,0,0,.28);max-height:240px;overflow-y:auto}',
  '.dsc-mention-hint{padding:2px 6px 4px;font-size:10px;color:var(--dsw-alias-label-caption,GrayText)}',
  '.dsc-mention-row{display:flex;align-items:baseline;gap:8px;padding:4px 8px;border:0;border-radius:6px;background:transparent;'
    + 'color:var(--dsw-alias-label-primary,CanvasText);font:inherit;font-size:12px;text-align:left;cursor:pointer}',
  '.dsc-mention-row.is-cursor{background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#2f6fed) 16%,transparent)}',
  '.dsc-mention-alias{flex:none;font-weight:600}',
  '.dsc-mention-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
    + 'font-size:11px;color:var(--dsw-alias-label-caption,GrayText)}',
  '.dsc-chat{display:flex;flex-direction:column;gap:0;min-height:0;flex:1;padding:0 14px 10px}',
  '.dsc-chat-head{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--dsw-alias-border-secondary,rgba(127,127,127,.18))}',
  '.dsc-chat-title{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dsc-chat-sub{flex:1;min-width:0;font-size:11px;color:var(--dsw-alias-label-caption,GrayText);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dsc-chat-list{flex:1;min-height:0;overflow-y:auto;padding:10px 2px;display:flex;flex-direction:column;gap:10px}',
  '.dsc-chat-line{display:flex;flex-direction:column;gap:2px;max-width:min(760px,86%);align-self:flex-start;'
    + 'padding:6px 10px;border-radius:10px;background:var(--dsw-alias-bg-elevated,rgba(127,127,127,.08))}',
  '.dsc-chat-line.is-you{align-self:flex-end;background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#2f6fed) 14%,transparent)}',
  '.dsc-chat-meta{display:flex;align-items:baseline;gap:6px;font-size:10px;color:var(--dsw-alias-label-caption,GrayText)}',
  '.dsc-chat-alias{font-weight:600}',
  '.dsc-chat-text{font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word}',
  '.dsc-chat-compose{display:flex;align-items:flex-end;gap:8px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-secondary,rgba(127,127,127,.18))}',
  '.dsc-chat-input{flex:1;resize:none;box-sizing:border-box;padding:8px 10px;border-radius:8px;font:inherit;font-size:13px;'
    + 'color:var(--dsw-alias-label-primary,CanvasText);background:var(--dsw-alias-bg-base,Canvas);'
    + 'border:1px solid var(--dsw-alias-border-secondary,rgba(127,127,127,.3))}',
  '.dsc-chat-hint{margin:6px 0 0;font-size:10px;color:var(--dsw-alias-label-caption,GrayText);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dsc-mp-head{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-secondary,rgba(127,127,127,.18))}',
  '.dsc-mp-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600}',
  '.dsc-mp-chat{flex:none;border:0;background:transparent;font:inherit;font-size:11px;font-weight:600;cursor:pointer;'
    + 'padding:2px 7px;border-radius:6px;color:var(--dsw-alias-state-business-primary,#2f6fed)}',
  '.dsc-mp-chat:hover{background:var(--dsw-alias-bg-hover,rgba(127,127,127,.14))}',
  '.dsc-mp-switch{flex:none;border:0;background:transparent;color:var(--dsw-alias-label-caption,GrayText);font:inherit;font-size:11px;'
    + 'cursor:pointer;padding:2px 6px;border-radius:6px}',
  '.dsc-mp-switch:hover{background:var(--dsw-alias-bg-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary,CanvasText)}',
  // Inside the cover the alias needs the width: the row actions take none until the row is hovered
  // or focused (clicking the row enters the member, Ctrl+↑/↓ still reorders).
  // No leading avatar inside the cover: the alias itself is the label people read there.
  '.dsc-member-panel .dsc-row-main{padding-left:10px}',  '.dsc-member-panel .dsc-row-actions{display:none}',
  '.dsc-member-panel .dsc-row:hover .dsc-row-actions,.dsc-member-panel .dsc-row:focus-within .dsc-row-actions{display:inline-flex}',
  '.dsc-member-panel .dsc-row-main{padding-right:6px}',
  '.dsc-member-panel .dsc-row-alias{max-width:none}',
  '.dsc-mp-list{flex:1;min-height:0;overflow-y:auto;padding:4px 4px 8px}',
  '.dsc-mp-foot{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:6px 10px;'
    + 'border-top:1px solid var(--dsw-alias-border-secondary,rgba(127,127,127,.18))}',
  '.dsc-mp-nav{flex:none;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-caption,GrayText);cursor:pointer;padding:2px 6px}',
  '.dsc-mp-nav:hover{background:var(--dsw-alias-bg-hover,rgba(127,127,127,.14))}',
  '.dsc-alias-tag{flex:none;font-size:10px;color:var(--dsw-alias-label-caption,GrayText);max-width:8em;overflow:hidden;'
    + 'text-overflow:ellipsis;white-space:nowrap}',
  '.dsc-row-status{flex:none;font-size:10px;color:var(--dsw-alias-label-caption,GrayText)}',
  '.dsc-unread{flex:none;margin-left:2px;padding:0 5px;border-radius:999px;font-size:9px;line-height:14px;font-weight:600;'
    + 'background:var(--dsw-alias-state-done-primary,#16a34a);color:var(--dsw-alias-bg-base,#fff)}',
  '.dsc-row-actions{display:flex;flex:none;align-items:center;gap:2px;opacity:0;transition:opacity .12s ease}',
  '.dsc-row:hover .dsc-row-actions,.dsc-row.is-active .dsc-row-actions,.dsc-row:focus-within .dsc-row-actions{opacity:1}',
  '.dsc-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;margin:0;padding:0;border:0;border-radius:var(--dsw-radius-sm,6px);background:0 0;color:var(--dsw-alias-label-caption,GrayText);cursor:pointer}',
  '.dsc-icon-btn:hover:enabled{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary,CanvasText)}',
  '.dsc-icon-btn:disabled{opacity:.4;cursor:default}',
  '.dsc-icon-btn.is-danger:hover:enabled{color:var(--dsw-alias-state-error-primary,#c0392b)}',
  '.dsc-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:180px;border:.5px dashed var(--dsw-alias-border-l3,rgba(127,127,127,.3));border-radius:var(--dsw-radius-lg,12px)}',
  '.dsc-empty-title{margin:0;font-size:12.5px;font-weight:500;color:var(--dsw-alias-label-secondary,GrayText)}',
  '.dsc-empty-hint{margin:0;font-size:11.5px;color:var(--dsw-alias-label-caption,GrayText)}',
  '.dsc-note{margin:0;font-size:11.5px;line-height:1.6;color:var(--dsw-alias-label-caption,GrayText)}',
  '.dsc-error{margin:0;font-size:11.5px;line-height:1.6;color:var(--dsw-alias-state-error-primary,#c0392b)}',
  '.dsc-overlay{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;padding:24px;background:color-mix(in srgb,var(--dsw-alias-label-primary,CanvasText) 26%,transparent)}',
  '.dsc-modal{display:flex;flex-direction:column;gap:12px;width:min(520px,100%);max-height:100%;overflow:auto;padding:16px 18px;border:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.28));border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-bg-layer-1,Canvas);color:var(--dsw-alias-label-primary,CanvasText);box-shadow:0 18px 48px color-mix(in srgb,var(--dsw-alias-label-primary,CanvasText) 22%,transparent)}',
  '.dsc-modal h3{margin:0;font-size:13.5px;font-weight:600}',
  '.dsc-field{display:flex;flex-direction:column;gap:5px}',
  '.dsc-field label{font-size:11.5px;color:var(--dsw-alias-label-caption,GrayText)}',
  '.dsc-input,.dsc-textarea{width:100%;padding:6px 9px;border:.5px solid var(--dsw-alias-border-l4,rgba(127,127,127,.38));border-radius:var(--dsw-radius-md,8px);background:transparent;color:inherit;font:inherit;font-size:12.5px}',
  '.dsc-textarea{min-height:52px;resize:vertical}',
  '.dsc-input:focus,.dsc-textarea:focus{outline:var(--dsw-focus-cursorRing-width,2px) solid var(--dsw-focus-cursorRing-color,Highlight);outline-offset:0}',
  '.dsc-picks{display:flex;flex-direction:column;max-height:260px;overflow:auto;margin:0;padding:0;border:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.28));border-radius:var(--dsw-radius-md,8px)}',
  '.dsc-pick-group{display:flex;flex-direction:column}',
  '.dsc-pick-grouphead{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 9px 4px;font-size:10.5px;font-weight:600;color:var(--dsw-alias-label-caption,GrayText);background:var(--dsw-alias-bg-layer-1,Canvas)}',
  '.dsc-head-new{display:inline-flex;align-items:center;gap:3px;height:20px;padding:0 6px;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-caption,GrayText);font:inherit;font-size:10.5px;font-weight:500;cursor:pointer}',
  '.dsc-head-new:hover:enabled{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-primary,CanvasText)}',
  '.dsc-head-new:disabled{opacity:.5;cursor:default}',
  '.dsc-pick-list{display:flex;flex-direction:column;gap:1px;margin:0;padding:0 4px 4px;list-style:none}',
  '.dsc-pick{display:flex;align-items:center;gap:9px;padding:5px 6px;border-radius:var(--dsw-radius-sm,6px)}',
  '.dsc-pick:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}',
  '.dsc-pick-text{display:flex;flex:1;min-width:0;flex-direction:column}',
  '.dsc-pick-title{font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dsc-pick-path{font-size:11px;color:var(--dsw-alias-label-caption,GrayText);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dsc-picks{outline:none}',
  '.dsc-picks .dsc-pick.is-cursor{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));box-shadow:inset 2px 0 0 var(--dsw-alias-state-business-primary,#2f6fed)}',
  '.dsc-members{outline:none}',
  '.dsc-root{outline:none}',
  '.dsc-row:focus-within{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}',
  '.dsc-row:focus-within .dsc-row-actions{opacity:1}',
  '.dsc-pick input[type=text]{flex:none;width:110px;padding:4px 7px;border:.5px solid var(--dsw-alias-border-l4,rgba(127,127,127,.38));border-radius:var(--dsw-radius-sm,6px);background:transparent;color:inherit;font:inherit;font-size:11.5px}',
  '.dsc-foot{display:flex;justify-content:flex-end;gap:8px}',
  '.dsc-ws-list{display:flex;flex-direction:column;gap:2px;max-height:220px;overflow:auto;border:.5px solid var(--dsw-alias-border-l3,rgba(127,127,127,.28));border-radius:var(--dsw-radius-md,8px);padding:4px}',
  '.dsc-ws{display:flex;align-items:center;gap:8px;padding:5px 7px;border-radius:var(--dsw-radius-sm,6px);cursor:pointer}',
  '.dsc-ws:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}',
  '.dsc-ws.is-active{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}',
  '.dsc-ws-text{display:flex;flex-direction:column;min-width:0}',
  '.dsc-ws-title{font-size:12.5px}',
  '.dsc-ws-path{font-size:11px;color:var(--dsw-alias-label-caption,GrayText);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dsc-side{display:flex;flex-direction:column;width:100%;height:100%;min-height:0;color:var(--dsw-alias-label-primary,CanvasText);font:inherit}',
  '.dsc-side-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 8px 6px}',
  '.dsc-side-title{font-size:11.5px;font-weight:600;letter-spacing:.02em;text-transform:uppercase;color:var(--dsw-alias-label-caption,GrayText);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dsc-side-groups{display:flex;flex-wrap:wrap;gap:4px;padding:0 8px 6px}',
  '.dsc-side-body{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:1px;padding:0 6px}',
  '.dsc-side .dsc-row:hover,.dsc-side .dsc-row.is-active{background:var(--dsw-specific-sidebar-glass-hover,var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14)))}',
  '.dsc-side-hint{margin:auto 0 0;padding:8px 10px 0;font-size:10.5px;line-height:1.5;color:var(--dsw-alias-label-caption,GrayText)}',
].join('\n');

/**
 * One column of member cards: a prominent card plus two queued cards, which keeps the
 * silhouette distinct from the neighbouring 2x2 workbench glyph. Inherits the sidebar's
 * text colour through `currentColor`.
 */

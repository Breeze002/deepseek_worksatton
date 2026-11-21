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
  '.dsc-row-alias{font-size:12.5px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dsc-row-key{flex:none;font-size:10px;color:var(--dsw-alias-label-caption,GrayText)}',
  '.dsc-row-sub{font-size:11px;color:var(--dsw-alias-label-caption,GrayText);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.dsc-dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-caption,GrayText)}',
  '.dsc-badge{display:inline-flex;align-items:center;flex:none}',
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

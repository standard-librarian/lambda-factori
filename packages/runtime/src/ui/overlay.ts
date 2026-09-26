/** Shared CSS for DOM overlays (editors, presenter view), in the game's look. */
export const ensureOverlayStyles = () => {
  if (document.getElementById("lf-overlay-styles")) return
  const style = document.createElement("style")
  style.id = "lf-overlay-styles"
  style.textContent = `
    .lf-panel { position: fixed; z-index: 10; background: #f7f3ec; color: #20234b; font-family: Fredoka, sans-serif;
      border: 3px solid #d6cab4; border-radius: 22px; box-shadow: 0 10px 40px rgba(32,35,75,.25); padding: 16px 18px;
      display: flex; flex-direction: column; gap: 10px; }
    .lf-right { top: 16px; right: 16px; bottom: 16px; width: min(560px, 44vw); }
    .lf-panel header { display: flex; align-items: center; gap: 10px; font-size: 20px; }
    .lf-panel header b { color: #ac1b2b; }
    .lf-panel header button { margin-left: auto; }
    .lf-panel textarea { flex: 1; min-height: 200px; font: 14px/1.45 BQN386, Menlo, monospace; border-radius: 14px;
      border: 2px solid #d6cab4; padding: 12px; background: #fffdf8; color: #20234b; resize: none; }
    .lf-panel input[type=text], .lf-panel select { font: 16px Fredoka, sans-serif; border-radius: 10px; border: 2px solid #d6cab4;
      padding: 7px 10px; background: #fffdf8; color: #20234b; }
    .lf-panel button, .lf-file { font: 600 15px Fredoka, sans-serif; border: none; border-radius: 12px; padding: 9px 14px;
      background: #7492cb; color: white; cursor: pointer; box-shadow: 0 4px 0 #5872a8; }
    .lf-panel button:active, .lf-file:active { transform: translateY(3px); box-shadow: 0 1px 0 #5872a8; }
    .lf-panel .lf-primary { background: #ac1b2b; box-shadow: 0 4px 0 #73000b; }
    .lf-file input { display: none; }
    .lf-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .lf-error { color: #e0485a; font: 13px/1.35 BQN386, Menlo, monospace; white-space: pre-wrap; max-height: 140px; overflow: auto; }
    .lf-muted { color: #5b5f7d; font-size: 14px; }
    .lf-field { display: flex; flex-direction: column; gap: 4px; font-size: 14px; color: #5b5f7d; }
    .lf-field > span { font-weight: 600; }
  `
  document.head.appendChild(style)
}

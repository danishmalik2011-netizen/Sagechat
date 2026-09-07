/* =========================================================================
 * Sage — "Sculpt" icon pack (v4)
 *
 * A single-family, hand-built icon system for Sage. Every glyph obeys:
 *
 *   1. ONE GRID        24×24 viewBox, ~2px optical margin, ink-trapped corners.
 *   2. TWO SHELLS
 *        S()           filled glyph with evenodd-cut negative space.
 *        L()           monoline round-cap stroke (default 2.6).
 *   3. NO STOCK SILHOUETTES. Every path is hand-drawn to live at home
 *      inside Sage — heavier than a stock set, calmer than an emoji,
 *      with one strong negative-space idea per glyph.
 *   4. currentColor. Inherits text colour, so it tracks theme + incognito
 *      vault surfaces with zero extra work.
 *
 * HTML usage:  <span class="sage-icon" data-icon="search"></span>
 * JS usage:    SAGE_ICONS.get('search')   →   svg string
 *              SAGE_ICONS.render(root)    →   flush every [data-icon] in scope
 * ========================================================================= */
(function () {
  'use strict';

  // ── Shell: filled glyph (currentColor) ──────────────────────────────────
  const S = (body) =>
    '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" ' +
    'fill-rule="evenodd" clip-rule="evenodd" aria-hidden="true">' + body + '</svg>';

  // ── Shell: monoline glyph. Default weight 2.6 reads as the optical peer
  //    of the solid shell at 18-20px. Use w=1.8 for very fine chrome
  //    (the rail nav, the rail jump) and 2.4 for the brand mark and send.
  const L = (body, w) =>
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="' + (w || 2.6) + '" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';

  const ICONS = {

    /* ──────────────────────────── Brand ──────────────────────────── */

    // The Sage mark — a single, continuous monoline "S" with soft
    // sculpted terminals. Sits on the inverted brand tile.
    logo: L(
      '<path d="M16.9 5.4C16.1 4.4 14.4 3.8 12.4 3.8 9.3 3.8 7 5.4 7 7.9c0 2.4 2 3.3 4.7 3.9 2.9.6 5.1 1.5 5.1 4.1 0 2.6-2.3 4.1-5.4 4.1-2.4 0-4.3-.9-5.1-2.3"/>',
      2.4
    ),

    /* ─────────────────────── Assistant modes ─────────────────────── */

    // Chat — speech bubble with three punched dots and a sculpted tail.
    chat: S(
      '<path d="M12 3.2C6.7 3.2 2.6 6.7 2.6 11.1c0 2.3 1.1 4.4 2.9 5.8l-1.2 3.1a.7.7 0 0 0 .93.86l3.6-1.74c1.1.3 2.3.46 3.57.46 5.3 0 9.4-3.5 9.4-7.9S17.3 3.2 12 3.2Zm-3.5 9.3a1.4 1.4 0 1 1 0-2.8 1.4 1.4 0 0 1 0 2.8Zm3.5 0a1.4 1.4 0 1 1 0-2.8 1.4 1.4 0 0 1 0 2.8Zm3.5 0a1.4 1.4 0 1 1 0-2.8 1.4 1.4 0 0 1 0 2.8Z"/>'
    ),

    // Chat-plus — bubble with a single punched plus, "start a conversation".
    chatPlus: S(
      '<path d="M12 3.2C6.7 3.2 2.6 6.7 2.6 11.1c0 2.3 1.1 4.4 2.9 5.8l-1.2 3.1a.7.7 0 0 0 .93.86l3.6-1.74c1.1.3 2.3.46 3.57.46 5.3 0 9.4-3.5 9.4-7.9S17.3 3.2 12 3.2Zm-.7 4.3h1.5v2.5h2.5v1.5h-2.5v2.5h-1.5v-2.5H8.8V10h2.5V7.5Z"/>'
    ),

    // Code — fuller pair of monoline brackets with optical kerning.
    code: L(
      '<path d="m8.6 5.6-5.2 5.2a1.7 1.7 0 0 0 0 2.4l5.2 5.2"/>' +
      '<path d="m15.4 5.6 5.2 5.2a1.7 1.7 0 0 1 0 2.4l-5.2 5.2"/>',
      2.6
    ),

    // Study — solid book with a punched title band and a sculpted spine gap.
    study: S(
      '<path d="M6.5 2.4A2.9 2.9 0 0 0 3.6 5.3v13.4a2.9 2.9 0 0 0 2.9 2.9h13.1a1 1 0 0 0 0-2H6.7a1.1 1.1 0 0 1 0-2.2h13a1 1 0 0 0 1-1V3.4a1 1 0 0 0-1-1H6.5Zm1.2 3.3h8.3v2.1H7.7V5.7Z"/>'
    ),

    // Write — solid fountain pen, nib separated by a punched notch.
    write: S(
      '<path d="M4 19.7l1.1-3.6L15.7 5.5l2.8 2.8L7.9 18.9l-3.9.8Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="m16.9 4.3 1.4-1.4a1.95 1.95 0 0 1 2.76 2.76l-1.4 1.4-2.76-2.76Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>'
    ),

    // Summarize — solid page with three punch-out text lines.
    summarize: S(
      '<path d="M7 2.6A2.4 2.4 0 0 0 4.6 5v14A2.4 2.4 0 0 0 7 21.4h10a2.4 2.4 0 0 0 2.4-2.4V5A2.4 2.4 0 0 0 17 2.6H7Zm1.5 5.1h7v1.9h-7V7.7Zm0 3.9h7v1.9h-7v-1.9Zm0 3.9h4.3v1.9H8.5v-1.9Z"/>'
    ),

    // Translate — globe with quadrant cutouts, language and reach.
    translate: S(
      '<path d="M12 2.6a9.4 9.4 0 1 0 0 18.8 9.4 9.4 0 0 0 0-18.8Zm-5.8 3.6h4.6v4.6H6.2a7.9 7.9 0 0 1 0-4.6Zm6.8 0h4.6a7.9 7.9 0 0 1 0 4.6H13V6.2Zm-6.8 6.8h4.6v4.6a7.9 7.9 0 0 1-4.6-4.6Zm6.8 4.6v-4.6h4.6a7.9 7.9 0 0 1-4.6 4.6Z"/>'
    ),

    /* ─────────────────── Navigation & chrome ─────────────────── */

    // Search — solid ring + bold monoline handle, optical join between them.
    search: S(
      '<path d="M10.8 3.2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm-5.4 8a5.4 5.4 0 1 1 10.8 0 5.4 5.4 0 0 1-10.8 0Z"/>' +
      '<path d="m15.6 15.6 4.7 4.7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>'
    ),

    // Settings — three full-width rails with three raised knobs.
    settings: S(
      '<rect x="3.5" y="4.6" width="17" height="2.4" rx="1.2"/>' +
      '<rect x="3.5" y="10.8" width="17" height="2.4" rx="1.2"/>' +
      '<rect x="3.5" y="17" width="17" height="2.4" rx="1.2"/>' +
      '<circle cx="14.5" cy="5.8" r="2.1"/>' +
      '<circle cx="8.5" cy="12" r="2.1"/>' +
      '<circle cx="15.5" cy="18.2" r="2.1"/>'
    ),

    // Sun — solid disc with sculpted rays for the light theme.
    sun: S(
      '<circle cx="12" cy="12" r="4.2"/>' +
      '<path d="M12 2.4v2.6M12 19v2.6M2.4 12H5M19 12h2.6M5.1 5.1l1.8 1.8M17.1 17.1l1.8 1.8M5.1 18.9l1.8-1.8M17.1 6.9l1.8-1.8" ' +
        'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'
    ),

    // Moon — crescent with a single highlighted cut, the dark theme glyph.
    moon: S(
      '<path d="M20.4 14.6A8.2 8.2 0 0 1 9.4 3.6a.6.6 0 0 0-.78-.72 9.4 9.4 0 1 0 12.5 12.5.6.6 0 0 0-.72-.78Z"/>' +
      '<circle cx="15.6" cy="9.4" r="0.9" fill="none" stroke="currentColor" stroke-width="1.4"/>'
    ),

    // Sidebar collapse — left-pointing chevron + a hairline rail.
    sidebarCollapse: L(
      '<line x1="14" y1="4" x2="14" y2="20"/>' +
      '<polyline points="9.5,8.5 6,12 9.5,15.5"/>',
      1.6
    ),

    // Sidebar expand — right-pointing chevron + a hairline rail.
    sidebarExpand: L(
      '<line x1="10" y1="4" x2="10" y2="20"/>' +
      '<polyline points="14.5,8.5 18,12 14.5,15.5"/>',
      1.6
    ),

    // Panel resizer (sidebar): double chevron left — sidebar toward the rail.
    panelCollapse: L(
      '<polyline points="12,7 7,12 12,17"/>' +
      '<polyline points="18,7 13,12 18,17"/>',
      1.8
    ),

    // Panel resizer (sidebar): double chevron right — sidebar back out.
    panelExpand: L(
      '<polyline points="8,7 13,12 8,17"/>' +
      '<polyline points="14,7 19,12 14,17"/>',
      1.8
    ),

    // Canvas resizer: double chevron right — canvas toward the right.
    panelCollapseRight: L(
      '<polyline points="12,7 17,12 12,17"/>' +
      '<polyline points="6,7 11,12 6,17"/>',
      1.8
    ),

    // Canvas resizer: double chevron left — canvas back open.
    panelExpandLeft: L(
      '<polyline points="8,7 13,12 8,17"/>' +
      '<polyline points="14,7 19,12 14,17"/>',
      1.8
    ),

    /* ─────────────────── Actions & status ─────────────────── */

    // Close — bold X with terminal-rounded ends.
    x: L('<path d="M17.6 6.4 6.4 17.6M6.4 6.4l11.2 11.2"/>', 2.6),

    // Plus — solid rounded plus.
    plus: S(
      '<path d="M12 3.2c.97 0 1.75.78 1.75 1.75v5.25H19a1.75 1.75 0 1 1 0 3.5h-5.25V19a1.75 1.75 0 1 1-3.5 0v-5.25H5a1.75 1.75 0 1 1 0-3.5h5.25V4.95c0-.97.78-1.75 1.75-1.75Z"/>'
    ),

    // Check — a clean, single-stroke check.
    check: L('<path d="m5.4 12.6 4.3 4.3 8.9-9.6"/>', 2.6),

    // Folder — solid body with a sculpted tab and an open notch between
    // tab and lid so the silhouette reads as a folder at a glance.
    folder: S(
      // main body (rounded rect, slightly wider than tall, with breathing margin)
      '<path d="M3.4 7.2c0-1.1.9-2 2-2h3.5c.5 0 1 .22 1.32.62l.96 1.16c.32.4.82.62 1.32.62h6.08c1.1 0 2 .9 2 2v8.2c0 1.1-.9 2-2 2H5.4a2 2 0 0 1-2-2V7.2Z"/>' +
      // tab — sits on the front face of the lid, giving the folder depth
      '<path d="M3.4 8.2c0-.6.4-1 1-1h3.2c.3 0 .6.14.78.38l.6.84c.18.24.46.38.78.38h1.84c.6 0 1 .4 1 1v1.4c0 .6-.4 1-1 1H4.4c-.6 0-1-.4-1-1V8.2Z"/>'
    ),

    // Download — solid shaft + clean triangular head + tray, all
    // geometrically aligned on the 24px grid.
    download: S(
      // arrow shaft (long rounded bar)
      '<rect x="10.6" y="3.6" width="2.8" height="9" rx="1.4"/>' +
      // arrow head (chevron down)
      '<path d="M7.2 11.2a1.2 1.2 0 0 1 1.7 0L12 14.3l3.1-3.1a1.2 1.2 0 1 1 1.7 1.7l-4 4a1.2 1.2 0 0 1-1.7 0l-4-4a1.2 1.2 0 0 1 .1-1.7Z"/>' +
      // tray (where the arrow lands)
      '<rect x="3.4" y="18" width="17.2" height="2.6" rx="1.3"/>'
    ),

    // Trash — lid bar with a punched handle, body with two clean slits.
    // The lid is separated from the can by a hairline gap so the form
    // reads as "open lid" instead of "stock bin".
    trash: S(
      // lid bar
      '<rect x="3.6" y="4.4" width="16.8" height="2.4" rx="1.2"/>' +
      // handle on the lid
      '<path d="M9.2 4.4V3.2a1 1 0 0 1 1-1h3.6a1 1 0 0 1 1 1v1.2"/>' +
      // can body + two punched slits (evenodd cuts the slits out)
      '<path d="M6.2 8.4h11.6l-.7 10.4a2.2 2.2 0 0 1-2.2 2H9.1a2.2 2.2 0 0 1-2.2-2L6.2 8.4Z' +
        'M9.6 11.4h1.4v6.4H9.6z' +
        'M13 11.4h1.4v6.4H13z"/>'
    ),

    // Chevron down — a single bold down-chevron, optically balanced.
    chevronDown: L('<path d="m6.5 9.4 4.6 4.6a1.27 1.27 0 0 0 1.8 0l4.6-4.6"/>', 2.6),

    // Refresh — a 270° arc opening at the top-right, capped with a
    // right-angle chevron arrowhead. Rotates via `transform: rotate(360deg)`
    // on `:active` in the canvas toolbar to communicate the click.
    refresh: L(
      '<path d="M 19.5 12 A 7.5 7.5 0 1 1 12 4.5"/>' +
      '<path d="M 8.5 4.5 L 12 4.5 L 12 8.5"/>',
      2.6
    ),

    // Connectors — three nodes wired together, MCP / tool family.
    connectors: S(
      '<path d="M3.5 9.4h6.6M13.9 14.6h6.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' +
      '<rect x="2.4" y="6.6" width="5.6" height="5.6" rx="2"/>' +
      '<rect x="9.2" y="11.8" width="5.6" height="5.6" rx="2" transform="translate(24 0) scale(-1 1)"/>' +
      '<rect x="15.6" y="2.4" width="5.6" height="5.6" rx="2"/>'
    ),

    // Paperclip — the geometric file-attachment mark.
    paperclip: L(
      '<path d="M20.2 11.6 12.4 19.4a4.6 4.6 0 0 1-6.5-6.5L14 4.8a3.2 3.2 0 0 1 4.5 4.5l-8.1 8.1a1.8 1.8 0 0 1-2.55-2.55l7.4-7.4"/>',
      2.4
    ),

    // Mic — solid capsule with a sculpted stand and base.
    mic: S(
      '<path d="M12 3a3.4 3.4 0 0 0-3.4 3.4v5.4a3.4 3.4 0 1 0 6.8 0V6.4A3.4 3.4 0 0 0 12 3Z"/>' +
      '<path d="M6.6 11.4a5.4 5.4 0 0 0 10.8 0M12 16.8V20M9.4 20h5.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'
    ),

    // Stop — solid rounded square, mid-stream cancel.
    stop: S(
      '<rect x="6" y="6" width="12" height="12" rx="2.4"/>'
    ),

    // Send — diagonal arrow-up-right, redesigned with breathing room.
    send: L(
      '<path d="M5.4 18.6 19 12 5.4 5.4l2.5 6.6h6.6"/>',
      2.4
    ),

    // Shield on (incognito active) — solid shield with a punched keyhole.
    // The single cutout reads as "vault sealed" and is much more
    // distinctive than a stroke overlay.
    shieldOn: S(
      '<path d="M12 2.6 4.4 5.4v6.2c0 4.5 3.2 8.6 7.6 9.8 4.4-1.2 7.6-5.3 7.6-9.8V5.4L12 2.6Z"/>' +
      // keyhole — circle + tapered slot, cut by evenodd
      '<path d="M12 9.4a2 2 0 0 1 2 2 2 2 0 0 1-1.2 1.8l.5 3a.6.6 0 0 1-.6.7h-1.4a.6.6 0 0 1-.6-.7l.5-3A2 2 0 0 1 10 11.4a2 2 0 0 1 2-2Z"/>'
    ),

    // Shield off (incognito inactive) — open outline shield with a
    // diagonal slash. Communicates "not protected" without competing
    // visually with the active state.
    shieldOff: L(
      '<path d="M12 3.4 5.4 5.8v5.6c0 3.8 2.6 7.2 6.6 8.2 4-1 6.6-4.4 6.6-8.2V5.8L12 3.4Z"/>' +
      '<line x1="4.6" y1="4.6" x2="19.4" y2="19.4"/>',
      2.2
    ),

    // Collapse — sidebar rail + main panel with a breathing gap.
    collapse: S(
      '<path d="M5.6 3.4h1.6v17.2H5.6a2.2 2.2 0 0 1-2.2-2.2V5.6a2.2 2.2 0 0 1 2.2-2.2Z"/>' +
      '<rect x="9.4" y="3.4" width="11.2" height="17.2" rx="2.2"/>'
    ),
  };

  window.SAGE_ICONS = {
    get(name) { return Object.prototype.hasOwnProperty.call(ICONS, name) ? ICONS[name] : ''; },
    has(name) { return Object.prototype.hasOwnProperty.call(ICONS, name); },
    render(root) {
      const scope = root || document;
      if (!scope || !scope.querySelectorAll) return;
      scope.querySelectorAll('[data-icon]').forEach((el) => {
        const name = el.getAttribute('data-icon');
        const svg = Object.prototype.hasOwnProperty.call(ICONS, name) ? ICONS[name] : '';
        if (svg) el.innerHTML = svg;
      });
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.SAGE_ICONS.render());
  } else {
    window.SAGE_ICONS.render();
  }
})();

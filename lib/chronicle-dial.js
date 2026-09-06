/* GALPEDIA Chronicle Dial v0.1 — plain DOM adapter; no framework or animation library.
 * All geometry is trusted constant SVG. User-visible text is written with textContent.
 * This file only presents loading. It never fetches, changes routes, or computes progress.
 */
(function (global) {
  'use strict';
  const STANDARD_SVG = "<svg class=\"gp-dial__svg\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 256 256\" aria-hidden=\"true\" focusable=\"false\"><g class=\"gp-dial__fixed\"><circle class=\"gp-dial__outer\" cx=\"128\" cy=\"128\" r=\"111\"/><circle class=\"gp-dial__rim\" cx=\"128\" cy=\"128\" r=\"105\"/><path class=\"gp-dial__crosshair\" d=\"M12 128H244M128 12V244\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M138.244 30.537L138.662 26.559\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M148.375 32.142L149.207 28.229\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M158.284 34.796L159.520 30.992\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M167.860 38.473L169.487 34.818\"/><path class=\"gp-dial__tick gp-dial__tick--major\" d=\"M175.000 46.594L179.000 39.665\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M185.603 48.716L187.954 45.480\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M193.575 55.172L196.251 52.199\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M200.828 62.425L203.801 59.749\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M207.284 70.397L210.520 68.046\"/><path class=\"gp-dial__tick gp-dial__tick--major\" d=\"M209.406 81.000L216.335 77.000\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M217.527 88.140L221.182 86.513\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M221.204 97.716L225.008 96.480\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M223.858 107.625L227.771 106.793\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M225.463 117.756L229.441 117.338\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M225.463 138.244L229.441 138.662\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M223.858 148.375L227.771 149.207\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M221.204 158.284L225.008 159.520\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M217.527 167.860L221.182 169.487\"/><path class=\"gp-dial__tick gp-dial__tick--major\" d=\"M209.406 175.000L216.335 179.000\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M207.284 185.603L210.520 187.954\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M200.828 193.575L203.801 196.251\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M193.575 200.828L196.251 203.801\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M185.603 207.284L187.954 210.520\"/><path class=\"gp-dial__tick gp-dial__tick--major\" d=\"M175.000 209.406L179.000 216.335\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M167.860 217.527L169.487 221.182\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M158.284 221.204L159.520 225.008\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M148.375 223.858L149.207 227.771\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M138.244 225.463L138.662 229.441\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M117.756 225.463L117.338 229.441\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M107.625 223.858L106.793 227.771\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M97.716 221.204L96.480 225.008\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M88.140 217.527L86.513 221.182\"/><path class=\"gp-dial__tick gp-dial__tick--major\" d=\"M81.000 209.406L77.000 216.335\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M70.397 207.284L68.046 210.520\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M62.425 200.828L59.749 203.801\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M55.172 193.575L52.199 196.251\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M48.716 185.603L45.480 187.954\"/><path class=\"gp-dial__tick gp-dial__tick--major\" d=\"M46.594 175.000L39.665 179.000\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M38.473 167.860L34.818 169.487\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M34.796 158.284L30.992 159.520\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M32.142 148.375L28.229 149.207\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M30.537 138.244L26.559 138.662\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M30.537 117.756L26.559 117.338\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M32.142 107.625L28.229 106.793\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M34.796 97.716L30.992 96.480\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M38.473 88.140L34.818 86.513\"/><path class=\"gp-dial__tick gp-dial__tick--major\" d=\"M46.594 81.000L39.665 77.000\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M48.716 70.397L45.480 68.046\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M55.172 62.425L52.199 59.749\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M62.425 55.172L59.749 52.199\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M70.397 48.716L68.046 45.480\"/><path class=\"gp-dial__tick gp-dial__tick--major\" d=\"M81.000 46.594L77.000 39.665\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M88.140 38.473L86.513 34.818\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M97.716 34.796L96.480 30.992\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M107.625 32.142L106.793 28.229\"/><path class=\"gp-dial__tick gp-dial__tick--minor\" d=\"M117.756 30.537L117.338 26.559\"/><g transform=\"rotate(0 128 128)\"><path class=\"gp-dial__anchor\" d=\"M128 16 Q128.8 22.2 130.7 23 Q128.8 23.8 128 30 Q127.2 23.8 125.3 23 Q127.2 22.2 128 16Z\"/></g><g transform=\"rotate(90 128 128)\"><path class=\"gp-dial__anchor\" d=\"M128 16 Q128.8 22.2 130.7 23 Q128.8 23.8 128 30 Q127.2 23.8 125.3 23 Q127.2 22.2 128 16Z\"/></g><g transform=\"rotate(180 128 128)\"><path class=\"gp-dial__anchor\" d=\"M128 16 Q128.8 22.2 130.7 23 Q128.8 23.8 128 30 Q127.2 23.8 125.3 23 Q127.2 22.2 128 16Z\"/></g><g transform=\"rotate(270 128 128)\"><path class=\"gp-dial__anchor\" d=\"M128 16 Q128.8 22.2 130.7 23 Q128.8 23.8 128 30 Q127.2 23.8 125.3 23 Q127.2 22.2 128 16Z\"/></g><circle class=\"gp-dial__track\" cx=\"128\" cy=\"128\" r=\"82\"/><circle class=\"gp-dial__track gp-dial__track--inner\" cx=\"128\" cy=\"128\" r=\"72\"/></g><g class=\"gp-dial__rotor gp-dial__rotor--secondary\"><path class=\"gp-dial__secondary-arc\" opacity=\"0.52\" d=\"M 139.808 61.033 A 68 68 0 0 1 194.751 115.025\"/><path class=\"gp-dial__secondary-arc\" opacity=\"0.3\" d=\"M 111.549 193.980 A 68 68 0 0 1 69.110 162.000\"/><circle class=\"gp-dial__orbit-dot\" cx=\"139.808\" cy=\"61.033\" r=\"1.35\"/><circle class=\"gp-dial__orbit-dot\" cx=\"194.751\" cy=\"115.025\" r=\"1.35\"/><circle class=\"gp-dial__orbit-dot\" cx=\"111.549\" cy=\"193.980\" r=\"1.35\"/><circle class=\"gp-dial__orbit-dot\" cx=\"69.110\" cy=\"162.000\" r=\"1.35\"/></g><g class=\"gp-dial__rotor gp-dial__rotor--primary\"><path class=\"gp-dial__haze\" d=\"M 50.581 118.494 A 78 78 0 0 1 128.000 50.000\"/><g class=\"gp-dial__trail\"><path class=\"gp-dial__arc\" opacity=\"0.063\" d=\"M 55.680 157.219 A 78 78 0 0 1 52.602 147.977\"/><path class=\"gp-dial__arc\" opacity=\"0.088\" d=\"M 52.658 148.188 A 78 78 0 0 1 50.729 138.640\"/><path class=\"gp-dial__arc\" opacity=\"0.121\" d=\"M 50.759 138.856 A 78 78 0 0 1 50.008 129.143\"/><path class=\"gp-dial__arc\" opacity=\"0.161\" d=\"M 50.012 129.361 A 78 78 0 0 1 50.450 119.630\"/><path class=\"gp-dial__arc\" opacity=\"0.207\" d=\"M 50.427 119.847 A 78 78 0 0 1 52.048 110.242\"/><path class=\"gp-dial__arc\" opacity=\"0.258\" d=\"M 51.999 110.454 A 78 78 0 0 1 54.779 101.118\"/><path class=\"gp-dial__arc\" opacity=\"0.314\" d=\"M 54.704 101.322 A 78 78 0 0 1 58.601 92.395\"/><path class=\"gp-dial__arc\" opacity=\"0.374\" d=\"M 58.501 92.589 A 78 78 0 0 1 63.457 84.203\"/><path class=\"gp-dial__arc\" opacity=\"0.439\" d=\"M 63.335 84.383 A 78 78 0 0 1 69.276 76.663\"/><path class=\"gp-dial__arc\" opacity=\"0.508\" d=\"M 69.133 76.827 A 78 78 0 0 1 75.970 69.889\"/><path class=\"gp-dial__arc\" opacity=\"0.581\" d=\"M 75.808 70.035 A 78 78 0 0 1 83.440 63.981\"/><path class=\"gp-dial__arc\" opacity=\"0.658\" d=\"M 83.261 64.106 A 78 78 0 0 1 91.574 59.028\"/><path class=\"gp-dial__arc\" opacity=\"0.739\" d=\"M 91.381 59.130 A 78 78 0 0 1 100.251 55.103\"/><path class=\"gp-dial__arc\" opacity=\"0.822\" d=\"M 100.047 55.181 A 78 78 0 0 1 109.342 52.265\"/><path class=\"gp-dial__arc\" opacity=\"0.910\" d=\"M 109.130 52.317 A 78 78 0 0 1 118.710 50.555\"/><path class=\"gp-dial__arc\" opacity=\"1.000\" d=\"M 118.494 50.581 A 78 78 0 0 1 128.218 50.000\"/></g><path class=\"gp-dial__echo\" d=\"M 55.407 87.761 A 83 83 0 0 1 122.210 45.202\"/><path class=\"gp-dial__hand\" d=\"M128 112V57\"/><path class=\"gp-dial__head\" d=\"M128 46.5L130.7 50L128 53.5L125.3 50Z\"/></g><path class=\"gp-dial__center\" d=\"M128 120.8 Q128.8 127.2 132.2 128 Q128.8 128.8 128 135.2 Q127.2 128.8 123.8 128 Q127.2 127.2 128 120.8Z\"/></svg>";
  const INLINE_SVG = "<svg class=\"gp-dial__svg\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\" aria-hidden=\"true\" focusable=\"false\"><circle class=\"gp-dial__mini-track\" cx=\"16\" cy=\"16\" r=\"12\"/><path class=\"gp-dial__mini-ticks\" d=\"M16 2V5M27 16H30M16 27V30M2 16H5\"/><g class=\"gp-dial__rotor gp-dial__rotor--mini\"><path class=\"gp-dial__mini-arc\" d=\"M4 16A12 12 0 0 1 16 4\"/><path class=\"gp-dial__mini-hand\" d=\"M16 18V7\"/><circle class=\"gp-dial__mini-dot\" cx=\"16\" cy=\"16\" r=\"1.4\"/></g></svg>";
  const variants = new Set(['standard', 'compact', 'inline']);
  const themes = new Set(['light', 'dark', 'inherit']);

  function createDial(options = {}) {
    const variant = variants.has(options.variant) ? options.variant : 'standard';
    const node = document.createElement('span');
    node.className = 'gp-dial gp-dial--' + variant;
    node.dataset.theme = themes.has(options.theme) ? options.theme : 'inherit';
    node.setAttribute('aria-hidden', 'true');
    if (Number.isFinite(options.size) && options.size >= 16 && options.size <= 512) {
      node.style.setProperty('--gp-dial-size', options.size + 'px');
    }
    if (options.reducedMotion) node.dataset.reducedMotion = 'true';
    node.innerHTML = variant === 'inline' ? INLINE_SVG : STANDARD_SVG;
    // Reduced-detail geometry is physically removed for compact, not only visually hidden.
    if (variant === 'compact') {
      node.querySelectorAll('.gp-dial__tick--minor, .gp-dial__outer, .gp-dial__crosshair, '
        + '.gp-dial__rotor--secondary, .gp-dial__track--inner, .gp-dial__haze, .gp-dial__echo')
        .forEach(el => el.remove());
    }
    return node;
  }

  /** Scoped controller. One owner for each host, region and announcer.
   * @param {{host:HTMLElement, region?:HTMLElement, announcer?:HTMLElement,
   * variant?:string, size?:number, theme?:string, delay?:number, slowAfter?:number,
   * slowLabel?:string, stacked?:boolean}} options
   */
  function createLoadingController(options) {
    if (!options || !(options.host instanceof HTMLElement)) {
      throw new TypeError('createLoadingController needs a real host HTMLElement.');
    }
    const {host, region = null, announcer = null} = options;
    const delay = Number.isFinite(options.delay) ? Math.max(0, options.delay) : 160;
    const slowAfter = Number.isFinite(options.slowAfter) ? Math.max(0, options.slowAfter) : 8000;
    let generation = 0, active = false, disposed = false;
    let revealTimer = null, slowTimer = null, currentLabel = '';
    const initialBusy = region ? region.getAttribute('aria-busy') : null;
    host.classList.add('gp-loading-view');
    if (options.stacked) host.classList.add('gp-loading-view--stack');
    const label = document.createElement('span');
    label.className = 'gp-loading-view__label';
    host.replaceChildren(createDial(options), label);
    host.hidden = true;
    // Live region is supplied by the caller, preferably outside region[aria-busy].
    // The graphic is decorative; no invented aria-valuenow, no per-frame announcements.
    function announce(message) { if (announcer) announcer.textContent = message; }
    function clearTimers() {
      clearTimeout(revealTimer); clearTimeout(slowTimer);
      revealTimer = slowTimer = null;
    }
    function setBusy(value) { if (region) region.setAttribute('aria-busy', String(value)); }
    function settle(token, message) {
      if (disposed || !active || token !== generation) return false;
      active = false; clearTimers(); host.hidden = true; setBusy(false);
      announce(typeof message === 'string' ? message : '');
      return true;
    }
    function begin(message = '正在载入资料…') {
      if (disposed) throw new Error('This loading controller has been disposed.');
      clearTimers(); const token = ++generation;
      active = true; currentLabel = String(message);
      host.hidden = true; label.textContent = currentLabel; setBusy(true); announce('');
      revealTimer = setTimeout(() => {
        if (disposed || !active || token !== generation) return;
        host.hidden = false; announce(currentLabel);
      }, delay);
      if (slowAfter > 0) {
        slowTimer = setTimeout(() => {
          if (disposed || !active || token !== generation) return;
          const extra = options.slowLabel || '载入时间较长，请稍候。';
          label.textContent = currentLabel + ' ' + extra;
          if (!host.hidden) announce(label.textContent);
        }, slowAfter);
      }
      return Object.freeze({
        update(message) {
          if (disposed || !active || token !== generation) return false;
          currentLabel = String(message); label.textContent = currentLabel;
          if (!host.hidden) announce(currentLabel);
          return true;
        },
        finish: message => settle(token, message),
        fail: message => settle(token, message),
        cancel: () => settle(token, '')
      });
    }
    function dispose() {
      if (disposed) return;
      const hadActiveWork = active;
      clearTimers(); active = false; disposed = true; ++generation;
      host.hidden = true; host.replaceChildren();
      if (region && hadActiveWork) {
        if (initialBusy === null) region.removeAttribute('aria-busy');
        else region.setAttribute('aria-busy', initialBusy);
      }
      announce('');
    }
    return Object.freeze({ begin, dispose, get isActive() { return active; } });
  }

  const syncVisibility = () => {
    document.documentElement.toggleAttribute('data-gp-dials-suspended', document.hidden);
  };
  document.addEventListener('visibilitychange', syncVisibility);
  syncVisibility();
  global.GalpediaDial = Object.freeze({createDial, createLoadingController});
})(window);

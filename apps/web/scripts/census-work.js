/**
 * Counts the work a table does, instead of timing it.
 *
 * Timing on this machine turned out to be unusable: with builds and other
 * agents running, an A/B of two *identical* builds reported the second one 6%
 * and 13% slower, and one of them lost every round. Nothing smaller than that
 * can be read, and most of what is worth doing is smaller than that.
 *
 * Counting does not care. Every number below is a tally of calls made while
 * turning a fixed number of bursts of game state into a laid-out table, and it
 * is identical on a busy laptop and an idle one — which also makes it the only
 * measurement here that transfers honestly to a phone.
 *
 * They are chosen to be the things the optimisation work actually moves:
 *
 * - `layoutReads` — `getBoundingClientRect`, `offsetWidth` and friends. Each one
 *   made after the DOM has changed forces the browser to lay the page out
 *   synchronously, which is the classic cause of a stutter under animation.
 * - `styleReads` — `getComputedStyle`. Same story, plus it resolves cascade.
 * - `selectorScans` — `querySelector`/`querySelectorAll`, weighted by how much
 *   of the tree they had to walk.
 * - `timers` — `setTimeout` calls. Every one of these on a table is a future
 *   React state update, and each of those is a re-render.
 * - `mutations` — DOM nodes added, removed or re-attributed, via MutationObserver.
 * - `animations` — `Element.animate` calls, so a move onto the compositor shows
 *   up as a number going up rather than as a claim.
 *
 * Installed before any app code runs, so it sees everything.
 */
(() => {
  const counts = {
    layoutReads: 0,
    styleReads: 0,
    selectorScans: 0,
    selectorNodes: 0,
    timers: 0,
    rafs: 0,
    mutations: 0,
    animations: 0,
  };
  let armed = false;

  const bump = (key, by = 1) => {
    if (armed) counts[key] += by;
  };

  /** Geometry getters that flush layout when the DOM is dirty. */
  const LAYOUT_PROPS = [
    [
      Element.prototype,
      ['clientWidth', 'clientHeight', 'clientTop', 'clientLeft', 'scrollWidth', 'scrollHeight'],
    ],
    [HTMLElement.prototype, ['offsetWidth', 'offsetHeight', 'offsetTop', 'offsetLeft']],
  ];
  for (const [proto, names] of LAYOUT_PROPS) {
    for (const name of names) {
      const descriptor = Object.getOwnPropertyDescriptor(proto, name);
      if (!descriptor?.get) continue;
      Object.defineProperty(proto, name, {
        ...descriptor,
        get() {
          bump('layoutReads');
          return descriptor.get.call(this);
        },
      });
    }
  }

  for (const proto of [Element.prototype, Range.prototype]) {
    const rect = proto.getBoundingClientRect;
    if (!rect) continue;
    proto.getBoundingClientRect = function patched(...args) {
      bump('layoutReads');
      return rect.apply(this, args);
    };
  }
  const rects = Element.prototype.getClientRects;
  Element.prototype.getClientRects = function patched(...args) {
    bump('layoutReads');
    return rects.apply(this, args);
  };

  const computed = window.getComputedStyle.bind(window);
  window.getComputedStyle = function patched(...args) {
    bump('styleReads');
    return computed(...args);
  };

  for (const proto of [Document.prototype, Element.prototype, DocumentFragment.prototype]) {
    for (const name of ['querySelector', 'querySelectorAll']) {
      const original = proto[name];
      if (!original) continue;
      proto[name] = function patched(...args) {
        const result = original.apply(this, args);
        if (armed) {
          counts.selectorScans += 1;
          // A rough size for the walk: how much subtree the query had to cross.
          counts.selectorNodes += this.getElementsByTagName
            ? this.getElementsByTagName('*').length
            : 0;
        }
        return result;
      };
    }
  }

  const timeout = window.setTimeout.bind(window);
  window.setTimeout = function patched(...args) {
    bump('timers');
    return timeout(...args);
  };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function patched(...args) {
    bump('rafs');
    return raf(...args);
  };

  if (Element.prototype.animate) {
    const animate = Element.prototype.animate;
    Element.prototype.animate = function patched(...args) {
      bump('animations');
      return animate.apply(this, args);
    };
  }

  const tally = (records) => {
    for (const record of records) {
      counts.mutations +=
        record.addedNodes.length + record.removedNodes.length + (record.attributeName ? 1 : 0);
    }
  };
  // Drained explicitly rather than only from the callback: the bench runs every
  // burst inside one synchronous loop, and a MutationObserver callback is a
  // microtask, so nothing would be delivered until the whole run was over and
  // the counter had already been read.
  const observer = new MutationObserver((records) => {
    if (armed) tally(records);
  });
  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });

  window.__workCensus = {
    /** Called by the harness once warmup is done, so cold-start work is excluded. */
    arm() {
      observer.takeRecords();
      for (const key of Object.keys(counts)) counts[key] = 0;
      armed = true;
    },
    read(bursts) {
      tally(observer.takeRecords());
      armed = false;
      const per = {};
      for (const [key, value] of Object.entries(counts)) {
        per[key] = Math.round((value / bursts) * 100) / 100;
      }
      return { total: { ...counts }, perBurst: per, bursts };
    },
  };
})();

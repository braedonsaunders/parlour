/**
 * Attach a memoised `hint` getter that does not enumerate.
 *
 * Reading the hint is the expensive thing on a solitaire table — often a
 * full solver search. Object-literal getters are enumerable, so
 * `JSON.stringify(snapshot)` and `{...snapshot}` would pay for it on every
 * move. A hidden hint must cost nothing.
 */
export function attachDeferredHint<T extends object, H>(
  snapshot: T,
  read: () => H,
): T & { readonly hint: H } {
  let hinted: H | undefined;
  Object.defineProperty(snapshot, 'hint', {
    enumerable: false,
    configurable: true,
    get() {
      if (hinted === undefined) hinted = read();
      return hinted as H;
    },
  });
  return snapshot as T & { readonly hint: H };
}

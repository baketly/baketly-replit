// Which build this is.
//
// A phone can run a bundle other than the one just built -- a cached copy in
// Xcode, an older checkout, the store's version -- and from the screen the
// two look the same until something that should have changed has not. The
// moment the bundle was built is stamped in at build time and shown at the
// foot of Settings, so "is this the new one?" has an answer.

declare const __BAKETLY_BUILT_AT__: string;

declare global {
  interface Window {
    __baketlyBuiltAt: string;
  }
}

export function stampBuild(): void {
  let stamp = "";
  try {
    stamp = __BAKETLY_BUILT_AT__;
  } catch {
    // a dev server without the define; nothing to show
  }
  window.__baketlyBuiltAt = stamp;
}

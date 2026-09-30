// The first moment of the app: what is on screen before anything else is.
//
// Three things the generated page leaves undone.
//
// It carries no viewport meta. One arrives inside the app's template, but not
// until the workspace has come back from the server and a megabyte and a half
// of markup has been unpacked — and until then iOS lays the document out at
// about 980px and scales it down. Anything drawn in that window, the sign-in
// screen most of all, appears shrunken and then snaps to size when the app
// takes over. Declaring the viewport at the first opportunity means it never
// does.
//
// Its placeholder is drawn in an <svg> whose view box was written as a
// template directive rather than a real attribute, so the browser had no
// coordinate system to scale it to and left it at natural size, running off
// the corner. The mark itself replaces it, with three dots.
//
// And the unpacker finishes by replacing the whole document element, which
// throws that placeholder away along with everything else — leaving the raw
// template on screen, `{{ }}` and all, until the controller binds to it. So
// the cover is re-attached whenever it is detached, and only taken down once
// there is something real underneath.

const CREAM = "#faf6f0";
const GREEN = "#063930";
const COVER_ID = "bk-startup-cover";
// a safety valve: if the app never reports itself ready, do not leave a baker
// staring at a blank screen for ever
const GIVE_UP_AFTER_MS = 30_000;

/**
 * Gives the document a viewport before anything is drawn in it.
 *
 * Harmless when one already exists: the app's template carries its own, and
 * this only fills the gap before that arrives.
 */
export function ensureViewport(): void {
  if (document.querySelector('meta[name="viewport"]')) return;
  const meta = document.createElement("meta");
  meta.name = "viewport";
  // viewport-fit=cover is also what makes iOS report the safe-area insets the
  // native layout depends on
  meta.content = "width=device-width, initial-scale=1, viewport-fit=cover";
  document.head.appendChild(meta);
}

/**
 * The mark where the app's own header will be, and three dots to say something
 * is happening.
 *
 * The loaf alone, in green, rather than the whole tile: an icon belongs on a
 * home screen, and inside the app the shape is enough. It is lifted from the
 * same artwork the icon is cut from, so the two cannot drift apart, and it
 * sits at the root of the app's bundle and of the website alike — which is why
 * the path has no leading slash.
 */
function markup(): string {
  return `
<style>
  #${COVER_ID} {
    position: fixed; inset: 0; z-index: 2147483000;
    background: ${CREAM};
    padding: calc(14px + env(safe-area-inset-top)) 16px 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  #${COVER_ID} .bk-start { display: flex; align-items: center; gap: 12px; }
  #${COVER_ID} .bk-mark { height: 34px; width: auto; display: block; }
  #${COVER_ID} .bk-dots { display: flex; gap: 5px; align-items: center; }
  #${COVER_ID} .bk-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: ${GREEN}; opacity: .22;
    animation: bk-blink 1.1s ease-in-out infinite;
  }
  #${COVER_ID} .bk-dot:nth-child(2) { animation-delay: .16s; }
  #${COVER_ID} .bk-dot:nth-child(3) { animation-delay: .32s; }

  @keyframes bk-blink {
    0%, 70%, 100% { opacity: .22; transform: translateY(0); }
    35%           { opacity: .85; transform: translateY(-3px); }
  }

  @media (prefers-reduced-motion: reduce) {
    #${COVER_ID} .bk-dot { animation: none; opacity: .45; }
  }
</style>

<div class="bk-start">
  <img class="bk-mark" src="loaf-mark.png" alt="Baketly" height="34">
  <span class="bk-dots" role="status" aria-label="Opening Baketly">
    <span class="bk-dot"></span><span class="bk-dot"></span><span class="bk-dot"></span>
  </span>
</div>`;
}

/**
 * Whether the app's own stylesheet is in force yet.
 *
 * The page is built twice over: a bootstrap document, and then the app's,
 * which replaces it wholesale. Only the second defines these custom
 * properties, so asking for one is a precise answer to "are we on the real
 * page now".
 */
export function appStylesApplied(): boolean {
  return getComputedStyle(document.documentElement).getPropertyValue("--font-heading").trim() !== "";
}

/**
 * Resolves when what is on screen will not move again.
 *
 * Two things shift the layout after first paint and both have to be waited
 * out: the app's stylesheet arriving with the document swap, and then Poppins
 * loading, which re-measures every line set in it.
 *
 * It always resolves. A stylesheet that never arrives is a worse thing to show
 * than an unstyled screen, so this gives up on the same deadline the cover
 * uses rather than leaving anyone watching a loading screen forever.
 */
export function whenSettled(): Promise<void> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const done = () => {
      // already resolved where there are no web fonts, and absent altogether
      // in an old browser; neither should hold anything up
      const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
      if (fonts?.ready) fonts.ready.then(() => resolve(), () => resolve());
      else resolve();
    };
    if (appStylesApplied()) {
      done();
      return;
    }
    const timer = window.setInterval(() => {
      if (appStylesApplied() || Date.now() - startedAt > GIVE_UP_AFTER_MS) {
        window.clearInterval(timer);
        done();
      }
    }, 50);
  });
}

/**
 * Whether there is anything worth showing underneath.
 *
 * Either the sign-in screen has rendered — it mounts outside the body, so it
 * survives the swap — or the app's own markup has been bound, which is exactly
 * when its placeholders stop being literal text.
 *
 * The sign-in screen now waits for the stylesheet before rendering at all, so
 * its presence is proof the page is styled. It did not always: the cover came
 * off the moment the gate mounted, the stylesheet landed a second and a half
 * later, and the login changed font and size in front of whoever was already
 * reading it.
 */
function appearsReady(): boolean {
  const gate = document.getElementById("baketly-auth-gate");
  if (gate?.firstElementChild) return true;
  const body = document.body;
  if (!body || !body.children.length) return false;
  return !body.innerHTML.includes("{{");
}

/**
 * Covers the page until the app is ready to be seen.
 *
 * The cover is re-attached rather than merely created once: the unpacker
 * replaces the document element wholesale, and anything inside it goes with
 * it.
 */
export function showLoadingScreen(): void {
  document.getElementById("__bundler_thumbnail")?.remove();

  const cover = document.createElement("div");
  cover.id = COVER_ID;
  cover.innerHTML = markup();
  document.documentElement.appendChild(cover);

  const startedAt = Date.now();
  const tick = () => {
    if (appearsReady() || Date.now() - startedAt > GIVE_UP_AFTER_MS) {
      cover.remove();
      return;
    }
    // put back whatever the document swap took away
    if (!cover.isConnected) document.documentElement.appendChild(cover);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

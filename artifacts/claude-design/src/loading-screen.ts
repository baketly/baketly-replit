// What a baker looks at while Baketly opens.
//
// The generated page ships a placeholder: a green tile with the loaf mark,
// drawn in an <svg> whose view box was written as a template directive rather
// than a real attribute. With no coordinate system the browser cannot scale it,
// so it sat at its natural size in the top-left corner and ran off the edge of
// the screen.
//
// Replaced here rather than in index.html, which is generated and would lose
// the change. There is a real wait to fill — the page is a megabyte and a half
// and the workspace has to come back from the server before anything can be
// drawn — so it may as well be a loaf in an oven.

// the mark's own green, sampled from the artwork
const OVEN = "#063930";
const CREAM = "#faf6f0";
const DOUGH = "#f0dcb4";
const CRUST = "#c98b3f";
const GLOW = "#e8a33d";

/**
 * The animation, as one self-contained markup string.
 *
 * Everything is inline: no imports the loading screen could be waiting on, and
 * no stylesheet that might arrive after it.
 */
function ovenMarkup(): string {
  return `
<style>
  #__bundler_thumbnail { background: ${CREAM} !important; flex-direction: column; gap: 22px; }
  .bk-oven { width: min(180px, 42vw); height: auto; }
  .bk-loaf { transform-origin: 50px 62px; animation: bk-rise 3.2s ease-in-out infinite; }
  .bk-crust { animation: bk-bake 3.2s ease-in-out infinite; }
  .bk-glow { animation: bk-glow 3.2s ease-in-out infinite; }
  .bk-heat { animation: bk-heat 2.4s ease-in-out infinite; }
  .bk-heat-2 { animation-delay: .5s; }
  .bk-heat-3 { animation-delay: 1s; }
  .bk-word {
    font: 600 13px/1 "Poppins", -apple-system, BlinkMacSystemFont, sans-serif;
    letter-spacing: .22em;
    text-transform: uppercase;
    color: ${OVEN};
    opacity: .75;
  }

  /* the loaf swells as it proves, then settles */
  @keyframes bk-rise {
    0%, 100% { transform: scaleY(1) scaleX(1); }
    55%      { transform: scaleY(1.16) scaleX(1.04); }
  }
  /* and colours from pale dough to a baked crust */
  @keyframes bk-bake {
    0%, 12%  { opacity: 0; }
    70%, 100% { opacity: 1; }
  }
  /* the oven light breathes */
  @keyframes bk-glow {
    0%, 100% { opacity: .22; }
    60%      { opacity: .5; }
  }
  /* heat rising off the top */
  @keyframes bk-heat {
    0%   { opacity: 0; transform: translateY(0); }
    30%  { opacity: .55; }
    100% { opacity: 0; transform: translateY(-14px); }
  }

  @media (prefers-reduced-motion: reduce) {
    .bk-loaf, .bk-crust, .bk-glow, .bk-heat { animation: none; }
    .bk-crust { opacity: 1; }
    .bk-glow { opacity: .4; }
  }
</style>

<svg class="bk-oven" viewBox="0 -18 100 126" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Baketly is opening">
  <!-- heat, rising before the oven is even drawn so it sits behind it -->
  <g fill="none" stroke="${GLOW}" stroke-width="2.4" stroke-linecap="round" opacity="0">
    <path class="bk-heat" d="M34 16c0-4 4-4 4-8s-4-4-4-8" />
    <path class="bk-heat bk-heat-2" d="M50 14c0-4 4-4 4-8s-4-4-4-8" />
    <path class="bk-heat bk-heat-3" d="M66 16c0-4 4-4 4-8s-4-4-4-8" />
  </g>

  <!-- the oven -->
  <rect x="8" y="20" width="84" height="80" rx="12" fill="${OVEN}" />
  <rect x="8" y="20" width="84" height="16" rx="8" fill="${OVEN}" />
  <circle cx="22" cy="28" r="2.6" fill="${CREAM}" opacity=".55" />
  <circle cx="32" cy="28" r="2.6" fill="${CREAM}" opacity=".3" />

  <!-- the door, and the light inside it -->
  <rect x="17" y="42" width="66" height="48" rx="9" fill="${CREAM}" opacity=".12" />
  <rect class="bk-glow" x="17" y="42" width="66" height="48" rx="9" fill="${GLOW}" />
  <rect x="17" y="42" width="66" height="48" rx="9" fill="none" stroke="${CREAM}" stroke-width="2.5" opacity=".85" />

  <!-- the bake -->
  <g class="bk-loaf">
    <ellipse cx="50" cy="70" rx="20" ry="11" fill="${DOUGH}" />
    <ellipse class="bk-crust" cx="50" cy="70" rx="20" ry="11" fill="${CRUST}" />
    <g stroke="${OVEN}" stroke-width="1.6" stroke-linecap="round" opacity=".5">
      <path d="M41 66l3 3" />
      <path d="M48 64.5l3 3" />
      <path d="M55 66l3 3" />
    </g>
  </g>

  <!-- the rack it sits on -->
  <rect x="26" y="82" width="48" height="2.4" rx="1.2" fill="${CREAM}" opacity=".5" />

  <!-- the handle -->
  <rect x="24" y="94" width="52" height="4" rx="2" fill="${CREAM}" opacity=".7" />
</svg>

<div class="bk-word">Baketly</div>`;
}

/**
 * Swaps the placeholder for the oven, if the placeholder is still there.
 *
 * Silent when it is not: on a second render, or in a context that never showed
 * one, there is nothing to replace and nothing to complain about.
 */
export function showLoadingScreen(): void {
  const thumbnail = document.getElementById("__bundler_thumbnail");
  if (!thumbnail) return;
  thumbnail.innerHTML = ovenMarkup();
}

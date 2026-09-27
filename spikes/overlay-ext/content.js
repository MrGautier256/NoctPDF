// Engine B spike: overlay variants on top of the native PDF viewer.
// Variant comes from the PDF URL query: ?noct=<variant>&inset=<px>
(() => {
  const params = new URL(location.href).searchParams;
  const variant = params.get("noct") ?? "backdrop";
  const inset = Number(params.get("inset") ?? 56);
  const BG = "#1e1f22", FG = "#e6e3dc";

  function isPdfDocument() {
    if (document.contentType === "application/pdf") return true;
    const b = document.body;
    if (!b) return false;
    const el = b.querySelector('embed[type="application/pdf"], object[type="application/pdf"]');
    return !!el && b.children.length === 1 && el.offsetWidth >= innerWidth - 2;
  }

  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  // Map luminance: white -> BG, black -> FG (per channel linear table).
  function svgFilter() {
    const [br, bg, bb] = hex(BG), [fr, fg, fb] = hex(FG);
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("style", "position:absolute;width:0;height:0");
    svg.innerHTML = `<filter id="noct-map" color-interpolation-filters="sRGB">
      <feColorMatrix type="matrix" values="-1 0 0 0 1  0 -1 0 0 1  0 0 -1 0 1  0 0 0 1 0"/>
      <feColorMatrix type="hueRotate" values="180"/>
      <feComponentTransfer>
        <feFuncR type="table" tableValues="${br} ${fr}"/>
        <feFuncG type="table" tableValues="${bg} ${fg}"/>
        <feFuncB type="table" tableValues="${bb} ${fb}"/>
      </feComponentTransfer></filter>`;
    return svg;
  }

  const layers = [];
  function layer(css) {
    const d = document.createElement("div");
    d.style.cssText = `position:fixed;left:0;right:0;bottom:0;top:${inset}px;pointer-events:none;z-index:2147483647;${css}`;
    d.dataset.noct = variant;
    layers.push(d);
    return d;
  }

  function build() {
    switch (variant) {
      case "backdrop":
        layer("backdrop-filter:invert(1) hue-rotate(180deg)");
        break;
      case "backdrop-svg":
        document.documentElement.append(svgFilter());
        layer("backdrop-filter:url(#noct-map)");
        break;
      case "blend":
        layer("background:#fff;mix-blend-mode:difference");
        break;
      case "blend-colors":
        // difference inverts, then screen lifts black toward BG and
        // multiply pulls white toward FG.
        layer("background:#fff;mix-blend-mode:difference");
        layer(`background:${BG};mix-blend-mode:screen`);
        layer(`background:${FG};mix-blend-mode:multiply`);
        break;
      case "root-filter":
        document.documentElement.style.filter = "invert(1) hue-rotate(180deg)";
        return;
      case "embed-filter": {
        const e = document.querySelector("embed");
        if (e) e.style.filter = "invert(1) hue-rotate(180deg)";
        return;
      }
      default:
        return;
    }
  }

  let built = false;
  function apply() {
    if (!isPdfDocument()) return;
    if (!built) {
      built = true;
      build();
      window.__noctOverlay = { variant, inset, frame: location.href };
    }
    // Re-append so the layers sit above the plugin surface created later.
    for (const l of layers) (document.body ?? document.documentElement).append(l);
  }

  const schedule = () => {
    apply();
    if (params.get("once")) return; // timing experiment: no re-append
    requestAnimationFrame(apply);
    addEventListener("load", apply);
    for (const t of [250, 800, 2000]) setTimeout(apply, t);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", schedule);
  else schedule();
})();

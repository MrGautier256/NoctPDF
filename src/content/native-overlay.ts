/**
 * Engine B: a single backdrop-filter layer on top of the browser's own PDF
 * viewer (see docs/phase0-findings.md §5 and docs/ADR-001-recoloration.md).
 * Unlike Engine A this never touches the PDF's own rendering; it only draws
 * a fixed overlay over it, so it keeps working if Engine A's pipeline is
 * off or unavailable.
 */
import { browser, send, storage } from "../platform";
import type { Settings } from "../settings/schema";
import { resolveEffectiveSettings } from "../settings/site-rules";
import { isSettingsChange, readSettings } from "../settings/storage";
import {
  buildFilterMarkup,
  isFullBleedPdfEmbed,
  isTopLevelPdfDocument,
  paletteForStyle,
  resolveToolbarInset,
  shouldActivateOverlay,
} from "./native-overlay-logic";

const FILTER_ID = "noctpdf-native-overlay-filter";
const LAYER_ATTR = "data-noctpdf-overlay";

function isEdge(): boolean {
  const brands = (navigator as Navigator & { userAgentData?: { brands?: Array<{ brand: string }> } }).userAgentData
    ?.brands;
  return brands?.some(b => b.brand === "Microsoft Edge") ?? false;
}

function isPdfSurface(): boolean {
  if (isTopLevelPdfDocument(document.contentType)) return true;
  const body = document.body;
  const el = body.querySelector('embed[type="application/pdf"], object[type="application/pdf"]');
  if (!(el instanceof HTMLElement)) return false;
  return isFullBleedPdfEmbed({
    mimeType: "application/pdf",
    elementWidth: el.offsetWidth,
    viewportWidth: innerWidth,
    isOnlyBodyChild: body.children.length === 1,
  });
}

function switchToEnhanced(): void {
  void send({ type: "noct:switchToEnhanced", url: document.URL });
}

function buildBanner(onDismiss: () => void): HTMLDivElement {
  const banner = document.createElement("div");
  banner.setAttribute(LAYER_ATTR + "-banner", "");
  Object.assign(banner.style, {
    position: "fixed",
    right: "12px",
    bottom: "12px",
    zIndex: "2147483647",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 12px",
    maxWidth: "min(360px, 80vw)",
    borderRadius: "8px",
    background: "#2b2d31",
    color: "#e6e3dc",
    font: "12px/1.4 system-ui, sans-serif",
    boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
    pointerEvents: "auto",
  });

  const text = document.createElement("span");
  text.textContent = browser.i18n.getMessage("nativeOverlayLimitations");
  banner.append(text);

  const switchButton = document.createElement("button");
  switchButton.type = "button";
  switchButton.textContent = browser.i18n.getMessage("openEnhanced");
  Object.assign(switchButton.style, {
    flex: "none",
    border: "none",
    borderRadius: "4px",
    padding: "4px 8px",
    background: "#3d70d1",
    color: "#fff",
    cursor: "pointer",
    font: "inherit",
  });
  switchButton.addEventListener("click", switchToEnhanced);
  banner.append(switchButton);

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.textContent = "×";
  dismiss.setAttribute("aria-label", browser.i18n.getMessage("nativeOverlayDismiss"));
  Object.assign(dismiss.style, {
    flex: "none",
    border: "none",
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
    font: "14px/1 inherit",
    padding: "0 2px",
  });
  dismiss.addEventListener("click", onDismiss);
  banner.append(dismiss);

  return banner;
}

class NativeOverlay {
  private style: HTMLStyleElement | null = null;
  private svg: SVGSVGElement | null = null;
  private layer: HTMLDivElement | null = null;
  private banner: HTMLDivElement | null = null;
  private observer: MutationObserver | null = null;
  private bannerDismissed = false;

  render(settings: Settings): void {
    if (!isPdfSurface()) {
      this.remove();
      return;
    }
    const palette = paletteForStyle(settings.nativeOverlay.style, settings.theme);
    const inset = resolveToolbarInset(settings.nativeOverlay, isEdge());

    if (!this.style) {
      this.style = document.createElement("style");
      this.style.textContent = `@media print { [${LAYER_ATTR}] { display: none !important; } }`;
      document.head.append(this.style);
    }
    if (!this.svg) {
      this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      this.svg.setAttribute("style", "position:absolute;width:0;height:0");
    }
    this.svg.innerHTML = buildFilterMarkup(FILTER_ID, palette);

    if (!this.layer) {
      this.layer = document.createElement("div");
      this.layer.setAttribute(LAYER_ATTR, "");
    }
    Object.assign(this.layer.style, {
      position: "fixed",
      left: "0",
      right: "0",
      bottom: "0",
      top: `${inset}px`,
      pointerEvents: "none",
      zIndex: "2147483647",
      backdropFilter: `url(#${FILTER_ID})`,
    });

    if (!this.banner && !this.bannerDismissed) {
      this.banner = buildBanner(() => {
        this.bannerDismissed = true;
        this.banner?.remove();
        this.banner = null;
      });
    }

    this.reinsert();
    this.ensureObserver();
  }

  remove(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.layer?.remove();
    this.svg?.remove();
    this.style?.remove();
    this.banner?.remove();
    this.layer = this.svg = this.style = this.banner = null;
  }

  private reinsert(): void {
    if (this.svg && !document.documentElement.contains(this.svg)) document.documentElement.append(this.svg);
    if (this.layer) document.body.append(this.layer);
    if (this.banner) document.body.append(this.banner);
  }

  private ensureObserver(): void {
    if (this.observer) return;
    this.observer = new MutationObserver(() => {
      if (this.layer && !document.body.contains(this.layer)) this.reinsert();
    });
    this.observer.observe(document.body, { childList: true });
  }
}

export function startNativeOverlay(): void {
  const overlay = new NativeOverlay();
  let settings: Settings | null = null;

  function apply(): void {
    if (!settings) return;
    const effective = resolveEffectiveSettings(settings, document.URL);
    if (shouldActivateOverlay(effective)) overlay.render(effective);
    else overlay.remove();
  }

  function schedule(): void {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply, { once: true });
    else apply();
  }

  void readSettings(storage.sync()).then(({ settings: s }) => {
    settings = s;
    schedule();
  });

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync" && areaName !== "local") return;
    if (!isSettingsChange(Object.keys(changes))) return;
    void readSettings(storage.sync()).then(({ settings: s }) => {
      settings = s;
      apply();
    });
  });
}

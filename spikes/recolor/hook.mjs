// Approach 1 spike: wrap CanvasRenderingContext2D so PDF.js draws with themed
// colors directly (the doq technique, minimal version).

export function installHook(mapStyle, { dim = 0.85 } = {}) {
  const proto = CanvasRenderingContext2D.prototype;
  const state = { enabled: true, map: mapStyle, styleSets: 0, drawImages: 0, gradients: 0 };
  for (const prop of ["fillStyle", "strokeStyle"]) {
    const { get, set } = Object.getOwnPropertyDescriptor(proto, prop);
    Object.defineProperty(proto, prop, {
      configurable: true,
      get() { return get.call(this); },
      set(v) {
        if (state.enabled && typeof v === "string") {
          state.styleSets++;
          return set.call(this, state.map(v));
        }
        if (typeof v !== "string") state.gradients++;
        return set.call(this, v);
      },
    });
  }
  const drawImage = proto.drawImage;
  proto.drawImage = function (img, ...rest) {
    // Page images arrive as ImageBitmap (decoded in the worker) or as a
    // temporary canvas; PDF.js' own groups/masks are canvases too, which is
    // the ambiguity this approach has to live with.
    if (state.enabled && typeof ImageBitmap !== "undefined" && img instanceof ImageBitmap) {
      state.drawImages++;
      const f = this.filter;
      this.filter = `brightness(${dim}) contrast(0.92)`;
      const r = drawImage.call(this, img, ...rest);
      this.filter = f;
      return r;
    }
    return drawImage.call(this, img, ...rest);
  };
  return state;
}

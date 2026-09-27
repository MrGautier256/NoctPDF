// Approach 2 spike: post-process a rendered page canvas with one shared
// WebGL2 context. Colors go through a 3D LUT; image rectangles (from PDF.js'
// own CanvasImagesTracker) get an image policy instead.

const MAX_RECTS = 64;
const VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos;
  gl_Position = vec4(aPos.x * 2.0 - 1.0, 1.0 - aPos.y * 2.0, 0.0, 1.0);
}`;
const FS = `#version 300 es
precision highp float;
precision highp sampler3D;
uniform sampler2D uSrc;
uniform sampler3D uLut;
uniform float uLutN;
uniform int uCount;
uniform vec3 uRectU[${MAX_RECTS}];
uniform vec3 uRectV[${MAX_RECTS}];
uniform int uMode[${MAX_RECTS}];
uniform float uDim;
uniform vec2 uSplit; // x: compare split position (0 = off), y: unused
in vec2 vUv;
out vec4 outColor;

vec3 lut(vec3 c) {
  return texture(uLut, c * ((uLutN - 1.0) / uLutN) + 0.5 / uLutN).rgb;
}

void main() {
  vec4 src = texture(uSrc, vUv);
  if (vUv.x < uSplit.x) { outColor = src; return; }
  int mode = 2; // 0 keep, 1 dim, 2 recolor, 3 grayscale
  vec3 p = vec3(vUv, 1.0);
  for (int i = 0; i < ${MAX_RECTS}; i++) {
    if (i >= uCount) break;
    float u = dot(p, uRectU[i]);
    float v = dot(p, uRectV[i]);
    if (u >= 0.0 && u <= 1.0 && v >= 0.0 && v <= 1.0) mode = uMode[i];
  }
  vec3 c = src.rgb;
  if (mode == 2) c = lut(c);
  else if (mode == 1) c = mix(vec3(0.5), c, 0.92) * uDim;
  else if (mode == 3) c = vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))) * uDim;
  outColor = vec4(c, 1.0);
}`;

export class ShaderRecolorer {
  constructor() {
    this.canvas = new OffscreenCanvas(1, 1);
    const gl = (this.gl = this.canvas.getContext("webgl2", {
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      antialias: false,
    }));
    if (!gl) throw new Error("WebGL2 unavailable");
    const prog = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]]) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      gl.attachShader(prog, sh);
    }
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    this.prog = prog;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.srcTex = gl.createTexture();
    this.lutTex = gl.createTexture();
    this.u = name => gl.getUniformLocation(prog, name);
    gl.uniform1i(this.u("uSrc"), 0);
    gl.uniform1i(this.u("uLut"), 1);
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    this.renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "unknown";
  }

  setLut({ n, data }) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, n, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_3D, p, gl.LINEAR);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, p, gl.CLAMP_TO_EDGE);
    gl.uniform1f(this.u("uLutN"), n);
  }

  /**
   * @param source canvas or ImageBitmap holding the original page pixels
   * @param rects [{p: [x1,y1,x2,y2,x3,y3] normalized, mode}]
   * @returns the OffscreenCanvas with the recolored result (valid until next call)
   */
  process(source, rects, { dim = 0.85, split = 0 } = {}) {
    const gl = this.gl;
    const { width, height } = source;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const n = Math.min(rects.length, MAX_RECTS);
    const U = new Float32Array(MAX_RECTS * 3), V = new Float32Array(MAX_RECTS * 3);
    const M = new Int32Array(MAX_RECTS);
    for (let i = 0; i < n; i++) {
      const [x1, y1, x2, y2, x3, y3] = rects[i].p;
      const e1x = x2 - x1, e1y = y2 - y1, e2x = x3 - x1, e2y = y3 - y1;
      const det = e1x * e2y - e1y * e2x || 1e-9;
      U.set([e2y / det, -e2x / det, (-x1 * e2y + y1 * e2x) / det], i * 3);
      V.set([-e1y / det, e1x / det, (x1 * e1y - y1 * e1x) / det], i * 3);
      M[i] = rects[i].mode;
    }
    gl.uniform1i(this.u("uCount"), n);
    gl.uniform3fv(this.u("uRectU"), U);
    gl.uniform3fv(this.u("uRectV"), V);
    gl.uniform1iv(this.u("uMode"), M);
    gl.uniform1f(this.u("uDim"), dim);
    gl.uniform2f(this.u("uSplit"), split, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }
}

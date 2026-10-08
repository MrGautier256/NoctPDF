/**
 * WebGL2 post-processing recolorer: the phase 0-validated "approach 2"
 * (docs/ADR-001-recoloration.md). Ported from spikes/recolor/shader.mjs,
 * with two phase 2 additions: a "blend" image mode (image white fades to the
 * theme background, no hue inversion) and a per-rect levels stretch for
 * scanned pages (src/color/scan-normalize.ts), applied before the LUT lookup.
 *
 * Not unit tested: it needs a real WebGL2 context, which Vitest's node
 * environment does not provide. The per-rect inside-test math it uses
 * (rectBasis) and the color model it samples (buildLut) are both tested on
 * their own in this directory and in src/color/.
 */
import { rectBasis } from "./image-rects";
import type { ImageRect } from "./types";

const MAX_RECTS = 64;

const VERTEX_SHADER = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos;
  gl_Position = vec4(aPos.x * 2.0 - 1.0, 1.0 - aPos.y * 2.0, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler3D;
uniform sampler2D uSrc;
uniform sampler3D uLut;
uniform float uLutN;
uniform int uCount;
uniform vec3 uRectU[${MAX_RECTS}];
uniform vec3 uRectV[${MAX_RECTS}];
uniform int uMode[${MAX_RECTS}];
uniform vec2 uStretch[${MAX_RECTS}]; // x: lo, y: hi (levels stretch before the LUT, scanned pages)
uniform float uDim;
uniform vec3 uBg; // theme background, for "blend" images
uniform vec2 uSplit; // x: compare split position (0 = off)
in vec2 vUv;
out vec4 outColor;

vec3 lut(vec3 c) {
  return texture(uLut, c * ((uLutN - 1.0) / uLutN) + 0.5 / uLutN).rgb;
}

void main() {
  vec4 src = texture(uSrc, vUv);
  if (vUv.x < uSplit.x) { outColor = src; return; }
  int mode = 2; // 0 keep, 1 dim, 2 recolor, 3 grayscale, 4 blend
  vec2 stretch = vec2(0.0, 1.0);
  vec3 p = vec3(vUv, 1.0);
  for (int i = 0; i < ${MAX_RECTS}; i++) {
    if (i >= uCount) break;
    float u = dot(p, uRectU[i]);
    float v = dot(p, uRectV[i]);
    if (u >= 0.0 && u <= 1.0 && v >= 0.0 && v <= 1.0) {
      mode = uMode[i];
      stretch = uStretch[i];
    }
  }
  vec3 c = src.rgb;
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  if (mode == 2) {
    vec3 stretched = clamp((c - stretch.x) / max(stretch.y - stretch.x, 0.0001), 0.0, 1.0);
    c = lut(stretched);
  } else if (mode == 1) {
    c = mix(vec3(0.5), c, 0.92) * uDim;
  } else if (mode == 3) {
    c = vec3(lum) * uDim;
  } else if (mode == 4) {
    c = mix(c, uBg, smoothstep(0.7, 1.0, lum));
  }
  outColor = vec4(c, 1.0);
}`;

export interface LevelsStretch {
  lo: number;
  hi: number;
}

export interface ProcessOptions {
  /** Brightness factor for "dim"/"grayscale" images, 1 = unchanged. */
  dim?: number;
  /** Theme background, 0..1 RGB, used by the "blend" image mode. */
  bg?: readonly [number, number, number];
  /** 0..1 fraction of the width to leave untouched (the "compare" peek mode), 0 disables it. */
  split?: number;
  /** Per-rect levels stretch (index-aligned with `rects`), for scanned pages. */
  stretches?: ReadonlyArray<LevelsStretch | undefined>;
}

export class ShaderRecolorer {
  readonly canvas: OffscreenCanvas;
  readonly gl: WebGL2RenderingContext;
  readonly renderer: string;
  private readonly program: WebGLProgram;
  private readonly srcTex: WebGLTexture;
  private readonly lutTex: WebGLTexture;
  private readonly uniform: (name: string) => WebGLUniformLocation | null;

  constructor() {
    this.canvas = new OffscreenCanvas(1, 1);
    const gl = this.canvas.getContext("webgl2", {
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      antialias: false,
    });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;

    const program = gl.createProgram();
    for (const [type, src] of [
      [gl.VERTEX_SHADER, VERTEX_SHADER],
      [gl.FRAGMENT_SHADER, FRAGMENT_SHADER],
    ] as const) {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) ?? "shader compile failed");
      }
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? "program link failed");
    }
    gl.useProgram(program);
    this.program = program;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    this.srcTex = gl.createTexture();
    this.lutTex = gl.createTexture();
    this.uniform = name => gl.getUniformLocation(program, name);
    gl.uniform1i(this.uniform("uSrc"), 0);
    gl.uniform1i(this.uniform("uLut"), 1);

    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    this.renderer = dbg ? (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string) : "unknown";
  }

  setLut({ n, data }: { n: number; data: Uint8Array }): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, n, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_3D, p, gl.LINEAR);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) {
      gl.texParameteri(gl.TEXTURE_3D, p, gl.CLAMP_TO_EDGE);
    }
    gl.uniform1f(this.uniform("uLutN"), n);
  }

  /** @param source the original page canvas/bitmap; @returns this.canvas, valid until the next call */
  process(
    source: TexImageSource & { width: number; height: number },
    rects: readonly ImageRect[],
    { dim = 0.85, bg = [0, 0, 0], split = 0, stretches = [] }: ProcessOptions = {},
  ): OffscreenCanvas {
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

    const count = Math.min(rects.length, MAX_RECTS);
    const rectU = new Float32Array(MAX_RECTS * 3);
    const rectV = new Float32Array(MAX_RECTS * 3);
    const modes = new Int32Array(MAX_RECTS);
    const stretch = new Float32Array(MAX_RECTS * 2);
    for (let i = 0; i < stretch.length; i += 2) stretch[i + 1] = 1; // default hi=1, lo=0: a no-op stretch
    for (let i = 0; i < count; i++) {
      const { u, v } = rectBasis(rects[i]!.p);
      rectU.set(u, i * 3);
      rectV.set(v, i * 3);
      modes[i] = rects[i]!.mode;
      const s = stretches[i];
      if (s) stretch.set([s.lo, s.hi], i * 2);
    }
    gl.uniform1i(this.uniform("uCount"), count);
    gl.uniform3fv(this.uniform("uRectU"), rectU);
    gl.uniform3fv(this.uniform("uRectV"), rectV);
    gl.uniform1iv(this.uniform("uMode"), modes);
    gl.uniform2fv(this.uniform("uStretch"), stretch);
    gl.uniform1f(this.uniform("uDim"), dim);
    gl.uniform3f(this.uniform("uBg"), bg[0], bg[1], bg[2]);
    gl.uniform2f(this.uniform("uSplit"), split, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }
}

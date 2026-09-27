// Samples fixed points of the overlay screenshots (sample.pdf at 100%, 1200x900).
import { PNG } from "pngjs";
import { readFileSync, readdirSync, existsSync } from "node:fs";
const points = {
  toolbar: [600, 28], surround: [320, 600], sidebar: [150, 600], pageWhite: [700, 640],
  bodyText: [430, 190], blackRamp: [1060, 580], photoSky: [450, 710], sun: [680, 750],
};
for (const b of (process.argv[2] ?? "chrome,opera,edge").split(",")) {
  const dir = new URL(`../out/overlay/${b}/`, import.meta.url);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter(f => f.endsWith(".png"))) {
    const png = PNG.sync.read(readFileSync(new URL(f, dir)));
    const at = ([x, y]) => { const i = (y * png.width + x) * 4; return "#" + [0, 1, 2].map(k => png.data[i + k].toString(16).padStart(2, "0")).join(""); };
    console.log(b.padEnd(7), f.padEnd(17), Object.entries(points).map(([k, p]) => `${k}=${at(p)}`).join(" "));
  }
}

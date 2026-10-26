// Frame-by-frame renderer: loads src/scene/index.html in headless Chrome, steps the scene clock
// at 30 fps, and pipes the screenshots into ffmpeg together with the edited narration.
//
//   node src/render/render.mjs                      full render -> output/persian-setuid-assignment.mp4
//   node src/render/render.mjs --stills 12,95.5     PNG stills of single moments -> build/stills/
//   node src/render/render.mjs --from 100 --to 130  render only a time range (for checks)
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FPS = 30;
const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf("--" + name); return i >= 0 ? argv[i + 1] : fallback; };

const CHROME = process.env.CHROME_PATH
  || ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(existsSync);
if (!CHROME) throw new Error("No Chrome/Chromium found; set CHROME_PATH");

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none", "--allow-file-access-from-files", "--hide-scrollbars"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
let failed = false;
page.on("pageerror", (e) => { failed = true; console.error("page error:", e.message); });
page.on("console", (m) => { if (m.type() === "error") { failed = true; console.error("console error:", m.text()); } });
await page.goto(pathToFileURL(path.join(ROOT, "src/scene/index.html")).href);
await page.evaluate(() => window.__ready);
const duration = await page.evaluate(() => window.TIMELINE.duration);
const shot = () => page.screenshot({ type: "png", optimizeForSpeed: true });

if (opt("stills")) {
  const dir = path.join(ROOT, "build/stills");
  mkdirSync(dir, { recursive: true });
  for (const t of opt("stills").split(",").map(Number)) {
    await page.evaluate((x) => window.renderAt(x), t);
    const file = path.join(dir, `still-${t.toFixed(2).padStart(7, "0")}.png`);
    await page.screenshot({ path: file, type: "png" });
    console.log(file);
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
}

const from = Number(opt("from", 0));
const to = Math.min(Number(opt("to", duration)), duration);
const first = Math.round(from * FPS);
const total = Math.ceil(to * FPS) - first;
const outFile = path.resolve(ROOT, opt("out", "output/persian-setuid-assignment.mp4"));
mkdirSync(path.dirname(outFile), { recursive: true });

const ffArgs = [
  "-y", "-hide_banner", "-loglevel", "error",
  "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
  "-ss", String(first / FPS), "-i", path.join(ROOT, "build/audio/final.wav"),
  "-map", "0:v", "-map", "1:a",
  "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
  "-c:v", "libx264", "-preset", "medium", "-crf", opt("crf", "17"), "-profile:v", "high", "-level", "4.1", "-r", String(FPS), "-g", "60",
  "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
  "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
  "-frames:v", String(total), "-t", String(total / FPS), "-movflags", "+faststart", outFile,
];
const ff = spawn("ffmpeg", ffArgs, { stdio: ["pipe", "inherit", "inherit"] });
const ffDone = new Promise((resolve, reject) => { ff.on("exit", (c) => (c === 0 ? resolve() : reject(new Error("ffmpeg exited " + c)))); });
ff.stdin.on("error", () => {});

let lastHash = null, lastBuf = null, unique = 0;
const started = Date.now();
for (let n = 0; n < total; n++) {
  const t = (first + n) / FPS;
  let hash;
  for (let attempt = 0; ; attempt++) {
    try { hash = await page.evaluate((x) => window.renderAt(x), t); break; }
    catch (e) { if (attempt >= 2) throw e; console.error(`retrying frame at t=${t.toFixed(3)}: ${e.message.split("\n")[0]}`); }
  }
  if (hash !== lastHash) { lastBuf = await shot(); lastHash = hash; unique++; }
  if (!ff.stdin.write(lastBuf)) await once(ff.stdin, "drain");
  if (n % 300 === 299 || n === total - 1) {
    const done = n + 1, el = (Date.now() - started) / 1000;
    console.log(`frame ${done}/${total}  unique ${unique}  elapsed ${el.toFixed(0)}s  eta ${(el / done * (total - done)).toFixed(0)}s`);
  }
}
ff.stdin.end();
await ffDone;
await browser.close();
console.log(`wrote ${path.relative(ROOT, outFile)}  frames=${total}  unique=${unique}`);
process.exit(failed ? 1 : 0);

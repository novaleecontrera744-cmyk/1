"use strict";
/* Scene registry, header, subtitle band and the single entry point used by the renderer. */
const SCENES = [];
function defineScene(def) { SCENES.push(def); }

const SCENE_TITLES = [
  "مقدمه", "اختیار سرویس و مجوز کاربر", "هویت و سیاست دسترسی", "تغییر هویت (credential)",
  "مدل مستقل و مقایسه", "شاهد کاهش‌یافته", "نتایج واقعی آزمون",
];

let hdr, subsEl, notesEl, scenesEl, chipEl, dotsEl;
let lastChip = -1, lastSub = -2;

function subHtml(line) {
  const re = /[A-Za-z0-9_]+(?:[.:\/\-][A-Za-z0-9_]+)*(?: [A-Za-z0-9_]+(?:[.:\/\-][A-Za-z0-9_]+)*)*/g;
  let out = "", last = 0, m;
  while ((m = re.exec(line))) {
    out += esc(line.slice(last, m.index)) + `<bdi class="en">${esc(m[0])}</bdi>`;
    last = m.index + m[0].length;
  }
  return out + esc(line.slice(last));
}

function buildAll() {
  const stage = document.getElementById("stage");
  hdr = document.getElementById("hdr"); subsEl = document.getElementById("subs"); notesEl = document.getElementById("notes");
  scenesEl = document.getElementById("scenes");
  chipEl = hdr.querySelector(".chip"); dotsEl = hdr.querySelector(".dots");
  dotsEl.innerHTML = SCENES.map(() => "<i></i>").join("");
  SCENES.forEach((sc, i) => {
    sc.root = h("div", { cls: "scene", id: "scene" + (i + 1) });
    scenesEl.append(sc.root);
    sc.build(sc.root, notesEl);
  });
}

function renderAt(t) {
  let current = 0;
  SCENES.forEach((sc, i) => {
    const s = i === 0 ? -10 : sc.start, e = i === SCENES.length - 1 ? 1e6 : sc.end;
    if (t >= s && t < e) current = i;
    const op = R(t, s - 0.3, s + 0.3) * (1 - R(t, e - 0.3, e + 0.3));
    sc.root.style.opacity = String(q(op));
    sc.root.style.visibility = op <= 0.002 ? "hidden" : "visible";
    if (op > 0.002) sc.update(t, op);
  });
  if (current !== lastChip) {
    lastChip = current;
    chipEl.innerHTML = `<span class="num">${current + 1}</span><span>${SCENE_TITLES[current]}</span>`;
    [...dotsEl.children].forEach((d, i) => d.classList.toggle("on", i <= current));
  }
  chipEl.style.opacity = current === 0 && t < SCENES[1].start - 0.5 ? "0" : "1";
  const cue = TL.cues.find((c) => t >= c.start && t < c.end);
  const idx = cue ? cue.n : -1;
  if (idx !== lastSub) {
    lastSub = idx;
    subsEl.innerHTML = cue ? `<div class="box">${cue.lines.map((l) => `<span class="ln">${subHtml(l)}</span>`).join("")}</div>` : "";
  }
  return hashState();
}

function hashState() {
  const s = document.getElementById("stage").innerHTML;
  let hsh = 2166136261;
  for (let i = 0; i < s.length; i++) { hsh ^= s.charCodeAt(i); hsh = Math.imul(hsh, 16777619) >>> 0; }
  return hsh.toString(16) + ":" + s.length;
}

window.__ready = document.fonts.ready.then(() => { buildAll(); window.renderAt = renderAt; return true; });

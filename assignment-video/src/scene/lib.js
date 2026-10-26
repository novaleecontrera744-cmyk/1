"use strict";
/* Deterministic helpers: every visual state is a pure function of the timeline time t. */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ramp = (t, a, b) => clamp((t - a) / Math.max(1e-6, b - a));
const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
const lerp = (a, b, p) => a + (b - a) * p;
/** 0 -> 1 between a and b with easing. */
const R = (t, a, b = a + 0.45) => ease(ramp(t, a, b));
/** 1 inside [a, b] with eased edges of length d. */
const win = (t, a, b, d = 0.4) => Math.min(R(t, a, a + d), 1 - R(t, b, b + d));
const q = (v, n = 3) => Math.round(v * 10 ** n) / 10 ** n;

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
/** Inline code / identifier span, always left-to-right. */
const E = (s, cls = "") => `<bdi class="en ${cls}">${esc(s)}</bdi>`;
/** Persian text with {{latin}} runs isolated as LTR. */
function fa(s) {
  return s.split(/(\{\{.*?\}\})/g).map((p) => (p.startsWith("{{") ? E(p.slice(2, -2)) : p)).join("");
}

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "cls") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k === "style") Object.assign(el.style, v);
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid);
  return el;
}
const px = (n) => `${n}px`;
function box(x, y, w, hgt) { const s = { left: px(x), top: px(y) }; if (w != null) s.width = px(w); if (hgt != null) s.height = px(hgt); return s; }

/** Apply opacity / translate / scale with quantised values so identical states serialise identically. */
function put(el, { op = 1, x = 0, y = 0, s = 1 } = {}) {
  el.style.opacity = String(q(op));
  el.style.visibility = op <= 0.002 ? "hidden" : "visible";
  el.style.transform = x === 0 && y === 0 && s === 1 ? "" : `translate(${q(x, 1)}px, ${q(y, 1)}px) scale(${q(s)})`;
}
/** Fade + rise-in helper driven by time. */
function appear(el, t, a, b = Infinity, { dy = 16, dx = 0, d = 0.45 } = {}) {
  const p = win(t, a, b, d);
  put(el, { op: p, x: (1 - p) * dx, y: (1 - p) * dy });
  return p;
}

/* ---------- timeline anchors (derived from the aligned corrected subtitles) ---------- */
const TL = window.TIMELINE;
const A = {
  cue(id) { const t = TL.tokens.find((k) => k.id === id); if (!t) throw new Error("no cue " + id); return t.start; },
  cueEnd(id) { const ts = TL.tokens.filter((k) => k.id === id); return ts[ts.length - 1].end; },
  word(re, after = 0) { const t = TL.tokens.find((k) => k.start >= after && re.test(k.text)); if (!t) throw new Error("no word " + re); return t.start; },
  wordEnd(re, after = 0) { const t = TL.tokens.find((k) => k.start >= after && re.test(k.text)); if (!t) throw new Error("no word " + re); return t.end; },
  duration: TL.duration,
};

/* ---------- components ---------- */
function CodePanel(parent, { id, x, y, w, size = 26, rangeLabel = true }) {
  const ex = DATA.excerpts[id];
  const real = ex.rows.filter((r) => !r.gap);
  const label = rangeLabel ? `lines ${real[0].n}\u2013${real[real.length - 1].n}` : "";
  const root = h("div", { cls: "code", style: box(x, y, w) });
  root.append(h("div", { cls: "fname" }, h("span", { cls: "dot" }), h("span", { html: esc(ex.file) }), h("span", { cls: "rng", html: label })));
  const body = h("div", { cls: "body", style: { fontSize: px(size), lineHeight: "1.5" } });
  const lines = {};
  for (const row of ex.rows) {
    if (row.gap) { body.append(h("div", { cls: "cl gap" }, h("span", { cls: "ln", html: "\u00b7\u00b7\u00b7" }), h("span", { cls: "cx", html: "" }))); continue; }
    const cx = h("span", { cls: "cx", html: row.tokens.map(([c, t]) => `<span class="${c}">${esc(t)}</span>`).join("") || " " });
    const el = h("div", { cls: "cl" }, h("span", { cls: "ln", html: String(row.n) }), cx);
    body.append(el); lines[row.n] = { el, cx };
  }
  root.append(body); parent.append(root);
  const api = {
    root, lines,
    /** intensities: {lineNumber: 0..1}; unlisted lines are dimmed. */
    light(intensities, dim = 0.36) {
      for (const [n, ln] of Object.entries(lines)) {
        const v = clamp(intensities[n] || 0);
        ln.el.style.opacity = String(q(lerp(dim, 1, v)));
        ln.el.style.background = v > 0.01 ? `rgba(45,212,191,${q(0.15 * v)})` : "";
        ln.el.style.borderLeftColor = v > 0.01 ? `rgba(45,212,191,${q(v)})` : "transparent";
      }
    },
    tok(n, text) { return [...lines[n].cx.querySelectorAll("span")].find((s) => s.textContent.trim() === text) || null; },
    mark(n, text, v, kind = "") {
      const s = api.tok(n, text); if (!s) throw new Error(`token ${text} not in line ${n}`);
      s.style.background = v > 0.01 ? (kind === "red" ? `rgba(248,113,113,${q(0.34 * v)})` : kind === "grn" ? `rgba(74,222,128,${q(0.3 * v)})` : `rgba(245,185,66,${q(0.32 * v)})`) : "";
      s.style.borderRadius = "4px";
    },
    height() { return root.offsetHeight; },
  };
  return api;
}

function JsonPanel(parent, { name, x, y, w, size = 25 }) {
  const ev = DATA.evidence[name];
  const root = h("div", { cls: "code", style: box(x, y, w) });
  root.append(h("div", { cls: "fname" }, h("span", { cls: "dot" }), h("span", { html: esc(ev.file) }), h("span", { cls: "rng", html: "" })));
  const body = h("div", { cls: "body", style: { fontSize: px(size), lineHeight: "1.5" } });
  const keys = {};
  ev.lines.forEach((ln, i) => {
    const m = ln.text.match(/"([a-z_]+)":/);
    const cx = h("span", { cls: "cx", html: ln.tokens.map(([c, t]) => `<span class="${c}">${esc(t)}</span>`).join("") });
    const el = h("div", { cls: "cl" }, h("span", { cls: "ln", style: { width: "28px", paddingRight: "8px" }, html: "" }), cx);
    body.append(el); keys[m[1]] = { el, cx };
  });
  root.append(body); parent.append(root);
  return {
    root, keys,
    light(intensities, dim = 0.4) {
      for (const [k, ln] of Object.entries(keys)) {
        const v = clamp(intensities[k] || 0);
        ln.el.style.opacity = String(q(lerp(dim, 1, v)));
        ln.el.style.background = v > 0.01 ? `rgba(45,212,191,${q(0.15 * v)})` : "";
        ln.el.style.borderLeftColor = v > 0.01 ? `rgba(45,212,191,${q(v)})` : "transparent";
      }
    },
  };
}

/** Three-field credential register: RUID / EUID / SUID. */
function Register(parent, { x, y, w, who, color = "var(--teal2)" }) {
  const root = h("div", { cls: "reg", style: box(x, y, w, 258) });
  root.append(h("div", { cls: "who", html: `<span style="color:${color}">${esc(who)}</span>` }));
  const names = [["RUID", "real user ID"], ["EUID", "effective user ID"], ["SUID", "saved set-user-ID"]];
  const cells = names.map(([a, b]) => {
    const lab = h("div", { cls: "lab", html: a });
    const val = h("div", { cls: "val", html: "" });
    const full = h("div", { cls: "full", html: b });
    return { el: h("div", { cls: "cell" }, lab, val, full), val };
  });
  root.append(h("div", { cls: "cells" }, cells.map((c) => c.el)));
  const state = h("div", { cls: "state", html: "" });
  root.append(state); parent.append(root);
  return {
    root,
    /** vals: three numbers; flash: three 0..1 pulse amounts; service uid (999) is amber. */
    set(vals, flash = [0, 0, 0], text = "", textColor = "var(--muted)") {
      cells.forEach((c, i) => {
        c.val.textContent = String(vals[i]);
        c.val.style.color = vals[i] === 999 ? "var(--amber)" : "var(--teal2)";
        c.el.style.borderColor = flash[i] > 0.01 ? `rgba(45,212,191,${q(0.25 + 0.75 * flash[i])})` : "";
        c.el.style.background = flash[i] > 0.01 ? `rgba(45,212,191,${q(0.18 * flash[i])})` : "";
      });
      state.innerHTML = text; state.style.color = textColor;
    },
  };
}

function Term(parent, { x, y, w, hgt, label, file }) {
  const root = h("div", { cls: "term", style: box(x, y, w, hgt) });
  root.append(h("div", { cls: "bar" }, h("span", { cls: "lbl", html: label }), h("span", { cls: "file", html: esc(file) })));
  const scroll = h("div", { cls: "scroll" });
  root.append(h("div", { cls: "view" }, scroll)); parent.append(root);
  return { root, scroll, setScroll(yv) { scroll.style.transform = `translateY(${q(-yv, 1)}px)`; } };
}

/** Rounded node used in diagrams. */
function Node(parent, { x, y, w, hgt, cls = "card", html = "" }) {
  const el = h("div", { cls, style: box(x, y, w, hgt), html }); parent.append(el); return el;
}

/** SVG arrow layer for a scene. Arrows are drawn with stroke-dashoffset so progress is time-driven. */
function ArrowLayer(parent) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", "1920"); svg.setAttribute("height", "1080"); svg.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;overflow:visible";
  const defs = document.createElementNS(NS, "defs");
  for (const [id, col] of [["teal", "#2dd4bf"], ["green", "#4ade80"], ["red", "#f87171"], ["amber", "#f5b942"], ["gray", "#8fa6af"]]) {
    const m = document.createElementNS(NS, "marker");
    m.setAttribute("id", "ah-" + id); m.setAttribute("viewBox", "0 0 10 10"); m.setAttribute("refX", "8"); m.setAttribute("refY", "5");
    m.setAttribute("markerWidth", "6"); m.setAttribute("markerHeight", "6"); m.setAttribute("orient", "auto-start-reverse");
    const p = document.createElementNS(NS, "path"); p.setAttribute("d", "M0,0 L10,5 L0,10 z"); p.setAttribute("fill", col); m.append(p); defs.append(m);
  }
  svg.append(defs); parent.append(svg);
  const colors = { teal: "#2dd4bf", green: "#4ade80", red: "#f87171", amber: "#f5b942", gray: "#8fa6af" };
  return {
    svg,
    arrow(d, color = "teal", { width = 5, dash = false } = {}) {
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", d); path.setAttribute("fill", "none"); path.setAttribute("stroke", colors[color]); path.setAttribute("stroke-width", String(width));
      path.setAttribute("stroke-linecap", "round"); path.setAttribute("stroke-linejoin", "round"); path.setAttribute("marker-end", `url(#ah-${color})`);
      path.setAttribute("pathLength", "1"); svg.append(path);
      return { path, set(p, op = 1) { path.style.strokeDasharray = dash ? "0.03 0.02" : "1 1"; path.style.strokeDashoffset = String(q(1 - p)); path.style.opacity = String(q(op)); path.setAttribute("marker-end", p >= 0.985 ? `url(#ah-${color})` : ""); } };
    },
  };
}

/* ---------- layout helpers shared by the scenes ---------- */
const END = 1e9;
/** Absolutely positioned text block; wrap Latin identifiers as {{identifier}} so they stay left-to-right. */
function Tx(parent, html, { x, y, w, size = 32, weight = 500, color = "", align = "right", cls = "", lh = "" } = {}) {
  const el = h("div", { cls: `abs fa${align === "center" ? " c" : ""} ${cls}`.trim(), style: { ...box(x, y, w), fontSize: px(size), fontWeight: String(weight) }, html });
  if (color) el.style.color = color;
  if (align === "left") el.style.textAlign = "left";
  if (lh) el.style.lineHeight = lh;
  parent.append(el);
  return el;
}
const pill = (html, kind = "tl") => `<span class="pill ${kind}">${html}</span>`;
const chip = (text, kind = "") => `<span class="chip2 ${kind}">${esc(text)}</span>`;
/** Evidence label: marks panels that redraw a recorded result instead of showing a live terminal. */
function Tag(parent, { x, y, text = "بازنمایی خروجی ثبت‌شده" }) {
  const el = h("div", { cls: "tag", style: { left: px(x), top: px(y) }, html: text });
  parent.append(el);
  return el;
}

/** Syntax-coloured JSON fragments for terminal panels. */
const J = {
  k: (s) => `<span class="jk">"${esc(s)}"</span><span class="o">: </span>`,
  s: (s) => `<span class="s">"${esc(s)}"</span>`,
  n: (s) => `<span class="n">${esc(String(s))}</span>`,
  o: (s) => `<span class="o">${esc(s)}</span>`,
};

"use strict";
/* Scene 6 - the faulty local backend, the reducer, and the one-minimal two-operation witness. */
(() => {
  const c = A.cue;
  const W = DATA.mutant.violation, TR = DATA.traces;
  const el = {}, P = {};
  const X = 980, WD = 880, HALF = 430;
  const show = (p, v) => put(p.root, { op: v, y: (1 - v) * 10 });
  const kv = (k, v, comma) => `${J.k(k)}${J.s(v)}${comma ? J.o(",") : ""}`;
  const opText = (op) => Object.keys(op).map((k, i, a) => kv(k, op[k], i < a.length - 1)).join("\n");
  const arch = (owner, bad) => `${J.k("archives")}${J.o("{ ")}${J.k("a7")}${J.o("{")}\n  ${J.k("content")}${J.s("…")}${J.o(",")}\n  ${J.k("dataset")}${J.s("A")}${J.o(",")}\n  ${J.k("owner")}<span class="${bad ? "bad" : "good"}">${J.s(owner)}</span>${J.o(" } }")}`;
  const slim = (node) => { node.style.padding = "0 24px"; return node; };
  defineScene({
    start: c("c66"), end: c("c80"),
    build(root) {
      P.red = CodePanel(root, { id: "ts_reduce", x: 60, y: 150, w: 900, size: 22 });
      P.model = CodePanel(root, { id: "model_run", x: 60, y: 150, w: 900, size: 23 });
      el.tag = Tag(root, { x: X, y: 108 });
      el.mut = Node(root, { x: X, y: 150, w: WD, hgt: 152, cls: "card bad", html:
        `<div class="fa" style="font-size:31px;font-weight:700">${fa("نسخهٔ خراب آزمایشی ({{mutant_backend}})")}</div>` +
        `<div class="fa" style="font-size:27px;margin-top:2px">آرشیو را اشتباهی به نام اجراکننده ثبت می‌کند</div>` +
        `<div class="sub2" style="font-size:22px">فقط برای امتحان آزمون؛ پیاده‌سازی نهایی نیست</div>` });
      el.strip = Node(root, { x: X, y: 314, w: WD, hgt: 244, cls: "card", html: `<div class="fa" style="font-size:30px;font-weight:600">${fa("دنبالهٔ شمارهٔ {{0}} در {{traces.json}}")}</div>` });
      el.sq = TR.first_ops.map((name, i) => {
        const n = i + 1, keep = TR.witness_positions.includes(n);
        const s = h("div", { cls: "abs", style: { left: px(24 + i * 53), top: "88px", width: "46px", height: "46px", borderRadius: "10px", border: "2px solid var(--line)", background: "#0b141a", font: "600 21px var(--mono)", display: "flex", alignItems: "center", justifyContent: "center", color: "#cfe7ea", direction: "ltr" }, html: String(n) });
        el.strip.append(s); return { s, keep };
      });
      let k = 0; el.sq.forEach((b) => { if (!b.keep) b.k = k++; });
      el.count = Tx(el.strip, "", { x: 24, y: 146, w: WD - 48, size: 40, weight: 700, align: "center" });
      el.note = Tx(el.strip, "نمایش شماتیک کاهش؛ عملیات باقی‌مانده: شمارهٔ 2 و 7 از دنبالهٔ اصلی", { x: 24, y: 200, w: WD - 48, size: 22, color: "var(--muted)", align: "center" });
      el.w1 = Term(root, { x: X, y: 314, w: HALF, hgt: 244, label: "عملیات 1", file: "enqueue" });
      el.w2 = Term(root, { x: X + 450, y: 314, w: HALF, hgt: 244, label: "عملیات 2", file: "run_worker" });
      for (const [w, i] of [[el.w1, 0], [el.w2, 1]]) { w.scroll.style.fontSize = "21px"; w.scroll.innerHTML = `<span class="ln2">${opText(W.trace[i])}</span>`; }
      el.x1 = Tx(el.w1.root, fa("بدون {{enqueue}}: کاری برای اجرا نیست"), { x: 12, y: 196, w: HALF - 24, size: 22, color: "var(--red)", align: "center" });
      el.x2 = Tx(el.w2.root, fa("بدون {{run_worker}}: آرشیوی ساخته نمی‌شود"), { x: 12, y: 196, w: HALF - 24, size: 22, color: "var(--red)", align: "center" });
      el.min = slim(Node(root, { x: X, y: 568, w: WD, hgt: 44, cls: "card good", html: `<div class="row2 fa" style="height:100%;justify-content:center;gap:16px;white-space:nowrap">${pill("one_minimal", "tl")}<span style="font-size:26px;font-weight:600">از این دو عملیات چیزی نمی‌شود کم کرد</span></div>` }));
      el.exp = Term(root, { x: X, y: 622, w: HALF, hgt: 192, label: "مدل · expected", file: "archives" });
      el.obs = Term(root, { x: X + 450, y: 622, w: HALF, hgt: 192, label: "نسخهٔ خراب · observed", file: "archives" });
      el.exp.scroll.style.fontSize = el.obs.scroll.style.fontSize = "20px";
      el.exp.scroll.innerHTML = `<span class="ln2">${arch("alice", false)}</span>`;
      el.obs.scroll.innerHTML = `<span class="ln2">${arch("carol", true)}</span>`;
      el.cls = slim(Node(root, { x: X, y: 826, w: WD, hgt: 62, cls: "card bad", html: `<div class="row2" style="height:100%;justify-content:center;gap:18px;white-space:nowrap"><span class="fa" style="font-size:28px;font-weight:600">اولین اختلاف</span>${chip(`class: [${W.class.join(", ")}]`, "deny")}</div>` }));
    },
    update(t) {
      const w2 = (a, b) => win(t, c(a) - 0.1, b === END ? END : c(b) - 0.1, 0.35);
      const on = (a, b) => win(t, c(a), b === END ? END : c(b), 0.3);
      show(P.red, Math.max(w2("c69", "c73"), w2("c76", END))); show(P.model, w2("c73", "c76"));
      let v = on("c69", "c71");
      P.red.light({ 235: v, 236: v, 237: v, 238: v, 239: v, 240: v, 241: v, 233: on("c76", END), 243: on("c76", END) }, lerp(0.8, 0.4, Math.max(v, on("c76", END))));
      v = on("c73", "c75"); P.model.light({ 112: v * 0.5, 113: v * 0.5, 114: v * 0.5, 118: v, 119: v }, lerp(0.8, 0.4, v));
      appear(el.tag, t, c("c71"), END, { dy: 0 });
      appear(el.mut, t, c("c66") - 0.1, END, { dy: 12 });
      const stripV = win(t, c("c69") - 0.1, c("c71") - 0.1, 0.35);
      put(el.strip, { op: stripV, y: (1 - stripV) * 12 });
      el.sq.forEach((b) => {
        const gone = b.keep ? 0 : R(t, c("c69") + 0.9 + b.k * 0.2, c("c69") + 1.3 + b.k * 0.2);
        const lit = b.keep ? R(t, c("c70") - 0.2, c("c70") + 0.4) : 0;
        b.s.style.opacity = String(q(1 - 0.82 * gone));
        b.s.style.borderColor = lit > 0.01 ? `rgba(45,212,191,${q(lit)})` : "";
        b.s.style.background = lit > 0.01 ? `rgba(45,212,191,${q(0.25 * lit)})` : "";
        b.s.style.color = lit > 0.5 ? "#fff" : "";
      });
      const left = TR.first_ops.length - Math.min(14, Math.max(0, Math.floor((t - (c("c69") + 0.9)) / 0.2) + 1));
      el.count.innerHTML = `<span class="mono" style="color:var(--teal2)">${t < c("c69") + 0.9 ? 16 : left}</span> <span class="fa">عملیات</span>`;
      appear(el.w1.root, t, c("c71") - 0.1, END, { dy: 12 }); appear(el.w2.root, t, c("c72") - 0.1, END, { dy: 12 });
      el.w1.root.style.borderColor = t >= c("c78") ? "var(--red)" : ""; el.w2.root.style.borderColor = t >= c("c79") ? "var(--red)" : "";
      put(el.x1, { op: win(t, c("c78"), END, 0.4) }); put(el.x2, { op: win(t, c("c79"), END, 0.4) });
      appear(el.min, t, c("c76") - 0.1, END, { dy: 10 });
      appear(el.exp.root, t, c("c73") - 0.1, END, { dy: 12 }); appear(el.obs.root, t, c("c74") - 0.1, END, { dy: 12 });
      appear(el.cls, t, c("c75") - 0.1, END, { dy: 10 });
    },
  });
})();

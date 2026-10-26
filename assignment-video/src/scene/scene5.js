"use strict";
/* Scene 5 - the independent model (policy_model.py) and the stateful comparison (test_stateful.py). */
(() => {
  const c = A.cue;
  const el = {}, P = {};
  const OPS = ["read_dataset", "enqueue", "grant", "revoke", "clone_job", "run_worker", "fetch_archive"];
  const COMPONENTS = ["result", "content", "jobs", "reads", "archives", "completion", "events"];
  const LIT = { result: "c58", jobs: "c59", reads: "c59", archives: "c60", completion: "c60", events: "c60" };
  const row = (ico, html, sub = "") => `<div class="row2" style="height:100%;gap:16px"><span class="ico ok" style="width:46px;height:46px;font-size:26px;flex:none">${ico}</span><div class="fa" style="flex:1"><div style="font-size:30px;font-weight:600">${html}</div>${sub ? `<div class="sub2" style="font-size:24px">${sub}</div>` : ""}</div></div>`;
  const head = (title, file, hgt = "100%") => `<div class="row2" style="height:${hgt};justify-content:space-between"><span class="fa" style="font-size:33px;font-weight:700">${title}</span>${chip(file, "tl")}</div>`;
  const X = 1080, W = 780;
  const show = (p, v) => put(p.root, { op: v, y: (1 - v) * 10 });
  defineScene({
    start: c("c48"), end: c("c66"),
    build(root) {
      el.q = Tx(root, "چطور ببینیم برنامه درست کار می‌کند یا نه؟", { x: 140, y: 400, w: 1640, size: 68, weight: 700, align: "center" });
      P.state = CodePanel(root, { id: "model_state", x: 60, y: 150, w: 980, size: 26 });
      P.run = CodePanel(root, { id: "model_run", x: 60, y: 150, w: 980, size: 25 });
      P.gen = CodePanel(root, { id: "ts_generate", x: 60, y: 150, w: 980, size: 28 });
      P.replay = CodePanel(root, { id: "ts_replay", x: 60, y: 150, w: 980, size: 25 });
      P.sym = CodePanel(root, { id: "ts_symbols", x: 60, y: 150, w: 980, size: 27 });
      el.mHead = Node(root, { x: X, y: 150, w: W, hgt: 84, cls: "card hl", html: head("مدل مستقل", "policy_model.py") });
      el.m1 = Node(root, { x: X, y: 250, w: W, hgt: 104, html: row("✓", "از کد سرویس استفاده نمی‌کند", fa("تنها import این فایل: {{from copy import deepcopy}}")) });
      el.m2 = Node(root, { x: X, y: 368, w: W, hgt: 104, html: row("✓", "مجوزها، کارها و آرشیوها را خودش نگه می‌دارد", fa("{{grants}} · {{jobs}} · {{archives}}")) });
      el.m3 = Node(root, { x: X, y: 486, w: W, hgt: 104, html: row("✓", "از روی قوانین، پاسخ درست هر درخواست را مشخص می‌کند", fa("{{allow}} / {{deny}}")) });
      el.a = Node(root, { x: X, y: 150, w: W, hgt: 372, cls: "card hl", html:
        `${head("ساخت دنباله‌ای از عملیات", "test_stateful.py", "56px")}` });
      el.aBody = h("div", { cls: "abs", style: { left: "0", right: "0", top: "100px", padding: "0 24px" }, html:
        `<div style="display:flex;flex-wrap:wrap;gap:10px;direction:ltr;font-size:30px;justify-content:flex-end">${OPS.map((o) => chip(o)).join("")}</div>` });
      el.a.append(el.aBody);
      el.a1 = Tx(el.a, fa("هر دنباله: {{5}} تا {{20}} عملیات"), { x: 24, y: 232, w: W - 48, size: 33, weight: 600 });
      el.a2 = Tx(el.a, "همه از state اولیه شروع می‌شوند", { x: 24, y: 292, w: W - 48, size: 33, weight: 600 });
      el.a1.style.left = el.a2.style.left = "24px";
      el.b = Node(root, { x: X, y: 150, w: W, hgt: 150, cls: "card", html:
        `<div class="fa" style="font-size:30px;font-weight:600;margin-bottom:12px">بعد از هر عملیات، جواب و وضعیت مقایسه می‌شود</div>` +
        `<div class="row2" style="justify-content:space-between;direction:ltr">${pill(fa("سرویس · {{ExportService}}"), "svc")}<span style="font-size:40px;color:var(--teal2)">⇄</span>${pill(fa("مدل · {{PolicyModel}}"), "tl")}</div>` });
      el.cc = Node(root, { x: X, y: 318, w: W, hgt: 270, cls: "card", html: `<div class="fa" style="font-size:30px;font-weight:600">فقط قبول و رد کافی نیست؛ این مؤلفه‌ها مقایسه می‌شوند</div>` });
      el.chips = COMPONENTS.map((n) => { const s = h("span", { cls: "chip2", html: esc(n), style: { fontSize: "27px", margin: "6px" } }); return s; });
      el.chipBox = h("div", { cls: "abs", style: { left: "24px", right: "24px", top: "84px", display: "flex", flexWrap: "wrap", direction: "ltr", justifyContent: "flex-end", gap: "4px" } });
      el.chips.forEach((s) => el.chipBox.append(s)); el.cc.append(el.chipBox);
      el.d = Node(root, { x: X, y: 606, w: W, hgt: 130, cls: "card", html: row("i", fa("اطلاعات سرویس فقط از پاسخ درخواست‌ها و تابع {{snapshot()}} گرفته می‌شود")) });
      el.e = Node(root, { x: X, y: 150, w: W, hgt: 450, cls: "card hl", html: "" });
      el.e1 = Tx(el.e, fa("شماره‌ها در مدل و سرویس فرق دارند"), { x: 24, y: 18, w: W - 48, size: 32, weight: 700 });
      el.e1b = Tx(el.e, `<div style="display:flex;gap:14px;direction:ltr;justify-content:flex-end;flex-wrap:wrap;font-size:27px">${chip("model-archive-N", "tl")}${chip("service: another id", "svc")}</div>`, { x: 24, y: 78, w: W - 48, size: 27 });
      el.e2 = Tx(el.e, "برای هر دو، برچسب ثابت می‌گذاریم", { x: 24, y: 190, w: W - 48, size: 32, weight: 700 });
      el.e2b = Tx(el.e, `<div style="display:flex;gap:14px;direction:ltr;justify-content:flex-end;font-size:34px">${chip("j2", "allow")}${chip("a7", "allow")}</div>`, { x: 24, y: 250, w: W - 48, size: 34 });
      el.e3 = Tx(el.e, "مقایسه به شماره‌ها وابسته نیست ✓", { x: 24, y: 380, w: W - 48, size: 34, weight: 700, color: "var(--green)" });
      for (const k of ["e1", "e1b", "e2", "e2b", "e3"]) el[k].style.left = "24px";
    },
    update(t) {
      const w2 = (a, b) => win(t, c(a) - 0.1, b === END ? END : c(b) - 0.1, 0.35);
      const on = (a, b) => win(t, c(a), b === END ? END : c(b), 0.3);
      put(el.q, { op: win(t, c("c48") - 0.2, c("c49") - 0.3, 0.4) });
      show(P.state, w2("c49", "c52")); show(P.run, w2("c52", "c53")); show(P.gen, w2("c53", "c56")); show(P.replay, w2("c56", "c63")); show(P.sym, w2("c63", END));

      let v = Math.max(on("c50", "c51"), on("c51", "c52"));
      P.state.light({ 6: on("c50", "c51"), 24: on("c51", "c52"), 25: on("c51", "c52"), 26: on("c51", "c52") }, lerp(0.8, 0.4, v));
      v = on("c52", "c53");
      P.run.light({ 112: v, 113: v, 114: v, 118: v, 119: v }, lerp(0.8, 0.4, v));
      v = Math.max(on("c54", "c55"), on("c55", "c56"));
      P.gen.light({ 83: on("c54", "c55"), 80: on("c55", "c56") }, lerp(0.8, 0.4, v));
      const m1 = on("c56", "c57"), m2 = on("c57", "c58"), m3 = on("c58", "c61"), m4 = on("c61", "c63");
      P.replay.light({ 209: m1, 211: m1, 213: Math.max(m2, m4), 214: Math.max(m2, m4), 215: m3, 216: m3 }, lerp(0.8, 0.4, Math.max(m1, m2, m3, m4)));
      P.replay.mark(213, "snapshot", m4); P.replay.mark(214, "snapshot", m4);
      v = Math.max(on("c64", "c65"), on("c65", END));
      P.sym.light({ 140: on("c64", "c65"), 141: on("c64", "c65"), 142: on("c64", "c65"), 143: on("c64", "c65"), 144: on("c64", "c65"), 146: on("c65", END), 147: on("c65", END) }, lerp(0.8, 0.4, v));

      appear(el.mHead, t, c("c49") - 0.1, c("c53") - 0.1, { dy: 12 });
      appear(el.m1, t, c("c50") - 0.1, c("c53") - 0.1, { dy: 12 }); appear(el.m2, t, c("c51") - 0.1, c("c53") - 0.1, { dy: 12 }); appear(el.m3, t, c("c52") - 0.1, c("c53") - 0.1, { dy: 12 });
      appear(el.a, t, c("c53") - 0.1, c("c56") - 0.1, { dy: 12 });
      put(el.a1, { op: win(t, c("c54") - 0.1, END, 0.4) }); put(el.a2, { op: win(t, c("c55") - 0.1, END, 0.4) });
      appear(el.b, t, c("c56") - 0.1, c("c63") - 0.1, { dy: 12 });
      appear(el.cc, t, c("c58") - 0.1, c("c63") - 0.1, { dy: 12 });
      el.chips.forEach((s, i) => { const k = LIT[COMPONENTS[i]]; const lit = k ? win(t, c(k), END, 0.3) : 0; s.className = "chip2" + (lit > 0.5 ? " tl" : ""); });
      appear(el.d, t, c("c61") - 0.1, c("c63") - 0.1, { dy: 12 });
      appear(el.e, t, c("c63") - 0.1, END, { dy: 12 });
      put(el.e1, { op: win(t, c("c63"), END, 0.4) }); put(el.e1b, { op: win(t, c("c63") + 0.8, END, 0.4) });
      put(el.e2, { op: win(t, c("c64"), END, 0.4) }); put(el.e2b, { op: win(t, c("c64") + 0.4, END, 0.4) });
      put(el.e3, { op: win(t, c("c65"), END, 0.4) });
    },
  });
})();

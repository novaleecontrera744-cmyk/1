"use strict";
/* Scene 7 - the actual recorded results: 9 public tests, 500 traces, seeds 1-3, reproducible trace file. */
(() => {
  const c = A.cue;
  const R_ = DATA.runs, M = R_["seed-14050714.json"].parsed, TR = DATA.traces;
  const el = {};
  const show = (e, v, dy = 10) => put(e.root || e, { op: v, y: (1 - v) * dy });
  const stat = (x, y, w, num, label, cls = "", extra = "") => Node(el.root, { x, y, w, hgt: 190, cls: "card " + cls, html:
    `<div class="mono" style="font-size:74px;font-weight:800;line-height:1.1;direction:ltr;text-align:right">${num}</div><div class="fa" style="font-size:28px;margin-top:6px">${label}</div>${extra}` });
  const bar = (n, color) => `<div style="margin-top:10px;height:14px;border-radius:7px;background:#16252d;direction:ltr"><div style="width:${(n / 500) * 100}%;height:100%;border-radius:7px;background:${color}"></div></div>`;
  defineScene({
    start: c("c80"), end: A.duration + 5,
    build(root) {
      el.root = root;
      const log = R_.log_lines;
      el.t1 = Term(root, { x: 60, y: 150, w: 1800, hgt: 560, label: "بازنمایی خروجی ثبت‌شده · unittest", file: "evidence/run-14050714.txt" });
      el.t1.scroll.style.fontSize = "21px";
      el.t1.scroll.innerHTML = log.slice(0, 14).map((l, i) => `<span class="ln2" data-i="${i}">${esc(l).replace(/ \.\.\. ok$/, ' ... <span class="ok">ok</span>').replace(/^(Ran 9 tests.*)$/, "<mark>$1</mark>").replace(/^OK$/, '<span class="ok">OK</span>') || " "}</span>`).join("");
      el.tl = [...el.t1.scroll.querySelectorAll(".ln2")];
      el.nine = Node(root, { x: 560, y: 726, w: 800, hgt: 160, cls: "card good", html: `<div class="row2" style="height:100%;justify-content:center;gap:28px"><span class="big allow" style="font-size:76px">9/9</span><span class="fa" style="font-size:38px;font-weight:700">تست عمومی پاس شد</span></div>` });
      el.tag2 = Tag(root, { x: 60, y: 108 });
      el.j = Term(root, { x: 60, y: 150, w: 860, hgt: 590, label: "بازنمایی خروجی ثبت‌شده · JSON", file: "seed-14050714.json" });
      el.j.scroll.style.fontSize = "27px";
      const L = (s) => `<span class="ln2">${s}</span>`;
      el.j.scroll.innerHTML = [
        L(J.o("{")),
        L(`  ${J.k("backend")}${J.s(M.backend)}${J.o(",")}`),
        L(`  ${J.k("seed")}${J.n(M.seed)}${J.o(",")}`),
        L(`  ${J.k("traces_generated")}<span data-k="gen">${J.n(M.traces_generated)}</span>${J.o(",")}`),
        L(`  ${J.k("coverage")}${J.o("{")}`),
        L(`    ${J.k("successful_worker_traces")}<span data-k="ok">${J.n(M.coverage.successful_worker_traces)}</span>${J.o(",")}`),
        L(`    ${J.k("denied_worker_traces")}<span data-k="deny">${J.n(M.coverage.denied_worker_traces)}</span>`),
        L(`  ${J.o("},")}`),
        L(`  ${J.k("datasets")}${J.o("{…},")}  ${J.k("grants")}${J.o("{…},")}`),
        L(`  ${J.k("violations")}<span data-k="viol">${J.o("[]")}</span>${J.o(",")}`),
        L(`  ${J.k("passed")}<span class="good" data-k="passed">true</span>`),
        L(J.o("}")),
      ].join("");
      el.keys = {}; el.j.scroll.querySelectorAll("[data-k]").forEach((s) => { el.keys[s.dataset.k] = s; });
      el.s500 = stat(1425, 150, 435, "500", "دنبالهٔ مختلف بررسی شد");
      el.s327 = stat(960, 150, 435, "327", fa("دنباله با {{run_worker}} موفق"), "", bar(327, "var(--green)"));
      el.s111 = stat(1425, 352, 435, "111", fa("دنباله با {{run_worker}} ردشده"), "", bar(111, "var(--red)"));
      el.s0 = stat(960, 352, 435, "0", "اختلاف بین مدل و سرویس", "good");
      el.s36 = Node(root, { x: 960, y: 554, w: 900, hgt: 112, html: `<div class="row2" style="height:100%;gap:22px"><span class="mono" style="font-size:54px;font-weight:800;direction:ltr">≈ 36 s</span><span class="fa" style="font-size:28px">زمان اجرا (گزارش‌شده)</span></div>` });
      el.s0.querySelector(".mono").style.color = "var(--green)";
      el.foot = Tx(root, "شمارش‌های 327 و 111 جدا از هم گزارش شده‌اند و ممکن است همپوشانی داشته باشند.", { x: 960, y: 690, w: 900, size: 25, color: "var(--muted)" });
      el.seeds = Term(root, { x: 60, y: 150, w: 860, hgt: 548, label: "بازنمایی خروجی ثبت‌شده · seed", file: "evidence/seed-N.json" });
      el.seeds.scroll.style.fontSize = "28px";
      el.seeds.scroll.innerHTML = [1, 2, 3].map((n) => { const p = R_[`seed-${n}.json`].parsed; return `<span class="ln2" data-seed="${n}">${J.k("seed")}${J.n(p.seed)}${J.o(", ")}${J.k("passed")}<span class="good">${p.passed}</span>${J.o(",")}\n  ${J.k("traces_generated")}${J.n(p.traces_generated)}${J.o(", ")}${J.k("violations")}${J.o("[]")}\n  ${J.k("successful")}${J.n(p.coverage.successful_worker_traces)}${J.o(", ")}${J.k("denied")}${J.n(p.coverage.denied_worker_traces)}</span>\n`; }).join("");
      el.seedRows = [...el.seeds.scroll.querySelectorAll("[data-seed]")];
      el.hash = Node(root, { x: 960, y: 150, w: 900, hgt: 380, cls: "card hl", html:
        `<div class="fa" style="font-size:33px;font-weight:700">${fa("SHA-256 فایل {{traces.json}} · {{seed 14050714}}")}</div>` +
        `<div class="mono" style="margin-top:26px;font-size:32px;line-height:1.55;direction:ltr;text-align:left;color:var(--teal2);word-break:break-all">${esc(TR.sha256.slice(0, 32))}<br>${esc(TR.sha256.slice(32))}</div>` +
        `<div class="fa" style="font-size:31px;margin-top:30px"><span class="allow">✓</span> اجرای دوباره با همان seed: همان مقدار</div>` });
      el.rep = Tx(root, fa("{{repeat-14050714.json}} با {{seed-14050714.json}} یکسان است · ثبت‌شده"), { x: 960, y: 550, w: 900, size: 26, color: "var(--muted)" });
      el.sum = Node(root, { x: 160, y: 200, w: 1600, hgt: 540, cls: "card hl", html: "" });
      el.sumTitle = Tx(el.sum, "ممنونم از توجهتون", { x: 0, y: 80, w: 1600, size: 108, weight: 800, align: "center" });
      const items = ["{{9/9}} تست عمومی", "{{500}} دنبالهٔ مختلف", "{{0}} اختلاف با مدل", "{{seed 1, 2, 3}} هم درست", "تولید دنباله‌ها قابل تکرار است"];
      el.sumRow = Tx(el.sum, items.map((s) => pill(fa(s), "allow")).join(" "), { x: 50, y: 270, w: 1500, size: 43, align: "center", lh: "2.5" });
    },
    update(t) {
      const w2 = (a, b) => win(t, c(a) - 0.1, b === END ? END : c(b) - 0.1, 0.35);
      const A_ = w2("c80", "c81"), B_ = w2("c81", "c87"), C_ = w2("c87", END), thanks = A.word(/ممنونم/) - 0.3, D_ = win(t, thanks, END, 0.5);
      show(el.t1, A_); show(el.nine, win(t, c("c80") + 3.0, c("c81") - 0.1, 0.4));
      el.tl.forEach((e, i) => put(e, { op: R(t, c("c80") + 0.2 + i * 0.28, c("c80") + 0.5 + i * 0.28) }));
      show(el.tag2, Math.max(B_, C_ * 1));
      show(el.j, B_); [el.s500, el.s327, el.s111, el.s0, el.s36, el.foot].forEach((e, i) => { const a = [c("c82"), c("c83"), c("c84"), c("c85"), c("c86"), c("c84")][i]; show(e, win(t, a - 0.1, c("c87") - 0.1, 0.35)); });
      for (const [k, a, b] of [["gen", "c82", "c83"], ["ok", "c83", "c84"], ["deny", "c84", "c85"], ["viol", "c85", "c86"], ["passed", "c85", "c86"]]) {
        const v = win(t, c(a), c(b), 0.3); el.keys[k].style.background = v > 0.01 ? `rgba(45,212,191,${q(0.3 * v)})` : ""; el.keys[k].style.borderRadius = "4px";
      }
      show(el.seeds, C_); show(el.hash, win(t, c("c88") - 0.1, c("c90") + 2.0, 0.35)); show(el.rep, win(t, c("c89") - 0.1, c("c90") + 2.0, 0.35));
      el.seedRows.forEach((e, i) => put(e, { op: R(t, c("c87") + 0.3 + i * 0.9, c("c87") + 0.8 + i * 0.9) }));
      show(el.sum, D_); put(el.sumRow, { op: win(t, thanks + 0.8, END, 0.5) });
      const dimC = 1 - D_; put(el.seeds.root, { op: C_ * dimC }); put(el.hash, { op: win(t, c("c88") - 0.1, END, 0.35) * dimC }); put(el.rep, { op: win(t, c("c89") - 0.1, END, 0.35) * dimC });
    },
  });
})();

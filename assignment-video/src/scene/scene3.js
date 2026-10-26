"use strict";
/* Scene 3 - policy.c: who may read, enqueue, clone, run and fetch; the archive owner. */
(() => {
  const el = {}, rows = [];
  let P = {};
  const RULES = [
    ["c15", "{{read_dataset / enqueue}}", "مجوز فعلیِ داده"],
    ["c17", "{{clone_job}}", "owner کار قبلی + مجوز فعلیِ داده"],
    ["c19", "{{run_worker}}", "مجوز ثبت‌کنندهٔ کار، نه اجراکننده"],
    ["c22", "archive", "متعلق به ثبت‌کنندهٔ کار"],
    ["c24", "{{fetch_archive}}", "فقط owner؛ مجوز فعلیِ داده لازم نیست"],
    ["c26", "اجرای دوباره", "همان archive؛ بدون خواندن یا log جدید"],
  ];
  const STAGES = [
    ["c20", "c22", `<div class="title fa" style="font-size:35px">${fa("مثال: {{bob}} کار {{alice}} را اجرا می‌کند")}</div>` +
      `<div class="fa" style="font-size:31px;margin-top:10px">${fa("{{alice}} کار {{j2}} را روی داده {{A}} ثبت کرده است")}</div>` +
      `<div class="fa" style="font-size:31px;margin-top:6px"><span class="allow">✓</span> ${fa("مجوز {{alice}} بررسی می‌شود، نه مجوز {{bob}}")}</div>`],
    ["c22", "c24", `<div class="title fa" style="font-size:35px">آرشیو ساخته‌شده</div>` +
      `<div class="fa" style="font-size:31px;margin-top:10px">${fa("{{owner = alice}}")} ${pill(fa("ثبت‌کننده"), "allow")}</div>` +
      `<div class="fa" style="font-size:31px;margin-top:6px"><span class="deny">✗</span> ${fa("نه {{bob}}؛ اجراکننده owner نمی‌شود")}</div>`],
    ["c24", "c26", `<div class="title fa" style="font-size:35px">${fa("مجوز داده از {{alice}} گرفته شد")}</div>` +
      `<div class="fa" style="font-size:31px;margin-top:10px"><span class="allow">✓</span> ${fa("{{alice}} هنوز می‌تواند archive قبلی خودش را بگیرد")}</div>` +
      `<div class="fa muted" style="font-size:28px;margin-top:6px">${fa("شرط فقط {{caller == owner}} است")}</div>`],
    ["c26", null, `<div class="title fa" style="font-size:35px">${fa("{{run_worker}} دوباره برای کار تمام‌شده")}</div>` +
      `<div class="fa" style="font-size:31px;margin-top:10px"><span class="allow">✓</span> همان شناسهٔ archive قبلی برمی‌گردد</div>` +
      `<div class="fa" style="font-size:31px;margin-top:6px">${pill("بدون خواندن داده", "mu")} ${pill("بدون archive جدید", "mu")} ${pill("بدون log جدید", "mu")}</div>`],
  ];
  defineScene({
    start: A.cue("c14"), end: A.cue("c29"),
    build(root) {
      P.read = CodePanel(root, { id: "pol_read", x: 60, y: 150, w: 900, size: 31 });
      P.clone = CodePanel(root, { id: "pol_clone", x: 60, y: 150, w: 900, size: 31 });
      P.run = CodePanel(root, { id: "pol_run", x: 60, y: 150, w: 900, size: 25 });
      P.owner = CodePanel(root, { id: "pol_owner", x: 60, y: 150 + P.run.height() + 22, w: 900, size: 25 });
      P.fetch = CodePanel(root, { id: "pol_fetch", x: 60, y: 150, w: 900, size: 31 });
      P.eng = CodePanel(root, { id: "eng_run_worker", x: 60, y: 150, w: 900, size: 27 });
      RULES.forEach(([cue, op, cond], i) => {
        rows.push(Node(root, { x: 1000, y: 150 + i * 84, w: 860, hgt: 74, cls: "card", html:
          `<div class="row2" style="height:100%;gap:20px"><span class="pill tl" style="min-width:250px;justify-content:center;font-size:26px">${fa(op)}</span><span class="fa" style="font-size:31px">${fa(cond)}</span></div>` }));
      });
      el.story = h("div", { cls: "card", style: { ...box(1000, 672, 860, 205) } });
      el.stages = STAGES.map(([, , html]) => { const d = h("div", { cls: "abs", style: { left: "24px", right: "24px", top: "16px" }, html }); el.story.append(d); return d; });
      root.append(el.story);
    },
    update(t) {
      const c = A.cue, tr = (id, dt = 0.1) => c(id) - dt;
      const show = (p, a, b) => appear(p.root, t, a, b, { dy: 12, d: 0.35 });
      show(P.read, tr("c14", -0.1), tr("c17")); show(P.clone, tr("c17"), tr("c19")); show(P.run, tr("c19"), tr("c24"));
      show(P.owner, tr("c22"), tr("c24")); show(P.fetch, tr("c24"), tr("c26")); show(P.eng, tr("c26"), END);
      const on = (a, b) => win(t, a, b, 0.3);
      const dimFor = (v) => lerp(0.8, 0.36, v);
      let v = on(c("c15"), c("c17")); P.read.light({ 6: v }, dimFor(v));
      v = on(c("c17"), c("c19")); P.clone.light({ 11: v }, dimFor(v));
      v = on(c("c19"), c("c22")); P.run.light({ 18: v }, dimFor(v)); P.run.mark(18, "requester_granted", v, "grn");
      v = on(c("c22"), c("c24")); P.owner.light({ 29: v }, dimFor(v)); P.owner.mark(29, "requester", v, "grn");
      v = on(c("c24"), c("c26")); P.fetch.light({ 23: v }, dimFor(v));
      v = on(c("c26"), END); P.eng.light({ 269: v }, dimFor(v));
      RULES.forEach(([cue], i) => {
        const next = i + 1 < RULES.length ? c(RULES[i + 1][0]) : END;
        appear(rows[i], t, c(cue) - 0.1, END, { dy: 14, dx: -10 });
        rows[i].classList.toggle("hl", t >= c(cue) - 0.1 && t < next - 0.1);
      });
      appear(el.story, t, c("c20") - 0.1, END);
      STAGES.forEach(([a, b], i) => {
        const p = win(t, c(a) - 0.1, b ? c(b) - 0.1 : END, 0.3);
        put(el.stages[i], { op: p, y: (1 - p) * 8 });
      });
    },
  });
})();

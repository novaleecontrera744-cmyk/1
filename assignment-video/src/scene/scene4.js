"use strict";
/* Scene 4 - dropping privileges with setresuid: temporary vs permanent, the real probe output, open files. */
(() => {
  const el = {};
  let tr, regA, regB, jsonA, jsonB, probe, respond;
  const c = A.cue;
  const V = { alice: DATA.evidence["probe-alice.json"].parsed, bob: DATA.evidence["probe-bob.json"].parsed };
  const SCHED = [
    [0, "initial"], [c("c31"), "temporary"], [c("c33"), "restored"], [c("c34"), "permanent"],
    [c("c36"), "initial"], [c("c38"), "temporary"], [A.word(/برگشتن/, c("c39")), "restored"], [c("c40"), "permanent"],
  ];
  const STATE_TEXT = {
    initial: "initial · setuid process",
    temporary: "temporary_drop · only EUID changes",
    restored: "restore_service · EUID = service again",
    permanent: "permanent_drop · restore → EPERM (1)",
  };
  const CARD_TEXT = {
    initial: fa("شروع: برنامه با {{EUID}} حساب سرویس ({{999}}) اجرا می‌شود"),
    temporary: fa("کاهش موقت: فقط {{EUID}} به کاربر تغییر می‌کند و {{SUID}} هنوز سرویس است"),
    restored: fa("چون {{SUID}} هنوز سرویس است، بازگشت ممکن است ✓"),
    permanent: fa("کاهش دائمی: هر سه شناسه کاربر می‌شود و بازگشت ممکن نیست ✗ ({{EPERM}})"),
  };
  function stateAt(t) {
    let i = 0;
    while (i + 1 < SCHED.length && t >= SCHED[i + 1][0]) i++;
    return { key: SCHED[i][1], since: SCHED[i][0], prev: i ? SCHED[i - 1][1] : null };
  }
  function paint(reg, who, t) {
    const s = stateAt(t), vals = V[who][s.key], before = s.prev ? V[who][s.prev] : vals;
    const pulse = 1 - ramp(t, s.since, s.since + 1.3);
    reg.set(vals, vals.map((v, i) => (v !== before[i] ? pulse : 0)), STATE_TEXT[s.key], s.key === "permanent" ? "var(--red)" : "var(--teal2)");
    return s;
  }
  const FD = [
    ["c41", "c44", "1", fa("فایل پیش از کاهش دسترسی باز شده است"), ""],
    ["c42", "c44", "2", fa("خواندن از همان فایل باز هنوز ممکن است ✓"), `<div class="mono muted" style="font-size:22px;direction:ltr;text-align:left;margin-top:4px">held_content: "credential probe: retained descriptor\\n"</div>`],
    ["c44", END, "3", fa("باز کردن دوباره با خطای {{EACCES}} رد می‌شود ✗"), `<div class="mono muted" style="font-size:22px;direction:ltr;text-align:left;margin-top:4px">reopen_errno: 13</div>`],
    ["c46", END, "!", "تغییر شناسه‌ها، دسترسیِ قبلیِ فایل باز را از آن نمی‌گیرد", ""],
  ];
  defineScene({
    start: c("c29"), end: c("c48"), alwaysUpdate: true,
    build(root, notes) {
      tr = CodePanel(root, { id: "cred_transitions", x: 60, y: 150, w: 880, size: 27 });
      regA = Register(root, { x: 960, y: 150, w: 900, who: "alice · probe" });
      el.card = Node(root, { x: 960, y: 440, w: 900, hgt: 175, cls: "card hl", html: "" });
      jsonA = JsonPanel(root, { name: "probe-alice.json", x: 60, y: 162, w: 880, size: 22 });
      jsonB = JsonPanel(root, { name: "probe-bob.json", x: 60, y: 162 + jsonA.root.offsetHeight + 16, w: 880, size: 22 });
      regB = Register(root, { x: 960, y: 440, w: 900, who: "bob · probe" });
      el.tag = Tag(root, { x: 60, y: 108 });
      el.svc = Tx(root, fa("{{999}} = حساب سرویس {{exportsvc}} در این نصب"), { x: 960, y: 718, w: 900, size: 32, color: "var(--amber)" });
      probe = CodePanel(root, { id: "eng_probe", x: 60, y: 150, w: 1030, size: 23 });
      respond = CodePanel(root, { id: "eng_respond", x: 60, y: 150, w: 1030, size: 27 });
      el.fd = FD.map(([, , n, title, extra], i) => Node(root, { x: 1120, y: 150 + i * 158, w: 740, hgt: 140, cls: "card", html:
        `<div class="row2" style="height:100%;gap:18px"><span class="ico ${n === "!" ? "no" : "ok"}" style="${n === "!" ? "" : "color:var(--teal2);border-color:var(--teal);background:rgba(45,212,191,.12)"}">${n}</span><div style="flex:1"><div class="fa" style="font-size:31px;font-weight:600">${title}</div>${extra}</div></div>` }));
      el.close = Node(root, { x: 1120, y: 150 + 4 * 158, w: 740, hgt: 110, cls: "card good", html: `<div class="row2 fa" style="height:100%"><span style="font-size:32px;font-weight:700">پس فایل حفاظت‌شده را پیش از دادن پاسخ می‌بندیم</span></div>` });
      el.note = h("div", { cls: "note", style: box(960, 640, 900) , html: `<span class="ico">i</span><span>${fa("در این بخش، منظور از «UID» همان {{EUID}} است")}</span>` });
      notes.append(el.note);
    },
    update(t) {
      const partA = win(t, c("c29") - 0.1, c("c36") - 0.1, 0.35);
      const partB = win(t, c("c36") - 0.1, c("c41") - 0.1, 0.35);
      const partC = win(t, c("c41") - 0.1, END, 0.35);
      const inAB = win(t, c("c29") - 0.1, c("c41") - 0.1, 0.35);

      put(tr.root, { op: partA, y: (1 - partA) * 10 });
      put(el.card, { op: partA, y: (1 - partA) * 10 });
      put(jsonA.root, { op: partB, y: (1 - partB) * 10 }); put(jsonB.root, { op: partB, y: (1 - partB) * 10 });
      put(regB.root, { op: partB, y: (1 - partB) * 10 }); put(el.tag, { op: partB }); put(el.svc, { op: win(t, c("c37"), c("c38"), 0.4) });
      put(regA.root, { op: inAB, y: (1 - inAB) * 10 });
      const sA = paint(regA, "alice", t); paint(regB, "bob", t);
      el.card.innerHTML = `<div class="fa" style="font-size:33px;font-weight:600;line-height:1.7">${CARD_TEXT[sA.key]}</div>`;

      let v = win(t, c("c30"), c("c31"), 0.3);
      tr.mark(14, "setresuid", v); tr.mark(19, "setresuid", v); tr.mark(24, "setresuid", v);
      const lt = win(t, c("c31"), c("c32"), 0.3), lr = win(t, c("c32"), c("c34"), 0.3), lp = win(t, c("c34"), c("c36"), 0.3);
      const hot = Math.max(lt, lr, lp, v * 0.7);
      tr.light({ 12: lt * 0.6, 13: lt * 0.6, 14: Math.max(lt, v * 0.8), 15: lt * 0.6, 17: lr * 0.6, 18: lr * 0.6, 19: Math.max(lr, v * 0.8), 20: lr * 0.6, 22: lp * 0.6, 23: lp * 0.6, 24: Math.max(lp, v * 0.8), 25: lp * 0.6 }, lerp(0.8, 0.4, hot));
      jsonA.light({ initial: win(t, c("c37"), c("c38"), 0.3), temporary: win(t, c("c38"), c("c39"), 0.3), restored: win(t, SCHED[6][0] - 0.3, c("c40"), 0.3), permanent: win(t, c("c40"), c("c41") - 0.2, 0.3), restore_errno: win(t, c("c40") + 1, c("c41") - 0.2, 0.3) }, 0.55);
      jsonB.light({ initial: win(t, c("c37"), c("c38"), 0.3), temporary: win(t, c("c38"), c("c39"), 0.3), restored: win(t, SCHED[6][0] - 0.3, c("c40"), 0.3), permanent: win(t, c("c40"), c("c41") - 0.2, 0.3) }, 0.55);
      appear(el.note, t, c("c31") + 0.1, c("c33") + 0.8, { dy: 10 });

      const pc = partC, showProbe = win(t, c("c41") - 0.1, c("c47") - 0.1, 0.35), showResp = win(t, c("c47") - 0.1, END, 0.35);
      put(probe.root, { op: showProbe, y: (1 - showProbe) * 10 }); put(respond.root, { op: showResp, y: (1 - showResp) * 10 });
      const rd = win(t, c("c42"), c("c44"), 0.3), re = win(t, c("c44"), c("c46"), 0.3), allv = win(t, c("c46"), c("c47"), 0.3);
      probe.light({ 234: Math.max(rd, allv * 0.5), 235: Math.max(rd, allv * 0.5), 231: Math.max(re, allv * 0.5), 232: re * 0.7, 233: Math.max(re, allv * 0.5), 228: allv * 0.5, 229: allv * 0.5 }, lerp(0.8, 0.4, Math.max(rd, re, allv)));
      probe.mark(233, "EACCES", re, "red");
      const rs = win(t, c("c47"), END, 0.3);
      respond.light({ 103: rs, 104: rs }, lerp(0.8, 0.4, rs));
      FD.forEach(([a], i) => { const p = win(t, c(a) - 0.1, END, 0.45) * pc; put(el.fd[i], { op: p, y: (1 - p) * 14 }); });
      const pcl = win(t, c("c47") - 0.1, END, 0.45) * pc;
      put(el.close, { op: pcl, y: (1 - pcl) * 14 });
    },
  });
})();

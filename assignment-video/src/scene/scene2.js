"use strict";
/* Scene 2 - the service's authority is not the user's permission; credentials.c identifies the requester. */
(() => {
  const el = {};
  let arrows, aAlice, aBob, aProg, reg, req;
  const pulse = (t, a, b) => win(t, a, b, 0.3);
  defineScene({
    start: A.cue("c06"), end: A.cue("c14"),
    build(root) {
      arrows = ArrowLayer(root);
      aAlice = arrows.arrow("M1262,238 L1204,282", "teal");
      aBob = arrows.arrow("M1262,382 L1204,338", "teal");
      aProg = arrows.arrow("M750,310 L560,310", "amber", { width: 7 });
      el.files = Node(root, { x: 90, y: 160, w: 470, hgt: 300, cls: "card svc", html:
        `<div class="title fa">فایل‌های داده</div><div class="sub2 fa">${fa("مال حساب {{exportsvc}}")}</div>` +
        `<div style="margin-top:34px;display:flex;gap:14px;justify-content:flex-end;direction:ltr;font-size:34px">${chip("A", "svc")}${chip("B", "svc")}${chip("C", "svc")}</div>` });
      el.prog = Node(root, { x: 750, y: 160, w: 460, hgt: 300, cls: "card hl", html:
        `<div class="title fa">${fa("برنامه {{setuid}}")}</div><div class="sub2 fa">با دسترسی حساب سرویس اجرا می‌شود</div>` });
      el.euid = Tx(root, chip("EUID = 999", "svc"), { x: 780, y: 372, w: 400, size: 36, align: "center" });
      el.alice = Node(root, { x: 1262, y: 160, w: 570, hgt: 130, cls: "card", html: `<div class="title fa" style="font-family:var(--mono);font-size:40px;direction:ltr;text-align:right">alice</div><div class="sub2 fa">${fa("درخواست‌دهنده · {{UID 998}}")}</div>` });
      el.bob = Node(root, { x: 1262, y: 330, w: 570, hgt: 130, cls: "card", html: `<div class="title fa" style="font-family:var(--mono);font-size:40px;direction:ltr;text-align:right">bob</div><div class="sub2 fa">${fa("درخواست‌دهنده · {{UID 997}}")}</div>` });
      el.check = Node(root, { x: 380, y: 492, w: 1150, hgt: 62, cls: "card hl", html:
        `<div class="row2 fa" style="justify-content:center;height:100%;gap:16px"><span style="font-size:32px;font-weight:700">بررسی جداگانه: آیا درخواست‌دهنده اجازهٔ خواندن دارد؟</span></div>` });
      reg = Register(root, { x: 60, y: 590, w: 880, who: "process started by alice" });
      req = CodePanel(root, { id: "cred_requester", x: 990, y: 590, w: 870, size: 28 });
    },
    update(t) {
      const c = A.cue;
      appear(el.files, t, c("c06") + 0.1, END);
      appear(el.prog, t, c("c06") + 2.6, END);
      appear(el.euid, t, c("c07") + 0.1, END);
      aProg.set(R(t, c("c07") + 0.3, c("c07") + 1.3));
      appear(el.alice, t, c("c08") + 0.1, END);
      appear(el.bob, t, c("c08") + 0.7, END);
      aAlice.set(R(t, c("c08") + 0.3, c("c08") + 1.0));
      aBob.set(R(t, c("c08") + 0.9, c("c08") + 1.6));
      appear(el.check, t, c("c09") - 0.2, END);
      el.check.classList.toggle("hl", t < c("c10"));

      appear(reg.root, t, c("c10") - 0.2, END);
      appear(req.root, t, c("c10") + 0.2, END);
      const phase = t < c("c12") ? 0 : t < c("c13") ? 1 : 2;
      const flash = [pulse(t, c("c12"), c("c13")), pulse(t, c("c13"), c("c13") + 2.4), 0];
      const text = ["getuid() returns the requester", "RUID = requester: used for the permission check", "EUID = service account: not used for it"][phase];
      reg.set([998, 999, 999], flash, text, phase === 2 ? "var(--amber)" : "var(--teal2)");
      const v = pulse(t, c("c10") + 0.2, c("c13"));
      req.light({ 9: v, 7: 0.25 * v }, lerp(0.8, 0.36, v));
      req.mark(9, "getuid", v, "grn");
    },
  });
})();

"use strict";
/* Scene 1 - introduction: title, environment, the assignment's problem statement. */
(() => {
  const el = {};
  defineScene({
    start: 0, end: A.cue("c06"),
    build(root) {
      el.title = Tx(root, fa("تمرین اول: کنترل دسترسی با {{setuid}}"), { x: 140, y: 170, w: 1640, size: 90, weight: 800, align: "center" });
      el.name = Tx(root, "ارائه: مازیار اشتری", { x: 140, y: 300, w: 1640, size: 46, color: "var(--muted)", align: "center" });
      el.env = Tx(root, pill(fa("اجرا در کانتینر {{Ubuntu 24.04}}"), "tl"), { x: 140, y: 400, w: 1640, size: 36, align: "center" });
      el.ok = Node(root, { x: 980, y: 540, w: 780, hgt: 230, cls: "card good", html: `<div class="row2" style="height:100%"><span class="ico ok">✓</span><div class="fa" style="font-size:38px;font-weight:600">${fa("برنامه اجازه دارد فایل داده را بخواند")}</div></div>` });
      el.no = Node(root, { x: 160, y: 540, w: 780, hgt: 230, cls: "card bad", html: `<div class="row2" style="height:100%"><span class="ico no">✗</span><div class="fa" style="font-size:38px;font-weight:600">${fa("اما نباید این اجازه را در اختیار هر کاربری بگذارد")}</div></div>` });
    },
    update(t) {
      appear(el.title, t, 0.3, END, { dy: 26, d: 0.8 });
      appear(el.name, t, 0.9, END, { dy: 20, d: 0.7 });
      appear(el.env, t, A.word(/ubuntu/i) - 0.6, END, { dy: 18 });
      appear(el.ok, t, A.cue("c04") + 0.4, END, { dy: 22 });
      appear(el.no, t, A.cue("c05") - 0.1, END, { dy: 22 });
    },
  });
})();

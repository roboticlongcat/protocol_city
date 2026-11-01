import { state, send } from "./state.js";
import { showOverlay, hideOverlay, updateTaskPanel, updateDeptPanel } from "./ui.js";

export function openActivity(msg) {
  state.currentActivity = msg;
  const body = document.getElementById("act-body");
  document.getElementById("act-status").textContent = "";
  document.getElementById("act-title").textContent = msg.taskTitle;
  body.innerHTML = "";

  if (msg.kind === "quiz") {
    state.actState = { answer: null };
    const q = document.createElement("p"); q.textContent = msg.data.question; body.appendChild(q);
    msg.data.options.forEach((opt, i) => {
      const b = document.createElement("div"); b.className = "act-item"; b.textContent = opt;
      b.onclick = () => { body.querySelectorAll(".act-item").forEach((e) => e.classList.remove("selected")); b.classList.add("selected"); state.actState.answer = i; };
      body.appendChild(b);
    });
  }

  if (msg.kind === "blocks") {
    state.actState = { order: [] };
    const p = document.createElement("p");
    p.textContent = msg.data.prompt + " (кликай по порядку; клик по выбранному — убрать)";
    body.appendChild(p);
    const resetBtn = document.createElement("button");
    resetBtn.textContent = "Сбросить порядок"; resetBtn.className = "ghost"; resetBtn.style.marginBottom = "8px";
    body.appendChild(resetBtn);
    const list = document.createElement("div"); body.appendChild(list);
    const els = [];
    msg.data.items.forEach((item) => {
      const el = document.createElement("div");
      el.className = "act-item"; el.dataset.item = item; el.textContent = item;
      el.onclick = () => {
        const idx = state.actState.order.indexOf(item);
        if (idx >= 0) state.actState.order.splice(idx, 1); else state.actState.order.push(item);
        refresh();
      };
      els.push(el); list.appendChild(el);
    });
    function refresh() {
      els.forEach((el) => {
        const item = el.dataset.item;
        const idx = state.actState.order.indexOf(item);
        if (idx >= 0) { el.classList.add("selected"); el.textContent = `${idx + 1}. ${item}`; }
        else { el.classList.remove("selected"); el.textContent = item; }
      });
    }
    resetBtn.onclick = () => { state.actState.order = []; refresh(); };
  }

  if (msg.kind === "sorting") {
    state.actState = { selected: null };
    const p = document.createElement("p"); p.textContent = msg.data.prompt + " (кликни предмет, затем корзину)"; body.appendChild(p);
    const pool = document.createElement("div"); body.appendChild(pool);
    const all = msg.data.buckets.flatMap((b) => b.items);
    [...all].sort(() => Math.random() - 0.5).forEach((item) => {
      const el = document.createElement("div"); el.className = "act-item"; el.textContent = item;
      el.onclick = () => { pool.querySelectorAll(".act-item").forEach((x) => x.classList.remove("selected")); el.classList.add("selected"); state.actState.selected = item; };
      pool.appendChild(el);
    });
    msg.data.buckets.forEach((bucket) => {
      const zone = document.createElement("div"); zone.className = "bucket"; zone.innerHTML = `<b>${bucket.name}</b>`;
      zone.onclick = () => {
        if (!state.actState.selected) return;
        const chip = document.createElement("div"); chip.className = "act-item"; chip.style.cursor = "default"; chip.textContent = state.actState.selected;
        zone.appendChild(chip);
        const src = [...pool.querySelectorAll(".act-item")].find((x) => x.textContent === state.actState.selected);
        if (src) src.remove();
        state.actState.selected = null;
      };
      body.appendChild(zone);
    });
  }

  showOverlay(document.getElementById("activity-overlay"));
}

export function collectAnswer() {
  if (!state.currentActivity) return null;
  if (state.currentActivity.kind === "quiz") return state.actState.answer;
  if (state.currentActivity.kind === "blocks") return state.actState.order;
  if (state.currentActivity.kind === "sorting") {
    const buckets = [];
    document.querySelectorAll("#act-body .bucket").forEach((z) => {
      buckets.push({ bucket: z.querySelector("b").textContent, items: [...z.querySelectorAll(".act-item")].map((e) => e.textContent) });
    });
    return buckets;
  }
  return null;
}
document.getElementById("act-submit").onclick = () => {
  if (!state.currentActivity) return;
  const answer = collectAnswer();
  if (state.currentActivity.mode === "step") send("submit_activity", { stepId: state.currentActivity.stepId, answer });
  else send("submit_activity", { instanceId: state.currentActivity.instanceId, answer });
};
document.getElementById("act-cancel").onclick = () => {
  state.currentActivity = null;
  hideOverlay(document.getElementById("activity-overlay"));
};
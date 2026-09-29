// Family OS — toast משותף בתחתית העמוד. מקור יחיד: כל קריאה (אישור שמירה, סנכרון, התראה)
// עוברת דרך אותה פונקציה/טיימר כדי שלא ידרסו זו את זו על אותו אלמנט DOM.

export function toast(msg, ms = 3500) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.innerHTML = "";
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, ms);
}

// toast עם פעולת "בטל" — לפעולות מוחקות (למשל "✓ קניתי", Family_OS_Shopping_Inventory_Brief.md).
// אותו אלמנט/טיימר בדיוק כמו toast() הרגיל, כדי לא לדרוס אחד את השני.
export function showUndoToast(msg, onUndo, ms = 6000) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.innerHTML = "";
  const span = document.createElement("span");
  span.textContent = msg;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "toast-undo-btn";
  btn.textContent = "בטל";
  el.appendChild(span);
  el.appendChild(btn);
  el.hidden = false;
  clearTimeout(toast._t);
  const finish = () => { el.hidden = true; el.innerHTML = ""; };
  toast._t = setTimeout(finish, ms);
  btn.addEventListener("click", () => {
    clearTimeout(toast._t);
    finish();
    onUndo();
  });
}

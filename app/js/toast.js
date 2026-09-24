// Family OS — toast משותף בתחתית העמוד. מקור יחיד: כל קריאה (אישור שמירה, סנכרון, התראה)
// עוברת דרך אותה פונקציה/טיימר כדי שלא ידרסו זו את זו על אותו אלמנט DOM.

export function toast(msg, ms = 3500) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, ms);
}

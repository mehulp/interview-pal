// Which Study Hub plan this page visit came from (pilot). A tiny shared note between the Interview screen (which reads the
// link) and the Questions screen (which offers "Back to study plan"). It lives in memory only and holds a validated UUID or
// nothing; the address to go back to is always built from the configured origin (see packs.js), never taken from here.
let planId = '';
const listeners = [];

export const getLinkedPlan = () => planId;
export function setLinkedPlan(id) {
  planId = id || '';
  listeners.forEach((fn) => fn(planId));
}
export const onLinkedPlanChange = (fn) => { listeners.push(fn); fn(planId); };

// The app opens as an English–Uzbek dictionary; typing the secret word in its search box opens the real app.
// The "opened" flag lives for one session only (sessionStorage): closing the app and opening it again shows the dictionary again.
const KEY = 'lugat-open';
let memory = false; // used when sessionStorage is blocked

export const SECRET = 'ufuq';
export const isUnlocked = () => {
  try { return sessionStorage.getItem(KEY) === '1'; } catch (e) { return memory; }
};
export const unlockApp = () => {
  memory = true;
  try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* storage blocked */ }
};
export const lockApp = () => {
  memory = false;
  try { sessionStorage.removeItem(KEY); } catch (e) { /* storage blocked */ }
};

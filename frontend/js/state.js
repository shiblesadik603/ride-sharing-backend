import { reactive } from "https://unpkg.com/vue@3.5.13/dist/vue.esm-browser.js";

/**
 * Sessions are kept per-role in localStorage under one map, so the demo
 * can hold a logged-in passenger, driver, and admin at once and switch
 * between them without re-authenticating — the natural way to actually
 * demo a three-sided marketplace instead of only ever showing one side.
 */
const STORAGE_KEY = "rsb_sessions";

function loadSessions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
}

export const state = reactive({
  sessions: loadSessions(), // { [userId]: { accessToken, refreshToken, user } }
  activeUserId: localStorage.getItem("rsb_active_user") || null,
  view: "dashboard",
  toasts: [],
  // True while the auth screen is shown on top of an existing session, so
  // a second role (e.g. a driver) can log in/register without signing the
  // first one out — the whole point of the multi-session demo.
  addingAccount: false,
});

export function persistSessions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.sessions));
  if (state.activeUserId) localStorage.setItem("rsb_active_user", state.activeUserId);
}

export function currentSession() {
  return state.activeUserId ? state.sessions[state.activeUserId] : null;
}

export function currentUser() {
  return currentSession()?.user ?? null;
}

export function saveSession({ user, accessToken, refreshToken }) {
  state.sessions[user.id] = { user, accessToken, refreshToken };
  state.activeUserId = user.id;
  state.addingAccount = false;
  state.view = "dashboard";
  persistSessions();
}

export function updateSessionTokens(userId, { accessToken, refreshToken }) {
  const s = state.sessions[userId];
  if (!s) return;
  s.accessToken = accessToken;
  if (refreshToken) s.refreshToken = refreshToken;
  persistSessions();
}

export function switchSession(userId) {
  state.activeUserId = userId;
  state.view = "dashboard";
  persistSessions();
}

export function removeSession(userId) {
  delete state.sessions[userId];
  if (state.activeUserId === userId) {
    const remaining = Object.keys(state.sessions);
    state.activeUserId = remaining[0] ?? null;
  }
  persistSessions();
}

let toastId = 0;
export function toast(message, type = "info") {
  const id = ++toastId;
  state.toasts.push({ id, message, type });
  setTimeout(() => {
    const i = state.toasts.findIndex((t) => t.id === id);
    if (i !== -1) state.toasts.splice(i, 1);
  }, 4000);
}

import { state, currentSession, updateSessionTokens, removeSession, toast } from "./state.js";

export const API_BASE = "http://localhost:4000/api/v1";

/**
 * The backend's refresh token is designed for two transports: an httpOnly
 * cookie for same-origin web clients, and the raw value in the response
 * body for clients that can't use that cookie (mobile apps — see
 * auth.controller.js's own comment). This demo frontend is served from a
 * different origin/port than the API, and the cookie is `sameSite:
 * strict`, so it's simply never sent cross-origin — this client
 * deliberately behaves like the "mobile" case, keeping the refresh token
 * in localStorage and sending it explicitly, rather than fighting the
 * cookie. No backend change needed; this is exactly the path the API
 * already supports.
 */
let refreshInFlight = null;

async function doRefresh(userId) {
  const session = state.sessions[userId];
  if (!session) throw new Error("No session to refresh");

  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Session expired");

  updateSessionTokens(userId, json.data);
  return json.data.accessToken;
}

/**
 * @param {string} path - e.g. "/rides/abc123"
 * @param {object} opts - { method, body, isForm, userId, query }
 *   userId defaults to the currently active session; pass explicitly when
 *   acting as a specific role (e.g. firing a driver action from an admin
 *   screen isn't a thing here, but multi-session switching needs it).
 */
export async function api(path, opts = {}) {
  const userId = opts.userId ?? state.activeUserId;
  const session = userId ? state.sessions[userId] : null;

  const url = new URL(API_BASE + path);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
    }
  }

  async function attempt(token) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    let body = opts.body;
    if (body && !opts.isForm) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }
    const res = await fetch(url, { method: opts.method || "GET", headers, body });
    const isJson = res.headers.get("content-type")?.includes("application/json");
    const json = isJson ? await res.json() : null;
    return { res, json };
  }

  let { res, json } = await attempt(session?.accessToken);

  // A 401 on anything other than the refresh call itself means the access
  // token expired mid-session — refresh once and retry, rather than
  // surfacing a confusing error for something the client can recover from
  // transparently. Coalesced into one in-flight promise so N simultaneous
  // requests hitting a stale token don't each fire their own refresh.
  if (res.status === 401 && session && path !== "/auth/refresh") {
    try {
      refreshInFlight ??= doRefresh(userId).finally(() => (refreshInFlight = null));
      const newToken = await refreshInFlight;
      ({ res, json } = await attempt(newToken));
    } catch {
      removeSession(userId);
      toast("Session expired — please log in again", "error");
      throw new Error("Session expired");
    }
  }

  if (!res.ok) {
    const message = json?.message || `Request failed (${res.status})`;
    throw Object.assign(new Error(message), { status: res.status, details: json?.details });
  }
  return json?.data;
}

export const get = (path, query) => api(path, { method: "GET", query });
export const post = (path, body) => api(path, { method: "POST", body });
export const patch = (path, body) => api(path, { method: "PATCH", body });
export const del = (path) => api(path, { method: "DELETE" });
export const postForm = (path, formData) => api(path, { method: "POST", body: formData, isForm: true });

/**
 * File-download endpoints (vehicle/verification documents) are
 * authenticated the same way as everything else — a Bearer header, not a
 * URL query token — so a plain `<a href>` can't reach them. This opens the
 * file by fetching it with the same auth + refresh handling as `api()`,
 * then hands the browser a short-lived blob: URL to display it.
 */
export async function openFile(path) {
  // window.open() only bypasses the popup blocker when called synchronously
  // inside the click handler's call stack — by the time an `await fetch`
  // resolves, that gesture has expired. Opening a blank tab up front and
  // redirecting it once the blob is ready keeps it inside the gesture.
  const tab = window.open("", "_blank");

  const userId = state.activeUserId;
  const session = userId ? state.sessions[userId] : null;
  const url = API_BASE + path;

  async function attempt(token) {
    return fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  }

  try {
    let res = await attempt(session?.accessToken);
    if (res.status === 401 && session) {
      try {
        refreshInFlight ??= doRefresh(userId).finally(() => (refreshInFlight = null));
        const newToken = await refreshInFlight;
        res = await attempt(newToken);
      } catch {
        removeSession(userId);
        toast("Session expired — please log in again", "error");
        throw new Error("Session expired");
      }
    }

    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    if (tab) tab.location.href = URL.createObjectURL(blob);
  } catch (err) {
    if (tab) tab.close();
    throw err;
  }
}

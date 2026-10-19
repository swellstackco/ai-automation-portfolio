// Minimal App Store Connect API client. `fetchImpl` is injectable so the watcher can be tested offline.
export const API_BASE = 'https://api.appstoreconnect.apple.com';

export function makeClient({ getToken, fetchImpl = fetch, base = API_BASE }) {
  return async function api(method, url, body) {
    const res = await fetchImpl(base + url, {
      method,
      headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, json };
  };
}

// Minimal Vercel Blob client (REST, no SDK). Token comes from BLOB_READ_WRITE_TOKEN,
// read from the environment or from .env.local. The token is never logged.
import fs from "node:fs";
import path from "node:path";

const API = "https://blob.vercel-storage.com";

export function loadToken(root) {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  const envFile = path.join(root, ".env.local");
  if (fs.existsSync(envFile)) {
    const m = fs.readFileSync(envFile, "utf8").match(/^BLOB_READ_WRITE_TOKEN="?([^"\n]+)"?/m);
    if (m) return m[1];
  }
  return null;
}

const TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".pdf": "application/pdf" };

export async function putBlob(token, pathname, filePath, attempts = 5) {
  const body = fs.readFileSync(filePath);
  const type = TYPES[path.extname(pathname).toLowerCase()] || "application/octet-stream";
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    if (i) await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    try {
      return await putOnce(token, pathname, body, type);
    } catch (e) {
      lastErr = e;
      if (!/\b(5\d\d|429|fetch failed)\b/.test(e.message)) throw e;
    }
  }
  throw lastErr;
}

async function putOnce(token, pathname, body, type) {
  const res = await fetch(`${API}/${pathname}`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "x-api-version": "7",
      "x-content-type": type,
      "x-add-random-suffix": "0",
      "x-cache-control-max-age": String(60 * 60 * 24 * 365),
      "content-length": String(body.length),
    },
    body,
  });
  if (!res.ok) throw new Error(`blob put ${pathname}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return { url: json.url, bytes: body.length };
}

export async function listBlobs(token, prefix) {
  const out = [];
  let cursor;
  do {
    const u = new URL(API);
    u.searchParams.set("limit", "1000");
    if (prefix) u.searchParams.set("prefix", prefix);
    if (cursor) u.searchParams.set("cursor", cursor);
    const res = await fetch(u, { headers: { authorization: `Bearer ${token}`, "x-api-version": "7" } });
    if (!res.ok) throw new Error(`blob list: ${res.status}`);
    const json = await res.json();
    out.push(...(json.blobs || []));
    cursor = json.hasMore ? json.cursor : undefined;
  } while (cursor);
  return out;
}

export async function delBlobs(token, urls) {
  const res = await fetch(`${API}/delete`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "x-api-version": "7", "content-type": "application/json" },
    body: JSON.stringify({ urls }),
  });
  if (!res.ok) throw new Error(`blob delete: ${res.status}`);
}

/**
 * Compare live site on FTP (source of truth) with local WEBROOT.
 * Run from WEBROOT: node scripts/ftp-compare.js
 * Requires: copy .env.example to .env and set FTP_HOST, FTP_USER, FTP_PASSWORD.
 */

import { Client } from "basic-ftp";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEBROOT = join(__dirname, "..");

dotenv.config({ path: join(WEBROOT, ".env") });

function normalizePath(p) {
  return p.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}

async function walkLocalAsync(dir, prefix = "") {
  const ignore = new Set([".git", "node_modules", ".env", "ND WEB.code-workspace"]);
  const { readdir, stat } = await import("fs/promises");
  let entries;
  try {
    entries = await readdir(join(dir, prefix), { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (ignore.has(e.name)) continue;
    if (e.isDirectory()) {
      out.push(...(await walkLocalAsync(dir, rel)));
    } else {
      const full = join(dir, rel);
      let size = null;
      try {
        size = (await stat(full)).size;
      } catch {}
      out.push({ path: normalizePath(rel), size });
    }
  }
  return out;
}

async function listFtp(client, remotePath) {
  const list = [];
  async function recurse(path) {
    const entries = await client.list(path || "/");
    for (const e of entries) {
      if (e.name === "." || e.name === "..") continue;
      const full = path ? `${path}/${e.name}` : e.name;
      const norm = normalizePath(full);
      if (e.isDirectory) {
        await recurse(full);
      } else {
        list.push({ path: norm, size: e.size });
      }
    }
  }
  await recurse(remotePath || "");
  return list;
}

async function main() {
  if (!existsSync(join(WEBROOT, ".env"))) {
    console.error("No .env found. Copy .env.example to .env and set FTP_HOST, FTP_USER, FTP_PASSWORD.");
    process.exit(1);
  }
  const host = process.env.FTP_HOST;
  const user = process.env.FTP_USER;
  const password = process.env.FTP_PASSWORD;
  const remotePath = (process.env.FTP_REMOTE_PATH || "/").replace(/\/+$/, "") || "/";

  if (!host || !user || !password) {
    console.error("Set FTP_HOST, FTP_USER, FTP_PASSWORD in .env");
    process.exit(1);
  }

  const client = new Client(60_000);
  client.ftp.verbose = false;

  try {
    console.log("Connecting to FTP...");
    await client.access({
      host,
      user,
      password,
      secure: false,
    });
    if (remotePath && remotePath !== "/") {
      await client.cd(remotePath);
    }
    console.log("Listing remote (live)...");
    const remote = await listFtp(client, "");
    const remoteMap = new Map(remote.map((r) => [r.path, r.size]));

    console.log("Listing local WEBROOT...");
    const local = await walkLocalAsync(WEBROOT);
    const localMap = new Map(local.map((l) => [l.path, l.size]));

    const onlyRemote = [...remoteMap.keys()].filter((p) => !localMap.has(p)).sort();
    const onlyLocal = [...localMap.keys()].filter((p) => !remoteMap.has(p)).sort();
    const different = [...localMap.keys()]
      .filter((p) => remoteMap.has(p) && localMap.get(p) !== remoteMap.get(p))
      .sort();

    console.log("\n--- Live (FTP) vs local WEBROOT ---\n");
    if (onlyRemote.length) {
      console.log("Only on LIVE (FTP) [update local from FTP if needed]:");
      onlyRemote.forEach((p) => console.log("  " + p));
      console.log("");
    }
    if (onlyLocal.length) {
      console.log("Only LOCAL (not on live):");
      onlyLocal.forEach((p) => console.log("  " + p));
      console.log("");
    }
    if (different.length) {
      console.log("Same path, different size (content may differ):");
      different.forEach((p) => {
        console.log(`  ${p}  local=${localMap.get(p)}  live=${remoteMap.get(p)}`);
      });
      console.log("");
    }
    if (!onlyRemote.length && !onlyLocal.length && !different.length) {
      console.log("No discrepancies: file set and sizes match.");
    }
    console.log(`Summary: ${remote.length} on live, ${local.length} local; ${onlyRemote.length} only live, ${onlyLocal.length} only local, ${different.length} size diff.`);
  } catch (err) {
    console.error("FTP error:", err.message);
    process.exit(1);
  } finally {
    client.close();
  }
}

main();

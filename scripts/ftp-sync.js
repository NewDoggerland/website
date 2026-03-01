/**
 * One-way sync: make WEBROOT reflect ONLY the contents of FTP (live).
 * FTP is untouched. All remote files are downloaded; local files not on FTP are removed.
 * Run from WEBROOT: node scripts/ftp-sync.js
 * Requires: .env with FTP_HOST, FTP_USER, FTP_PASSWORD.
 */

import { Client } from "basic-ftp";
import { existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { rm, readdir, stat } from "fs/promises";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEBROOT = join(__dirname, "..");

dotenv.config({ path: join(WEBROOT, ".env") });

const IGNORE_LOCAL = new Set([".git", "node_modules", ".env", ".env.example", "ND WEB.code-workspace", "scripts"]);

function normalizePath(p) {
  return p.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
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
        list.push(norm);
      }
    }
  }
  await recurse(remotePath || "");
  return list;
}

async function walkLocal(dir, prefix = "") {
  let entries;
  try {
    entries = await readdir(join(dir, prefix), { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (IGNORE_LOCAL.has(e.name)) continue;
    const norm = normalizePath(rel);
    if (e.isDirectory()) {
      out.push(...(await walkLocal(dir, rel)));
    } else {
      out.push(norm);
    }
  }
  return out;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run") || process.argv.includes("--report");
  const downloadOnly = process.argv.includes("--download-only");

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
    await client.access({ host, user, password, secure: false });
    if (remotePath && remotePath !== "/") {
      await client.cd(remotePath);
    }

    console.log("Listing remote (live)...");
    const remoteFiles = await listFtp(client, "");
    const remoteSet = new Set(remoteFiles);

    const localFiles = await walkLocal(WEBROOT);
    const toDownload = remoteFiles;
    const toRemove = localFiles.filter((rel) => !remoteSet.has(rel));

    if (dryRun) {
      console.log("\n--- DRY RUN (no changes made). Review before fixing. ---\n");
      console.log("Would download " + toDownload.length + " file(s) from FTP.");
      if (toRemove.length) {
        console.log("Would remove " + toRemove.length + " local-only file(s):");
        toRemove.forEach((r) => console.log("  " + r));
      } else {
        console.log("Would remove 0 local-only file(s).");
      }
      console.log("\nRun without --dry-run to apply sync.");
      return;
    }

    console.log("Downloading from FTP (WEBROOT unchanged until download succeeds)...");
    let downloaded = 0;
    for (const rel of remoteFiles) {
      const localPath = join(WEBROOT, rel);
      const dir = dirname(localPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      await client.downloadTo(localPath, rel);
      downloaded++;
      if (downloaded % 50 === 0) console.log(`  ${downloaded}/${remoteFiles.length}...`);
    }
    console.log(`Downloaded ${downloaded} files.`);

    if (downloadOnly) {
      console.log("Done (--download-only: local-only files kept).");
      return;
    }

    console.log("Removing local files not on FTP...");
    let removed = 0;
    for (const rel of toRemove) {
      const full = join(WEBROOT, rel);
      try {
        await rm(full, { force: true });
        removed++;
        console.log("  removed: " + rel);
      } catch (e) {
        console.warn("  could not remove " + rel + ": " + e.message);
      }
    }
    console.log(`Removed ${removed} local-only file(s).`);
    console.log("Done. WEBROOT now reflects only FTP contents (FTP untouched).");
  } catch (err) {
    console.error("FTP error:", err.message);
    process.exit(1);
  } finally {
    client.close();
  }
}

main();

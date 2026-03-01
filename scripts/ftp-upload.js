/**
 * Upload specific files to FTP (live). Uses .env credentials.
 * Pass file paths as arguments. Does NOT upload everything by default.
 * Example: node scripts/ftp-upload.js governance-discovery.html tree/public/gov_search_index.json
 * Use --all to upload entire WEBROOT (overwrites remote; use with caution).
 */

import { Client } from "basic-ftp";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readdir } from "fs/promises";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEBROOT = join(__dirname, "..");

dotenv.config({ path: join(WEBROOT, ".env") });

const IGNORE = new Set([".git", "node_modules", ".env", ".env.example", "ND WEB.code-workspace", "scripts"]);

function normalizePath(p) {
  return p.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
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
    if (IGNORE.has(e.name)) continue;
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
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const useAll = process.argv.includes("--all");

  if (!useAll && args.length === 0) {
    console.error("Pass file paths to upload. Example:");
    console.error("  node scripts/ftp-upload.js governance-discovery.html tree/public/gov_search_index.json");
    console.error("Use --all to upload entire WEBROOT (overwrites remote; use with caution).");
    process.exit(1);
  }

  if (!existsSync(join(WEBROOT, ".env"))) {
    console.error("No .env found. Set FTP_HOST, FTP_USER, FTP_PASSWORD in .env");
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

  let files = args.map((a) => normalizePath(a));
  if (useAll) {
    files = await walkLocal(WEBROOT);
    console.log("Uploading entire WEBROOT (" + files.length + " files). Remote files will be overwritten.");
  } else {
    console.log("Uploading", files.length, "file(s)...");
  }

  const client = new Client(60_000);
  client.ftp.verbose = false;

  try {
    console.log("Connecting to FTP...");
    await client.access({ host, user, password, secure: false });
    if (remotePath && remotePath !== "/") {
      await client.cd(remotePath);
    }

    let uploaded = 0;
    for (const rel of files) {
      const localPath = join(WEBROOT, rel);
      if (!existsSync(localPath)) {
        console.warn("Skip (not found):", rel);
        continue;
      }
      const remoteDir = dirname(rel).replace(/\\/g, "/");
      if (remoteDir && remoteDir !== ".") {
        await client.ensureDir(remoteDir);
      }
      await client.uploadFrom(localPath, rel);
      uploaded++;
      console.log("  uploaded:", rel);
    }
    console.log("Done. Uploaded", uploaded, "file(s) to live.");
  } catch (err) {
    console.error("FTP error:", err.message);
    process.exit(1);
  } finally {
    client.close();
  }
}

main();

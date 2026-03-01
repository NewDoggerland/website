/**
 * Cross-document discrepancy check: find conflicting numbers or statements
 * across all text-bearing documents in WEBROOT (run after syncing from FTP).
 * Run from WEBROOT: node scripts/doc-discrepancy-check.js
 */

import { readdir, readFile, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEBROOT = join(__dirname, "..");
const REPORT_PATH = join(WEBROOT, "discrepancy-report.md");

const TEXT_EXT = new Set([".html", ".json", ".md", ".yml", ".yaml", ".txt"]);
const IGNORE = new Set([".git", "node_modules", "scripts", "fonts", "docs/assets"]);
const MAX_FILE_MB = 2;

function normalizeNum(s) {
  const n = String(s).replace(/,/g, "").trim();
  if (/^\d+$/.test(n)) return parseInt(n, 10);
  if (/^\d*\.?\d+\s*(million|M|m)$/.test(n)) return parseFloat(n) * 1e6;
  if (/^\d*\.?\d+\s*(thousand|k|K)$/.test(n)) return parseFloat(n) * 1e3;
  const m = n.match(/^[\d,]+(?:\.\d+)?$/);
  return m ? parseFloat(m[0].replace(/,/g, "")) : null;
}

function parseDollar(s) {
  const m = s.match(/\$([\d,.]+)\s*(million|M|m|thousand|k|K)?/i);
  if (!m) return null;
  let v = parseFloat(m[1].replace(/,/g, ""));
  if (m[2]) {
    const u = (m[2] || "").toLowerCase();
    if (u === "million" || u === "m") v *= 1e6;
    else if (u === "thousand" || u === "k") v *= 1e3;
  }
  return v;
}

function makeContextKey(text, pos, len = 55) {
  const start = Math.max(0, pos - len);
  const end = Math.min(text.length, pos + 25);
  let window = text.slice(start, end).replace(/\s+/g, " ").trim();
  window = window.replace(/\$[\d,.]+(?:\s*(?:million|M|m|thousand|k|K))?/gi, "$#");
  window = window.replace(/\b\d[\d,.]*(?:\s*(?:million|M|m|thousand|k|K))?\b/g, "#");
  window = window.toLowerCase().replace(/[^a-z0-9#\s]/g, " ").replace(/\s+/g, " ").trim();
  return window.slice(-70);
}

async function walk(dir, prefix = "") {
  let entries;
  try {
    entries = await readdir(join(dir, prefix), { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    const norm = rel.replace(/\\/g, "/");
    if (IGNORE.has(e.name)) continue;
    if (e.isDirectory()) {
      out.push(...(await walk(dir, rel)));
    } else {
      const ext = (e.name.match(/\.[^.]+$/) || [""])[0].toLowerCase();
      if (TEXT_EXT.has(ext)) out.push(norm);
    }
  }
  return out;
}

async function extractFacts(filePath) {
  const full = join(WEBROOT, filePath);
  let text;
  try {
    const buf = await readFile(full);
    if (buf.length > MAX_FILE_MB * 1024 * 1024) return [];
    text = buf.toString("utf8");
    if (!text || /\x00/.test(text)) return [];
  } catch {
    return [];
  }

  const facts = [];

  // Dollar amounts with context
  const dollarRe = /\$[\d,]+(?:\.\d+)?(?:\s*(?:million|M|m|thousand|k|K))?/g;
  let match;
  while ((match = dollarRe.exec(text)) !== null) {
    const value = parseDollar(match[0]);
    if (value == null) continue;
    const key = makeContextKey(text, match.index);
    if (key.length < 12) continue;
    if (value < 10 && /replace|regex|exec|match|substr|char/.test(key)) continue;
    facts.push({ type: "dollar", key, value, raw: match[0], file: filePath });
  }

  // Counts: N vehicles, N sites, N acres, N dogs, fleet of N, etc.
  const countRe = /\b(\d{1,4})\s*(vehicles?|sites?|units?|acres?|metres?|dogs?|grill\s+sites?|fleet|years?|months?|treehouses?|sections?|nodes?)\b/gi;
  while ((match = countRe.exec(text)) !== null) {
    const num = parseInt(match[1], 10);
    const unit = match[2].toLowerCase().replace(/\s+/g, " ");
    const key = makeContextKey(text, match.index);
    if (key.length < 5) continue;
    facts.push({ type: "count", key, value: num, unit, raw: match[0], file: filePath });
  }

  return facts;
}

function keySimilarity(a, b) {
  const wa = new Set(a.split(/\s+/).filter((w) => w.length > 1 && w !== "#"));
  const wb = new Set(b.split(/\s+/).filter((w) => w.length > 1 && w !== "#"));
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  const union = new Set([...wa, ...wb]).size;
  return union === 0 ? 0 : inter / union;
}

function groupSimilarKeys(factsByKey) {
  const keys = [...factsByKey.keys()];
  const used = new Set();
  const groups = [];
  for (const k of keys) {
    if (used.has(k)) continue;
    const group = [k];
    used.add(k);
    for (const o of keys) {
      if (used.has(o)) continue;
      if (group.some((g) => keySimilarity(g, o) >= 0.5)) {
        group.push(o);
        used.add(o);
      }
    }
    groups.push(group);
  }
  return groups;
}

async function main() {
  console.log("Scanning WEBROOT for text documents...\n");

  const files = await walk(WEBROOT);
  const allFacts = [];
  for (const f of files) {
    const facts = await extractFacts(f);
    allFacts.push(...facts);
  }

  const byKey = new Map();
  for (const fact of allFacts) {
    const k = fact.key;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(fact);
  }

  const conflicts = [];
  for (const [key, list] of byKey.entries()) {
    const values = list.map((f) => f.value);
    const uniq = [...new Set(values)];
    if (uniq.length <= 1) continue;
    const byValue = new Map();
    for (const f of list) {
      if (!byValue.has(f.value)) byValue.set(f.value, []);
      byValue.get(f.value).push(f);
    }
    conflicts.push({ key, byValue, list });
  }

  const similarGroups = groupSimilarKeys(byKey);
  const crossGroupConflicts = [];
  for (const group of similarGroups) {
    if (group.length <= 1) continue;
    const allInGroup = group.flatMap((k) => byKey.get(k) || []);
    const values = allInGroup.map((f) => f.value);
    const uniq = [...new Set(values)];
    if (uniq.length <= 1) continue;
    if (values.every((v) => typeof v === "number" && v < 20) && group.some((k) => /replace|regex|exec|char|substr/.test(k))) continue;
    const byValue = new Map();
    for (const f of allInGroup) {
      if (!byValue.has(f.value)) byValue.set(f.value, []);
      byValue.get(f.value).push(f);
    }
    crossGroupConflicts.push({ keys: group, byValue, facts: allInGroup });
  }

  const lines = [];
  lines.push("# Discrepancy report (review before fixing)");
  lines.push("");
  lines.push("Generated from WEBROOT text documents. Fix only after reviewing.");
  lines.push("");

  lines.push("## 1. Conflicting numbers (same context key)");
  lines.push("");
  if (conflicts.length === 0) {
    lines.push("None found.");
  } else {
    for (const { key, byValue } of conflicts) {
      lines.push("**Context:** \"" + key.slice(0, 80) + (key.length > 80 ? "..." : "") + "\"");
      for (const [val, facts] of byValue) {
        const files = [...new Set(facts.map((f) => f.file))];
        const raw = facts.map((f) => f.raw).filter((r, i, a) => a.indexOf(r) === i);
        lines.push("- Value: " + (facts[0].type === "dollar" ? "$" + Number(val).toLocaleString() : val) + "  in " + files.join(", "));
        lines.push("  - Raw: " + raw.join("; "));
      }
      lines.push("");
    }
  }

  lines.push("## 2. Possibly same topic, different numbers (similar context)");
  lines.push("");
  lines.push("May be ranges or different phases; review before treating as errors.");
  lines.push("");
  if (crossGroupConflicts.length === 0) {
    lines.push("None found.");
  } else {
    for (const { keys, byValue, facts } of crossGroupConflicts) {
      const alreadyReported = conflicts.some((c) => keys.includes(c.key));
      if (alreadyReported) continue;
      lines.push("**Similar contexts:** " + keys.slice(0, 3).map((k) => "\"" + k.slice(0, 50) + (k.length > 50 ? "..." : "") + "\"").join(" | "));
      for (const [val, list] of byValue) {
        const files = [...new Set(list.map((f) => f.file))];
        lines.push("- Value: " + (list[0].type === "dollar" ? "$" + Number(val).toLocaleString() : val) + "  in " + files.join(", "));
      }
      lines.push("");
    }
  }

  const totalFacts = allFacts.length;
  const uniqueKeys = byKey.size;
  lines.push("---");
  lines.push("**Summary:** " + totalFacts + " facts, " + uniqueKeys + " context keys; " + conflicts.length + " direct conflicts, " + crossGroupConflicts.length + " similar-context groups.");
  const reportBody = lines.join("\n");

  await writeFile(REPORT_PATH, reportBody, "utf8");

  console.log("Report written to discrepancy-report.md");
  console.log("Summary: " + totalFacts + " facts, " + uniqueKeys + " context keys; " + conflicts.length + " direct conflicts, " + crossGroupConflicts.length + " similar-context groups.");
  console.log("Review the report before fixing.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

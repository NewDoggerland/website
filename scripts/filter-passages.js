import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEBROOT = join(__dirname, "..");
const FILE = join(WEBROOT, "governance-discovery.html");

const excludeDocs = ["DAF Safety & Accountability", "Grant Menu Appendix"];

let html = readFileSync(FILE, "utf8");

const startMark = "const PASSAGES = [";
const i = html.indexOf(startMark);
if (i === -1) {
  console.error("Could not find PASSAGES start");
  process.exit(1);
}
const afterStart = i + startMark.length;
const navIdx = html.indexOf("const NAV_DATA", afterStart);
if (navIdx === -1) {
  console.error("Could not find const NAV_DATA");
  process.exit(1);
}
let endBracket = -1;
for (let k = navIdx - 1; k >= afterStart; k--) {
  if (html[k] === "]" && /^;?\s*\r?\n\s*const\s+NAV_DATA/.test(html.slice(k + 1, k + 50))) {
    endBracket = k;
    break;
  }
}
if (endBracket < afterStart) {
  console.error("Could not find closing ]");
  process.exit(1);
}

const arrayStr = html.slice(afterStart, endBracket);
const passages = JSON.parse("[" + arrayStr + "]");
const before = passages.length;
const filtered = passages.filter((p) => !excludeDocs.includes(p.doc));
const after = filtered.length;

const newArrayStr = JSON.stringify(filtered).slice(1, -1);
html = html.slice(0, afterStart) + newArrayStr + html.slice(endBracket);

writeFileSync(FILE, html);
console.log("Removed", before - after, "passages (DAF + Grant Menu). Passages now:", after);

// Fails if answer keys, mappings, or rationale text appear in any client bundle.
// Run after `next build`: npm run check:bundle
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const content = JSON.parse(fs.readFileSync(new URL("../content/learning-content.json", import.meta.url)));
const needles = ["expected_answer_id", "expected_reason_id", "reason_interpretations", "teacher_only"];
for (const item of content.items) needles.push(item.teacher_only.rationale.slice(0, 40));
for (const item of content.items) needles.push(item.scenario.slice(0, 40)); // whole content JSON must not be bundled

const root = fileURLToPath(new URL("../.next/static", import.meta.url));
if (!fs.existsSync(root)) {
  console.error("No .next/static directory. Run `npm run build` first.");
  process.exit(2);
}
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|mjs|json|txt)$/.test(e.name)) files.push(p);
  }
})(root);
let bad = 0;
for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  for (const n of needles) {
    if (text.includes(n)) {
      console.error(`LEAK: "${n.slice(0, 40)}" found in ${path.relative(root, f)}`);
      bad++;
    }
  }
}
console.log(`Scanned ${files.length} client files for ${needles.length} key/content markers: ${bad ? `${bad} leak(s)` : "none found"}.`);
process.exit(bad ? 1 : 0);

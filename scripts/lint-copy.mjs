// Copy lint for the pilot's Hebrew texts (docs/design.md §2 "חוקי lint לטקסטים").
// Usage: node scripts/lint-copy.mjs [files...]   (default: apps/pilot/src/messages.ts)
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2).length ? process.argv.slice(2) : ['apps/pilot/src/messages.ts'];
const P = '(?:^|[^\\u0590-\\u05FF])[ובלהמשכ]?'; // optional one-letter Hebrew prefix at a word start
const rules = [
  { re: /\S\/[תהי](?![֐-׿])/u, why: 'gender slash (e.g. "יועץ/ת")' },
  { re: /·[תה](?![֐-׿])/u, why: 'gender dot' },
  { re: new RegExp(P + '(מוות|נשאר|נשארה|נשארו|סוף|הפסדת|פספסת|סיכון|חריג|פוטנציאל)(?![\\u0590-\\u05FF])', 'u'), why: 'forbidden word' },
  { re: /נוספה לך|נכנסה לחשבון/u, why: 'personal-causal phrasing' },
  { re: new RegExp(P + '(תחזית|אבחון)(?![\\u0590-\\u05FF])', 'u'), why: '"תחזית" / "אבחון" only in disclaimer keys', disclaimerOk: true },
  { re: /[֐-׿][^'`\n]*\s[=~]\s/u, why: '"=" or "~" inside Hebrew text' },
];
let bad = 0;
for (const f of files) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (/^\s*\/\//.test(line)) return; // comments
    const isDisclaimer = /\bdisclaimer\w*\s*:/.test(line);
    for (const r of rules) {
      if (r.disclaimerOk && isDisclaimer) continue;
      const m = line.match(r.re);
      if (m) {
        bad++;
        console.log(`${f}:${i + 1}: ${r.why}: …${m[0].trim()}…`);
      }
    }
  });
}
if (bad) {
  console.log(`\n${bad} copy problem(s).`);
  process.exit(1);
}
console.log('copy lint: OK');

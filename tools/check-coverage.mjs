#!/usr/bin/env node
// Coverage check: what user-visible English is still left in a localized bundle?
//
//   node tools/check-coverage.mjs <original-bundle.js> <patched-bundle.js> <translations.tsv> [--out residual.tsv]
//
// The two bundles are decompressed assets from the user's own installation
// (see docs/DEVELOPMENT.md). They are NEVER committed to this repository.
//
// It extracts every string literal (double-quoted, single-quoted, template),
// classifies it, drops code/library noise, and reports the ones that are still
// English after localization. Exit code:
//     0  no high-confidence UI text left untranslated
//     2  high-confidence leftovers found (a real gap)
//     1  usage / input error

import { readFileSync, writeFileSync } from 'node:fs';

const [origPath, patchedPath, tsvPath, ...rest] = process.argv.slice(2);
if (!origPath || !patchedPath || !tsvPath) {
  console.error('usage: node tools/check-coverage.mjs <original-bundle.js> <patched-bundle.js> <translations.tsv> [--out residual.tsv]');
  process.exit(1);
}
let outPath = 'residual.tsv';
const outIdx = rest.indexOf('--out');
if (outIdx >= 0 && rest[outIdx + 1]) outPath = rest[outIdx + 1];

const readText = (p) => {
  const b = readFileSync(p);
  const s = b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? b.subarray(3) : b;
  return s.toString('utf8');
};

// ---------- translation table ----------
const tsv = readText(tsvPath).split('\n');
const translated = new Set();
let tsvRows = 0;
for (let i = 0; i < tsv.length; i++) {
  const line = tsv[i];
  if (!line.trim()) continue;
  const f = line.split('\t');
  if (i === 0 && f[0].trim().toLowerCase() === 'id') continue;
  if (f.length < 3) continue;
  translated.add(f[1]);
  tsvRows++;
}
if (!translated.size) {
  console.error('no rows parsed out of the translation table');
  process.exit(1);
}

// ---------- literals ----------
const PATTERNS = [
  ['dq', /"((?:[^"\\\n]|\\.){1,400})"/g],
  ['sq', /'((?:[^'\\\n]|\\.){1,400})'/g],
  ['bt', /`((?:[^`\\\n]|\\.){1,400})`/g],
];

const UI_ATTR = /(children|placeholder|title|aria-label|alt|label|labels|message|description|heading|tooltip|hint|note|confirmText|cancelText|emptyText|empty|subtitle|caption|text|content|prompt|error|errors|name|names|value|values|options|items|item|tab|tabs|group|groups|section|sections|sublabel|suffix|prefix|unit|units|button|buttons|action|actions|menu|menuitem|submenu|badge|tag|tags|status|state|step|steps|field|fields|format|formats|preset|presets|mode|modes|type|types|kind|role|toast|dialog|modal|popover|dropdown|select)\s*:\s*$/i;

const UTIL = new Set(['flex','grid','block','inline','hidden','contents','table','absolute','relative','fixed','sticky','static','truncate','container','antialiased','italic','underline','grow','shrink','glass','group','peer','isolate','prose','border','shadow','outline','ring','divide','uppercase','lowercase','capitalize','sr-only','none','auto','inherit','initial','unset','transparent','currentColor']);
const BAD_SUB = ['rgba(','linear-gradient','radial-gradient','konva','Change.','\\u','http','data:','function','=>','===','!==','typeof','JSON.','undefined','NaN','[object','THREE.','WebGL','hls','codec','SAMPLE-AES','KEYFORMAT','PES packet','deprecated','posthog','PostHog','M3U8','CMAF','ArrayBuffer','OffscreenCanvas','VideoSample','initTarget','zIndex','.konva','wasm','WASM','ffmpeg'];
const HEXCOL = /^#?[0-9a-fA-F]{3,8}$/;
const CSSISH = /^[-a-z0-9:\[\]/._%]+$/;

function looksCode(s) {
  if (!/[A-Za-z]/.test(s)) return true;
  if (HEXCOL.test(s)) return true;
  if (BAD_SUB.some((b) => s.includes(b))) return true;
  if (/^(#|!|--|var\(|@|\.|\/|http|www\.)/.test(s)) return true;
  if (/[}\);\{(,]$/.test(s)) return true;
  if (/[<>{}\\=]/.test(s)) return true;
  if (/\b\w+\.\w+\.\w+\b/.test(s) || /[_$]/.test(s)) return true;
  if (/^[Mm][\d\s.,-]{6,}$/.test(s)) return true;
  if (/\.(js|mjs|css|png|jpg|jpeg|webp|svg|mp4|mov|json|wasm|woff2?|glb|gltf|hdr|ttf|otf)$/i.test(s)) return true;
  const toks = s.split(/\s+/).filter(Boolean);
  if (toks.length >= 5 && toks.every((t) => /^[a-z]{3,}$/.test(t))) return true;
  if (toks.length >= 2) {
    const classy = toks.filter((t) => UTIL.has(t) || /[-:/[%]/.test(t)).length;
    if (classy >= toks.length * 0.5) return true;
  }
  if (toks.length === 1) {
    const t = toks[0];
    if (UTIL.has(t)) return true;
    if (CSSISH.test(t) && !/^[A-Z][a-z]{1,20}$/.test(t)) return true;
  }
  if (/^[a-z0-9\-_.:/]+$/.test(s) || /^[A-Z0-9_]+$/.test(s)) return true;
  if (/\$\{/.test(s)) return true;
  return false;
}

function looksUi(s) {
  if (looksCode(s)) return false;
  if (!/[aeiouAEIOU]/.test(s)) return false;
  if (s.trim().includes(' ')) return true;
  return /^[A-Z][A-Za-z0-9'\-.\+/]*$/.test(s.trim());
}

const occ = new Map();
for (const [kind, rx] of PATTERNS) {
  for (const m of readText(origPath).matchAll(rx)) {
    const s = m[1];
    if (!s || s.length > 400) continue;
    const rec = occ.get(s) ?? { n: 0, ctx: [], kind: new Set() };
    rec.n++;
    rec.kind.add(kind);
    if (rec.ctx.length < 3) rec.ctx.push(readTextCache(origPath).slice(Math.max(0, m.index - 90), m.index));
    occ.set(s, rec);
  }
}

// cache the file once (the helper above would otherwise re-read it per match)
function readTextCache(p) {
  readTextCache.cache ??= readText(p);
  return readTextCache.cache;
}

const patched = readText(patchedPath);
const rows = [];
for (const [s, rec] of occ) {
  if (translated.has(s.trim())) continue;
  if (!looksUi(s)) continue;
  if (!patched.includes(s.trim())) continue;                 // gone from the patched bundle
  rows.push({ n: rec.n, ctx: rec.ctx.some((c) => UI_ATTR.test(c)) ? 1 : 0, kinds: [...rec.kind].join('/'), en: s, sample: (rec.ctx[0] ?? '').trim().slice(-70) });
}
rows.sort((a, b) => b.n - a.n || a.en.localeCompare(b.en));

const lines = ['occurrences\tui_context\tliteral_kind\tenglish\tcontext'];
const clean = (s) => s.replace(/[\t\r\n]+/g, ' ').trim();
for (const r of rows) lines.push(`${r.n}\t${r.ctx}\t${r.kinds}\t${clean(r.en)}\t${clean(r.sample)}`);
writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');

const high = rows.filter((r) => r.ctx);
console.log(`translation table rows      : ${tsvRows}`);
console.log(`english literals in original: ${occ.size}`);
console.log(`still-english candidates    : ${rows.length}`);
console.log(`  with UI context (high conf): ${high.length}`);
console.log(`  multi-word                 : ${rows.filter((r) => r.en.trim().includes(' ')).length}`);
console.log(`  single words               : ${rows.filter((r) => !r.en.trim().includes(' ')).length}`);
console.log(`written: ${outPath}`);
if (high.length) {
  console.log('\nhigh-confidence leftovers:');
  for (const r of high.slice(0, 40)) console.log(`  ${r.ctx ? 'CTX' : '   '} ${String(r.n).padStart(3)}  ${r.en.slice(0, 80)}`);
}
process.exit(high.length ? 2 : 0);

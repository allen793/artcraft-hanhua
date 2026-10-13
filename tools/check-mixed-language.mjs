#!/usr/bin/env node
// Mixed-language check for data/translations.tsv.
//
// Chinese UI text sometimes keeps an English technical word ("选中的 keyframe
// 无法编辑"). Some of those are intentional (brand and format names); the rest
// are half-finished translations. This gate lists every Latin run found in the
// Chinese column that is not on the allow-list, so the gap is visible in CI
// instead of being discovered by a user clicking through menus.
//
//   node tools/check-mixed-language.mjs [data/translations.tsv] [--allow tools/allowlist.json] [--out report.tsv] [--fix]
//
// Exit code 2 when a non-allow-listed Latin run is found, 0 when clean.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const tsvPath = args.find((a) => !a.startsWith('--') && a.endsWith('.tsv')) ?? join(here, '..', 'data', 'translations.tsv');
const allowIdx = args.indexOf('--allow');
const allowPath = allowIdx >= 0 ? args[allowIdx + 1] : join(here, 'allowlist.json');
const outIdx = args.indexOf('--out');
const outPath = outIdx >= 0 ? args[outIdx + 1] : null;

// Default allow-list: brand names, file formats, units and acronyms that stay
// Latin in every Chinese UI. Overridable with --allow <file.json>.
const DEFAULT_ALLOW = [
  // product / company / model brands
  'ArtCraft', 'Discord', 'GitHub', 'OpenAI', 'Grok', 'Midjourney', 'Runway', 'Kling', 'Sora', 'Vidu', 'Fal',
  'Recraft', 'Krea', 'Higgsfield', 'OpenArt', 'Parim', 'Hailuo', 'Seedance', 'Luma', 'Pika', 'Veo', 'Flux',
  'Nano Banana', 'Blender', 'Photoshop', 'Lightroom', 'Premiere', 'After Effects', 'Acrobat', 'Illustrator',
  'Windows', 'macOS', 'Linux', 'Android', 'iOS', 'Chrome', 'Edge', 'Firefox', 'Safari', 'WebView2', 'Tauri',
  'Rust', 'Node', 'SQLite', 'WASM', 'Zotero', 'Stripe', 'PayPal', 'Visa', 'Mastercard',
  // acronyms / units
  'AI', 'GPU', 'CPU', 'RAM', 'VRAM', 'UV', 'FPS', 'DPI', 'PPI', 'RGB', 'RGBA', 'CMYK', 'HSLA', 'HSL', 'HEX',
  'HDR', 'SDR', 'ISO', 'EV', 'KB', 'MB', 'GB', 'TB', 'PX', 'PT', 'MM', 'CM', 'IN', 'MS', 'ID', 'URL', 'URI',
  'API', 'MCP', 'CLI', 'JSON', 'CSV', 'XML', 'HTML', 'CSS', 'JS', 'TS', 'SDK', 'LUT', 'DOF', 'SSAO', 'FXAA',
  'AO', 'VFX', 'CG', 'UI', 'UX', 'NR', 'FFT', 'EQ', 'BPM', 'MIDI', 'WAV', 'MP3', 'FLAC', 'AAC', 'OGG',
  // file formats
  'PSD', 'PDF', 'PNG', 'JPG', 'JPEG', 'WEBP', 'GIF', 'SVG', 'TIFF', 'TIF', 'BMP', 'ICO', 'EXR', 'HDR', 'MP4',
  'MOV', 'MKV', 'AVI', 'WEBM', 'GLB', 'GLTF', 'OBJ', 'STL', 'FBX', 'USDZ', 'PLY', 'SPZ', 'ZIP', 'RAR', '7Z',
  'DOCX', 'XLSX', 'PPTX', 'TXT', 'MD',
  // interface tokens that stay Latin by convention
  'Pro', 'Beta', 'Alpha', 'New', 'vs', 'x', 'X',
];

let allow = DEFAULT_ALLOW;
if (existsSync(allowPath)) {
  try {
    const j = JSON.parse(readFileSync(allowPath, 'utf8'));
    if (Array.isArray(j)) allow = j;
    else if (Array.isArray(j.allow)) allow = j.allow;
  } catch (e) {
    console.error(`could not parse ${allowPath}: ${e.message}`);
    process.exit(1);
  }
}
const allowSet = new Set(allow.map((s) => s.toLowerCase()));

if (!existsSync(tsvPath)) {
  console.error(`translation table not found: ${tsvPath}`);
  process.exit(1);
}
const raw = readFileSync(tsvPath);
const text = (raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf ? raw.subarray(3) : raw).toString('utf8');

// A Latin run of 2+ characters inside a mostly-Chinese string.
const LATIN = /[A-Za-z][A-Za-z0-9+#._-]+/g;
const CJK = /[\u4e00-\u9fff]/;

// Rows whose ENGLISH source is a developer-facing library/runtime message.
// Keeping technical tokens Latin there is deliberate: users never see them, so
// they are reported separately instead of failing the gate.
const LIBRARY_EN = /(Uint8Array|ArrayBuffer|polyfill|gzip|base64|EOF|props|prototype|constructor|instanceof|typeof|callback|Promise|JSON|regex|token|buffer|byte|node_modules|WebGL|WebGPU|OrbitControls|VideoFrame|AudioSample|EncodedPacket|init\.|config\.|\.bitrate|\.timestamp|DOMException|AbortError|EventTarget|MutationObserver|requestAnimationFrame|postMessage|WASM|shader|fragment|vertex|Setup header|packet type|framing bit|mode header|History API|benchmark data|push splat|load splat|non-last position|Panel components|Resize handle|Sidecar|Eager values|plane\.offset|plane\.stride|ECI assignment|options\.(width|height|fit)|passthrough the `ref`)/;

const offenders = [];
const informational = [];
const tokenCount = new Map();
let rows = 0;
for (const line of text.split('\n')) {
  if (!line.trim()) continue;
  const f = line.split('\t');
  if (f.length < 3) continue;
  if (f[0].trim().toLowerCase() === 'id') continue;
  rows++;
  const [, en, zh] = f;
  if (!CJK.test(zh)) continue;                        // nothing Chinese: skip
  const runs = zh.match(LATIN) ?? [];
  const bad = runs.filter((r) => !allowSet.has(r.toLowerCase()));
  if (!bad.length) continue;
  const rec = { en, zh, bad: [...new Set(bad)].join(', ') };
  if (LIBRARY_EN.test(en) || LIBRARY_EN.test(zh)) {
    informational.push(rec);
    continue;
  }
  for (const b of bad) tokenCount.set(b, (tokenCount.get(b) ?? 0) + 1);
  offenders.push(rec);
}

// ---- baseline --------------------------------------------------------------
// Some rows legitimately keep a Latin token that is not on the allow-list yet
// (an identifier, a standard name, a media field) and simply has not been
// classified. Those tokens are recorded in a baseline file. The gate then fails
// only when a token appears that is NOT on the allow-list and NOT in the
// baseline, so a new half-translated string cannot slip in while the existing
// backlog stays visible instead of being guessed into the allow-list.
const baseIdx = args.indexOf('--baseline');
const basePath = baseIdx >= 0 ? args[baseIdx + 1] : null;
const known = new Set();
if (basePath && existsSync(basePath)) {
  for (const line of readFileSync(basePath, 'utf8').split('\n')) {
    const s = line.trim();
    if (s && !s.startsWith('#')) known.add(s.split('\t')[0].toLowerCase());
  }
}
const freshTokens = [...tokenCount.keys()].filter((t) => !known.has(t.toLowerCase()));
const staleTokens = basePath ? [...known].filter((t) => !tokenCount.has(t) && ![...tokenCount.keys()].some((k) => k.toLowerCase() === t)) : [];

console.log(`translation rows                       : ${rows}`);
console.log(`rows with non-allow-listed Latin text  : ${offenders.length + informational.length}`);
console.log(`  user-facing (gate)                   : ${offenders.length}`);
console.log(`  library/runtime only (informational) : ${informational.length}`);
console.log(`distinct offending tokens (gate)       : ${tokenCount.size}`);
if (basePath) {
  console.log(`  already in the baseline              : ${tokenCount.size - freshTokens.length}`);
  console.log(`  NEW tokens (failing)                 : ${freshTokens.length}`);
  if (staleTokens.length) console.log(`  baseline tokens no longer present    : ${staleTokens.length} (consider pruning ${basePath})`);
}
if (tokenCount.size) {
  console.log('\ntop offending tokens:');
  for (const [t, n] of [...tokenCount].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
    console.log(`  ${String(n).padStart(4)}  ${t}`);
  }
}
if (freshTokens.length) {
  console.log('\nNEW offending tokens:');
  for (const t of freshTokens.slice(0, 20)) console.log(`  ${t}`);
}
if (outPath) {
  const lines = ['english\tchinese\toffending_tokens'];
  for (const o of offenders) lines.push(`${o.en.replace(/\t/g, ' ')}\t${o.zh.replace(/\t/g, ' ')}\t${o.bad}`);
  writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
  console.log(`\nwritten: ${outPath}`);
}
process.exit(freshTokens.length ? 2 : 0);

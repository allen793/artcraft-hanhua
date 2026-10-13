/**
 * 主程序补丁算法测试（`src/artcraft-patch.mjs`）。
 *
 * 分三层：
 * 1. 替换规则（排序、大小写、不 trim、转义、跨引号/重叠规则）
 * 2. CSP（长度不变、旧串唯一、通用替换、集合自检、空脚本跳过）
 * 3. phf 定位与 PE 结构（合成 PE，覆盖字段序 `loc+24` / `loc+32`、新段、SizeOfImage 对齐）
 *
 * 完整端到端（77 MB 原件 + brotli q11 重压）单测里默认跳过，见文件末尾，
 * 设 `ARTCRAFT_FULL_TEST=1` 才会跑。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
  ARTCRAFT_PATCH_VERSION,
  BROTLI_PARAMS,
  PHF_ENTRY_SIZE,
  REFERENCE_FACTS,
  applyPatchToImage,
  applyReplacementPlan,
  buildReplacementPlan,
  compareImages,
  cspHashOf,
  digestToCspBase64,
  extractScriptBodies,
  findPhfEntries,
  inlineScriptHashes,
  normalizeLineEndings,
  normalizeTranslations,
  parsePe,
  parseTranslationTable,
  patchMainApp,
  readEmbeddedAssets,
  recomputeCspHashes,
  replaceSequentially,
  verifyCspHashes,
} from '../src/artcraft-patch.mjs';
import { tmpdir, writeBytesDeep } from './helpers.mjs';

/* ══════════════════════════════════════════════════════════════════════
 * 1. 翻译表解析
 * ══════════════════════════════════════════════════════════════════════ */

test('parseTranslationTable：标准表头 + 不 trim 英文', () => {
  const text = ['id\tenglish\tchinese', '0001\tCreate\t创建', '2293\t layers. ok\t 层数。'].join('\n');
  const r = parseTranslationTable(text);
  assert.equal(r.ok, true, r.errors.join('；'));
  assert.equal(r.hadHeader, true);
  assert.deepEqual(r.columns, ['id', 'english', 'chinese']);
  assert.equal(r.entries.length, 2);
  assert.equal(r.entries[1].en, ' layers. ok', '英文首尾空格必须原样保留');
  assert.equal(r.entries[1].zh, ' 层数。', '中文首尾空格也必须原样保留');
});

test('parseTranslationTable：列顺序不同也能按表头名字定位', () => {
  const text = ['chinese\tid\tenglish', '创建\t0001\tCreate', '取消\t0002\tCancel'].join('\n');
  const r = parseTranslationTable(text);
  assert.equal(r.ok, true, r.errors.join('；'));
  assert.deepEqual(r.columns, ['chinese', 'id', 'english']);
  assert.deepEqual(
    r.entries.map((e) => [e.id, e.en, e.zh]),
    [
      ['0001', 'Create', '创建'],
      ['0002', 'Cancel', '取消'],
    ],
  );
});

test('parseTranslationTable：没有表头时按位置约定解析（并给 warning）', () => {
  const text = ['0001\tCreate\t创建', '0002\tCancel\t取消'].join('\n');
  const r = parseTranslationTable(text);
  assert.equal(r.ok, true, r.errors.join('；'));
  assert.equal(r.hadHeader, false);
  assert.equal(r.entries.length, 2);
  assert.match(r.warnings.join('；'), /未识别到表头/);
});

test('parseTranslationTable：缺列 / 列数不对 / 条数不符都报错', () => {
  const bad = parseTranslationTable('id\tenglish\tchinese\n0001\tCreate\n');
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join('；'), /列数不对/);

  const short = parseTranslationTable('id\tenglish\tchinese\n0001\t\tabc\n');
  assert.equal(short.ok, false);
  assert.match(short.errors.join('；'), /english 字段是空的/);

  const counted = parseTranslationTable('id\tenglish\tchinese\n0001\tCreate\t创建\n', {
    requireCount: 2773,
  });
  assert.equal(counted.ok, false);
  assert.match(counted.errors.join('；'), /翻译条数不符：期望 2773 条，实际 1 条/);
});

test('parseTranslationTable：CRLF / 末尾空行都兼容', () => {
  const r = parseTranslationTable('id\tenglish\tchinese\r\n0001\tCreate\t创建\r\n\r\n');
  assert.equal(r.ok, true, r.errors.join('；'));
  assert.equal(r.entries.length, 1);
  assert.equal(r.entries[0].en, 'Create');
});

/* ══════════════════════════════════════════════════════════════════════
 * 2. 替换规则
 * ══════════════════════════════════════════════════════════════════════ */

test('buildReplacementPlan：每条译文生成 dq 与 sq 两个搜索键（英文原样、各自转义）', () => {
  const plan = buildReplacementPlan([{ id: '0001', en: 'Delete', zh: '删除' }]);
  assert.equal(plan.length, 2);
  const byQuote = Object.fromEntries(plan.map((r) => [r.quote, r]));
  assert.equal(byQuote['"'].from, '"Delete"');
  assert.equal(byQuote['"'].to, '"删除"');
  assert.equal(byQuote["'"].from, "'Delete'");
  assert.equal(byQuote["'"].to, "'删除'");
  // 英文键必须原样存储，不预先转义
  assert.equal(byQuote['"'].en, 'Delete');
  assert.equal(byQuote["'"].en, 'Delete');
});

test('buildReplacementPlan：单引号版本按目标分隔符转义（sq 转义 \' ，dq 转义 "）', () => {
  const plan = buildReplacementPlan([{ id: '0001', en: 'Confirm', zh: "它's 好" }]);
  const byQuote = Object.fromEntries(plan.map((r) => [r.quote, r]));
  assert.equal(byQuote["'"].to, "'它\\'s 好'");
  assert.equal(byQuote['"'].to, '"它\'s 好"', '双引号版本不需要转义单引号');
});

test('替换：单引号包裹的界面文案也能命中（实测 66 条候选）', () => {
  const plan = buildReplacementPlan([{ id: '0001', en: 'Type "DELETE" to confirm', zh: '输入 "DELETE" 以确认' }]);
  const text = `children: 'Type "DELETE" to confirm'`;
  const r = applyReplacementPlan(text, plan);
  assert.equal(r.text, `children: '输入 "DELETE" 以确认'`);
  assert.equal(r.applications, 1);
});

test('替换：英文自身含同种引号时不生成那种搜索键（避免畸形字面量）', () => {
  const plan = buildReplacementPlan([{ id: '0001', en: `it's fine`, zh: '没问题' }]);
  assert.deepEqual(plan.map((r) => r.quote), ['"'], '含单引号的英文不生成 sq 键');
  const r = applyReplacementPlan(`a "it's fine" b`, plan);
  assert.equal(r.text, `a "没问题" b`);
});

test('buildReplacementPlan：按字面量长度从长到短排序', () => {
  const plan = buildReplacementPlan([
    { id: '1', en: 'Create', zh: '创建' },
    { id: '2', en: 'Create Image', zh: '创建图像' },
    { id: '3', en: 'Edit Image', zh: '编辑图像' },
    { id: '4', en: 'Edit', zh: '编辑' },
  ]);
  assert.equal(plan.length, 8, '4 条译文 × 2 种分隔符');
  const lens = plan.map((r) => r.from.length);
  for (let i = 1; i < lens.length; i += 1) assert.ok(lens[i - 1] >= lens[i], '必须降序');
  // 每种分隔符内部也必须是长的在前
  for (const q of ['"', "'"]) {
    const own = plan.filter((r) => r.quote === q).map((r) => r.en);
    assert.deepEqual(own, ['Create Image', 'Edit Image', 'Create', 'Edit']);
  }
});

test('替换排序：长的先落地，短的不会破坏长串', () => {
  const text = 'x "Create Image" y "Create" z "Edit Image" w "Edit"';
  const plan = buildReplacementPlan([
    { id: '1', en: 'Create', zh: '创建' },
    { id: '2', en: 'Create Image', zh: '创建图像' },
    { id: '3', en: 'Edit', zh: '编辑' },
    { id: '4', en: 'Edit Image', zh: '编辑图像' },
  ]);
  const r = applyReplacementPlan(text, plan);
  assert.equal(r.text, 'x "创建图像" y "创建" z "编辑图像" w "编辑"');
  const applied = Object.fromEntries(r.hits.map((h) => [h.en, h.applied]));
  assert.deepEqual(applied, { Create: 1, 'Create Image': 1, Edit: 1, 'Edit Image': 1 });
});

test('替换：大小写敏感（3D model / 3D Model 不能互串）', () => {
  const plan = buildReplacementPlan([
    { id: '1', en: '3D model', zh: '3D 模型' },
    { id: '2', en: '3D Model', zh: '3D 模型（大写）' },
  ]);
  const r = applyReplacementPlan('a "3D model" b "3D Model" c "3D MODEL"', plan);
  assert.equal(r.text, 'a "3D 模型" b "3D 模型（大写）" c "3D MODEL"');
  assert.equal(
    r.misses.filter((m) => m.kind === 'dq').length,
    0,
    '两种大小写写法都必须精确命中，且 "3D MODEL" 不能被子串误伤',
  );
});

test('替换：绝不 trim，首尾带空格的英文原样匹配', () => {
  const plan = buildReplacementPlan([{ id: '2293', en: ' layers. Recommended', zh: ' 图层。推荐' }]);
  const hit = applyReplacementPlan('k " layers. Recommended" k', plan);
  assert.equal(hit.text, 'k " 图层。推荐" k');
  assert.equal(hit.hits.filter((h) => h.kind === 'dq')[0].applied, 1);

  const miss = applyReplacementPlan('k "layers. Recommended" k', plan);
  assert.equal(miss.text, 'k "layers. Recommended" k');
  assert.equal(miss.applications, 0);
  assert.equal(miss.hits.length, 0);
});

test('替换：只动带引号的完整字面量，裸文本不碰', () => {
  const plan = buildReplacementPlan([{ id: '1', en: 'Create', zh: '创建' }]);
  const r = applyReplacementPlan('const s = "Create"; const t = Create;', plan);
  assert.equal(r.text, 'const s = "创建"; const t = Create;');
});

test('替换：译文含 " 与 \\ 时转义', () => {
  const plan = buildReplacementPlan([{ id: '1', en: 'Say', zh: '说 "你好" \\ 世界' }]);
  assert.equal(plan[0].to, '"说 \\"你好\\" \\\\ 世界"');
  const r = applyReplacementPlan('q "Say" q', plan);
  assert.equal(r.text, 'q "说 \\"你好\\" \\\\ 世界" q');
});

test('替换：跨引号的规则也要能命中（实测有 4 条这种）', () => {
  const plan = buildReplacementPlan([
    { id: '1869', en: ' but also contains the following legacy lifecycles:', zh: ' 但还包含旧版生命周期：' },
  ]);
  const text = 'x " uses " + a + " but also contains the following legacy lifecycles:" + n';
  const r = applyReplacementPlan(text, plan);
  assert.equal(r.text, 'x " uses " + a + " 但还包含旧版生命周期：" + n');
  assert.equal(r.hits.filter((h) => h.kind === 'dq')[0].applied, 1);
});

test('替换：规则顺序（长的先来）与逐条 replace 语义逐字符一致', () => {
  const rules = [
    { id: '1541', en: ' + a + ', zh: ' + a + ' }, // 空替换（译文与原文相同）
    { id: '1869', en: ' but also x:', zh: ' 但是 x：' },
    { id: '0001', en: 'Create', zh: '创建' },
    { id: '0002', en: 'Create Image', zh: '创建图像' },
    { id: '0003', en: 'a', zh: '一' },
  ];
  const plan = buildReplacementPlan(rules);
  const text = 'q " Create Image" "Create" " + a + " but also x:" "a"';
  const mine = applyReplacementPlan(text, plan);
  const reference = replaceSequentially(text, plan);
  assert.equal(mine.text, reference, '优化实现必须与逐条 replace 完全相同');
});

test('替换：译文与原文相同（文本不变，applied = 0，与参考实现一致）', () => {
  const plan = buildReplacementPlan([{ id: '1', en: 'Beeble SwitchX', zh: 'Beeble SwitchX' }]);
  const r = applyReplacementPlan('"Beeble SwitchX" and "Beeble SwitchX"', plan);
  assert.equal(r.text, '"Beeble SwitchX" and "Beeble SwitchX"');
  assert.equal(r.applications, 0);
  assert.equal(r.hits.length, 0, '文本没变 → applied = pre - post = 0，不算命中');
});

test('替换：等长替换与变长替换混合（dq 命中、sq 不命中）', () => {
  const plan = buildReplacementPlan([
    { id: '1', en: 'OK', zh: '好' },
    { id: '2', en: 'Note', zh: 'Note' },
    { id: '3', en: 'Save', zh: '保存' },
  ]);
  const r = applyReplacementPlan('"OK" "Note" "Save"', plan);
  assert.equal(r.text, '"好" "Note" "保存"');
  const appliedByKind = (kind) =>
    Object.fromEntries(r.hits.filter((h) => h.kind === kind).map((h) => [h.en, h.applied]));
  assert.deepEqual(appliedByKind('dq'), { OK: 1, Save: 1 });
  assert.deepEqual(appliedByKind('sq'), {}, '单引号字面量原文里没有');
  assert.deepEqual(
    [...new Set(r.misses.filter((m) => m.kind === 'dq').map((m) => m.en))],
    ['Note'],
    '译文与原文相同 → applied = 0',
  );
});

test('normalizeTranslations：数组 / 对象两种入参', () => {
  const fromArray = normalizeTranslations([
    { id: '0001', en: 'Create', zh: '创建' },
    { id: '0002', english: 'Cancel', chinese: '取消' },
  ]);
  assert.deepEqual(fromArray, [
    { id: '0001', en: 'Create', zh: '创建' },
    { id: '0002', en: 'Cancel', zh: '取消' },
  ]);
  const fromObject = normalizeTranslations({ Create: '创建' });
  assert.deepEqual(fromObject, [{ id: '1', en: 'Create', zh: '创建' }]);
});

test('接口版本已 +1（算法接入后语义变了）', () => {
  assert.equal(ARTCRAFT_PATCH_VERSION, 2);
});

/* ══════════════════════════════════════════════════════════════════════
 * 3. CSP
 * ══════════════════════════════════════════════════════════════════════ */

test('CSP：digestToCspBase64 输出 44 字符且与 Buffer.encode 一致', () => {
  const digest = crypto.createHash('sha256').update('hello').digest();
  const mine = digestToCspBase64(digest);
  assert.equal(mine.length, 44);
  assert.equal(mine, digest.toString('base64'));
  assert.match(mine, /^[A-Za-z0-9+/]{43}=$/);
  assert.throws(() => digestToCspBase64(Buffer.alloc(31)), /32 字节/);
});

test('recomputeCspHashes：按旧哈希原位替换、长度不变、旧串只出现一次', () => {
  const oldBytes = Buffer.from('const a = 1;\n');
  const newBytes = Buffer.from('const a = 2;\n');
  const oldHash = cspHashOf(oldBytes);
  const newHash = cspHashOf(newBytes);
  assert.notEqual(oldHash, newHash);

  const image = Buffer.concat([
    Buffer.from('CSP: script-src '),
    Buffer.from(oldHash, 'latin1'),
    Buffer.from(' style-src '),
    Buffer.from(cspHashOf(Buffer.from('body{}')), 'latin1'),
    Buffer.alloc(64, 0xaa),
  ]);

  const r = recomputeCspHashes({
    image,
    decompressedAssets: [{ path: '/assets/index-abc.js', bytes: newBytes, previousBytes: oldBytes, changed: true }],
  });
  assert.equal(r.changed, true);
  assert.equal(r.replacements.length, 1);
  assert.equal(r.replacements[0].oldHash, oldHash);
  assert.equal(r.replacements[0].newHash, newHash);
  assert.equal(r.replacements[0].length, 51);
  assert.deepEqual(r.scriptSrc.map((e) => e.replaced), [true]);
  assert.deepEqual(r.styleSrc, []);

  // 长度不变 + 旧串零残留 + 新串出现
  assert.equal(r.image.length, image.length, 'CSP 替换不能改变镜像长度');
  const asText = r.image.toString('latin1');
  assert.equal(asText.includes(oldHash), false, '旧哈希必须零残留');
  assert.equal(asText.includes(newHash), true);
  assert.equal(r.image.subarray(0, image.length).length, image.length);
});

test('recomputeCspHashes：旧串出现多次时拒绝替换', () => {
  const oldBytes = Buffer.from('x');
  const oldHash = cspHashOf(oldBytes);
  const image = Buffer.from(`${oldHash} ... ${oldHash}`, 'latin1');
  assert.throws(
    () =>
      recomputeCspHashes({
        image,
        decompressedAssets: [{ path: '/a.js', bytes: Buffer.from('y'), previousBytes: oldBytes, changed: true }],
      }),
    /出现了多次/,
  );
});

test('recomputeCspHashes：旧哈希不在 CSP 里时跳过（HTML 就是这种情况），不报错、不乱改', () => {
  const oldBytes = Buffer.from('<html lang="en">');
  const image = Buffer.from('CSP: sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', 'latin1');
  const r = recomputeCspHashes({
    image,
    decompressedAssets: [
      { path: '/index.html', bytes: Buffer.from('<html lang="zh">'), previousBytes: oldBytes, changed: true },
    ],
  });
  assert.equal(r.changed, false);
  assert.equal(r.replacements.length, 0);
  assert.equal(r.image.equals(image), true, '跳过的资源不允许改镜像');
  assert.equal(r.skipped.length, 1);
  assert.match(r.skipped[0].reason, /不在 exe 的 CSP 明文串里/);
  assert.match(r.skipped[0].oldHash ?? r.skipped[0].previousHash ?? '', /^sha256-/);
});

test('recomputeCspHashes：标记为 changed 却没给 previousBytes 要报错', () => {
  assert.throws(
    () =>
      recomputeCspHashes({
        image: Buffer.alloc(16),
        decompressedAssets: [{ path: '/a.js', bytes: Buffer.from('x'), changed: true }],
      }),
    /previousBytes/,
  );
});

test('recomputeCspHashes：没有镜像时只算哈希不替换', () => {
  const r = recomputeCspHashes({
    decompressedAssets: [
      { path: '/a.js', bytes: Buffer.from('x'), previousBytes: Buffer.from('y'), changed: true },
    ],
  });
  assert.equal(r.replacements.length, 0);
  assert.equal(r.hashes.length, 1);
  assert.match(r.hashes[0].newHash, /^sha256-/);
});

test('verifyCspHashes：集合比对 A ⊆ B，B−A 如实报告，旧哈希残留报错', () => {
  const script = '\n  gtag("config", "X");\n';
  const html = `<script>${script}</script><script></script>`;
  const scriptHash = cspHashOf(Buffer.from(script, 'utf8'));
  const otherHash = 'sha256-8thwg6bVGZ6K3E0s3EvpH68kDCV2sN4bOREtAl04cLM=';
  const image = Buffer.from(`csp ${scriptHash} ${otherHash}`, 'latin1');

  const ok = verifyCspHashes({ image, htmlAssets: [{ path: '/index.html', text: html }] });
  assert.equal(ok.ok, true, ok.problems.join('；'));
  assert.deepEqual(ok.scriptHashes, [scriptHash]);
  assert.deepEqual(ok.extras, [otherHash], 'B−A 要如实列出非脚本来源哈希');
  assert.deepEqual(ok.missing, []);

  const missing = verifyCspHashes({ image: Buffer.from('csp nothing', 'latin1'), htmlAssets: [{ path: '/index.html', text: html }] });
  assert.equal(missing.ok, false);
  assert.match(missing.problems.join('；'), /找不到/);

  const residual = verifyCspHashes({
    image,
    htmlAssets: [{ path: '/index.html', text: html }],
    oldHashes: ['sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='],
  });
  assert.equal(residual.ok, true, '没残留就不该报错');
  const residual2 = verifyCspHashes({
    image,
    htmlAssets: [{ path: '/index.html', text: html }],
    oldHashes: [otherHash],
  });
  assert.equal(residual2.ok, false);
  assert.match(residual2.problems.join('；'), /旧 CSP 哈希仍然残留/);
});

test('CSP：换行归一化 CRLF/CR → LF，且空脚本不产生哈希', () => {
  assert.equal(normalizeLineEndings('a\r\nb\rc\n'), 'a\nb\nc\n');
  const crlf = '<script>\r\nfoo();\r\n</script>';
  const lf = '<script>\nfoo();\n</script>';
  assert.deepEqual(inlineScriptHashes(crlf), inlineScriptHashes(lf), 'CRLF 与 LF 必须算出同一个哈希');
  assert.deepEqual(inlineScriptHashes('<script></script>'), [], '空脚本不产生哈希（与 Tauri 实测一致）');
  assert.equal(extractScriptBodies('<script src="x"></script><script>y</script>').length, 2);
});

/* ══════════════════════════════════════════════════════════════════════
 * 4. phf 定位 / PE 结构（合成镜像）
 * ══════════════════════════════════════════════════════════════════════ */

const IMAGE_BASE = 0x140000000n;

/**
 * 造一张最小 PE32+：`.rdata` 里放 phf 条目（40 字节，字段序
 * hash / key.ptr / key.len / value.ptr / value.len），条目指向同一段里的
 * key 字符串与 brotli 流。用于覆盖 loc+24 / loc+32 的写入位置。
 */
function buildSyntheticPe({ entries, sectionAlignment = 0x1000, fileAlignment = 0x200, rdataSlots = 2 }) {
  const HEADERS = 0x400;
  const RDATA_RVA = sectionAlignment;
  const rdataRawSize = sectionAlignment * rdataSlots;
  const tableOff = 0; // 表从 .rdata 起点开始
  const strOff = entries.length * PHF_ENTRY_SIZE;
  let cursor = strOff + 0x400;
  const keyOffsets = new Map();
  let strCursor = strOff;
  for (const e of entries) {
    keyOffsets.set(e.key, strCursor);
    strCursor += Buffer.byteLength(e.key, 'latin1');
    strCursor = (strCursor + 7) & ~7;
  }
  cursor = strCursor;
  const valueOffsets = new Map();
  for (const e of entries) {
    cursor = (cursor + 7) & ~7;
    valueOffsets.set(e.key, cursor);
    cursor += e.compressed.length;
  }
  if (cursor > rdataRawSize) throw new Error('合成镜像太小，装不下内容');

  const rdata = Buffer.alloc(rdataRawSize);
  entries.forEach((e, i) => {
    const at = tableOff + i * PHF_ENTRY_SIZE;
    rdata.writeBigUInt64LE(BigInt(e.hash), at);
    rdata.writeBigUInt64LE(IMAGE_BASE + BigInt(RDATA_RVA + keyOffsets.get(e.key)), at + 8);
    rdata.writeBigUInt64LE(BigInt(Buffer.byteLength(e.key, 'latin1')), at + 16);
    rdata.writeBigUInt64LE(IMAGE_BASE + BigInt(RDATA_RVA + valueOffsets.get(e.key)), at + 24);
    rdata.writeBigUInt64LE(BigInt(e.compressed.length), at + 32);
  });
  for (const e of entries) {
    rdata.write(e.key, keyOffsets.get(e.key), 'latin1');
    e.compressed.copy(rdata, valueOffsets.get(e.key));
  }

  const image = Buffer.alloc(HEADERS + rdataRawSize, 0);
  image.write('MZ', 0, 'latin1');
  const peOff = 0x80;
  image.writeUInt32LE(peOff, 0x3c);
  image.write('PE\0\0', peOff, 'latin1');
  image.writeUInt16LE(0x8664, peOff + 4); // machine amd64
  image.writeUInt16LE(1, peOff + 6); // NumberOfSections
  image.writeUInt16LE(0xf0, peOff + 20); // SizeOfOptionalHeader
  const optOff = peOff + 24;
  image.writeUInt16LE(0x20b, optOff); // PE32+
  image.writeUInt32LE(sectionAlignment, optOff + 32);
  image.writeUInt32LE(fileAlignment, optOff + 36);
  image.writeBigUInt64LE(IMAGE_BASE, optOff + 24);
  image.writeUInt32LE(RDATA_RVA + rdataRawSize, optOff + 56); // SizeOfImage
  image.writeUInt32LE(HEADERS, optOff + 60); // SizeOfHeaders
  // 节表紧跟在可选头之后；再多留 3 个空节头的空间（40 字节一个）
  const secOff = optOff + 0xf0;
  const hdr = Buffer.alloc(40);
  hdr.write('.rdata', 0, 'latin1');
  hdr.writeUInt32LE(rdataRawSize, 8); // VirtualSize
  hdr.writeUInt32LE(RDATA_RVA, 12);
  hdr.writeUInt32LE(rdataRawSize, 16);
  hdr.writeUInt32LE(HEADERS, 20);
  hdr.writeUInt32LE(0x40000040, 36); // INITIALIZED_DATA | MEM_READ
  hdr.copy(image, secOff);
  rdata.copy(image, HEADERS);
  return image;
}

/** 合成镜像里的资产（key → 原始内容 → brotli 流）；前三个用真实 key 名，
 * 方便验证「必需 key 缺失」与「条目数偏离」这两种报错 */
function syntheticAssets() {
  const realKeys = ['/index.html', '/assets/index-IL-0eMku.js', '/assets/index-DTSJQQsq.css'];
  const list = [];
  for (let i = 0; i < 20; i += 1) {
    const key = realKeys[i] ?? `/assets/asset-${String(i).padStart(2, '0')}.js`;
    const raw =
      i === 0
        ? '<!DOCTYPE html><html lang="en"><head><title>ArtCraft</title></head><body></body></html>'
        : `const s${i} = "Create";\n`.repeat(i + 1);
    list.push({ key, raw, compressed: zlib.brotliCompressSync(Buffer.from(raw)) });
  }
  return list;
}

function syntheticImage(list = syntheticAssets(), rdataSlots = 2) {
  const entries = list.map((e, i) => ({
    key: e.key,
    compressed: e.compressed,
    hash: BigInt(0x1000 + i), // 只要求「不是指针、非 0」，定位器不看 hash 的语义
  }));
  return buildSyntheticPe({ entries, rdataSlots });
}

/** 把合成镜像里前 3 条的 hash 字段改成实测值（表起点固定 0x400，条目 40 字节） */
function withRealHashes(image) {
  const out = Buffer.from(image);
  const table = 0x400;
  for (const [i, key] of REFERENCE_FACTS.patchedAssets.entries()) {
    out.writeBigUInt64LE(BigInt(REFERENCE_FACTS.assetHashes[key]), table + i * PHF_ENTRY_SIZE);
  }
  return out;
}

/**
 * 造一张「条目数达标」的合成镜像：前 3 条是真实 key 且 hash 用实测值，
 * 其余条目用真实 key 名 + 任意内容把条目数补到 225（容差内）。
 * 用来覆盖 `patchMainApp` / `applyPatchToImage` 的**正常路径**。
 */
function buildPatchableImage() {
  const list = syntheticAssets().slice(0, 3);
  // 给「JS」那条塞进长短两个字面量，用来验证「长的先落地」
  list[1] = {
    ...list[1],
    raw: 'const a = "Create Image"; const b = "Create"; const c = \'Edit\';\n',
  };
  list[1].compressed = zlib.brotliCompressSync(Buffer.from(list[1].raw));
  for (let i = 3; i < REFERENCE_FACTS.phfEntryCountForTest; i += 1) {
    const raw = `// filler ${i}\nconst x${i} = "Create";\n`;
    list.push({
      key: `/assets/filler-${String(i).padStart(3, '0')}.js`,
      raw,
      compressed: zlib.brotliCompressSync(Buffer.from(raw)),
    });
  }
  return withRealHashes(syntheticImage(list, 24));
}

test('applyPatchToImage：正常路径（合成镜像）——换资源、追加只读段、改 phf、重算 CSP', () => {
  const image = buildPatchableImage();
  const before = image.length;
  const report = applyPatchToImage({
    image,
    translations: [
      { id: '0001', en: 'Create', zh: '创建' },
      { id: '0002', en: 'Create Image', zh: '创建图像' },
      { id: '0003', en: 'Edit', zh: '编辑' },
    ],
    expectedTableOffset: 0x400,
  });

  // 换了资源：/index.html 的 lang/title 与 JS 里的字面量都落地了
  const reread = readEmbeddedAssets(report.image, {
    decompressAll: true,
    expectedTableOffset: 0x400,
    expectedHashes: {},
  });
  const html = reread.assets.get('/index.html').raw.toString('utf8');
  assert.equal(html.includes('lang="zh"'), true);
  assert.equal(html.includes('<title>图坊</title>'), true);
  assert.equal(html.includes('lang="en"'), false);
  const js = reread.assets.get('/assets/index-IL-0eMku.js').raw.toString('utf8');
  assert.equal(js.includes('"创建图像"'), true, '长的先落地');
  assert.equal(js.includes('"创建"'), true);
  assert.equal(js.includes("'编辑'"), true, '单引号字面量也要替换');
  assert.ok(report.translations.applications > 0);

  // PE 结构：多一个只读段、SizeOfImage 对齐、校验和置 0
  assert.equal(report.pe.sectionCountAfter, report.pe.sectionCountBefore + 1);
  assert.equal(report.pe.sizeOfImageAfter % report.pe.sectionAlignment, 0);
  const patched = parsePe(report.image);
  assert.equal(patched.sections.length, 2);
  assert.equal(patched.sections[1].name, '.asst');
  assert.equal(patched.sections[1].characteristics & 0x80000000, 0, '新段不能可写');
  assert.equal(patched.sections[1].characteristics & 0x20000000, 0, '新段不能可执行');
  assert.equal(report.image.readUInt32LE(patched.checksumOff), 0, '校验和必须置 0');

  // 改动审计：白名单之外一个字节都没变；产物必须变大（追加了新段）
  assert.equal(report.audit.changedOutside, 0);
  assert.ok(report.bytes > before);

  // 合成 HTML 里没有 <script>，所以没有要改的 CSP 哈希
  assert.equal(report.csp.replacements.length, 0);
  assert.equal(report.selfCheck.cspOk, true);
});

test('verifyCspHashes：合成产物里没有 CSP 明文串时，旧哈希自然「零残留」', () => {
  const image = buildPatchableImage();
  const report = applyPatchToImage({
    image,
    translations: [{ id: '0001', en: 'Create', zh: '创建' }],
  });
  const check = verifyCspHashes({
    image: report.image,
    htmlAssets: [{ path: '/index.html', text: '<html lang="zh"></html>' }],
    oldHashes: ['sha256-4ArYMF5GuVlFkSa3qpippIUjOLhKpONvXOvLUPukPMU='],
  });
  assert.equal(check.ok, true, check.problems.join('；'));
  assert.deepEqual(check.residualOld, []);
  assert.deepEqual(check.binaryHashes, []);
});

test('patchMainApp：正常路径跑通并写出产物（合成 exe，不碰真实安装目录）', () => {
  const dir = tmpdir();
  try {
    const exePath = path.join(dir, 'artcraft.exe');
    const outPath = path.join(dir, 'artcraft-zh-full.exe');
    writeBytesDeep(exePath, buildPatchableImage());

    const logged = [];
    const result = patchMainApp({
      exePath,
      outPath,
      translations: [{ id: '0001', en: 'Create', zh: '创建' }],
      log: (m) => logged.push(m),
    });

    assert.equal(result.outPath, outPath);
    assert.ok(result.bytes > 0);
    assert.equal(result.bytes, fs.statSync(outPath).size);
    assert.equal(
      crypto.createHash('sha256').update(fs.readFileSync(outPath)).digest('hex'),
      result.sha256,
      '返回的 sha256 必须与落盘文件一致',
    );
    assert.equal(fs.existsSync(exePath), true, '原 exe 必须保留（可回滚）');
    assert.ok(logged.some((m) => m.includes('phf 表定位')));
    assert.ok(logged.some((m) => m.includes('已写出')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('parsePe / findPhfEntries：字段序正确、按簇定位、brotli 指纹', () => {
  const list = syntheticAssets();
  const image = syntheticImage(list);
  const pe = parsePe(image);
  assert.equal(pe.magic, 0x20b);
  assert.equal(pe.imageBase, Number(IMAGE_BASE));
  assert.equal(pe.sections.length, 1);
  assert.equal(pe.sections[0].name, '.rdata');

  const scan = findPhfEntries(pe, image, { requiredKeys: list.map((e) => e.key) });
  assert.equal(scan.entries.length, list.length);
  assert.equal(scan.sectionName, '.rdata');
  assert.equal(scan.decompressible, list.length);
  assert.equal(scan.missingRequired.length, 0);
  assert.equal(scan.hashesOk, true);

  // 每条都要能解回原内容（说明 value.ptr / value.len 的字段序对）
  for (const [i, e] of scan.entries.entries()) {
    const raw = zlib.brotliDecompressSync(image.subarray(e.valueOffset, e.valueOffset + e.valueLen));
    assert.equal(raw.toString('utf8'), list[i].raw);
  }
});

test('findPhfEntries：必需 key 缺失要显式报错', () => {
  const image = syntheticImage();
  const pe = parsePe(image);
  assert.throws(
    () => findPhfEntries(pe, image, { requiredKeys: ['/assets/not-there.js'] }),
    /缺少必需资源/,
  );
});

test('findPhfEntries：簇太小就拒绝（不硬编码偏移）', () => {
  const small = syntheticAssets().slice(0, 4);
  const image = syntheticImage(small);
  const pe = parsePe(image);
  assert.throws(() => findPhfEntries(pe, image, { minEntries: 16 }), /少于要求的 16 条/);
});

test('findPhfEntries：hash 字段与实测不符要报错（字段序被写错就会在这里炸）', () => {
  const list = syntheticAssets();
  const image = syntheticImage(list);
  const pe = parsePe(image);
  assert.throws(
    () => findPhfEntries(pe, image, { expectedHashes: { '/index.html': '0xdeadbeef' } }),
    /hash 字段与实测不符/,
  );
});

test('findPhfEntries：只扫只读数据节（可写节里的同名条目不会被选中）', () => {
  const image = syntheticImage();
  const pe = parsePe(image);
  const ro = pe.sections[0];
  const rw = { ...ro, name: '.data', characteristics: 0xc0000040, vaddr: 0x2000 };
  const scan = findPhfEntries({ ...pe, sections: [rw, ro] }, image, {
    minEntries: 1,
    requiredKeys: ['/index.html'],
  });
  assert.equal(scan.sectionName, '.rdata', '必须选中只读数据节');
});

test('findPhfEntries：只有可写节时直接报错（不猜）', () => {
  const image = syntheticImage();
  const pe = parsePe(image);
  const rw = { ...pe.sections[0], name: '.data', characteristics: 0xc0000040 };
  assert.throws(
    () => findPhfEntries({ ...pe, sections: [rw] }, image, { minEntries: 1 }),
    /没有可扫描的只读数据节/,
  );
});

test('applyPatchToImage：假 exe（hash 对不上）必须显式报错，不能硬套', () => {
  const image = syntheticImage();
  assert.throws(
    () => applyPatchToImage({ image, translations: [{ id: '1', en: 'Create', zh: '创建' }] }),
    /hash 字段与实测不符/,
  );
});

test('applyPatchToImage：phf 条目数偏离实测值太多要报错（hash 对得上也不行）', () => {
  const image = withRealHashes(syntheticImage());
  assert.throws(
    () =>
      applyPatchToImage({
        image,
        translations: [{ id: '1', en: 'Create', zh: '创建' }],
        expectedTableOffset: 0x400, // 合成镜像里表就在 0x400
      }),
    /phf 条目数偏离实测值太多/,
  );
});

test('compareImages：逐字节比较并给出第一个差异偏移', () => {
  const a = Buffer.from('abcdef');
  const b = Buffer.from('abcdef');
  assert.equal(compareImages(a, b), -1);
  assert.equal(compareImages(a, Buffer.from('abXdef')), 2);
  assert.equal(compareImages(a, Buffer.from('abcd')), 4, '长度不同时返回较短的那个长度');
});

test('PE 结构常量：新段只读、不新增可执行/可写节', () => {
  assert.equal(REFERENCE_FACTS.newSectionCharacteristics & 0x80000000, 0, '新段不能可写');
  assert.equal(REFERENCE_FACTS.newSectionCharacteristics & 0x20000000, 0, '新段不能可执行');
  assert.equal(REFERENCE_FACTS.newSectionName, '.asst');
  assert.equal(REFERENCE_FACTS.sectionCountBefore, 6);
  assert.equal(REFERENCE_FACTS.sectionCountAfter, 7);
});

/* ══════════════════════════════════════════════════════════════════════
 * 5. 端到端（默认跳过）
 * ══════════════════════════════════════════════════════════════════════ */

const ORIG_EXE =
  'C:\\Users\\Ding\\Documents\\deepseek-harness\\default-workspace\\artcraft-poc\\artcraft-poc-orig.exe';
/** 参考产物：优先用 v3（2803 条译表重建的那一份），退回旧版 */
const REF_EXE_CANDIDATES = [
  'C:\\Users\\Ding\\Documents\\deepseek-harness\\default-workspace\\artcraft-poc\\artcraft-zh-v3.exe',
  'C:\\Users\\Ding\\Documents\\deepseek-harness\\default-workspace\\artcraft-poc\\artcraft-zh-full-csp.exe',
];
/** 权威译表：优先用 hanhua-build 的 v3 副本，退回仓库内 data/translations.tsv */
const TSV_CANDIDATES = [
  'C:\\Users\\Ding\\Documents\\deepseek-harness\\default-workspace\\hanhua-build\\translations-v3.tsv',
  fileURLToPath(new URL('../data/translations.tsv', import.meta.url)),
];
/** 参考产物解压后的资源目录（用于「解压后逐字节相同」这条硬标准） */
const REF_ASSET_DIR =
  'C:\\Users\\Ding\\Documents\\deepseek-harness\\default-workspace\\extract-csp\\assets';
const FULL = process.env.ARTCRAFT_FULL_TEST === '1';

const firstExisting = (paths) => paths.find((p) => fs.existsSync(p)) ?? null;

/** 从 TSV 读译文（列顺序按表头走，英文/中文都不 trim） */
function readTranslations(tsvPath) {
  const lines = fs
    .readFileSync(tsvPath, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\n|\r/)
    .filter((l) => l !== '');
  const header = lines[0].split('\t');
  const idx = { id: header.indexOf('id'), en: header.indexOf('english'), zh: header.indexOf('chinese') };
  const body = idx.en >= 0 ? lines.slice(1) : lines;
  return body.map((l) => {
    const f = l.split('\t');
    return { id: f[idx.id >= 0 ? idx.id : 0], en: f[idx.en >= 0 ? idx.en : 1], zh: f[idx.zh >= 0 ? idx.zh : 2] };
  });
}

test(
  '端到端：原件 + 权威译表 → 产物与参考产物逐字节相同（ARTCRAFT_FULL_TEST=1 才跑）',
  { skip: FULL ? false : '设 ARTCRAFT_FULL_TEST=1 才跑（77 MB brotli q11 重压，约 1 分钟）' },
  () => {
    const refExe = firstExisting(REF_EXE_CANDIDATES);
    const tsvPath = firstExisting(TSV_CANDIDATES);
    assert.ok(fs.existsSync(ORIG_EXE), `缺少原件：${ORIG_EXE}`);
    assert.ok(refExe, '缺少参考产物');
    assert.ok(tsvPath, '缺少权威译表');

    const image = fs.readFileSync(ORIG_EXE);
    assert.equal(image.length, REFERENCE_FACTS.originalExeBytes);
    assert.equal(
      crypto.createHash('sha256').update(image).digest('hex'),
      'ea8081668410982320c9ec878fea5552805739be64837405045c19c6b1d5da60',
      '原件必须是实测的那一份',
    );

    const translations = readTranslations(tsvPath);
    assert.ok(translations.length > 0);
    assert.equal(
      translations.length,
      new Set(translations.map((t) => t.id)).size,
      '译表 id 不应重复',
    );

    const dir = tmpdir();
    const outPath = path.join(dir, 'artcraft-zh-full.exe');
    const report = applyPatchToImage({ image, translations });
    fs.writeFileSync(outPath, report.image);
    const ref = fs.readFileSync(refExe);

    // 硬标准 1：整文件逐字节相同（Node 与 Python 的 brotli 在这份数据上恰好一致）
    assert.equal(report.bytes, ref.length, '产物字节数必须与参考一致');
    assert.equal(compareImages(report.image, ref), -1, '必须逐字节相同');
    assert.equal(report.sha256, crypto.createHash('sha256').update(ref).digest('hex'));

    // 硬标准 2：三个资源的**解压后**内容与参考产物逐字节相同（与 brotli 实现无关）
    const reread = readEmbeddedAssets(report.image, { decompressAll: true, expectedHashes: {} });
    const refAssets = readEmbeddedAssets(ref, { decompressAll: true, expectedHashes: {} });
    const pairs = [
      ['/index.html', path.join(REF_ASSET_DIR, 'index.html')],
      ['/assets/index-IL-0eMku.js', path.join(REF_ASSET_DIR, 'assets', 'index-IL-0eMku.js')],
      ['/assets/index-DTSJQQsq.css', path.join(REF_ASSET_DIR, 'assets', 'index-DTSJQQsq.css')],
    ];
    for (const [key] of pairs) {
      assert.equal(
        reread.assets.get(key).raw.equals(refAssets.assets.get(key).raw),
        true,
        `${key} 解压后必须与参考产物一致`,
      );
    }
    // 若 extract-csp 里留了参考解压结果，再对一遍
    // （注意：那是**旧版**参考的导出，只在与本次参考产物一致时才有可比性）
    for (const [key, refPath] of pairs) {
      if (!fs.existsSync(refPath)) continue;
      const exported = fs.readFileSync(refPath);
      if (!exported.equals(refAssets.assets.get(key).raw)) continue; // 旧版导出，跳过
      assert.equal(reread.assets.get(key).raw.equals(exported), true, `${key} 与 extract-csp 不一致`);
    }

    // 硬标准 3：CSP 是新哈希、旧哈希零残留
    assert.equal(report.csp.replacements.length, 1);
    assert.equal(report.csp.replacements[0].newHash, REFERENCE_FACTS.jsCspHashAfter);
    assert.equal(report.selfCheck.cspOk, true);
    assert.equal(
      report.image.includes(Buffer.from(REFERENCE_FACTS.jsCspHashBefore, 'latin1')),
      false,
      '旧 CSP 哈希必须零残留',
    );

    // 硬标准 4：PE 结构
    assert.equal(report.pe.sizeOfImageAfter % report.pe.sectionAlignment, 0);
    assert.ok(report.pe.sectionCountAfter <= 96, '节数必须 ≤ 96');
    assert.equal(report.audit.changedOutside, 0, '白名单之外一个字节都不许变');
    const patched = parsePe(report.image);
    const original = parsePe(image);
    assert.equal(patched.sections.length, original.sections.length + 1);
    // The new section header is APPENDED to the section table (index 6 of 7), which
    // is what the reference build does and what keeps every existing section at its
    // original index, so the loop below still lines up one-to-one.
    const newSec = patched.sections[patched.sections.length - 1];
    assert.equal(newSec.name, '.asst');
    assert.equal(newSec.characteristics & 0x80000000, 0, '不许新增可写节');
    assert.equal(newSec.characteristics & 0x20000000, 0, '不许新增代码节');
    // 既有节的 VA / rawptr 一个都没动
    for (let i = 0; i < original.sections.length; i += 1) {
      assert.equal(patched.sections[i].vaddr, original.sections[i].vaddr, `节 ${i} 的 VA 被改动`);
      assert.equal(patched.sections[i].rawptr, original.sections[i].rawptr, `节 ${i} 的 rawptr 被改动`);
    }
    assert.equal(report.image.readUInt32LE(patched.checksumOff), 0, 'CheckSum 必须为 0');

    fs.rmSync(dir, { recursive: true, force: true });
  },
);

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  defaultTranslationsPath,
  loadTranslations,
  parseTranslations,
  splitLines,
  toTranslationList,
  toTranslationMap,
  TRANSLATION_COLUMNS,
} from '../src/translations.mjs';
import { EXPECTED_TRANSLATION_COUNT } from '../src/constants.mjs';
import { tmpdir, writeFileDeep } from './helpers.mjs';

const HEADER = 'id\tenglish\tchinese\n';

test('真实数据文件：条数与字段完整性', () => {
  const file = defaultTranslationsPath();
  assert.equal(fs.existsSync(file), true, `翻译数据文件应当存在：${file}`);
  const parsed = loadTranslations({});
  assert.equal(parsed.ok, true, parsed.errors.join('；'));
  assert.equal(parsed.count, EXPECTED_TRANSLATION_COUNT);
  assert.equal(parsed.count, 2803);
  assert.deepEqual(parsed.columns, TRANSLATION_COLUMNS);
  assert.equal(parsed.hadBom, false, '翻译数据不应带 BOM');
  // 实测：英文精确去重后与总条数相同（没有完全相同的英文）
  assert.equal(parsed.distinctEnglish, parsed.count);
  assert.deepEqual(parsed.conflicts, []);
  // 实测：31 组「忽略大小写后相同」的英文（例如 3D model / 3D Model）
  assert.equal(parsed.caseInsensitiveCollisions.length, 31);
  // 实测：173 条英文文案首尾带空格，匹配时必须原样比较
  assert.equal(parsed.paddedEnglish, 173);
  assert.ok(parsed.warnings.some((w) => w.includes('首尾带空格')));
});

test('真实数据：首条与末条内容', () => {
  const parsed = loadTranslations({});
  assert.deepEqual(parsed.entries[0], { id: '0001', english: 'Delete', chinese: '删除', line: 2 });
  const last = parsed.entries[parsed.entries.length - 1];
  assert.equal(last.id, '2803');
  assert.ok(last.english.length > 0);
  assert.ok(last.chinese.length > 0);
});

test('真实数据：toTranslationMap 保留前导空格（不 trim）', () => {
  const parsed = loadTranslations({});
  const { map } = toTranslationMap(parsed);
  assert.equal(Object.keys(map).length, parsed.count);
  const padded = parsed.entries.find((e) => e.english.startsWith(' '));
  assert.ok(padded, '数据里应当存在首尾带空格的英文');
  assert.equal(map[padded.english], padded.chinese);
  assert.equal(map[padded.english.trim()], undefined);
  const list = toTranslationList(parsed);
  assert.equal(list.length, parsed.count);
  assert.deepEqual(list[0], { id: '0001', en: 'Delete', zh: '删除' });
});

test('splitLines：兼容 LF / CRLF / CR，并丢掉结尾空行', () => {
  assert.deepEqual(splitLines('a\nb'), ['a', 'b']);
  assert.deepEqual(splitLines('a\r\nb\r\n'), ['a', 'b']);
  assert.deepEqual(splitLines('a\rb'), ['a', 'b']);
  assert.deepEqual(splitLines(''), []);
});

test('表头识别：列顺序不同也能认出来', () => {
  const text = `english\tchinese\tid\nDelete\t删除\t0001\n`;
  const parsed = parseTranslations(text, { expectedCount: 1 });
  assert.equal(parsed.ok, true, parsed.errors.join('；'));
  assert.equal(parsed.entries[0].english, 'Delete');
  assert.equal(parsed.entries[0].id, '0001');
});

test('没有表头时按位置约定解析，并给出提示', () => {
  const parsed = parseTranslations('0001\tDelete\t删除\n', { expectedCount: 1 });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.entries.length, 1);
  assert.ok(parsed.warnings.some((w) => w.includes('未识别到表头')));
});

test('列数不对 / 字段为空 / id 格式不对：报错而不是静默', () => {
  const badCols = parseTranslations(`${HEADER}0001\tDelete\n`, { expectedCount: 1 });
  assert.equal(badCols.ok, false);
  assert.match(badCols.errors.join('；'), /第 2 行列数不对/);

  const emptyField = parseTranslations(`${HEADER}0001\t\t删除\n`, { expectedCount: 1 });
  assert.equal(emptyField.ok, false);
  assert.match(emptyField.errors.join('；'), /english 字段是空的/);

  const badId = parseTranslations(`${HEADER}1\tDelete\t删除\n`, { expectedCount: 1 });
  assert.equal(badId.ok, false);
  assert.match(badId.errors.join('；'), /id 不是 4 位数字/);
});

test('条数不符会报错，并说明如何放宽', () => {
  const text = `${HEADER}0001\tDelete\t删除\n`;
  const strict = parseTranslations(text, { expectedCount: 2803 });
  assert.equal(strict.ok, false);
  assert.match(strict.errors.join('；'), /翻译条数不符/);

  const relaxed = parseTranslations(text, { expectedCount: 2803, allowCountMismatch: true });
  assert.equal(relaxed.ok, true);
});

test('重复 id 与「同英文不同中文」的冲突都会报出来', () => {
  const text = `${HEADER}0001\tDelete\t删除\n0001\tDelete\t删掉\n0002\tSave\t保存\n0003\tSave\t存储\n`;
  const parsed = parseTranslations(text, { expectedCount: 4 });
  assert.deepEqual(parsed.duplicateIds, ['0001']);
  assert.equal(parsed.conflicts.length, 2);
  assert.deepEqual(
    parsed.conflicts.map((c) => c.english).sort(),
    ['Delete', 'Save'],
  );
  assert.ok(parsed.warnings.some((w) => w.includes('重复 id')));
  assert.ok(parsed.warnings.some((w) => w.includes('冲突译文')));
  // 冲突时以首次出现为准
  assert.equal(toTranslationMap(parsed).map.Save, '保存');
  assert.equal(toTranslationMap(parsed).map.Delete, '删除');
});

test('空数据报错', () => {
  const parsed = parseTranslations('');
  assert.equal(parsed.ok, false);
  assert.match(parsed.errors.join('；'), /翻译数据是空的/);
});

test('文件不存在 / 无法读取时给出可读错误', () => {
  const dir = tmpdir();
  try {
    const missing = loadTranslations({ file: path.join(dir, 'nope.tsv') });
    assert.equal(missing.ok, false);
    assert.match(missing.errors.join('；'), /翻译数据文件不存在/);

    const file = path.join(dir, 'data.tsv');
    writeFileDeep(file, `${HEADER}0001\tDelete\t删除\n`);
    const ok = loadTranslations({ file });
    assert.equal(ok.ok, false); // 条数不符（期望 2803）
    assert.match(ok.errors.join('；'), /翻译条数不符/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('默认路径指向仓库内的 data/translations.tsv', () => {
  assert.match(defaultTranslationsPath().replace(/\\/g, '/'), /artcraft-hanhua\/data\/translations\.tsv$/);
});

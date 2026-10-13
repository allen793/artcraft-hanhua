import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findLanguageKeyPaths,
  minimalJsonDocument,
  readJsonStringValue,
  scanJsonText,
  setJsonStringValue,
} from '../src/json-text.mjs';

// 真实的 DesignCraft ui.json 片段：2 空格缩进、有数组、language 在中间
const DESIGNCRAFT = `{
  "brightness": "MediumDark",
  "hiddenMenuItems": [],
  "scripts": [
    [
      "Two-column grid",
      "frame.grid {\\"cols\\": 2}"
    ]
  ],
  "language": "",
  "uiScale": 1.0,
  "about": false,
  "pendingUrls": []
}
`;

// 真实的 EffectCraft prefs.json 片段：language 在 general 段里
const EFFECTCRAFT = `{
  "version": 2,
  "general": {
    "language": "system",
    "undoLevels": 32,
    "showToolTips": true
  },
  "appearance": {
    "theme": "dark"
  }
}
`;

test('scanJsonText：能扫出嵌套路径与数组元素', () => {
  const scan = scanJsonText(DESIGNCRAFT);
  assert.equal(scan.ok, true, scan.error);
  assert.ok(scan.index.has('language'));
  assert.equal(scan.index.get('language').value, '');
  assert.ok(scan.index.has('scripts[0][0]'));
  assert.equal(scan.index.get('scripts[0][0]').value, 'Two-column grid');
  assert.equal(scan.index.get('scripts[0][1]').value, 'frame.grid {"cols": 2}');
  assert.equal(scan.index.get('uiScale').value, 1);
  assert.equal(scan.index.get('about').value, false);
  assert.equal(scan.index.get('hiddenMenuItems').kind, 'array');

  const ef = scanJsonText(EFFECTCRAFT);
  assert.ok(ef.index.has('general.language'));
  assert.equal(ef.index.get('general.language').value, 'system');
});

test('readJsonStringValue：读嵌套字段', () => {
  assert.equal(readJsonStringValue(EFFECTCRAFT, ['general', 'language']).value, 'system');
  assert.equal(readJsonStringValue(EFFECTCRAFT, ['language']).found, false);
  assert.equal(readJsonStringValue(DESIGNCRAFT, ['language']).value, '');
});

test('setJsonStringValue：只改目标字面量，其余字节完全不动', () => {
  const res = setJsonStringValue(DESIGNCRAFT, ['language'], 'zh');
  assert.equal(res.ok, true);
  assert.equal(res.changed, true);
  assert.equal(res.mode, 'replace');
  // 除了 `""` → `"zh"` 之外，其它字节必须一模一样
  assert.equal(res.text, DESIGNCRAFT.replace('"language": "",', '"language": "zh",'));
  // 缩进、数组、浮点数写法都没被重排
  assert.match(res.text, /"uiScale": 1\.0,/);
  assert.match(res.text, /frame\.grid \{\\"cols\\": 2\}/);
});

test('setJsonStringValue：写入嵌套字段（EffectCraft 的 general.language）', () => {
  const res = setJsonStringValue(EFFECTCRAFT, ['general', 'language'], 'zh-hans');
  assert.equal(res.changed, true);
  assert.equal(res.text, EFFECTCRAFT.replace('"language": "system"', '"language": "zh-hans"'));
});

test('setJsonStringValue：值已经是目标值时不改动', () => {
  const zh = setJsonStringValue(DESIGNCRAFT, ['language'], 'zh').text;
  const again = setJsonStringValue(zh, ['language'], 'zh');
  assert.equal(again.ok, true);
  assert.equal(again.changed, false);
  assert.equal(again.mode, 'unchanged');
  assert.equal(again.text, zh);
});

test('setJsonStringValue：字段不存在时插到父对象开头（多行 / 单行 / 空对象）', () => {
  const multi = setJsonStringValue('{\n  "a": 1\n}\n', ['language'], 'zh');
  assert.equal(multi.ok, true);
  assert.equal(multi.mode, 'insert');
  assert.equal(multi.text, '{\n  "language": "zh",\n  "a": 1\n}\n');
  assert.deepEqual(JSON.parse(multi.text), { language: 'zh', a: 1 });

  const single = setJsonStringValue('{ "a": 1 }', ['language'], 'zh');
  assert.deepEqual(JSON.parse(single.text), { language: 'zh', a: 1 });

  const empty = setJsonStringValue('{}', ['language'], 'zh-hans');
  assert.equal(empty.text, '{"language": "zh-hans"}');

  const nested = setJsonStringValue('{\n  "general": {}\n}', ['general', 'language'], 'zh-hans');
  assert.deepEqual(JSON.parse(nested.text), { general: { language: 'zh-hans' } });
});

test('setJsonStringValue：坏 JSON / 类型不对 / 父对象不存在都要报错而不是乱写', () => {
  const broken = setJsonStringValue('{ "language": ', ['language'], 'zh');
  assert.equal(broken.ok, false);
  assert.match(broken.error, /JSON 解析失败/);
  assert.equal(broken.changed, false);

  const wrongType = setJsonStringValue('{ "language": 3 }', ['language'], 'zh');
  assert.equal(wrongType.ok, false);
  assert.match(wrongType.error, /不是字符串/);

  const noParent = setJsonStringValue('{ "a": 1 }', ['general', 'language'], 'zh');
  assert.equal(noParent.ok, false);
  assert.match(noParent.error, /找不到可以插入字段/);
});

test('findLanguageKeyPaths：找出所有语言键（用来证明某些 App 没有语言键）', () => {
  assert.deepEqual(findLanguageKeyPaths(EFFECTCRAFT), ['general.language']);
  assert.deepEqual(findLanguageKeyPaths('{ "slides": [] }'), []);
  assert.deepEqual(findLanguageKeyPaths('{ "a": { "b": { "language": "x" } } }'), ['a.b.language']);
});

test('minimalJsonDocument：LightCraft 期望的内容', () => {
  assert.equal(minimalJsonDocument(['language'], 'zh-hans'), '{"language":"zh-hans"}');
  assert.equal(minimalJsonDocument(['general', 'language'], 'zh-hans'), '{"general":{"language":"zh-hans"}}');
});

test('scanJsonText：解析失败时返回 ok:false 而不是抛异常', () => {
  for (const bad of ['', '   ', '{', '[1,', '{"a" 1}', '{"a":1} trailing']) {
    const scan = scanJsonText(bad);
    assert.equal(scan.ok, false, `应当失败：${JSON.stringify(bad)}`);
    assert.ok(scan.error);
  }
});

test('转义字符串里的语言字样不会被误当成字段', () => {
  const text = '{\n  "note": "language\\": \\"zh\\"",\n  "language": "en"\n}\n';
  const res = setJsonStringValue(text, ['language'], 'zh');
  assert.equal(res.changed, true);
  assert.deepEqual(JSON.parse(res.text), { note: 'language": "zh"', language: 'zh' });
});

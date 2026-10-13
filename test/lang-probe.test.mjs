import test from 'node:test';
import assert from 'node:assert/strict';
import { findRawLanguageFields } from '../src/lang-probe.mjs';

// 真机实测：CADCraft 的 app.ron 是 RON map，语言键被嵌在一段转义的 JSON 字符串里
const CADCRAFT_RON = `{
    "cadcraft.prefs": "{\\"interfaceLanguage\\":\\"auto\\",\\"saveFormat\\":\\"dxf\\",\\"theme\\":\\"dark\\"}",
}
`;

test('findRawLanguageFields：普通 JSON 键值', () => {
  assert.deepEqual(findRawLanguageFields('{\n  "language": "zh",\n  "a": 1\n}\n'), [
    { key: 'language', value: 'zh' },
  ]);
  assert.deepEqual(findRawLanguageFields('{\n  "language": "system"\n}\n'), [
    { key: 'language', value: 'system' },
  ]);
});

test('findRawLanguageFields：能看穿被转义的 JSON 内嵌字符串', () => {
  assert.deepEqual(findRawLanguageFields(CADCRAFT_RON), [{ key: 'interfaceLanguage', value: 'auto' }]);
});

test('findRawLanguageFields：按首次出现去重、没命中就返回空数组', () => {
  assert.deepEqual(findRawLanguageFields('{"language":"en","language":"fr"}'), [
    { key: 'language', value: 'en' },
  ]);
  assert.deepEqual(findRawLanguageFields('{"snapToGrid":true}'), []);
  assert.deepEqual(findRawLanguageFields(''), []);
  assert.deepEqual(findRawLanguageFields(null), []);
});

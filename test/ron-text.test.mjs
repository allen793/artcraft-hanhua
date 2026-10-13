import test from 'node:test';
import assert from 'node:assert/strict';
import {
  minimalRonDocument,
  parseRonTopLevel,
  readRonStringField,
  setRonStringField,
} from '../src/ron-text.mjs';

test('readRonStringField：读最简单的 Launcher app.ron', () => {
  assert.equal(readRonStringField('(language: "zh-CN")', 'language').value, 'zh-CN');
  assert.equal(readRonStringField('(language: "zh-CN")\n', 'language').value, 'zh-CN');
  assert.equal(readRonStringField('( language : "en" )', 'language').value, 'en');
  assert.equal(readRonStringField('(language: "auto")', 'language').value, 'auto');
});

test('readRonStringField：字段不存在时 found=false；没有结构体时报错', () => {
  assert.equal(readRonStringField('(theme: "dark")', 'language').found, false);
  const noStruct = readRonStringField('not ron at all', 'language');
  assert.equal(noStruct.ok, false);
  assert.match(noStruct.error, /没有找到顶层结构体/);
});

test('readRonStringField：跳过 #![...] 属性与注释', () => {
  const text = '#![enable(implicit_some)]\n// 注释\n(language: "uk", theme: "dark")\n';
  assert.equal(readRonStringField(text, 'language').value, 'uk');
  const block = '/* 块注释 */\n(language: "ja")';
  assert.equal(readRonStringField(block, 'language').value, 'ja');
});

test('readRonStringField：嵌套结构体里的 language 不会被误读成顶层字段', () => {
  const text = '(general: (language: "system"), language: "en")';
  const parsed = parseRonTopLevel(text);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.fields.get('language').value, 'en');
  assert.equal(readRonStringField(text, 'language').value, 'en');
});

test('setRonStringField：只替换一个字面量', () => {
  const res = setRonStringField('(language: "auto")', 'language', 'zh-CN');
  assert.equal(res.ok, true);
  assert.equal(res.changed, true);
  assert.equal(res.text, '(language: "zh-CN")');

  const withOthers = setRonStringField('(theme: "dark", language: "auto", scale: 1.0)', 'language', 'zh-CN');
  assert.equal(withOthers.text, '(theme: "dark", language: "zh-CN", scale: 1.0)');
});

test('setRonStringField：值相同时不改动', () => {
  const res = setRonStringField('(language: "zh-CN")', 'language', 'zh-CN');
  assert.equal(res.changed, false);
  assert.equal(res.mode, 'unchanged');
});

test('setRonStringField：字段不存在时插入', () => {
  assert.equal(setRonStringField('()', 'language', 'zh-CN').text, '(language: "zh-CN")');
  assert.equal(setRonStringField('(theme: "dark")', 'language', 'zh-CN').text, '(language: "zh-CN", theme: "dark")');
  assert.equal(setRonStringField('( theme: "dark" )', 'language', 'zh-CN').text, '(language: "zh-CN",  theme: "dark" )');
});

test('setRonStringField：空文件按「创建」处理', () => {
  for (const empty of ['', '   \n', '// 只有注释\n']) {
    const res = setRonStringField(empty, 'language', 'zh-CN');
    assert.equal(res.ok, true, empty);
    assert.equal(res.mode, 'create');
    assert.equal(res.text, '(language: "zh-CN")\n');
  }
});

test('minimalRonDocument：与实测写法一致', () => {
  assert.equal(minimalRonDocument('language', 'zh-CN'), '(language: "zh-CN")\n');
});

test('setRonStringField：非字符串字段要报错而不是乱写', () => {
  const res = setRonStringField('(language: 3)', 'language', 'zh-CN');
  assert.equal(res.ok, false);
  assert.match(res.error, /不是字符串/);
});

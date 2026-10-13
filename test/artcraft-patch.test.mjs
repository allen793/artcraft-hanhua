import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import {
  ARTCRAFT_PATCH_VERSION,
  SUPPORTED_MAIN_VERSIONS,
  defaultPatchedExePath,
  isPatchSupported,
  normalizeVersion,
  parseExeVersions,
  patchMainApp,
  readExeVersion,
  readExeVersions,
  recomputeCspHashes,
} from '../src/artcraft-patch.mjs';
import { PATCHED_MAIN_EXE_NAME } from '../src/constants.mjs';
import { failingExeVersionExec, makeExeVersionExec, tmpdir, writeFileDeep } from './helpers.mjs';

test('接口版本与支持列表', () => {
  assert.equal(ARTCRAFT_PATCH_VERSION, 1);
  assert.deepEqual(SUPPORTED_MAIN_VERSIONS, ['0.41.0']);
});

test('normalizeVersion：统一成 major.minor.patch', () => {
  assert.equal(normalizeVersion('0.41.0'), '0.41.0');
  assert.equal(normalizeVersion('0.41.0.0'), '0.41.0');
  assert.equal(normalizeVersion('  0.41.0  '), '0.41.0');
  assert.equal(normalizeVersion('0.41'), '0.41');
  assert.equal(normalizeVersion(''), null);
  assert.equal(normalizeVersion(null), null);
});

test('parseExeVersions：解析「路径 \\t 版本」的输出', () => {
  const stdout = ['C:\\a\\artcraft.exe\t0.41.0', 'C:\\a\\b.exe\t', 'garbage line'].join('\n');
  const parsed = parseExeVersions(stdout, ['C:\\a\\artcraft.exe', 'C:\\missing.exe']);
  assert.equal(parsed.entries.length, 2);
  assert.equal(parsed.byPath['c:\\a\\artcraft.exe'], '0.41.0');
  assert.equal(parsed.byPath['c:\\a\\b.exe'], null);
  assert.equal(parsed.byPath['c:\\missing.exe'], null);
});

test('readExeVersions / readExeVersion：走注入的执行器', () => {
  const dir = tmpdir();
  try {
    const exe = path.join(dir, 'artcraft.exe');
    writeFileDeep(exe, 'MZ');
    const exec = makeExeVersionExec('0.41.0');
    const batch = readExeVersions({ paths: [exe], exec });
    assert.equal(batch.ok, true);
    assert.equal(batch.byPath[exe.toLowerCase()], '0.41.0');

    const single = readExeVersion({ exePath: exe, exec });
    assert.equal(single.ok, true);
    assert.equal(single.version, '0.41.0');

    const missing = readExeVersion({ exePath: path.join(dir, 'nope.exe'), exec });
    assert.equal(missing.ok, false);
    assert.match(missing.error, /文件不存在/);

    const broken = readExeVersions({ paths: [exe], exec: failingExeVersionExec() });
    assert.equal(broken.ok, false);
    assert.ok(broken.error);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('isPatchSupported：0.41.0 支持，其它版本明确不支持', () => {
  const dir = tmpdir();
  try {
    const exe = path.join(dir, 'artcraft.exe');
    writeFileDeep(exe, 'MZ');

    const ok = isPatchSupported({ exePath: exe, version: '0.41.0' });
    assert.equal(ok.supported, true);
    assert.equal(ok.version, '0.41.0');
    assert.match(ok.reason, /在实测支持列表内/);

    const okPatch = isPatchSupported({ exePath: exe, version: '0.41.0.0' });
    assert.equal(okPatch.supported, true, '四段版本号应当被规范化后匹配');

    const tooOld = isPatchSupported({ exePath: exe, version: '0.40.4' });
    assert.equal(tooOld.supported, false);
    assert.equal(tooOld.version, '0.40.4');
    assert.match(tooOld.reason, /实测支持的主程序版本为 0\.41\.0/);

    const missing = isPatchSupported({ exePath: path.join(dir, 'nope.exe'), version: '0.41.0' });
    assert.equal(missing.supported, false);
    assert.match(missing.reason, /未找到主程序文件/);

    const noPath = isPatchSupported({});
    assert.equal(noPath.supported, false);
    assert.match(noPath.reason, /没有可用的主程序路径/);

    const unreadable = isPatchSupported({ exePath: exe, exec: failingExeVersionExec() });
    assert.equal(unreadable.supported, false);
    assert.match(unreadable.reason, /无法读取主程序版本信息/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('defaultPatchedExePath：产物名与 README 一致（不覆盖原 exe）', () => {
  assert.equal(PATCHED_MAIN_EXE_NAME, 'artcraft-zh-full.exe');
  assert.equal(
    defaultPatchedExePath({ exePath: 'H:\\ArtCraft\\artcraft.exe' }),
    'H:\\ArtCraft\\artcraft-zh-full.exe',
  );
  assert.equal(
    defaultPatchedExePath({ exePath: 'H:\\ArtCraft\\artcraft.exe', outPath: 'D:\\out.exe' }),
    'D:\\out.exe',
  );
});

test('patchMainApp / recomputeCspHashes：本轮明确抛「未实现」', () => {
  assert.throws(
    () => patchMainApp({ exePath: 'H:\\ArtCraft\\artcraft.exe', outPath: 'X', translations: [], log: () => {} }),
    /未实现/,
  );
  assert.throws(() => recomputeCspHashes({ decompressedAssets: [] }), /未实现/);
});

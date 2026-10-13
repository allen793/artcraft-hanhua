import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  appExePath,
  describeInstallRoot,
  fallbackRoots,
  launcherDataDir,
  launcherExePath,
  mainExePath,
  resolveInstall,
} from '../src/locate.mjs';
import { makeWorld, makeRegistryReader, missingRegistryReader, writeFileDeep } from './helpers.mjs';

test('路径拼接符合实测布局', () => {
  const root = 'H:\\ArtCraft';
  assert.equal(mainExePath(root), 'H:\\ArtCraft\\artcraft.exe');
  assert.equal(launcherExePath(root), 'H:\\ArtCraft\\launcher\\artcraft-launcher.exe');
  assert.equal(launcherDataDir(root), 'H:\\ArtCraft\\launcher\\ArtCraftLauncherData');
  assert.equal(appExePath(root, 'designcraft'), 'H:\\ArtCraft\\apps\\designcraft\\designcraft.exe');
});

test('describeInstallRoot：识别主程序 / launcher / apps', () => {
  const world = makeWorld();
  try {
    const info = describeInstallRoot(world.installRoot);
    assert.equal(info.hasMainExe, true);
    assert.equal(info.hasLauncher, true);
    assert.equal(info.hasApps, true);
    assert.equal(info.looks, true);
  } finally {
    world.cleanup();
  }
});

test('resolveInstall：--root 优先，不存在的目录给出清晰错误', () => {
  const world = makeWorld();
  try {
    const ok = resolveInstall({ root: world.installRoot, env: world.env, reader: missingRegistryReader });
    assert.equal(ok.ok, true);
    assert.equal(ok.root, world.installRoot);
    assert.equal(ok.source, 'cli');

    const bad = resolveInstall({ root: path.join(world.base, 'nope'), env: world.env, reader: missingRegistryReader });
    assert.equal(bad.ok, false);
    assert.match(bad.error, /指定的安装目录不存在/);
  } finally {
    world.cleanup();
  }
});

test('resolveInstall：注册表命中（InstallLocation 带引号）', () => {
  const world = makeWorld();
  try {
    const res = resolveInstall({
      env: world.env,
      reader: makeRegistryReader({ installLocation: world.installRoot, version: '0.41.0' }),
    });
    assert.equal(res.ok, true);
    assert.equal(res.root, world.installRoot);
    assert.equal(res.source, 'registry:hkcu-64');
    assert.equal(res.version, '0.41.0');
    assert.match(res.registryKey, /Uninstall\\ArtCraft/);
  } finally {
    world.cleanup();
  }
});

test('resolveInstall：注册表指向的目录不存在时继续兜底并在 warnings 里说明', () => {
  const world = makeWorld();
  try {
    const missingRoot = path.join(world.base, 'ghost');
    const res = resolveInstall({
      env: world.env,
      reader: makeRegistryReader({ installLocation: missingRoot }),
    });
    assert.equal(res.ok, false);
    assert.ok(res.warnings.some((w) => w.includes('注册表里的安装目录不存在')));
    assert.match(res.error, /没有找到本机安装的 ArtCraft/);
  } finally {
    world.cleanup();
  }
});

test('resolveInstall：ARTCRAFT_ROOT 环境变量可用', () => {
  const world = makeWorld();
  try {
    const res = resolveInstall({
      env: { ...world.env, ARTCRAFT_ROOT: world.installRoot },
      reader: missingRegistryReader,
    });
    assert.equal(res.ok, true);
    assert.equal(res.source, 'env');
  } finally {
    world.cleanup();
  }
});

test('resolveInstall：常见位置兜底（%LOCALAPPDATA%\\Programs\\ArtCraft）', () => {
  const world = makeWorld();
  try {
    const fallback = path.join(world.local, 'Programs', 'ArtCraft');
    writeFileDeep(path.join(fallback, 'artcraft.exe'), 'MZ');
    const res = resolveInstall({ env: world.env, reader: missingRegistryReader });
    assert.equal(res.ok, true);
    assert.equal(res.root, fallback);
    assert.equal(res.source, 'fallback:LOCALAPPDATA');
  } finally {
    world.cleanup();
  }
});

test('resolveInstall：全都没有时列出检查过的位置', () => {
  const world = makeWorld();
  try {
    fs.rmSync(world.installRoot, { recursive: true, force: true });
    const res = resolveInstall({ env: world.env, reader: missingRegistryReader });
    assert.equal(res.ok, false);
    assert.ok(res.candidates.length >= 2);
    assert.match(res.error, /请用 --root/);
  } finally {
    world.cleanup();
  }
});

test('fallbackRoots：按 LOCALAPPDATA → ProgramFiles 顺序、去重', () => {
  const roots = fallbackRoots({
    env: {
      LOCALAPPDATA: 'C:\\L',
      ProgramFiles: 'C:\\PF',
      ProgramW6432: 'C:\\PF',
      'ProgramFiles(x86)': 'C:\\PFX',
    },
  });
  assert.deepEqual(
    roots.map((r) => r.dir),
    ['C:\\L\\Programs\\ArtCraft', 'C:\\PF\\ArtCraft', 'C:\\PFX\\ArtCraft'],
  );
});

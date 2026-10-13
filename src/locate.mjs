/**
 * 安装位置识别：`--root` → 环境变量 → 注册表 → 常见路径兜底。
 *
 * 路径拼接一律用 Windows 语义（`path.win32`），本工具只支持 Windows，
 * 这样即使在别的平台上跑单测，路径形态也是确定的。
 */

import { win32 as path } from 'node:path';
import fsDefault from 'node:fs';
import { dirExists, fileExists } from './fsutil.mjs';
import { createRegistryReader, readArtCraftRegistry } from './registry.mjs';

export const MAIN_EXE_NAME = 'artcraft.exe';
export const LAUNCHER_EXE_NAME = 'artcraft-launcher.exe';
export const LAUNCHER_DATA_DIR_NAME = 'ArtCraftLauncherData';
export const LAUNCHER_DIR_NAME = 'launcher';
export const APPS_DIR_NAME = 'apps';

/** @param {string} root */
export function mainExePath(root) {
  return path.join(root, MAIN_EXE_NAME);
}

/** @param {string} root */
export function launcherDir(root) {
  return path.join(root, LAUNCHER_DIR_NAME);
}

/** @param {string} root */
export function launcherExePath(root) {
  return path.join(launcherDir(root), LAUNCHER_EXE_NAME);
}

/** @param {string} root */
export function launcherDataDir(root) {
  return path.join(launcherDir(root), LAUNCHER_DATA_DIR_NAME);
}

/** @param {string} root @param {string} appId */
export function appDir(root, appId) {
  return path.join(root, APPS_DIR_NAME, appId);
}

/** @param {string} root @param {string} appId */
export function appExePath(root, appId) {
  return path.join(appDir(root, appId), `${appId}.exe`);
}

/** @param {string} root */
export function appsDir(root) {
  return path.join(root, APPS_DIR_NAME);
}

/**
 * 常见安装位置兜底。
 * @param {{ env?: Record<string,string|undefined> }} [deps]
 * @returns {Array<{ dir: string, source: string, sourceLabel: string }>}
 */
export function fallbackRoots({ env = process.env } = {}) {
  const out = [];
  const push = (dir, source, sourceLabel) => {
    if (!dir) return;
    const normalized = path.normalize(dir);
    if (!out.some((c) => path.normalize(c.dir).toLowerCase() === normalized.toLowerCase())) {
      out.push({ dir: normalized, source, sourceLabel });
    }
  };

  if (env.LOCALAPPDATA) {
    push(path.join(env.LOCALAPPDATA, 'Programs', 'ArtCraft'), 'fallback:LOCALAPPDATA', '%LOCALAPPDATA%\\Programs\\ArtCraft');
  }
  if (env.ProgramFiles) {
    push(path.join(env.ProgramFiles, 'ArtCraft'), 'fallback:ProgramFiles', '%ProgramFiles%\\ArtCraft');
  }
  if (env.ProgramW6432) {
    push(path.join(env.ProgramW6432, 'ArtCraft'), 'fallback:ProgramW6432', '%ProgramW6432%\\ArtCraft');
  }
  if (env['ProgramFiles(x86)']) {
    push(
      path.join(env['ProgramFiles(x86)'], 'ArtCraft'),
      'fallback:ProgramFilesx86',
      '%ProgramFiles(x86)%\\ArtCraft',
    );
  }
  return out;
}

/**
 * 这个目录像不像一个 ArtCraft 安装目录（至少要有 artcraft.exe）。
 * @param {string} dir
 * @param {typeof fsDefault} [fsImpl]
 * @returns {{ looks: boolean, hasMainExe: boolean, hasLauncher: boolean, hasApps: boolean }}
 */
export function describeInstallRoot(dir, fsImpl = fsDefault) {
  const hasMainExe = fileExists(mainExePath(dir), fsImpl);
  const hasLauncher = fileExists(launcherExePath(dir), fsImpl) || dirExists(launcherDataDir(dir), fsImpl);
  const hasApps = dirExists(appsDir(dir), fsImpl);
  return { looks: hasMainExe || hasLauncher || hasApps, hasMainExe, hasLauncher, hasApps };
}

/**
 * 解析安装位置。
 * @param {{
 *   root?: string|null,
 *   env?: Record<string,string|undefined>,
 *   fs?: typeof fsDefault,
 *   reader?: ReturnType<typeof createRegistryReader>,
 *   registryEntries?: Array<object>|null,
 * }} [deps]
 * @returns {{
 *   ok: boolean, root: string|null, source: string|null, sourceLabel: string,
 *   version: string|null, registryKey: string|null,
 *   candidates: Array<object>, registryEntries: Array<object>, registryErrors: Array<object>,
 *   warnings: string[], error: string|null,
 * }}
 */
export function resolveInstall({
  root = null,
  env = process.env,
  fs = fsDefault,
  reader = null,
  registryEntries = null,
} = {}) {
  const warnings = [];
  const candidates = [];

  let entries = registryEntries;
  let registryErrors = [];
  if (entries === null) {
    const res = readArtCraftRegistry({ reader: reader ?? createRegistryReader(), env });
    entries = res.entries;
    registryErrors = res.errors;
  }

  // 1) 命令行 --root
  if (root) {
    const normalized = path.normalize(root);
    const exists = dirExists(normalized, fs);
    const info = exists ? describeInstallRoot(normalized, fs) : { looks: false };
    candidates.push({
      dir: normalized,
      source: 'cli',
      sourceLabel: '--root 指定',
      exists,
      looksLikeInstall: info.looks,
    });
    if (!exists) {
      return {
        ok: false,
        root: null,
        source: 'cli',
        sourceLabel: '--root 指定',
        version: null,
        registryKey: null,
        candidates,
        registryEntries: entries,
        registryErrors,
        warnings,
        error: `指定的安装目录不存在：${normalized}`,
      };
    }
    if (!info.looks) {
      warnings.push(
        `--root 指定的目录里没有找到 ${MAIN_EXE_NAME}／launcher／apps，仍按该目录继续处理：${normalized}`,
      );
    }
    return {
      ok: true,
      root: normalized,
      source: 'cli',
      sourceLabel: '--root 指定',
      version: entries.find((e) => e.version)?.version ?? null,
      registryKey: null,
      candidates,
      registryEntries: entries,
      registryErrors,
      warnings,
      error: null,
    };
  }

  // 2) 环境变量 ARTCRAFT_ROOT
  if (env.ARTCRAFT_ROOT) {
    const normalized = path.normalize(env.ARTCRAFT_ROOT);
    const exists = dirExists(normalized, fs);
    const info = exists ? describeInstallRoot(normalized, fs) : { looks: false };
    candidates.push({
      dir: normalized,
      source: 'env',
      sourceLabel: 'ARTCRAFT_ROOT 环境变量',
      exists,
      looksLikeInstall: info.looks,
    });
    if (exists) {
      return {
        ok: true,
        root: normalized,
        source: 'env',
        sourceLabel: 'ARTCRAFT_ROOT 环境变量',
        version: entries.find((e) => e.version)?.version ?? null,
        registryKey: null,
        candidates,
        registryEntries: entries,
        registryErrors,
        warnings,
        error: null,
      };
    }
    warnings.push(`ARTCRAFT_ROOT 指向的目录不存在，已忽略：${normalized}`);
  }

  // 3) 注册表
  for (const entry of entries) {
    if (!entry.installLocation) continue;
    const dir = path.normalize(entry.installLocation);
    const exists = dirExists(dir, fs);
    const info = exists ? describeInstallRoot(dir, fs) : { looks: false };
    candidates.push({
      dir,
      source: `registry:${entry.id}`,
      sourceLabel: `注册表 ${entry.keyPath}`,
      exists,
      looksLikeInstall: info.looks,
    });
    if (exists) {
      return {
        ok: true,
        root: dir,
        source: `registry:${entry.id}`,
        sourceLabel: `注册表 ${entry.keyPath}`,
        version: entry.version,
        registryKey: entry.keyPath,
        candidates,
        registryEntries: entries,
        registryErrors,
        warnings,
        error: null,
      };
    }
    warnings.push(`注册表里的安装目录不存在，已跳过：${dir}`);
  }

  // 4) 常见位置兜底
  for (const fb of fallbackRoots({ env })) {
    const exists = dirExists(fb.dir, fs);
    const info = exists ? describeInstallRoot(fb.dir, fs) : { looks: false };
    candidates.push({
      dir: fb.dir,
      source: fb.source,
      sourceLabel: fb.sourceLabel,
      exists,
      looksLikeInstall: info.looks,
    });
    if (exists && info.looks) {
      return {
        ok: true,
        root: fb.dir,
        source: fb.source,
        sourceLabel: fb.sourceLabel,
        version: entries.find((e) => e.version)?.version ?? null,
        registryKey: null,
        candidates,
        registryEntries: entries,
        registryErrors,
        warnings,
        error: null,
      };
    }
  }

  const tried = candidates.map((c) => c.dir).join('、') || '（无）';
  return {
    ok: false,
    root: null,
    source: null,
    sourceLabel: '未找到',
    version: entries.find((e) => e.version)?.version ?? null,
    registryKey: null,
    candidates,
    registryEntries: entries,
    registryErrors,
    warnings,
    error: `没有找到本机安装的 ArtCraft。已尝试：${tried}。请用 --root <安装目录> 手动指定。`,
  };
}

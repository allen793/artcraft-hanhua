/**
 * 运行环境相关的小工具：平台判断、系统区域、目录定位、临时目录可用性。
 */

import { win32 as path } from 'node:path';
import os from 'node:os';
import fsDefault from 'node:fs';
import { MIN_NODE_MAJOR } from './constants.mjs';
import { ensureDir, probeWritable, removeFileIfExists } from './fsutil.mjs';

/**
 * 本工具只支持 Windows。
 * @param {string} [platform]
 * @returns {boolean}
 */
export function isSupportedPlatform(platform = process.platform) {
  return platform === 'win32';
}

/**
 * 平台不受支持时的提示（中英各一句，避免用户看不懂）。
 * @param {string} platform
 */
export function unsupportedPlatformMessage(platform) {
  return [
    `本工具只支持 Windows（当前平台：${platform}）。`,
    `artcraft-hanhua only supports Windows (current platform: ${platform}).`,
    'ArtCraft 套件的数据目录、注册表位置都与 Windows 绑定，其他平台无法识别安装位置。',
  ].join('\n');
}

/**
 * Node 版本是否满足要求。
 * @param {string} [version]
 * @returns {{ ok: boolean, major: number, required: number }}
 */
export function checkNodeVersion(version = process.versions.node) {
  const major = Number.parseInt(String(version).split('.')[0], 10);
  return { ok: Number.isFinite(major) && major >= MIN_NODE_MAJOR, major, required: MIN_NODE_MAJOR };
}

/**
 * %APPDATA%
 * @param {Record<string,string|undefined>} [env]
 * @returns {string|null}
 */
export function roamingAppData(env = process.env) {
  if (env.APPDATA) return env.APPDATA;
  if (env.USERPROFILE) return path.join(env.USERPROFILE, 'AppData', 'Roaming');
  return null;
}

/**
 * %LOCALAPPDATA%
 * @param {Record<string,string|undefined>} [env]
 * @returns {string|null}
 */
export function localAppData(env = process.env) {
  if (env.LOCALAPPDATA) return env.LOCALAPPDATA;
  if (env.USERPROFILE) return path.join(env.USERPROFILE, 'AppData', 'Local');
  return null;
}

/**
 * 系统界面区域（形如 `zh-CN`）。
 *
 * 用 Intl 的默认 locale：它跟随操作系统设置，且不依赖注册表读取。
 * @returns {string}
 */
export function getSystemLocale() {
  try {
    return new Intl.DateTimeFormat().resolvedOptions().locale || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * 系统区域是否是中文。
 * @param {string} [locale]
 */
export function isChineseLocale(locale = getSystemLocale()) {
  return /^zh/i.test(locale);
}

/**
 * 临时目录可用性：建一个临时子目录、写一个文件、再删干净。
 * @param {{ fs?: typeof fsDefault, dir?: string }} [deps]
 * @returns {{ ok: boolean, dir: string, error: string|null }}
 */
export function checkTempDir({ fs = fsDefault, dir = os.tmpdir() } = {}) {
  const probeDir = path.join(dir, `artcraft-hanhua-tmp-${process.pid}-${Date.now()}`);
  try {
    ensureDir(probeDir, fs);
    const probeFile = path.join(probeDir, 'probe.txt');
    fs.writeFileSync(probeFile, 'ok', { encoding: 'utf8' });
    const readBack = fs.readFileSync(probeFile, { encoding: 'utf8' });
    removeFileIfExists(probeFile, fs);
    fs.rmdirSync(probeDir);
    if (readBack !== 'ok') return { ok: false, dir, error: '写入后读回的内容不一致' };
    return { ok: true, dir, error: null };
  } catch (err) {
    try {
      fs.rmSync(probeDir, { recursive: true, force: true });
    } catch {
      /* 清理失败不影响结论 */
    }
    return { ok: false, dir, error: err.message };
  }
}

export { probeWritable };

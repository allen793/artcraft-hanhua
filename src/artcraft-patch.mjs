/**
 * 主程序二进制补丁（**本轮只有骨架，算法尚未接入**）。
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 算法要点（等另一位把已验证的实现交过来后，按这里的约定接入）
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 目标：ArtCraft 主程序是 Tauri v2 + WebView2 应用，前端资源用
 * `tauri::generate_context!` 的 `EmbeddedAssets` 编进 exe，没有独立的语言文件，
 * 所以要汉化只能替换 exe 里内嵌的那份前端资源。
 *
 * 1. EmbeddedAssets 的布局
 *    - 是一张 `phf::Map<&'static str, &'static [u8]>`（Tauri v2 EmbeddedAssets），
 *      编译期生成，静态数据落在 `.rdata` 段。
 *    - phf 表条目**定长 40 字节**，5 个 8 字节字段：
 *        hash(u64) | key.ptr(u64) | key.len(u64) | value.ptr(u64) | value.len(u64)
 *      其中 ptr 是**绝对 VA**（链接基址 0x140000000 那一套），
 *      换算文件偏移需要按 PE 节表做 RVA→Offset 映射。
 *    - key 是资源路径（形如 `/index.html`、`/assets/xxx.js`）。
 *
 * 2. 每条 value 是**独立的 brotli 流**（Tauri 的 compression feature），
 *    解压后才是真正的 HTML/JS/CSS 文本。压缩比不同 → 替换后长度必然变化。
 *
 * 3. 变长替换的做法（已验证的方向）
 *    - 只解压/重压需要的条目；中文译文按 `data/translations.tsv` 里
 *      「英文 → 中文」对齐替换（注意保留原有 HTML/JS 结构，只替换可见文案）。
 *    - 因为新流长度不等于旧流长度，**不要在原位置就地覆盖**：
 *      追加一个**新的 PE 段**（须同时更新节表、SizeOfImage、段对齐/文件对齐，
 *      必要时补数据目录与校验和），把新的 brotli 流写进去。
 *    - 然后**只改 phf 条目里的 value.ptr / value.len** 指向新段；
 *      key/hash 一个字都不能动，表本身也不能重排或扩容。
 *
 * 4. CSP 哈希
 *    Tauri 生成的 index.html 里会有 `script-src 'sha256-...'` 与
 *    `style-src 'sha256-...'` 两条内联内容的哈希。替换后解压内容变了，
 *    这两条 sha256 必须**按新的解压内容重算并回写**（见 `recomputeCspHashes`），
 *    否则 WebView2 直接拒绝执行内联脚本，界面白屏。
 *
 * 5. 其它约束
 *    - ArtCraft 更新后版本一变，phf 表位置与条目集合都可能变，所以必须**按版本判断**是否支持
 *      （见 `isPatchSupported`），不要盲目套用。
 *    - 产物另存为新文件（默认 `artcraft-zh-full.exe`），**不覆盖原 exe**；
 *      原 exe 保持可用来回滚。
 *    - 涉及数字签名：打过补丁的 exe 签名必然失效，这是预期行为。
 *
 * ═══════════════════════════════════════════════════════════════════════
 */

import { win32 as path } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PATCHED_MAIN_EXE_NAME } from './constants.mjs';
import { fileExists } from './fsutil.mjs';

/** 本模块的接口版本；算法接入后如果签名变了就 +1 */
export const ARTCRAFT_PATCH_VERSION = 1;

/** 实测确认过的主程序版本（补丁算法只对这些版本负责） */
export const SUPPORTED_MAIN_VERSIONS = ['0.41.0'];

/**
 * 把版本号规范化成 `major.minor.patch`。
 * @param {string|null|undefined} version
 * @returns {string|null}
 */
export function normalizeVersion(version) {
  if (!version) return null;
  const parts = String(version).trim().split('.').filter((s) => s !== '');
  if (parts.length === 0) return null;
  return parts.slice(0, 3).join('.');
}

/** PowerShell 单引号字符串转义 */
function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * 默认执行器：用 PowerShell 读 exe 的版本资源。
 *
 * 之所以走 PowerShell：Node 内置模块里没有 PE 版本资源的读取能力，
 * 而本项目不允许引入第三方依赖。返回 stdout 供 `parseExeVersions` 解析。
 * @param {string} script
 * @returns {{ status: number, stdout: string, stderr: string, error: Error|null }}
 */
export function defaultPowerShellExec(script) {
  const candidates = ['powershell.exe', 'pwsh.exe'];
  let last = { status: 1, stdout: '', stderr: '', error: null };
  for (const exe of candidates) {
    const res = spawnSync(exe, ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      windowsHide: true,
    });
    last = {
      status: res.status === null ? 1 : res.status,
      stdout: res.stdout ?? '',
      stderr: res.stderr ?? '',
      error: res.error ?? null,
    };
    if (!last.error && last.status === 0) return last;
    if (last.error && last.error.code === 'ENOENT') continue;
    if (!last.error) return last;
  }
  return last;
}

/**
 * 解析「路径 \t 版本」的输出。
 * @param {string} stdout
 * @param {string[]} [wantedPaths]
 * @returns {{ entries: Array<{path: string, version: string|null}>, byPath: Record<string, string|null> }}
 */
export function parseExeVersions(stdout, wantedPaths = []) {
  const entries = [];
  const byPath = {};
  for (const rawLine of String(stdout ?? '').split(/\r?\n/)) {
    const tab = rawLine.indexOf('\t');
    if (tab < 0) continue;
    const filePath = rawLine.slice(0, tab).trim();
    if (filePath === '') continue;
    const version = rawLine.slice(tab + 1).trim() || null;
    entries.push({ path: filePath, version });
    byPath[filePath.toLowerCase()] = version;
  }
  for (const wanted of wantedPaths) {
    const key = String(wanted).toLowerCase();
    if (!(key in byPath)) byPath[key] = null;
  }
  return { entries, byPath };
}

/**
 * 批量读取 exe 版本。
 * @param {{ paths: string[], exec?: (script: string) => {status: number, stdout: string, stderr: string, error: Error|null} }} deps
 * @returns {{ ok: boolean, byPath: Record<string, string|null>, entries: Array<object>, error: string|null }}
 */
export function readExeVersions({ paths, exec = defaultPowerShellExec }) {
  const list = (paths ?? []).filter(Boolean);
  if (list.length === 0) return { ok: true, byPath: {}, entries: [], error: null };
  const script =
    "$ErrorActionPreference='SilentlyContinue'; " +
    `Get-Item -LiteralPath ${list.map(psQuote).join(',')} | ` +
    'ForEach-Object { $_.FullName + [char]9 + $_.VersionInfo.FileVersion }';
  const res = exec(script);
  if (res.error) {
    return { ok: false, byPath: {}, entries: [], error: `无法执行 PowerShell：${res.error.message}` };
  }
  if (res.status !== 0) {
    const errText = (res.stderr || '').trim().split(/\r?\n/)[0] || `PowerShell 退出码 ${res.status}`;
    return { ok: false, byPath: {}, entries: [], error: errText };
  }
  const parsed = parseExeVersions(res.stdout, list);
  return { ok: true, ...parsed, error: null };
}

/**
 * 读取单个 exe 的版本。
 * @param {{ exePath: string, exec?: Function }} deps
 * @returns {{ ok: boolean, version: string|null, error: string|null }}
 */
export function readExeVersion({ exePath, exec = defaultPowerShellExec }) {
  if (!exePath) return { ok: false, version: null, error: '没有提供 exe 路径' };
  if (!fileExists(exePath)) return { ok: false, version: null, error: `文件不存在：${exePath}` };
  const res = readExeVersions({ paths: [exePath], exec });
  if (!res.ok) return { ok: false, version: null, error: res.error };
  const version = res.byPath[String(exePath).toLowerCase()] ?? null;
  return { ok: version !== null, version, error: version === null ? '读不到版本信息' : null };
}

/**
 * 判断这个主程序是否可以打补丁。
 *
 * @param {{ exePath: string, version?: string|null, exec?: Function }} deps
 * @returns {{ supported: boolean, version: string|null, reason: string }}
 */
export function isPatchSupported({ exePath, version = null, exec = defaultPowerShellExec } = {}) {
  if (!exePath) {
    return { supported: false, version: null, reason: '没有可用的主程序路径' };
  }
  if (!fileExists(exePath)) {
    return { supported: false, version: normalizeVersion(version), reason: `未找到主程序文件：${exePath}` };
  }

  let resolved = normalizeVersion(version);
  let readError = null;
  if (!resolved) {
    const read = readExeVersion({ exePath, exec });
    resolved = normalizeVersion(read.version);
    readError = read.error;
  }
  if (!resolved) {
    return {
      supported: false,
      version: null,
      reason: `无法读取主程序版本信息${readError ? `（${readError}）` : ''}`,
    };
  }
  if (SUPPORTED_MAIN_VERSIONS.includes(resolved)) {
    return { supported: true, version: resolved, reason: `版本 ${resolved} 在实测支持列表内` };
  }
  return {
    supported: false,
    version: resolved,
    reason:
      `实测支持的主程序版本为 ${SUPPORTED_MAIN_VERSIONS.join(' / ')}，当前是 ${resolved}；` +
      'phf 表布局可能随版本变化，请先重新验证补丁算法',
  };
}

/**
 * 补丁产物路径。
 * @param {{ exePath: string, outPath?: string|null }} deps
 * @returns {string}
 */
export function defaultPatchedExePath({ exePath, outPath = null }) {
  if (outPath) return outPath;
  return path.join(path.dirname(exePath), PATCHED_MAIN_EXE_NAME);
}

/**
 * 对主程序打补丁 —— **尚未实现**。
 *
 * 后续接入时的约定：
 * @param {{
 *   exePath: string,
 *   outPath?: string,
 *   translations?: Array<{id: string, en: string, zh: string}>|Record<string,string>,
 *   log?: (message: string) => void,
 * }} params
 * @returns {Promise<{ exePath: string, outPath: string, replaced: number }>}
 */
export function patchMainApp(params = {}) {
  const log = typeof params.log === 'function' ? params.log : () => {};
  log('主程序补丁：等待接入已验证的 Tauri EmbeddedAssets 补丁算法，本次不改动 exe。');
  throw new Error('未实现：等待接入已验证的 Tauri EmbeddedAssets 补丁算法');
}

/**
 * 重算 CSP 里的两条 sha256 —— **尚未实现**。
 *
 * 接入时要按替换后的**解压内容**重新计算：
 * `sha256-<base64>`（CSP 用的是内容哈希的 base64，不是 hex）。
 * @param {{ decompressedAssets: Array<{path: string, bytes: Uint8Array}> }} params
 * @returns {{ scriptSrc: string, styleSrc: string }}
 */
export function recomputeCspHashes(params = {}) {
  void params;
  throw new Error('未实现：等待接入已验证的 Tauri EmbeddedAssets 补丁算法');
}

/**
 * Windows 注册表读取（只读）。
 *
 * 位置（实测）：`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\ArtCraft`
 * 以及 `HKCU` 同名路径；值 `InstallLocation` 给安装目录（**可能带引号**，如 `"H:\ArtCraft"`），
 * `DisplayVersion` 给版本（本机 0.41.0）。
 *
 * 为了可测试性，真正执行 `reg query` 的部分被抽成可注入的 `exec`。
 */

import { spawnSync } from 'node:child_process';

export const ARTCRAFT_UNINSTALL_SUBKEY =
  'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ArtCraft';
export const ARTCRAFT_UNINSTALL_SUBKEY_WOW =
  'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ArtCraft';

/** 依次尝试的注册表候选位置 */
export const REGISTRY_CANDIDATES = [
  { id: 'hkcu-64', hive: 'HKCU', subKey: ARTCRAFT_UNINSTALL_SUBKEY, view: 64 },
  { id: 'hklm-64', hive: 'HKLM', subKey: ARTCRAFT_UNINSTALL_SUBKEY, view: 64 },
  { id: 'hkcu-32', hive: 'HKCU', subKey: ARTCRAFT_UNINSTALL_SUBKEY, view: 32 },
  { id: 'hklm-32', hive: 'HKLM', subKey: ARTCRAFT_UNINSTALL_SUBKEY, view: 32 },
  { id: 'hkcu-wow', hive: 'HKCU', subKey: ARTCRAFT_UNINSTALL_SUBKEY_WOW, view: 64 },
  { id: 'hklm-wow', hive: 'HKLM', subKey: ARTCRAFT_UNINSTALL_SUBKEY_WOW, view: 64 },
];

/**
 * 解析 `reg query` 的文本输出。
 *
 * 形如：
 * ```
 * HKEY_CURRENT_USER\SOFTWARE\...\ArtCraft
 *     MainBinaryName    REG_SZ    artcraft.exe
 *     InstallLocation    REG_SZ    "H:\ArtCraft"
 * ```
 * @param {string} stdout
 * @returns {{ keyName: string|null, values: Record<string, {name: string, type: string, value: string}>, order: string[] }}
 */
export function parseRegQueryOutput(stdout) {
  const values = {};
  const order = [];
  const lines = String(stdout ?? '').split(/\r?\n/);
  let current = null;
  let keyName = null;

  for (const line of lines) {
    if (line.trim() === '') {
      current = null;
      continue;
    }
    if (!/^\s/.test(line)) {
      keyName = line.trim();
      current = null;
      continue;
    }
    const m = /^\s{2,}(.+?)\s{4}(REG_[A-Z_]+)(?:\s{4}([\s\S]*))?$/.exec(line);
    if (m) {
      current = { name: m[1].trim(), type: m[2], value: m[3] === undefined ? '' : m[3] };
      values[current.name] = current;
      order.push(current.name);
      continue;
    }
    // REG_MULTI_SZ 的续行
    if (current && current.type === 'REG_MULTI_SZ') {
      current.value += `\n${line.trim()}`;
      continue;
    }
    current = null;
  }

  return { keyName, values, order };
}

/**
 * 展开 `%VAR%` 形式的环境变量（安装器常写未展开的 `REG_SZ`）。
 * @param {string} value
 * @param {NodeJS.ProcessEnv|Record<string,string|undefined>} env
 * @returns {string}
 */
export function expandEnvVars(value, env = process.env) {
  if (typeof value !== 'string' || !value.includes('%')) return value;
  return value.replace(/%([^%]+)%/g, (whole, name) => {
    const hit = env[name] ?? env[name.toUpperCase()] ?? env[name.toLowerCase()];
    return hit === undefined ? whole : hit;
  });
}

/**
 * 规范化 InstallLocation：去空白、去包裹引号、展开环境变量、去尾部分隔符。
 * @param {string} raw
 * @param {Record<string,string|undefined>} [env]
 * @returns {string|null}
 */
export function normalizeInstallLocation(raw, env = process.env) {
  if (typeof raw !== 'string') return null;
  let v = raw.trim();
  if (v.length >= 2) {
    const first = v[0];
    const last = v[v.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      v = v.slice(1, -1).trim();
    }
  }
  v = expandEnvVars(v, env).trim();
  if (v === '') return null;
  while (v.length > 3 && (v.endsWith('\\') || v.endsWith('/'))) v = v.slice(0, -1);
  return v;
}

/**
 * 默认执行器：调用 `reg.exe`。
 *
 * 注意用 Buffer 收输出再自己解码：`encoding: 'utf8'` 会把 GBK 错误信息变成乱码。
 * @param {{ hive: string, subKey: string, view: number }} spec
 * @returns {{ status: number, stdout: string, stderr: string, error: Error|null }}
 */
export function defaultRegExec({ hive, subKey, view }) {
  const args = ['query', `${hive}\\${subKey}`];
  if (view === 32) args.push('/reg:32');
  const res = spawnSync('reg', args, { windowsHide: true });
  return {
    status: res.status === null ? 1 : res.status,
    stdout: decodeConsoleText(res.stdout),
    stderr: decodeConsoleText(res.stderr),
    error: res.error ?? null,
  };
}

/**
 * 判断 `reg query` 的失败是否只是「没有这个键」。
 * @param {string} text
 * @returns {boolean}
 */
export function isRegistryKeyMissing(text) {
  return /unable to find the specified registry key|找不到指定的注册表项|无法找到指定的注册表/i.test(
    String(text ?? ''),
  );
}

/**
 * 尽力把控制台输出解码成文本。
 *
 * `reg.exe` 的错误信息是按**系统 OEM 代码页**输出的（中文 Windows 上是 GBK），
 * 直接按 UTF-8 解码会得到乱码。这里先试 UTF-8，出现替换字符时再依次试其它常见代码页。
 * @param {Buffer|string|null|undefined} buf
 * @returns {string}
 */
export function decodeConsoleText(buf) {
  if (buf === null || buf === undefined) return '';
  const bytes = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf), 'binary');
  const utf8 = bytes.toString('utf8');
  if (!utf8.includes('\uFFFD')) return utf8;
  for (const encoding of ['gbk', 'big5', 'shift_jis', 'euc-kr', 'windows-1252']) {
    try {
      const text = new TextDecoder(encoding).decode(bytes);
      if (!text.includes('\uFFFD')) return text;
    } catch {
      // 该编码在当前 Node 构建里不可用，继续试下一个
    }
  }
  return utf8;
}

/**
 * 创建注册表读取器。
 * @param {{ exec?: (spec: {hive: string, subKey: string, view: number}) => {status: number, stdout: string, stderr: string, error: Error|null} }} [deps]
 * @returns {{ query: (candidate: {id?: string, hive: string, subKey: string, view?: number}) => {ok: boolean, missing: boolean, values: object, keyName: string|null, error: string|null, keyPath: string} }}
 */
export function createRegistryReader({ exec = defaultRegExec } = {}) {
  return {
    query(candidate) {
      const { hive, subKey } = candidate;
      const view = candidate.view ?? 64;
      const keyPath = `${hive}\\${subKey}`;
      const res = exec({ hive, subKey, view });
      const combined = `${res.stdout ?? ''}\n${res.stderr ?? ''}`;
      if (res.error) {
        return {
          ok: false,
          missing: false,
          values: {},
          keyName: null,
          error: `无法执行 reg.exe：${res.error.message}`,
          keyPath,
        };
      }
      if (res.status !== 0) {
        // reg query 对「键或值不存在」返回 1。错误信息是**本地化**的（中文系统上是 GBK），
        // 靠文本判断并不可靠，所以这里一律按「不存在」处理，同时把原始输出留作诊断。
        const rawError = isRegistryKeyMissing(combined)
          ? null
          : (res.stderr || res.stdout || '').trim().split(/\r?\n/)[0] || null;
        return { ok: false, missing: true, values: {}, keyName: null, error: null, keyPath, rawError };
      }
      const parsed = parseRegQueryOutput(res.stdout);
      if (parsed.order.length === 0) {
        return {
          ok: false,
          missing: true,
          values: {},
          keyName: parsed.keyName,
          error: null,
          keyPath,
        };
      }
      return { ok: true, missing: false, values: parsed.values, keyName: parsed.keyName, error: null, keyPath };
    },
  };
}

/**
 * 按候选顺序读取 ArtCraft 卸载项。
 * @param {{ reader?: ReturnType<typeof createRegistryReader>, candidates?: typeof REGISTRY_CANDIDATES, env?: Record<string,string|undefined> }} [deps]
 * @returns {{ entries: Array<object>, errors: Array<{keyPath: string, error: string}>, notFound: string[], forced: boolean }}
 */
export function readArtCraftRegistry({
  reader = createRegistryReader(),
  candidates = REGISTRY_CANDIDATES,
  env = process.env,
} = {}) {
  const entries = [];
  const errors = [];
  const notFound = [];
  const notFoundDetails = [];

  for (const candidate of candidates) {
    const res = reader.query(candidate);
    if (!res.ok) {
      if (res.missing) {
        notFound.push(res.keyPath);
        if (res.rawError) notFoundDetails.push({ keyPath: res.keyPath, rawError: res.rawError });
      } else if (res.error) errors.push({ keyPath: res.keyPath, error: res.error });
      continue;
    }
    const rawLocation = res.values.InstallLocation?.value ?? null;
    const installLocation = normalizeInstallLocation(rawLocation, env);
    entries.push({
      id: candidate.id,
      hive: candidate.hive,
      subKey: candidate.subKey,
      view: candidate.view ?? 64,
      keyPath: res.keyPath,
      displayName: res.values.DisplayName?.value ?? 'ArtCraft',
      version: (res.values.DisplayVersion?.value ?? '').trim() || null,
      installLocationRaw: rawLocation,
      installLocation,
      mainBinaryName: res.values.MainBinaryName?.value ?? null,
      values: res.values,
    });
  }

  return { entries, errors, notFound, notFoundDetails, forced: false };
}

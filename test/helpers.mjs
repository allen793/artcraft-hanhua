/**
 * 单测共用的辅助函数。
 *
 * 重要约定：测试**绝不能**碰真实的 `%APPDATA%`、真实注册表和 `H:\ArtCraft`。
 * 所以每个测试都在临时目录里造一个「世界」：假的安装目录 + 假的 APPDATA，
 * 并把注册表读取与 exe 版本读取都替换成注入的假实现。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { SUITE_APP_IDS } from '../src/constants.mjs';
import { createContext } from '../src/context.mjs';

export function tmpdir(prefix = 'artcraft-hanhua-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function writeFileDeep(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, { encoding: 'utf8' });
}

export function writeBytesDeep(filePath, bytes) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, bytes);
}

export function readBytes(filePath) {
  return fs.readFileSync(filePath);
}

export function readText(filePath) {
  return fs.readFileSync(filePath, { encoding: 'utf8' });
}

export function exists(filePath) {
  return fs.existsSync(filePath);
}

/** 文件是否以 UTF-8 BOM 开头（本工具最关键的回归断言） */
export function hasBom(filePath) {
  const b = readBytes(filePath);
  return b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf;
}

export function sha256(text) {
  return crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

/** 目录快照：用于断言「dry-run 一个字节都没写」 */
export function snapshotTree(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        out.push(
          `${path.relative(dir, full)}|${fs.statSync(full).size}|${crypto
            .createHash('sha256')
            .update(fs.readFileSync(full))
            .digest('hex')}`,
        );
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out.sort();
}

/** 假注册表读取器：读不到任何键 */
export const missingRegistryReader = {
  query(candidate) {
    return {
      ok: false,
      missing: true,
      values: {},
      keyName: null,
      error: null,
      keyPath: `${candidate.hive}\\${candidate.subKey}`,
      rawError: null,
    };
  },
};

/**
 * 假的注册表读取器：只在 HKCU 64 位视图上返回一条记录。
 * @param {{ installLocation?: string, version?: string }} [entry]
 */
export function makeRegistryReader(entry = {}) {
  const installLocation = entry.installLocation ?? null;
  const version = entry.version ?? '0.41.0';
  return {
    query(candidate) {
      const keyPath = `${candidate.hive}\\${candidate.subKey}`;
      if (candidate.hive === 'HKCU' && candidate.view === 64 && !candidate.subKey.includes('WOW6432Node')) {
        return {
          ok: true,
          missing: false,
          keyName: installLocation,
          error: null,
          keyPath,
          values: {
            DisplayName: { name: 'DisplayName', type: 'REG_SZ', value: 'ArtCraft' },
            DisplayVersion: { name: 'DisplayVersion', type: 'REG_SZ', value: version },
            InstallLocation: {
              name: 'InstallLocation',
              type: 'REG_SZ',
              value: installLocation === null ? '' : `"${installLocation}"`,
            },
          },
        };
      }
      return { ok: false, missing: true, values: {}, keyName: null, error: null, keyPath, rawError: null };
    },
  };
}

/**
 * 假的 exe 版本读取：把脚本里出现的路径都回一个固定版本。
 * @param {string} version
 */
export function makeExeVersionExec(version = '0.41.0') {
  return (script) => {
    const paths = [...String(script).matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));
    return {
      status: 0,
      stdout: `${paths.map((p) => `${p}\t${version}`).join('\n')}\n`,
      stderr: '',
      error: null,
    };
  };
}

/** 期望拿不到版本（模拟 PowerShell 不可用） */
export function failingExeVersionExec() {
  return () => ({ status: 1, stdout: '', stderr: 'boom', error: null });
}

/**
 * 造一个临时「世界」。
 * @param {{ appConfigs?: boolean }} [options]
 */
export function makeWorld(options = {}) {
  const { appConfigs = true } = options;
  const base = tmpdir();
  const installRoot = path.join(base, 'ArtCraft');
  const roaming = path.join(base, 'Roaming');
  const local = path.join(base, 'Local');
  const env = {
    APPDATA: roaming,
    LOCALAPPDATA: local,
    USERPROFILE: base,
    ProgramFiles: path.join(base, 'ProgramFiles'),
    'ProgramFiles(x86)': path.join(base, 'ProgramFilesx86'),
    ProgramW6432: path.join(base, 'ProgramFiles'),
    TEMP: path.join(base, 'Temp'),
  };

  fs.mkdirSync(installRoot, { recursive: true });
  fs.mkdirSync(roaming, { recursive: true });
  fs.mkdirSync(local, { recursive: true });

  writeFileDeep(path.join(installRoot, 'artcraft.exe'), 'MZ fake main executable');
  writeFileDeep(path.join(installRoot, 'launcher', 'artcraft-launcher.exe'), 'MZ fake launcher');
  for (const appId of SUITE_APP_IDS) {
    writeFileDeep(path.join(installRoot, 'apps', appId, `${appId}.exe`), `MZ fake ${appId}`);
  }

  if (appConfigs) {
    // DesignCraft：真实文件是 2 空格缩进的 JSON，带 language 字段（这里刻意保存成无 BOM）
    writeFileDeep(
      path.join(roaming, 'DesignCraft', 'ui.json'),
      `${JSON.stringify(
        {
          brightness: 'MediumDark',
          screenMode: 'normal',
          scripts: [['Number the pages', 'frame.create {}']],
          language: '',
          flattener: '',
          uiScale: 1.0,
          pendingUrls: [],
        },
        null,
        2,
      )}\n`,
    );
    // EffectCraft：language 在 general 段里
    writeFileDeep(
      path.join(roaming, 'EffectCraft', 'prefs.json'),
      `${JSON.stringify(
        {
          version: 2,
          general: { language: 'system', undoLevels: 32, showToolTips: true },
          appearance: { theme: 'dark', brightness: 0.0 },
          labels: [{ name: 'Red', color: '#b53838' }],
        },
        null,
        2,
      )}\n`,
    );
    // DeckCraft / SoundCraft：没有语言键（上游不支持中文）
    writeFileDeep(path.join(roaming, 'DeckCraft', 'ui.json'), '{ "slides": [] }\n');
    writeFileDeep(path.join(roaming, 'SoundCraft', 'ui.json'), '{ "tracks": [] }\n');
    // CADCraft：语言白名单里没有 zh；其 app.ron 是 RON 的 map 形式，
    // 语言键 `interfaceLanguage` 被嵌在一段转义的 JSON 字符串里（与真机实测一致）
    writeFileDeep(
      path.join(roaming, 'ai.storyteller.cadcraft', 'data', 'app.ron'),
      '{\n    "cadcraft.prefs": "{\\"interfaceLanguage\\":\\"auto\\",\\"saveFormat\\":\\"dxf\\",\\"theme\\":\\"dark\\"}",\n}\n',
    );
    // LightCraft 与 Launcher 的配置文件故意**不创建**，用来验证「创建 + 标记 + 回滚时删除」
  }

  return {
    base,
    installRoot,
    roaming,
    local,
    env,
    statePath: path.join(local, 'artcraft-hanhua', 'state.json'),
    cleanup() {
      fs.rmSync(base, { recursive: true, force: true });
    },
  };
}

/**
 * 造命令上下文。
 * @param {ReturnType<typeof makeWorld>} world
 * @param {object} [extraOptions]
 * @param {object} [extraDeps]
 */
export function makeCtx(world, extraOptions = {}, extraDeps = {}) {
  const options = {
    root: world.installRoot,
    only: null,
    dryRun: false,
    yes: true,
    json: false,
    requireMain: false,
    state: world.statePath,
    ...extraOptions,
  };
  return createContext(options, {
    env: world.env,
    platform: 'win32',
    registryReader: missingRegistryReader,
    exeVersionExec: makeExeVersionExec(),
    ...extraDeps,
  });
}

/** 收集 stdout/stderr 的假流 */
export function fakeStreams() {
  const mk = () => {
    const chunks = [];
    return {
      chunks,
      isTTY: false,
      write(s) {
        chunks.push(String(s));
        return true;
      },
      get text() {
        return chunks.join('');
      },
    };
  };
  return { stdout: mk(), stderr: mk() };
}

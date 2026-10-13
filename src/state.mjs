/**
 * 变更日志（journal）：`%LOCALAPPDATA%\artcraft-hanhua\state.json`
 *
 * 记下每一次改动：改前/改后哈希、动作（modified / created）、备份位置、时间。
 * `revert` 用它做两件事：
 *  1. 判断某个文件是「本工具创建的」（要删除）还是「被改写的」（要从备份还原）
 *  2. 还原后校验哈希，确认真的回到了原始内容
 *
 * 日志本身丢失不会导致数据损坏：备份文件与 marker 文件都留在配置文件旁边，
 * revert 即使读不到 state.json，也能靠备份还原。
 */

import { win32 as path } from 'node:path';
import fsDefault from 'node:fs';
import { STATE_DIR_NAME, STATE_FILE_NAME, STATE_VERSION } from './constants.mjs';
import { ensureDir, fileExists, readTextFile, writeUtf8NoBom } from './fsutil.mjs';
import { localAppData } from './sysenv.mjs';

/**
 * 默认日志路径。
 * @param {Record<string,string|undefined>} [env]
 * @returns {string}
 */
export function defaultStatePath(env = process.env) {
  const base = localAppData(env) ?? path.join(env.USERPROFILE ?? '.', 'AppData', 'Local');
  return path.join(base, STATE_DIR_NAME, STATE_FILE_NAME);
}

/** 空日志 */
export function emptyState() {
  return {
    version: STATE_VERSION,
    tool: 'artcraft-hanhua',
    updatedAt: null,
    entries: {},
  };
}

/**
 * 读取日志；文件缺失或损坏时返回空日志（并在 `damaged` 里说明）。
 * @param {string} filePath
 * @param {{ fs?: typeof fsDefault }} [deps]
 * @returns {{ state: object, damaged: string|null }}
 */
export function loadState(filePath, { fs = fsDefault } = {}) {
  if (!fileExists(filePath, fs)) return { state: emptyState(), damaged: null };
  const read = readTextFile(filePath, fs);
  if (!read.ok) return { state: emptyState(), damaged: read.error };
  try {
    const parsed = JSON.parse(read.text);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.entries !== 'object' || parsed.entries === null) {
      return { state: emptyState(), damaged: 'state.json 结构不正确，已按空日志处理' };
    }
    return {
      state: { ...emptyState(), ...parsed, entries: { ...parsed.entries } },
      damaged: null,
    };
  } catch (err) {
    return { state: emptyState(), damaged: `state.json 解析失败：${err.message}` };
  }
}

/**
 * 保存日志（无 BOM 的 UTF-8）。
 * @param {string} filePath
 * @param {object} state
 * @param {{ fs?: typeof fsDefault }} [deps]
 * @returns {{ ok: boolean, error: string|null }}
 */
export function saveState(filePath, state, { fs = fsDefault } = {}) {
  try {
    ensureDir(path.dirname(filePath), fs);
    const next = { ...state, version: STATE_VERSION, updatedAt: new Date().toISOString() };
    writeUtf8NoBom(filePath, `${JSON.stringify(next, null, 2)}\n`, fs);
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * 日志条目键。
 * @param {string} targetId
 * @param {string} filePath
 */
export function entryKey(targetId, filePath) {
  return `${targetId}::${filePath}`;
}

/**
 * 写一条日志条目（原地修改 state）。
 * @param {object} state
 * @param {object} entry
 */
export function setEntry(state, entry) {
  const key = entryKey(entry.targetId, entry.path);
  state.entries[key] = { ...entry, appliedAt: entry.appliedAt ?? new Date().toISOString() };
  return state.entries[key];
}

/**
 * 读一条日志条目。
 * @param {object} state
 * @param {string} targetId
 * @param {string} filePath
 */
export function getEntry(state, targetId, filePath) {
  return state.entries[entryKey(targetId, filePath)] ?? null;
}

/**
 * 删除一条日志条目。
 * @param {object} state
 * @param {string} targetId
 * @param {string} filePath
 */
export function removeEntry(state, targetId, filePath) {
  const key = entryKey(targetId, filePath);
  const existed = Object.prototype.hasOwnProperty.call(state.entries, key);
  delete state.entries[key];
  return existed;
}

/**
 * 某个目标的所有日志条目。
 * @param {object} state
 * @param {string} targetId
 */
export function listEntriesForTarget(state, targetId) {
  return Object.values(state.entries).filter((e) => e && e.targetId === targetId);
}

/**
 * 备份与「本工具创建了这个文件」标记。
 *
 * 规则（来自实测要求）：
 * - 写任何配置文件之前，先在**同目录**留一份 `<文件名>.bak-before-hanhua`
 * - 备份已存在就**不要覆盖**（它保存的是最早的那份原始内容）
 * - 对「原本不存在、由本工具创建」的文件（如 LightCraft 的 ui.json），
 *   revert 时要**删除**它而不是留下空文件 —— 靠一个 marker 文件记住这件事
 */

import { win32 as path } from 'node:path';
import fsDefault from 'node:fs';
import { BACKUP_SUFFIX, CREATED_MARKER_SUFFIX } from './constants.mjs';
import { copyFile, fileExists, removeFileIfExists, writeUtf8NoBom } from './fsutil.mjs';

/**
 * 备份文件路径：`<文件所在目录>\<文件名>.bak-before-hanhua`
 * @param {string} filePath
 * @returns {string}
 */
export function backupPathFor(filePath) {
  return path.join(path.dirname(filePath), `${path.basename(filePath)}${BACKUP_SUFFIX}`);
}

/**
 * 「本工具创建」标记文件路径。
 * @param {string} filePath
 * @returns {string}
 */
export function createdMarkerPathFor(filePath) {
  return path.join(path.dirname(filePath), `${path.basename(filePath)}${CREATED_MARKER_SUFFIX}`);
}

/**
 * 需要时创建备份（已存在则保留原备份）。
 * @param {string} filePath
 * @param {{ fs?: typeof fsDefault }} [deps]
 * @returns {{ ok: boolean, backupPath: string, created: boolean, existedBefore: boolean, error: string|null }}
 */
export function createBackupIfMissing(filePath, { fs = fsDefault } = {}) {
  const backupPath = backupPathFor(filePath);
  const existedBefore = fileExists(filePath, fs);
  if (!existedBefore) {
    return { ok: true, backupPath, created: false, existedBefore: false, error: null };
  }
  if (fileExists(backupPath, fs)) {
    return { ok: true, backupPath, created: false, existedBefore: true, error: null };
  }
  try {
    copyFile(filePath, backupPath, fs);
    return { ok: true, backupPath, created: true, existedBefore: true, error: null };
  } catch (err) {
    return { ok: false, backupPath, created: false, existedBefore: true, error: err.message };
  }
}

/**
 * 写入「本工具创建」标记。
 * @param {string} filePath
 * @param {{ targetId?: string, at?: string, fs?: typeof fsDefault }} [deps]
 * @returns {{ ok: boolean, markerPath: string, error: string|null }}
 */
export function writeCreatedMarker(filePath, { targetId = '', at = new Date().toISOString(), fs = fsDefault } = {}) {
  const markerPath = createdMarkerPathFor(filePath);
  try {
    // 这里的注释是给用户看的：说明这个 marker 是什么、能不能删
    writeUtf8NoBom(
      markerPath,
      [
        '# 由 artcraft-hanhua 创建：上面的文件在本工具运行前并不存在。',
        '# revert 会删除它；确认不再需要回滚时，可以直接删掉本 marker 文件。',
        `target: ${targetId}`,
        `created-at: ${at}`,
        '',
      ].join('\n'),
      fs,
    );
    return { ok: true, markerPath, error: null };
  } catch (err) {
    return { ok: false, markerPath, error: err.message };
  }
}

/**
 * 读取「本工具创建」标记。
 * @param {string} filePath
 * @param {{ fs?: typeof fsDefault }} [deps]
 * @returns {{ exists: boolean, targetId: string|null, markerPath: string }}
 */
export function readCreatedMarker(filePath, { fs = fsDefault } = {}) {
  const markerPath = createdMarkerPathFor(filePath);
  if (!fileExists(markerPath, fs)) return { exists: false, targetId: null, markerPath };
  let targetId = null;
  try {
    const text = fs.readFileSync(markerPath, { encoding: 'utf8' });
    const m = /^target:\s*(.*)$/m.exec(text);
    targetId = m ? m[1].trim() || null : null;
  } catch {
    targetId = null;
  }
  return { exists: true, targetId, markerPath };
}

/**
 * 删除标记文件。
 * @param {string} filePath
 * @param {{ fs?: typeof fsDefault }} [deps]
 * @returns {boolean}
 */
export function removeCreatedMarker(filePath, { fs = fsDefault } = {}) {
  return removeFileIfExists(createdMarkerPathFor(filePath), fs);
}

/**
 * 从备份还原文件。
 * @param {string} filePath
 * @param {{ fs?: typeof fsDefault }} [deps]
 * @returns {{ ok: boolean, backupPath: string, error: string|null }}
 */
export function restoreFromBackup(filePath, { fs = fsDefault } = {}) {
  const backupPath = backupPathFor(filePath);
  if (!fileExists(backupPath, fs)) {
    return { ok: false, backupPath, error: '备份不存在' };
  }
  try {
    copyFile(backupPath, filePath, fs);
    return { ok: true, backupPath, error: null };
  } catch (err) {
    return { ok: false, backupPath, error: err.message };
  }
}

/**
 * 一个目标涉及的全部备份/标记状态（只读，供 detect / verify 用）。
 * @param {string[]} files
 * @param {{ fs?: typeof fsDefault }} [deps]
 */
export function describeBackups(files, { fs = fsDefault } = {}) {
  return files.map((filePath) => ({
    path: filePath,
    exists: fileExists(filePath, fs),
    backupPath: backupPathFor(filePath),
    backupExists: fileExists(backupPathFor(filePath), fs),
    markerPath: createdMarkerPathFor(filePath),
    markerExists: fileExists(createdMarkerPathFor(filePath), fs),
  }));
}

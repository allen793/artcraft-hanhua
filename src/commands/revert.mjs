/**
 * `revert` 命令：一键回滚。
 *
 * 三种情况分开处理：
 * 1. 文件是**本工具创建**的（日志标了 created，或旁边有 marker）→ **删除**它，不留下空文件
 * 2. 文件是**被改写**的（旁边有 `.bak-before-hanhua`）→ 从备份还原，并按日志里的改前哈希校验
 * 3. 没有备份也没有 marker → 说明不是本工具改的，**什么都不做**（宁可少动，也不要误删用户数据）
 *
 * 备份文件在回滚后**保留**：下次 hanhua 会复用它作为「原始副本」，
 * 也因此 revert 之后再次 hanhua → revert 仍然能得到同一份原始内容。
 */

import { EXIT, TARGET_ALIASES, TARGET_KIND, TARGET_STATUS } from '../constants.mjs';
import { normalizeOnly } from '../args.mjs';
import { targetIds } from '../targets.mjs';
import { isConfigTarget } from '../config-edit.mjs';
import { backupPathFor, readCreatedMarker, removeCreatedMarker, restoreFromBackup } from '../backups.mjs';
import { fileExists, removeFileIfExists, sha256File } from '../fsutil.mjs';
import { getEntry, loadState, removeEntry, saveState } from '../state.mjs';
import { resolveAndInspect } from '../context.mjs';
import { summarize } from './hanhua.mjs';

/**
 * 回滚单个目标。
 */
function revertTarget(target, { fs, state, dryRun }) {
  const common = { id: target.id, name: target.name, kind: target.kind, files: [], notes: [] };

  if (target.kind === TARGET_KIND.BINARY_PATCH) {
    if (target.patchedPath && fileExists(target.patchedPath, fs)) {
      if (dryRun) {
        return {
          ...common,
          status: TARGET_STATUS.WOULD_CHANGE,
          message: `将删除补丁产物 ${target.patchedPath}（原始 exe 从未被改动）`,
          files: [{ path: target.patchedPath, action: 'delete' }],
        };
      }
      try {
        removeFileIfExists(target.patchedPath, fs);
        return {
          ...common,
          status: TARGET_STATUS.REVERTED,
          message: `已删除补丁产物 ${target.patchedPath}（原始 exe 从未被改动）`,
          files: [{ path: target.patchedPath, action: 'deleted' }],
        };
      } catch (err) {
        return {
          ...common,
          status: TARGET_STATUS.FAILED,
          message: `删除补丁产物失败：${err.message}`,
          files: [{ path: target.patchedPath, action: 'delete-failed' }],
        };
      }
    }
    return {
      ...common,
      status: TARGET_STATUS.SKIPPED,
      message: '没有发现补丁产物，主程序无需回滚',
    };
  }

  if (!isConfigTarget(target)) {
    return { ...common, status: TARGET_STATUS.SKIPPED, message: '本工具不会改动该程序，无需回滚' };
  }

  const filePath = target.configPath;
  const entry = getEntry(state, target.id, filePath);
  const marker = readCreatedMarker(filePath, { fs });
  const backupPath = backupPathFor(filePath);
  const backupExists = fileExists(backupPath, fs);
  const fileExistsNow = fileExists(filePath, fs);
  const createdByUs = entry?.action === 'created' || marker.exists;

  if (createdByUs) {
    if (!fileExistsNow) {
      // 文件已经没了，清掉残留 marker 与日志即可
      if (!dryRun) {
        removeCreatedMarker(filePath, { fs });
        removeEntry(state, target.id, filePath);
      }
      return {
        ...common,
        status: TARGET_STATUS.REVERTED_CREATED,
        message: '配置文件已不存在（清理了残留标记）',
        files: [{ path: filePath, action: 'already-absent' }],
      };
    }
    if (dryRun) {
      return {
        ...common,
        status: TARGET_STATUS.WOULD_CHANGE,
        message: '将删除本工具创建的配置文件（还原为「原本不存在」的状态）',
        files: [{ path: filePath, action: 'delete' }],
      };
    }
    try {
      removeFileIfExists(filePath, fs);
      removeCreatedMarker(filePath, { fs });
      removeEntry(state, target.id, filePath);
      return {
        ...common,
        status: TARGET_STATUS.REVERTED_CREATED,
        message: '该配置文件是本工具创建的，已删除（不留下空文件）',
        files: [{ path: filePath, action: 'deleted' }],
        notes: marker.exists ? ['同时删除了 .hanhua-created 标记'] : [],
      };
    } catch (err) {
      return {
        ...common,
        status: TARGET_STATUS.FAILED,
        message: `删除失败：${err.message}`,
        files: [{ path: filePath, action: 'delete-failed' }],
      };
    }
  }

  if (backupExists) {
    if (dryRun) {
      return {
        ...common,
        status: TARGET_STATUS.WOULD_CHANGE,
        message: `将从备份还原 ${filePath}`,
        files: [{ path: filePath, action: 'restore', backupPath }],
      };
    }
    const beforeSha256 = entry?.beforeSha256 ?? null;
    const restored = restoreFromBackup(filePath, { fs });
    if (!restored.ok) {
      return {
        ...common,
        status: TARGET_STATUS.FAILED,
        message: `从备份还原失败：${restored.error}`,
        files: [{ path: filePath, action: 'restore-failed', backupPath }],
      };
    }
    const nowSha256 = sha256File(filePath, fs);
    const verified = beforeSha256 ? nowSha256 === beforeSha256 : null;
    removeEntry(state, target.id, filePath);
    const notes = [`备份文件保留在 ${backupPath}（确认无需再回滚时可手动删除）`];
    if (verified === false) {
      notes.push(
        `哈希校验不一致：期望 ${beforeSha256}，实际 ${nowSha256}。` +
          '如果这不是本工具的改动，请手工确认文件内容',
      );
    }
    return {
      ...common,
      status: TARGET_STATUS.REVERTED,
      message: `已从备份还原${verified === true ? '（哈希校验通过）' : verified === false ? '（哈希校验不一致）' : ''}`,
      files: [
        {
          path: filePath,
          action: 'restored',
          backupPath,
          sha256: nowSha256,
          expectedSha256: beforeSha256,
          verified,
        },
      ],
      notes,
    };
  }

  if (!fileExistsNow) {
    return {
      ...common,
      status: TARGET_STATUS.SKIPPED,
      message: '配置文件不存在，无需回滚',
    };
  }

  return {
    ...common,
    status: TARGET_STATUS.SKIPPED,
    message: '没有找到备份，说明这个文件不是本工具改写的，未做任何改动',
    files: [{ path: filePath, action: 'none' }],
  };
}

/**
 * 执行 revert。
 * @param {object} ctx
 * @param {{ confirm?: ((targets: object[]) => Promise<boolean>)|null }} [deps]
 */
export async function runRevert(ctx, { confirm = null } = {}) {
  const { install, allTargets, targets } = resolveAndInspect(ctx);
  const dryRun = Boolean(ctx.options.dryRun);

  if (!install.ok) {
    return {
      ok: false,
      command: 'revert',
      dryRun,
      exitCode: EXIT.FAILURE,
      errors: [install.error],
      install,
      results: [],
      summary: null,
    };
  }

  const selection = normalizeOnly(ctx.options.only, targetIds(allTargets), TARGET_ALIASES);
  if (!selection.ok) {
    return {
      ok: false,
      command: 'revert',
      dryRun,
      exitCode: EXIT.USAGE,
      errors: [
        `--only 里出现了未知目标：${selection.unknown.join(', ')}`,
        `可用目标：${targetIds(allTargets).join(', ')}（别名：main / launcher）`,
      ],
      install,
      results: [],
      summary: null,
    };
  }

  const selected = selection.ids ? targets.filter((t) => selection.ids.includes(t.id)) : targets;

  if (!dryRun && typeof confirm === 'function') {
    const agreed = await confirm(selected);
    if (!agreed) {
      const results = selected.map((t) => ({
        id: t.id,
        name: t.name,
        kind: t.kind,
        status: TARGET_STATUS.CANCELLED,
        message: '用户取消，未做任何改动',
        files: [],
        notes: [],
      }));
      return {
        ok: false,
        command: 'revert',
        dryRun: false,
        exitCode: EXIT.FAILURE,
        install,
        results,
        summary: summarize(results),
        errors: ['已取消，未做任何改动'],
        cancelled: true,
      };
    }
  }

  const { state, damaged } = loadState(ctx.statePath, { fs: ctx.fs });
  const notes = [];
  if (damaged) notes.push(`变更日志不可用（${damaged}）；仍按备份文件与 marker 判断`);

  // 先记下日志快照，回滚后再比对：只有日志真的变了才写盘（什么都没回滚时不产生文件）
  const entriesBefore = JSON.stringify(state.entries);
  const results = selected.map((t) => revertTarget(t, { fs: ctx.fs, state, dryRun }));

  if (!dryRun && JSON.stringify(state.entries) !== entriesBefore) {
    const saved = saveState(ctx.statePath, state, { fs: ctx.fs });
    if (!saved.ok) notes.push(`变更日志写入失败：${saved.error}`);
  }

  const failed = results.filter((r) => r.status === TARGET_STATUS.FAILED);
  return {
    ok: failed.length === 0,
    command: 'revert',
    dryRun,
    exitCode: failed.length === 0 ? EXIT.OK : EXIT.FAILURE,
    install,
    results,
    summary: summarize(results),
    errors: failed.map((r) => `${r.name}：${r.message}`),
    notes: dryRun ? [...notes, 'dry-run：没有写入任何文件'] : notes,
    statePath: ctx.statePath,
  };
}

/**
 * `hanhua` 命令：一键汉化。
 *
 * 处置逻辑按目标类型分派：
 * - json-lang / ron-lang：写语言配置（先备份 → 最小改动写入 → 记日志）
 * - binary-patch（主程序）：调用 src/artcraft-patch.mjs；本轮它只会抛「未实现」，
 *   这里**优雅降级**：打印说明、把主程序标成 pending、其余项目照常处理、退出码仍为 0
 *   （除非用户加了 --require-main）
 * - unsupported：明确报「上游无中文」，不动文件
 * - system-locale：报「已随系统显示中文，无需改动」，不凭空创建配置文件
 *
 * `--dry-run` 走完全相同的判断，但**一个字节都不写**。
 */

import path from 'node:path';
import { EXIT, TARGET_KIND, TARGET_STATUS, TARGET_ALIASES } from '../constants.mjs';
import { normalizeOnly } from '../args.mjs';
import { targetIds } from '../targets.mjs';
import { createConfigEditor, isConfigTarget } from '../config-edit.mjs';
import { createBackupIfMissing, writeCreatedMarker } from '../backups.mjs';
import { dirExists, ensureDir, fileExists, readTextFile, sha256File, writeUtf8NoBom } from '../fsutil.mjs';
import { loadState, saveState, setEntry } from '../state.mjs';
import { isChineseLocale } from '../sysenv.mjs';
import { patchMainApp } from '../artcraft-patch.mjs';
import { resolveAndInspect } from '../context.mjs';

/**
 * 为一个目标算出「将要做什么」，不写盘。
 * @param {object} target 巡检后的目标
 * @param {{ env: object, fs: object, systemLocale?: string }} ctx
 * @returns {object}
 */
export function planTarget(target, { env, fs, systemLocale = null }) {
  const base = { id: target.id, name: target.name, kind: target.kind, target };

  if (isConfigTarget(target)) {
    const editor = createConfigEditor(target);
    const exists = fileExists(editor.filePath, fs);
    if (!exists) {
      if (editor.createIfMissing) {
        return {
          ...base,
          action: 'create',
          filePath: editor.filePath,
          from: null,
          to: editor.desiredValue,
          content: editor.minimalDocument(),
          editor,
        };
      }
      return {
        ...base,
        action: 'skip',
        filePath: editor.filePath,
        reason:
          `未找到配置文件 ${editor.filePath}。请先启动一次 ${target.name} 让它生成配置，` +
          '然后重新运行 hanhua（本工具不会凭空创建这个文件，以免被判为配置损坏）。',
        editor,
      };
    }
    const read = readTextFile(editor.filePath, fs);
    if (!read.ok) {
      return { ...base, action: 'error', filePath: editor.filePath, reason: `读取失败：${read.error}`, editor };
    }
    const current = editor.readValue(read.text);
    if (current.ok && current.found && current.value === editor.desiredValue) {
      return {
        ...base,
        action: 'unchanged',
        filePath: editor.filePath,
        from: current.value,
        to: editor.desiredValue,
        hadBom: read.hadBom,
        editor,
      };
    }
    const edited = editor.setValue(read.text, editor.desiredValue);
    if (!edited.ok) {
      return {
        ...base,
        action: 'error',
        filePath: editor.filePath,
        from: current.ok ? current.value : null,
        reason: `配置文件无法解析/改写：${edited.error}`,
        hadBom: read.hadBom,
        editor,
      };
    }
    return {
      ...base,
      action: 'change',
      filePath: editor.filePath,
      from: current.ok ? current.value : null,
      to: editor.desiredValue,
      hadBom: read.hadBom,
      insertMode: edited.mode === 'insert',
      editor,
    };
  }

  if (target.kind === TARGET_KIND.BINARY_PATCH) {
    return { ...base, action: 'patch-main', filePath: target.patchedPath, patch: target.patch };
  }

  if (target.kind === TARGET_KIND.UNSUPPORTED) {
    return { ...base, action: 'skip', reason: target.note, upstreamUnsupported: true };
  }

  // system-locale
  const locale = systemLocale ?? null;
  const zh = locale === null ? true : isChineseLocale(locale);
  void env;
  return {
    ...base,
    action: 'skip',
    reason: zh
      ? '已随系统显示中文，无需改动'
      : `当前系统区域为 ${locale}（非中文）：这些程序跟随系统语言显示，本工具不会改动其配置文件`,
    nativeChinese: zh,
  };
}

/** 把 plan 翻译成结果对象（dry-run 用） */
function planToDryRunResult(plan) {
  const statusByAction = {
    create: TARGET_STATUS.WOULD_CREATE,
    change: TARGET_STATUS.WOULD_CHANGE,
    unchanged: TARGET_STATUS.NOOP,
    skip: TARGET_STATUS.SKIPPED,
    error: TARGET_STATUS.FAILED,
    'patch-main': null,
  };
  if (plan.action === 'patch-main') {
    const supported = plan.patch?.supported === true;
    return {
      id: plan.id,
      name: plan.name,
      kind: plan.kind,
      status: supported ? TARGET_STATUS.PENDING : TARGET_STATUS.SKIPPED,
      message: supported
        ? `主程序需要二进制补丁（版本 ${plan.patch.version}）；补丁算法尚未接入，本次不处理`
        : `主程序暂不处理：${plan.patch?.reason ?? '原因未知'}`,
      files: [],
      notes: [],
    };
  }
  const status = statusByAction[plan.action] ?? TARGET_STATUS.SKIPPED;
  const messages = {
    create: `将创建 ${plan.filePath}，写入 language = ${plan.to}`,
    change: `将把 language 从 ${JSON.stringify(plan.from)} 改成 ${JSON.stringify(plan.to)}（${plan.filePath}）`,
    unchanged: `语言已是 ${plan.to}，无需改动`,
    skip: plan.reason,
    error: `无法处理：${plan.reason}`,
  };
  return {
    id: plan.id,
    name: plan.name,
    kind: plan.kind,
    status,
    message: messages[plan.action] ?? '',
    files: plan.filePath ? [{ path: plan.filePath, action: plan.action, from: plan.from, to: plan.to }] : [],
    notes: plan.hadBom ? ['原文件带 UTF-8 BOM（会让程序忽略语言设置），写入时会去掉 BOM'] : [],
  };
}

/** 真正落地一个目标 */
function applyPlan(plan, { fs, state, log }) {
  const editor = plan.editor;

  if (plan.action === 'skip' || plan.action === 'error') {
    return {
      id: plan.id,
      name: plan.name,
      kind: plan.kind,
      status: plan.action === 'error' ? TARGET_STATUS.FAILED : TARGET_STATUS.SKIPPED,
      message: plan.action === 'error' ? `无法处理：${plan.reason}` : plan.reason,
      files: plan.filePath ? [{ path: plan.filePath, action: 'none' }] : [],
      notes: [],
    };
  }

  if (plan.action === 'unchanged') {
    return {
      id: plan.id,
      name: plan.name,
      kind: plan.kind,
      status: TARGET_STATUS.NOOP,
      message: `语言已是 ${plan.to}，无需改动`,
      files: [{ path: plan.filePath, action: 'unchanged', from: plan.from, to: plan.to }],
      notes: plan.hadBom
        ? ['注意：原文件带 UTF-8 BOM，程序可能因此忽略语言设置；重新写入一次即可去掉 BOM（可先 revert 再 hanhua）']
        : [],
    };
  }

  if (plan.action === 'create') {
    try {
      // 目录可能还不存在（例如 LightCraft 从没启动过），先建出来再写文件
      const dir = path.dirname(editor.filePath);
      const dirCreated = !dirExists(dir, fs);
      if (dirCreated) ensureDir(dir, fs);
      writeUtf8NoBom(editor.filePath, plan.content, fs);
      const marker = writeCreatedMarker(editor.filePath, { targetId: plan.id, fs });
      const afterSha256 = sha256File(editor.filePath, fs);
      setEntry(state, {
        targetId: plan.id,
        path: editor.filePath,
        action: 'created',
        value: plan.to,
        afterSha256,
        markerPath: marker.markerPath,
      });
      return {
        id: plan.id,
        name: plan.name,
        kind: plan.kind,
        status: TARGET_STATUS.DONE,
        message: `配置文件原本不存在，已创建并写入 language = ${plan.to}`,
        files: [
          {
            path: editor.filePath,
            action: 'created',
            to: plan.to,
            afterSha256,
            markerPath: marker.markerPath,
          },
        ],
        notes: [
          ...(dirCreated ? [`目录原本不存在，已创建：${dir}`] : []),
          ...(marker.ok
            ? []
            : [`标记文件写入失败（${marker.error}），revert 时会退化为「找不到备份则不动」`]),
        ],
      };
    } catch (err) {
      return {
        id: plan.id,
        name: plan.name,
        kind: plan.kind,
        status: TARGET_STATUS.FAILED,
        message: `创建配置文件失败：${err.message}`,
        files: [{ path: editor.filePath, action: 'create-failed' }],
        notes: [],
      };
    }
  }

  // plan.action === 'change'
  const backup = createBackupIfMissing(editor.filePath, { fs });
  if (!backup.ok) {
    // 必须先备份再写：备份失败就不动文件
    return {
      id: plan.id,
      name: plan.name,
      kind: plan.kind,
      status: TARGET_STATUS.FAILED,
      message: `备份失败，已放弃写入以免无法回滚：${backup.error}`,
      files: [{ path: editor.filePath, action: 'backup-failed', backupPath: backup.backupPath }],
      notes: [],
    };
  }

  const read = readTextFile(editor.filePath, fs);
  if (!read.ok) {
    return {
      id: plan.id,
      name: plan.name,
      kind: plan.kind,
      status: TARGET_STATUS.FAILED,
      message: `读取失败：${read.error}`,
      files: [{ path: editor.filePath, action: 'read-failed' }],
      notes: [],
    };
  }
  const beforeSha256 = sha256File(editor.filePath, fs);
  const edited = editor.setValue(read.text, editor.desiredValue);
  if (!edited.ok) {
    return {
      id: plan.id,
      name: plan.name,
      kind: plan.kind,
      status: TARGET_STATUS.FAILED,
      message: `改写失败：${edited.error}`,
      files: [{ path: editor.filePath, action: 'edit-failed' }],
      notes: [],
    };
  }
  if (!edited.changed) {
    return {
      id: plan.id,
      name: plan.name,
      kind: plan.kind,
      status: TARGET_STATUS.NOOP,
      message: `语言已是 ${plan.to}，无需改动`,
      files: [{ path: editor.filePath, action: 'unchanged', from: plan.from, to: plan.to }],
      notes: [],
    };
  }

  try {
    writeUtf8NoBom(editor.filePath, edited.text, fs);
  } catch (err) {
    return {
      id: plan.id,
      name: plan.name,
      kind: plan.kind,
      status: TARGET_STATUS.FAILED,
      message: `写入失败：${err.message}（备份保留在 ${backup.backupPath}）`,
      files: [{ path: editor.filePath, action: 'write-failed', backupPath: backup.backupPath }],
      notes: [],
    };
  }

  const afterSha256 = sha256File(editor.filePath, fs);
  setEntry(state, {
    targetId: plan.id,
    path: editor.filePath,
    action: 'modified',
    field: editor.languagePath.join('.'),
    from: plan.from,
    value: plan.desiredValue,
    beforeSha256,
    afterSha256,
    beforeHadBom: read.hadBom,
    backupPath: backup.backupPath,
    backupCreated: backup.created,
  });

  const notes = [];
  if (read.hadBom) notes.push('原文件带 UTF-8 BOM（会让程序忽略语言设置），已按无 BOM 重写');
  if (backup.created) notes.push(`已备份原文件到 ${backup.backupPath}`);
  else notes.push(`复用已有备份 ${backup.backupPath}`);
  if (plan.insertMode) notes.push('原配置里没有 language 字段，已插入');
  if (plan.target?.defect) notes.push(`已知上游缺陷：${plan.target.defect}`);

  log(`已写入 ${editor.filePath}`);

  return {
    id: plan.id,
    name: plan.name,
    kind: plan.kind,
    status: TARGET_STATUS.DONE,
    message: `language: ${JSON.stringify(plan.from)} → ${JSON.stringify(plan.desiredValue)}`,
    files: [
      {
        path: editor.filePath,
        action: 'modified',
        from: plan.from,
        to: plan.desiredValue,
        backupPath: backup.backupPath,
        beforeSha256,
        afterSha256,
      },
    ],
    notes,
  };
}

/**
 * 主程序补丁（本轮未实现，优雅降级）。
 */
function applyMainPatch(target, { log }) {
  const patch = target.patch ?? { supported: false, version: null, reason: '未知原因' };
  if (!patch.supported) {
    return {
      id: target.id,
      name: target.name,
      kind: target.kind,
      status: TARGET_STATUS.SKIPPED,
      message: `主程序暂不处理：${patch.reason}`,
      files: [],
      notes: ['可先用 --root 指定安装目录，或等补丁算法接入后再试'],
    };
  }
  try {
    patchMainApp({
      exePath: target.exePath,
      outPath: target.patchedPath,
      translations: null,
      log,
    });
    return {
      id: target.id,
      name: target.name,
      kind: target.kind,
      status: TARGET_STATUS.DONE,
      message: '主程序补丁已应用',
      files: [{ path: target.patchedPath, action: 'created' }],
      notes: [],
    };
  } catch (err) {
    return {
      id: target.id,
      name: target.name,
      kind: target.kind,
      status: TARGET_STATUS.PENDING,
      message: err.message,
      files: [],
      notes: [
        '主程序汉化需要替换 exe 内嵌前端资源，补丁算法尚未接入，本轮不处理；其它项目已正常处理。',
        '退出码仍为 0；需要「主程序必须成功」时请加 --require-main。',
      ],
    };
  }
}

/**
 * 执行 hanhua。
 * @param {object} ctx 命令上下文
 * @param {{ confirm?: ((plan: object[]) => Promise<boolean>)|null, systemLocale?: string }} [deps]
 * @returns {Promise<object>}
 */
export async function runHanhua(ctx, { confirm = null, systemLocale = null } = {}) {
  const { install, allTargets, targets } = resolveAndInspect(ctx);
  const locale = systemLocale ?? null;

  if (!install.ok) {
    return {
      ok: false,
      command: 'hanhua',
      dryRun: ctx.options.dryRun,
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
      command: 'hanhua',
      dryRun: ctx.options.dryRun,
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
  const plans = selected.map((t) => planTarget(t, { env: ctx.env, fs: ctx.fs, systemLocale: locale }));

  if (ctx.options.dryRun) {
    const results = plans.map(planToDryRunResult);
    return {
      ok: true,
      command: 'hanhua',
      dryRun: true,
      exitCode: EXIT.OK,
      install,
      systemLocale: locale,
      results,
      summary: summarize(results),
      errors: [],
      notes: ['dry-run：没有写入任何文件'],
    };
  }

  if (typeof confirm === 'function') {
    const agreed = await confirm(plans);
    if (!agreed) {
      const results = plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        kind: plan.kind,
        status: TARGET_STATUS.CANCELLED,
        message: '用户取消，未做任何改动',
        files: [],
        notes: [],
      }));
      return {
        ok: false,
        command: 'hanhua',
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
  if (damaged) notes.push(`变更日志不可用（${damaged}），本次仍会正常备份与写入`);

  const results = [];
  for (const plan of plans) {
    if (plan.action === 'patch-main') {
      results.push(applyMainPatch(plan.target, { log: ctx.log }));
      continue;
    }
    const result = applyPlan(plan, { fs: ctx.fs, state, log: ctx.log });
    results.push(result);
  }

  // 只有真的动过文件才落日志：纯粹的「已经是中文」不写任何东西
  const changed = results.some((r) => r.status === TARGET_STATUS.DONE);
  if (changed) {
    const saved = saveState(ctx.statePath, state, { fs: ctx.fs });
    if (!saved.ok) {
      notes.push(
        `变更日志写入失败（${saved.error}）：文件已按备份正常处理，revert 仍可用备份还原；` +
          '但「本工具创建的文件」可能无法自动删除',
      );
    }
  }

  const pendingRequired = selected.some(
    (t) => t.kind === TARGET_KIND.BINARY_PATCH && results.some((r) => r.id === t.id && r.status === TARGET_STATUS.PENDING),
  );
  const failed = results.filter((r) => r.status === TARGET_STATUS.FAILED);
  const requireMain = Boolean(ctx.options.requireMain);

  let exitCode = EXIT.OK;
  if (failed.length > 0) exitCode = EXIT.FAILURE;
  if (requireMain && pendingRequired) exitCode = EXIT.FAILURE;

  if (requireMain && pendingRequired) {
    notes.push('--require-main 已指定，但主程序补丁尚未接入 → 退出码 1');
  }
  if (pendingRequired && !requireMain) {
    notes.push('主程序待接入，但其余项目已处理；按约定退出码仍为 0');
  }

  return {
    ok: exitCode === EXIT.OK,
    command: 'hanhua',
    dryRun: false,
    exitCode,
    install,
    results,
    summary: summarize(results),
    errors: failed.map((r) => `${r.name}：${r.message}`),
    notes,
    statePath: ctx.statePath,
  };
}

/**
 * 结果汇总。
 * @param {Array<object>} results
 */
export function summarize(results) {
  const count = (status) => results.filter((r) => r.status === status).length;
  return {
    total: results.length,
    done: count(TARGET_STATUS.DONE),
    noop: count(TARGET_STATUS.NOOP),
    skipped: count(TARGET_STATUS.SKIPPED),
    pending: count(TARGET_STATUS.PENDING),
    failed: count(TARGET_STATUS.FAILED),
    wouldChange: count(TARGET_STATUS.WOULD_CHANGE),
    wouldCreate: count(TARGET_STATUS.WOULD_CREATE),
    reverted: count(TARGET_STATUS.REVERTED) + count(TARGET_STATUS.REVERTED_CREATED),
    cancelled: count(TARGET_STATUS.CANCELLED),
  };
}

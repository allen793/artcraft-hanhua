/**
 * `verify` 命令：校验现状 —— 原件是否存在、备份是否存在、当前语言值、主程序 exe 的 SHA-256。
 *
 * 只读。退出码：
 * - 0：报告生成成功（**不代表**所有程序都已汉化，那要看 `verified` 字段）
 * - 1：有硬错误（找不到安装、配置文件读不出来、翻译数据缺失等）
 */

import { EXIT, LANGUAGE_STATE, TARGET_KIND } from '../constants.mjs';
import { resolveAndInspect } from '../context.mjs';
import { loadTranslations } from '../translations.mjs';
import { getSystemLocale } from '../sysenv.mjs';

/**
 * 单个目标的校验结论。
 * @param {object} target
 */
function verifyTarget(target) {
  const managed = target.kind === TARGET_KIND.JSON_LANG || target.kind === TARGET_KIND.RON_LANG;
  const files = target.files.map((f) => ({
    path: f.path,
    exists: f.exists,
    size: f.size,
    hadBom: f.hadBom,
    sha256: f.sha256,
    parseOk: f.parseOk,
    parseError: f.parseError,
    currentLanguage: f.currentLanguage,
    languageKeys: f.languageKeys,
    rawLanguageFields: f.rawLanguageFields ?? [],
    matchesDesired: f.exists && f.currentLanguage === target.desiredValue,
    desiredValue: target.desiredValue,
    backupPath: target.backups.find((b) => b.path === f.path)?.backupPath ?? null,
    backupExists: target.backups.find((b) => b.path === f.path)?.backupExists ?? false,
    markerExists: target.backups.find((b) => b.path === f.path)?.markerExists ?? false,
  }));

  let verified = null;
  let verdict = '不适用';
  if (managed) {
    const primary = files[0];
    if (!primary || !primary.exists) {
      verified = false;
      verdict = '配置文件不存在（尚未汉化，或程序还没生成配置）';
    } else if (primary.parseOk === false) {
      verified = false;
      verdict = `配置文件无法解析：${primary.parseError}`;
    } else if (primary.matchesDesired) {
      verified = true;
      verdict = `语言已是 ${target.desiredValue}`;
    } else {
      verified = false;
      verdict = `当前语言是 ${JSON.stringify(primary.currentLanguage)}，期望 ${target.desiredValue}`;
    }
  } else if (target.kind === TARGET_KIND.BINARY_PATCH) {
    verified = null;
    verdict = target.patchedExists
      ? '已存在补丁产物'
      : target.patch?.supported
        ? `主程序尚未打补丁（${target.patch.reason}）`
        : `主程序无法打补丁：${target.patch?.reason ?? '原因未知'}`;
  } else if (target.kind === TARGET_KIND.UNSUPPORTED) {
    const raw = files.flatMap((f) => f.rawLanguageFields);
    verdict =
      raw.length > 0
        ? `上游无中文（配置里的语言键是 ${raw.map((r) => `${r.key}=${r.value}`).join(', ')}），本工具不会改动`
        : '上游无中文，无需校验';
  } else {
    verdict = '跟随系统区域，无需校验';
  }

  return {
    id: target.id,
    name: target.name,
    kind: target.kind,
    managed,
    exePath: target.exePath,
    exeExists: target.exeExists,
    exeVersion: target.exeVersion,
    exeSha256: target.exeSha256,
    patchedPath: target.patchedPath ?? null,
    patchedExists: target.patchedExists ?? false,
    patchedSha256: target.patchedSha256 ?? null,
    patch: target.patch,
    files,
    verified,
    verdict,
    languageState: target.languageState,
    languageStateLabel: target.languageStateLabel,
  };
}

/**
 * 执行 verify。
 * @param {object} ctx
 * @param {{ systemLocale?: string, translationFile?: string }} [deps]
 */
export function runVerify(ctx, { systemLocale = getSystemLocale(), translationFile = undefined } = {}) {
  const { install, targets } = resolveAndInspect(ctx, { withHashes: true });

  if (!install.ok) {
    return {
      ok: false,
      command: 'verify',
      exitCode: EXIT.FAILURE,
      errors: [install.error],
      install,
      targets: [],
      summary: null,
      translations: null,
    };
  }

  const report = targets.map(verifyTarget);
  const translations = loadTranslations(
    translationFile ? { file: translationFile, fs: ctx.fs } : { fs: ctx.fs },
  );

  const hardErrors = [];
  for (const t of report) {
    // 只有本工具负责改写的目标，配置解析失败才算硬错误；
    // 上游不支持中文的程序（例如 CADCraft 的 RON map）格式本来就不在支持范围内。
    if (!t.managed) continue;
    for (const f of t.files) {
      if (f.exists && f.parseOk === false) hardErrors.push(`${t.name}：${f.path} 解析失败（${f.parseError}）`);
    }
  }
  if (!translations.ok) hardErrors.push(`翻译数据不可用：${translations.errors.join('；')}`);

  const configTargets = report.filter(
    (t) => t.kind === TARGET_KIND.JSON_LANG || t.kind === TARGET_KIND.RON_LANG,
  );

  const summary = {
    total: report.length,
    localized: configTargets.filter((t) => t.verified === true).length,
    notLocalized: configTargets.filter((t) => t.verified === false).length,
    backupsPresent: report.reduce((n, t) => n + t.files.filter((f) => f.backupExists).length, 0),
    markersPresent: report.reduce((n, t) => n + t.files.filter((f) => f.markerExists).length, 0),
    missingFiles: report.filter((t) =>
      t.files.some((f) => !f.exists && t.languageState === LANGUAGE_STATE.MISSING_FILE),
    ).length,
    mainExeSha256: report.find((t) => t.kind === TARGET_KIND.BINARY_PATCH)?.exeSha256 ?? null,
  };

  return {
    ok: hardErrors.length === 0,
    command: 'verify',
    exitCode: hardErrors.length === 0 ? EXIT.OK : EXIT.FAILURE,
    install: {
      root: install.root,
      source: install.source,
      sourceLabel: install.sourceLabel,
      version: install.version,
      registryKey: install.registryKey,
    },
    systemLocale,
    targets: report,
    translations: {
      file: translations.file,
      ok: translations.ok,
      count: translations.count,
      expectedCount: translations.expectedCount,
      sha256: translations.sha256,
      conflicts: translations.conflicts.length,
      errors: translations.errors,
      warnings: translations.warnings,
    },
    summary,
    errors: hardErrors,
  };
}

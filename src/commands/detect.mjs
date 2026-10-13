/**
 * `detect` 命令：列出找到的 ArtCraft 组件、路径、版本、能否汉化、当前语言状态。
 *
 * 只读：不写任何文件，也不会创建配置文件。
 */

import { EXIT, LANGUAGE_STATE, SUPPORT_LEVEL, TARGET_KIND } from '../constants.mjs';
import { resolveAndInspect } from '../context.mjs';
import { describeSupport } from '../inspect.mjs';
import { loadTranslations } from '../translations.mjs';
import { getSystemLocale } from '../sysenv.mjs';

/**
 * 把巡检结果整理成报告用的形状。
 * @param {object} target
 */
function toReportTarget(target) {
  return {
    id: target.id,
    name: target.name,
    nameZh: target.nameZh,
    group: target.group,
    kind: target.kind,
    supportLevel: target.supportLevel,
    supportText: describeSupport(target),
    hanhuaAble: Boolean(target.supported),
    installed: target.installed,
    exePath: target.exePath,
    exeExists: target.exeExists,
    exeVersion: target.exeVersion,
    patchedPath: target.patchedPath ?? null,
    patchedExists: target.patchedExists ?? false,
    configPath: target.configPath,
    configPaths: target.configPaths ?? [],
    files: target.files.map((f) => ({
      path: f.path,
      format: f.format,
      exists: f.exists,
      hadBom: f.hadBom,
      size: f.size,
      parseOk: f.parseOk,
      parseError: f.parseError,
      languageKeys: f.languageKeys,
      rawLanguageFields: f.rawLanguageFields ?? [],
      currentLanguage: f.currentLanguage,
    })),
    currentLanguage: target.currentLanguage,
    languageKeys: target.languageKeys,
    rawLanguageFields: target.files.flatMap((f) => f.rawLanguageFields ?? []),
    languageState: target.languageState,
    languageStateLabel: target.languageStateLabel,
    languageError: target.languageError,
    backups: target.backups,
    patch: target.patch,
    note: target.note,
    defect: target.defect,
  };
}

/**
 * 执行 detect。
 * @param {object} ctx
 * @param {{ systemLocale?: string, translationFile?: string }} [deps]
 */
export function runDetect(ctx, { systemLocale = getSystemLocale(), translationFile = undefined } = {}) {
  const { install, targets } = resolveAndInspect(ctx);

  if (!install.ok) {
    return {
      ok: false,
      command: 'detect',
      exitCode: EXIT.FAILURE,
      errors: [install.error],
      install,
      systemLocale,
      targets: [],
      summary: null,
      translations: null,
    };
  }

  const report = targets.map(toReportTarget);
  const translations = loadTranslations(
    translationFile ? { file: translationFile, fs: ctx.fs } : { fs: ctx.fs },
  );

  const countKind = (kind) => report.filter((t) => t.kind === kind).length;
  const summary = {
    total: report.length,
    installed: report.filter((t) => t.installed).length,
    appExesFound: report.filter((t) => t.group === 'app' && t.exeExists).length,
    configTargets: countKind(TARGET_KIND.JSON_LANG) + countKind(TARGET_KIND.RON_LANG),
    alreadyZh: report.filter((t) => t.languageState === LANGUAGE_STATE.ZH).length,
    needChange: report.filter(
      (t) =>
        (t.kind === TARGET_KIND.JSON_LANG || t.kind === TARGET_KIND.RON_LANG) &&
        (t.languageState === LANGUAGE_STATE.OTHER ||
          t.languageState === LANGUAGE_STATE.ABSENT ||
          t.languageState === LANGUAGE_STATE.MISSING_FILE),
    ).length,
    unsupported: countKind(TARGET_KIND.UNSUPPORTED),
    systemLocale: countKind(TARGET_KIND.SYSTEM_LOCALE),
    pendingPatch: report.filter((t) => t.kind === TARGET_KIND.BINARY_PATCH).length,
    defects: report.filter((t) => t.supportLevel === SUPPORT_LEVEL.DEFECT || t.defect).length,
  };

  return {
    ok: true,
    command: 'detect',
    exitCode: EXIT.OK,
    install: {
      root: install.root,
      source: install.source,
      sourceLabel: install.sourceLabel,
      version: install.version,
      registryKey: install.registryKey,
      registryEntries: install.registryEntries.map((e) => ({
        keyPath: e.keyPath,
        version: e.version,
        installLocationRaw: e.installLocationRaw,
        installLocation: e.installLocation,
      })),
      candidates: install.candidates,
      warnings: install.warnings,
    },
    systemLocale,
    targets: report,
    summary,
    translations: {
      file: translations.file,
      ok: translations.ok,
      count: translations.count,
      expectedCount: translations.expectedCount,
      distinctEnglish: translations.distinctEnglish,
      conflicts: translations.conflicts.length,
      caseInsensitiveCollisions: translations.caseInsensitiveCollisions?.length ?? 0,
      paddedEnglish: translations.paddedEnglish ?? 0,
      duplicateIds: translations.duplicateIds,
      errors: translations.errors,
      warnings: translations.warnings,
    },
    warnings: install.warnings,
    errors: [],
  };
}

/**
 * 只读巡检：把一个目标对应的「文件是否存在 / 当前语言值 / 备份状态 / 补丁支持情况」查清楚。
 *
 * detect / hanhua / revert / verify 全都建立在这个模块之上，
 * 它**只读**，不写任何文件（dry-run 的安全性由此保证）。
 */

import fsDefault from 'node:fs';
import { LANGUAGE_STATE, LANGUAGE_STATE_LABEL, SUPPORT_LEVEL, TARGET_KIND } from './constants.mjs';
import { fileExists, readTextFile, sha256File } from './fsutil.mjs';
import { findLanguageKeyPaths, readJsonStringValue } from './json-text.mjs';
import { parseRonTopLevel, readRonStringField } from './ron-text.mjs';
import { findRawLanguageFields } from './lang-probe.mjs';
import { describeBackups } from './backups.mjs';
import { isPatchSupported, readExeVersions } from './artcraft-patch.mjs';

/**
 * 巡检单个配置文件。
 * @param {string} filePath
 * @param {{ fs?: typeof fsDefault, withHashes?: boolean, languagePath?: string[] }} [deps]
 * @returns {object}
 */
export function inspectConfigFile(filePath, { fs = fsDefault, withHashes = false, languagePath = ['language'] } = {}) {
  const isRon = filePath.toLowerCase().endsWith('.ron');
  const base = {
    path: filePath,
    format: isRon ? 'ron' : 'json',
    exists: false,
    size: null,
    hadBom: false,
    sha256: null,
    parseOk: null,
    parseError: null,
    languageKeys: [],
    rawLanguageFields: [],
    currentLanguage: null,
  };

  if (!fileExists(filePath, fs)) return base;

  const read = readTextFile(filePath, fs);
  if (!read.ok) {
    return { ...base, exists: true, parseOk: false, parseError: read.error };
  }

  const out = {
    ...base,
    exists: true,
    size: read.bytes,
    hadBom: read.hadBom,
    sha256: withHashes ? sha256File(filePath, fs) : null,
    rawLanguageFields: findRawLanguageFields(read.text),
  };

  if (isRon) {
    const parsed = parseRonTopLevel(read.text);
    const field = readRonStringField(read.text, languagePath[0] ?? 'language');
    out.parseOk = field.ok;
    out.parseError = field.error ?? (parsed.ok ? null : parsed.error);
    out.languageKeys = field.ok && field.found ? [languagePath[0] ?? 'language'] : [];
    out.currentLanguage = field.ok && field.found ? field.value : null;
    return out;
  }

  const value = readJsonStringValue(read.text, languagePath);
  const keys = findLanguageKeyPaths(read.text);
  out.languageKeys = keys;
  if (!value.ok) {
    out.parseOk = false;
    out.parseError = value.error;
    return out;
  }
  out.parseOk = true;
  out.currentLanguage = value.found ? value.value : null;
  return out;
}

/**
 * 巡检单个目标。
 * @param {object} target
 * @param {{ fs?: typeof fsDefault, withHashes?: boolean, exeVersion?: string|null, patch?: object|null }} [deps]
 */
export function inspectTarget(target, { fs = fsDefault, withHashes = false, exeVersion = null, patch = null } = {}) {
  const languagePath = target.languagePath ?? ['language'];
  const files = (target.configPaths ?? []).map((p) => inspectConfigFile(p, { fs, withHashes, languagePath }));
  const primaryPath = target.configPath ?? (target.configPaths ?? [])[0] ?? null;
  const primary = files.find((f) => f.path === primaryPath) ?? null;

  const exeExists = target.exePath ? fileExists(target.exePath, fs) : false;
  const patchedExists = target.patchedPath ? fileExists(target.patchedPath, fs) : false;
  const exeSha256 = withHashes && target.exePath && exeExists ? sha256File(target.exePath, fs) : null;

  const currentLanguage = primary ? primary.currentLanguage : null;
  let languageState = null;
  let languageError = null;

  switch (target.kind) {
    case TARGET_KIND.BINARY_PATCH:
      languageState = patchedExists ? LANGUAGE_STATE.PATCHED : LANGUAGE_STATE.PENDING;
      break;
    case TARGET_KIND.SYSTEM_LOCALE:
      languageState = LANGUAGE_STATE.SYSTEM_LOCALE;
      break;
    case TARGET_KIND.UNSUPPORTED:
      languageState = LANGUAGE_STATE.UNSUPPORTED;
      break;
    default: {
      if (!primary || !primary.exists) {
        languageState = LANGUAGE_STATE.MISSING_FILE;
      } else if (primary.parseOk === false) {
        languageState = LANGUAGE_STATE.ERROR;
        languageError = primary.parseError;
      } else if (currentLanguage === null) {
        languageState = LANGUAGE_STATE.ABSENT;
      } else if (currentLanguage === target.desiredValue) {
        languageState = LANGUAGE_STATE.ZH;
      } else {
        languageState = LANGUAGE_STATE.OTHER;
      }
      break;
    }
  }

  return {
    ...target,
    installed: exeExists || files.some((f) => f.exists),
    exeExists,
    exeVersion,
    exeSha256,
    patchedExists,
    patchedSha256: withHashes && patchedExists ? sha256File(target.patchedPath, fs) : null,
    patch,
    files,
    primaryFile: primary,
    currentLanguage,
    languageKeys: primary ? primary.languageKeys : files.flatMap((f) => f.languageKeys),
    languageState,
    languageStateLabel: LANGUAGE_STATE_LABEL[languageState] ?? languageState,
    languageError,
    backups: describeBackups((target.configPaths ?? []).filter(Boolean), { fs }),
  };
}

/**
 * 巡检整个安装。
 * @param {{
 *   install: object, targets: Array<object>, env?: object,
 *   fs?: typeof fsDefault, withHashes?: boolean, exeVersionExec?: Function,
 * }} params
 * @returns {{ targets: Array<object>, exeVersions: Record<string,string|null>, versionReadError: string|null }}
 */
export function inspectAll({
  install,
  targets,
  fs = fsDefault,
  withHashes = false,
  exeVersionExec = undefined,
}) {
  const paths = [...new Set(targets.map((t) => t.exePath).filter(Boolean))];
  let byPath = {};
  let versionReadError = null;
  if (paths.length > 0) {
    const res = readExeVersions({ paths, exec: exeVersionExec });
    byPath = res.byPath ?? {};
    versionReadError = res.error ?? null;
  }

  const inspected = targets.map((target) => {
    const exeVersion = target.exePath ? byPath[String(target.exePath).toLowerCase()] ?? null : null;
    let patch = null;
    if (target.kind === TARGET_KIND.BINARY_PATCH) {
      patch = isPatchSupported({
        exePath: target.exePath,
        version: exeVersion ?? install?.version ?? null,
        exec: exeVersionExec,
      });
    }
    return inspectTarget(target, { fs, withHashes, exeVersion, patch });
  });

  return { targets: inspected, exeVersions: byPath, versionReadError };
}

/**
 * 汇总一个目标「可以怎么汉化」的人类可读说明。
 * @param {object} target
 * @returns {string}
 */
export function describeSupport(target) {
  switch (target.supportLevel) {
    case SUPPORT_LEVEL.OK:
      return '可汉化';
    case SUPPORT_LEVEL.DEFECT:
      return '可汉化（上游有显示缺陷）';
    case SUPPORT_LEVEL.EXPERIMENTAL:
      return '可汉化（实验性：二进制补丁）';
    case SUPPORT_LEVEL.NATIVE:
      return '原生跟随系统中文，无需改动';
    case SUPPORT_LEVEL.NONE:
      return '上游无中文，无法汉化';
    default:
      return target.supported ? '可汉化' : '不可汉化';
  }
}

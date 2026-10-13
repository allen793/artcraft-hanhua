/**
 * 把「哪个文件、哪个字段、写什么值」的知识收在一处，供 hanhua / revert / verify 共用。
 *
 * 目标类型分两类：JSON（DesignCraft / LightCraft / EffectCraft）与 RON（Launcher）。
 * 这里只做文本层面的读改写，不碰文件系统。
 */

import { TARGET_KIND } from './constants.mjs';
import { minimalJsonDocument, readJsonStringValue, setJsonStringValue } from './json-text.mjs';
import { minimalRonDocument, readRonStringField, setRonStringField } from './ron-text.mjs';

/** RON 语言字段名（实测就是 language） */
export const RON_LANGUAGE_FIELD = 'language';

/**
 * @param {object} target
 * @returns {{
 *   format: 'json'|'ron', filePath: string,
 *   languagePath: string[]|null, desiredValue: string, createIfMissing: boolean,
 *   minimalDocument: () => string,
 *   readValue: (text: string) => {ok: boolean, found: boolean, value: string|null, error: string|null},
 *   setValue: (text: string, value: string) => {ok: boolean, text: string, changed: boolean, mode: string, error: string|null},
 * }}
 */
export function createConfigEditor(target) {
  const isRon = target.kind === TARGET_KIND.RON_LANG;
  const desiredValue = target.desiredValue ?? '';

  return {
    format: isRon ? 'ron' : 'json',
    filePath: target.configPath,
    languagePath: isRon ? [RON_LANGUAGE_FIELD] : (target.languagePath ?? ['language']),
    desiredValue,
    createIfMissing: Boolean(target.createIfMissing),
    minimalDocument: () =>
      isRon
        ? minimalRonDocument(RON_LANGUAGE_FIELD, desiredValue)
        : minimalJsonDocument(target.languagePath ?? ['language'], desiredValue),
    readValue: (text) =>
      isRon ? readRonStringField(text, RON_LANGUAGE_FIELD) : readJsonStringValue(text, target.languagePath ?? ['language']),
    setValue: (text, value) =>
      isRon
        ? setRonStringField(text, RON_LANGUAGE_FIELD, value)
        : setJsonStringValue(text, target.languagePath ?? ['language'], value),
  };
}

/**
 * 这个目标是否要改配置文件（而不是别的处置方式）。
 * @param {object} target
 */
export function isConfigTarget(target) {
  return target.kind === TARGET_KIND.JSON_LANG || target.kind === TARGET_KIND.RON_LANG;
}

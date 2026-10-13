/**
 * 翻译数据加载：`data/translations.tsv`
 *
 * 实测格式（见 docs/DEVELOPMENT.md）：
 * - 第一行是表头：`id\tenglish\tchinese`
 * - 之后 2803 行数据，**每行恰好 3 列（制表符分隔）**
 * - 无 BOM、LF 换行、没有引号包裹、字段里没有制表符
 * - 有 173 行的 english 带前导/尾随空格（例如 `2293\t layers. ...`），
 *   这些空格是**内容的一部分**，不能 trim，否则匹配不上 exe 里的原始字符串
 *
 * 校验策略：字段缺一不可、id 必须是 4 位数字、条数必须等于实测值 —— 不满足就报错而不是静默放过。
 */

import { fileURLToPath } from 'node:url';
import fsDefault from 'node:fs';
import { EXPECTED_TRANSLATION_COUNT, TRANSLATIONS_RELATIVE_PATH } from './constants.mjs';
import { fileExists, readTextFile, sha256Text } from './fsutil.mjs';

/** 期望的列名 */
export const TRANSLATION_COLUMNS = ['id', 'english', 'chinese'];

/**
 * 翻译数据的默认路径（仓库内 `data/translations.tsv`）。
 * @returns {string}
 */
export function defaultTranslationsPath() {
  return fileURLToPath(new URL(`../${TRANSLATIONS_RELATIVE_PATH}`, import.meta.url));
}

/**
 * 切行：同时兼容 LF / CRLF / CR，并丢掉结尾空行。
 * @param {string} text
 * @returns {string[]}
 */
export function splitLines(text) {
  const lines = String(text ?? '').split(/\r\n|\n|\r/);
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * 解析翻译数据。
 * @param {string} text
 * @param {{ expectedCount?: number|null, minCount?: number, allowCountMismatch?: boolean }} [options]
 * @returns {{
 *   ok: boolean, entries: Array<{id: string, english: string, chinese: string, line: number}>,
 *   columns: string[], count: number, distinctEnglish: number, expectedCount: number|null,
 *   conflicts: Array<{english: string, variants: Array<{id: string, chinese: string}>}>,
 *   caseInsensitiveCollisions: Array<object>, paddedEnglish: number,
 *   duplicateIds: string[], errors: string[], warnings: string[], sha256: string,
 * }}
 */
export function parseTranslations(text, options = {}) {
  const {
    expectedCount = EXPECTED_TRANSLATION_COUNT,
    minCount = 1,
    allowCountMismatch = false,
  } = options;

  const errors = [];
  const warnings = [];
  const entries = [];
  const lines = splitLines(text);
  let columns = [...TRANSLATION_COLUMNS];
  let dataLines = lines;

  if (lines.length === 0) {
    return {
      ok: false,
      entries,
      columns,
      count: 0,
      distinctEnglish: 0,
      expectedCount,
      conflicts: [],
      caseInsensitiveCollisions: [],
      paddedEnglish: 0,
      duplicateIds: [],
      errors: ['翻译数据是空的'],
      warnings,
      sha256: sha256Text(String(text ?? '')),
    };
  }

  // 表头识别：不区分大小写与顺序；识别不到就按 id/english/chinese 的位置约定解析
  const first = lines[0].split('\t').map((s) => s.trim().toLowerCase());
  const looksLikeHeader =
    first.length === TRANSLATION_COLUMNS.length && TRANSLATION_COLUMNS.every((c) => first.includes(c));
  if (looksLikeHeader) {
    columns = first;
    dataLines = lines.slice(1);
  } else {
    warnings.push('未识别到表头（期望 id/english/chinese），已按该列顺序解析第一行起的数据');
  }

  const byEnglish = new Map();
  const byEnglishLower = new Map();
  const seenIds = new Set();
  const duplicateIds = [];

  dataLines.forEach((line, idx) => {
    const lineNo = idx + (looksLikeHeader ? 2 : 1);
    if (line === '') return;
    const fields = line.split('\t');
    if (fields.length !== columns.length) {
      errors.push(
        `第 ${lineNo} 行列数不对：期望 ${columns.length} 列，实际 ${fields.length} 列（${JSON.stringify(
          line.slice(0, 60),
        )}）`,
      );
      return;
    }
    const record = { line: lineNo };
    columns.forEach((col, i) => {
      record[col] = fields[i];
    });

    for (const col of TRANSLATION_COLUMNS) {
      if (!(col in record)) {
        errors.push(`第 ${lineNo} 行缺少列 ${col}`);
        return;
      }
      if (record[col] === '') {
        errors.push(`第 ${lineNo} 行的 ${col} 字段是空的`);
        return;
      }
    }
    if (!/^\d{4}$/.test(record.id)) {
      errors.push(`第 ${lineNo} 行的 id 不是 4 位数字：${JSON.stringify(record.id)}`);
      return;
    }

    const entry = { id: record.id, english: record.english, chinese: record.chinese, line: lineNo };
    if (seenIds.has(entry.id)) duplicateIds.push(entry.id);
    else seenIds.add(entry.id);

    if (byEnglish.has(entry.english)) byEnglish.get(entry.english).push(entry);
    else byEnglish.set(entry.english, [entry]);

    const lower = entry.english.toLowerCase();
    if (byEnglishLower.has(lower)) byEnglishLower.get(lower).push(entry);
    else byEnglishLower.set(lower, [entry]);

    entries.push(entry);
  });

  const conflicts = [];
  for (const [english, group] of byEnglish) {
    if (group.length < 2) continue;
    const variants = [...new Set(group.map((e) => e.chinese))];
    if (variants.length > 1) {
      conflicts.push({ english, variants: group.map((e) => ({ id: e.id, chinese: e.chinese })) });
    }
  }

  // 忽略大小写后重名的英文（例如 `3D model` 与 `3D Model`）。
  // 精确匹配不受影响，但**大小写不敏感的匹配器**会在这些键上产生歧义，所以单独报出来。
  const caseInsensitiveCollisions = [];
  for (const [, group] of byEnglishLower) {
    if (group.length < 2) continue;
    caseInsensitiveCollisions.push({
      key: group[0].english.toLowerCase(),
      variants: group.map((e) => ({ id: e.id, english: e.english, chinese: e.chinese })),
    });
  }

  const paddedEnglish = entries.filter((e) => e.english !== e.english.trim()).length;

  if (duplicateIds.length > 0) {
    warnings.push(`存在重复 id：${duplicateIds.join(', ')}`);
  }
  if (conflicts.length > 0) {
    warnings.push(`存在 ${conflicts.length} 条「同一英文、不同中文」的冲突译文（按首次出现为准）`);
  }
  if (caseInsensitiveCollisions.length > 0) {
    warnings.push(
      `存在 ${caseInsensitiveCollisions.length} 组「忽略大小写后相同」的英文（例如 3D model / 3D Model）：` +
        '精确匹配不受影响，但不要用大小写不敏感的匹配器',
    );
  }
  if (paddedEnglish > 0) {
    warnings.push(`有 ${paddedEnglish} 条英文文案首尾带空格，匹配时必须原样比较（不能 trim）`);
  }
  if (entries.length < minCount) {
    errors.push(`有效条目只有 ${entries.length} 条，少于要求的 ${minCount} 条`);
  }
  if (
    !allowCountMismatch &&
    expectedCount !== null &&
    entries.length !== expectedCount
  ) {
    errors.push(
      `翻译条数不符：期望 ${expectedCount} 条，实际 ${entries.length} 条。` +
        '（如果数据文件确实更新了，请同步修改 src/constants.mjs 的 EXPECTED_TRANSLATION_COUNT，' +
        '或调用 parseTranslations 时传 { allowCountMismatch: true }）',
    );
  }

  return {
    ok: errors.length === 0,
    entries,
    columns,
    count: entries.length,
    distinctEnglish: byEnglish.size,
    expectedCount,
    conflicts,
    caseInsensitiveCollisions,
    paddedEnglish,
    duplicateIds,
    errors,
    warnings,
    sha256: sha256Text(String(text ?? '')),
  };
}

/**
 * 从文件加载并解析翻译数据。
 * @param {{ file?: string, fs?: typeof fsDefault }} [deps]
 */
export function loadTranslations({ file = defaultTranslationsPath(), fs = fsDefault } = {}) {
  if (!fileExists(file, fs)) {
    return {
      ok: false,
      file,
      entries: [],
      columns: [...TRANSLATION_COLUMNS],
      count: 0,
      distinctEnglish: 0,
      expectedCount: EXPECTED_TRANSLATION_COUNT,
      conflicts: [],
      caseInsensitiveCollisions: [],
      paddedEnglish: 0,
      duplicateIds: [],
      errors: [`翻译数据文件不存在：${file}`],
      warnings: [],
      sha256: null,
    };
  }
  const read = readTextFile(file, fs);
  if (!read.ok) {
    return {
      ok: false,
      file,
      entries: [],
      columns: [...TRANSLATION_COLUMNS],
      count: 0,
      distinctEnglish: 0,
      expectedCount: EXPECTED_TRANSLATION_COUNT,
      conflicts: [],
      caseInsensitiveCollisions: [],
      paddedEnglish: 0,
      duplicateIds: [],
      errors: [`翻译数据读取失败：${read.error}`],
      warnings: [],
      sha256: null,
    };
  }
  const parsed = parseTranslations(read.text);
  return { ...parsed, file, hadBom: read.hadBom };
}

/**
 * 英文 → 中文 索引（同一英文出现多次时以**首次出现**为准）。
 * @param {ReturnType<typeof parseTranslations>} parsed
 * @returns {{ map: Record<string, string>, conflicts: Array<object> }}
 */
export function toTranslationMap(parsed) {
  const map = {};
  for (const entry of parsed.entries ?? []) {
    if (!Object.prototype.hasOwnProperty.call(map, entry.english)) {
      map[entry.english] = entry.chinese;
    }
  }
  return { map, conflicts: parsed.conflicts ?? [] };
}

/**
 * 供 patchMainApp 使用的译文数组（保留 id，便于对回 hitmap）。
 * @param {ReturnType<typeof parseTranslations>} parsed
 */
export function toTranslationList(parsed) {
  return (parsed.entries ?? []).map((e) => ({ id: e.id, en: e.english, zh: e.chinese }));
}

/**
 * RON 文本的最小改动编辑（只处理顶层结构体的字符串字段）。
 *
 * 目标文件：`<安装目录>\launcher\ArtCraftLauncherData\app.ron`
 * 期望内容：`(language: "zh-CN")`（字段名就是 `language`，RON 格式）
 *
 * 和 json-text.mjs 同样的思路：不整体重建文档，只替换那一个字符串字面量。
 */

/**
 * 读取位置 i 处的 RON/JSON 风格字符串字面量。
 * @param {string} text
 * @param {number} start
 * @returns {{ ok: boolean, end: number, value: string, error: string|null }}
 */
function readStringAt(text, start) {
  let i = start + 1;
  while (i < text.length) {
    const c = text[i];
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === '"') {
      const raw = text.slice(start, i + 1);
      try {
        return { ok: true, end: i + 1, value: JSON.parse(raw), error: null };
      } catch {
        return { ok: false, end: i + 1, value: '', error: '字符串转义无法解析' };
      }
    }
    i += 1;
  }
  return { ok: false, end: text.length, value: '', error: '字符串没有闭合的引号' };
}

function parseLiteral(raw) {
  const t = raw.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'None' || t === 'null') return null;
  const n = Number(t);
  return Number.isNaN(n) ? t : n;
}

/**
 * 跳过文件开头的 RON 属性（`#![enable(implicit_some)]` 之类）。
 * @param {string} text
 * @returns {number} 主体开始的下标
 */
function skipAttributes(text) {
  let i = 0;
  for (;;) {
    const before = i;
    while (i < text.length && /\s/.test(text[i])) i += 1;
    if (text[i] === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (text[i] === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (text[i] === '#' && text[i + 1] === '!') {
      let depth = 0;
      let j = i + 2;
      for (; j < text.length; j += 1) {
        if (text[j] === '[' || text[j] === '(') depth += 1;
        else if (text[j] === ']' || text[j] === ')') {
          depth -= 1;
          if (depth === 0) {
            j += 1;
            break;
          }
        }
      }
      i = j;
      continue;
    }
    if (i === before) return i;
  }
}

/**
 * 解析顶层结构体的字段。
 * @param {string} text
 * @returns {{ ok: boolean, fields: Map<string, object>, bodyStart: number, bodyEnd: number, error: string|null }}
 */
/**
 * 统一 parseRonTopLevel 的返回形状。
 * rootOpen = '(' 的下标；rootCloseRaw = ')' 之后的下标；error 为 null 表示成功。
 */
function close(fields, bodyStart, rootOpen, rootCloseRaw, error, ok) {
  return {
    ok,
    fields,
    bodyStart,
    rootOpen: rootOpen ?? -1,
    rootClose: rootCloseRaw === -1 || rootCloseRaw === undefined ? -1 : rootCloseRaw - 1,
    bodyEnd: rootCloseRaw === -1 || rootCloseRaw === undefined ? -1 : rootCloseRaw,
    error,
  };
}

export function parseRonTopLevel(text) {
  const src = String(text ?? '');
  const fields = new Map();
  const bodyStart = skipAttributes(src);

  let i = bodyStart;
  let depth = 0;
  let rootOpen = -1;
  let rootClose = -1;

  try {
    while (i < src.length) {
      const c = src[i];

      // 行注释
      if (c === '/' && src[i + 1] === '/') {
        while (i < src.length && src[i] !== '\n') i += 1;
        continue;
      }
      // 块注释
      if (c === '/' && src[i + 1] === '*') {
        i += 2;
        while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
        i += 2;
        continue;
      }
      if (c === '"') {
        const s = readStringAt(src, i);
        if (!s.ok) return close(fields, bodyStart, rootOpen, rootClose, s.error, false);
        i = s.end;
        continue;
      }
      if (c === '(' || c === '[' || c === '{') {
        if (c === '(' && depth === 0) rootOpen = i;
        depth += 1;
        i += 1;
        continue;
      }
      if (c === ')' || c === ']' || c === '}') {
        depth -= 1;
        if (c === ')' && depth === 0) rootClose = i + 1;
        i += 1;
        continue;
      }

      // 顶层 `字段: 值`
      if (depth === 1) {
        const prev = i > 0 ? src[i - 1] : '(';
        if (/[\s,(]/.test(prev)) {
          const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(src.slice(i));
          if (m) {
            const name = m[1];
            let v = i + m[0].length;
            while (v < src.length && /\s/.test(src[v])) v += 1;
            if (src[v] === '"') {
              const s = readStringAt(src, v);
              if (!s.ok) return close(fields, bodyStart, rootOpen, rootClose, s.error, false);
              fields.set(name, {
                name,
                kind: 'string',
                start: v,
                end: s.end,
                raw: src.slice(v, s.end),
                value: s.value,
              });
              i = s.end;
              continue;
            }
            // 其他字面量 / 嵌套值：跳到同一层的下一个 ',' 或 ')'
            let d = 0;
            let j = v;
            for (; j < src.length; j += 1) {
              const ch = src[j];
              if (ch === '"') {
                const s = readStringAt(src, j);
                if (!s.ok) break;
                j = s.end - 1;
                continue;
              }
              if (ch === '(' || ch === '[' || ch === '{') d += 1;
              else if (ch === ')' || ch === ']' || ch === '}') {
                if (d === 0) break;
                d -= 1;
              } else if (ch === ',' && d === 0) break;
            }
            const raw = src.slice(v, j).trim();
            fields.set(name, { name, kind: 'literal', start: v, end: j, raw, value: parseLiteral(raw) });
            i = j;
            continue;
          }
        }
      }
      i += 1;
    }
  } catch (err) {
    return close(fields, bodyStart, rootOpen, rootClose, err.message, false);
  }

  if (rootOpen === -1 || rootClose === -1) {
    return close(fields, bodyStart, rootOpen, -1, '没有找到顶层结构体 `( ... )`', false);
  }
  return close(fields, bodyStart, rootOpen, rootClose, null, true);
}

/**
 * 读取顶层字符串字段。
 * @param {string} text
 * @param {string} field
 * @returns {{ ok: boolean, found: boolean, value: string|null, error: string|null }}
 */
export function readRonStringField(text, field) {
  const parsed = parseRonTopLevel(text);
  if (!parsed.ok) return { ok: false, found: false, value: null, error: parsed.error };
  const node = parsed.fields.get(field);
  if (!node) return { ok: true, found: false, value: null, error: null };
  return {
    ok: true,
    found: true,
    value: node.kind === 'string' ? node.value : String(node.raw),
    error: null,
  };
}

/**
 * 生成最小 RON 文档。
 * @param {string} field
 * @param {string} value
 * @returns {string}
 */
export function minimalRonDocument(field, value) {
  return `(${field}: ${JSON.stringify(value)})\n`;
}

/**
 * 设置顶层字符串字段（只替换该字面量，其余字节保留）。
 * @param {string} text
 * @param {string} field
 * @param {string} value
 * @returns {{ ok: boolean, text: string, changed: boolean, mode: 'unchanged'|'replace'|'insert'|'create', error: string|null }}
 */
export function setRonStringField(text, field, value) {
  const src = String(text ?? '');
  const parsed = parseRonTopLevel(src);

  if (!parsed.ok) {
    // 空文件 / 只有注释：直接生成最小文档
    if (/^[\s]*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*[\s]*$/.test(src) || parsed.error === '没有找到顶层结构体 `( ... )`') {
      const body = skipAttributes(src);
      if (src.slice(body).trim() === '') {
        return { ok: true, text: minimalRonDocument(field, value), changed: true, mode: 'create', error: null };
      }
    }
    return { ok: false, text: src, changed: false, mode: 'unchanged', error: parsed.error };
  }

  const node = parsed.fields.get(field);
  if (node) {
    if (node.kind !== 'string') {
      return {
        ok: false,
        text: src,
        changed: false,
        mode: 'unchanged',
        error: `字段 ${field} 不是字符串（实际是 ${node.kind}）`,
      };
    }
    if (node.value === value) {
      return { ok: true, text: src, changed: false, mode: 'unchanged', error: null };
    }
    const literal = JSON.stringify(value);
    return {
      ok: true,
      text: src.slice(0, node.start) + literal + src.slice(node.end),
      changed: true,
      mode: 'replace',
      error: null,
    };
  }

  // 插入到顶层结构体开头
  const open = parsed.rootOpen;
  const inner = src.slice(open + 1, parsed.rootClose);
  const literal = `${field}: ${JSON.stringify(value)}`;
  if (inner.trim() === '') {
    return {
      ok: true,
      text: `${src.slice(0, open + 1)}${literal}${src.slice(parsed.rootClose)}`,
      changed: true,
      mode: 'insert',
      error: null,
    };
  }
  const sep = inner.trimStart().startsWith(',') ? ' ' : ', ';
  return {
    ok: true,
    text: `${src.slice(0, open + 1)}${literal}${sep}${src.slice(open + 1)}`,
    changed: true,
    mode: 'insert',
    error: null,
  };
}

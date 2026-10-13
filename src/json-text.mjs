/**
 * JSON 文本的最小改动编辑。
 *
 * 为什么不用 `JSON.parse` + `JSON.stringify`：
 * 目标程序（DesignCraft 的 ui.json、EffectCraft 的 prefs.json）对配置文件相当挑剔，
 * 整文件重排缩进、改变浮点/转义写法都可能被判为「配置损坏」。
 * 所以这里做一个只认识结构、保留其余字节的扫描器：定位到字段后**只替换该字段的字面量**。
 *
 * 支持的路径形如 `language`、`general.language`；数组元素路径写作 `scripts[0].name`。
 */

const WS = new Set([' ', '\t', '\n', '\r']);

/**
 * 扫描 JSON 文本，返回「路径 → 节点位置」的索引。
 * @param {string} text
 * @returns {{ ok: boolean, index: Map<string, object>, error: string|null }}
 */
export function scanJsonText(text) {
  const index = new Map();
  const src = String(text ?? '');
  let i = 0;

  const pathOf = (...segments) => segments.filter((s) => s !== '').join('.');

  const fail = (msg) => {
    throw new Error(`JSON 解析失败（位置 ${i}）：${msg}`);
  };

  const skipWs = () => {
    while (i < src.length && WS.has(src[i])) i += 1;
  };

  const readString = () => {
    const start = i;
    i += 1; // 开引号
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === '"') {
        i += 1;
        const raw = src.slice(start, i);
        let value;
        try {
          value = JSON.parse(raw);
        } catch {
          fail('字符串转义无法解析');
        }
        return { start, end: i, raw, value };
      }
      i += 1;
    }
    fail('字符串没有闭合的引号');
    return null;
  };

  const parseLiteral = (raw) => {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (raw === 'null') return null;
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
  };

  const scanValue = (key) => {
    skipWs();
    if (i >= src.length) fail('内容意外结束');
    const c = src[i];
    if (c === '{') return scanObject(key);
    if (c === '[') return scanArray(key);
    if (c === '"') {
      const s = readString();
      index.set(key, { kind: 'string', start: s.start, end: s.end, raw: s.raw, value: s.value });
      return;
    }
    const start = i;
    while (i < src.length && !',}]'.includes(src[i]) && !WS.has(src[i])) i += 1;
    const raw = src.slice(start, i);
    if (raw === '') fail('空的值');
    index.set(key, { kind: 'literal', start, end: i, raw, value: parseLiteral(raw) });
  };

  const scanObject = (key) => {
    const start = i;
    i += 1; // '{'
    const node = { kind: 'object', start, end: -1 };
    index.set(key, node);
    skipWs();
    if (src[i] === '}') {
      i += 1;
      node.end = i;
      return;
    }
    for (;;) {
      skipWs();
      if (src[i] !== '"') fail('期望对象的键');
      const k = readString();
      const childKey = pathOf(key, k.value);
      skipWs();
      if (src[i] !== ':') fail('期望 ":"');
      i += 1;
      scanValue(childKey);
      skipWs();
      if (src[i] === ',') {
        i += 1;
        continue;
      }
      if (src[i] === '}') {
        i += 1;
        node.end = i;
        return;
      }
      fail('期望 "," 或 "}"');
    }
  };

  const scanArray = (key) => {
    const start = i;
    i += 1; // '['
    const node = { kind: 'array', start, end: -1 };
    index.set(key, node);
    skipWs();
    if (src[i] === ']') {
      i += 1;
      node.end = i;
      return;
    }
    let n = 0;
    for (;;) {
      scanValue(`${key}[${n}]`);
      skipWs();
      if (src[i] === ',') {
        i += 1;
        n += 1;
        continue;
      }
      if (src[i] === ']') {
        i += 1;
        node.end = i;
        return;
      }
      fail('期望 "," 或 "]"');
    }
  };

  try {
    skipWs();
    if (i >= src.length) return { ok: false, index, error: '文件是空的' };
    scanValue('');
    skipWs();
    if (i < src.length) fail('根对象之后还有多余内容');
    return { ok: true, index, error: null };
  } catch (err) {
    return { ok: false, index, error: err.message };
  }
}

/**
 * 读取某个路径的字符串值。
 * @param {string} text
 * @param {string[]} pathSegments
 * @returns {{ ok: boolean, found: boolean, value: string|null, kind: string|null, error: string|null }}
 */
export function readJsonStringValue(text, pathSegments) {
  const scan = scanJsonText(text);
  if (!scan.ok) return { ok: false, found: false, value: null, kind: null, error: scan.error };
  const node = scan.index.get(pathSegments.join('.'));
  if (!node) return { ok: true, found: false, value: null, kind: null, error: null };
  return {
    ok: true,
    found: true,
    value: node.kind === 'string' ? node.value : String(node.raw),
    kind: node.kind,
    error: null,
  };
}

/**
 * 找出所有「键名以 language 结尾」的路径（用于 detect 里证明某 App 没有语言键）。
 * @param {string} text
 * @returns {string[]}
 */
export function findLanguageKeyPaths(text) {
  const scan = scanJsonText(text);
  if (!scan.ok) return [];
  const out = [];
  for (const key of scan.index.keys()) {
    if (key === '') continue;
    const leaf = key.replace(/\[\d+\]$/, '').split('.').pop() ?? '';
    if (/language/i.test(leaf)) out.push(key);
  }
  return out;
}

/**
 * 把某个路径的字符串字段设为新值：只改该字段的字面量，其余字节原样保留。
 * @param {string} text
 * @param {string[]} pathSegments
 * @param {string} value
 * @returns {{ ok: boolean, text: string, changed: boolean, mode: 'unchanged'|'replace'|'insert', error: string|null }}
 */
export function setJsonStringValue(text, pathSegments, value) {
  const scan = scanJsonText(text);
  if (!scan.ok) {
    return { ok: false, text, changed: false, mode: 'unchanged', error: scan.error };
  }

  const fullKey = pathSegments.join('.');
  const node = scan.index.get(fullKey);

  if (node) {
    if (node.kind !== 'string') {
      return {
        ok: false,
        text,
        changed: false,
        mode: 'unchanged',
        error: `字段 ${fullKey} 不是字符串（实际是 ${node.kind}）`,
      };
    }
    if (node.value === value) {
      return { ok: true, text, changed: false, mode: 'unchanged', error: null };
    }
    const literal = JSON.stringify(value);
    return {
      ok: true,
      text: text.slice(0, node.start) + literal + text.slice(node.end),
      changed: true,
      mode: 'replace',
      error: null,
    };
  }

  // 字段不存在：插到父对象的开头
  const parentKey = pathSegments.slice(0, -1).join('.');
  const leafKey = pathSegments[pathSegments.length - 1];
  const parent = scan.index.get(parentKey);
  if (!parent || parent.kind !== 'object') {
    return {
      ok: false,
      text,
      changed: false,
      mode: 'unchanged',
      error: `找不到可以插入字段 ${fullKey} 的对象：${parentKey || '<根>'}${parent ? `（实际是 ${parent.kind}）` : ''}`,
    };
  }

  const open = parent.start;
  const close = parent.end - 1;
  const inner = text.slice(open + 1, close);
  const literal = `${JSON.stringify(leafKey)}: ${JSON.stringify(value)}`;

  if (inner.trim() === '') {
    // {} → {"language": "zh"}
    return {
      ok: true,
      text: `${text.slice(0, open + 1)}${literal}${text.slice(close)}`,
      changed: true,
      mode: 'insert',
      error: null,
    };
  }

  if (inner.includes('\n')) {
    const m = /^[^\n]*\n([ \t]*)/.exec(inner);
    const indent = m ? m[1] : '  ';
    return {
      ok: true,
      text: `${text.slice(0, open + 1)}\n${indent}${literal},${text.slice(open + 1)}`,
      changed: true,
      mode: 'insert',
      error: null,
    };
  }

  // { "a": 1 } → {"language": "zh", "a": 1 }
  return {
    ok: true,
    text: `${text.slice(0, open + 1)}${literal}, ${text.slice(open + 1)}`,
    changed: true,
    mode: 'insert',
    error: null,
  };
}

/**
 * 生成一个最小 JSON 文档（用于「文件不存在则创建」）。
 * @param {string[]} pathSegments
 * @param {string} value
 * @returns {string}
 */
export function minimalJsonDocument(pathSegments, value) {
  let doc = JSON.stringify(value);
  for (let i = pathSegments.length - 1; i >= 0; i -= 1) {
    doc = `{${JSON.stringify(pathSegments[i])}:${doc}}`;
  }
  return doc;
}

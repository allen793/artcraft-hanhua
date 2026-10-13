/**
 * 「语言字段」粗探针：**只用于报告，绝不用于写入**。
 *
 * 为什么需要它：有些程序的配置文件不是干净的结构体，语言键藏在别处。实测例子：
 *
 * CADCraft 的 `%APPDATA%\ai.storyteller.cadcraft\data\app.ron` 是 RON 的 map 形式，
 * 值本身又是一段被转义的 JSON 字符串：
 *
 * ```
 * {
 *     "cadcraft.prefs": "{\"interfaceLanguage\":\"auto\",\"saveFormat\":\"dxf\",...}",
 * }
 * ```
 *
 * 也就是说语言键叫 `interfaceLanguage`，且被嵌在字符串里 —— 这既解释了「为什么不能简单写它」，
 * 也是 detect 报告里值得给出的证据。本模块只做正则级扫描，不做任何语义推断与改写。
 */

/**
 * 找出形如 `"xxxLanguage": "value"` 的字段（同时兼容被反斜杠转义的写法）。
 * @param {string} text
 * @returns {Array<{key: string, value: string}>} 按首次出现去重
 */
export function findRawLanguageFields(text) {
  const out = [];
  const re = /\\{0,2}"([A-Za-z0-9_]*[Ll]anguage[A-Za-z0-9_]*)\\{0,2}"\s*:\s*\\{0,2}"([^"\\]*)\\{0,2}"/g;
  let match;
  while ((match = re.exec(String(text ?? ''))) !== null) {
    const key = match[1];
    if (!out.some((entry) => entry.key === key)) out.push({ key, value: match[2] });
  }
  return out;
}

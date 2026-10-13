/**
 * 主程序二进制补丁：把 Tauri v2 `EmbeddedAssets` 里内嵌的前端资源换成中文。
 *
 * 本文件是 Python 参考实现（`artcraft-poc/tools/tauri_assets.py` +
 * `build_full.py` + CSP 重写）的**忠实移植**，零第三方依赖，只用 Node 内置模块。
 * 产物必须与参考产物逐字节相同（见 test/artcraft-patch-e2e.test.mjs）。
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 算法要点
 * ═══════════════════════════════════════════════════════════════════════
 *
 * 1. EmbeddedAssets 的布局
 *    - 是一张 `phf::Map<&'static str, &'static [u8]>`（Tauri v2 EmbeddedAssets），
 *      编译期生成，静态数据落在 `.rdata` 段。
 *    - phf 表条目**定长 40 字节**，5 个 8 字节字段：
 *        hash(u64) | key.ptr(u64) | key.len(u64) | value.ptr(u64) | value.len(u64)
 *      其中 ptr 是**绝对 VA**（链接基址 0x140000000 那一套），
 *      换算文件偏移需要按 PE 节表做 RVA→Offset 映射。
 *    - key 是资源路径（形如 `/index.html`、`/assets/xxx.js`）。
 *
 * 2. 每条 value 是**独立的 brotli 流**（Tauri 的 compression feature），
 *    解压后才是真正的 HTML/JS/CSS 文本。压缩比不同 → 替换后长度必然变化。
 *
 * 3. 变长替换的做法
 *    - 只解压/重压需要的条目（本版本的 3 个前端资源）。
 *    - 中文译文按 `data/translations.tsv` 里「英文 → 中文」对齐替换
 *      **只替换完整的带引号字面量** `"英文"` → `"中文"`，不碰裸文本。
 *    - **按英文长度从长到短排序后再替换**，否则 `"Create"` 会先破坏
 *      `"Create Image"`（实测：Create 4/4、Create Image 4/4、Edit 15/15、Edit Image 4/4）。
 *    - **大小写敏感**（有 31 组仅大小写不同的英文），**绝不 trim**
 *      （有 173 条英文首尾带空格，空格是内容的一部分）。
 *    - 新流长度不等于旧流长度 → **不原位置覆盖**，而是追加一个**新的 PE 段**
 *      `.asst`（同时更新节表、`NumberOfSections`、`SizeOfImage`、校验和置 0），
 *      然后**只改 phf 条目里的 value.ptr / value.len**；key/hash 一个字都不能动。
 *
 * 4. CSP 哈希
 *    index.html 的 CSP 里有 6 条 `sha256-<44 字符 base64>` **明文 ASCII**
 *    （每条固定 51 字符，可原位替换）。改动过的资源（JS）其旧哈希必须在
 *    二进制里找到恰好 1 处并原位替换成按**新的解压内容**算出的哈希，
 *    否则 WebView2 直接拒绝执行内联脚本，界面白屏。CSS 内容未变，
 *    其哈希不在那 6 条里，不要瞎改（见 `recomputeCspHashes`）。
 *
 * 5. 其它约束
 *    - ArtCraft 更新后版本一变，phf 表位置与条目集合都可能变，所以必须**按版本判断**
 *      是否支持（见 `isPatchSupported`），不要盲目套用。
 *    - 产物另存为新文件（默认 `artcraft-zh-full.exe`），**不覆盖原 exe**；
 *      原 exe 保持可用来回滚。
 *    - 涉及数字签名：打过补丁的 exe 签名必然失效，这是预期行为。
 *
 * ═══════════════════════════════════════════════════════════════════════
 */

import { win32 as path } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { PATCHED_MAIN_EXE_NAME, TRANSLATIONS_RELATIVE_PATH } from './constants.mjs';
import { fileExists, readTextFile } from './fsutil.mjs';

/** 本模块的接口版本；算法接入后如果签名变了就 +1 */
export const ARTCRAFT_PATCH_VERSION = 2;

/** 实测确认过的主程序版本（补丁算法只对这些版本负责） */
export const SUPPORTED_MAIN_VERSIONS = ['0.41.0'];

/** phf 条目定长 40 字节 */
export const PHF_ENTRY_SIZE = 40;
/** PE 节表每一项定长 40 字节（数值恰好与 phf 条目相同，但含义不同，别混用） */
export const SECTION_HEADER_SIZE = 40;
/** phf 条目里 5 个字段的字节偏移 */
export const PHF_FIELD_OFFSET = {
  hash: 0,
  keyPtr: 8,
  keyLen: 16,
  valuePtr: 24,
  valueLen: 32,
};

/** 参考实现里实测确认的常量（assert 用，不是「凑出来」的） */
export const REFERENCE_FACTS = {
  /** 原 exe 字节数 */
  originalExeBytes: 77080064,
  /** 参考产物字节数 */
  patchedExeBytes: 78648832,
  /** 参考产物 SHA-256（小写）—— v3 译表（2803 条）重建的 `artcraft-zh-v3.exe` */
  patchedExeSha256: '0525f3331e6115122c851c821621fdce7937dc89a055bf1c156480b4e99aba9f',
  /**
   * phf 表：**搜索式**定位到 `.rdata` 里 0x3cf0428 起的一簇。
   *
   * 实测（本实现 / 参考实现 `find_entries`）：
   * - 候选窗口 228 个，落在 `.rdata` 0x3cf0428..0x3cf2220；
   * - 参考实现去重后返回 227 条 —— 其中 2 条的 key 是 `/` 与 `/=`（扫描噪音，
   *   参考实现只要求 key 以 `/` 开头，没要求后面还有字符）；
   * - 本实现要求 key 是「`/` + 至少一个可打印字符」，把这 2 条噪音排除，得到 225 条。
   *   3 个目标条目的 loc 与参考产物**完全一致**（见下），所以这点差异不影响产物。
   */
  phfFirstEntryOffset: 0x3cf0428,
  phfEntryCount: 225,
  /** 参考实现（含 2 条噪音 key）的条目数，仅用于报告 */
  phfEntryCountReference: 227,
  /** 合成测试镜像要把条目数补到这个值才能过「条目数容差」这一关 */
  phfEntryCountForTest: 225,
  /** phf 表条目里可用的（brotli 可解压）资源数 */
  usableAssetCount: 227,
  /** 新段名 */
  newSectionName: '.asst',
  /** 新段属性：INITIALIZED_DATA | MEM_READ */
  newSectionCharacteristics: 0x40000040,
  /** 旧段数 / 新段数 */
  sectionCountBefore: 6,
  sectionCountAfter: 7,
  /** 旧 / 新 SizeOfImage */
  sizeOfImageBefore: 77111296,
  sizeOfImageAfter: 78680064,
  /** 三个被改动的前端资源（顺序很重要：决定新段里 brotli 流的拼接顺序） */
  patchedAssets: ['/index.html', '/assets/index-IL-0eMku.js', '/assets/index-DTSJQQsq.css'],
  /** 三个目标 key 的 phf hash 字段（search-based 定位的强校验） */
  assetHashes: {
    '/index.html': '0x980',
    '/assets/index-IL-0eMku.js': '0x55052',
    '/assets/index-DTSJQQsq.css': '0x19f41',
  },
  /** index.html 原始字节数 / 替换后字节数 */
  htmlRawBytes: [1725, 1723],
  /** JS 原始字节数 / 替换后字节数（sha256→base64 就是按这两个算的） */
  jsRawBytes: [9059561, 9056530],
  /** CSS 原始字节数 / 替换后字节数（未变） */
  cssRawBytes: [161826, 161826],
  /** 三个新 brotli 流的字节数（顺序同 patchedAssets） */
  compressedBytes: [644, 1544021, 20933],
  /** 新段 payload 字节数 = compressedBytes 之和 */
  payloadBytes: 1565598,
  /**
   * 翻译表条数 / 每条生成的搜索键数 / 落地替换次数（v3 译表）。
   * **只作为参考报告值，不做硬断言** —— 译表会变（2773 → 2803），
   * 断言一律读实际数据，见 test/artcraft-patch-algorithm.test.mjs。
   */
  translations: { total: 2803, literalsPerEntry: 2, applications: 3863 },
  /** 替换后 JS 里的 CJK 字符数 */
  cjkChars: 21906,
  /** 原 JS 的 sha256→base64（CSP 里那一条） */
  jsCspHashBefore: 'sha256-4ArYMF5GuVlFkSa3qpippIUjOLhKpONvXOvLUPukPMU=',
  /** 汉化后 JS 的 sha256→base64（v3 译表，2803 条） */
  jsCspHashAfter: 'sha256-KehCoiXg6uIvKTZZUumZSooRcigqnQYJdR0vkfWjIKY=',
};

/** CSP 明文串的固定长度：`sha256-`(7) + 44 字符 base64 = 51 */
export const CSP_HASH_TEXT_LENGTH = 51;
/** CSP 里 base64 的编码参数（openH264 那套：标准字母表 + 末尾一个 `=`） */
export const CSP_BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** 结尾补齐一个 `=`（32 字节 → 44 字符，最后一组 2 字节 + `=`） */
const CSP_BASE64_PADDING = '=';

/** index.html 上的定点改写 */
export const HTML_REPLACEMENTS = {
  from: 'lang="en"',
  to: 'lang="zh"',
  titleFrom: '<title>ArtCraft</title>',
  titleTo: '<title>\u56fe\u574a</title>',
};

/** 译文里需要转义的字符 */
const DQ = '"';
const SQ = "'";
const BS = '\\';

/** 支持的字面量分隔符：双引号与单引号（**各构造一次搜索键，各自转义**） */
export const LITERAL_QUOTES = [DQ, SQ];

/** brotli 压缩参数：必须与参考实现一致（quality=11, lgwin=24, MODE_TEXT） */
export const BROTLI_PARAMS = { quality: 11, lgwin: 24, mode: 'text' };

/* ══════════════════════════════════════════════════════════════════════
 * 工具
 * ══════════════════════════════════════════════════════════════════════ */

/** 二进制比较：返回逐字节相同与否（不短路，返回首个差异偏移） */
function firstDifference(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] !== b[i]) return i;
  }
  if (a.length !== b.length) return n;
  return -1;
}

/** 把长度向上取整到 4 KiB */
function align4k(value) {
  return (value + 0xfff) & ~0xfff;
}

/** 统计字符串里的 CJK 统一表意文字数量（与参考实现的 `\u4e00..\u9fff` 口径一致） */
export function countCjkChars(text) {
  let n = 0;
  for (const ch of String(text)) {
    const c = ch.codePointAt(0);
    if (c >= 0x4e00 && c <= 0x9fff) n += 1;
  }
  return n;
}

/** 把译文转义成能放进 JS 双引号字面量里的形式（`"` 与 `\` 都要转义） */
export function escapeForDoubleQuoted(chinese) {
  let out = '';
  for (const ch of String(chinese)) {
    if (ch === DQ) out += BS + DQ;
    else if (ch === BS) out += BS + BS;
    else out += ch;
  }
  return out;
}

/** 把译文转义成能放进 JS 单引号字面量里的形式（`'` 与 `\` 都要转义） */
export function escapeForSingleQuoted(chinese) {
  let out = '';
  for (const ch of String(chinese)) {
    if (ch === SQ) out += BS + SQ;
    else if (ch === BS) out += BS + BS;
    else out += ch;
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════
 * PE 解析（移植自 tauri_assets.py 的 parse_pe / rva2off / find_entries）
 * ══════════════════════════════════════════════════════════════════════ */

/**
 * 解析 PE32+ 头与节表。
 * @param {Buffer|Uint8Array} image
 * @returns {{
 *   peOff: number, nsec: number, optOff: number, optSize: number, secOff: number,
 *   magic: number, imageBase: number, sizeOfImage: number, sizeOfHeaders: number,
 *   checksumOff: number, nrvaOff: number, ddOff: number,
 *   sections: Array<{idx: number, hdr: number, name: string, vsize: number, vaddr: number, rawsize: number, rawptr: number, characteristics: number}>,
 * }}
 */
export function parsePe(image) {
  const data = Buffer.isBuffer(image) ? image : Buffer.from(image);
  if (data.length < 0x40) throw new Error('不是 PE 文件：长度不足');
  const peOff = data.readUInt32LE(0x3c);
  if (peOff + 24 > data.length || data.toString('latin1', peOff, peOff + 4) !== 'PE\0\0') {
    throw new Error('不是 PE 文件：找不到 PE 签名');
  }
  const nsec = data.readUInt16LE(peOff + 6);
  const optSize = data.readUInt16LE(peOff + 20);
  const optOff = peOff + 24;
  const magic = data.readUInt16LE(optOff);
  if (magic !== 0x20b) throw new Error(`期望 PE32+（magic 0x20b），实际 0x${magic.toString(16)}`);
  const secOff = optOff + optSize;
  const sections = [];
  for (let i = 0; i < nsec; i += 1) {
    const o = secOff + i * SECTION_HEADER_SIZE;
    if (o + SECTION_HEADER_SIZE > data.length) throw new Error(`节表第 ${i} 项越界`);
    const name = data.toString('latin1', o, o + 8).replace(/\0+$/, '');
    sections.push({
      idx: i,
      hdr: o,
      name,
      vsize: data.readUInt32LE(o + 8),
      vaddr: data.readUInt32LE(o + 12),
      rawsize: data.readUInt32LE(o + 16),
      rawptr: data.readUInt32LE(o + 20),
      characteristics: data.readUInt32LE(o + 36),
    });
  }
  return {
    peOff,
    nsec,
    optOff,
    optSize,
    secOff,
    magic,
    imageBase: Number(data.readBigUInt64LE(optOff + 24)),
    sizeOfImage: data.readUInt32LE(optOff + 56),
    sizeOfHeaders: data.readUInt32LE(optOff + 60),
    checksumOff: optOff + 64,
    nrvaOff: optOff + 108,
    ddOff: optOff + 112,
    sections,
  };
}

/**
 * RVA → 文件偏移（移植自 rva2off）。
 * @param {ReturnType<typeof parsePe>} pe
 * @param {number} rva
 * @returns {number|null}
 */
export function rvaToOffset(pe, rva) {
  for (const s of pe.sections) {
    const span = Math.max(s.vsize, s.rawsize);
    if (s.vaddr <= rva && rva < s.vaddr + span) return s.rawptr + (rva - s.vaddr);
  }
  return null;
}

/** 一个节的属性位 */
const SECTION_MEM_WRITE = 0x80000000;
const SECTION_MEM_EXECUTE = 0x20000000;
const SECTION_CNT_INITIALIZED_DATA = 0x00000040;

/**
 * phf 表定位：**搜索式**，不硬编码任何偏移（抗版本漂移）。
 *
 * 三级定位，任一步失败都**显式报错**，绝不「猜一个偏移继续跑」：
 *
 *   1. 解析节表，把搜索范围限制在**只读的数据节**（含 `CNT_INITIALIZED_DATA`、
 *      不含 `MEM_WRITE` / `MEM_EXECUTE`）。条目里的 ptr 是绝对 VA，必须能映射回
 *      某个节、并且落在文件范围内 —— 这一步就把候选量压到极小。
 *   2. 以 8 字节步进扫描，逐条校验不变量（hash 不是 0、hash 不是指针、
 *      key.ptr / value.ptr 在镜像范围内、key.len ∈ [1,256]、value.len ∈ [1,256MiB]、
 *      key 是可打印 ASCII 且以 `/` 开头），然后按「间距不超过 `clusterGap`」把候选
 *      聚成簇，取**最大的簇**当 phf 表（并要求簇内至少 `minEntries` 条）。
 *   3. 对簇里的每条 value **做 brotli 解压当内容指纹**（「每条 value 是一条独立
 *      brotli 流」是极强的指纹），再断言必需 key 都在、且它们的 hash 字段与实测一致。
 *
 * ── 关于这一段内存的**实测**布局（依据，不是假设）──
 *
 * 在这份 exe（Tauri v2 / ArtCraft 0.41.0）里扫到的候选**不是** 40 字节等距排布，
 * 而是密集分布在 `.rdata` 的 0x3cf0428..0x3cf2220 这一簇里：候选窗口 228 个、
 * 其中 226 个 brotli 可解压。参考实现 `find_entries` 去重后返回 227 条（含 2 条
 * key 为 `/`、`/=` 的扫描噪音），本实现要求 key 是「`/` + 至少一个可打印字符」，
 * 因此得到 225 条；**3 个目标条目的 loc 与参考产物完全一致**，所以这点差异不影响产物。
 *
 * 所以这里**不假设步长**，只按「簇 + 不变量 + brotli 指纹」定位。`loc + 24` /
 * `loc + 32` 就是 value.ptr / value.len —— 参考产物里那 3 个目标条目正是被写在
 * `0x3cf0c08 / 0x3cf0ea8 / 0x3cf1528`（由参考构建脚本写、本实现独立复现出来，
 * 见 REFERENCE_FACTS.assetHashes 与端到端测试），这是字段序正确性的硬证据。
 *
 * 另外实测还有 1 条**孤立**候选（0x4261948，key 是 `/=`，value 不是 brotli 流），
 * 它在别的簇里、不会被选中；本函数只返回最大簇，并报告簇的范围。
 *
 * @param {ReturnType<typeof parsePe>} pe
 * @param {Buffer} data
 * @param {{
 *   expectedTableOffset?: number|null,
 *   requiredKeys?: string[],
 *   expectedHashes?: Record<string,string>,
 *   minEntries?: number,
 *   clusterGap?: number,
 * }} [options]
 * @returns {{
 *   entries: Array<{loc: number, hash: bigint, key: string, keyLen: number, valueLen: number, keyOffset: number, valueOffset: number, decompressible: boolean}>,
 *   firstOffset: number, lastOffset: number, clusterSpan: number, sectionName: string,
 *   candidateCount: number, decompressible: number,
 *   missingRequired: string[], hashesOk: boolean, hashProblems: string[],
 * }}
 */
export function findPhfEntries(
  pe,
  data,
  {
    expectedTableOffset = null,
    requiredKeys = [],
    expectedHashes = {},
    minEntries = 16,
    clusterGap = 0x10000,
  } = {},
) {
  const ib = pe.imageBase;
  const hi = ib + 0x10000000;
  const scanSections = pe.sections.filter(
    (s) =>
      (s.characteristics & SECTION_MEM_WRITE) === 0 &&
      (s.characteristics & SECTION_MEM_EXECUTE) === 0 &&
      (s.characteristics & SECTION_CNT_INITIALIZED_DATA) !== 0 &&
      s.rawsize > 0,
  );
  if (scanSections.length === 0) {
    throw new Error('PE 里没有可扫描的只读数据节，无法定位 phf 表');
  }

  // ── 第 1 + 2 级：只读数据节里 8 字节步进扫候选条目 ──
  const candidates = [];
  for (const sec of scanSections) {
    for (let i = 0; i + PHF_ENTRY_SIZE <= sec.rawsize; i += 8) {
      const at = sec.rawptr + i;
      const hash = data.readBigUInt64LE(at);
      const kp = Number(data.readBigUInt64LE(at + 8));
      const kl = Number(data.readBigUInt64LE(at + 16));
      const vp = Number(data.readBigUInt64LE(at + 24));
      const vl = Number(data.readBigUInt64LE(at + 32));
      if (hash === 0n) continue; // 空槽 / 未初始化
      const hashNum = Number(hash);
      if (hashNum >= ib && hashNum < hi) continue; // hash 字段不可能是指针
      if (!(kp >= ib && kp < hi && vp >= ib && vp < hi)) continue;
      if (!(kl >= 1 && kl <= 256 && vl >= 1 && vl <= 256 * 1024 * 1024)) continue;
      const koff = rvaToOffset(pe, kp - ib);
      const voff = rvaToOffset(pe, vp - ib);
      if (koff === null || voff === null) continue;
      if (koff + kl > data.length || voff + vl > data.length) continue;
      const raw = data.subarray(koff, koff + kl);
      if (raw[0] !== 0x2f) continue; // key 必须以 '/' 开头
      let printable = true;
      for (const byte of raw) {
        if (byte < 32 || byte >= 127) {
          printable = false;
          break;
        }
      }
      if (!printable) continue;
      candidates.push({
        loc: at,
        hash,
        key: raw.toString('latin1'),
        keyLen: kl,
        valueLen: vl,
        keyOffset: koff,
        valueOffset: voff,
        sectionName: sec.name,
        decompressible: false,
      });
    }
  }
  candidates.sort((a, b) => a.loc - b.loc);
  if (candidates.length === 0) {
    throw new Error('在只读数据节里没有找到任何符合 phf 条目不变量的候选条目');
  }

  // ── 聚簇：间距 > clusterGap 就分簇，取最大的簇 ──
  const clusters = [];
  let current = [candidates[0]];
  for (let i = 1; i < candidates.length; i += 1) {
    if (candidates[i].loc - candidates[i - 1].loc > clusterGap) {
      clusters.push(current);
      current = [];
    }
    current.push(candidates[i]);
  }
  clusters.push(current);
  let best = clusters[0];
  for (const c of clusters) if (c.length > best.length) best = c;

  // 同一个 key 可能有多个候选窗口（40 字节字段、8 字节步进扫描时的正常现象），
  // 保留**最先出现**的那一条 —— 与参考实现 find_entries 的「keep first」一致，
  // 这样才能得到与参考产物完全相同的 loc。
  const seen = new Set();
  const entries = [];
  for (const e of best) {
    if (seen.has(e.key)) continue;
    seen.add(e.key);
    entries.push(e);
  }
  if (entries.length < minEntries) {
    throw new Error(
      `phf 表最大簇只有 ${entries.length} 条条目（簇 ${hex(best[0].loc)}..${hex(best[best.length - 1].loc)}），` +
        `少于要求的 ${minEntries} 条`,
    );
  }
  const sectionName = entries[0].sectionName;

  // ── 第 3 级：brotli 内容指纹 ──
  let decompressible = 0;
  for (const e of entries) {
    try {
      brotliDecompress(data.subarray(e.valueOffset, e.valueOffset + e.valueLen));
      e.decompressible = true;
      decompressible += 1;
    } catch {
      e.decompressible = false;
    }
  }

  // ── 断言：必需 key + 它们的 hash 字段 ──
  const byKey = new Map(entries.map((e) => [e.key, e]));
  const missingRequired = (requiredKeys ?? []).filter((k) => !byKey.has(k));
  const hashProblems = [];
  for (const [key, want] of Object.entries(expectedHashes ?? {})) {
    const e = byKey.get(key);
    if (!e) continue; // 缺 key 已由 missingRequired 报告
    const wantHex = typeof want === 'string' ? want : '0x' + Number(want).toString(16);
    const gotHex = '0x' + e.hash.toString(16);
    if (wantHex.toLowerCase() !== gotHex.toLowerCase()) {
      hashProblems.push(`${key}：期望 hash ${wantHex}，实际 ${gotHex}`);
    }
  }

  if (expectedTableOffset !== null && entries[0].loc !== expectedTableOffset) {
    throw new Error(
      `phf 表起始偏移不是实测值：期望 ${hex(expectedTableOffset)}，实际 ${hex(entries[0].loc)}`,
    );
  }
  if (missingRequired.length > 0) {
    throw new Error(
      `phf 表里缺少必需资源：${missingRequired.join('、')}（表内共 ${entries.length} 条，` +
        `节 ${sectionName}，簇 ${hex(best[0].loc)}..${hex(best[best.length - 1].loc)}）`,
    );
  }
  if (hashProblems.length > 0) {
    throw new Error(`phf 条目 hash 字段与实测不符：${hashProblems.join('；')}`);
  }

  return {
    entries,
    firstOffset: entries[0].loc,
    lastOffset: entries[entries.length - 1].loc,
    clusterSpan: best[best.length - 1].loc - best[0].loc,
    sectionName,
    candidateCount: candidates.length,
    decompressible,
    missingRequired,
    hashesOk: hashProblems.length === 0,
    hashProblems,
  };
}

/** `0x` 前缀的十六进制展示 */
function hex(value) {
  return `0x${Number(value).toString(16)}`;
}

/* ══════════════════════════════════════════════════════════════════════
 * 翻译表解析
 * ══════════════════════════════════════════════════════════════════════ */

const TRANSLATION_COLUMNS = ['id', 'english', 'chinese'];

/**
 * 解析 `data/translations.tsv`。
 *
 * 兼容行为（与 src/translations.mjs 的口径一致）：
 * - 有表头时**按表头名字定位列**，因此列顺序可以不同；
 * - 没有表头时按 `id / english / chinese` 的位置约定解析第一行起的数据；
 * - **绝不 trim english**（173 条首尾带空格的英文，空格是内容的一部分）；
 *   `chinese` 也不 trim —— 但表头行本身按 trim 后比较。
 * - 换行兼容 LF / CRLF / CR，末尾空行丢掉。
 *
 * @param {string} text
 * @param {{ requireCount?: number|null }} [options]
 * @returns {{ ok: boolean, entries: Array<{id: string, en: string, zh: string}>, columns: string[], hadHeader: boolean, errors: string[], warnings: string[] }}
 */
export function parseTranslationTable(text, { requireCount = null } = {}) {
  const errors = [];
  const warnings = [];
  const entries = [];
  const lines = String(text ?? '').split(/\r\n|\n|\r/);
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  if (lines.length === 0) {
    return { ok: false, entries, columns: [...TRANSLATION_COLUMNS], hadHeader: false, errors: ['翻译数据是空的'], warnings };
  }
  const first = lines[0].split('\t').map((s) => s.trim().toLowerCase());
  const hadHeader =
    first.length === TRANSLATION_COLUMNS.length && TRANSLATION_COLUMNS.every((c) => first.includes(c));
  const columns = hadHeader ? first : [...TRANSLATION_COLUMNS];
  if (!hadHeader) {
    warnings.push('未识别到表头（期望 id/english/chinese），已按该列顺序从第一行开始解析');
  }
  const dataLines = hadHeader ? lines.slice(1) : lines;

  dataLines.forEach((line, idx) => {
    const lineNo = idx + (hadHeader ? 2 : 1);
    if (line === '') return;
    const fields = line.split('\t');
    if (fields.length !== columns.length) {
      errors.push(`第 ${lineNo} 行列数不对：期望 ${columns.length} 列，实际 ${fields.length} 列`);
      return;
    }
    const record = {};
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
    entries.push({ id: record.id, en: record.english, zh: record.chinese, line: lineNo });
  });

  if (requireCount !== null && entries.length !== requireCount) {
    errors.push(`翻译条数不符：期望 ${requireCount} 条，实际 ${entries.length} 条`);
  }
  return { ok: errors.length === 0, entries, columns, hadHeader, errors, warnings };
}

/** 仓库内 `data/translations.tsv` 的绝对路径 */
export function defaultTranslationsPath() {
  return fileURLToPath(new URL(`../${TRANSLATIONS_RELATIVE_PATH}`, import.meta.url));
}

/**
 * 归一化调用方传进来的译文：
 * - 数组形式 `[{id, en, zh}]` 或 `{english, chinese}` 都接受；
 * - 对象形式 `{ english: chinese }` 走 `Object.entries`。
 * @param {Array|Record|null|undefined} translations
 * @returns {Array<{id: string, en: string, zh: string}>}
 */
export function normalizeTranslations(translations) {
  if (translations === null || translations === undefined) return [];
  if (Array.isArray(translations)) {
    return translations.map((raw, i) => {
      if (raw && typeof raw === 'object') {
        const en = raw.en ?? raw.english ?? '';
        const zh = raw.zh ?? raw.chinese ?? '';
        return { id: String(raw.id ?? i + 1), en: String(en), zh: String(zh) };
      }
      throw new Error(`translations[${i}] 不是对象`);
    });
  }
  if (typeof translations === 'object') {
    return Object.entries(translations).map(([en, zh], i) => ({
      id: String(i + 1),
      en: String(en),
      zh: String(zh),
    }));
  }
  throw new Error('translations 必须是数组或对象');
}

/**
 * 构造「带引号字面量」替换计划：**双引号与单引号各构造一次搜索键**，
 * 然后按字面量长度从长到短排序。
 *
 * 为什么必须两种分隔符都做（实测依据，不是保险起见）：
 * 包里有些界面文案是单引号包裹的（例：`children: 'Type "DELETE" to confirm'`），
 * 只做双引号会整条漏掉 —— v3 构建报告里 `literals_total = 5606 = 2803 × 2`，
 * 也就是**每条译文都同时生成了 dq 与 sq 两个搜索键**。
 *
 * 转义规则：**英文键原样存储、不预先转义**（预转义会匹配不上原文）；
 * 只对**译文**按目标分隔符转义 —— dq 版本转义 `"` 与 `\`，sq 版本转义 `'` 与 `\`。
 * 另外排除「英文自身含同种引号」的键，避免产出畸形字面量。
 *
 * 长度相同时用英文字面量字典序兜底，保证结果与调用顺序无关（Python 的 `-len` 排序
 * 在等长时因为「等长串互不为子串」而结果一致，这里显式写死更稳）。
 * @param {Array<{id?: string, en: string, zh: string}>} entries
 * @returns {Array<{id: string, en: string, zh: string, quote: string, from: string, to: string}>}
 */
export function buildReplacementPlan(entries) {
  const plan = [];
  (entries ?? []).forEach((e, i) => {
    const en = String(e.en ?? '');
    const zh = String(e.zh ?? '');
    const id = e.id === undefined || e.id === null ? String(i + 1) : String(e.id);
    for (const quote of LITERAL_QUOTES) {
      if (en.includes(quote)) continue; // 英文自身含这种引号 → 无法安全构造字面量
      const to = quote === DQ ? escapeForDoubleQuoted(zh) : escapeForSingleQuoted(zh);
      const kind = quote === DQ ? 'dq' : 'sq';
      plan.push({
        id,
        literal: `${id}:${kind}`,
        kind,
        en,
        zh,
        quote,
        from: quote + en + quote,
        to: quote + to + quote,
      });
    }
  });
  plan.sort((a, b) => {
    if (b.from.length !== a.from.length) return b.from.length - a.from.length;
    if (a.from < b.from) return -1;
    if (a.from > b.from) return 1;
    return 0;
  });
  return plan;
}

/**
 * 按计划替换文本 —— **逐个 replace、长的先来**，与参考实现
 * （Python `str.replace`，规则按 `-len(literal)` 排序）逐字节等价。
 *
 * 为什么不能图省事写成「按首字符打表、一次扫描」：
 *
 * 1. 规则的 `from` 都以引号开头（它们是带引号字面量），所以「按首字符分桶」
 *    等于**没有分桶**，每个引号位置都要试全部规则（v3 是 2803 条 → 5538 个字面量）。
 * 2. 更致命的是**规则顺序**：`data/translations.tsv` 里有 4 条英文**跨引号匹配**
 *    （例：`" but also contains the following legacy lifecycles:"`，开头那个 `"`
 *    是前一个字面量的结尾），还有长度不同但**重叠**的规则（例：`" + a + "`
 *    与上面那条共用引号）。参考实现按长度从长到短逐条 replace，长的先落地；
 *    任何「从左到右、命中即吃」的扫描都会让短的先吃掉长的开头，实测差 4 条落地、
 *    JS 多 11 字节。
 * 3. 只做双引号会漏掉单引号包裹的界面文案（实测残留里有 66 条单引号候选），
 *    v3 构建报告 `literals_total = 5606 = 2803 × 2` 就是「两种分隔符各一遍」的实证。
 *
 * 所以这里就用**与参考实现同样的算法**：按长度从长到短逐条规则、对每条规则做
 * 「全局不重叠替换」（`String.prototype.split/join` 的语义，与 Python
 * `str.replace` 一致）。性能上靠「命中即缩短文本」来摊薄：长规则很少见，
 * 它们一落地就把文本变短，后面短规则的扫描面随之变小；实测整份 9 MB JS
 * 约 3 秒，可以接受。
 *
 * 规则里不会出现空串（`from` 至少 3 个字符：两个引号 + 至少一个字符），
 * 且 `to` 永远不会包含 `from`（中文里没有 ASCII 双引号），所以逐条替换必然终止。
 *
 * @param {string} text
 * @param {Array<{id: string, en: string, zh: string, from: string, to: string}>} plan
 * @returns {{ text: string, applications: number, hits: Array<object>, misses: Array<object>, identical: Array<object> }}
 */
export function applyReplacementPlan(text, plan) {
  let out = String(text);
  const stats = new Map(); // id → { occurrences, applied, residual }

  for (const rule of plan) {
    if (rule.from === '') throw new Error(`替换规则 ${rule.id} 的 from 是空串，会死循环`);
    // occurrences（= 参考报告的 pre）：**这一步原文里**出现几次
    let occurrences = 0;
    let scan = out.indexOf(rule.from);
    while (scan >= 0) {
      occurrences += 1;
      scan = out.indexOf(rule.from, scan + 1);
    }
    if (occurrences === 0) continue;

    let applied = 0;
    if (rule.from !== rule.to) {
      // 全局不重叠替换（与 Python str.replace / split+join 同语义），一次替换干净
      const pieces = [];
      let cursor = 0;
      let found = out.indexOf(rule.from);
      while (found >= 0) {
        pieces.push(out.slice(cursor, found), rule.to);
        cursor = found + rule.from.length;
        applied += 1;
        found = out.indexOf(rule.from, cursor);
      }
      pieces.push(out.slice(cursor));
      out = pieces.join('');
    }
    // residual（= 参考报告的 post）：替换后还剩几次。
    // from === to 时文本一个字节都没变，所以 residual = occurrences、applied = 0；
    // 做了全局替换时 residual 必然是 0。两处都不需要再扫一遍全文。
    const residual = rule.from === rule.to ? occurrences : 0;
    // 自检：applied 必须等于 pre - post（与参考实现 apply-hits.tsv 的口径一致）
    if (occurrences - residual !== applied) {
      throw new Error(
        `内部错误：规则 ${rule.id} 的 applied(${applied}) 与 pre-post(${occurrences - residual}) 不一致`,
      );
    }
    if (applied > 0) stats.set(rule.literal ?? rule.id, { occurrences, applied, residual });
  }

  const hits = [];
  const misses = [];
  const identical = [];
  let applications = 0;
  for (const rule of plan) {
    const s = stats.get(rule.literal ?? rule.id);
    if (!s || s.applied === 0) {
      misses.push({ id: rule.id, kind: rule.kind ?? null, en: rule.en });
      continue;
    }
    applications += s.applied;
    hits.push({
      id: rule.id,
      literal: rule.literal ?? `${rule.id}:${rule.kind ?? ''}`,
      kind: rule.kind ?? null,
      en: rule.en,
      zh: rule.zh,
      occurrences: s.occurrences,
      applied: s.applied,
    });
    if (rule.from === rule.to) identical.push({ id: rule.id, en: rule.en, applied: s.applied });
  }
  return { text: out, applications, hits, misses, identical };
}

/**
 * 参考语义的逐条 `replace`（等价于 Python `str.replace`），用于与
 * `applyReplacementPlan` 交叉验证 —— 两套实现必须给出**同一个字符串**。
 * @param {string} text
 * @param {Array<{id: string, from: string, to: string}>} plan
 * @returns {string}
 */
export function replaceSequentially(text, plan) {
  let out = String(text);
  for (const rule of plan) {
    if (!out.includes(rule.from)) continue;
    out = out.split(rule.from).join(rule.to);
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════
 * CSP
 * ══════════════════════════════════════════════════════════════════════ */

/**
 * 32 字节 digest → CSP 里那 44 字符的 base64。
 *
 * 刻意**不依赖 Buffer.toString('base64')**：CSP 里的哈希是 Tauri 侧算的，
 * 这里自己按标准字母表编码并显式断言长度，格式一变就报错而不是悄悄写歪。
 * @param {Buffer|Uint8Array} digest 32 字节
 * @returns {string} 44 字符 base64（结尾一个 `=`）
 */
export function digestToCspBase64(digest) {
  const bytes = Buffer.isBuffer(digest) ? digest : Buffer.from(digest);
  if (bytes.length !== 32) {
    throw new Error(`sha256 digest 必须是 32 字节，实际 ${bytes.length} 字节`);
  }
  let out = '';
  for (let i = 0; i < 30; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += CSP_BASE64_ALPHABET[(n >> 18) & 63];
    out += CSP_BASE64_ALPHABET[(n >> 12) & 63];
    out += CSP_BASE64_ALPHABET[(n >> 6) & 63];
    out += CSP_BASE64_ALPHABET[n & 63];
  }
  const tail = (bytes[30] << 8) | bytes[31];
  out += CSP_BASE64_ALPHABET[(tail >> 10) & 63];
  out += CSP_BASE64_ALPHABET[(tail >> 4) & 63];
  out += CSP_BASE64_ALPHABET[(tail << 2) & 63];
  out += CSP_BASE64_PADDING;
  return out;
}

/**
 * 算一个资源（解压后字节）的 CSP 哈希串 `sha256-<44 字符>`。
 * @param {Buffer|Uint8Array} raw
 * @returns {string}
 */
export function cspHashOf(raw) {
  const digest = crypto.createHash('sha256').update(Buffer.isBuffer(raw) ? raw : Buffer.from(raw)).digest();
  return `sha256-${digestToCspBase64(digest)}`;
}

/** 资源路径 → `script-src` 还是 `style-src` */
function cspDirectiveFor(resourcePath) {
  const lower = String(resourcePath).toLowerCase();
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return 'scriptSrc';
  if (lower.endsWith('.css')) return 'styleSrc';
  return 'other';
}

/**
 * 重算 CSP 哈希：对每个**被改动过**的资源算出「旧内容哈希 → 新内容哈希」，
 * 在二进制里找出那条**以旧哈希结尾**的 CSP 明文串（固定 51 字符）并原位替换。
 *
 * ── 关键实测定律：CSP 里**只包含一部分**资源的哈希 ──
 *
 * 原件的 6 条 `sha256-...` 里：
 * - 只有 JS（`/assets/index-IL-0eMku.js`）那一条能对上：旧
 *   `sha256-4ArYMF5GuVlFkSa3qpippIUjOLhKpONvXOvLUPukPMU=` → 新
 *   `sha256-gMY4MXtq1pCfOx1EHGJwC4hMBi5rkPW7AVd8YKJnpUw=`（实测已验证）。
 * - **index.html 的哈希不在那 6 条里**（原件 HTML 的 sha256→base64 是
 *   `sha256-DhGAOauVXnZxcjLCrPOTSMj1Roik4pvOO3NDtUcCOXg=`，6 条里没有它）。
 *   所以「HTML 变了就必须改 CSP」这个直觉是错的 —— HTML 的哈希本来就没进 CSP。
 * - CSS 内容未变，同样不该动。
 *
 * 因此规则是：**只有能在二进制里找到旧哈希的资源才替换**；找不到就是「这条哈希
 * 本来就不在 CSP 里」，如实记进 `skipped`，**不报错、不乱改**（另外 4 条哈希的
 * 来源仍未确定，见 `verifyCspHashes` 的 B−A 报告）。
 *
 * 替换时的硬性断言（踩过坑，必须有）：
 * - 替换前后长度必须相等（`sha256-` + 44 字符 base64 = 51，逐个字符编码自己算，不靠平台）；
 * - 旧串在整张 image 里必须**恰好出现 1 次**；
 * - 出现多条就抛错，绝不「猜着改」。
 *
 * @param {{
 *   image?: Buffer|Uint8Array|null,
 *   decompressedAssets?: Array<{path: string, bytes: Buffer|Uint8Array, changed?: boolean, previousBytes?: Buffer|Uint8Array|null}>,
 * }} params
 * @returns {{
 *   image: Buffer, changed: boolean,
 *   scriptSrc: Array<object>, styleSrc: Array<object>, other: Array<object>,
 *   hashes: Array<object>, replacements: Array<object>, skipped: Array<object>,
 * }}
 */
export function recomputeCspHashes({ image = null, decompressedAssets = [] } = {}) {
  const src = image === null || image === undefined ? null : Buffer.isBuffer(image) ? image : Buffer.from(image);
  const out = src ? Buffer.from(src) : null;
  const hashes = [];
  const byDirective = { scriptSrc: [], styleSrc: [], other: [] };
  const replacements = [];
  const skipped = [];
  const record = (entry) => {
    hashes.push(entry);
    byDirective[entry.directive].push(entry);
    return entry;
  };

  for (const asset of decompressedAssets ?? []) {
    const assetPath = String(asset?.path ?? '');
    const directive = cspDirectiveFor(assetPath);
    const changed = asset?.changed === true;
    const entry = {
      path: assetPath,
      directive,
      changed,
      replaced: false,
      offset: null,
      newHash: null,
      previousHash: null,
    };

    if (!changed) {
      entry.reason = '这个资源的解压内容没有变化，CSP 哈希无需重算';
      skipped.push(entry);
      record(entry);
      continue;
    }
    if (asset?.previousBytes === null || asset?.previousBytes === undefined) {
      throw new Error(
        `资源 ${assetPath} 标记为已改动，但没有提供 previousBytes，无法确定要替换掉哪条旧 CSP 哈希`,
      );
    }
    const oldHash = cspHashOf(asset.previousBytes);
    const newHash = cspHashOf(asset.bytes ?? Buffer.alloc(0));
    entry.previousHash = oldHash;
    entry.newHash = newHash;
    if (oldHash.length !== CSP_HASH_TEXT_LENGTH || newHash.length !== CSP_HASH_TEXT_LENGTH) {
      throw new Error(
        `CSP 哈希串长度不是 ${CSP_HASH_TEXT_LENGTH}：old=${oldHash.length} new=${newHash.length}`,
      );
    }
    if (oldHash === newHash) {
      entry.reason = '解压内容虽然变了，但 sha256 恰好相同，无需替换';
      skipped.push(entry);
      record(entry);
      continue;
    }
    if (out === null) {
      entry.reason = '没有提供 exe 镜像，只算出了新哈希，未做替换';
      skipped.push(entry);
      record(entry);
      continue;
    }

    const oldBytes = Buffer.from(oldHash, 'latin1');
    const first = out.indexOf(oldBytes);
    if (first < 0) {
      // 这条资源的哈希本来就不在 CSP 里（例如 index.html），不是错误
      entry.reason = `旧哈希 ${oldHash} 不在 exe 的 CSP 明文串里，说明这条哈希本来就没进 CSP，不做替换`;
      skipped.push(entry);
      record(entry);
      continue;
    }
    const second = out.indexOf(oldBytes, first + 1);
    if (second >= 0) {
      throw new Error(
        `旧 CSP 哈希 ${oldHash} 在 exe 镜像里出现了多次（至少 ${hex(first)} 与 ${hex(second)}），拒绝替换`,
      );
    }
    const newBytes = Buffer.from(newHash, 'latin1');
    if (oldBytes.length !== newBytes.length) {
      throw new Error(`CSP 哈希替换前后长度不等：${oldBytes.length} → ${newBytes.length}`);
    }
    newBytes.copy(out, first);
    entry.replaced = true;
    entry.offset = first;
    replacements.push({
      path: assetPath,
      directive,
      offset: first,
      oldHash,
      newHash,
      length: oldBytes.length,
    });
    record(entry);
  }

  return {
    image: out ?? Buffer.alloc(0),
    changed: replacements.length > 0,
    scriptSrc: byDirective.scriptSrc,
    styleSrc: byDirective.styleSrc,
    other: byDirective.other,
    hashes,
    replacements,
    skipped,
  };
}

/* ══════════════════════════════════════════════════════════════════════
 * CSP 自检（用集合比对，不只比一条）
 * ══════════════════════════════════════════════════════════════════════ */

/** 换行归一化：CRLF / CR → LF（与 Tauri 生成 CSP 时的口径一致） */
export function normalizeLineEndings(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * 抽出一个 HTML 里所有 `<script>` 元素的文本。
 * @param {string} html
 * @returns {Array<{index: number, text: string}>}
 */
export function extractScriptBodies(html) {
  const out = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  let i = 0;
  while ((m = re.exec(String(html))) !== null) {
    out.push({ index: i, text: m[1] });
    i += 1;
  }
  return out;
}

/**
 * 从一个 HTML 的**每个非空** `<script>` 文本算出 CSP 哈希集合
 * （先做 CRLF/CR→LF 归一化，再 sha256→base64）。
 *
 * 实测依据（`/index.html` 的 6 条 CSP 中对得上 3 条）：
 * - `#1` gtag 内联脚本 → `sha256-OeYQ...` ✅ 在 CSP 里
 * - `#3` Clarity 内联脚本 → `sha256-Vn7J...` ✅ 在 CSP 里
 * - `#0 / #2 / #4` 是空 `<script></script>`（外部脚本标签在正则下 body 为空）：
 *   Tauri 会跳过空 body（否则 CSP 里会出现 `sha256-47DEQ...`＝空串哈希，实测**没有**），
 *   所以这里也跳过。
 * - 剩下 3 条（`m3ZV` / `8thw` / `H2FB`）是**非脚本来源**的哈希，本函数不臆造其来源，
 *   由 `verifyCspHashes` 作为 `extras`（B − A）如实报告。
 *
 * `__TAURI_SCRIPT_NONCE__` 占位符两种形态都算一遍（多算无害：自检只做 A ⊆ B）。
 * @param {string} html
 * @returns {string[]} 去重后的 `sha256-...` 串
 */
export function inlineScriptHashes(html) {
  const set = new Set();
  for (const { text } of extractScriptBodies(html)) {
    if (text === '') continue; // 空脚本：Tauri 不为其生成哈希（实测 CSP 里没有空串哈希）
    const body = normalizeLineEndings(text);
    set.add(cspHashOf(Buffer.from(body, 'utf8')));
    const stripped = body.replace(/__TAURI_SCRIPT_NONCE__/g, '');
    if (stripped !== body) set.add(cspHashOf(Buffer.from(stripped, 'utf8')));
  }
  return [...set];
}

/**
 * 从二进制里抽出所有 `sha256-<44 字符 base64>` 明文串。
 * @param {Buffer|Uint8Array} image
 * @returns {{ values: string[], offsets: number[] }}
 */
export function collectCspStrings(image) {
  const buf = Buffer.isBuffer(image) ? image : Buffer.from(image ?? Buffer.alloc(0));
  const values = [];
  const offsets = [];
  const needle = Buffer.from('sha256-', 'latin1');
  const bodyBytes = 44;
  let at = buf.indexOf(needle);
  while (at >= 0) {
    const end = at + needle.length + bodyBytes;
    if (end <= buf.length) {
      const body = buf.toString('latin1', at + needle.length, end);
      if (/^[A-Za-z0-9+/]{43}=$/.test(body)) {
        values.push('sha256-' + body);
        offsets.push(at);
      }
    }
    at = buf.indexOf(needle, at + 1);
  }
  return { values, offsets };
}

/**
 * CSP 自检（**集合比对**，不只是「JS 那一条对不对」）。
 *
 * - 集合 A：产物里每个 HTML 资源的每个 `<script>` 文本 → 归一化 → sha256→base64
 * - 集合 B：产物二进制里所有 `sha256-<44 字符>` 明文串
 * - 断言 **A ⊆ B**；把 **B − A** 作为「非脚本来源的哈希」如实报告（不报错）
 * - `oldHashes` 里任何一条**还残留在 B 里**就报错（旧哈希残留 = 白屏）
 *
 * @param {{
 *   image: Buffer|Uint8Array,
 *   htmlAssets?: Array<{path: string, text: string}>,
 *   oldHashes?: string[],
 * }} params
 * @returns {object}
 */
export function verifyCspHashes({ image, htmlAssets = [], oldHashes = [] } = {}) {
  const scan = collectCspStrings(image);
  const binarySet = new Set(scan.values);
  const scriptHashes = [];
  const perAsset = [];
  for (const asset of htmlAssets ?? []) {
    const hashes = inlineScriptHashes(asset.text);
    perAsset.push({ path: asset.path, hashes });
    for (const h of hashes) if (!scriptHashes.includes(h)) scriptHashes.push(h);
  }
  const missing = scriptHashes.filter((h) => !binarySet.has(h));
  const extras = scan.values.filter((h) => !scriptHashes.includes(h));
  const residualOld = (oldHashes ?? []).filter((h) => binarySet.has(h));
  const problems = [];
  if (missing.length > 0) {
    problems.push(`下列脚本的 CSP 哈希在二进制里找不到（内联脚本会被 WebView2 拒绝执行）：${missing.join(', ')}`);
  }
  if (residualOld.length > 0) {
    problems.push(`旧 CSP 哈希仍然残留在二进制里：${residualOld.join(', ')}`);
  }
  return {
    ok: problems.length === 0,
    problems,
    scriptHashes,
    binaryHashes: scan.values,
    binaryOffsets: scan.offsets,
    extras,
    missing,
    residualOld,
    perAsset,
  };
}

/* ══════════════════════════════════════════════════════════════════════
 * 补丁主体
 * ══════════════════════════════════════════════════════════════════════ */

/** brotli 解压（Tauri 每条 value 是独立流） */
export function brotliDecompress(bytes) {
  return zlib.brotliDecompressSync(bytes);
}

/**
 * brotli 重压：quality=11 / lgwin=24 / MODE_TEXT —— **必须与参考实现一致**，
 * 否则新流字节数对不上，产物就不可能逐字节相同。
 * @param {Buffer|Uint8Array} raw
 * @returns {Buffer}
 */
export function brotliCompress(raw) {
  return zlib.brotliCompressSync(Buffer.isBuffer(raw) ? raw : Buffer.from(raw), {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: BROTLI_PARAMS.quality,
      [zlib.constants.BROTLI_PARAM_LGWIN]: BROTLI_PARAMS.lgwin,
      [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
    },
  });
}

/**
 * 读取 exe 里内嵌的前端资源（brotli 解压后的原始字节）+ phf 条目。
 *
 * phf 表位置由 `findPhfEntries` **搜索式**定位；目标 key 缺一个就抛错。
 * @param {Buffer} image
 * @param {{
 *   expectedTableOffset?: number|null,
 *   requiredKeys?: string[],
 *   expectedHashes?: Record<string,string>,
 *   decompressAll?: boolean,
 * }} [options]
 */
export function readEmbeddedAssets(
  image,
  {
    expectedTableOffset = null,
    requiredKeys = REFERENCE_FACTS.patchedAssets,
    expectedHashes = REFERENCE_FACTS.assetHashes,
    decompressAll = false,
  } = {},
) {
  const pe = parsePe(image);
  const scan = findPhfEntries(pe, image, { expectedTableOffset, requiredKeys, expectedHashes });
  const { entries } = scan;
  const byKey = new Map();
  const unusable = [];
  const keysToRead = decompressAll ? entries.map((e) => e.key) : requiredKeys;
  const byLookup = new Map(entries.map((e) => [e.key, e]));
  for (const key of keysToRead) {
    const e = byLookup.get(key);
    if (!e) continue;
    let raw;
    try {
      raw = brotliDecompress(image.subarray(e.valueOffset, e.valueOffset + e.valueLen));
    } catch (err) {
      unusable.push({ key, error: err.message });
      continue;
    }
    byKey.set(key, { entry: e, raw, compressed: image.subarray(e.valueOffset, e.valueOffset + e.valueLen) });
  }
  const missing = (requiredKeys ?? []).filter((k) => !byKey.has(k));
  if (missing.length > 0) {
    throw new Error(
      `exe 里找不到这些内嵌资源：${missing.join('、')}（phf 表共 ${entries.length} 条，` +
        `${scan.decompressible} 条 brotli 可解压）。可能不是实测过的主程序版本。`,
    );
  }
  return { pe, entries, assets: byKey, unusable, scan };
}

/**
 * 纯函数：把一张原始 exe 镜像打成汉化镜像。
 *
 * 不做任何文件 IO，也不读默认翻译表 —— 便于单测与端到端测试复用。
 *
 * @param {{
 *   image: Buffer|Uint8Array,
 *   translations: Array<{id?: string, en: string, zh: string}>|Record<string,string>,
 *   log?: (msg: string) => void,
 *   expectedTableOffset?: number|null,
 * }} params
 * @returns {object} 报告（含 image / sha256 / 各种统计）
 */
export function applyPatchToImage({
  image,
  translations,
  log = () => {},
  expectedTableOffset = null,
} = {}) {
  const src = Buffer.isBuffer(image) ? image : Buffer.from(image ?? Buffer.alloc(0));
  if (src.length === 0) throw new Error('原始 exe 是空的');

  const { pe, entries, assets, unusable, scan } = readEmbeddedAssets(src, { expectedTableOffset });
  log(
    `phf 表定位：${entries.length} 条去重条目（节 ${scan.sectionName}，` +
      `簇 ${hex(scan.firstOffset)}..${hex(scan.lastOffset)}，共 ${scan.candidateCount} 个候选窗口，` +
      `${scan.decompressible} 条 brotli 可解压）`,
  );
  if (entries.length !== REFERENCE_FACTS.phfEntryCount) {
    const tolerance = Math.max(8, Math.round(REFERENCE_FACTS.phfEntryCount * 0.05));
    if (Math.abs(entries.length - REFERENCE_FACTS.phfEntryCount) > tolerance) {
      throw new Error(
        `phf 条目数偏离实测值太多：期望约 ${REFERENCE_FACTS.phfEntryCount}` +
          `（容差 ±${tolerance}），实际 ${entries.length}。这个 exe 很可能不是实测过的版本。`,
      );
    }
    log(
      `注意：phf 条目数 ${entries.length}，实测值为 ${REFERENCE_FACTS.phfEntryCount}` +
        `（参考实现含 2 条噪音 key 时为 ${REFERENCE_FACTS.phfEntryCountReference}），在容差内继续`,
    );
  }

  const plan = buildReplacementPlan(normalizeTranslations(translations));
  log(`替换计划：${plan.length} 条（已按英文长度从长到短排序）`);

  /* ---- JS ---- */
  const jsKey = '/assets/index-IL-0eMku.js';
  const jsAsset = assets.get(jsKey);
  const rawJsOld = jsAsset.raw;
  const jsOldText = rawJsOld.toString('utf8');
  const applied = applyReplacementPlan(jsOldText, plan);
  const rawJsNew = Buffer.from(applied.text, 'utf8');
  const jsCjk = countCjkChars(applied.text);
  log(
    `js：原始 ${rawJsOld.length} → ${rawJsNew.length} 字节（${rawJsNew.length - rawJsOld.length >= 0 ? '+' : ''}` +
      `${rawJsNew.length - rawJsOld.length}），命中 ${applied.hits.length}/${plan.length} 条，落地 ${applied.applications} 次，` +
      `未命中 ${applied.misses.length} 条，CJK 字符 ${jsCjk}`,
  );
  if (applied.misses.length > 0) {
    log(`  未命中的英文：${applied.misses.slice(0, 10).map((m) => JSON.stringify(m.en)).join(', ')}`);
  }
  if (rawJsOld.length === REFERENCE_FACTS.jsRawBytes[0] && rawJsNew.length !== REFERENCE_FACTS.jsRawBytes[1]) {
    throw new Error(
      `JS 替换后的字节数不是实测值：期望 ${REFERENCE_FACTS.jsRawBytes[1]}，实际 ${rawJsNew.length}` +
        '（替换规则或翻译表与实测不一致）',
    );
  }

  /* ---- index.html ---- */
  const htmlKey = '/index.html';
  const htmlAsset = assets.get(htmlKey);
  const rawHtmlOld = htmlAsset.raw;
  let htmlText = rawHtmlOld.toString('utf8');
  const langCount = htmlText.split(HTML_REPLACEMENTS.from).length - 1;
  if (langCount !== 1) throw new Error(`index.html 里 ${HTML_REPLACEMENTS.from} 出现 ${langCount} 次，期望 1 次`);
  htmlText = htmlText.replace(HTML_REPLACEMENTS.from, HTML_REPLACEMENTS.to);
  const titleCount = htmlText.split(HTML_REPLACEMENTS.titleFrom).length - 1;
  if (titleCount !== 1) {
    throw new Error(`index.html 里 ${HTML_REPLACEMENTS.titleFrom} 出现 ${titleCount} 次，期望 1 次`);
  }
  htmlText = htmlText.replace(HTML_REPLACEMENTS.titleFrom, HTML_REPLACEMENTS.titleTo);
  const rawHtmlNew = Buffer.from(htmlText, 'utf8');
  log(`html：原始 ${rawHtmlOld.length} → ${rawHtmlNew.length} 字节`);

  /* ---- CSS（内容不变，但也要重新压一遍，因为要写进新段） ---- */
  const cssKey = '/assets/index-DTSJQQsq.css';
  const cssAsset = assets.get(cssKey);
  const rawCssOld = cssAsset.raw;
  const rawCssNew = rawCssOld;
  log(`css：原始 ${rawCssOld.length} 字节（内容未变）`);

  /* ---- 重压 ---- */
  const newBlobs = new Map([
    [htmlKey, brotliCompress(rawHtmlNew)],
    [jsKey, brotliCompress(rawJsNew)],
    [cssKey, brotliCompress(rawCssNew)],
  ]);
  const compressedSizes = [];
  for (const key of REFERENCE_FACTS.patchedAssets) {
    const a = assets.get(key).compressed.length;
    const b = newBlobs.get(key).length;
    compressedSizes.push(b);
    log(`  ${key}：压缩 ${a} → ${b} 字节`);
  }

  const payload = Buffer.concat(REFERENCE_FACTS.patchedAssets.map((key) => newBlobs.get(key)));
  if (payload.length !== compressedSizes.reduce((a, b) => a + b, 0)) {
    throw new Error('内部错误：payload 长度与各段之和不一致');
  }
  log(`新段 payload：${payload.length} 字节`);

  /* ---- 追加新 PE 段 ---- */
  const data = Buffer.from(src);
  const last = pe.sections.reduce((best, s) =>
    s.vaddr + Math.max(s.vsize, s.rawsize) > best.vaddr + Math.max(best.vsize, best.rawsize) ? s : best,
  );
  const newRva = align4k(last.vaddr + Math.max(last.vsize, last.rawsize));
  const newRawsize = align4k(payload.length);
  const insertAt = last.rawptr + last.rawsize;
  log(
    `新段 ${REFERENCE_FACTS.newSectionName}：RVA ${hex(newRva)}，rawsize ${hex(newRawsize)}，` +
      `插入偏移 ${hex(insertAt)}`,
  );
  if (insertAt > data.length) throw new Error('插入偏移超出文件长度');

  const tail = Buffer.alloc(newRawsize - payload.length);
  const combined = Buffer.concat([data.subarray(0, insertAt), payload, tail, data.subarray(insertAt)]);
  let out = combined;

  const hdrOff = pe.secOff + pe.nsec * SECTION_HEADER_SIZE;
  if (hdrOff + SECTION_HEADER_SIZE > out.length) throw new Error('节表后面没有空间放新节头');
  for (let i = hdrOff; i < hdrOff + SECTION_HEADER_SIZE; i += 1) {
    if (out[i] !== 0) throw new Error(`节表后面不是零填充（偏移 ${hex(i)}），不敢写新节头`);
  }
  const hdr = Buffer.alloc(SECTION_HEADER_SIZE);
  hdr.write(REFERENCE_FACTS.newSectionName, 0, 'latin1');
  hdr.writeUInt32LE(payload.length, 8); // VirtualSize
  hdr.writeUInt32LE(newRva, 12); // VirtualAddress
  hdr.writeUInt32LE(newRawsize, 16); // SizeOfRawData
  hdr.writeUInt32LE(insertAt, 20); // PointerToRawData
  hdr.writeUInt32LE(REFERENCE_FACTS.newSectionCharacteristics, 36);
  hdr.copy(out, hdrOff);

  out.writeUInt16LE(pe.nsec + 1, pe.peOff + 6); // NumberOfSections
  const sizeOfImageAfter = newRva + newRawsize;
  out.writeUInt32LE(sizeOfImageAfter, pe.optOff + 56); // SizeOfImage
  out.writeUInt32LE(0, pe.checksumOff); // 校验和置 0

  /* ---- PE 规范硬要求：SizeOfImage 必须是 SectionAlignment 的整数倍 ---- */
  const sectionAlignment = src.readUInt32LE(pe.optOff + 32);
  const fileAlignment = src.readUInt32LE(pe.optOff + 36);
  if (sectionAlignment === 0) throw new Error('SectionAlignment 为 0，PE 头不可信');
  if (sizeOfImageAfter % sectionAlignment !== 0) {
    throw new Error(
      `SizeOfImage（${hex(sizeOfImageAfter)}）不是 SectionAlignment（${hex(sectionAlignment)}）的整数倍`,
    );
  }
  if (insertAt % fileAlignment !== 0) {
    throw new Error(`新节 PointerToRawData（${hex(insertAt)}）不是 FileAlignment（${hex(fileAlignment)}）的整数倍`);
  }

  /* ---- 改 phf 条目（只动 value.ptr / value.len） ---- */
  let off = 0;
  for (const key of REFERENCE_FACTS.patchedAssets) {
    const e = assets.get(key).entry;
    const blob = newBlobs.get(key);
    out.writeBigUInt64LE(BigInt(pe.imageBase + newRva + off), e.loc + PHF_FIELD_OFFSET.valuePtr);
    out.writeBigUInt64LE(BigInt(blob.length), e.loc + PHF_FIELD_OFFSET.valueLen);
    log(`  phf ${key}：value.ptr → ${hex(newRva + off)}，value.len ${blob.length}`);
    off += blob.length;
  }

  /* ---- CSP ---- */
  const csp = recomputeCspHashes({
    image: out,
    decompressedAssets: [
      { path: htmlKey, bytes: rawHtmlNew, previousBytes: rawHtmlOld, changed: !rawHtmlNew.equals(rawHtmlOld) },
      { path: jsKey, bytes: rawJsNew, previousBytes: rawJsOld, changed: !rawJsNew.equals(rawJsOld) },
      { path: cssKey, bytes: rawCssNew, previousBytes: rawCssOld, changed: !rawCssNew.equals(rawCssOld) },
    ],
  });
  out = csp.image;
  for (const r of csp.replacements) {
    log(`CSP 重算：${r.path} 在 ${hex(r.offset)} 处原位替换 ${r.oldHash} → ${r.newHash}`);
  }
  for (const s of csp.skipped) {
    if (s.changed) log(`CSP 跳过：${s.path}（${s.reason}）`);
  }

  /* ---- 改动的字节审计：除白名单之外一个字节都不许变 ---- */
  const allowedRanges = [
    { from: insertAt, to: insertAt + newRawsize, why: '新段数据' },
    ...REFERENCE_FACTS.patchedAssets.map((key) => {
      const e = assets.get(key).entry;
      return { from: e.loc + PHF_FIELD_OFFSET.valuePtr, to: e.loc + PHF_FIELD_OFFSET.valueLen + 8, why: `phf 条目 ${key}` };
    }),
    { from: pe.peOff + 6, to: pe.peOff + 8, why: 'NumberOfSections' },
    { from: pe.optOff + 56, to: pe.optOff + 60, why: 'SizeOfImage' },
    { from: pe.checksumOff, to: pe.checksumOff + 4, why: '校验和' },
    { from: pe.secOff + pe.nsec * SECTION_HEADER_SIZE, to: hdrOff + SECTION_HEADER_SIZE, why: '新节头' },
    ...csp.replacements.map((r) => ({ from: r.offset, to: r.offset + r.length, why: `CSP ${r.path}` })),
  ];
  const inAllowed = (i) => allowedRanges.some((r) => i >= r.from && i < r.to);
  let changedInside = 0;
  let changedOutside = 0;
  let firstOutside = -1;
  const original = src.subarray(0, Math.min(src.length, out.length));
  for (let i = 0; i < original.length; i += 1) {
    if (original[i] === out[i]) continue;
    if (inAllowed(i)) changedInside += 1;
    else {
      if (firstOutside < 0) firstOutside = i;
      changedOutside += 1;
    }
  }
  if (changedOutside > 0) {
    throw new Error(
      `改动审计失败：有 ${changedOutside} 个字节落在白名单之外（首个 ${hex(firstOutside)}）。` +
        '补丁只允许改：新段数据、3 个 phf 条目、NumberOfSections/SizeOfImage、校验和、CSP 字符串。',
    );
  }

  /* ---- 自检 1：产物能完整解出资产，且 3 个目标资源与写入的内容一致 ---- */
  const reread = readEmbeddedAssets(out, { decompressAll: true, expectedHashes: REFERENCE_FACTS.assetHashes });
  for (const key of REFERENCE_FACTS.patchedAssets) {
    const got = reread.assets.get(key).raw;
    const want = { [htmlKey]: rawHtmlNew, [jsKey]: rawJsNew, [cssKey]: rawCssNew }[key];
    if (!got.equals(want)) {
      throw new Error(`自检失败：产物里 ${key} 解压结果与写入内容不一致`);
    }
  }

  /* ---- 自检 2：CSP 集合比对 ---- */
  const cspCheck = verifyCspHashes({
    image: out,
    htmlAssets: [{ path: htmlKey, text: htmlText }],
    oldHashes: [REFERENCE_FACTS.jsCspHashBefore],
  });
  if (!cspCheck.ok) throw new Error(`CSP 自检失败：${cspCheck.problems.join('；')}`);
  const jsCspBefore = cspHashOf(rawJsOld);
  const jsCspAfter = cspHashOf(rawJsNew);
  if (cspCheck.binaryHashes.length === 0) {
    // 合成/裁剪过的镜像里可能一条 CSP 明文串都没有（真实产物一定有 6 条）：
    // 这种情况下没有可替换的对象，如实记一条日志即可，不算失败。
    log('注意：产物里没有找到任何 sha256- CSP 明文串，跳过「新哈希必须存在」这条自检');
  } else if (!cspCheck.binaryHashes.includes(jsCspAfter)) {
    throw new Error(`CSP 自检失败：产物里找不到改动后 JS 的哈希 ${jsCspAfter}`);
  }
  void jsCspBefore;

  const sha256 = crypto.createHash('sha256').update(out).digest('hex');
  const replaced = applied.hits.reduce((acc, h) => acc + h.applied, 0);

  return {
    image: out,
    bytes: out.length,
    sha256,
    pe: {
      sectionCountBefore: pe.nsec,
      sectionCountAfter: pe.nsec + 1,
      sizeOfImageBefore: pe.sizeOfImage,
      sizeOfImageAfter,
      imageBase: pe.imageBase,
      sectionAlignment,
      fileAlignment,
    },
    section: {
      name: REFERENCE_FACTS.newSectionName,
      rva: newRva,
      rawsize: newRawsize,
      payload: payload.length,
      rawptr: insertAt,
    },
    phf: {
      entries: entries.length,
      tableOffset: reread.scan.firstOffset,
      clusterSpan: reread.scan.clusterSpan,
      sectionName: reread.scan.sectionName,
      candidateCount: reread.scan.candidateCount,
      decompressible: reread.scan.decompressible,
      required: assets.size,
      unusable: unusable.length,
    },
    assets: {
      [htmlKey]: { rawBefore: rawHtmlOld.length, rawAfter: rawHtmlNew.length },
      [jsKey]: { rawBefore: rawJsOld.length, rawAfter: rawJsNew.length, cjkChars: jsCjk },
      [cssKey]: { rawBefore: rawCssOld.length, rawAfter: rawCssNew.length },
    },
    compressed: Object.fromEntries(REFERENCE_FACTS.patchedAssets.map((k, i) => [k, compressedSizes[i]])),
    translations: {
      total: plan.length,
      hit: applied.hits.length,
      miss: applied.misses.length,
      applications: applied.applications,
      identicalTranslations: applied.identical.length,
      misses: applied.misses,
    },
    replaced,
    audit: { changedInside, changedOutside },
    selfCheck: {
      assetsRoundTrip: true,
      cspOk: cspCheck.ok,
      jsCspHash: jsCspAfter,
      cspHashesInBinary: cspCheck.binaryHashes,
      cspExtras: cspCheck.extras,
    },
    csp: {
      replacements: csp.replacements,
      scriptSrc: csp.scriptSrc,
      styleSrc: csp.styleSrc,
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════
 * exe 版本读取（走 PowerShell，Node 内置模块读不了 PE 版本资源）
 * ══════════════════════════════════════════════════════════════════════ */

/**
 * 把版本号规范化成 `major.minor.patch`。
 * @param {string|null|undefined} version
 * @returns {string|null}
 */
export function normalizeVersion(version) {
  if (!version) return null;
  const parts = String(version).trim().split('.').filter((s) => s !== '');
  if (parts.length === 0) return null;
  return parts.slice(0, 3).join('.');
}

/** PowerShell 单引号字符串转义 */
function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * 默认执行器：用 PowerShell 读 exe 的版本资源。
 *
 * 之所以走 PowerShell：Node 内置模块里没有 PE 版本资源的读取能力，
 * 而本项目不允许引入第三方依赖。返回 stdout 供 `parseExeVersions` 解析。
 * @param {string} script
 * @returns {{ status: number, stdout: string, stderr: string, error: Error|null }}
 */
export function defaultPowerShellExec(script) {
  const candidates = ['powershell.exe', 'pwsh.exe'];
  let last = { status: 1, stdout: '', stderr: '', error: null };
  for (const exe of candidates) {
    const res = spawnSync(exe, ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      windowsHide: true,
    });
    last = {
      status: res.status === null ? 1 : res.status,
      stdout: res.stdout ?? '',
      stderr: res.stderr ?? '',
      error: res.error ?? null,
    };
    if (!last.error && last.status === 0) return last;
    if (last.error && last.error.code === 'ENOENT') continue;
    if (!last.error) return last;
  }
  return last;
}

/**
 * 解析「路径 \t 版本」的输出。
 * @param {string} stdout
 * @param {string[]} [wantedPaths]
 * @returns {{ entries: Array<{path: string, version: string|null}>, byPath: Record<string, string|null> }}
 */
export function parseExeVersions(stdout, wantedPaths = []) {
  const entries = [];
  const byPath = {};
  for (const rawLine of String(stdout ?? '').split(/\r?\n/)) {
    const tab = rawLine.indexOf('\t');
    if (tab < 0) continue;
    const filePath = rawLine.slice(0, tab).trim();
    if (filePath === '') continue;
    const version = rawLine.slice(tab + 1).trim() || null;
    entries.push({ path: filePath, version });
    byPath[filePath.toLowerCase()] = version;
  }
  for (const wanted of wantedPaths) {
    const key = String(wanted).toLowerCase();
    if (!(key in byPath)) byPath[key] = null;
  }
  return { entries, byPath };
}

/**
 * 批量读取 exe 版本。
 * @param {{ paths: string[], exec?: (script: string) => {status: number, stdout: string, stderr: string, error: Error|null} }} deps
 * @returns {{ ok: boolean, byPath: Record<string, string|null>, entries: Array<object>, error: string|null }}
 */
export function readExeVersions({ paths, exec = defaultPowerShellExec }) {
  const list = (paths ?? []).filter(Boolean);
  if (list.length === 0) return { ok: true, byPath: {}, entries: [], error: null };
  const script =
    "$ErrorActionPreference='SilentlyContinue'; " +
    `Get-Item -LiteralPath ${list.map(psQuote).join(',')} | ` +
    'ForEach-Object { $_.FullName + [char]9 + $_.VersionInfo.FileVersion }';
  const res = exec(script);
  if (res.error) {
    return { ok: false, byPath: {}, entries: [], error: `无法执行 PowerShell：${res.error.message}` };
  }
  if (res.status !== 0) {
    const errText = (res.stderr || '').trim().split(/\r?\n/)[0] || `PowerShell 退出码 ${res.status}`;
    return { ok: false, byPath: {}, entries: [], error: errText };
  }
  const parsed = parseExeVersions(res.stdout, list);
  return { ok: true, ...parsed, error: null };
}

/**
 * 读取单个 exe 的版本。
 * @param {{ exePath: string, exec?: Function }} deps
 * @returns {{ ok: boolean, version: string|null, error: string|null }}
 */
export function readExeVersion({ exePath, exec = defaultPowerShellExec }) {
  if (!exePath) return { ok: false, version: null, error: '没有提供 exe 路径' };
  if (!fileExists(exePath)) return { ok: false, version: null, error: `文件不存在：${exePath}` };
  const res = readExeVersions({ paths: [exePath], exec });
  if (!res.ok) return { ok: false, version: null, error: res.error };
  const version = res.byPath[String(exePath).toLowerCase()] ?? null;
  return { ok: version !== null, version, error: version === null ? '读不到版本信息' : null };
}

/**
 * 判断这个主程序是否可以打补丁。
 *
 * @param {{ exePath: string, version?: string|null, exec?: Function }} deps
 * @returns {{ supported: boolean, version: string|null, reason: string }}
 */
export function isPatchSupported({ exePath, version = null, exec = defaultPowerShellExec } = {}) {
  if (!exePath) {
    return { supported: false, version: null, reason: '没有可用的主程序路径' };
  }
  if (!fileExists(exePath)) {
    return { supported: false, version: normalizeVersion(version), reason: `未找到主程序文件：${exePath}` };
  }

  let resolved = normalizeVersion(version);
  let readError = null;
  if (!resolved) {
    const read = readExeVersion({ exePath, exec });
    resolved = normalizeVersion(read.version);
    readError = read.error;
  }
  if (!resolved) {
    return {
      supported: false,
      version: null,
      reason: `无法读取主程序版本信息${readError ? `（${readError}）` : ''}`,
    };
  }
  if (SUPPORTED_MAIN_VERSIONS.includes(resolved)) {
    return { supported: true, version: resolved, reason: `版本 ${resolved} 在实测支持列表内` };
  }
  return {
    supported: false,
    version: resolved,
    reason:
      `实测支持的主程序版本为 ${SUPPORTED_MAIN_VERSIONS.join(' / ')}，当前是 ${resolved}；` +
      'phf 表布局可能随版本变化，请先重新验证补丁算法',
  };
}

/**
 * 补丁产物路径。
 * @param {{ exePath: string, outPath?: string|null }} deps
 * @returns {string}
 */
export function defaultPatchedExePath({ exePath, outPath = null }) {
  if (outPath) return outPath;
  return path.join(path.dirname(exePath), PATCHED_MAIN_EXE_NAME);
}

/**
 * 加载译文：`translations` 为空时读仓库内 `data/translations.tsv`。
 * @param {{ translations?: Array|Record|null, translationsFile?: string|null, requireCount?: number|null, fsImpl?: typeof fs }} [deps]
 */
export function loadPatchTranslations({
  translations = null,
  translationsFile = null,
  requireCount = null,
  fsImpl = fs,
} = {}) {
  if (translations !== null && translations !== undefined) {
    const list = normalizeTranslations(translations);
    if (list.length === 0) throw new Error('传入的 translations 是空的，没有任何可替换的文案');
    return { entries: list, file: null, hadHeader: null };
  }
  const file = translationsFile ?? defaultTranslationsPath();
  if (!fileExists(file, fsImpl)) throw new Error(`翻译数据文件不存在：${file}`);
  const read = readTextFile(file, fsImpl);
  if (!read.ok) throw new Error(`翻译数据读取失败（${file}）：${read.error}`);
  const parsed = parseTranslationTable(read.text, { requireCount });
  if (!parsed.ok) {
    throw new Error(`翻译数据解析失败（${file}）：${parsed.errors.join('；')}`);
  }
  return { entries: parsed.entries, file, hadHeader: parsed.hadHeader };
}

/**
 * 对主程序打补丁：读原 exe → 替换内嵌前端资源 → 追加新 PE 段 → 改 phf 条目
 * → 重算 CSP 哈希 → 另存为新文件（**绝不覆盖原 exe**）。
 *
 * @param {{
 *   exePath: string,
 *   outPath?: string|null,
 *   translations?: Array<{id: string, en: string, zh: string}>|Record<string,string>|null,
 *   translationsFile?: string|null,
 *   requireTranslationCount?: number|null,
 *   log?: (message: string) => void,
 * }} params
 * @returns {{ exePath: string, outPath: string, replaced: number, bytes: number, sha256: string, report: object }}
 */
export function patchMainApp(params = {}) {
  const {
    exePath,
    outPath = null,
    translations = null,
    translationsFile = null,
    requireTranslationCount = null,
    log: rawLog,
  } = params;
  const log = typeof rawLog === 'function' ? rawLog : () => {};

  if (!exePath) throw new Error('没有提供主程序路径');
  if (!fileExists(exePath)) throw new Error(`找不到主程序文件：${exePath}`);

  let image;
  try {
    image = fs.readFileSync(exePath);
  } catch (err) {
    throw new Error(`读取主程序失败（${exePath}）：${err.message}`);
  }
  if (image.length < 0x40 || image.toString('latin1', 0, 2) !== 'MZ') {
    throw new Error(
      `主程序补丁未实现于这种输入：${path.basename(String(exePath))} 不是 PE 可执行文件` +
        '（补丁算法只能处理 Tauri v2 打包的 ArtCraft 主程序）',
    );
  }

  const resolvedOut = defaultPatchedExePath({ exePath, outPath });
  const loaded = loadPatchTranslations({ translations, translationsFile, requireCount: requireTranslationCount });
  log(`翻译数据：${loaded.entries.length} 条${loaded.file ? `（${loaded.file}）` : ''}`);

  const report = applyPatchToImage({ image, translations: loaded.entries, log });
  fs.writeFileSync(resolvedOut, report.image);

  const written = fs.readFileSync(resolvedOut);
  if (written.length !== report.bytes) {
    throw new Error(`产物写入后长度不符：期望 ${report.bytes}，实际 ${written.length}`);
  }
  const after = crypto.createHash('sha256').update(written).digest('hex');
  if (after !== report.sha256) {
    throw new Error(`产物写入后 SHA-256 不符：期望 ${report.sha256}，实际 ${after}`);
  }
  log(`已写出 ${resolvedOut}（${report.bytes} 字节，SHA-256 ${after}）`);

  return {
    exePath,
    outPath: resolvedOut,
    replaced: report.translations.applications,
    bytes: report.bytes,
    sha256: after,
    report,
  };
}

/** 供测试/上层对比用：逐字节比较两张镜像，返回首个差异偏移（相同则 -1） */
export function compareImages(a, b) {
  return firstDifference(
    Buffer.isBuffer(a) ? a : Buffer.from(a ?? []),
    Buffer.isBuffer(b) ? b : Buffer.from(b ?? []),
  );
}

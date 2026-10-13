/**
 * 文件读写工具。
 *
 * 本模块存在的首要理由是「无 BOM 的 UTF-8」：
 * 带 BOM 的配置文件会被 DesignCraft 判定为配置损坏并把语言重置回英文（已实测），
 * 所以写盘一律走 `writeUtf8NoBom()`，并且写完立刻回读文件头做自检。
 */

import fsDefault from 'node:fs';
import crypto from 'node:crypto';

/** UTF-8 BOM 字节 */
export const BOM_BYTES = Buffer.from([0xef, 0xbb, 0xbf]);
/** UTF-8 BOM 字符 */
export const BOM_CHAR = '\uFEFF';

/**
 * 文件是否存在（且是普通文件）
 * @param {string} filePath
 * @param {typeof fsDefault} [fsImpl]
 * @returns {boolean}
 */
export function fileExists(filePath, fsImpl = fsDefault) {
  try {
    return fsImpl.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * 目录是否存在
 * @param {string} dirPath
 * @param {typeof fsDefault} [fsImpl]
 * @returns {boolean}
 */
export function dirExists(dirPath, fsImpl = fsDefault) {
  try {
    return fsImpl.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * 读文本文件，识别并剥离 UTF-8 BOM。
 * @param {string} filePath
 * @param {typeof fsDefault} [fsImpl]
 * @returns {{ ok: boolean, text: string, hadBom: boolean, bytes: number, error: string|null }}
 */
export function readTextFile(filePath, fsImpl = fsDefault) {
  try {
    const buf = fsImpl.readFileSync(filePath);
    const hadBom = buf.length >= 3 && buf.subarray(0, 3).equals(BOM_BYTES);
    const body = hadBom ? buf.subarray(3) : buf;
    return {
      ok: true,
      text: body.toString('utf8'),
      hadBom,
      bytes: buf.length,
      error: null,
    };
  } catch (err) {
    return { ok: false, text: '', hadBom: false, bytes: 0, error: err.message };
  }
}

/**
 * 以「无 BOM 的 UTF-8」写文本，并在写完后回读文件头自检。
 *
 * 不要手动拼 `\uFEFF`；Node 的 utf8 编码本身不会写 BOM。
 * @param {string} filePath
 * @param {string} text
 * @param {typeof fsDefault} [fsImpl]
 * @returns {{ bytes: number }}
 */
export function writeUtf8NoBom(filePath, text, fsImpl = fsDefault) {
  let body = text;
  if (body.charCodeAt(0) === 0xfeff) body = body.slice(1);
  fsImpl.writeFileSync(filePath, body, { encoding: 'utf8' });

  // 写后自检：这是本工具最容易踩的坑，宁可在写入后就地失败，也不要留下坏配置。
  const head = Buffer.alloc(3);
  const fd = fsImpl.openSync(filePath, 'r');
  try {
    fsImpl.readSync(fd, head, 0, 3, 0);
  } finally {
    fsImpl.closeSync(fd);
  }
  if (head.equals(BOM_BYTES)) {
    throw new Error(`写入后检测到 UTF-8 BOM（应为无 BOM）：${filePath}`);
  }
  return { bytes: Buffer.byteLength(body, 'utf8') };
}

/**
 * 计算文件 SHA-256；文件不存在或不可读时返回 null。
 * @param {string} filePath
 * @param {typeof fsDefault} [fsImpl]
 * @returns {string|null}
 */
export function sha256File(filePath, fsImpl = fsDefault) {
  try {
    const buf = fsImpl.readFileSync(filePath);
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch {
    return null;
  }
}

/**
 * 计算字符串 SHA-256。
 * @param {string} text
 * @returns {string}
 */
export function sha256Text(text) {
  return crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

/**
 * 确保目录存在（递归创建）。
 * @param {string} dir
 * @param {typeof fsDefault} [fsImpl]
 */
export function ensureDir(dir, fsImpl = fsDefault) {
  fsImpl.mkdirSync(dir, { recursive: true });
}

/**
 * 删除文件（不存在时返回 false，不抛错）。
 * @param {string} filePath
 * @param {typeof fsDefault} [fsImpl]
 * @returns {boolean} 是否真的删除了一个文件
 */
export function removeFileIfExists(filePath, fsImpl = fsDefault) {
  if (!fileExists(filePath, fsImpl)) return false;
  fsImpl.unlinkSync(filePath);
  return true;
}

/**
 * 复制文件（覆盖目标）。
 * @param {string} from
 * @param {string} to
 * @param {typeof fsDefault} [fsImpl]
 */
export function copyFile(from, to, fsImpl = fsDefault) {
  fsImpl.copyFileSync(from, to);
}

/**
 * 写权限探测：在目录里建一个临时文件再删掉。
 *
 * 只用于「本工具自己的状态目录 / 临时目录 / App 的配置目录」，
 * 绝不在 ArtCraft 安装目录里写探测文件（安装目录只做只读探测）。
 * @param {string} dir
 * @param {typeof fsDefault} [fsImpl]
 * @returns {{ ok: boolean, dir: string, error: string|null, skipped?: boolean }}
 */
export function probeWritable(dir, fsImpl = fsDefault) {
  if (!dirExists(dir, fsImpl)) {
    return { ok: false, dir, error: '目录不存在', skipped: true };
  }
  const probe = `${dir}\\.artcraft-hanhua-write-probe-${process.pid}`;
  try {
    fsImpl.writeFileSync(probe, 'probe', { encoding: 'utf8' });
    fsImpl.unlinkSync(probe);
    return { ok: true, dir, error: null };
  } catch (err) {
    try {
      removeFileIfExists(probe, fsImpl);
    } catch {
      /* 清理失败不影响结论 */
    }
    return { ok: false, dir, error: err.message };
  }
}

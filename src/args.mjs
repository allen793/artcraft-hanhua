/**
 * 命令行参数解析（纯函数，便于单测）。
 */

import { EXIT } from './constants.mjs';

export const COMMANDS = ['detect', 'hanhua', 'revert', 'verify', 'doctor'];

/** 每个命令接受的选项（用于把「选项用错命令」也报成用法错误） */
const COMMAND_OPTIONS = {
  detect: ['root', 'json'],
  hanhua: ['root', 'only', 'dryRun', 'yes', 'json', 'requireMain', 'state'],
  revert: ['root', 'only', 'dryRun', 'yes', 'json', 'state'],
  verify: ['root', 'json'],
  doctor: ['json', 'root', 'state'],
  help: [],
  version: [],
};

/**
 * @param {string[]} argv 不含 node 与脚本路径
 * @returns {{
 *   ok: boolean,
 *   command: string|null,
 *   options: { root: string|null, only: string[]|null, dryRun: boolean, yes: boolean, json: boolean,
 *              requireMain: boolean, state: string|null, help: boolean, version: boolean },
 *   errors: string[],
 *   exitCode: number
 * }}
 */
export function parseArgs(argv) {
  const options = {
    root: null,
    only: null,
    dryRun: false,
    yes: false,
    json: false,
    requireMain: false,
    state: null,
    help: false,
    version: false,
  };
  const errors = [];
  let command = null;
  const used = new Set();

  const takeValue = (flag, inline, next) => {
    if (inline !== undefined) return inline;
    if (next === undefined) {
      errors.push(`选项 ${flag} 需要一个值`);
      return null;
    }
    return next;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith('-')) {
      if (command === null) {
        command = raw.toLowerCase();
      } else {
        errors.push(`多余的参数：${raw}`);
      }
      continue;
    }

    const eq = raw.indexOf('=');
    const flag = eq >= 0 ? raw.slice(0, eq) : raw;
    const inline = eq >= 0 ? raw.slice(eq + 1) : undefined;

    switch (flag) {
      case '--root': {
        const v = takeValue(flag, inline, argv[i + 1]);
        if (inline === undefined) i += 1;
        if (v !== null && v !== undefined) options.root = v;
        used.add('root');
        break;
      }
      case '--only': {
        const v = takeValue(flag, inline, argv[i + 1]);
        if (inline === undefined) i += 1;
        if (v !== null && v !== undefined) {
          const ids = String(v)
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          if (ids.length === 0) errors.push('选项 --only 至少需要一个目标 id');
          else options.only = ids;
        }
        used.add('only');
        break;
      }
      case '--state': {
        const v = takeValue(flag, inline, argv[i + 1]);
        if (inline === undefined) i += 1;
        if (v !== null && v !== undefined) options.state = v;
        used.add('state');
        break;
      }
      case '--dry-run':
      case '-n':
        options.dryRun = true;
        used.add('dryRun');
        break;
      case '--yes':
      case '-y':
        options.yes = true;
        used.add('yes');
        break;
      case '--json':
        options.json = true;
        used.add('json');
        break;
      case '--require-main':
        options.requireMain = true;
        used.add('requireMain');
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--version':
      case '-V':
        options.version = true;
        break;
      default:
        errors.push(`未知选项：${flag}`);
        break;
    }
  }

  if (command !== null && !COMMANDS.includes(command)) {
    if (command === 'help' || command === '--help') {
      command = null;
      options.help = true;
    } else if (command === 'version' || command === '--version') {
      command = null;
      options.version = true;
    } else {
      errors.push(`未知命令：${command}（可用命令：${COMMANDS.join(' / ')}）`);
      command = null;
    }
  }

  if (options.help || options.version) {
    // --help / --version 永远可用，不受命令与选项校验影响
    return { ok: true, command: null, options, errors: [], exitCode: EXIT.OK };
  }

  if (command === null && errors.length === 0) {
    errors.push(`缺少命令（可用命令：${COMMANDS.join(' / ')}）`);
  }

  if (command !== null) {
    const allowed = COMMAND_OPTIONS[command] ?? [];
    for (const name of used) {
      if (!allowed.includes(name)) {
        errors.push(`命令 ${command} 不支持选项 --${name === 'dryRun' ? 'dry-run' : name === 'requireMain' ? 'require-main' : name}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    command,
    options,
    errors,
    exitCode: errors.length === 0 ? EXIT.OK : EXIT.USAGE,
  };
}

/**
 * 把 `--only` 的原始 id 列表规范化：支持别名、大小写不敏感，并报告未知 id。
 * @param {string[]|null} only
 * @param {string[]} validIds
 * @param {Record<string,string>} aliases
 * @returns {{ ok: boolean, ids: string[]|null, unknown: string[] }}
 */
export function normalizeOnly(only, validIds, aliases = {}) {
  if (!only || only.length === 0) return { ok: true, ids: null, unknown: [] };
  const lower = new Map(validIds.map((id) => [id.toLowerCase(), id]));
  const resolved = [];
  const unknown = [];
  for (const rawId of only) {
    const key = rawId.trim().toLowerCase();
    const alias = aliases[key];
    const hit = alias ?? lower.get(key);
    if (hit) {
      if (!resolved.includes(hit)) resolved.push(hit);
    } else {
      unknown.push(rawId);
    }
  }
  return { ok: unknown.length === 0, ids: resolved, unknown };
}

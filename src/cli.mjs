/**
 * CLI 入口：解析参数 →（必要时）交互确认 → 执行命令 → 渲染输出 → 返回退出码。
 *
 * 这里只做「I/O 与流程」，业务逻辑都在 src/commands/ 里，且都能在不碰终端的情况下单测。
 */

import process from 'node:process';
import readline from 'node:readline';
import { EXIT, STATIC_TARGET_IDS, TARGET_ALIASES, TOOL_NAME, TOOL_VERSION } from './constants.mjs';
import { normalizeOnly, parseArgs } from './args.mjs';
import { createContext } from './context.mjs';
import { checkNodeVersion, getSystemLocale, isSupportedPlatform, unsupportedPlatformMessage } from './sysenv.mjs';
import {
  renderDetect,
  renderDoctor,
  renderFailure,
  renderHanhua,
  renderHelp,
  renderRevert,
  renderVerify,
  renderVersion,
} from './render.mjs';
import { runDetect } from './commands/detect.mjs';
import { runHanhua } from './commands/hanhua.mjs';
import { runRevert } from './commands/revert.mjs';
import { runVerify } from './commands/verify.mjs';
import { runDoctor } from './commands/doctor.mjs';

/** 需要写文件的命令（要确认） */
const WRITE_COMMANDS = new Set(['hanhua', 'revert']);

/**
 * 把「将要执行的改动」写成给人看的一行，用于交互确认。
 * @param {object} item hanhua 的 plan 或 revert 的 target
 * @param {string} command
 */
export function describeConfirmItem(item, command) {
  if (command === 'revert') {
    const file = item.configPath ?? item.patchedPath ?? '';
    return `${item.name}：检查备份并回滚${file ? `（${file}）` : ''}`;
  }
  switch (item.action) {
    case 'create':
      return `${item.name}：创建 ${item.filePath} 并写入 language = ${item.to}`;
    case 'change':
      return `${item.name}：把 language 从 ${JSON.stringify(item.from)} 改成 ${JSON.stringify(item.to)}（${item.filePath}）`;
    case 'unchanged':
      return `${item.name}：语言已是 ${item.to}，跳过`;
    case 'skip':
      return `${item.name}：跳过（${item.reason}）`;
    case 'error':
      return `${item.name}：无法处理（${item.reason}）`;
    case 'patch-main':
      return `${item.name}：主程序二进制补丁（尚未接入，本次不会改动 exe）`;
    default:
      return `${item.name}：${item.action}`;
  }
}

/**
 * 交互式确认。
 * @param {string[]} lines
 * @param {{ stdin: NodeJS.ReadStream, stdout: NodeJS.WriteStream }} io
 * @returns {Promise<boolean>}
 */
async function askConfirm(lines, io) {
  const rl = readline.createInterface({ input: io.stdin, output: io.stdout });
  try {
    const answer = await new Promise((resolve) => {
      rl.question(`${lines.join('\n')}\n\n确认执行？(y/N) `, resolve);
    });
    return /^(y|yes|是|确认)$/i.test(String(answer).trim());
  } finally {
    rl.close();
  }
}

/**
 * CLI 主函数。
 * @param {string[]} argv
 * @param {{
 *   stdout?: NodeJS.WriteStream, stderr?: NodeJS.WriteStream, stdin?: NodeJS.ReadStream,
 *   env?: Record<string,string|undefined>, fs?: object, platform?: string,
 *   registryReader?: object, exeVersionExec?: Function, systemLocale?: string, translationFile?: string,
 * }} [deps]
 * @returns {Promise<number>} 退出码
 */
export async function main(argv, deps = {}) {
  const stdout = deps.stdout ?? process.stdout;
  const stderr = deps.stderr ?? process.stderr;
  const stdin = deps.stdin ?? process.stdin;

  const parsed = parseArgs(argv);

  if (parsed.options.version) {
    stdout.write(`${renderVersion()}\n`);
    return EXIT.OK;
  }
  if (parsed.options.help || argv.length === 0) {
    stdout.write(`${renderHelp()}\n`);
    return argv.length === 0 && !parsed.options.help ? EXIT.USAGE : EXIT.OK;
  }
  if (!parsed.ok) {
    stderr.write(`${parsed.errors.map((e) => `错误：${e}`).join('\n')}\n\n${renderHelp()}\n`);
    return parsed.exitCode;
  }

  const node = checkNodeVersion();
  if (!node.ok) {
    stderr.write(
      `错误：${TOOL_NAME} 需要 Node.js >= ${node.required}，当前是 v${process.versions.node}。\n` +
        'Error: this tool requires Node.js >= ' +
        `${node.required}. Please upgrade Node.js.\n`,
    );
    return EXIT.FAILURE;
  }

  const command = parsed.command;
  const ctx = createContext(parsed.options, deps);
  const systemLocale = deps.systemLocale ?? getSystemLocale();
  const label = `${TOOL_NAME} v${TOOL_VERSION}`;

  if (!isSupportedPlatform(ctx.platform) && command !== 'doctor') {
    stderr.write(`错误：${unsupportedPlatformMessage(ctx.platform)}\n`);
    return EXIT.UNSUPPORTED_PLATFORM;
  }

  if (!parsed.options.json) {
    ctx.log = (message) => stdout.write(`  · ${message}\n`);
  }

  // `--only` 先按静态 id 全集校验：这样即使当前不是交互式终端，
  // 也能先给出「未知目标」这种更有用的报错，而不是先抱怨缺少 --yes。
  if (parsed.options.only && WRITE_COMMANDS.has(command)) {
    const selection = normalizeOnly(parsed.options.only, STATIC_TARGET_IDS, TARGET_ALIASES);
    if (!selection.ok) {
      stderr.write(
        `错误：--only 里出现了未知目标：${selection.unknown.join(', ')}\n` +
          `可用目标：${STATIC_TARGET_IDS.join(', ')}（别名：main / launcher）\n`,
      );
      return EXIT.USAGE;
    }
  }

  // 交互确认策略：
  // - dry-run 不写盘 → 不问
  // - --yes → 不问
  // - 交互式终端且非 --json → 问
  // - 非交互环境且没加 --yes → 直接报错（避免脚本里静默改文件）
  let confirm = null;
  if (WRITE_COMMANDS.has(command) && !parsed.options.dryRun && !parsed.options.yes) {
    if (parsed.options.json) {
      stderr.write('错误：--json 模式下必须加 --yes（JSON 输出不能插入交互提问）。\n');
      return EXIT.USAGE;
    }
    if (!stdin.isTTY || !stdout.isTTY) {
      stderr.write(
        '错误：当前不是交互式终端，请加 --yes 明确确认执行，或先用 --dry-run 预览。\n' +
          'Error: not a TTY. Re-run with --yes to confirm, or use --dry-run first.\n',
      );
      return EXIT.USAGE;
    }
    confirm = async (items) =>
      askConfirm(items.map((item) => `  - ${describeConfirmItem(item, command)}`), { stdin, stdout });
  }

  let result;
  try {
    switch (command) {
      case 'detect':
        result = runDetect(ctx, { systemLocale, translationFile: deps.translationFile });
        break;
      case 'hanhua':
        result = await runHanhua(ctx, { confirm, systemLocale });
        break;
      case 'revert':
        result = await runRevert(ctx, { confirm });
        break;
      case 'verify':
        result = runVerify(ctx, { systemLocale, translationFile: deps.translationFile });
        break;
      case 'doctor':
        result = runDoctor(ctx, { systemLocale, translationFile: deps.translationFile });
        break;
      default:
        stderr.write(`错误：未知命令 ${command}\n`);
        return EXIT.USAGE;
    }
  } catch (err) {
    stderr.write(`错误：${label} 执行 ${command} 时发生异常：${err.message}\n`);
    if (!parsed.options.json && err.stack) stderr.write(`${err.stack}\n`);
    return EXIT.FAILURE;
  }

  if (parsed.options.json) {
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.exitCode ?? EXIT.OK;
  }

  switch (command) {
    case 'detect':
      stdout.write(`${result.ok ? renderDetect(result) : renderFailure('detect', result)}\n`);
      break;
    case 'hanhua':
      stdout.write(
        `${result.results?.length ? renderHanhua(result) : renderFailure('hanhua', result)}\n`,
      );
      break;
    case 'revert':
      stdout.write(
        `${result.results?.length ? renderRevert(result) : renderFailure('revert', result)}\n`,
      );
      break;
    case 'verify':
      stdout.write(`${result.ok || result.targets?.length ? renderVerify(result) : renderFailure('verify', result)}\n`);
      break;
    case 'doctor':
      stdout.write(`${renderDoctor(result)}\n`);
      break;
    default:
      break;
  }

  return result.exitCode ?? EXIT.OK;
}

export default main;

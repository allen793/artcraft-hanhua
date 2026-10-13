/**
 * 人类可读输出（中文为主，关键术语保留英文）。
 *
 * 命令本身只返回结构化结果，渲染放在这里：这样 `--json` 与「给人看」的输出
 * 走同一份数据，不会出现两边说法不一致的情况。
 */

import { LANGUAGE_STATE, LANGUAGE_STATE_LABEL, STATUS_LABEL, SUPPORT_LEVEL, TARGET_KIND } from './constants.mjs';
import { TOOL_NAME, TOOL_VERSION } from './constants.mjs';

/** 东亚宽字符按 2 列计算，保证表格对齐 */
function displayWidth(text) {
  let w = 0;
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x1f300 && code <= 0x1faff);
    w += wide ? 2 : 1;
  }
  return w;
}

function padEndDisplay(text, width) {
  const pad = width - displayWidth(text);
  return pad > 0 ? `${text}${' '.repeat(pad)}` : String(text);
}

function table(headers, rows) {
  const widths = headers.map((h, i) => Math.max(displayWidth(h), ...rows.map((r) => displayWidth(r[i] ?? ''))));
  const head = headers.map((h, i) => padEndDisplay(h, widths[i])).join('  ').trimEnd();
  const sep = widths.map((w) => '-'.repeat(w)).join('  ');
  const body = rows.map((r) => r.map((c, i) => padEndDisplay(c ?? '', widths[i])).join('  ').trimEnd());
  return [head, sep, ...body];
}

/** 支持的档次 → 简短标记 */
function supportBadge(target) {
  switch (target.supportLevel) {
    case SUPPORT_LEVEL.OK:
      return '可汉化';
    case SUPPORT_LEVEL.DEFECT:
      return '可汉化*';
    case SUPPORT_LEVEL.EXPERIMENTAL:
      return '实验性';
    case SUPPORT_LEVEL.NATIVE:
      return '原生中文';
    case SUPPORT_LEVEL.NONE:
      return '不支持';
    default:
      return target.hanhuaAble ? '可汉化' : '不支持';
  }
}

function header(result, lines) {
  lines.push(`${TOOL_NAME} v${TOOL_VERSION} —— ArtCraft 套件简体中文本地化工具`);
  if (result.install?.root) {
    const version = result.install.version ? `，版本 ${result.install.version}` : '';
    lines.push(`安装目录：${result.install.root}（来源：${result.install.sourceLabel}${version}）`);
  }
  if (result.systemLocale) lines.push(`系统区域：${result.systemLocale}`);
  lines.push('');
}

/** detect */
export function renderDetect(result) {
  const lines = [];
  if (!result.ok) {
    lines.push(`${TOOL_NAME} v${TOOL_VERSION}`);
    lines.push('');
    for (const err of result.errors) lines.push(`错误：${err}`);
    return lines.join('\n');
  }

  header(result, lines);
  const rows = result.targets.map((t) => [
    t.name,
    t.group === 'main' ? '主程序' : t.group === 'launcher' ? 'Launcher' : 'Craft App',
    supportBadge(t),
    t.languageStateLabel,
    t.exeVersion ? `${t.exePath} (${t.exeVersion})` : t.configPath ?? t.exePath ?? '',
  ]);
  lines.push(...table(['程序', '类别', '能否汉化', '当前语言', '路径'], rows));
  lines.push('');

  const defect = result.targets.filter((t) => t.defect);
  if (defect.length > 0) {
    lines.push('已知上游缺陷（本工具无法修复）：');
    for (const t of defect) lines.push(`  - ${t.name}：${t.defect}`);
    lines.push('');
  }

  const pending = result.targets.filter((t) => t.kind === TARGET_KIND.BINARY_PATCH);
  for (const t of pending) {
    lines.push(`主程序：${t.patch?.reason ?? '未知'}${t.patchedExists ? '；已存在补丁产物' : ''}`);
  }
  if (pending.length > 0) lines.push('');

  const s = result.summary;
  lines.push(
    `汇总：共 ${s.total} 项（已安装 ${s.installed}）；可汉化配置项 ${s.configTargets}；已是中文 ${s.alreadyZh}；待改动 ${s.needChange}；` +
      `上游无中文 ${s.unsupported}；跟随系统 ${s.systemLocale}`,
  );
  if (result.translations) {
    const t = result.translations;
    lines.push(
      `翻译数据：${t.ok ? `${t.count} 条` : `不可用（${t.errors.join('；')}）`}${
        t.ok
          ? `（英文精确去重 ${t.distinctEnglish}；忽略大小写重名 ${t.caseInsensitiveCollisions} 组；首尾带空格 ${t.paddedEnglish} 条）`
          : ''
      }`,
    );
  }
  lines.push('');
  lines.push('下一步：`hanhua --dry-run` 预览 → `hanhua --yes` 执行 → 需要时 `revert --yes` 回滚。');
  return lines.join('\n');
}

function renderTargetResults(result, { title }) {
  const lines = [];
  lines.push(`${TOOL_NAME} v${TOOL_VERSION} —— ${title}${result.dryRun ? '（dry-run，不写入任何文件）' : ''}`);
  if (result.install?.root) {
    const version = result.install.version ? `，版本 ${result.install.version}` : '';
    lines.push(`安装目录：${result.install.root}（来源：${result.install.sourceLabel}${version}）`);
  }
  lines.push('');

  for (const r of result.results) {
    const label = STATUS_LABEL[r.status] ?? r.status;
    lines.push(`[${padEndDisplay(label, 10)}] ${r.name}`);
    if (r.message) lines.push(`  ${r.message}`);
    for (const f of r.files ?? []) {
      if (f.path) lines.push(`  文件：${f.path}`);
      if (f.backupPath) lines.push(`  备份：${f.backupPath}`);
      if (f.markerPath) lines.push(`  标记：${f.markerPath}`);
      if (f.from !== undefined && f.to !== undefined && f.from !== f.to) {
        lines.push(`  语言：${JSON.stringify(f.from)} → ${JSON.stringify(f.to)}`);
      }
      if (f.sha256) lines.push(`  SHA-256：${f.sha256}`);
    }
    for (const n of r.notes ?? []) lines.push(`  说明：${n}`);
  }

  const s = result.summary;
  lines.push('');
  lines.push(
    [
      `完成 ${s.done}`,
      `无需改动 ${s.noop}`,
      `跳过 ${s.skipped}`,
      s.pending ? `待接入 ${s.pending}` : null,
      s.failed ? `失败 ${s.failed}` : null,
      s.wouldChange || s.wouldCreate ? `将改动 ${s.wouldChange + s.wouldCreate}` : null,
      s.reverted ? `已回滚 ${s.reverted}` : null,
    ]
      .filter(Boolean)
      .join(' ｜ '),
  );
  for (const n of result.notes ?? []) lines.push(`说明：${n}`);
  for (const e of result.errors ?? []) lines.push(`错误：${e}`);
  return lines.join('\n');
}

export function renderHanhua(result) {
  return renderTargetResults(result, { title: '一键汉化' });
}

export function renderRevert(result) {
  return renderTargetResults(result, { title: '一键回滚' });
}

/** verify */
export function renderVerify(result) {
  const lines = [];
  if (!result.ok && result.targets.length === 0) {
    lines.push(`${TOOL_NAME} v${TOOL_VERSION}`);
    lines.push('');
    for (const err of result.errors) lines.push(`错误：${err}`);
    return lines.join('\n');
  }

  header(result, lines);
  const fmt = (value) => (value === null || value === undefined ? '—' : JSON.stringify(value));
  const rows = result.targets.map((t) => {
    const primary = t.files[0];
    const backup = primary ? (primary.backupExists ? '有' : '无') : '—';
    return [
      t.name,
      primary ? (primary.exists ? '有' : '无') : t.exeExists ? '有（exe）' : '—',
      backup,
      primary ? fmt(primary.currentLanguage) : '—',
      t.verified === true ? '通过' : t.verified === false ? '未汉化' : '—',
      t.verdict,
    ];
  });
  lines.push(...table(['程序', '原件', '备份', '当前语言', '校验', '说明'], rows));
  lines.push('');

  const main = result.targets.find((t) => t.kind === TARGET_KIND.BINARY_PATCH);
  if (main) {
    lines.push(`主程序 exe：${main.exePath}`);
    lines.push(`  SHA-256：${main.exeSha256 ?? '（不存在或读取失败）'}`);
    if (main.patchedPath) lines.push(`  补丁产物：${main.patchedPath}（${main.patchedExists ? '存在' : '不存在'}）`);
    if (main.patch) lines.push(`  补丁支持：${main.patch.reason}`);
    lines.push('');
  }

  if (result.translations) {
    const t = result.translations;
    lines.push(`翻译数据：${t.file}`);
    lines.push(`  条数：${t.count}（期望 ${t.expectedCount}）；SHA-256：${t.sha256 ?? '—'}；冲突：${t.conflicts}`);
    lines.push('');
  }

  const s = result.summary;
  lines.push(
    `汇总：配置项已汉化 ${s.localized}；未汉化 ${s.notLocalized}；有备份 ${s.backupsPresent}；有创建标记 ${s.markersPresent}`,
  );
  for (const e of result.errors ?? []) lines.push(`错误：${e}`);
  return lines.join('\n');
}

/** doctor */
export function renderDoctor(result) {
  const lines = [`${TOOL_NAME} v${TOOL_VERSION} —— 环境自检`, ''];
  const badge = { ok: '[ OK ]', warn: '[警告]', fail: '[失败]', info: '[信息]' };
  for (const c of result.checks) {
    lines.push(`${badge[c.status] ?? '[信息]'} ${c.label}`);
    if (c.detail) {
      for (const part of String(c.detail).split('\n')) lines.push(`        ${part}`);
    }
  }
  lines.push('');
  const s = result.summary;
  lines.push(`汇总：${s.total} 项检查 ｜ 通过 ${s.ok} ｜ 警告 ${s.warn} ｜ 失败 ${s.fail}`);
  return lines.join('\n');
}

/** 通用失败输出 */
export function renderFailure(command, result) {
  const lines = [`${TOOL_NAME} v${TOOL_VERSION}`];
  if (command) lines.push(`命令：${command}`);
  lines.push('');
  for (const err of result.errors ?? []) lines.push(`错误：${err}`);
  if (result.install?.candidates?.length) {
    lines.push('');
    lines.push('已检查过这些位置：');
    for (const c of result.install.candidates) {
      lines.push(`  - ${c.dir}（${c.sourceLabel}，${c.exists ? '存在' : '不存在'}）`);
    }
  }
  return lines.join('\n');
}

/** --help */
export function renderHelp() {
  return [
    `${TOOL_NAME} v${TOOL_VERSION} —— ArtCraft 套件简体中文本地化工具（Windows，Node.js 零依赖）`,
    '',
    '用法：',
    `  ${TOOL_NAME} <命令> [选项]`,
    '',
    '命令：',
    '  detect    列出本机找到的 ArtCraft 组件、路径、版本、能否汉化、当前语言状态',
    '  hanhua    一键汉化（语言配置类直接改写；主程序二进制补丁待接入）',
    '  revert    一键回滚（用备份还原；本工具创建的文件会被删除）',
    '  verify    校验：原件/备份是否存在、当前语言值、主程序 exe 的 SHA-256',
    '  doctor    环境自检：Node 版本、平台、注册表、安装、写权限、临时目录',
    '',
    '选项：',
    '  --root <dir>        手动指定 ArtCraft 安装目录（默认：注册表 → 常见位置兜底）',
    '  --only <id,id>      只处理指定目标（可用别名：main、launcher）',
    '  --dry-run           只报告将要做的改动，不写入任何文件',
    '  --yes, -y           跳过交互确认（非交互环境必须加）',
    '  --require-main      要求主程序补丁必须成功，否则退出码为 1',
    '  --state <file>      指定变更日志路径（默认 %LOCALAPPDATA%\\artcraft-hanhua\\state.json）',
    '  --json              输出机器可读的 JSON',
    '  --help, -h          显示本帮助',
    '  --version, -V       显示版本',
    '',
    '说明：',
    '  - 写任何配置文件前都会先备份为 <文件名>.bak-before-hanhua（已存在则不覆盖）',
    '  - 配置文件一律写成**无 BOM 的 UTF-8**（带 BOM 会让程序忽略语言设置）',
    '  - 上游不支持中文的程序（CADCraft / DeckCraft / SoundCraft）不会被乱写',
    '  - 跟随系统区域的程序（WordCraft 等 6 个）不会凭空创建配置文件',
    '',
    '示例：',
    `  node bin/artcraft-hanhua.mjs detect`,
    `  node bin/artcraft-hanhua.mjs hanhua --dry-run`,
    `  node bin/artcraft-hanhua.mjs hanhua --yes --only designcraft,lightcraft,effectcraft,launcher`,
    `  node bin/artcraft-hanhua.mjs revert --yes`,
  ].join('\n');
}

export function renderVersion() {
  return `${TOOL_NAME} v${TOOL_VERSION}（Node ${process.versions.node}，${process.platform}）`;
}

/** 语言状态文案（供测试与外部引用） */
export const LANGUAGE_LABELS = LANGUAGE_STATE_LABEL;
export { LANGUAGE_STATE, displayWidth, padEndDisplay, table };

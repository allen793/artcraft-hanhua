/**
 * `doctor` 命令：环境自检。
 *
 * 检查项：Node 版本、平台、注册表可读性、找到的安装、写权限、临时目录可用性、
 * 翻译数据、PowerShell（读 exe 版本要用）、主程序补丁支持情况。
 *
 * 只读原则：**不会**在 ArtCraft 安装目录里写探测文件（安装目录只做只读探测）；
 * 写权限探测只在本工具自己的状态目录、临时目录和已存在的 App 配置目录里做，且写完立刻删除。
 */

import path from 'node:path';
import os from 'node:os';
import { EXIT, MIN_NODE_MAJOR, SUITE_APP_IDS, TARGET_KIND } from '../constants.mjs';
import { checkNodeVersion, checkTempDir, getSystemLocale, isSupportedPlatform, unsupportedPlatformMessage, probeWritable } from '../sysenv.mjs';
import { dirExists, ensureDir, fileExists } from '../fsutil.mjs';
import { loadTranslations } from '../translations.mjs';
import { readExeVersions } from '../artcraft-patch.mjs';
import { resolveAndInspect } from '../context.mjs';
import { REGISTRY_CANDIDATES } from '../registry.mjs';

/** 拼一个检查项 */
function check(id, label, status, detail) {
  return { id, label, status, detail };
}

/**
 * 执行 doctor。
 * @param {object} ctx
 * @param {{ systemLocale?: string, translationFile?: string }} [deps]
 */
export function runDoctor(ctx, { systemLocale = getSystemLocale(), translationFile = undefined } = {}) {
  const checks = [];
  const { env, fs } = ctx;

  // 1) 平台
  const win = isSupportedPlatform(ctx.platform);
  checks.push(
    check(
      'platform',
      '平台',
      win ? 'ok' : 'fail',
      win ? `Windows（${ctx.platform}）` : unsupportedPlatformMessage(ctx.platform),
    ),
  );

  // 2) Node 版本
  const node = checkNodeVersion(process.versions.node);
  checks.push(
    check(
      'node',
      'Node 版本',
      node.ok ? 'ok' : 'fail',
      `v${process.versions.node}（要求 >= ${MIN_NODE_MAJOR}）`,
    ),
  );

  // 3) 运行信息
  checks.push(
    check('runtime', '运行时', 'info', `execPath=${process.execPath}；cwd=${process.cwd()}；arch=${process.arch}`),
  );
  checks.push(check('locale', '系统区域', 'info', systemLocale));

  // 4) 注册表可读性（逐个候选；同一个物理键可能被 32/64 位视图重复命中，这里去重）
  const registryHits = [];
  const registryErrors = [];
  const seenKeyPaths = new Set();
  for (const candidate of REGISTRY_CANDIDATES) {
    const res = ctx.registryReader.query(candidate);
    if (res.ok) {
      registryHits.push({ candidate, res });
      if (seenKeyPaths.has(res.keyPath)) continue;
      seenKeyPaths.add(res.keyPath);
      checks.push(
        check(
          `registry:${candidate.id}`,
          `注册表 ${res.keyPath}`,
          'ok',
          `可读，共 ${Object.keys(res.values).length} 个值${res.values.InstallLocation ? `；InstallLocation=${res.values.InstallLocation.value}` : ''}`,
        ),
      );
    } else if (res.missing) {
      if (seenKeyPaths.has(res.keyPath)) continue;
      seenKeyPaths.add(res.keyPath);
      checks.push(
        check(
          `registry:${candidate.id}`,
          `注册表 ${res.keyPath}`,
          'info',
          `没有这个键（正常）${res.rawError ? `；reg.exe 输出：${res.rawError}` : ''}`,
        ),
      );
    } else {
      registryErrors.push(res.error);
      checks.push(check(`registry:${candidate.id}`, `注册表 ${res.keyPath}`, 'warn', res.error ?? '读取失败'));
    }
  }
  checks.push(
    check(
      'registry',
      '注册表可读性',
      registryErrors.length === REGISTRY_CANDIDATES.length ? 'fail' : 'ok',
      registryHits.length > 0
        ? `找到一个 ArtCraft 卸载项：${registryHits[0].res.keyPath}`
        : '没有找到 ArtCraft 卸载项（可能装在便携目录，可用 --root 指定）',
    ),
  );

  // 5) 安装发现 + 目标清单
  const { install, targets } = resolveAndInspect(ctx);
  const appExes = targets.filter((t) => t.group === 'app' && t.exeExists).map((t) => t.id);
  const missingApps = SUITE_APP_IDS.filter((id) => !appExes.includes(id));

  checks.push(
    check(
      'install',
      '安装位置',
      install.ok ? 'ok' : 'fail',
      install.ok
        ? `${install.root}（来源：${install.sourceLabel}${install.version ? `，版本 ${install.version}` : ''}）`
        : install.error,
    ),
  );
  if (install.ok) {
    checks.push(
      check(
        'install-layout',
        '安装目录布局',
        fileExists(path.join(install.root, 'artcraft.exe'), fs) ? 'ok' : 'warn',
        [
          `artcraft.exe=${fileExists(path.join(install.root, 'artcraft.exe'), fs) ? '有' : '无'}`,
          `launcher=${dirExists(path.join(install.root, 'launcher'), fs) ? '有' : '无'}`,
          `apps=${dirExists(path.join(install.root, 'apps'), fs) ? '有' : '无'}`,
          `找到 ${appExes.length}/${SUITE_APP_IDS.length} 个 Craft App 可执行文件`,
        ].join('；'),
      ),
    );
    if (missingApps.length > 0) {
      checks.push(check('install-apps-missing', '未找到的 Craft App', 'info', missingApps.join(', ')));
    }
    // 注意：不在这里写探测文件，安装目录只做只读探测
    checks.push(
      check(
        'install-writable',
        '安装目录写权限',
        'info',
        '为避免改动安装目录，未做写入探测；主程序打补丁需要该目录的写权限（通常需要管理员）',
      ),
    );
  }

  // 6) 写权限（状态目录 / 临时目录 / 已存在的 App 配置目录）
  const stateDirPath = path.dirname(ctx.statePath);
  // 状态目录是本工具自己的，可以先建出来再探测（saveState 也会建）
  try {
    ensureDir(stateDirPath, fs);
  } catch {
    /* 建不出来时下面的探测会给出失败原因 */
  }
  const stateProbe = probeWritable(stateDirPath, fs);
  checks.push(
    check(
      'write:state',
      '写权限（本工具状态目录）',
      stateProbe.ok ? 'ok' : 'fail',
      stateProbe.ok ? `${stateDirPath} 可写` : `${stateDirPath}：${stateProbe.error}`,
    ),
  );

  const configDirs = [
    ...new Set(
      targets
        .flatMap((t) => t.configPaths ?? [])
        .map((p) => path.dirname(p))
        .filter((d) => dirExists(d, fs)),
    ),
  ];
  for (const dir of configDirs) {
    const probe = probeWritable(dir, fs);
    checks.push(
      check(
        `write:${dir}`,
        `写权限（App 配置目录）`,
        probe.ok ? 'ok' : 'fail',
        probe.ok ? `${dir} 可写` : `${dir}：${probe.error}`,
      ),
    );
  }
  if (configDirs.length === 0) {
    checks.push(check('write:config', '写权限（App 配置目录）', 'warn', '还没有任何 App 配置目录（先启动一次对应程序）'));
  }

  // 7) 临时目录
  const temp = checkTempDir({ fs });
  checks.push(
    check(
      'temp',
      '临时目录',
      temp.ok ? 'ok' : 'fail',
      temp.ok ? `${temp.dir} 可读写` : `${temp.dir}：${temp.error}`,
    ),
  );

  // 8) 翻译数据
  const translations = loadTranslations(
    translationFile ? { file: translationFile, fs } : { fs },
  );
  checks.push(
    check(
      'translations',
      '翻译数据',
      translations.ok ? 'ok' : 'fail',
      translations.ok
        ? `${translations.file}：${translations.count} 条（英文精确去重 ${translations.distinctEnglish}；忽略大小写重名 ${translations.caseInsensitiveCollisions?.length ?? 0} 组；首尾带空格 ${translations.paddedEnglish ?? 0} 条）`
        : `${translations.file}：${translations.errors.join('；')}`,
    ),
  );

  // 9) PowerShell（读 exe 版本要用）
  const mainTarget = targets.find((t) => t.kind === TARGET_KIND.BINARY_PATCH);
  const versionProbe = readExeVersions({
    paths: mainTarget?.exePath ? [mainTarget.exePath] : [],
    exec: ctx.exeVersionExec,
  });
  const psOk = versionProbe.ok;
  const mainExePath = mainTarget?.exePath ?? null;
  checks.push(
    check(
      'powershell',
      'PowerShell（读 exe 版本）',
      psOk ? 'ok' : mainTarget?.exeExists === false ? 'info' : 'warn',
      psOk
        ? `可用；主程序版本=${versionProbe.byPath[String(mainExePath).toLowerCase()] ?? '未知'}`
        : `${versionProbe.error}（读不到版本时主程序会被判为不可打补丁）`,
    ),
  );
  if (mainTarget) {
    checks.push(
      check(
        'main-patch',
        '主程序补丁支持',
        mainTarget.patch?.supported ? 'ok' : 'warn',
        mainTarget.patch?.reason ?? '未知',
      ),
    );
  }

  const failed = checks.filter((c) => c.status === 'fail');
  const warned = checks.filter((c) => c.status === 'warn');

  return {
    ok: failed.length === 0,
    command: 'doctor',
    exitCode: failed.length === 0 ? EXIT.OK : EXIT.FAILURE,
    env: {
      platform: ctx.platform,
      node: process.versions.node,
      cwd: process.cwd(),
      execPath: process.execPath,
      tmpdir: os.tmpdir(),
      systemLocale,
      statePath: ctx.statePath,
    },
    install: install.ok
      ? { root: install.root, source: install.source, sourceLabel: install.sourceLabel, version: install.version }
      : null,
    checks,
    summary: { total: checks.length, ok: checks.length - failed.length - warned.length, warn: warned.length, fail: failed.length },
    errors: failed.map((c) => `${c.label}：${c.detail}`),
  };
}

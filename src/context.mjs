/**
 * 命令上下文：把「可注入的依赖」集中到一处，方便单测替换。
 *
 * 可注入项：env（环境变量）、fs（文件系统）、registryReader（注册表读取）、
 * exeVersionExec（读 exe 版本的外部调用）、platform。
 */

import fsDefault from 'node:fs';
import { createRegistryReader } from './registry.mjs';
import { defaultPowerShellExec } from './artcraft-patch.mjs';
import { defaultStatePath } from './state.mjs';
import { resolveInstall } from './locate.mjs';
import { buildTargets } from './targets.mjs';
import { inspectAll } from './inspect.mjs';

/**
 * 创建命令上下文。
 * @param {object} options 解析后的命令行选项
 * @param {{
 *   env?: Record<string,string|undefined>, fs?: typeof fsDefault, platform?: string,
 *   registryReader?: object, exeVersionExec?: Function, log?: (msg: string) => void,
 * }} [deps]
 */
export function createContext(options, deps = {}) {
  const env = deps.env ?? process.env;
  const fs = deps.fs ?? fsDefault;
  return {
    options,
    env,
    fs,
    platform: deps.platform ?? process.platform,
    registryReader: deps.registryReader ?? createRegistryReader(),
    exeVersionExec: deps.exeVersionExec ?? defaultPowerShellExec,
    log: deps.log ?? (() => {}),
    statePath: options.state ?? defaultStatePath(env),
    install: null,
    targets: [],
  };
}

/**
 * 解析安装位置并构造目标清单（只读）。
 * @param {object} ctx
 * @param {{ withHashes?: boolean }} [opts]
 * @returns {{ install: object, targets: Array<object>, allTargets: Array<object>, inspected: object }}
 */
export function resolveAndInspect(ctx, { withHashes = false } = {}) {
  const install = resolveInstall({
    root: ctx.options.root,
    env: ctx.env,
    fs: ctx.fs,
    reader: ctx.registryReader,
  });
  const allTargets = install.ok ? buildTargets({ installRoot: install.root, env: ctx.env }) : [];
  const inspected = install.ok
    ? inspectAll({
        install,
        targets: allTargets,
        fs: ctx.fs,
        withHashes,
        exeVersionExec: ctx.exeVersionExec,
      })
    : { targets: [], exeVersions: {}, versionReadError: null };
  return { install, allTargets, targets: inspected.targets, inspected };
}

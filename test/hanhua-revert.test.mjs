import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runHanhua } from '../src/commands/hanhua.mjs';
import { runRevert } from '../src/commands/revert.mjs';
import { loadState } from '../src/state.mjs';
import { EXIT, TARGET_STATUS } from '../src/constants.mjs';
import {
  exists,
  hasBom,
  makeCtx,
  makeWorld,
  readText,
  snapshotTree,
  writeBytesDeep,
  writeFileDeep,
} from './helpers.mjs';

const designCraftPath = (world) => path.join(world.roaming, 'DesignCraft', 'ui.json');
const lightCraftPath = (world) => path.join(world.roaming, 'LightCraft', 'ui.json');
const effectCraftPath = (world) => path.join(world.roaming, 'EffectCraft', 'prefs.json');
const launcherRon = (world) => path.join(world.installRoot, 'launcher', 'ArtCraftLauncherData', 'app.ron');

const resultOf = (result, id) => result.results.find((r) => r.id === id);

test('hanhua --dry-run：一个字节都不写', async () => {
  const world = makeWorld();
  try {
    const before = snapshotTree(world.base);
    const ctx = makeCtx(world, { dryRun: true });
    const result = await runHanhua(ctx);
    assert.equal(result.exitCode, EXIT.OK);
    assert.equal(result.dryRun, true);
    assert.deepEqual(snapshotTree(world.base), before, 'dry-run 不应该写入任何文件');

    assert.equal(resultOf(result, 'designcraft').status, TARGET_STATUS.WOULD_CHANGE);
    assert.equal(resultOf(result, 'effectcraft').status, TARGET_STATUS.WOULD_CHANGE);
    assert.equal(resultOf(result, 'lightcraft').status, TARGET_STATUS.WOULD_CREATE);
    assert.equal(resultOf(result, 'artcraft-launcher').status, TARGET_STATUS.WOULD_CREATE);
    assert.equal(resultOf(result, 'artcraft').status, TARGET_STATUS.PENDING);
    assert.equal(resultOf(result, 'wordcraft').status, TARGET_STATUS.SKIPPED);
    assert.equal(resultOf(result, 'cadcraft').status, TARGET_STATUS.SKIPPED);
  } finally {
    world.cleanup();
  }
});

test('hanhua：写入语言配置、备份、标记、日志都正确', async () => {
  const world = makeWorld();
  try {
    const originalDesign = readText(designCraftPath(world));
    const originalEffect = readText(effectCraftPath(world));

    const result = await runHanhua(makeCtx(world), { confirm: async () => true });
    assert.equal(result.exitCode, EXIT.OK, result.errors.join('；'));

    // DesignCraft：只改 language 字段，其余字节不变
    const designText = readText(designCraftPath(world));
    assert.equal(designText, originalDesign.replace('"language": "",', '"language": "zh",'));
    assert.equal(hasBom(designCraftPath(world)), false, '写回必须是无 BOM 的 UTF-8');
    // 备份保留原始内容
    const designBackup = `${designCraftPath(world)}.bak-before-hanhua`;
    assert.equal(exists(designBackup), true);
    assert.equal(readText(designBackup), originalDesign);

    // EffectCraft：general.language
    const effectText = readText(effectCraftPath(world));
    assert.equal(effectText, originalEffect.replace('"language": "system"', '"language": "zh-hans"'));
    assert.equal(hasBom(effectCraftPath(world)), false);
    assert.equal(exists(`${effectCraftPath(world)}.bak-before-hanhua`), true);
    assert.match(effectText, /"undoLevels": 32/);

    // LightCraft：原本不存在 → 创建 + marker
    assert.equal(readText(lightCraftPath(world)), '{"language":"zh-hans"}');
    assert.equal(hasBom(lightCraftPath(world)), false);
    assert.equal(exists(`${lightCraftPath(world)}.hanhua-created`), true);
    assert.equal(resultOf(result, 'lightcraft').status, TARGET_STATUS.DONE);

    // Launcher：RON 文件创建
    assert.equal(readText(launcherRon(world)), '(language: "zh-CN")\n');
    assert.equal(exists(`${launcherRon(world)}.hanhua-created`), true);

    // 主程序：优雅降级为 pending，退出码仍为 0
    const main = resultOf(result, 'artcraft');
    assert.equal(main.status, TARGET_STATUS.PENDING);
    assert.match(main.message, /未实现/);

    // 不支持中文 / 跟随系统的 App 一个文件都不该被动
    assert.equal(resultOf(result, 'cadcraft').status, TARGET_STATUS.SKIPPED);
    assert.match(resultOf(result, 'cadcraft').message, /上游无中文/);
    assert.equal(resultOf(result, 'wordcraft').status, TARGET_STATUS.SKIPPED);
    assert.match(resultOf(result, 'wordcraft').message, /已随系统显示中文/);
    assert.equal(exists(path.join(world.roaming, 'WordCraft')), false, '不应凭空创建配置文件目录');

    // DeckCraft 的 ui.json 内容保持不变
    assert.equal(readText(path.join(world.roaming, 'DeckCraft', 'ui.json')), '{ "slides": [] }\n');

    // 变更日志
    const { state } = loadState(world.statePath);
    const entries = Object.values(state.entries);
    assert.equal(entries.length, 4);
    assert.equal(entries.filter((e) => e.action === 'created').length, 2);
    assert.equal(entries.filter((e) => e.action === 'modified').length, 2);
    assert.ok(entries.every((e) => typeof e.afterSha256 === 'string' && e.afterSha256.length === 64));
    assert.ok(entries.some((e) => e.beforeSha256));
  } finally {
    world.cleanup();
  }
});

test('hanhua → revert：还原内容、删除本工具创建的文件', async () => {
  const world = makeWorld();
  try {
    const originalDesign = readText(designCraftPath(world));
    const originalEffect = readText(effectCraftPath(world));

    await runHanhua(makeCtx(world), { confirm: async () => true });
    // 回滚前先确认确实被改过
    assert.notEqual(readText(designCraftPath(world)), originalDesign);

    const reverted = await runRevert(makeCtx(world), { confirm: async () => true });
    assert.equal(reverted.exitCode, EXIT.OK, reverted.errors.join('；'));

    // 被改写的文件 → 从备份还原，并通过哈希校验
    assert.equal(readText(designCraftPath(world)), originalDesign);
    assert.equal(readText(effectCraftPath(world)), originalEffect);
    const designResult = resultOf(reverted, 'designcraft');
    assert.equal(designResult.status, TARGET_STATUS.REVERTED);
    assert.equal(designResult.files[0].verified, true, '回滚后哈希应当与改前一致');

    // 本工具创建的文件 → 删除（而不是留一个空文件）
    assert.equal(exists(lightCraftPath(world)), false);
    assert.equal(exists(`${lightCraftPath(world)}.hanhua-created`), false);
    assert.equal(exists(launcherRon(world)), false);
    assert.equal(resultOf(reverted, 'lightcraft').status, TARGET_STATUS.REVERTED_CREATED);

    // 备份文件保留（下次 hanhua 复用它）
    assert.equal(exists(`${designCraftPath(world)}.bak-before-hanhua`), true);

    // 日志条目被清空
    const { state } = loadState(world.statePath);
    assert.equal(Object.keys(state.entries).length, 0);

    // 再汉化一次仍然可用，且再次回滚能回到同一份原始内容
    const again = await runHanhua(makeCtx(world), { confirm: async () => true });
    assert.equal(again.exitCode, EXIT.OK);
    assert.notEqual(readText(designCraftPath(world)), originalDesign);
    await runRevert(makeCtx(world), { confirm: async () => true });
    assert.equal(readText(designCraftPath(world)), originalDesign);
  } finally {
    world.cleanup();
  }
});

test('revert 在日志丢失时仍按备份与 marker 工作', async () => {
  const world = makeWorld();
  try {
    const originalDesign = readText(designCraftPath(world));
    await runHanhua(makeCtx(world), { confirm: async () => true });
    fs.rmSync(world.statePath, { force: true });

    const reverted = await runRevert(makeCtx(world), { confirm: async () => true });
    assert.equal(readText(designCraftPath(world)), originalDesign);
    assert.equal(exists(lightCraftPath(world)), false);
    assert.equal(resultOf(reverted, 'designcraft').files[0].verified, null, '没有日志时无法做哈希比对');
  } finally {
    world.cleanup();
  }
});

test('revert --dry-run：不写任何文件', async () => {
  const world = makeWorld();
  try {
    await runHanhua(makeCtx(world), { confirm: async () => true });
    const before = snapshotTree(world.base);
    const reverted = await runRevert(makeCtx(world, { dryRun: true }));
    assert.equal(reverted.dryRun, true);
    assert.deepEqual(snapshotTree(world.base), before);
    assert.equal(resultOf(reverted, 'designcraft').status, TARGET_STATUS.WOULD_CHANGE);
  } finally {
    world.cleanup();
  }
});

test('--require-main：主程序待接入时退出码为 1', async () => {
  const world = makeWorld();
  try {
    const result = await runHanhua(makeCtx(world, { requireMain: true }), { confirm: async () => true });
    assert.equal(result.exitCode, EXIT.FAILURE);
    assert.equal(resultOf(result, 'artcraft').status, TARGET_STATUS.PENDING);
    // 其余项目照常处理
    assert.equal(resultOf(result, 'designcraft').status, TARGET_STATUS.DONE);
  } finally {
    world.cleanup();
  }
});

test('--only：只处理指定目标（别名也支持）', async () => {
  const world = makeWorld();
  try {
    const result = await runHanhua(makeCtx(world, { only: ['DesignCraft', 'launcher'] }), {
      confirm: async () => true,
    });
    assert.equal(result.results.length, 2);
    assert.deepEqual(result.results.map((r) => r.id).sort(), ['artcraft-launcher', 'designcraft']);
    assert.match(readText(designCraftPath(world)), /"language": "zh"/);
    assert.equal(exists(lightCraftPath(world)), false, '--only 之外的目标不应被处理');
    assert.equal(exists(effectCraftPath(world)), true);
    assert.equal(readText(effectCraftPath(world)).includes('"language": "system"'), true);
  } finally {
    world.cleanup();
  }
});

test('--only 出现未知 id：用法错误，退出码 2', async () => {
  const world = makeWorld();
  try {
    const before = snapshotTree(world.base);
    const result = await runHanhua(makeCtx(world, { only: ['nope'] }));
    assert.equal(result.exitCode, EXIT.USAGE);
    assert.match(result.errors.join('；'), /未知目标：nope/);
    assert.deepEqual(snapshotTree(world.base), before);
  } finally {
    world.cleanup();
  }
});

test('原文件带 BOM 时：备份保留带 BOM 的原样，写回自动去掉 BOM', async () => {
  const world = makeWorld();
  try {
    const file = designCraftPath(world);
    writeBytesDeep(file, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{"language":"","a":1}\n', 'utf8')]));
    assert.equal(hasBom(file), true);

    const result = await runHanhua(makeCtx(world), { confirm: async () => true });
    assert.equal(hasBom(file), false, '写回后必须没有 BOM');
    assert.equal(readText(file), '{"language":"zh","a":1}\n');
    assert.equal(hasBom(`${file}.bak-before-hanhua`), true, '备份保留原始字节');
    assert.ok(resultOf(result, 'designcraft').notes.some((n) => n.includes('BOM')));
  } finally {
    world.cleanup();
  }
});

test('DesignCraft 配置文件不存在时：跳过并给出指引，不凭空创建', async () => {
  const world = makeWorld();
  try {
    fs.rmSync(designCraftPath(world));
    const result = await runHanhua(makeCtx(world, { only: ['designcraft'] }), { confirm: async () => true });
    const r = resultOf(result, 'designcraft');
    assert.equal(r.status, TARGET_STATUS.SKIPPED);
    assert.match(r.message, /先启动一次 DesignCraft/);
    assert.equal(exists(designCraftPath(world)), false);
  } finally {
    world.cleanup();
  }
});

test('语言已经是中文时：不写文件、不产生备份', async () => {
  const world = makeWorld();
  try {
    writeFileDeep(designCraftPath(world), '{\n  "language": "zh",\n  "a": 1\n}\n');
    const before = snapshotTree(world.base);
    const result = await runHanhua(makeCtx(world, { only: ['designcraft'] }), { confirm: async () => true });
    assert.equal(resultOf(result, 'designcraft').status, TARGET_STATUS.NOOP);
    assert.deepEqual(snapshotTree(world.base), before);
  } finally {
    world.cleanup();
  }
});

test('确认被拒绝时：什么都不写', async () => {
  const world = makeWorld();
  try {
    const before = snapshotTree(world.base);
    const result = await runHanhua(makeCtx(world), { confirm: async () => false });
    assert.equal(result.cancelled, true);
    assert.equal(result.exitCode, EXIT.FAILURE);
    assert.deepEqual(snapshotTree(world.base), before);
  } finally {
    world.cleanup();
  }
});

test('找不到安装时：返回清晰错误而不是抛异常', async () => {
  const world = makeWorld();
  try {
    const ctx = makeCtx(world, { root: path.join(world.base, 'missing-dir') });
    const result = await runHanhua(ctx);
    assert.equal(result.ok, false);
    assert.equal(result.exitCode, EXIT.FAILURE);
    assert.match(result.errors.join('；'), /指定的安装目录不存在/);
  } finally {
    world.cleanup();
  }
});

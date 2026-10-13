import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { main } from '../src/cli.mjs';
import { EXIT } from '../src/constants.mjs';
import {
  exists,
  fakeStreams,
  makeExeVersionExec,
  makeWorld,
  missingRegistryReader,
  readText,
  snapshotTree,
} from './helpers.mjs';

function deps(world, extra = {}) {
  return {
    env: world.env,
    platform: 'win32',
    registryReader: missingRegistryReader,
    exeVersionExec: makeExeVersionExec(),
    systemLocale: 'zh-CN',
    ...extra,
  };
}

test('cli：detect --json 输出可解析的 JSON', async () => {
  const world = makeWorld();
  try {
    const { stdout, stderr } = fakeStreams();
    const code = await main(['detect', '--json', '--root', world.installRoot], deps(world, { stdout, stderr }));
    assert.equal(code, EXIT.OK, stderr.text);
    const parsed = JSON.parse(stdout.text);
    assert.equal(parsed.command, 'detect');
    assert.equal(parsed.targets.length, 14);
  } finally {
    world.cleanup();
  }
});

test('cli：非交互环境执行 hanhua 而不加 --yes → 用法错误，不写文件', async () => {
  const world = makeWorld();
  try {
    const before = snapshotTree(world.base);
    const { stdout, stderr } = fakeStreams();
    stderr.isTTY = false;
    const code = await main(['hanhua', '--root', world.installRoot], deps(world, { stdout, stderr }));
    assert.equal(code, EXIT.USAGE);
    assert.match(stderr.text, /请加 --yes/);
    assert.match(stderr.text, /Error: not a TTY/);
    assert.deepEqual(snapshotTree(world.base), before);
  } finally {
    world.cleanup();
  }
});

test('cli：--json 模式下必须加 --yes', async () => {
  const world = makeWorld();
  try {
    const { stdout, stderr } = fakeStreams();
    const code = await main(['hanhua', '--json', '--root', world.installRoot], deps(world, { stdout, stderr }));
    assert.equal(code, EXIT.USAGE);
    assert.match(stderr.text, /--json 模式下必须加 --yes/);
  } finally {
    world.cleanup();
  }
});

test('cli：hanhua --yes 真正执行并打印中文报告', async () => {
  const world = makeWorld();
  try {
    const { stdout, stderr } = fakeStreams();
    const code = await main(['hanhua', '--yes', '--root', world.installRoot], deps(world, { stdout, stderr }));
    assert.equal(code, EXIT.OK, stderr.text);
    assert.match(stdout.text, /一键汉化/);
    assert.match(stdout.text, /完成 4/);
    assert.match(stdout.text, /待接入/);
    assert.equal(readText(path.join(world.roaming, 'DesignCraft', 'ui.json')).includes('"language": "zh"'), true);
  } finally {
    world.cleanup();
  }
});

test('cli：hanhua --dry-run 无须 --yes，且不写文件', async () => {
  const world = makeWorld();
  try {
    const before = snapshotTree(world.base);
    const { stdout, stderr } = fakeStreams();
    const code = await main(['hanhua', '--dry-run', '--root', world.installRoot], deps(world, { stdout, stderr }));
    assert.equal(code, EXIT.OK, stderr.text);
    assert.match(stdout.text, /dry-run/);
    assert.deepEqual(snapshotTree(world.base), before);
  } finally {
    world.cleanup();
  }
});

test('cli：revert --yes 回滚', async () => {
  const world = makeWorld();
  try {
    await main(['hanhua', '--yes', '--root', world.installRoot], deps(world));
    const { stdout, stderr } = fakeStreams();
    const code = await main(['revert', '--yes', '--root', world.installRoot], deps(world, { stdout, stderr }));
    assert.equal(code, EXIT.OK, stderr.text);
    assert.equal(exists(path.join(world.roaming, 'LightCraft', 'ui.json')), false);
    assert.match(stdout.text, /一键回滚/);
  } finally {
    world.cleanup();
  }
});

test('cli：verify 打印原件 / 备份 / 语言 / SHA-256', async () => {
  const world = makeWorld();
  try {
    const { stdout, stderr } = fakeStreams();
    const code = await main(['verify', '--root', world.installRoot], deps(world, { stdout, stderr }));
    assert.equal(code, EXIT.OK, stderr.text);
    assert.match(stdout.text, /SHA-256/);
    assert.match(stdout.text, /校验/);
  } finally {
    world.cleanup();
  }
});

test('cli：doctor 打印自检结果', async () => {
  const world = makeWorld();
  try {
    const { stdout, stderr } = fakeStreams();
    const code = await main(['doctor', '--root', world.installRoot], deps(world, { stdout, stderr }));
    assert.equal(code, EXIT.OK, stderr.text);
    assert.match(stdout.text, /环境自检/);
    assert.match(stdout.text, /Node 版本/);
  } finally {
    world.cleanup();
  }
});

test('cli：非 Windows 平台给出清晰的中英双语报错（退出码 3）', async () => {
  const world = makeWorld();
  try {
    for (const command of ['detect', 'hanhua', 'revert', 'verify']) {
      const { stdout, stderr } = fakeStreams();
      const code = await main([command, '--root', world.installRoot], deps(world, { stdout, stderr, platform: 'linux' }));
      assert.equal(code, EXIT.UNSUPPORTED_PLATFORM, command);
      assert.match(stderr.text, /只支持 Windows/);
      assert.match(stderr.text, /only supports Windows/);
    }
  } finally {
    world.cleanup();
  }
});

test('cli：doctor 在非 Windows 上仍能跑，并把平台判为失败', async () => {
  const world = makeWorld();
  try {
    const { stdout, stderr } = fakeStreams();
    const code = await main(['doctor', '--root', world.installRoot], deps(world, { stdout, stderr, platform: 'darwin' }));
    assert.equal(code, EXIT.FAILURE);
    assert.match(stdout.text, /只支持 Windows/);
  } finally {
    world.cleanup();
  }
});

test('cli：--only 未知目标在交互确认之前就报错', async () => {
  const world = makeWorld();
  try {
    const before = snapshotTree(world.base);
    const { stdout, stderr } = fakeStreams();
    const code = await main(['hanhua', '--only', 'nope'], deps(world, { stdout, stderr }));
    assert.equal(code, EXIT.USAGE);
    assert.match(stderr.text, /--only 里出现了未知目标：nope/);
    assert.doesNotMatch(stderr.text, /not a TTY/);
    assert.deepEqual(snapshotTree(world.base), before);
  } finally {
    world.cleanup();
  }
});

test('cli：--help / --version / 无参数 / 未知命令', async () => {
  const { stdout, stderr } = fakeStreams();

  const helpCode = await main(['--help'], { stdout, stderr });
  assert.equal(helpCode, EXIT.OK);
  assert.match(stdout.text, /用法：/);
  assert.match(stdout.text, /--dry-run/);

  const versionOut = fakeStreams();
  const versionCode = await main(['--version'], { stdout: versionOut.stdout, stderr: versionOut.stderr });
  assert.equal(versionCode, EXIT.OK);
  assert.match(versionOut.stdout.text, /artcraft-hanhua v\d+\.\d+\.\d+/);

  const none = fakeStreams();
  const noneCode = await main([], { stdout: none.stdout, stderr: none.stderr });
  assert.equal(noneCode, EXIT.USAGE);
  assert.match(none.stdout.text, /用法：/);

  const bad = fakeStreams();
  const badCode = await main(['nope'], { stdout: bad.stdout, stderr: bad.stderr });
  assert.equal(badCode, EXIT.USAGE);
  assert.match(bad.stderr.text, /未知命令：nope/);
});

test('cli：异常被兜住，不会把栈直接喷给用户（非 json 模式才打印栈）', async () => {
  const world = makeWorld();
  try {
    const { stdout, stderr } = fakeStreams();
    const code = await main(['detect', '--json', '--root', path.join(world.base, 'missing')], deps(world, { stdout, stderr }));
    assert.equal(code, EXIT.FAILURE);
    const parsed = JSON.parse(stdout.text);
    assert.equal(parsed.ok, false);
  } finally {
    world.cleanup();
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, normalizeOnly, COMMANDS } from '../src/args.mjs';
import { EXIT } from '../src/constants.mjs';

test('parseArgs：没有命令时报用法错误', () => {
  const r = parseArgs([]);
  assert.equal(r.ok, false);
  assert.equal(r.exitCode, EXIT.USAGE);
  assert.match(r.errors.join('\n'), /缺少命令/);
});

test('parseArgs：正常解析各选项', () => {
  const r = parseArgs([
    'hanhua',
    '--root',
    'H:\\ArtCraft',
    '--only',
    'designcraft, lightcraft',
    '--dry-run',
    '--yes',
    '--json',
    '--require-main',
    '--state',
    'C:\\tmp\\state.json',
  ]);
  assert.equal(r.ok, true, r.errors.join('；'));
  assert.equal(r.command, 'hanhua');
  assert.equal(r.options.root, 'H:\\ArtCraft');
  assert.deepEqual(r.options.only, ['designcraft', 'lightcraft']);
  assert.equal(r.options.dryRun, true);
  assert.equal(r.options.yes, true);
  assert.equal(r.options.json, true);
  assert.equal(r.options.requireMain, true);
  assert.equal(r.options.state, 'C:\\tmp\\state.json');
});

test('parseArgs：支持 --flag=value 写法', () => {
  const r = parseArgs(['detect', '--root=H:\\ArtCraft', '--json']);
  assert.equal(r.ok, true);
  assert.equal(r.options.root, 'H:\\ArtCraft');
  assert.equal(r.options.json, true);
});

test('parseArgs：未知选项与未知命令都报错', () => {
  const a = parseArgs(['detect', '--nope']);
  assert.equal(a.ok, false);
  assert.match(a.errors.join('\n'), /未知选项：--nope/);

  const b = parseArgs(['hanhuaa']);
  assert.equal(b.ok, false);
  assert.match(b.errors.join('\n'), /未知命令：hanhuaa/);
});

test('parseArgs：命令不支持的选项会被拒绝', () => {
  const r = parseArgs(['detect', '--dry-run']);
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /命令 detect 不支持选项 --dry-run/);
});

test('parseArgs：--only 至少要一个 id', () => {
  const r = parseArgs(['hanhua', '--only', ' , ']);
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /--only 至少需要一个目标 id/);
});

test('parseArgs：--root 缺值时报错', () => {
  const r = parseArgs(['detect', '--root']);
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /需要一个值/);
});

test('parseArgs：--help / --version 永远可用', () => {
  for (const argv of [['--help'], ['-h'], ['--version'], ['-V'], ['hanhua', '--help']]) {
    const r = parseArgs(argv);
    assert.equal(r.ok, true, argv.join(' '));
    assert.equal(r.exitCode, EXIT.OK);
  }
});

test('parseArgs：所有命令都能被解析', () => {
  for (const command of COMMANDS) {
    const argv = command === 'doctor' ? ['doctor'] : [command, '--root', 'X:\\Y'];
    const r = parseArgs(argv);
    assert.equal(r.ok, true, `${command}: ${r.errors.join('；')}`);
    assert.equal(r.command, command);
  }
});

test('normalizeOnly：支持别名与大小写', () => {
  const ids = ['artcraft', 'artcraft-launcher', 'designcraft'];
  const r = normalizeOnly(['MAIN', 'launcher', 'DesignCraft'], ids, {
    main: 'artcraft',
    launcher: 'artcraft-launcher',
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.ids, ['artcraft', 'artcraft-launcher', 'designcraft']);
});

test('normalizeOnly：未知 id 会报出来；空输入返回 null', () => {
  const unknown = normalizeOnly(['nope'], ['designcraft']);
  assert.equal(unknown.ok, false);
  assert.deepEqual(unknown.unknown, ['nope']);
  assert.equal(normalizeOnly(null, ['designcraft']).ids, null);
});

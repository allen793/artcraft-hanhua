import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  backupPathFor,
  createBackupIfMissing,
  createdMarkerPathFor,
  describeBackups,
  readCreatedMarker,
  removeCreatedMarker,
  restoreFromBackup,
  writeCreatedMarker,
} from '../src/backups.mjs';
import { BACKUP_SUFFIX, CREATED_MARKER_SUFFIX } from '../src/constants.mjs';
import { hasBom, readText, tmpdir, writeFileDeep } from './helpers.mjs';

test('备份 / 标记路径命名符合约定', () => {
  assert.equal(backupPathFor('C:\\a\\ui.json'), `C:\\a\\ui.json${BACKUP_SUFFIX}`);
  assert.equal(createdMarkerPathFor('C:\\a\\ui.json'), `C:\\a\\ui.json${CREATED_MARKER_SUFFIX}`);
});

test('createBackupIfMissing：首次创建备份，二次不覆盖', () => {
  const dir = tmpdir();
  try {
    const file = path.join(dir, 'ui.json');
    writeFileDeep(file, '{"language":""}');
    const first = createBackupIfMissing(file);
    assert.equal(first.ok, true);
    assert.equal(first.created, true);
    assert.equal(first.existedBefore, true);
    assert.equal(readText(first.backupPath), '{"language":""}');

    // 改掉原文件后再备份：备份内容必须保持第一次的原始内容
    writeFileDeep(file, '{"language":"zh"}');
    const second = createBackupIfMissing(file);
    assert.equal(second.created, false);
    assert.equal(readText(second.backupPath), '{"language":""}');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('createBackupIfMissing：原文件不存在时不建备份', () => {
  const dir = tmpdir();
  try {
    const res = createBackupIfMissing(path.join(dir, 'nope.json'));
    assert.equal(res.ok, true);
    assert.equal(res.created, false);
    assert.equal(res.existedBefore, false);
    assert.equal(fs.existsSync(res.backupPath), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('restoreFromBackup：还原内容；没有备份时报错', () => {
  const dir = tmpdir();
  try {
    const file = path.join(dir, 'prefs.json');
    writeFileDeep(file, '{"general":{"language":"system"}}');
    createBackupIfMissing(file);
    writeFileDeep(file, '{"general":{"language":"zh-hans"}}');
    const restored = restoreFromBackup(file);
    assert.equal(restored.ok, true);
    assert.equal(readText(file), '{"general":{"language":"system"}}');

    const missing = restoreFromBackup(path.join(dir, 'other.json'));
    assert.equal(missing.ok, false);
    assert.match(missing.error, /备份不存在/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('创建标记：写、读、删，并且标记文件本身也是无 BOM UTF-8', () => {
  const dir = tmpdir();
  try {
    const file = path.join(dir, 'ui.json');
    const written = writeCreatedMarker(file, { targetId: 'lightcraft' });
    assert.equal(written.ok, true);
    assert.equal(hasBom(written.markerPath), false);
    assert.match(readText(written.markerPath), /target: lightcraft/);

    const marker = readCreatedMarker(file);
    assert.equal(marker.exists, true);
    assert.equal(marker.targetId, 'lightcraft');

    assert.equal(removeCreatedMarker(file), true);
    assert.equal(readCreatedMarker(file).exists, false);
    assert.equal(removeCreatedMarker(file), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('describeBackups：一次报出原件 / 备份 / 标记三种状态', () => {
  const dir = tmpdir();
  try {
    const file = path.join(dir, 'ui.json');
    writeFileDeep(file, '{}');
    createBackupIfMissing(file);
    const [info] = describeBackups([file]);
    assert.equal(info.exists, true);
    assert.equal(info.backupExists, true);
    assert.equal(info.markerExists, false);

    const [missing] = describeBackups([path.join(dir, 'none.json')]);
    assert.equal(missing.exists, false);
    assert.equal(missing.backupExists, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

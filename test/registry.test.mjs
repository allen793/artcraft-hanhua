import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeConsoleText,
  expandEnvVars,
  isRegistryKeyMissing,
  normalizeInstallLocation,
  parseRegQueryOutput,
  createRegistryReader,
  readArtCraftRegistry,
} from '../src/registry.mjs';

// 本机实测拿到的真实输出（InstallLocation 带引号这一点很关键）
const REAL_OUTPUT = `
HKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ArtCraft
    MainBinaryName    REG_SZ    artcraft.exe
    DisplayName    REG_SZ    ArtCraft
    DisplayIcon    REG_SZ    "H:\\ArtCraft\\artcraft.exe"
    DisplayVersion    REG_SZ    0.41.0
    Publisher    REG_SZ    artcraft
    InstallLocation    REG_SZ    "H:\\ArtCraft"
    UninstallString    REG_SZ    "H:\\ArtCraft\\uninstall.exe"
    NoModify    REG_DWORD    0x1
    NoRepair    REG_DWORD    0x1
    EstimatedSize    REG_DWORD    0x12656
`;

test('parseRegQueryOutput：解析真实 reg query 输出', () => {
  const parsed = parseRegQueryOutput(REAL_OUTPUT);
  assert.equal(parsed.keyName, 'HKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ArtCraft');
  assert.equal(parsed.values.InstallLocation.value, '"H:\\ArtCraft"');
  assert.equal(parsed.values.DisplayVersion.value, '0.41.0');
  assert.equal(parsed.values.NoModify.type, 'REG_DWORD');
  assert.equal(parsed.values.NoModify.value, '0x1');
  assert.equal(parsed.order.length, 10);
});

test('parseRegQueryOutput：容忍空输出与 REG_MULTI_SZ 续行', () => {
  assert.deepEqual(parseRegQueryOutput('').order, []);
  const parsed = parseRegQueryOutput(
    ['HKEY_CURRENT_USER\\X', '    Foo    REG_MULTI_SZ    a', '    b', '    Bar    REG_SZ    c'].join('\r\n'),
  );
  assert.equal(parsed.values.Foo.value, 'a\nb');
  assert.equal(parsed.values.Bar.value, 'c');
});

test('normalizeInstallLocation：去引号、展开环境变量、去尾部分隔符', () => {
  assert.equal(normalizeInstallLocation('"H:\\ArtCraft"'), 'H:\\ArtCraft');
  assert.equal(normalizeInstallLocation("'H:\\ArtCraft\\'"), 'H:\\ArtCraft');
  assert.equal(normalizeInstallLocation('  H:\\ArtCraft\\\\  '), 'H:\\ArtCraft');
  assert.equal(
    normalizeInstallLocation('%LOCALAPPDATA%\\Programs\\ArtCraft', { LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local' }),
    'C:\\Users\\x\\AppData\\Local\\Programs\\ArtCraft',
  );
  assert.equal(normalizeInstallLocation(''), null);
  assert.equal(normalizeInstallLocation(null), null);
  assert.equal(normalizeInstallLocation('""'), null);
});

test('expandEnvVars：保留未定义变量原样', () => {
  assert.equal(expandEnvVars('%NOPE%\\x', {}), '%NOPE%\\x');
  assert.equal(expandEnvVars('no vars', {}), 'no vars');
});

test('isRegistryKeyMissing：中英文错误信息都能认', () => {
  assert.equal(isRegistryKeyMissing('ERROR: The system was unable to find the specified registry key or value.'), true);
  assert.equal(isRegistryKeyMissing('错误: 系统找不到指定的注册表项或值。'), true);
  assert.equal(isRegistryKeyMissing('ERROR: Access is denied.'), false);
});

test('decodeConsoleText：把 GBK 的错误信息解成可读中文', () => {
  // 「错误: 系统找不到指定的注册表项或值。」的 GBK 字节
  const gbk = Buffer.from([
    0xb4, 0xed, 0xce, 0xf3, 0x3a, 0x20, 0xcf, 0xb5, 0xcd, 0xb3, 0xd5, 0xd2, 0xb2, 0xbb, 0xb5, 0xbd, 0xd6, 0xb8, 0xb6,
    0xa8, 0xb5, 0xc4, 0xd7, 0xa2, 0xb2, 0xe1, 0xb1, 0xed, 0xcf, 0xee, 0xbb, 0xf2, 0xd6, 0xb5, 0xa1, 0xa3,
  ]);
  const text = decodeConsoleText(gbk);
  assert.equal(text.includes('\uFFFD'), false);
  assert.match(text, /错误/);
});

test('createRegistryReader：注入的 exec 决定结果', () => {
  const okReader = createRegistryReader({
    exec: () => ({ status: 0, stdout: REAL_OUTPUT, stderr: '', error: null }),
  });
  const ok = okReader.query({ hive: 'HKCU', subKey: 'X', view: 64 });
  assert.equal(ok.ok, true);
  assert.equal(ok.values.InstallLocation.value, '"H:\\ArtCraft"');

  const missingReader = createRegistryReader({
    exec: () => ({
      status: 1,
      stdout: '',
      stderr: 'ERROR: The system was unable to find the specified registry key or value.',
      error: null,
    }),
  });
  const missing = missingReader.query({ hive: 'HKLM', subKey: 'X', view: 64 });
  assert.equal(missing.ok, false);
  assert.equal(missing.missing, true);
  assert.equal(missing.error, null);

  const spawnFailReader = createRegistryReader({
    exec: () => ({ status: 1, stdout: '', stderr: '', error: new Error('spawn reg ENOENT') }),
  });
  const failed = spawnFailReader.query({ hive: 'HKLM', subKey: 'X', view: 64 });
  assert.equal(failed.ok, false);
  assert.equal(failed.missing, false);
  assert.match(failed.error, /无法执行 reg\.exe/);
});

test('createRegistryReader：本地化的“找不到键”算 missing；其它失败留下 rawError', () => {
  const notFoundReader = createRegistryReader({
    exec: () => ({ status: 1, stdout: '', stderr: '错误: 系统找不到指定的注册表项或值。', error: null }),
  });
  const notFound = notFoundReader.query({ hive: 'HKLM', subKey: 'X', view: 64 });
  assert.equal(notFound.missing, true);
  assert.equal(notFound.rawError, null, '已识别的“找不到键”不需要额外诊断信息');

  // 认不出来的失败（例如拒绝访问）同样按 missing 处理，但要把原始输出留给人看
  const otherReader = createRegistryReader({
    exec: () => ({ status: 1, stdout: '', stderr: 'ERROR: Access is denied.', error: null }),
  });
  const other = otherReader.query({ hive: 'HKLM', subKey: 'X', view: 64 });
  assert.equal(other.missing, true);
  assert.equal(other.rawError, 'ERROR: Access is denied.');
});

test('readArtCraftRegistry：组装出安装目录与版本', () => {
  const reader = createRegistryReader({
    exec: () => ({ status: 0, stdout: REAL_OUTPUT, stderr: '', error: null }),
  });
  const { entries, errors, notFound } = readArtCraftRegistry({ reader, candidates: [
    { id: 'hkcu-64', hive: 'HKCU', subKey: 'SOFTWARE\\...\\ArtCraft', view: 64 },
  ] });
  assert.equal(errors.length, 0);
  assert.equal(notFound.length, 0);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].installLocation, 'H:\\ArtCraft');
  assert.equal(entries[0].version, '0.41.0');
  assert.equal(entries[0].displayName, 'ArtCraft');
});

test('readArtCraftRegistry：所有候选都读不到时返回 notFound', () => {
  const reader = createRegistryReader({
    exec: () => ({ status: 1, stdout: '', stderr: 'ERROR: The system was unable to find the specified registry key or value.', error: null }),
  });
  const res = readArtCraftRegistry({ reader, candidates: [{ id: 'a', hive: 'HKCU', subKey: 'X', view: 64 }] });
  assert.equal(res.entries.length, 0);
  assert.deepEqual(res.notFound, ['HKCU\\X']);
});

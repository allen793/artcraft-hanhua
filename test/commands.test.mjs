import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { runDetect } from '../src/commands/detect.mjs';
import { runVerify } from '../src/commands/verify.mjs';
import { runDoctor } from '../src/commands/doctor.mjs';
import { runHanhua } from '../src/commands/hanhua.mjs';
import { EXIT, LANGUAGE_STATE, SUITE_APP_IDS, TARGET_KIND } from '../src/constants.mjs';
import { makeCtx, makeWorld } from './helpers.mjs';

const entry = (result, id) => result.targets.find((t) => t.id === id);

test('detect：列出 13 个配置类目标 + 主程序，并给出语言状态', () => {
  const world = makeWorld();
  try {
    const result = runDetect(makeCtx(world), { systemLocale: 'zh-CN' });
    assert.equal(result.ok, true);
    assert.equal(result.exitCode, EXIT.OK);
    assert.equal(result.targets.length, 14, '主程序 1 + Launcher 1 + Craft App 12');
    assert.equal(result.summary.total, 14);
    assert.equal(result.summary.systemLocale, 6);
    assert.equal(result.summary.unsupported, 3);
    assert.equal(result.summary.configTargets, 4); // Launcher + DesignCraft + LightCraft + EffectCraft
    assert.equal(result.summary.pendingPatch, 1);

    // 安装位置来自 --root
    assert.equal(result.install.root, world.installRoot);
    assert.equal(result.install.source, 'cli');

    // DesignCraft：language 为空 → 非中文（需要改动）
    const design = entry(result, 'designcraft');
    assert.equal(design.currentLanguage, '');
    assert.equal(design.languageState, LANGUAGE_STATE.OTHER);
    assert.equal(design.installed, true);
    assert.equal(design.exeExists, true);

    // EffectCraft：language 在 general 段里，必须能读到（这是踩过的坑）
    const effect = entry(result, 'effectcraft');
    assert.equal(effect.currentLanguage, 'system');
    assert.deepEqual(effect.languageKeys, ['general.language']);

    // LightCraft 配置文件不存在 → missing-file，但仍然标成「可汉化」
    const light = entry(result, 'lightcraft');
    assert.equal(light.languageState, LANGUAGE_STATE.MISSING_FILE);
    assert.equal(light.hanhuaAble, true);

    // 上游无中文的程序：明确报出来，并给出真实证据（语言键 interfaceLanguage 嵌在字符串里）
    const cad = entry(result, 'cadcraft');
    assert.equal(cad.languageState, LANGUAGE_STATE.UNSUPPORTED);
    assert.match(cad.note, /上游无中文/);
    assert.deepEqual(cad.rawLanguageFields, [{ key: 'interfaceLanguage', value: 'auto' }]);
    assert.deepEqual(cad.languageKeys, [], 'RON map 不是顶层结构体，解析器不应声称读到了 language 字段');

    // 跟随系统的程序：状态是 system-locale，且没有任何配置文件
    const word = entry(result, 'wordcraft');
    assert.equal(word.languageState, LANGUAGE_STATE.SYSTEM_LOCALE);
    assert.deepEqual(word.configPaths, []);
    assert.equal(word.files.length, 0);

    // 主程序：补丁信息
    const main = entry(result, 'artcraft');
    assert.equal(main.kind, TARGET_KIND.BINARY_PATCH);
    assert.equal(main.patch.supported, true);
    assert.equal(main.languageState, LANGUAGE_STATE.PENDING);
    assert.equal(main.patchedPath, path.join(world.installRoot, 'artcraft-zh-full.exe'));

    // 12 个 Craft App 全部在清单里
    for (const appId of SUITE_APP_IDS) {
      assert.ok(entry(result, appId), `缺少目标：${appId}`);
    }

    // 结果必须能被 JSON 序列化（不能把 fs 之类的东西塞进结果里）
    assert.doesNotThrow(() => JSON.stringify(result));
  } finally {
    world.cleanup();
  }
});

test('detect：翻译数据统计与实测一致', () => {
  const world = makeWorld();
  try {
    const result = runDetect(makeCtx(world), { systemLocale: 'zh-CN' });
    assert.equal(result.translations.ok, true);
    assert.equal(result.translations.count, 2803);
    assert.equal(result.translations.caseInsensitiveCollisions, 31);
    assert.equal(result.translations.paddedEnglish, 172);
  } finally {
    world.cleanup();
  }
});

test('detect：找不到安装时报错而不是崩溃', () => {
  const world = makeWorld();
  try {
    const result = runDetect(makeCtx(world, { root: path.join(world.base, 'nope') }));
    assert.equal(result.ok, false);
    assert.equal(result.exitCode, EXIT.FAILURE);
    assert.match(result.errors.join('；'), /指定的安装目录不存在/);
  } finally {
    world.cleanup();
  }
});

test('verify：汉化后校验通过，并给出主程序 exe 的 SHA-256', async () => {
  const world = makeWorld();
  try {
    await runHanhua(makeCtx(world), { confirm: async () => true });
    const result = runVerify(makeCtx(world), { systemLocale: 'zh-CN' });

    assert.equal(result.ok, true, result.errors.join('；'));
    assert.equal(entry(result, 'designcraft').verified, true);
    assert.equal(entry(result, 'effectcraft').verified, true);
    assert.equal(entry(result, 'lightcraft').verified, true);
    assert.equal(entry(result, 'artcraft-launcher').verified, true);
    assert.equal(entry(result, 'designcraft').files[0].backupExists, true);
    assert.equal(entry(result, 'lightcraft').files[0].markerExists, true);
    assert.equal(result.summary.localized, 4);

    const main = entry(result, 'artcraft');
    assert.match(main.exeSha256, /^[0-9a-f]{64}$/);
    assert.equal(main.exeExists, true);
    assert.match(result.translations.sha256, /^[0-9a-f]{64}$/);

    assert.doesNotThrow(() => JSON.stringify(result));
  } finally {
    world.cleanup();
  }
});

test('verify：未汉化时报「未汉化」但仍正常返回', () => {
  const world = makeWorld();
  try {
    const result = runVerify(makeCtx(world), { systemLocale: 'zh-CN' });
    assert.equal(result.ok, true);
    assert.equal(entry(result, 'designcraft').verified, false);
    assert.match(entry(result, 'designcraft').verdict, /当前语言是/);
    assert.equal(entry(result, 'lightcraft').verified, false);
    assert.match(entry(result, 'lightcraft').verdict, /配置文件不存在/);
    assert.equal(result.summary.notLocalized, 4);
  } finally {
    world.cleanup();
  }
});

test('verify：上游无中文的配置格式不认识时，不算硬错误（退出码仍为 0）', () => {
  const world = makeWorld();
  try {
    const result = runVerify(makeCtx(world), { systemLocale: 'zh-CN' });
    assert.equal(result.ok, true, result.errors.join('；'));
    assert.equal(result.exitCode, EXIT.OK);
    assert.deepEqual(result.errors, []);
    const cad = entry(result, 'cadcraft');
    assert.equal(cad.managed, false);
    assert.match(cad.verdict, /interfaceLanguage=auto/);
    assert.equal(cad.verified, null);
  } finally {
    world.cleanup();
  }
});

test('doctor：环境自检全部通过（假世界）', () => {
  const world = makeWorld();
  try {
    const result = runDoctor(makeCtx(world), { systemLocale: 'zh-CN' });
    assert.equal(result.exitCode, EXIT.OK, JSON.stringify(result.errors));
    assert.equal(result.summary.fail, 0);
    const ids = result.checks.map((c) => c.id);
    for (const wanted of ['platform', 'node', 'registry', 'install', 'temp', 'translations', 'powershell', 'main-patch']) {
      assert.ok(ids.includes(wanted), `缺少检查项：${wanted}`);
    }
    // 明确声明：不在安装目录里写探测文件
    const writable = result.checks.find((c) => c.id === 'install-writable');
    assert.match(writable.detail, /未做写入探测/);
    assert.doesNotThrow(() => JSON.stringify(result));
  } finally {
    world.cleanup();
  }
});

test('doctor：组装不出安装时，注册表检查仍然独立可用', () => {
  const world = makeWorld();
  try {
    const result = runDoctor(makeCtx(world, { root: path.join(world.base, 'nope') }), { systemLocale: 'zh-CN' });
    assert.equal(result.summary.fail > 0, true);
    assert.equal(result.checks.find((c) => c.id === 'install').status, 'fail');
    assert.equal(result.checks.find((c) => c.id === 'platform').status, 'ok');
  } finally {
    world.cleanup();
  }
});

/**
 * 目标清单：主程序 1 个 + Launcher 1 个 + Craft App 12 个。
 *
 * 每一项都是「实测确认过的写法」，不要凭感觉改：
 * - 支持中文的：写哪个文件、哪个字段、写什么值
 * - 上游不支持中文的：为什么不能写（避免以后有人「顺手」加一个 language 字段）
 * - 跟随系统区域的：**不要凭空创建配置文件**（可能被判为配置损坏）
 */

import { win32 as path } from 'node:path';
import { SUITE_APP_IDS, TARGET_KIND, SUPPORT_LEVEL } from './constants.mjs';
import { appExePath, launcherDataDir, launcherExePath, mainExePath } from './locate.mjs';
import { localAppData, roamingAppData } from './sysenv.mjs';

// 目录定位工具统一放在 sysenv.mjs，这里再导出一次方便调用方就近使用
export { localAppData, roamingAppData };

/** Craft App 的展示名 */
export const APP_META = {
  cadcraft: { name: 'CADCraft' },
  deckcraft: { name: 'DeckCraft' },
  designcraft: { name: 'DesignCraft' },
  effectcraft: { name: 'EffectCraft' },
  filmcraft: { name: 'FilmCraft' },
  gridcraft: { name: 'GridCraft' },
  lightcraft: { name: 'LightCraft' },
  pdfcraft: { name: 'PdfCraft' },
  photocraft: { name: 'PhotoCraft' },
  soundcraft: { name: 'SoundCraft' },
  vectorcraft: { name: 'VectorCraft' },
  wordcraft: { name: 'WordCraft' },
};

/** 原生跟随系统区域显示中文的 App（无配置文件，不要创建） */
export const SYSTEM_LOCALE_APPS = [
  'wordcraft',
  'photocraft',
  'vectorcraft',
  'gridcraft',
  'pdfcraft',
  'filmcraft',
];

/**
 * 构造全部目标。
 * @param {{ installRoot: string, env?: Record<string,string|undefined> }} deps
 * @returns {Array<object>}
 */
export function buildTargets({ installRoot, env = process.env }) {
  const root = installRoot;
  const roaming = roamingAppData(env);
  const appDataFile = (appDirName, ...rest) =>
    roaming ? path.join(roaming, appDirName, ...rest) : null;

  const targets = [];

  // ── 1. 主程序（二进制补丁，本轮只留接口）
  targets.push({
    id: 'artcraft',
    name: 'ArtCraft',
    nameZh: 'ArtCraft 主程序',
    group: 'main',
    kind: TARGET_KIND.BINARY_PATCH,
    exePath: mainExePath(root),
    patchedPath: path.join(root, 'artcraft-zh-full.exe'),
    configPath: null,
    configPaths: [],
    languagePath: null,
    desiredValue: null,
    allowedValues: null,
    createIfMissing: false,
    supported: true,
    supportLevel: SUPPORT_LEVEL.EXPERIMENTAL,
    note: '界面资源内嵌在 exe 里，需要替换 Tauri EmbeddedAssets（实验性）；本轮补丁算法尚未接入',
    defect: null,
  });

  // ── 2. ArtCraft Launcher（RON 配置）
  targets.push({
    id: 'artcraft-launcher',
    name: 'ArtCraft Launcher',
    nameZh: 'ArtCraft 启动器',
    group: 'launcher',
    kind: TARGET_KIND.RON_LANG,
    exePath: launcherExePath(root),
    configPath: path.join(launcherDataDir(root), 'app.ron'),
    configPaths: [path.join(launcherDataDir(root), 'app.ron')].filter(Boolean),
    languagePath: ['language'],
    desiredValue: 'zh-CN',
    allowedValues: null,
    createIfMissing: true,
    supported: true,
    supportLevel: SUPPORT_LEVEL.OK,
    note: '不存在则创建 `(language: "zh-CN")`；RON 字段名就是 language',
    defect: null,
  });

  // ── 3. 可汉化的三个 App
  targets.push({
    id: 'designcraft',
    name: 'DesignCraft',
    nameZh: 'DesignCraft',
    group: 'app',
    kind: TARGET_KIND.JSON_LANG,
    exePath: appExePath(root, 'designcraft'),
    configPath: appDataFile('DesignCraft', 'ui.json'),
    configPaths: [appDataFile('DesignCraft', 'ui.json')].filter(Boolean),
    languagePath: ['language'],
    desiredValue: 'zh',
    allowedValues: ['', 'de', 'fr', 'es', 'ja', 'zh', 'ar', 'pt-br', 'it', 'uk'],
    createIfMissing: false,
    supported: true,
    supportLevel: SUPPORT_LEVEL.DEFECT,
    note: '把 `"language": ""` 改成 `"language": "zh"`；配置文件必须先由程序自己生成',
    defect: '上游用内嵌日文字体渲染 CJK，部分汉字会显示为方框（本工具无法修复）',
  });

  targets.push({
    id: 'lightcraft',
    name: 'LightCraft',
    nameZh: 'LightCraft',
    group: 'app',
    kind: TARGET_KIND.JSON_LANG,
    exePath: appExePath(root, 'lightcraft'),
    configPath: appDataFile('LightCraft', 'ui.json'),
    configPaths: [appDataFile('LightCraft', 'ui.json')].filter(Boolean),
    languagePath: ['language'],
    desiredValue: 'zh-hans',
    allowedValues: ['en', 'zh-hans', 'zh-hant', 'ja', 'pt-br', 'es', 'de', 'ru', 'fr', 'uk'],
    createIfMissing: true,
    supported: true,
    supportLevel: SUPPORT_LEVEL.OK,
    note: '文件不存在则创建 `{"language":"zh-hans"}`',
    defect: null,
  });

  targets.push({
    id: 'effectcraft',
    name: 'EffectCraft',
    nameZh: 'EffectCraft',
    group: 'app',
    kind: TARGET_KIND.JSON_LANG,
    exePath: appExePath(root, 'effectcraft'),
    configPath: appDataFile('EffectCraft', 'prefs.json'),
    configPaths: [appDataFile('EffectCraft', 'prefs.json')].filter(Boolean),
    languagePath: ['general', 'language'],
    desiredValue: 'zh-hans',
    allowedValues: null,
    createIfMissing: false,
    supported: true,
    supportLevel: SUPPORT_LEVEL.OK,
    note: '把 `general` 段里的 `"language": "system"` 改成 `"language": "zh-hans"`',
    defect: null,
  });

  // ── 4. 上游不支持中文的 App（明确报错，不要乱写）
  targets.push({
    id: 'cadcraft',
    name: 'CADCraft',
    nameZh: 'CADCraft',
    group: 'app',
    kind: TARGET_KIND.UNSUPPORTED,
    exePath: appExePath(root, 'cadcraft'),
    configPath: appDataFile('ai.storyteller.cadcraft', 'data', 'app.ron'),
    configPaths: [appDataFile('ai.storyteller.cadcraft', 'data', 'app.ron')].filter(Boolean),
    languagePath: ['language'],
    desiredValue: null,
    allowedValues: ['auto', 'en', 'uk'],
    createIfMissing: false,
    supported: false,
    supportLevel: SUPPORT_LEVEL.NONE,
    note:
      '上游无中文：程序内校验串为 `language must be auto, en or uk`，写入 zh 会被忽略；' +
      '实测其 app.ron 是 RON map，语言键叫 `interfaceLanguage`（值 auto）且被嵌在转义字符串里',
    defect: null,
  });

  targets.push({
    id: 'deckcraft',
    name: 'DeckCraft',
    nameZh: 'DeckCraft',
    group: 'app',
    kind: TARGET_KIND.UNSUPPORTED,
    exePath: appExePath(root, 'deckcraft'),
    configPath: appDataFile('DeckCraft', 'prefs.json'),
    configPaths: [
      appDataFile('DeckCraft', 'prefs.json'),
      appDataFile('DeckCraft', 'ui.json'),
    ].filter(Boolean),
    languagePath: null,
    desiredValue: null,
    allowedValues: null,
    createIfMissing: false,
    supported: false,
    supportLevel: SUPPORT_LEVEL.NONE,
    note: '上游无中文：prefs.json / ui.json 全字段没有语言键',
    defect: null,
  });

  targets.push({
    id: 'soundcraft',
    name: 'SoundCraft',
    nameZh: 'SoundCraft',
    group: 'app',
    kind: TARGET_KIND.UNSUPPORTED,
    exePath: appExePath(root, 'soundcraft'),
    configPath: appDataFile('SoundCraft', 'ui.json'),
    configPaths: [appDataFile('SoundCraft', 'ui.json')].filter(Boolean),
    languagePath: null,
    desiredValue: null,
    allowedValues: null,
    createIfMissing: false,
    supported: false,
    supportLevel: SUPPORT_LEVEL.NONE,
    note: '上游无中文：ui.json 全字段没有语言键',
    defect: null,
  });

  // ── 5. 跟随系统区域的 App（本来就是中文，不要创建配置文件）
  for (const appId of SYSTEM_LOCALE_APPS) {
    const meta = APP_META[appId];
    const defect =
      appId === 'pdfcraft'
        ? '上游字体缺陷导致大量汉字显示为方框'
        : appId === 'filmcraft'
          ? '上游字体缺陷导致少量汉字显示为方框'
          : null;
    targets.push({
      id: appId,
      name: meta.name,
      nameZh: meta.name,
      group: 'app',
      kind: TARGET_KIND.SYSTEM_LOCALE,
      exePath: appExePath(root, appId),
      configPath: null,
      configPaths: [],
      languagePath: null,
      desiredValue: null,
      allowedValues: null,
      createIfMissing: false,
      supported: false,
      supportLevel: SUPPORT_LEVEL.NATIVE,
      note: '无语言配置文件：界面跟随系统区域，系统为中文时本来就是中文，**不会凭空创建配置文件**',
      defect,
    });
  }

  // 保证顺序与 SUITE_APP_IDS 一致：主程序、Launcher，然后按 appid 顺序
  const orderIndex = new Map([['artcraft', -2], ['artcraft-launcher', -1]]);
  SUITE_APP_IDS.forEach((appId, i) => orderIndex.set(appId, i));
  targets.sort((a, b) => (orderIndex.get(a.id) ?? 99) - (orderIndex.get(b.id) ?? 99));

  return targets;
}

/**
 * 找出目标对应的全部 id（用于 --only 校验）。
 * @param {Array<object>} targets
 */
export function targetIds(targets) {
  return targets.map((t) => t.id);
}

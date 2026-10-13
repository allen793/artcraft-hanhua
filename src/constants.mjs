/**
 * 全局常量。
 *
 * 这里集中放置「实测确认过的字面量」，避免散落在各个模块里被误改。
 * 所有路径拼接一律使用 Windows 语义（本工具只支持 Windows）。
 */

export const TOOL_NAME = 'artcraft-hanhua';
export const TOOL_VERSION = '0.1.0';
export const MIN_NODE_MAJOR = 18;

/** 备份后缀：同目录 `<文件名>.bak-before-hanhua`，已存在则不覆盖 */
export const BACKUP_SUFFIX = '.bak-before-hanhua';

/** 「本工具创建了该文件」的标记后缀：revert 时据此删除文件而不是留下空文件 */
export const CREATED_MARKER_SUFFIX = '.hanhua-created';

/** 主程序补丁产物文件名（与 README 中的说法保持一致） */
export const PATCHED_MAIN_EXE_NAME = 'artcraft-zh-full.exe';

/** 套件里的 12 个 Craft App（实测存在的 appid） */
export const SUITE_APP_IDS = [
  'cadcraft',
  'deckcraft',
  'designcraft',
  'effectcraft',
  'filmcraft',
  'gridcraft',
  'lightcraft',
  'pdfcraft',
  'photocraft',
  'soundcraft',
  'vectorcraft',
  'wordcraft',
];

/** `--only` 允许的别名（统一小写后匹配） */
export const TARGET_ALIASES = {
  main: 'artcraft',
  app: 'artcraft',
  artcraftapp: 'artcraft',
  launcher: 'artcraft-launcher',
  artcraftlauncher: 'artcraft-launcher',
};

/**
 * 目标 id 的静态全集（不依赖安装目录，可在读注册表之前就校验 `--only`）。
 * 顺序：主程序 → Launcher → 12 个 Craft App。
 */
export const STATIC_TARGET_IDS = ['artcraft', 'artcraft-launcher', ...SUITE_APP_IDS];

/** 翻译数据文件（相对仓库根目录） */
export const TRANSLATIONS_RELATIVE_PATH = 'data/translations.tsv';

/** 实测的翻译条数（不含表头）；加载时用于校验数据完整性 */
export const EXPECTED_TRANSLATION_COUNT = 2773;

/** 状态目录名（位于 %LOCALAPPDATA% 下），存放 state.json 日志 */
export const STATE_DIR_NAME = 'artcraft-hanhua';
export const STATE_FILE_NAME = 'state.json';
export const STATE_VERSION = 1;

/** 退出码约定 */
export const EXIT = {
  OK: 0,
  FAILURE: 1,
  USAGE: 2,
  UNSUPPORTED_PLATFORM: 3,
};

/** 目标类型 */
export const TARGET_KIND = {
  /** 主程序：需要替换 exe 内嵌前端资源（本轮未实现） */
  BINARY_PATCH: 'binary-patch',
  /** JSON 配置文件里的语言字段 */
  JSON_LANG: 'json-lang',
  /** RON 配置文件里的语言字段 */
  RON_LANG: 'ron-lang',
  /** 跟随系统区域，本来就没有语言配置 */
  SYSTEM_LOCALE: 'system-locale',
  /** 上游不支持中文 */
  UNSUPPORTED: 'unsupported',
};

/** 支持的档次（用于 detect 报告与 README 支持矩阵对齐） */
export const SUPPORT_LEVEL = {
  /** 可汉化 */
  OK: 'ok',
  /** 可汉化但上游有显示缺陷（方框缺字），本工具无法修复 */
  DEFECT: 'defect',
  /** 可汉化但属于实验性的二进制补丁 */
  EXPERIMENTAL: 'experimental',
  /** 原生跟随系统显示中文，无需改动 */
  NATIVE: 'native',
  /** 上游无中文入口 */
  NONE: 'none',
};

/** 各目标在处理过程中的状态 */
export const TARGET_STATUS = {
  DONE: 'done',
  NOOP: 'noop',
  SKIPPED: 'skipped',
  PENDING: 'pending',
  FAILED: 'failed',
  WOULD_CHANGE: 'would-change',
  WOULD_CREATE: 'would-create',
  REVERTED: 'reverted',
  REVERTED_CREATED: 'reverted-created',
  CANCELLED: 'cancelled',
};

/** 状态 → 中文标签（人类可读输出用） */
export const STATUS_LABEL = {
  [TARGET_STATUS.DONE]: '完成',
  [TARGET_STATUS.NOOP]: '无需改动',
  [TARGET_STATUS.SKIPPED]: '跳过',
  [TARGET_STATUS.PENDING]: '待接入',
  [TARGET_STATUS.FAILED]: '失败',
  [TARGET_STATUS.WOULD_CHANGE]: '将改动',
  [TARGET_STATUS.WOULD_CREATE]: '将创建',
  [TARGET_STATUS.REVERTED]: '已回滚',
  [TARGET_STATUS.REVERTED_CREATED]: '已回滚（并删除本工具创建的文件）',
  [TARGET_STATUS.CANCELLED]: '已取消',
};

/** 「当前语言」状态 */
export const LANGUAGE_STATE = {
  ZH: 'zh',
  OTHER: 'other',
  ABSENT: 'absent',
  MISSING_FILE: 'missing-file',
  UNSUPPORTED: 'unsupported',
  SYSTEM_LOCALE: 'system-locale',
  PENDING: 'pending',
  PATCHED: 'patched',
  ERROR: 'error',
};

export const LANGUAGE_STATE_LABEL = {
  [LANGUAGE_STATE.ZH]: '已是中文',
  [LANGUAGE_STATE.OTHER]: '非中文',
  [LANGUAGE_STATE.ABSENT]: '无语言字段',
  [LANGUAGE_STATE.MISSING_FILE]: '配置文件不存在',
  [LANGUAGE_STATE.UNSUPPORTED]: '上游无中文',
  [LANGUAGE_STATE.SYSTEM_LOCALE]: '跟随系统区域',
  [LANGUAGE_STATE.PENDING]: '待接入补丁',
  [LANGUAGE_STATE.PATCHED]: '已生成补丁产物',
  [LANGUAGE_STATE.ERROR]: '读取失败',
};

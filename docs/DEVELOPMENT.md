# 开发说明（DEVELOPMENT）

面向维护者：本文件说明 `artcraft-hanhua` 的架构、模块职责、关键不变量与测试策略。

> 用户向文档在仓库根目录的 `README.md`；本文件只讲实现。
> 支持矩阵与实测证据由 `docs/SUPPORTED-APPS.md` 负责，这里不重复。

---

## 1. 形态与约束

| 项 | 约定 |
| --- | --- |
| 运行形态 | Node.js ESM CLI，`bin` 名 `artcraft-hanhua` |
| 依赖 | **零第三方运行时依赖**，只用 `node:` 内置模块（`fs` / `path` / `child_process` / `crypto` / `os` / `readline`） |
| Node | `>= 18`（本机验证 v24）；用到 `node:test`、`AbortSignal` 之外的现代 ESM 能力 |
| 平台 | **仅 Windows**。非 Windows 上所有命令给出中英双语报错并返回退出码 `3`；`doctor` 例外，它照常运行并把平台判为失败项 |
| 外部命令 | `reg.exe`（读注册表）、PowerShell（读 exe 版本资源）。二者都是只读调用 |
| 路径 | 一律用 `path.win32` 语义（`src/locate.mjs` / `src/targets.mjs`），保证路径行为确定 |

**已知的沙箱注意点**：`reg.exe` 与 PowerShell 的输出需要经过管道捕获（`spawnSync` 默认 `stdio: 'pipe'`）。
在受限沙箱里「程序不能通过管道捕获另一个程序的输出」时这两处会失败；本工具对失败都有明确的降级路径
（注册表读不到 → 走兜底目录；版本读不到 → 主程序判为不可打补丁），不会崩。

---

## 2. 目录与模块职责

```
artcraft-hanhua/
├─ bin/artcraft-hanhua.mjs      # 可执行入口（shebang + 调用 main）
├─ src/
│  ├─ cli.mjs                   # 参数 → 确认 → 命令 → 渲染 → 退出码（唯一做终端 I/O 的地方）
│  ├─ args.mjs                  # 纯函数参数解析、--only 别名/大小写规范化
│  ├─ constants.mjs             # 全部实测字面量：目标 id、后缀、期望值、退出码、状态枚举
│  ├─ context.mjs               # 依赖注入容器 + 「解析安装位置并巡检」的公共入口
│  ├─ locate.mjs                # 安装位置识别：--root → 环境变量 → 注册表 → 常见位置兜底
│  ├─ registry.mjs              # 只读注册表：reg query 输出解析、控制台编码兜底、值规范化
│  ├─ targets.mjs               # 14 个目标的清单（文件、字段、期望值、上游支持情况）
│  ├─ inspect.mjs               # 只读巡检：文件是否存在/当前语言/备份/marker/补丁支持
│  ├─ config-edit.mjs           # 「哪个文件、哪个字段」的知识收敛处（JSON/RON 两种策略）
│  ├─ json-text.mjs             # JSON 最小改动编辑（只替换目标字段字面量，保留其余字节）
│  ├─ ron-text.mjs              # RON 顶层结构体字段的读写（Launcher 的 app.ron）
│  ├─ lang-probe.mjs            # 「语言字段」粗探针（只看不写）：也能看穿被转义的 JSON 内嵌字符串
│  ├─ fsutil.mjs                # 文件工具：**无 BOM 的 UTF-8 写入 + 写后自检**、SHA-256、写权限探测
│  ├─ backups.mjs               # 备份（<文件名>.bak-before-hanhua）与「本工具创建」marker
│  ├─ state.mjs                 # 变更日志 %LOCALAPPDATA%\artcraft-hanhua\state.json（哈希校验依据）
│  ├─ translations.mjs          # data/translations.tsv 的解析、校验、英文索引
│  ├─ artcraft-patch.mjs        # 主程序二进制补丁的接口骨架（算法待接入，注释里写明算法要点）
│  ├─ sysenv.mjs                # 平台/Node 版本/系统区域/%APPDATA%/%LOCALAPPDATA%/临时目录
│  ├─ render.mjs                # 人类可读输出（中文为主，宽字符对齐的表格）
│  └─ commands/
│     ├─ detect.mjs  hanhua.mjs  revert.mjs  verify.mjs  doctor.mjs
├─ data/translations.tsv        # 翻译数据（2803 条，英文 → 中文）
├─ test/                        # node:test 单测 + helpers.mjs（临时「世界」构造器）
└─ docs/DEVELOPMENT.md
```

### 依赖方向

```
cli.mjs
  └─ commands/*  ──► context.mjs ──► locate ──► registry ──► fsutil
                        │                         targets ◄─ sysenv
                        └─► inspect ──► (json-text | ron-text) + backups + artcraft-patch
 commands/hanhua ──► config-edit ──► (json-text | ron-text)
                 ──► backups + state + fsutil
```

规则：**底层模块不认识上层**。`json-text` / `ron-text` / `backups` / `fsutil` / `state` 都是纯函数 + 显式依赖，
不认识「目标」「命令」这些概念；`targets.mjs` 只描述数据。

---

## 3. 数据流

```
1. cli.mjs    parseArgs(argv) → options
2. context    resolveAndInspect(ctx)
                ├─ resolveInstall()      找到安装目录（--root → env → 注册表 → 兜底）
                ├─ buildTargets()        生成 14 个目标
                └─ inspectAll()          只读巡检每个目标（语言值、备份、marker、补丁支持）
3. commands
   ├─ detect  只看巡检结果，直接渲染
   ├─ hanhua  planTarget()（纯计算）→ dry-run 直接渲染
   │                              → 否则 confirm → applyPlan()（备份 → 写入 → 记日志）
   ├─ revert  revertTarget()（marker/日志 → 删除；备份 → 还原 + 哈希校验）
   ├─ verify  巡检 + 哈希，只读
   └─ doctor  逐项环境检查（写权限探测只在自家状态目录/临时目录/App 配置目录）
4. cli.mjs    --json → JSON；否则 render.mjs；退出码来自 result.exitCode
```

所有命令都返回**可 JSON 序列化的普通对象**（不含 `fs`、函数、Error 实例），
所以 `--json` 与人类输出共用同一份数据，不会出现两边说法不一致。

---

## 4. 关键不变量（改代码时不要破坏）

1. **写配置文件必须是无 BOM 的 UTF-8。**
   带 BOM 会被 DesignCraft 判为配置损坏并把语言重置回英文（已实测）。
   所有写盘都走 `fsutil.writeUtf8NoBom()`，它写入后会**回读文件头自检**，发现 BOM 直接抛错。
   读入时若发现原文件带 BOM，会去掉 BOM 写回，并在结果里给出提示（备份保留原始字节）。

2. **写之前必须备份，备份已存在则不覆盖。**
   `createBackupIfMissing()` 负责；备份失败时对应目标直接判失败并**放弃写入**，避免产生无法回滚的改动。

3. **`--dry-run` 不写任何文件。**
   由「plan 是纯计算、写操作只出现在 `applyPlan`」保证；单测用目录快照对比断言。

4. **「本工具创建」的文件，回滚时要删除而不是留空文件。**
   两个独立证据：`state.json` 里的 `action: 'created'`，以及同目录的 `<文件名>.hanhua-created` marker。
   两者都没有、也没有备份时，`revert` **什么都不做**（宁可少动，也不误删用户数据）。

5. **`revert` 之后备份文件保留。**
   下次 `hanhua` 会复用它作为「原始副本」，因此反复 hanhua/revert 始终回到同一份原始内容。

6. **不凭空创建配置文件。**
   只有明确允许的两个目标会被创建：Launcher 的 `app.ron`、LightCraft 的 `ui.json`。
   跟随系统区域的 6 个 App（WordCraft 等）与「上游无中文」的 3 个 App（CADCraft 等）**一个字节都不写**。

7. **只在必要的地方做写权限探测。**
   安装目录（`H:\ArtCraft` 之类）只做只读探测：`doctor` 明确声明不往安装目录写探测文件，
   写权限探测只发生在自家状态目录、临时目录、以及已存在的 App 配置目录（探测文件写完立刻删除）。

8. **主程序补丁缺失时优雅降级。**
   `patchMainApp()` 仍会抛「未实现」，`hanhua` 捕获后把主程序标为 `pending`、打印说明、
   继续处理其余目标，**退出码仍为 0**；只有加 `--require-main` 时才返回 `1`。

---

## 5. 目标分类与处置

14 项 = 主程序 1 + Launcher 1 + Craft App 12。

| 类型 (`kind`) | 处置 | 目标 |
| --- | --- | --- |
| `binary-patch` | 调 `src/artcraft-patch.mjs`（本轮 pending） | ArtCraft 主程序 |
| `ron-lang` | 写 RON `language` 字段，不存在则创建 | ArtCraft Launcher |
| `json-lang` | 最小改动写 JSON 字段 | DesignCraft（`language`）、LightCraft（`language`，可创建）、EffectCraft（`general.language`） |
| `unsupported` | 明确报「上游无中文」，不动文件 | CADCraft、DeckCraft、SoundCraft |
| `system-locale` | 报「已随系统显示中文，无需改动」 | WordCraft、PhotoCraft、VectorCraft、GridCraft、PdfCraft、FilmCraft |

> 计数说明：README/交付说明里写「13 个程序」指的是 13 个**配置类**条目
> （Launcher 1 + 12 个 Craft App），主程序是单独的第 14 项（二进制补丁）。
> `detect` 输出 14 项，这是刻意的。

期望值与可选值都放在 `src/targets.mjs`，例如 DesignCraft 的 `""|de|fr|es|ja|zh|ar|pt-br|it|uk`、
LightCraft 的 `en|zh-hans|zh-hant|ja|pt-br|es|de|ru|fr|uk`、CADCraft 的 `auto|en|uk`
（最后一组是**反例**：因为上游没有 `zh`，所以这个目标不可汉化）。

### CADCraft 的配置形态（实测证据）

`%APPDATA%\ai.storyteller.cadcraft\data\app.ron` **不是**结构体，而是 RON 的 map，
且语言字段被嵌在一段转义的 JSON 字符串里：

```
{
    "cadcraft.prefs": "{\"interfaceLanguage\":\"auto\",\"saveFormat\":\"dxf\",\"theme\":\"dark\"}",
}
```

结论：语言键叫 `interfaceLanguage`（不是 `language`），而且上游只接受 `auto / en / uk`。
所以这个目标被归为 `unsupported`：**不写**，但用 `lang-probe.mjs` 把这条证据原样报进
`detect` / `verify`（`rawLanguageFields`），避免以后有人误以为「只是没找到字段」。

同理，`verify` 只在**本工具负责改写**的目标上把「配置解析失败」当成硬错误；
上游不支持中文的程序（CADCraft 这类）格式本来就不在支持范围内，不算错误，退出码保持 0。

---

## 6. 翻译数据格式（实测）

`data/translations.tsv`（由 `hanhua-build/merged.tsv` 复制而来，146 834 字节）：

```
id	english	chinese
0001	Delete	删除
0002	Cancel	取消
...
2803	...
```

实测结论：

- 第一行是表头 `id / english / chinese`（制表符分隔）；解析器也接受列顺序不同，并在**没有**表头时按位置约定解析
- 数据行 **2803** 条；每行**恰好 3 列**
- **无 BOM**，换行是 **LF**（不是 CRLF），字段没有引号包裹，字段内没有制表符
- id 是 4 位十进制数字，`0001`–`2803`，无重复
- 英文**精确去重后仍是 2803 条**（没有完全相同的英文）
- 但有 **31 组「忽略大小写后相同」**的英文（如 `3D model` / `3D Model`、`Cost Calculator` / `Cost calculator`）。
  用大小写不敏感的匹配器会在这些键上产生歧义 —— 所以匹配必须**大小写敏感**
- 有 **173 条**英文文案首尾带空格（如 `2293\t layers. Recommended...`），这些空格是**内容的一部分**，
  匹配时不能 `trim()`，否则对不上 exe 里的原始字符串
- 没有「同英文不同中文」的冲突

加载校验（`src/translations.mjs`）：条数必须等于 `EXPECTED_TRANSLATION_COUNT`（`src/constants.mjs`，2803）、
每行必须 3 列、每个字段不能为空、id 必须是 4 位数字；任何一条不满足就**报错而不是静默**。
数据文件确实更新时，改常量或调用 `parseTranslations(text, { allowCountMismatch: true })`。

---

## 7. 主程序补丁接口（`src/artcraft-patch.mjs`，本轮只有骨架）

```js
export const ARTCRAFT_PATCH_VERSION = 1;
export const SUPPORTED_MAIN_VERSIONS = ['0.41.0'];

readExeVersion({ exePath, exec })                  // PowerShell 读版本资源（可注入依赖）
readExeVersions({ paths, exec })                   // 批量读，一次调用拿全部
isPatchSupported({ exePath, version?, exec? })      // → { supported, version, reason }
patchMainApp({ exePath, outPath?, translations, log })  // 未实现：抛错
recomputeCspHashes({ decompressedAssets })              // 未实现：抛错
defaultPatchedExePath({ exePath, outPath? })        // 默认产物 artcraft-zh-full.exe（不覆盖原 exe）
```

算法要点写在文件顶部的注释里，摘要：

- Tauri v2 `EmbeddedAssets` 是编译期生成的 `phf::Map<&str, &[u8]>`，静态数据在 `.rdata`
- phf 条目**定长 40 字节**：`hash | key.ptr | key.len | value.ptr | value.len`（ptr 是**绝对 VA**，需按节表换算文件偏移）
- 每条 value 是**独立的 brotli 流**
- 译文替换后长度变化，因此**不能就地覆盖**：追加新的 PE 段，**只改 phf 条目里的 `value.ptr` / `value.len`**，key/hash 与表结构一个字都不能动
- `index.html` 的 CSP 里两条内联 `sha256-...` 必须按**替换后的解压内容**重算回写（见 `recomputeCspHashes`），否则 WebView2 拒绝执行内联脚本
- 产物另存为新文件、不覆盖原 exe；打过补丁的 exe 数字签名必然失效（预期行为）

接入时的约定：`translations` 接受 `{id, en, zh}[]`（用 `toTranslationList()` 得到）或 `Record<english, chinese>`（用 `toTranslationMap()` 得到）；
`log(message)` 用于打印进度；成功后返回 `{ exePath, outPath, replaced }`。
匹配英文时请**大小写敏感、不要 trim**（见第 6 节）。

---

## 8. 测试策略

```powershell
npm test          # = node --test（自动发现 test/*.test.mjs）
```

- 只用 `node:test` + `node:assert`，不引入测试框架
- **不碰真机**：`test/helpers.mjs` 在临时目录里造一个「世界」——
  假的安装目录（`artcraft.exe` + `launcher` + 12 个 app exe）、假的 `%APPDATA%` / `%LOCALAPPDATA%`，
  并把注册表读取与 exe 版本读取替换成注入的假实现
- 覆盖点：参数解析、`reg query` 输出解析（含**带引号的 `InstallLocation`** 与 GBK 错误信息解码）、
  安装位置解析（`--root` / 环境变量 / 注册表 / 兜底）、JSON 与 RON 的最小改动编辑、
  备份与 marker、翻译数据校验、dry-run 不落盘（目录快照对比）、
  hanhua → revert 完整闭环（含哈希校验、BOM 剥离、marker 删除）、
  `--json` 与退出码、非 Windows 报错、补丁骨架的「未实现」行为
- 新增目标时请同步：`test/commands.test.mjs` 的目标计数，以及 `src/constants.mjs` 的期望条数（若数据变）

依赖注入是本项目可测性的关键：`fs`、`env`、`platform`、`registryReader`、`exeVersionExec`、`state`
都可以从 `createContext(options, deps)` 传入，命令函数本身不读全局状态（除 `process.versions` 与 `os.tmpdir()`）。

---

## 9. 已知限制 / 待办

1. **主程序补丁尚未实现**：`patchMainApp()` 抛「未实现」，`hanhua` 把它标为 `pending`；算法接入见第 7 节。
2. **DesignCraft / PdfCraft / FilmCraft 的方框缺字**是上游内嵌字体的 CJK 渲染缺陷，本工具不修（不做二进制字体替换）。
3. **`verify` 的退出码**只反映「报告是否成功生成 / 是否有硬错误」，不代表「都已汉化」；
   要判断汉化状态请读 `verified` 字段（`localized` / `notLocalized` 计数）。
4. **非交互环境必须显式 `--yes`**：这是刻意的，避免脚本里静默改文件；`--dry-run` 不需要确认。
5. 注册表读取失败时统一按「键不存在」处理（`reg query` 对不存在与非权限错误都返回 1，
   而错误信息是本地化的，靠文本判断不可靠）；`doctor` 会把认不出来的原始输出作为诊断信息打出来。
6. `docs/SUPPORTED-APPS.md`、`docs/DISCLAIMER.md` 与根目录社区文档由他人维护，本文件不涉及。

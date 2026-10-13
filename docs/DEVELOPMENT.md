# 开发说明（DEVELOPMENT）

面向维护者：本文件说明 `artcraft-hanhua` 的架构、模块职责、关键不变量与测试策略。

> 用户向文档在仓库根目录的 `README.md`；本文件只讲实现。
> 支持矩阵与实测证据由 `docs/SUPPORTED-APPS.md` 负责，这里不重复。
>
> 目录：[1 形态与约束](#1-形态与约束) ｜ [2 目录与模块职责](#2-目录与模块职责) ｜ [3 数据流](#3-数据流) ｜
> [4 关键不变量](#4-关键不变量改代码时不要破坏) ｜ [5 目标分类与处置](#5-目标分类与处置) ｜ [6 翻译数据格式](#6-翻译数据格式实测) ｜
> [7 主程序补丁（已实现）](#7-主程序补丁srcartcraft-patchmjs已实现) ｜ [8 测试策略](#8-测试策略) ｜
> [9 质量闸门与发布前检查表](#9-质量闸门与发布前检查表) ｜ [10 已知限制/待办](#10-已知限制--待办) ｜ [11 受控的不汉化清单](#11-受控的不汉化清单为什么有些词始终是英文)

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
│  ├─ artcraft-patch.mjs        # 主程序二进制补丁（**已实现**，见第 7 节）：PE 解析、phf 定位、替换、CSP 重算、自检
│  ├─ sysenv.mjs                # 平台/Node 版本/系统区域/%APPDATA%/%LOCALAPPDATA%/临时目录
│  ├─ render.mjs                # 人类可读输出（中文为主，宽字符对齐的表格）
│  └─ commands/
│     ├─ detect.mjs  hanhua.mjs  revert.mjs  verify.mjs  doctor.mjs
├─ data/translations.tsv        # 翻译数据（2803 条，英文 → 中文）
├─ tools/
│  ├─ check-coverage.mjs        # 发布前检查：补丁后的 bundle 里还剩哪些界面英文（需用户本机解包产物，见第 9 节）
│  ├─ check-mixed-language.mjs  # 质量闸门：译表里的「半译」条目（CI 会跑）
│  ├─ allowlist.json            # 允许清单：品牌/格式/单位/键名/内部标识
│  └─ mixed-language-baseline.txt # 基线：已分类但尚未定性的 token（**不是用来刷绿的**）
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

8. **主程序补丁失败时优雅降级。**
   `applyMainPatch()` 先看 `isPatchSupported()`：版本不在 `SUPPORTED_MAIN_VERSIONS` 里（或读不到版本）
   就**不调用补丁**，把主程序标为 `skipped`；补丁真的抛错（非 PE、自检失败、写盘后哈希不符等）时标为 `pending`，
   打印原因、继续处理其余目标，**退出码仍为 0**；只有加 `--require-main` 时才返回 `1`。
   ——「失败即放弃写盘」比「尽量写点什么」重要：主程序补丁写坏等于用户的软件打不开。

   > ⚠️ 已知的一个不对称（**不要当成设计意图**）：`--require-main` 只把 `pending` 当成失败（`src/commands/hanhua.mjs`
   > 的 `pendingRequired` 判定只看 `TARGET_STATUS.PENDING`）。所以「版本不支持 ⇒ `skipped`」时即使加了
   > `--require-main` 也仍然返回 `0`。要不要把 `skipped` 一并纳入，需要先决定语义（"没处理" 与 "处理失败" 是否同等），
   > 改动前请先看 `test/hanhua-revert.test.mjs` 里 `--require-main` 的用例。

---

## 5. 目标分类与处置

14 项 = 主程序 1 + Launcher 1 + Craft App 12。

| 类型 (`kind`) | 处置 | 目标 |
| --- | --- | --- |
| `binary-patch` | 调 `src/artcraft-patch.mjs`（**已实现**；版本门 + 非 PE/不支持版本/自检失败都会显式报错） | ArtCraft 主程序 |
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

`data/translations.tsv`（v3 表：**148 445 字节**，2803 数据行，2804 个 LF，无 BOM、无 CR）：

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
- 英文**精确去重后是 2772 个不同字符串**，忽略大小写去重后也是 **2772**：
  恰好有 **31 组**英文"只差大小写"，每组 **2 行**（共 62 行），例如
  `Cost Calculator` / `Cost calculator`、`Save Scene` / `Save scene`、`3D model` / `3D Model`、
  `Pick from library` / `Pick from Library`、`Edit easing` / `Edit Easing`。
  这 31 组的中文译文**完全相同**，所以不会有"同英文不同中文"的歧义；
  但用大小写不敏感的匹配器就会在这 31 个键上撞车 —— 所以匹配必须**大小写敏感**
  （`3D model` 与 `3D Model` 是两条独立规则，各自匹配各自大小写的字面量；若把两条并成一条，
  两种写法里就必有一种漏译，或者被替换成另一种大小写）
- 有 **173 条**英文文案首尾带空格（如 ` layers. Recommended...`），这些空格是**内容的一部分**，
  匹配时不能 `trim()`，否则对不上 exe 里的原始字符串
- 没有「同英文不同中文」的冲突

加载校验（`src/translations.mjs`）：条数必须等于 `EXPECTED_TRANSLATION_COUNT`（`src/constants.mjs`，2803）、
每行必须 3 列、每个字段不能为空、id 必须是 4 位数字；任何一条不满足就**报错而不是静默**。
数据文件确实更新时，改常量或调用 `parseTranslations(text, { allowCountMismatch: true })`。

---

## 7. 主程序补丁（`src/artcraft-patch.mjs`，**已实现**）

> 本节按**当前代码**描述，不再是计划。若代码与本文件冲突，以代码为准，并请顺手更新本文件。

### 7.1 接口版本与版本门

```js
export const ARTCRAFT_PATCH_VERSION = 2;             // 接口版本；算法/签名语义变了才 +1（1 → 2 是"算法接入"那次）
export const SUPPORTED_MAIN_VERSIONS = ['0.41.0'];   // 实测确认过的主程序版本
```

- **版本门**：`isPatchSupported({ exePath, version?, exec? })` → `{ supported, version, reason }`。
  版本不在 `SUPPORTED_MAIN_VERSIONS` 里就**拒绝**，`hanhua` 把主程序标为 `skipped`，不会盲改。
- **读版本**走 PowerShell（`readExeVersion` / `readExeVersions`）：Node 内置模块读不了 PE 版本资源，
  而本项目不允许第三方依赖。`defaultPowerShellExec` 依次尝试 `powershell.exe` / `pwsh.exe`，可注入替换以便测试。
  读不到版本时按「不支持」处理（见第 1 节的沙箱注意点）。

### 7.2 导出清单（实际）

```js
// 常量 / 实测基线
ARTCRAFT_PATCH_VERSION, SUPPORTED_MAIN_VERSIONS, PHF_ENTRY_SIZE, SECTION_HEADER_SIZE,
PHF_FIELD_OFFSET, REFERENCE_FACTS, CSP_HASH_TEXT_LENGTH, CSP_BASE64_ALPHABET,
HTML_REPLACEMENTS, LITERAL_QUOTES, BROTLI_PARAMS

// PE / phf
parsePe(image)                                  // → { peOff, optOff, secOff, nsec, imageBase, sizeOfImage, sections, ... }
rvaToOffset(pe, rva)                            // RVA → 文件偏移（跨节返回 null）
findPhfEntries(pe, data, { expectedTableOffset, requiredKeys, expectedHashes, minEntries, clusterGap })

// 译表与替换
parseTranslationTable(text, { requireCount })
normalizeTranslations(translations)              // {id,en,zh}[] 或 Record<en,zh> → 统一形态
buildReplacementPlan(entries)                    // 每条译文生成 dq/sq 两个搜索键，长的在前
applyReplacementPlan(text, plan)                 // → { text, hits, misses, applications, identical }
replaceSequentially(text, plan)                  // 逐条 replace 的参考语义（测试用对照）

// CSP
digestToCspBase64(digest), cspHashOf(raw)
recomputeCspHashes({ image, decompressedAssets }) // 旧哈希**原位**替换（长度不变）
verifyCspHashes({ image, htmlAssets, oldHashes }) // 双向集合校验（见 7.5）

// brotli / 资源
brotliDecompress(bytes), brotliCompress(raw)
readEmbeddedAssets(image, { expectedTableOffset, requiredKeys, expectedHashes, decompressAll })

// 补丁主体
applyPatchToImage({ image, translations, log, expectedTableOffset })   // 纯函数：输入 Buffer，返回报告
patchMainApp({ exePath, outPath, translations, translationsFile, requireTranslationCount, log })
defaultPatchedExePath({ exePath, outPath })      // 默认产物 artcraft-zh-full.exe（不覆盖原 exe）
compareImages(a, b)                              // 逐字节比较，返回首个差异偏移（相同 → -1）

// 版本
normalizeVersion(version), parseExeVersions(stdout, wantedPaths),
readExeVersions({ paths, exec }), readExeVersion({ exePath, exec }),
isPatchSupported({ exePath, version, exec }), loadPatchTranslations({ ... })
```

### 7.3 算法要点

- Tauri v2 `EmbeddedAssets` 是编译期生成的 `phf::Map<&str, &[u8]>`，静态数据在 `.rdata`。
- phf 条目**定长 40 字节**：`hash | key.ptr | key.len | value.ptr | value.len`，
  字段偏移见 `PHF_FIELD_OFFSET`（0/8/16/24/32）。ptr 是**绝对 VA**，需按节表换算文件偏移。
- **phf 表用搜索式定位**（`findPhfEntries`），不硬编码偏移：
  8 字节步进扫**只读数据节**（可写节/代码节一律不扫），候选必须满足 5 字段不变量
  （hash 不像指针、key/value 指针落在映像内、key 以 `/` 开头且全可打印、偏移可换算且不出界），
  再要求候选**成簇**、key 去重后达到 `minEntries`，并对目标 key 做 **hash 与 brotli 解压内容指纹**校验。
  实测这一版：候选窗口 228 个、簇落在 `.rdata` `0x3cf0428..0x3cf2220`、去重后 225 条
  （参考实现把 key 为 `/` 与 `/=` 的 2 条噪音也算进去，得 227 条；3 个目标条目的定位完全一致）。
  `expectedTableOffset` 只是**可选断言**：给了就核对首条偏移，不给也能工作。
  **不要把 225/228 当常量**——换版本后应由搜索 + 断言重新判定。
- 每条 value 是**独立的 brotli 流**（`quality=11`、`lgwin=24`、`mode=text`，见 `BROTLI_PARAMS`）。
- 译文替换后长度变化，因此**不能就地覆盖**：追加新的 PE 段 `.asst`
  （属性 `0x40000040` = `INITIALIZED_DATA | MEM_READ`，**不含代码、不可写**），
  **只改 phf 条目里的 `value.ptr` / `value.len`**，key/hash 与表结构一个字都不动。
  同时更新节表、`NumberOfSections`、`SizeOfImage`（必须仍为 `SectionAlignment` 的整数倍），并把 `CheckSum` 置 0。
- `index.html` 的 CSP 里有 `sha256-<44 字符 base64>` 明文串（每条**固定 51 字符**，可原位替换）。
  改动过的资源其旧哈希必须**恰好 1 处**命中并替换为按**新的解压内容**算出的哈希，否则 WebView2 拒绝执行内联脚本、界面白屏。
- 产物另存为新文件、不覆盖原 exe；打过补丁的 exe 数字签名必然失效（预期行为）。

### 7.4 `REFERENCE_FACTS` 是什么（**断言基线，不是凑出来的数**）

`REFERENCE_FACTS` 是**对 v0.41.0 这一份构建的实测记录**：原件/产物字节数、参考产物 SHA-256、
phf 首个条目偏移与条目数容差、新段名与属性、三个被改资源的原始/压缩字节数、
两条 CSP 哈希（改动前/后）、译表条数与落地替换次数等。

它的用途是**拒绝"差不多的输入"**：字节数、条目数、hash 字段对不上就直接抛错，而不是继续写一个可能启动不了的 exe。
需要注意两点：

1. 它是**某一版译表的参考值**。`REFERENCE_FACTS.translations.total`（2803）目前带注释说明
   "只作为参考报告值，不做硬断言"——译表会变，断言应读实际数据（见第 8 节）。
2. 它**不代表"可复现"**：见 7.6 的可复现性边界。

### 7.5 自检与改动审计（`report` 里能看到什么）

`applyPatchToImage()` 返回普通对象（可 JSON 序列化），关键字段：

| 字段 | 含义 |
| --- | --- |
| `bytes` / `sha256` | 产物字节数与 SHA-256 |
| `pe.sectionCountBefore/After`、`pe.sizeOfImageAfter`、`pe.sectionAlignment`、`pe.fileAlignment` | PE 结构断言（实测 6 → 7 节、`SectionAlignment = 0x1000`、`SizeOfImage = 78680064` 为对齐倍数） |
| `section` | 新段 `.asst` 的 RVA / rawsize / payload / rawptr |
| `phf` | 条目数、表偏移、簇跨度、候选数、可解压条数、目标 key 数（3）、不可用条数 |
| `assets` / `compressed` | 三个资源的替换前后字节数、新 brotli 流长度 |
| `translations` | `total` / `hit` / `miss` / `applications` / `identicalTranslations` / `misses` |
| `audit.changedInside`、`audit.changedOutside` | 改动字节审计：**白名单外必须为 0**，否则抛错 |
| `selfCheck.assetsRoundTrip`、`selfCheck.cspOk`、`selfCheck.jsCspHash`、`selfCheck.cspHashesInBinary`、`selfCheck.cspExtras` | 产物自检（解压回读 + CSP 双向集合校验） |
| `csp.replacements` / `scriptSrc` / `styleSrc` | CSP 重算明细 |

`verifyCspHashes()` 是**双向**的：既检查"每个内联脚本都有对应哈希"（`missing`），
也报告"二进制里有但脚本里没有"的多余哈希（`extras`）；`oldHashes` 还会检出**旧哈希残留**（`residualOld`）。
三者任一非空即 `ok: false`。

`patchMainApp()` 在 `applyPatchToImage()` 之上做**写盘后回读校验**：
长度与 SHA-256 都与报告不符就抛错，最后返回 `{ exePath, outPath, replaced, bytes, sha256, report }`。

### 7.6 可复现性边界：**"解压后资源逐字节一致"，不是"整文件 sha256 一致"**

这是本项目对外承诺的验收标准，请务必按这个口径理解（也按这个口径写测试）：

1. **硬标准：解压后资源逐字节一致。** 产物里三个资源（`/index.html`、`/assets/index-IL-0eMku.js`、
   `/assets/index-DTSJQQsq.css`）解压后的字节必须与参考实现一致。
2. **硬标准：结构自洽。** `audit.changedOutside === 0`、`selfCheck.cspOk === true`、
   `SizeOfImage % SectionAlignment === 0`、新节只读且不含代码、既有节的 VA/rawptr 一个都没动、`CheckSum = 0`。
3. **不是硬标准：整文件 sha256。** 整文件哈希只有在**同一个 brotli 实现**下才有意义。

**为什么 brotli 会让整文件哈希失效**：`quality=11 / lgwin=24 / mode=text` 相同的两个**不同实现**
（例如 Python 的 `brotli` 模块与 Node 的 `zlib`），**不保证输出相同字节**——块划分、字典匹配、
上下文建模的实现细节都可能不同。压缩流字节一变，新段 payload、产物长度与整文件哈希跟着全变。
所以：

- 整文件字节数/哈希只能作为**信息性输出**（用来发现"这一次比上一次差了很远"），
  不能作为跨实现、跨环境、跨版本的**验收断言**；
- 实测上，Node `zlib` 与参考实现在**这一份数据上**恰好逐字节相同，
  测试里因此也保留了整文件比较——但**那是这份数据与这两个实现的巧合，不是承诺**；
- 第三方复算不一致时，应先比对**解压后资源**与结构字段，而不是先怀疑补丁写坏了。

与之配套的其它可复现性措施：`BROTLI_PARAMS` 固定、**不写任何时间戳**、不动 `TimeDateStamp`、不写调试目录。
brotli 库本身**未锁定版本**（Node 内置 zlib 随 Node 版本走）——这也是把整文件哈希降级为信息性输出的理由之一。

### 7.7 接入约定

`translations` 接受 `{id, en, zh}[]`（`toTranslationList()`）或 `Record<english, chinese>`（`toTranslationMap()`）；
也可以用 `translationsFile` + `requireTranslationCount` 直接给译表路径。`log(message)` 用于打印进度。
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
  `--json` 与退出码、非 Windows 报错，以及补丁模块（见下）
- 新增目标时请同步：`test/commands.test.mjs` 的目标计数，以及 `src/constants.mjs` 的期望条数（若数据变）

### 8.1 补丁模块的测试（两个文件，职责不同）

| 文件 | 内容 | 何时跑 |
| --- | --- | --- |
| `test/artcraft-patch.test.mjs` | 接口版本与支持列表、版本规范化、`parseExeVersions`、`isPatchSupported`、产物路径、`patchMainApp` 的显式报错 | 默认（`node --test`） |
| `test/artcraft-patch-algorithm.test.mjs` | 译表解析、替换计划与排序/大小写/不 trim、CSP 重算与双向校验、`findPhfEntries` 的定位与拒绝、**合成镜像**上的 `applyPatchToImage` 全流程、PE 常量断言 | 默认；其中端到端用例需 `ARTCRAFT_FULL_TEST=1` |

- 绝大多数用例在**合成镜像**上跑，不读真实 exe，因此 CI 与本地都能跑。
- **端到端用例**（"原件 + 权威译表 → 产物"）需要 77 MB 原件与参考产物，被 `ARTCRAFT_FULL_TEST=1` 门控，
  默认 `skip`（理由：约 1 分钟 brotli q11 重压）。**CI 不设这个环境变量，所以它在 CI 里永远不跑。**
- 该用例目前依赖**绝对路径**（原件与参考产物的候选列表、参考解压目录），
  并且"与 extract-csp 参考解压结果比对"那一步有**两个 `continue`**：
  `if (!fs.existsSync(refPath)) continue;`（缺文件）与 `if (!exported.equals(refAssets…)) continue;`（旧版导出）。
  **两步都会静默通过**，也就是说"这一步没报错"不等于"和参考解压结果一致"。
  注意：真正与本次参考产物比对的**硬断言**是上面那条
  `reread.assets.get(key).raw.equals(refAssets.assets.get(key).raw)`（不走文件系统），
  所以"解压后一致"这条标准**本身没有失守**；失守的是"再对一遍 extract-csp"这一层冗余检查。
  跑 e2e 前先确认这些路径存在，别把"绿了"当成多一层验证。这一条已列入第 10 节的待办。

依赖注入是本项目可测性的关键：`fs`、`env`、`platform`、`registryReader`、`exeVersionExec`、`state`
都可以从 `createContext(options, deps)` 传入，命令函数本身不读全局状态（除 `process.versions` 与 `os.tmpdir()`）。

---

## 9. 质量闸门与发布前检查表

仓库自带两个检查脚本，**它们不是同一类东西**：一个能在 CI 里跑（输入在仓库内），
另一个**只能在本机跑**（输入是解包出来的宿主资源，而仓库不允许携带宿主资源）。把它们混为一谈，
就会出现"看起来有闸门、其实没人跑"的状态。

### 9.1 `tools/check-mixed-language.mjs`（半译门禁，**已接进 CI**）

**它查什么**：译表的中文列里，那些**不在允许清单**里的拉丁词串——即"选了 `keyframe` 但没译完"这类半译条目。

```powershell
# 与 CI 完全一致的调用（注意：必须显式给 --baseline）
node tools/check-mixed-language.mjs data/translations.tsv `
  --allow tools/allowlist.json `
  --baseline tools/mixed-language-baseline.txt
```

参数与退出码：

| 参数 / 退出码 | 含义 |
| --- | --- |
| 位置参数（省略则用 `data/translations.tsv`） | 待检查的译表 |
| `--allow <json>` | 允许清单；默认 `tools/allowlist.json`（脚本内还有一份内置默认表） |
| `--baseline <txt>` | 基线文件；**不给就相当于基线为空**，所有既有问题都会算成"新增"而失败 |
| `--out <tsv>` | 另存一份报告（`english / chinese / offending_tokens`），便于逐条过 |
| `--fix` | ⚠️ **帮助里写了，但当前代码没有实现这个分支**；不要依赖它，也不要以为它改了什么 |
| 退出码 `0` | 干净：没有"既不在允许清单、也不在基线"的 token |
| 退出码 `2` | 出现**新**的未分类拉丁 token（CI 会因此变红） |
| 退出码 `1` | 用法/输入错误（清单解析失败、译表不存在） |

> `package.json` 里的 `npm run check-mixed-language` **没有**带 `--baseline`。
> 想在本地复现 CI 的判定，请用上面的显式命令，别用那个 npm script。

**三条判断准则（务必按这个顺序想）**：

1. **该改译文 → 就改译文。** 如果这个英文词是**用户能看到的界面文案**（`Stage`、`Splat`、`Setup`、
   `keyframe`、`surface`、`History`……），正确做法是把它译掉、统一术语，**不是**加白名单。
   历史证据：`merge-v2-report.txt` 里的 110 条 `v2-fix*.tsv` 修正就是这么做出来的。
2. **该加允许清单 → 才加允许清单。** 只有"品牌 / 模型名 / 文件格式 / 单位 / 键盘键名 / 缩写 / 内部标识"
   可以进 `tools/allowlist.json`。这是它 `_comment` 里写死的规则（原文见第 11 节）。
3. **都不确定 → 才进基线，而且必须带上理由。** `tools/mixed-language-baseline.txt` 是给
   "已核对过、但一时无法定性"的 token 留的**可见欠账**：它让**新**问题立刻失败，同时让**旧**问题继续暴露在报告里。
   **基线不是用来刷绿的**——把新出现的半译 token 丢进基线，等于把闸门关掉；评审时看到基线里多了一行，
   就应该追问"为什么不是改译文、为什么不是允许清单"。token 不再出现时应当**修剪**（脚本会提示）。

### 9.2 `tools/check-coverage.mjs`（残留英文检查，**只能本机跑**）

**它查什么**：对**解压后的 bundle.js** 做字符串字面量抽取与分类，报告**汉化后仍然残留的界面英文**。

```powershell
npm run check-coverage -- <原始bundle.js> <汉化后bundle.js> data/translations.tsv
# 等价于：node tools/check-coverage.mjs <原始> <汉化后> data/translations.tsv [--out residual.tsv]
```

| 参数 / 退出码 | 含义 |
| --- | --- |
| 第 1 个参数 | **原始**（未汉化）解压出来的 bundle.js |
| 第 2 个参数 | **汉化后**同一份资源的解压结果（来自补丁产物） |
| 第 3 个参数 | 译表（`data/translations.tsv`），用于判断"这条是不是已经译过" |
| `--out <tsv>` | 报告落盘路径，默认 `residual.tsv` |
| 退出码 `0` | 没有高置信度残留 |
| **退出码 `2`** | **发现了高置信度的残留界面英文**（带 UI 属性上下文的那些）——这就是"真的有漏译" |
| 退出码 `1` | 用法/输入错误（少参数、译表解析不出任何行） |

报告里的两列最有用：`occurrences`（出现次数，多说明是高频界面词）与 `ui_context`
（是否出现在 `children:` / `placeholder:` / `title:` 之类的 UI 属性上下文里 → **高置信度**）。

**为什么它不能进 CI**：

- 它需要**用户本机解包出来的两个 bundle.js**。这两个文件来自 ArtCraft 安装目录里的 exe，
  是**宿主的资源**；
- 本仓库明确规定**不得携带任何宿主二进制或解包资源**，`repo-guard` 任务会拒绝 `*.exe`/`*.zip`/字体等，
  并对超过 2 MiB 的文件报错；
- 所以它**不可能有仓库内的输入**。没有输入就无法做成 CI 门禁——不是"懒得接"，是口径不允许。

**怎么拿到这两个输入**（只在本机，产物不要提交）：

1. 原始 bundle：从你自己的 `artcraft.exe` 内嵌 phf 表里取出 `/assets/index-IL-0eMku.js` 并 brotli 解压；
2. 汉化后 bundle：从 `hanhua` 生成的 `artcraft-zh-full.exe` 里按同样路径取出并解压；
3. 两者都只是纯文本 JS，可以直接丢给 `check-coverage`。

> `tools/check-coverage.mjs` 的文件头注释写着 "see docs/DEVELOPMENT.md"——**就是本节**。
> 早期版本的本文件里没有它，这是补上的那一节。

### 9.3 发布前检查表（本机，需要你自己解包）

打 tag / 发版前，按顺序走一遍。**凡需要宿主资源才能做的，都标了"仅本机"。**

| # | 检查 | 命令 | 需要什么 |
| --- | --- | --- | --- |
| 1 | 全部单测 | `node --test` | 仓库内即可 |
| 2 | 译表结构 | CI `static` job 的同一套断言（行数读 `src/constants.mjs`、3 列、无 BOM） | 仓库内即可 |
| 3 | 半译门禁 | 9.1 的显式命令（**带 `--baseline`**） | 仓库内即可 |
| 4 | 残留英文 | `npm run check-coverage -- <原始> <汉化后> data/translations.tsv` | **仅本机**：两个解包后的 bundle.js |
| 5 | 端到端补丁 | `$env:ARTCRAFT_FULL_TEST='1'; node --test` | **仅本机**：77 MB 原件 + 参考产物 + 参考解压目录 |
| 6 | 产物自检 | 读 `hanhua` 报告里的 `selfCheck.cspOk`、`audit.changedOutside`、`pe.sizeOfImageAfter % sectionAlignment` | **仅本机**：真实 exe |
| 7 | 启动冒烟 | 启动 `artcraft-zh-full.exe`，界面为中文、无白屏、无 CSP 报错 | **仅本机**：真实安装 |

> 第 4、5、6、7 项的产物与解包资源**一律不要提交**；第 5 项缺参考文件时不要相信"绿了"（见 8.1）。

---

## 10. 已知限制 / 待办

1. **主程序补丁已实现，但仍标为 experimental**：`src/artcraft-patch.mjs` 已能完成"解包 → 替换 → 追加只读段 →
   改 phf 条目 → 重算 CSP → 自检 → 写盘回读校验"全流程（`ARTCRAFT_PATCH_VERSION = 2`），
   但**只对 `SUPPORTED_MAIN_VERSIONS = ['0.41.0']` 这一份实测构建负责**；其它版本一律拒绝，不盲改。
   对真实用户的端到端验证情况以 `docs/SUPPORTED-APPS.md` 的实测表为准。
2. **DesignCraft / PdfCraft / FilmCraft 的方框缺字**是上游内嵌字体的 CJK 渲染缺陷，本工具不修（不做二进制字体替换）。
3. **`verify` 的退出码**只反映「报告是否成功生成 / 是否有硬错误」，不代表「都已汉化」；
   要判断汉化状态请读 `verified` 字段（`localized` / `notLocalized` 计数）。
4. **非交互环境必须显式 `--yes`**：这是刻意的，避免脚本里静默改文件；`--dry-run` 不需要确认。
5. 注册表读取失败时统一按「键不存在」处理（`reg query` 对不存在与非权限错误都返回 1，
   而错误信息是本地化的，靠文本判断不可靠）；`doctor` 会把认不出来的原始输出作为诊断信息打出来。
6. **e2e 用例里的两个 `continue` 静默跳过**（见 8.1）：参考解压目录不存在、或导出结果与本次参考产物不一致时，
   那一层冗余比对会静默通过。应当改成显式失败或带原因的 `t.skip`；同时把绝对路径改成环境变量/仓库相对路径。
7. **`--require-main` 与 `skipped` 的不对称**（见第 4 节第 8 条）：版本不支持时主程序被标为 `skipped`，
   该状态不触发 `--require-main` 的失败。
8. **`tools/check-mixed-language.mjs` 的 `--fix` 仅存在于帮助文本**，未实现；`npm run check-mixed-language`
   也没带 `--baseline`。用 9.1 的显式命令。
9. **整文件哈希不是验收标准**（见 7.6）：可复现性以"解压后资源逐字节一致 + 结构自洽 + CSP 正确"为准。
10. `docs/SUPPORTED-APPS.md`、`docs/DISCLAIMER.md` 与根目录社区文档由他人维护，本文件不涉及。

---

## 11. 受控的不汉化清单（为什么有些词始终是英文）

以下条目**刻意不汉化**，不是漏译。管理规则就是 `tools/allowlist.json` 的 `_comment` 原文：

> "Tokens that legitimately stay Latin inside Chinese UI text. Anything not listed here (and not matched by the
> library-message patterns in check-mixed-language.mjs) is reported as a half-translated string. Keep this list to
> brands, model names, file formats, units, keyboard keys, acronyms and internal identifiers - **never add a word
> that is really user-visible UI text** (for example Stage, Splat, Setup, keyframe, surface, History)."

即：**允许清单只能加"品牌 / 模型名 / 文件格式 / 单位 / 键盘键名 / 缩写 / 内部标识"，
绝不允许把用户可见的英文单词加白。** 这条规则与 9.1 的三条判断准则配套，
目的是让"不用允许清单掩盖漏译"成为**可审查**的约定。

| 类别 | 例子 | 理由 |
| --- | --- | --- |
| ID3 标准流派枚举 | `Pop`、`Classic rock`、`Instrumental`、`Experimental`、`New age`、`Rhythm and blues`（192 条） | MP3/MP4 元数据解析器直接用这些值；翻译等于篡改格式枚举，写进文件后其它播放器读不懂 |
| 形状名与 `media_id` 同字面量 | `Cylinder` / `Donut` / `Sphere` / `Water` | 这些字面量同时当 `media_id` 用，翻译会让英文版存过的场景匹配失败 |
| 品牌与模型名 | Midjourney、Runway、Kling、Sora、Seedance、Nano Banana、Stable Diffusion、ComfyUI 等 | 专有名称，翻译造成指代错误 |
| 库/运行时开发者报文 | React Aria / Three.js / Konva 的报错与警告 | 常被开发者拿去搜索官方资料；译了就没法检索 |
| 键盘键名 | `Enter` / `Shift` / `Ctrl` / `Esc` / `Tab` / `PageUp` 等 | 物理标识，不是文案 |
| 库/框架类名与字段 | `OrbitControls.js`、`ObjectLoader`、`DepthTexture`、`aria-hidden`、`Symbol.dispose` 等 | 代码标识符，翻译会破坏语义与可检索性 |
| 内部 slug / id | `sparkviewpoint`、`Image1`、`Video1`、`sh1`、`UUIDv7` 等 | 内部标识符，改动会导致匹配失败 |

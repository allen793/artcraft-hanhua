# 支持矩阵与实测状态 / Supported Apps

> **数据来自 2026-10 的实测，版本更新后可能变化。**
> The data below comes from hands-on testing in **October 2026** and may change after upstream updates.

本页逐项列出 ArtCraft 创作套件中 **14 个程序**（ArtCraft 主程序 1 个 + ArtCraft Launcher 1 个 + Craft App 12 个）的汉化实测状态、技术原因与观察到的缺陷。**不以"能汉化"为目标美化结论**：无法汉化的程序会被明确标为无法汉化，并在原因栏写出上游限制。
This page lists, program by program, the measured localization status, technical cause, and observed defects for the **14 programs** in the ArtCraft creative suite (1 main app + 1 launcher + 12 Craft Apps). Unsupported programs are called unsupported, with the upstream limitation stated as the reason.

[中文](#中文) ｜ [English](#english)

---

## 中文

### 实测环境

| 项目 | 值 |
| --- | --- |
| 测试时间 | 2026-10 |
| 平台 | Windows |
| ArtCraft 主程序 | v0.41.0（Tauri + WebView2） |
| ArtCraft Launcher | v0.3.2 |
| 工具形态 | Node.js CLI，零第三方依赖，Node >= 18 |

### 状态总表

图例：✅ 可汉化 ｜ 🟦 原生自带简体中文 ｜ ⚠️ 可汉化或本身为中文，但存在已确认的显示缺陷 ｜ ❌ 无法汉化

| # | 程序 | 类别 | 状态 | 语言入口 / 原因 |
| --- | --- | --- | --- | --- |
| 1 | ArtCraft 主程序 | 主程序 v0.41.0 | ⚠️ **可汉化（实验性）** | 无可写的外部语言文件；需替换 exe 内嵌前端资源 |
| 2 | ArtCraft Launcher | Launcher v0.3.2 | ✅ 可汉化 | `<安装目录>\launcher\ArtCraftLauncherData\app.ron` → `(language: "zh-CN")` |
| 3 | DesignCraft | Craft App | ⚠️ 可汉化（有显示缺陷） | `ui.json` 的 `language` → `"zh"`；部分汉字显示为方框 |
| 4 | LightCraft | Craft App | ✅ 可汉化 | `ui.json` → `{"language":"zh-hans"}`，中文显示完美 |
| 5 | EffectCraft | Craft App | ✅ 可汉化 | `prefs.json` 的 `general.language` → `"zh-hans"` |
| 6 | WordCraft | Craft App | 🟦 原生中文 | 自带简体中文，跟随系统区域，无需改动 |
| 7 | PhotoCraft | Craft App | 🟦 原生中文 | 同上 |
| 8 | VectorCraft | Craft App | 🟦 原生中文 | 同上 |
| 9 | GridCraft | Craft App | 🟦 原生中文 | 同上 |
| 10 | PdfCraft | Craft App | ⚠️ 原生中文（**大量**方框缺字） | 界面本身是中文；上游字体缺陷导致大量汉字显示为方框 |
| 11 | FilmCraft | Craft App | ⚠️ 原生中文（少量方框缺字） | 同上，缺字数量较少 |
| 12 | CADCraft | Craft App | ❌ 无法汉化 | 程序内语言设置只接受 `auto / en / uk` |
| 13 | DeckCraft | Craft App | ❌ 无法汉化 | 程序内没有任何语言设置 |
| 14 | SoundCraft | Craft App | ❌ 无法汉化 | 程序内没有任何语言设置 |

统计：可汉化 5 个（含 1 个实验性、1 个有显示缺陷）｜原生中文 6 个（其中 2 个有缺字）｜无法汉化 3 个。

### 不支持清单（明确写清"哪里不支持"）

上表是"每个程序能不能汉化"，下面这张表是"**支持范围内的版本边界**"。
把边界只写在代码里，等于让用户自己踩。数据源：`src/artcraft-patch.mjs` 的 `SUPPORTED_MAIN_VERSIONS`。

| 范围 | 支持情况 | 说明 |
| --- | --- | --- |
| **主程序补丁：ArtCraft 主程序 v0.41.0** | ✅ **已实测** | `SUPPORTED_MAIN_VERSIONS = ['0.41.0']`。这是唯一被实测确认过的构建 |
| **主程序补丁：其它任何版本** | ❌ **未适配** | phf 表的位置与条目集合会随构建变化。工具会**明确拒绝**（`hanhua` 把主程序标为跳过并打印原因），**不会盲改**——盲改可能让程序打不开 |
| **主程序补丁：非 PE 输入 / 读不到版本** | ❌ 拒绝 | 会给出明确报错，不会尝试写入 |
| **Language 配置类改写（Launcher / DesignCraft / LightCraft / EffectCraft）** | ✅ 按上表 | 与主程序版本无关，但**同样会被上游更新覆盖**，更新后需重跑 `hanhua` |

### 不支持 / 无法汉化的三类情形（按原因分）

| 情形 | 程序 | 原因 | 我们做不做 |
| --- | --- | --- | --- |
| **上游没有中文，且没有语言入口** | CADCraft | 语言设置只接受 `auto / en / uk`，写入 `zh` 一类值会被忽略 | 不做。这只能由上游加中文，或走"改程序本体"的高风险路线 |
| **上游没有中文，且没有语言设置** | DeckCraft、SoundCraft | 程序内没有任何语言设置，也没有可改写的语言配置文件 | 不做，同上 |
| **本身是中文，但缺字（方框）** | PdfCraft（大量缺字）、FilmCraft（少量缺字） | 上游捆绑的字体缺相应字形导致的 CJK 渲染缺陷；**不是**汉化配置问题 | 不做。本工具**不做二进制字体替换**（在 DesignCraft 上已实测排除"安装中文字体"这一途径） |

补充说明：

- **"仅语言配置"支持的是这 4 个**：ArtCraft Launcher（`app.ron`）、DesignCraft（`ui.json`）、
  LightCraft（`ui.json`）、EffectCraft（`prefs.json`）。它们不改宿主二进制，风险等级低于主程序补丁。
- **原生中文（无需改动）的是 6 个**：WordCraft、PhotoCraft、VectorCraft、GridCraft、PdfCraft、FilmCraft。
  工具只报告，**不写这些程序的文件**。
- **升级后必须重新汉化**：ArtCraft 更新会用官方文件覆盖被改写的内容（配置文件回英文、主程序换新 exe）。
  这**不是汉化失效**，是资产被替换；重跑 `hanhua` 即可。**上游新版发布后、本页与
  `SUPPORTED_MAIN_VERSIONS` 更新之前，请勿套用主程序补丁。**
- **关于自动更新器**：实测（针对 **v0.41.0 这一个构建**）主程序**没有内置自动更新器**，
  因此更新来自手动重装/运行官方安装包；汉化不会被后台静默覆盖。此结论只对 v0.41.0 成立，上游未来版本未知。
- 误报 / SmartScreen / 更新相关的排查步骤见 [docs/FAQ.md](FAQ.md)。

### 逐项说明

#### 1. ArtCraft 主程序 v0.41.0 — ⚠️ 可汉化（实验性）

- **形态**：Tauri + WebView2 桌面应用，界面资源打包在可执行文件内部，磁盘上没有可写的独立语言文件。
- **做法**：解包 exe 内嵌的前端资源，替换其中的界面文本后重新打包，生成 `artcraft-zh-full.exe`；原件备份为 `*.bak-before-hanhua`。
- **状态**：**experimental（实验性）**。原件会自动备份、可回滚、改动前后做哈希校验，但这是对可执行文件的修改，请在操作前保留一份可恢复的安装副本。
- **注意**：程序更新会覆盖被替换的资源，更新后需要重新执行 `hanhua`。

#### 2. ArtCraft Launcher v0.3.2 — ✅ 可汉化

- **做法**：写入 `<安装目录>\launcher\ArtCraftLauncherData\app.ron` 的 `(language: "zh-CN")`。
- **结果**：Launcher 界面切换为简体中文。
- **注意**：必须以 UTF-8 无 BOM 写回，否则配置可能解析失败或回退英文。

#### 3. DesignCraft — ⚠️ 可汉化，但部分汉字显示为方框

- **做法**：写 `ui.json` 的 `language` → `"zh"`。
- **结果**：界面语言切换为中文，但**部分汉字显示为方框**。
- **原因**：上游使用内嵌的**日文字体**渲染 CJK 字符，该字体缺少部分简体中文字形。
- **已排除的修法**：在系统上安装中文字体后重新观察，方框依然存在——说明该渲染路径不加载系统字体，**装中文字体无法修复**（已实测排除）。本工具不做二进制字体替换。

#### 4. LightCraft — ✅ 可汉化

- **做法**：写 `ui.json` → `{"language":"zh-hans"}`。
- **结果**：中文显示完美，未观察到缺字。
- **注意**：取值是 `zh-hans`，与 DesignCraft 的 `zh` 不同，两者不可互换。

#### 5. EffectCraft — ✅ 可汉化

- **做法**：写 `prefs.json` 的 `general.language` → `"zh-hans"`。
- **结果**：界面切换为简体中文。

#### 6–9. WordCraft / PhotoCraft / VectorCraft / GridCraft — 🟦 原生自带简体中文

- **做法**：无需改动。
- **结果**：程序自带简体中文界面，跟随系统区域设置即可显示中文。
- **说明**：本工具只在 `detect` 报告中把它们标为"原生中文 / 无需改动"，不会写入这些程序的文件。

#### 10. PdfCraft — ⚠️ 原生中文，但**大量**方框缺字

- **结果**：界面本身即为中文，但**大量**汉字显示为方框。
- **原因**：与 DesignCraft 同类的上游字体缺陷（内嵌字体缺少相应字形）。
- **结论**：本工具无法修复；这是上游问题，不是汉化配置问题。

#### 11. FilmCraft — ⚠️ 原生中文，少量方框缺字

- **结果**：界面本身即为中文，只有**少量**汉字显示为方框。
- **原因**：同 PdfCraft 的字体缺陷，影响范围较小。
- **结论**：本工具无法修复。

#### 12. CADCraft — ❌ 无法汉化

- **原因**：程序内的语言设置**只接受 `auto` / `en` / `uk`**。写入 `zh`、`zh-CN`、`zh-hans` 等值会被忽略或被视为无效。
- **结论**：除非上游加入简体中文，否则无法在不修改程序本体的前提下汉化；本项目不做此类修改。

#### 13. DeckCraft — ❌ 无法汉化

- **原因**：程序内**没有任何语言设置**，也没有可改写的语言配置文件。
- **结论**：无法汉化。

#### 14. SoundCraft — ❌ 无法汉化

- **原因**：与 DeckCraft 相同，程序内**没有任何语言设置**。
- **结论**：无法汉化。

### 如何更新本页

新增或修改某个程序的支持状态时，请在 PR 中一并提供：程序名与版本、配置文件路径与写入的字段值、执行前后的关键输出、`revert` 后的状态，以及观察到的显示缺陷。**不要提交程序二进制或原始资源文件。** 详见 [CONTRIBUTING.md](../CONTRIBUTING.md#adding-language-support-for-a-new-app)。

---

## English

### Test Environment

| Item | Value |
| --- | --- |
| Tested | October 2026 |
| Platform | Windows |
| ArtCraft main app | v0.41.0 (Tauri + WebView2) |
| ArtCraft Launcher | v0.3.2 |
| Tool shape | Node.js CLI, zero third-party dependencies, Node >= 18 |

### Status Overview

Legend: ✅ localizable ｜ 🟦 ships Simplified Chinese natively ｜ ⚠️ localizable or already Chinese, with a confirmed display defect ｜ ❌ cannot be localized

| # | Program | Kind | Status | Language entry point / reason |
| --- | --- | --- | --- | --- |
| 1 | ArtCraft main app | Main app v0.41.0 | ⚠️ **Localizable (experimental)** | No writable external language file; requires replacing resources embedded in the executable |
| 2 | ArtCraft Launcher | Launcher v0.3.2 | ✅ Localizable | `<install dir>\launcher\ArtCraftLauncherData\app.ron` → `(language: "zh-CN")` |
| 3 | DesignCraft | Craft App | ⚠️ Localizable (display defect) | `language` → `"zh"` in `ui.json`; some Han characters render as tofu boxes |
| 4 | LightCraft | Craft App | ✅ Localizable | `ui.json` → `{"language":"zh-hans"}`; Chinese renders perfectly |
| 5 | EffectCraft | Craft App | ✅ Localizable | `general.language` → `"zh-hans"` in `prefs.json` |
| 6 | WordCraft | Craft App | 🟦 Native Chinese | Ships Simplified Chinese, follows the system locale; no change needed |
| 7 | PhotoCraft | Craft App | 🟦 Native Chinese | Same as above |
| 8 | VectorCraft | Craft App | 🟦 Native Chinese | Same as above |
| 9 | GridCraft | Craft App | 🟦 Native Chinese | Same as above |
| 10 | PdfCraft | Craft App | ⚠️ Native Chinese (**many** tofu boxes) | The UI is already Chinese; an upstream font defect leaves many Han characters as boxes |
| 11 | FilmCraft | Craft App | ⚠️ Native Chinese (few tofu boxes) | Same cause, fewer missing glyphs |
| 12 | CADCraft | Craft App | ❌ Not localizable | The in-app language setting accepts only `auto / en / uk` |
| 13 | DeckCraft | Craft App | ❌ Not localizable | The program has no language setting at all |
| 14 | SoundCraft | Craft App | ❌ Not localizable | The program has no language setting at all |

Totals: localizable 5 (1 experimental, 1 with a display defect) ｜ natively Chinese 6 (2 with missing glyphs) ｜ not localizable 3.

### Not-supported list (what exactly is out of scope)

The table above answers "can this program be localized at all?". The tables below state the **version boundary inside the supported range** — a boundary that exists purely in code is a trap for users. Source of truth: `SUPPORTED_MAIN_VERSIONS` in `src/artcraft-patch.mjs`.

| Scope | Support | Notes |
| --- | --- | --- |
| **Main-app patch: ArtCraft main app v0.41.0** | ✅ **Measured** | `SUPPORTED_MAIN_VERSIONS = ['0.41.0']` — the only build actually verified |
| **Main-app patch: any other version** | ❌ **Not adapted** | The phf table's location and entry set change with the build. The tool **refuses explicitly** (`hanhua` marks the main app as skipped with a reason) and **never blind-patches** — blind-patching can leave the program unlaunchable |
| **Main-app patch: non-PE input / unreadable version** | ❌ Refused | Reports a clear error instead of attempting a write |
| **Language-config rewrites (Launcher / DesignCraft / LightCraft / EffectCraft)** | ✅ Per the table above | Independent of the main-app version, but **also overwritten by upstream updates** — re-run `hanhua` afterwards |

### The three kinds of "cannot be localized"

| Case | Programs | Cause | What we do |
| --- | --- | --- | --- |
| **No Chinese upstream, no language entry point** | CADCraft | The language setting accepts only `auto / en / uk`; a `zh` value is ignored | Nothing. Only upstream can add Chinese, or it needs the high-risk "modify the program itself" route |
| **No Chinese upstream, no language setting at all** | DeckCraft, SoundCraft | No in-app language setting and no writable language config file | Nothing, same as above |
| **Already Chinese, but with missing glyphs (tofu boxes)** | PdfCraft (many), FilmCraft (few) | An upstream **bundled font** lacks the glyphs — a CJK rendering defect, **not** a localization-configuration problem | Nothing. This tool does **no binary font replacement** (on DesignCraft, installing a Chinese system font was tested and ruled out) |

Additional notes:

- **"Language config only" covers these 4**: ArtCraft Launcher (`app.ron`), DesignCraft (`ui.json`), LightCraft (`ui.json`), EffectCraft (`prefs.json`). They do not modify the host binary, so their risk tier is lower than the main-app patch.
- **Natively Chinese (no change needed): 6**: WordCraft, PhotoCraft, VectorCraft, GridCraft, PdfCraft, FilmCraft. The tool reports them and **never writes to them**.
- **Re-localize after every update**: an ArtCraft update replaces what was rewritten (config files revert to English, the main executable is replaced). That is **not a broken localization** but a replaced asset; just run `hanhua` again. **Until this page and `SUPPORTED_MAIN_VERSIONS` are updated for a new upstream release, do not apply the main-app patch.**
- **About auto-updaters**: measured on **this v0.41.0 build only**, the main app has **no built-in updater**, so updates come from a manual reinstall / vendor installer run, and your localization is not silently overwritten in the background. This holds for v0.41.0 only; future versions are unknown.
- For false positives / SmartScreen / update troubleshooting, see [docs/FAQ.md](FAQ.md).

### Per-Program Notes

#### 1. ArtCraft main app v0.41.0 — ⚠️ Localizable (experimental)

- **Shape**: a Tauri + WebView2 desktop app whose UI resources are packed inside the executable; there is no separate writable language file on disk.
- **Approach**: unpack the embedded frontend resources, replace the UI strings, repack into `artcraft-zh-full.exe`, and back the original up as `*.bak-before-hanhua`.
- **Status**: **experimental**. The original is backed up automatically, revert is supported, and hashes are verified before and after — but this modifies an executable, so keep a recoverable copy of your installation first.
- **Note**: an upstream update overwrites the replaced resources, so `hanhua` must be run again afterwards.

#### 2. ArtCraft Launcher v0.3.2 — ✅ Localizable

- **Approach**: write `(language: "zh-CN")` into `<install dir>\launcher\ArtCraftLauncherData\app.ron`.
- **Result**: the launcher UI switches to Simplified Chinese.
- **Note**: it must be written as UTF-8 without BOM, or the config may fail to parse and fall back to English.

#### 3. DesignCraft — ⚠️ Localizable, but some Han characters show as boxes

- **Approach**: write `language` → `"zh"` in `ui.json`.
- **Result**: the UI switches to Chinese, but **some Han characters render as tofu boxes**.
- **Cause**: upstream renders CJK with an **embedded Japanese font** that lacks some Simplified Chinese glyphs.
- **Workaround tested and ruled out**: installing a Chinese system font and re-checking did not remove the boxes, which indicates the renderer does not load system fonts. This tool does not perform binary font replacement.

#### 4. LightCraft — ✅ Localizable

- **Approach**: write `ui.json` → `{"language":"zh-hans"}`.
- **Result**: Chinese renders perfectly; no missing glyphs observed.
- **Note**: the value is `zh-hans`, unlike DesignCraft's `zh`. The two are not interchangeable.

#### 5. EffectCraft — ✅ Localizable

- **Approach**: write `general.language` → `"zh-hans"` in `prefs.json`.
- **Result**: the UI switches to Simplified Chinese.

#### 6–9. WordCraft / PhotoCraft / VectorCraft / GridCraft — 🟦 Ship Simplified Chinese natively

- **Approach**: nothing to change.
- **Result**: these programs ship a Simplified Chinese UI and follow the system locale.
- **Note**: the tool reports them as "native Chinese / no change needed" in `detect` and never writes to their files.

#### 10. PdfCraft — ⚠️ Native Chinese, with **many** tofu boxes

- **Result**: the UI is already Chinese, but **many** Han characters render as boxes.
- **Cause**: the same class of upstream font defect as DesignCraft (the embedded font lacks the glyphs).
- **Conclusion**: this tool cannot fix it; it is an upstream issue, not a localization-configuration issue.

#### 11. FilmCraft — ⚠️ Native Chinese, with few tofu boxes

- **Result**: the UI is already Chinese, with only a **few** Han characters rendering as boxes.
- **Cause**: the same font defect as PdfCraft, with a smaller impact.
- **Conclusion**: this tool cannot fix it.

#### 12. CADCraft — ❌ Not localizable

- **Cause**: the in-app language setting accepts **only `auto` / `en` / `uk`**. Values such as `zh`, `zh-CN`, or `zh-hans` are ignored or treated as invalid.
- **Conclusion**: unless upstream adds Simplified Chinese, it cannot be localized without modifying the program itself, which this project does not do.

#### 13. DeckCraft — ❌ Not localizable

- **Cause**: the program has **no language setting** and no writable language config file.
- **Conclusion**: it cannot be localized.

#### 14. SoundCraft — ❌ Not localizable

- **Cause**: as with DeckCraft, the program has **no language setting** at all.
- **Conclusion**: it cannot be localized.

### Keeping This Page Current

When adding or changing the support status of a program, include in the pull request: the program name and version, the config path and the value written, the key output before and after, the state after `revert`, and any display defect observed. **Do not submit program binaries or original resource files.** See [CONTRIBUTING.md](../CONTRIBUTING.md#adding-language-support-for-a-new-app).

# ArtCraft 简体中文本地化工具（非官方）

[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D6.svg)](#支持矩阵)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

> ### ⚠️ 非官方项目声明
>
> - 本项目是**非官方**的社区汉化工具，与 ArtCraft 及其开发团队**没有任何关联**，**未获得其授权、认可或赞助**。
> - 本项目**不包含、不重新分发** ArtCraft 的任何二进制文件、安装包、素材或原始资源；仓库内容仅为**补丁工具源码**与**社区维护的翻译数据**。
> - `ArtCraft` 及相关名称、标识是其各自权利人的商标，本项目仅作事实性指代，不使用其标识作为本项目品牌。
> - 使用本工具即表示你确认自己已**合法拥有**对应的 ArtCraft 安装；请支持正版软件。
> - 完整法律边界与下架承诺见 [docs/DISCLAIMER.md](docs/DISCLAIMER.md)。
>
> <details>
> <summary>⚠️ 使用条款（ToS）提示：本工具会改写宿主程序文件</summary>
>
> 本项目**不是** ArtCraft 的官方组件，也**没有**获得任何授权。它会改写你本机 ArtCraft 安装目录中的
> **语言配置文件**，并在你明确同意的情况下**替换主程序 exe 内嵌的前端资源**。
>
> 这类改动**可能**与 ArtCraft 的最终用户许可协议（EULA）或使用条款相冲突。**本项目不声称这种使用是被允许的，
> 也不声称已获得授权**——这是一个事实性提示，是否使用请你自行判断，**风险自负**。
>
> 我们不提供、不替代、不绕过任何授权或激活机制；工具不联网、不上传任何数据。
> 使用前请先读 [docs/DISCLAIMER.md](docs/DISCLAIMER.md) 与 [docs/FAQ.md](docs/FAQ.md)。
> </details>
>
> **项目生命周期**：若上游官方为 ArtCraft 提供简体中文界面，本项目将转为**归档/维护模式**（见下方
> [项目生命周期](#项目生命周期)）。

一个零第三方依赖的 Node.js 命令行工具：自动识别本机已安装的 ArtCraft 创作套件，为其中可汉化的部分一键切换到简体中文界面，并支持一键回滚到原始状态。

> 主程序（ArtCraft 本体）的汉化需要替换 exe 内嵌资源，在本项目中标记为 **experimental（实验性）**，请先阅读[支持矩阵](#支持矩阵)与[常见问题](#常见问题)。

---

## 目录

- [简介](#简介)
- [功能](#功能)
- [支持矩阵](#支持矩阵)
- [环境要求](#环境要求)
- [安装与快速开始](#安装与快速开始)
- [工作原理](#工作原理)
- [常见问题](#常见问题)
- [项目生命周期](#项目生命周期)
- [法律与免责](#法律与免责)
- [贡献](#贡献)
- [许可证](#许可证)
- [English](#english)

---

## 简介

ArtCraft 创作套件由主程序、Launcher 与多个 Craft App 组成。这些程序在界面语言上的支持程度差异很大：有的原生自带简体中文，有的只需要改写一个语言配置文件，有的在语言白名单里根本不接受中文。

本工具做的事只有一件：**扫描本机已安装的 ArtCraft 组件，报告每个组件能否汉化，并对可汉化的组件执行语言切换或回滚**。它不修改程序功能，不注入代码，不联网，不上传任何数据。

- 包名 / 命令：`artcraft-hanhua`
- 形态：Node.js CLI（零第三方依赖）
- 平台：目前**仅支持 Windows**
- 已实测覆盖：ArtCraft 主程序 v0.41.0、ArtCraft Launcher v0.3.2，以及 12 个 Craft App

各项程序的实测状态见 [docs/SUPPORTED-APPS.md](docs/SUPPORTED-APPS.md)。

## 功能

| 功能 | 说明 |
| --- | --- |
| 自动识别 | 扫描常见安装位置与注册信息，列出本机已安装的 ArtCraft 组件及其版本、路径 |
| 一键汉化 | 对可汉化的组件改写语言配置（或替换主程序内嵌前端资源），切换到简体中文 |
| 一键回滚 | 用备份把被改写的文件恢复到原始状态，不留下半成品 |
| 哈希校验 | 改动前后记录目标文件的哈希，回滚时校验，确认已回到原始内容 |
| dry-run | `--dry-run` 只报告将要做的改动，不写入任何文件 |

主程序补丁属于**实验性**能力：它需要解包并替换 exe 内嵌的前端资源。原件会自动备份，可回滚，但请在操作前自行确认已有 ArtCraft 安装包或可恢复的副本。

## 支持矩阵

图例：✅ 可汉化 ｜ 🟦 原生自带简体中文，无需改动 ｜ ⚠️ 可汉化但存在已确认的显示缺陷 ｜ ❌ 无法汉化

| 程序 | 类别 | 状态 | 说明 |
| --- | --- | --- | --- |
| ArtCraft 主程序 | 主程序 v0.41.0 | ⚠️ 可汉化（**实验性**） | 需给 exe 打补丁（内嵌前端资源替换）。原件自动备份为 `*.bak-before-hanhua`，可回滚 |
| ArtCraft Launcher | Launcher v0.3.2 | ✅ 可汉化 | 写 `<安装目录>\launcher\ArtCraftLauncherData\app.ron` → `(language: "zh-CN")` |
| DesignCraft | Craft App | ⚠️ 可汉化（有显示缺陷） | 写 `ui.json` 的 `language` → `"zh"`。上游用内嵌日文字体渲染 CJK，**部分汉字显示为方框** |
| LightCraft | Craft App | ✅ 可汉化 | 写 `ui.json` → `{"language":"zh-hans"}`，中文显示完美 |
| EffectCraft | Craft App | ✅ 可汉化 | 写 `prefs.json` 的 `general.language` → `"zh-hans"` |
| WordCraft | Craft App | 🟦 原生中文 | 自带简体中文，跟随系统区域，无需改动 |
| PhotoCraft | Craft App | 🟦 原生中文 | 同上 |
| VectorCraft | Craft App | 🟦 原生中文 | 同上 |
| GridCraft | Craft App | 🟦 原生中文 | 同上 |
| PdfCraft | Craft App | ⚠️ 原生中文（**大量**方框缺字） | 界面本身是中文，但上游字体缺陷导致大量汉字显示为方框 |
| FilmCraft | Craft App | ⚠️ 原生中文（少量方框缺字） | 同上，缺字数量较少 |
| CADCraft | Craft App | ❌ 无法汉化 | 程序内语言设置只接受 `auto / en / uk` |
| DeckCraft | Craft App | ❌ 无法汉化 | 程序内没有任何语言设置 |
| SoundCraft | Craft App | ❌ 无法汉化 | 程序内没有任何语言设置 |

上表按去重后的程序逐项列出：ArtCraft 主程序 1 个、ArtCraft Launcher 1 个、Craft App 12 个。其中方框缺字是**上游字体渲染缺陷**，本工具无法修复（在 DesignCraft 上已实测排除"安装中文字体"这一途径）。

## 环境要求

- Windows（目前仅此一个受支持平台）
- Node.js **>= 18**（使用内置 `node --test` 与较新的 ESM 能力）
- 无需 `npm install`：本项目没有任何第三方运行时依赖

## 安装与快速开始

```powershell
# 1. 获取源码（不需要 npm install，零第三方依赖）
git clone https://github.com/allen793/artcraft-hanhua.git
cd artcraft-hanhua

# 2. 识别本机已安装的 ArtCraft 组件
node bin/artcraft-hanhua.mjs detect

# 3. 汉化（先建议用 --dry-run 预览将要做的改动）
node bin/artcraft-hanhua.mjs hanhua --dry-run
node bin/artcraft-hanhua.mjs hanhua

# 4. 回滚到原始状态
node bin/artcraft-hanhua.mjs revert
```

机器可读的识别结果：

```powershell
node bin/artcraft-hanhua.mjs detect --json
```

建议流程：`detect` → 阅读报告确认哪些组件可汉化 → `hanhua --dry-run` 预览 → `hanhua` 执行 → 需要时 `revert` 回滚。

## 工作原理

工具只做两类本地文件改动，全部在**你自己机器上**完成：

1. **语言配置文件改写**
   对 Launcher、DesignCraft、LightCraft、EffectCraft 这类程序，定位其语言配置文件，改写语言字段。写回时使用 **UTF-8 无 BOM**，因为带 BOM 的配置文件在这些程序中会导致解析失败或回退英文。

2. **主程序内嵌资源替换（实验性）**
   ArtCraft 主程序是 Tauri + WebView2 应用，界面资源打包在 exe 内部，没有可写的独立语言文件，因此汉化必须替换 exe 内嵌的前端资源。工具会先备份原件（`*.bak-before-hanhua`），再生成打补丁后的可执行文件（`artcraft-zh-full.exe`）。

3. **哈希校验**
   改动前后记录目标文件的哈希，`revert` 时据此校验，确认已恢复到原始内容。

本工具**不重新分发任何 ArtCraft 的二进制或资源**：仓库中只有工具源码与翻译数据，所有被改动的文件都来自你本机的合法安装。翻译数据为社区贡献的纯文本。

本工具**不联网**，不上传、不采集任何数据。

## 常见问题

### 为什么配置文件会踩 BOM 的坑？

部分程序的配置文件解析器对 UTF-8 BOM 不友好：带 BOM 时语言字段可能被忽略，界面回退成英文。本工具写回时统一使用**无 BOM** 的 UTF-8。如果你手工编辑过这些文件，请确认编辑器没有保存为 "UTF-8 with BOM"。

### App 更新后中文变回了英文？

程序更新通常会用官方文件覆盖被改写的配置文件与被替换的资源。更新后**重新执行一次 `hanhua`** 即可；如果出现异常，先 `revert` 再 `hanhua`。

### 为什么有些 App 没有中文？

因为上游没有提供可用的语言入口，而不是工具没做：

- CADCraft：程序内的语言设置只接受 `auto / en / uk`，写入 `zh` 之类的值会被忽略。
- DeckCraft、SoundCraft：程序内没有任何语言设置。
- 这些程序若要汉化，只能由上游加入简体中文，或走修改程序本体的高风险路线，本项目不做。

### 为什么主程序需要打补丁，而且被标为实验性？

主程序把前端资源打包在 exe 内部，没有独立语言文件可以改，只能替换内嵌资源，因此涉及对可执行文件的修改。这类改动风险更高，所以标记为 **experimental（实验性）**：请先备份或保留原始安装包，并优先用 `--dry-run` 预览。

### 界面里的方框（缺字）能修吗？

不能。DesignCraft、PdfCraft、FilmCraft 的方框来自**上游内嵌字体的 CJK 渲染缺陷**。在 DesignCraft 上已实测：即使安装中文字体，方框依然存在，说明字体不是从系统字体链加载的。本工具不做二进制字体替换。

### 汉化会不会影响软件功能或我的作品文件？

工具只改写语言配置与主程序的前端资源，不改动你的工程文件、素材与用户数据。但仍建议在汉化前保留一份可恢复的副本，并确认 `revert` 可用。

### 杀毒软件报毒 / Windows 提示"已保护你的电脑"，是病毒吗？

大概率是**误报或信誉警告**，但请按下面的口径自行核对，不要只信我们：

- **本项目不发布任何 exe。** 仓库里只有 Node.js 工具源码与译表；你的 `artcraft.exe` 来自官方安装包，
  `artcraft-zh-full.exe` 是**在你自己机器上**生成的（所以没有一份"官方产物哈希"可以预先公布）。
- **为什么会被拦**：打过补丁的 exe 是**新生成的、与官方字节不同的、且没有数字签名的文件**。
  SmartScreen 看的是"**有没有信誉**"而不是"有没有病毒"，没有信誉的文件一律提示；
  Defender 的云启发式也可能对"被修改过的 PE"给出误报。**签名失效是预期行为**（如有签名）；
  实测官方 exe 本身未签名。
- **怎么自查**：读源码、跑 CI 里同一套检查（`node --test`）、用 `--dry-run` 预览、`revert` 回滚，
  以及核对 `hanhua` 报告里的 `selfCheck.cspOk` / `audit.changedOutside`。CI 只做检查，**不产出任何二进制**。
- **被误报怎么办**：确认可信后，右键文件 → 属性 → 勾选**解除锁定（Unblock）**清除"来自 Internet"标记；
  并向微软提交误报（WDSI）。**不建议**做全局/无差别加白，也不要为跑这个工具关闭实时保护
  ——微软官方原文是 "**Every exclusion lowers your level of protection.**"。
- **更新后中文变回英文**：这是官方包**覆盖**了改动，不是坏了。重新跑一次 `hanhua` 即可；
  异常时先 `revert` 再 `hanhua`。注意主程序补丁**只实测支持 v0.41.0**，上游发新版后需等适配。

完整原因、官方链接与分步处置（含企业 WDAC/AppLocker 的注意事项）见 **[docs/FAQ.md](docs/FAQ.md)**。

### 支持 macOS / Linux 吗？

目前不支持，仅 Windows。

## 项目生命周期

本项目的存在**以"上游没有官方简体中文"为前提**。因此提前把退出路径写清楚，而不是等事情发生再解释：

1. **若上游官方为 ArtCraft 提供简体中文界面** → 本项目转为**归档/维护模式**：
   停止追加新译文，仅保留译表与回滚能力的归档，并在 README 与本页顶部明确说明。
   届时**推荐使用官方中文**，本项目不再追求"提前用上"的价值。
2. **若上游引入 Authenticode 签名、构建期资源哈希自检等完整性机制，导致补丁不可行** →
   本项目**明确公告"不支持"**，而不是硬碰或教用户绕过校验。
3. **若权利人提出异议** → 按 [docs/DISCLAIMER.md](docs/DISCLAIMER.md) 的承诺配合下架相关内容。
4. **上游版本漂移**期间：主程序补丁只对实测过的版本负责（当前 `SUPPORTED_MAIN_VERSIONS = ['0.41.0']`），
   新版本一律**拒绝而不是盲改**；适配进度以 [docs/SUPPORTED-APPS.md](docs/SUPPORTED-APPS.md) 为准。

## 法律与免责

- 本项目**仅供个人学习、研究与自用汉化**，**不得用于商业再分发**，也不得将本工具或衍生内容与 ArtCraft 安装包捆绑分发。
- 请**支持正版**：本工具不提供、不替代、不绕过任何授权机制。
- `ArtCraft` 及相关名称、标识为**其各自权利人的商标**，本项目仅作事实性指代，**不使用其标识作为本项目品牌/徽标/头像**。
- 本项目会改写宿主程序文件，**这可能与 ArtCraft 的最终用户许可协议（EULA）或使用条款相冲突**；
  本项目**不声称这种使用被允许**，也不声称已获授权，风险自负（详见顶部 ToS 提示）。
- 本项目与 ArtCraft 团队**无关**，未获其授权、认可或赞助；若权利人提出异议，本项目将配合下架相关内容。
- 使用本工具产生的一切后果由使用者自行承担；请在使用前阅读 [docs/DISCLAIMER.md](docs/DISCLAIMER.md) 与 [docs/FAQ.md](docs/FAQ.md)。

## 贡献

欢迎提交 Issue 与 PR：

- 贡献指南：[CONTRIBUTING.md](CONTRIBUTING.md)
- 行为准则：[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- 安全策略：[SECURITY.md](SECURITY.md)
- 支持矩阵与实测证据：[docs/SUPPORTED-APPS.md](docs/SUPPORTED-APPS.md)
- 杀软误报 / SmartScreen / 更新排查：[docs/FAQ.md](docs/FAQ.md)

**仓库不接受任何第三方二进制或资源**（`*.exe`、`*.dll`、`*.msi`、`*.zip` 等），CI 会对此做守卫检查。

## 许可证

本项目以 [MIT License](LICENSE) 发布，版权归 `Copyright (c) 2026 allen793`。翻译数据同样以 MIT 许可提供，欢迎社区改进。

---

# English

[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D6.svg)](#support-matrix)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

> ### ⚠️ Unofficial Project Notice
>
> - This is an **unofficial** community localization tool. It is **not affiliated with, authorized, endorsed, or sponsored by** ArtCraft or its development team.
> - This project **does not contain or redistribute** any ArtCraft binary, installer, asset, or original resource. The repository holds only **patch-tool source code** and **community-maintained translation data**.
> - `ArtCraft` and related names and marks are trademarks of their respective owners and are used here only for factual reference. No ArtCraft branding is used as this project's own identity.
> - By using this tool you confirm that you **legitimately own** the corresponding ArtCraft installation. Please support the official software.
> - See [docs/DISCLAIMER.md](docs/DISCLAIMER.md) for the full legal boundary and takedown commitment.
>
> <details>
> <summary>⚠️ Terms of Service (ToS) notice: this tool rewrites files of the host application</summary>
>
> This project is **not** an official ArtCraft component and has **no** authorization of any kind. It rewrites
> **language configuration files** inside your local ArtCraft installation and, when you explicitly approve it,
> **replaces frontend resources embedded in the main executable**.
>
> Such changes **may** conflict with ArtCraft's end-user license agreement (EULA) or terms of service. **This project
> does not claim that such use is permitted, nor that any authorization exists** — this is a factual notice. Judge for
> yourself whether to use it; **you assume the risk**.
>
> We do not provide, replace, or circumvent any licensing or activation mechanism. The tool uses no network and
> uploads no data. Read [docs/DISCLAIMER.md](docs/DISCLAIMER.md) and [docs/FAQ.md](docs/FAQ.md) before use.
> </details>
>
> **Project lifecycle**: if upstream ships a Simplified Chinese UI for ArtCraft, this project moves to
> **archive/maintenance mode** (see [Project Lifecycle](#project-lifecycle) below).

A zero-dependency Node.js CLI that detects the ArtCraft creative suite installed on your machine, switches the localizable parts to Simplified Chinese, and can roll everything back with one command.

> Localizing the **ArtCraft main application** requires rewriting resources embedded in the executable. That path is marked **experimental** here. Read the [support matrix](#support-matrix) and the [FAQ](#faq) first.

## Table of Contents

- [What This Is](#what-this-is)
- [Features](#features)
- [Support Matrix](#support-matrix)
- [Requirements](#requirements)
- [Install & Quick Start](#install--quick-start)
- [How It Works](#how-it-works)
- [FAQ](#faq)
- [Project Lifecycle](#project-lifecycle)
- [Legal & Disclaimer](#legal--disclaimer)
- [Contributing](#contributing)
- [License](#license)
- [中文文档](#artcraft-简体中文本地化工具非官方)

## What This Is

The ArtCraft suite consists of a main application, a launcher, and a set of Craft Apps. Their language support differs widely: some ship Simplified Chinese natively, some only need a single language field rewritten in a config file, and some simply do not accept `zh` in their in-app language whitelist.

This tool does one thing: **scan the ArtCraft components installed on this machine, report which of them can be localized, and apply or revert the language change for the ones that can**. It does not change program behavior, inject code, connect to the network, or upload any data.

- Package / command: `artcraft-hanhua`
- Shape: Node.js CLI, zero third-party dependencies
- Platform: **Windows only** for now
- Verified coverage: ArtCraft main application v0.41.0, ArtCraft Launcher v0.3.2, and 12 Craft Apps

Per-application results are documented in [docs/SUPPORTED-APPS.md](docs/SUPPORTED-APPS.md).

## Features

| Feature | Description |
| --- | --- |
| Auto-detection | Scans common install locations and registry information, listing installed ArtCraft components with version and path |
| One-command localization | Rewrites language config (or replaces the main application's embedded frontend resources) to switch to Simplified Chinese |
| One-command revert | Restores modified files from backups, leaving no half-applied state |
| Hash verification | Records file hashes before and after the change and verifies them on revert |
| Dry run | `--dry-run` reports the planned changes without writing anything |

The main-application patch is **experimental**: it unpacks and replaces frontend resources embedded in the executable. The original file is backed up automatically and revert is supported, but keep a recoverable copy of your installation first.

## Support Matrix

Legend: ✅ localizable ｜ 🟦 ships Simplified Chinese natively, no change needed ｜ ⚠️ localizable with a confirmed display defect ｜ ❌ cannot be localized

| Program | Kind | Status | Notes |
| --- | --- | --- | --- |
| ArtCraft main app | Main app v0.41.0 | ⚠️ Localizable (**experimental**) | Requires patching the executable (embedded frontend resource replacement). Original backed up as `*.bak-before-hanhua`; revert supported |
| ArtCraft Launcher | Launcher v0.3.2 | ✅ Localizable | Writes `<install dir>\launcher\ArtCraftLauncherData\app.ron` → `(language: "zh-CN")` |
| DesignCraft | Craft App | ⚠️ Localizable (display defect) | Writes `language` → `"zh"` in `ui.json`. Upstream renders CJK with an embedded Japanese font, so **some Han characters show as tofu boxes** |
| LightCraft | Craft App | ✅ Localizable | Writes `ui.json` → `{"language":"zh-hans"}`; Chinese renders perfectly |
| EffectCraft | Craft App | ✅ Localizable | Writes `general.language` → `"zh-hans"` in `prefs.json` |
| WordCraft | Craft App | 🟦 Native Chinese | Ships Simplified Chinese, follows system locale; no change needed |
| PhotoCraft | Craft App | 🟦 Native Chinese | Same as above |
| VectorCraft | Craft App | 🟦 Native Chinese | Same as above |
| GridCraft | Craft App | 🟦 Native Chinese | Same as above |
| PdfCraft | Craft App | ⚠️ Native Chinese (**many** tofu boxes) | The UI is Chinese, but an upstream font defect leaves many Han characters as boxes |
| FilmCraft | Craft App | ⚠️ Native Chinese (few tofu boxes) | Same cause, fewer missing glyphs |
| CADCraft | Craft App | ❌ Not localizable | The in-app language setting only accepts `auto / en / uk` |
| DeckCraft | Craft App | ❌ Not localizable | The program has no language setting at all |
| SoundCraft | Craft App | ❌ Not localizable | The program has no language setting at all |

The table lists every distinct program: 1 main application, 1 launcher, and 12 Craft Apps. The tofu boxes are an **upstream font rendering defect** this tool cannot fix — on DesignCraft, installing a Chinese system font was tested and ruled out as a workaround.

## Requirements

- Windows (the only supported platform at this time)
- Node.js **>= 18**
- No `npm install` needed: there are no third-party runtime dependencies

## Install & Quick Start

```powershell
# 1. Get the source (no npm install required — zero third-party dependencies)
git clone https://github.com/allen793/artcraft-hanhua.git
cd artcraft-hanhua

# 2. Detect the ArtCraft components installed on this machine
node bin/artcraft-hanhua.mjs detect

# 3. Localize (preview the planned changes first)
node bin/artcraft-hanhua.mjs hanhua --dry-run
node bin/artcraft-hanhua.mjs hanhua

# 4. Roll back to the original state
node bin/artcraft-hanhua.mjs revert
```

Machine-readable detection output:

```powershell
node bin/artcraft-hanhua.mjs detect --json
```

Suggested flow: `detect` → read the report → `hanhua --dry-run` → `hanhua` → `revert` when needed.

## How It Works

The tool makes two kinds of local file changes, all **on your own machine**:

1. **Language config rewrite**
   For programs such as the launcher, DesignCraft, LightCraft, and EffectCraft, it locates the language config file and rewrites the language field. Files are written back as **UTF-8 without BOM**, because a BOM makes these programs fail to parse the config or fall back to English.

2. **Embedded resource replacement for the main application (experimental)**
   The ArtCraft main application is a Tauri + WebView2 app whose UI resources are packed inside the executable; there is no separate writable language file. Localizing it therefore means replacing the embedded frontend resources. The original is backed up first (`*.bak-before-hanhua`), and a patched executable is produced (`artcraft-zh-full.exe`).

3. **Hash verification**
   Hashes of the target files are recorded before and after the change so that `revert` can verify the original content was restored.

This tool **redistributes no ArtCraft binary or resource**: the repository holds only tool source and translation data, and every modified file comes from your own legitimate installation. Translation data is plain text contributed by the community.

The tool **does not use the network** and does not upload or collect any data.

## FAQ

### Why is there a BOM pitfall in the config files?

Some parsers are unfriendly to a UTF-8 BOM: the language field may be ignored and the UI falls back to English. This tool always writes **BOM-less UTF-8**. If you edit these files by hand, make sure your editor is not saving "UTF-8 with BOM".

### Chinese disappeared after an app update

Updates usually overwrite rewritten config files and replaced resources with the vendor's originals. Run `hanhua` again after updating. If anything looks wrong, run `revert` first, then `hanhua`.

### Why do some apps have no Chinese at all?

Because upstream exposes no usable language entry point, not because the tool skipped them:

- CADCraft: the in-app language setting only accepts `auto / en / uk`; a value like `zh` is ignored.
- DeckCraft, SoundCraft: no language setting exists in the program.
- Localizing these would require upstream support or risky binary modification, which this project does not do.

### Why does the main app need a patch, and why is it experimental?

Its frontend resources are packed inside the executable, so there is no standalone language file to edit — the embedded resources must be replaced, which means modifying an executable. That carries more risk, hence **experimental**: keep a backup or the original installer, and prefer `--dry-run` first.

### Can the tofu boxes (missing glyphs) be fixed?

No. The boxes in DesignCraft, PdfCraft, and FilmCraft come from an **upstream embedded-font CJK rendering defect**. On DesignCraft this was tested directly: installing a Chinese system font does not remove the boxes, which indicates the renderer does not load system fonts. This tool does not perform binary font replacement.

### Does localization affect program features or my project files?

The tool only rewrites language configuration and the main application's frontend resources. It does not touch your project files, assets, or user data. Keeping a recoverable copy before localizing is still recommended.

### Is my antivirus flagging it, or is Windows saying "Windows protected your PC"?

Most likely a **false positive or a reputation warning** — but verify it yourself rather than taking our word for it:

- **This project ships no executable.** The repository holds Node.js tool source and a translation table only. Your `artcraft.exe` comes from the vendor installer, and `artcraft-zh-full.exe` is generated **on your own machine** — so there is no fixed "official artifact hash" to publish in advance.
- **Why it gets flagged**: a patched executable is a **newly created file whose bytes differ from the vendor build and that carries no digital signature**. SmartScreen asks "does this have **reputation**?", not "does it contain malware?", and anything without reputation gets a prompt. Defender's cloud heuristics may also false-positive on a **modified PE**. **A broken signature is expected** if the file was ever signed; the vendor executable was measured as unsigned.
- **How to verify**: read the source, run the same checks CI runs (`node --test`), preview with `--dry-run`, roll back with `revert`, and read the patcher report's `selfCheck.cspOk` / `audit.changedOutside`. CI only checks — it **produces no binary**.
- **If you are false-positived**: once you trust the file, right-click → Properties → **Unblock** to clear the mark of the web, and submit the false positive to Microsoft (WDSI). We do **not** recommend blanket exclusions or disabling real-time protection to run this tool — Microsoft's own words are "**Every exclusion lowers your level of protection.**".
- **Chinese reverts to English after an update**: the vendor package **overwrote** your changes; it is not broken. Run `hanhua` again, or `revert` then `hanhua` if anything looks odd. Note the main-app patch is measured for **v0.41.0 only**, so a new upstream release needs re-adaptation.

Full causes, official links and step-by-step handling (including enterprise WDAC/AppLocker notes) are in **[docs/FAQ.md](docs/FAQ.md)**.

### Is macOS / Linux supported?

Not at this time. Windows only.

## Project Lifecycle

This project exists **on the premise that upstream ships no official Simplified Chinese**. So we state the exit paths up front instead of explaining them after the fact:

1. **If upstream ships a Simplified Chinese UI for ArtCraft** → this project moves to **archive/maintenance mode**: no new translations, keeping only the archived translation table and the rollback capability, with a clear notice at the top of the README. We would then **recommend the official Chinese UI**; the "get it early" value proposition ends.
2. **If upstream introduces Authenticode signing, build-time resource hash self-checks, or similar integrity mechanisms that make the patch infeasible** → this project will **publicly declare it unsupported** rather than forcing it or teaching users to bypass verification.
3. **If a rights holder objects** → the project cooperates in removing the relevant content, per [docs/DISCLAIMER.md](docs/DISCLAIMER.md).
4. **During upstream version drift**: the main-app patch is responsible only for measured versions (currently `SUPPORTED_MAIN_VERSIONS = ['0.41.0']`); other versions are **refused, not blind-patched**. Adaptation status lives in [docs/SUPPORTED-APPS.md](docs/SUPPORTED-APPS.md).

## Legal & Disclaimer

- This project is for **personal study, research, and self-use localization only**. It **must not be used for commercial redistribution**, and must not be bundled with an ArtCraft installer or with derived content.
- Please **support the official software**. This tool does not provide, replace, or circumvent any licensing mechanism.
- `ArtCraft` and related names and marks are **trademarks of their respective owners** and are referenced factually only; **no vendor branding is used as this project's own identity**.
- This tool rewrites files of the host application, which **may conflict with ArtCraft's end-user license agreement (EULA) or terms of service**. This project **does not claim such use is permitted** and claims no authorization; you assume the risk (see the ToS notice at the top).
- This project is **not affiliated with** the ArtCraft team and has no authorization, endorsement, or sponsorship from it. If a rights holder objects, the project will cooperate in removing the relevant content.
- You are responsible for any consequences of using this tool; read [docs/DISCLAIMER.md](docs/DISCLAIMER.md) and [docs/FAQ.md](docs/FAQ.md) before use.

## Contributing

Issues and pull requests are welcome:

- Contributing guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Code of Conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- Security policy: [SECURITY.md](SECURITY.md)
- Support matrix and measured evidence: [docs/SUPPORTED-APPS.md](docs/SUPPORTED-APPS.md)
- Antivirus false positives / SmartScreen / update troubleshooting: [docs/FAQ.md](docs/FAQ.md)

**No third-party binaries or resources are accepted** (`*.exe`, `*.dll`, `*.msi`, `*.zip`, and similar). CI enforces this with a repository guard.

## License

Released under the [MIT License](LICENSE), `Copyright (c) 2026 allen793`. The translation data is provided under the same license and community improvements are welcome.

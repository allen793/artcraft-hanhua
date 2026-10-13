# Changelog

本项目的所有重要变更都会记录在此文件中。All notable changes to this project are documented in this file.

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本（SemVer）](https://semver.org/lang/zh-CN/)。
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- 文档：新增 [docs/FAQ.md](docs/FAQ.md)（中英双语）——解释为什么"打过补丁的未签名 exe"会被 SmartScreen / Defender 拦、
  如何在不依赖作者背书的前提下自查（源码可读、`--dry-run`、`revert` 哈希校验、CI 只做检查不产出二进制）、
  被误报后的分步处置（`Unblock`、向 WDSI 提交误报、企业走 IT 而**不**建议全局加白），
  以及"上游更新后汉化被覆盖"的正确处置（重跑 `hanhua`）。文中外部链接均为**实际访问过的官方页面**并标注访问日期。
- README：新增**商标免责**（不使用其名称/标识做品牌）、**ToS 折叠提示**（改写宿主文件可能与其 EULA/使用条款冲突，
  不声称合法、不假装已获授权、风险自负）与 **"来源→归档"生命周期声明**；中英双语结构保持一致。
- `docs/SUPPORTED-APPS.md`：新增"不支持清单"——主程序补丁**只实测支持 v0.41.0**、其它版本工具会拒绝而不是盲改；
  写清"上游无中文（CADCraft / DeckCraft / SoundCraft）"、"本身中文但缺字（PdfCraft / FilmCraft，上游字体缺陷）"、
  "仅语言配置支持（Launcher / DesignCraft / LightCraft / EffectCraft）"三类情形，以及升级后需重新汉化。
- `docs/DEVELOPMENT.md`：新增"质量闸门与发布前检查表"一节——`tools/check-coverage.mjs` 的用法与退出码 `2` 的含义、
  **为什么它不能进 CI**（输入是用户本机解包的宿主资源，仓库禁止携带）；`tools/check-mixed-language.mjs` +
  `allowlist.json` + `mixed-language-baseline.txt` 的用法与"何时该加白、何时该改译文、何时才进基线"的判断准则
  （**基线不是用来刷绿的**）；以及发布前逐项检查表。
- `docs/DEVELOPMENT.md`：新增"受控的不汉化清单"一节，把 `tools/allowlist.json` 的维护规则与各类不译理由写进维护者文档。
- Issue 表单：`bug_report.yml` 新增**必填**的"是否使用管理员权限运行"与**独立的必填截图**字段，
  主要字段补上中英双语标签，并在模板顶部提示"主程序补丁只实测支持 v0.41.0"与"先看 FAQ"；
  `config.yml` 新增指向 FAQ 的 `contact_links` 分流入口。

### Fixed

- `docs/DEVELOPMENT.md`：删除与实际实现矛盾的过期内容。原文称主程序补丁"是骨架 / 未实现 / 本轮 pending"，
  而 `src/artcraft-patch.mjs` 已实现全流程（`ARTCRAFT_PATCH_VERSION = 2`）。现在第 7 节按**实际代码**描述：
  真实导出清单、`SUPPORTED_MAIN_VERSIONS = ['0.41.0']` 版本门、`REFERENCE_FACTS` 的用途（断言基线）、
  自检与审计返回字段（`selfCheck.cspOk`、`audit.changedOutside`、PE 对齐），并修正目录树（补 `tools/`）、
  依赖方向说明、译表字节数与去重事实（31 组只差大小写的英文，精确/忽略大小写去重后均为 2772）、
  以及"主程序补丁未实现"这条待办。
- `docs/DEVELOPMENT.md`：明确可复现性边界——验收标准是**解压后资源逐字节一致 + 结构自洽 + CSP 正确**，
  **不是整文件 sha256 一致**；并说明"brotli 跨实现同参数同质量**不等于**同字节"，故整文件哈希只能作信息性输出。
- `docs/DEVELOPMENT.md`：如实记录两处已知缺陷（**不要当成设计意图**）：e2e 用例在参考解压目录缺失或
  与本次参考产物不一致时用 `continue` 静默跳过；`--require-main` 只把 `pending` 当失败、
  不覆盖版本不支持时的 `skipped`。

_以上是本次已经落地的未发布变更。Nothing else has landed for the next release yet._

### Planned

> 以下仅为计划中的工作方向，**尚未实现**，不构成任何承诺。
> The items below are **plans only, not implemented**, and are not commitments.

- 继续核对其余 Craft App 的语言入口与实测状态，并把证据补进 `docs/SUPPORTED-APPS.md`。
- 扩充翻译数据覆盖面（主程序实验性补丁的界面文本）。

## [0.1.0] - 2026-10-13

### Added

- 首个公开版本：零第三方依赖的 Node.js CLI，包名与命令名均为 `artcraft-hanhua`，要求 Node.js >= 18，目前仅支持 Windows。
- `detect` 命令：自动识别本机已安装的 ArtCraft 组件，支持 `--json` 输出机器可读结果。
- `hanhua` 命令：对可汉化的组件切换到简体中文，支持 `--dry-run` 预览将要写入的改动。
- `revert` 命令：按备份把被改写的文件恢复到原始状态。
- 语言配置文件改写支持：ArtCraft Launcher v0.3.2（`app.ron` → `(language: "zh-CN")`）、DesignCraft（`ui.json` → `"zh"`）、LightCraft（`ui.json` → `"zh-hans"`）、EffectCraft（`prefs.json` 的 `general.language` → `"zh-hans"`）。
- **实验性**支持：ArtCraft 主程序 v0.41.0 的内嵌前端资源替换（打补丁），包含原件自动备份与回滚。
- 哈希校验：改动前后记录目标文件哈希，回滚时校验。
- 文档：中英双语 `README.md`、`CONTRIBUTING.md`、`CODE_OF_CONDUCT.md`（Contributor Covenant v2.1）、`SECURITY.md`、`docs/DISCLAIMER.md`、`docs/SUPPORTED-APPS.md`。
- 仓库治理：Issue 表单（Bug / Feature）、PR 模板、GitHub Actions CI（Windows 与 Ubuntu × Node 18/20/22，零依赖直接 `node --test`），并加入"仓库不得包含二进制或大文件"的守卫任务。

# Changelog

本项目的所有重要变更都会记录在此文件中。All notable changes to this project are documented in this file.

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本（SemVer）](https://semver.org/lang/zh-CN/)。
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_尚无已完成的未发布变更。Nothing has landed for the next release yet._

> 以下仅为计划中的工作方向，**尚未实现**，不构成任何承诺。
> The items below are **plans only, not implemented**, and are not commitments.

### Planned

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

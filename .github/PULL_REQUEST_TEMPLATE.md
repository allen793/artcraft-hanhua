# Pull Request

## 变更说明 / What changed

<!-- 用几句话说明这个 PR 做了什么、为什么。关联的 Issue 请用 Fixes #123 / Refs #123。 -->

Fixes #

## 变更类型 / Type of change

- [ ] 🐞 Bug 修复（fix）
- [ ] ✨ 新功能（feat），例如为另一个程序加入语言支持
- [ ] 📝 文档（docs）
- [ ] ✅ 测试（test）
- [ ] ♻️ 重构（refactor）
- [ ] 🔧 工具链 / CI（chore）

## 检查清单 / Checklist

- [ ] 已在本地运行测试并通过（`node --test`）
- [ ] **未提交任何第三方二进制或资源**（无 `*.exe`、`*.dll`、`*.msi`、`*.zip`、字体、图像或从 ArtCraft 提取的资源）
- [ ] 已更新 [CHANGELOG.md](../CHANGELOG.md) 的 `## [Unreleased]`（面向用户的变更）
- [ ] 文档已更新（README 支持矩阵、`docs/SUPPORTED-APPS.md` 或注释，视变更范围而定）
- [ ] 未新增任何第三方依赖，也未引入 `npm install` 步骤（本项目零依赖）
- [ ] 改动只写入已识别的安装目录，且遵守"先备份、后写入、可回滚、哈希校验"的既有路径
- [ ] 文档中的描述与实测结果一致；实验性能力仍明确标注为 **experimental**

## 实测证据 / Verification evidence

<!--
如果涉及新增或修改某个程序的支持，请贴出证据：
- 程序名与版本
- 配置文件路径与写入的字段值
- 执行前后的关键输出（detect --json 片段、hanhua --dry-run 输出）
- revert 后是否恢复原状
- 观察到的显示问题（例如方框缺字）也要如实写明
-->

```text

```

## 平台 / Platform tested on

- Windows 版本：
- Node.js 版本：

## 备注 / Notes for reviewers

<!-- 不确定的地方、需要讨论的取舍、需要 review 关注的代码路径。 -->

# 横向对比与风险评估报告 / Comparative Benchmarking & Risk Assessment

> 对象：`allen793/artcraft-hanhua`（非官方 ArtCraft 简体中文本地化工具，MIT，公开仓库，CI 全绿）
> 依据：调研 A（同类项目法律与分发对标，57 链接）、调研 B（技术风险与工程实践，44 链接）、调研 C（汉化类项目社区实践，46 链接），以及对本仓库 `README.md` / `docs/` / `.github/` / `src/` / `test/` / `tools/` 的只读核对。
> **本报告不是法律意见。** 第 6 节法律部分呈现的是**存在争议的问题**与双方依据，不是结论。
> 凡查不到公开依据的，本文一律写"未找到公开依据"或归入第 9 节"未验证/存疑清单"，不作推测性断言。

---

## 1. 执行摘要

1. **位置**：技术路线已经跑通并自证——主程序二进制补丁从"骨架"变成实现（`src/artcraft-patch.mjs`，1698 行，`ARTCRAFT_PATCH_VERSION = 2`），phf 表改为**搜索式定位**而非硬编码偏移，CSP hash 有**双向集合校验**（`verifyCspHashes`），PE 结构自检与改动审计（`changedOutside`）都在代码里。同类项目里"改宿主可执行文件"的那一档（DockerDesktop-CN、Clash-for-Windows_Chinese）普遍不做这些。
2. **合规位置**：仓库只发工具代码 + 译表、不发宿主二进制（CI `repo-guard` 强制），README 声明非官方/无关联/未获授权，不用其商标做品牌。这与调研 A 的结论一致：**"只发译表/补丁在事实上被容忍；一旦夹带宿主二进制，风险等级立刻上升"**。
3. **最需要行动的三件事**：
   - **P0-A｜把两个质量闸门接进 CI**：`tools/check-coverage.mjs` 与 `tools/check-mixed-language.mjs` 目前只是 `package.json` 里的 npm script，`ci.yml` 里**没有任何步骤运行它们**（已核对）。这是"仓库自带质量闸门"从声明变成事实的唯一缺口。
   - **P0-B｜译表版本对齐**：交付表 `translations-v3.tsv` 是 **2803 条**，仓库 `data/translations.tsv` 仍是 **2773 条**，而 `ci.yml` 硬断言 2773、`src/constants.mjs` 的 `EXPECTED_TRANSLATION_COUNT = 2773`、补丁的 `REFERENCE_FACTS.translations.total = 2773`、e2e 参考产物也是按 2803 条构建的。四处数字互相打架，必须先定一个真值。
   - **P0-C｜补"杀软误报 / SmartScreen / MOTW"FAQ**：我们追加只读 PE 节、产物哈希与官方不同，属于启发式敏感对象；同类工具（LunaTranslator、spicetify）都把这个当必答项，我们文档里连"杀毒/误报"字样都没有。

---

## 2. English summary

1. **Where we stand**: the main-application binary patch is implemented and self-verifying — search-based phf locating (no hard-coded offset), a two-way CSP `sha256-` set check, PE structure self-checks, and a changed-bytes audit. Most comparable projects that modify a host binary do none of this.
2. **Compliance posture**: the repo ships tool source plus a translation table only, enforced by the CI `repo-guard` job; it redistributes no host binaries or extracted assets and uses no vendor mark as its own brand. Research A's finding holds: shipping only a patch/translation table is tolerated in practice, while bundling host binaries sharply raises the risk tier.
3. **Top three actions**: (a) wire `tools/check-coverage.mjs` and `tools/check-mixed-language.mjs` into CI — they exist but no workflow step runs them; (b) reconcile the translation-table count, which is 2773 in the repo but 2803 in the build report and 2803 in the reference artifact; (c) add an antivirus-false-positive / SmartScreen / Mark-of-the-Web FAQ.
4. This report is **not legal advice**; section 6 presents an actively disputed question with both sides' evidence.

---

## 3. 横向对标矩阵

> 来源：调研 A 第 7–19 行矩阵与第 1–5 节；调研 C 第 13–23 行、第 82–131 行。star / 日期均为调研时的**近似值**，可能已变化。最后一列为本报告新增的判断。

| 项目 | 修改的宿主是否闭源付费 | 分发什么 | 合法性声明 | 权利人态度 | 回滚机制 | 上游更新策略 | 工程规范 | **对我们的启示** |
|---|---|---|---|---|---|---|---|---|
| [spicetify/cli](https://github.com/spicetify/cli) | 是（闭源 Spotify，免费+Premium） | 仅 CLI 源码与安装脚本 | README 无免责；CONTRIBUTING 有 Legal Notice | 本仓未见 DMCA；Spotify 对他项目有 | `backup`/`restore` 整目录 | 官方 FAQ：升级后 `spicetify backup apply` | LGPL-2.1 · CONTRIBUTING · issue 模板 · CI · 英文 | 我们已有备份+回滚；缺的是"整目录"级兜底与"升级后跑一次"的对外口令 |
| [BetterDiscord](https://github.com/BetterDiscord/BetterDiscord) | 是（闭源 Discord，Nitro） | 注入器+preload+renderer，含 exe/zip；不含宿主资源 | README 无免责；FAQ 承认违反 ToS | 未发现官方下架；2016 DMCA 是改装者内斗 | 同源安装器 `Uninstall` | 官方文档要求更新后先 repair | Apache-2.0 · CONTRIBUTING · CoC · issue 模板 · CI · Crowdin | "安装器双向操作"范式：我们的 `hanhua` / `revert` 已是双向，但缺"重新汉化"显式入口 |
| [Vendicated/Vencord](https://github.com/Vendicated/Vencord) | 是（闭源 Discord，Nitro） | 注入器+插件源码；Codeberg 镜像 | **商标免责 + ToS 折叠警告** | 未发现 DMCA；Discord ToS 明确禁止改装 | 保留原 `app.asar` 为 `_app.asar` | 专写 `persistAfterDiscordUpdates` 自动重 patch | GPL-3.0 · CI · 英文文档 | **README 措辞直接照抄对象**；"保留原件"我们已等价做到（`*.bak-before-hanhua`） |
| [bbepis/XUnity.AutoTranslator](https://github.com/bbepis/XUnity.AutoTranslator) | 是（多为闭源商业 Unity 游戏） | 插件 DLL + 译表 + 再分发专章 | 说明会联网、不担第三方费用；无商标声明 | 未见针对本仓 DMCA | ALT+T 切原文/译文 | 运行时 hook，换版本改 hook 目标 | README 极长 · CI · 英文 | **"Regarding Redistribution"是再分发自律条款的现成范本**，可直接映射我们的译表许可说明 |
| [HIllya51/LunaTranslator](https://github.com/HIllya51/LunaTranslator) | 是（闭源商业视觉小说） | 完整工具（含 DLL 注入组件） | 文档解释"必须注入 DLL"与误报原因 | 未见 DMCA/封禁 | 覆盖解压升级 | 内置自动更新 | GPL-3.0 · Actions 构建 · 文档 7 语 | **误报对策范本**："由 GitHub Actions 自动构建，除非 GitHub 服务器中毒，否则不可能含病毒" |
| [XD2333/GalTransl](https://github.com/XD2333/GalTransl) | 否（不改宿主，是翻译流水线） | 工具本体；不含本体/解包资源 | **行业自律条款**：机翻未校对必须标注模型名 | 未见 DMCA | `transl_cache` + 按记录撤销 | 与解包/注入工具解耦 | GPL-3.0 · 三平台 CI · **SHA256SUMS** · 中文文档 | **Release 附 `SHA256SUMS.txt` 是我们最容易复制的差异化**；`README_EN.md` 命名也照它 |
| [Reamd7/notion-zh_CN](https://github.com/Reamd7/notion-zh_CN) | 是（闭源 Notion，有订阅） | **改过的 `app.asar` 压缩包 + 改版 APK**（超出"只发补丁"） | "仅用于学习，如有侵权 24h 内删除" | 未见官方发难 | 提供"只改缓存"替代方案 | 作者自述热更新频繁 | **无 LICENSE** · 无 CONTRIBUTING · 中文 | **反面教材**：夹带宿主二进制 = 性质从"汉化"变"再分发软件"；我们的 repo-guard 正防这个 |
| [Snipaste/translations](https://github.com/Snipaste/translations) | 否（官方维护） | **只有翻译文件** | 天然官方 | 无冲突 | 不需要 | 官方发新语言包即生效 | 上游维护 | 与"仓库只放工具代码 + 译表"最接近的形态；但我们多了工具，因而多了误报面 |
| [asxez/DockerDesktop-CN](https://github.com/asxez/DockerDesktop-CN) | 是（闭源 Docker Desktop） | **改好的宿主文件 + 宿主安装包本身** | "请遵守仓库相关许可，否则后果自负" | 未见 DMCA | README 列逐平台备份/回滚路径 | 按宿主版本逐版发包 | **LICENSE/CONTRIBUTING/issue 模板均 404** | **issue 洪水的活教材**：无模板 ⇒ 满屏"XX 版本打不开"。我们的 `bug_report.yml` 已强制版本+截图 |
| [Z-Siqi/Clash-for-Windows_Chinese](https://github.com/Z-Siqi/Clash-for-Windows_Chinese) | 是（闭源；上游已删库） | 分发修改过的宿主程序 | "非官方版本，Unofficial！""下载将代表你无异议" | 上游消失 | 未验证 | "维护频率按最低可用限度" | README 声明支持版本区间 | **"最低可用限度"式预期管理**可减少催促类 issue；README 删除线是上游消失后的现实结局 |
| [CFPAOrg/Minecraft-Mod-Language-Package](https://github.com/CFPAOrg/Minecraft-Mod-Language-Package) | 否（游戏本体开源生态；官方已有中文） | 只放翻译资源包 | CC BY-NC-SA 4.0 | 无冲突 | 资源包可卸载 | 自动更新模组 + 高频发版 | issue `config.yml` 分流到另一仓库 | **官方中文与社区汉化可长期共存**（官方覆盖不到第三方扩展时）；译表单独声明许可的做法值得抄 |
| [maboloshi/github-chinese](https://github.com/maboloshi/github-chinese) | 是（闭源 GitHub 网页） | 只放脚本与词表 | README 仅许可证徽章 | 未见 DMCA | 脚本可停用 | 追随网页改版 | GPL-3.0 · 35k★（近似） | 纯词表/脚本型项目的对外表述最轻；我们的译表可比照其"术语对齐官方来源"的说明方式 |
| [Snipaste 官方翻译项目](https://translations.snipaste.com/projects/snipaste/snipaste/zh_Hans/) | — | 官方协作平台 | 官方 | — | — | — | — | 证明"只发译表"在事实上是被容许的成熟形态 |
| [microsoft/vscode-loc](https://github.com/microsoft/vscode-loc) | 否（宿主 MIT 开源） | 官方语言包 | 微软 CLA + CoC | 无第三方补丁空间 | 语言包可卸载 | 上游同步 | MIT · CLA · CoC | 上游一旦自管语言包，第三方路线终结（见第 6 节法律风险中的生命周期条款） |
| [pingfangx/jetbrains-in-chinese](https://github.com/pingfangx/jetbrains-in-chinese) | 是（闭源 JetBrains） | 汉化包 jar | README 只讲仓库分离动机 | 未见官方发难 | 未验证 | **事实停更（最新 tag v2019.3 / 2019-12-12）** | tags 6 个 · `releaseCount: 0` · 未归档 | **"官方支持中文后第三方退场"的时间线实证**（因果未证实，见第 9 节） |
| **本项目 artcraft-hanhua** | 是（闭源商业 ArtCraft，Tauri+WebView2，无 Authenticode 签名） | **只有工具代码 + 英中对照译表**（CI 拒绝二进制） | **README 非官方声明 + docs/DISCLAIMER.md 专门文件 + 下架承诺** | 未知（无公开记录） | **自动备份 + 哈希校验 + marker 双证据 + `revert`** | **主程序当前无自动更新器**；更新覆盖需用户手动重装（实测） | MIT · CONTRIBUTING · CoC · SECURITY · issue 表单 · PR 模板 · 三 job CI · 双质量闸门 | — |

---

## 4. 我们做得比同类好的地方

| # | 我们的做法 | 同类对照 | 依据 |
|---|---|---|---|
| 1 | **仓库零二进制/零解包资源，且由 CI 强制**（`repo-guard` 拒绝 `exe/dll/msi/zip/ttf/...` 与 >2 MiB 文件） | DockerDesktop-CN 连宿主安装包一起发；notion-zh_CN 放改版 APK | `.github/workflows/ci.yml` 第 120–166 行；调研 A 第 58–64 行 |
| 2 | **专门的 `docs/DISCLAIMER.md`（双语）+ README 顶部声明块**，写明"不包含/不重新分发""未获授权、认可或赞助""不用其标识做品牌""不绕过授权" | spicetify、BetterDiscord、Clash 汉化的 README 均无同等细度的免责；Vencord 有商标免责但无专门文件 | `docs/DISCLAIMER.md` 第 12–66 行；`README.md` 第 8–14 行 |
| 3 | **双轨回滚**：备份文件（`*.bak-before-hanhua`）+ 状态日志 `state.json` + `.hanhua-created` marker 两个独立证据；`revert` 后备份保留以便复用 | spicetify 有 `backup/restore` 但无"创建 vs 修改"区分；同类多数只有一层 | `src/backups.mjs`、`src/state.mjs`；`docs/DEVELOPMENT.md` 第 105–116 行 |
| 4 | **写前必备份、备份失败即放弃写入**（避免产生无法回滚的改动） | 未在同类中找到等价的"失败即不写"断言 | `docs/DEVELOPMENT.md` 第 105–107 行 |
| 5 | **phf 表搜索式定位**，并把硬编码偏移降级为可选的 `expectedTableOffset` 断言 | 调研 B 指出"硬编码偏移是最脆弱的一类定位方式"；同类多靠版本适配+人工更新 | `src/artcraft-patch.mjs` 第 331、460–462、1139 行；调研 B 第 140–147 行 |
| 6 | **CSP hash 双向集合校验**（`verifyCspHashes`：既复算每个 CSP hash，也检查每个内联 script 有对应 hash），并把产物自检结果作为补丁返回的 `selfCheck` | 调研 B 第 64–68 行把这一条列为"推荐但尚未自动化"；同类未见 | `src/artcraft-patch.mjs` 第 1014、1355–1361 行；调研 B 风险表第 1 行 |
| 7 | **PE 最小改动 + 改动审计**：只追加只读 `.asst`、不动既有 VA/偏移、不新增代码或可写节；`report.audit.changedOutside === 0` | 同类"改宿主"档未见此类审计 | `src/artcraft-patch.mjs`（`applyPatchToImage`）；`test/artcraft-patch-algorithm.test.mjs` 第 644–660 行 |
| 8 | **可复现性标准写清楚**：不以"整文件哈希一致"为验收，而是"解压后资源逐字节一致 + 结构自洽 + CSP 正确" | 调研 B 第 158–167 行指出同类普遍没做；调研 C 第 120 行："未找到汉化类项目普遍提供校验哈希的证据" | 任务给定实测事实；调研 B 第 7 节 |
| 9 | **译表与代码分离，且有两个自带质量闸门**（`check-coverage.mjs` 报告残留界面英文；`check-mixed-language.mjs` + `allowlist.json` 报告半译条目） | CFPAOrg、pingfangx 靠拆仓解决体积/维护，但没有"半译检测"这一层 | `tools/check-coverage.mjs` 第 1–14 行；`tools/check-mixed-language.mjs`；`tools/allowlist.json` |
| 10 | **issue 表单强制填版本/系统/`detect --json`/日志/是否回滚** | DockerDesktop-CN 无模板 ⇒ issue 里全是"XX 版本打不开" | `.github/ISSUE_TEMPLATE/bug_report.yml` 第 60–120 行；调研 C 第 66–78 行 |
| 11 | **定时巡检 issue/BUG**（DSH 看板卡片，每天 09:00 Asia/Shanghai） | 同类多为人工看 issue | 任务给定事实；`.monitor-state.json`（`last_check: 2026-10-13T15:48:46Z`）、`BUG反馈摘要.md` |
| 12 | **不汉化受控清单是有理由的、可复核的**（ID3 枚举、形状名与 `media_id` 同字面量、品牌/模型名、库报文、键名、类名、内部 id） | 同类多不解释"为什么这些没译"，导致被当作漏译反复报 issue | 第 8 节；`tools/allowlist.json` 的 `_comment` 明确禁止把用户可见词加白 |

---

## 5. 遗漏清单

> 每条写：**缺什么 / 为什么重要 / 同类项目怎么做（附链接）/ 建议动作**。前 9 条为已知候选，第 10 条起为本报告新增（已标注）。

### M1｜杀软误报 FAQ（已知候选）
- **缺什么**：仓库与文档中完全没有"杀毒/误报/加白"相关字样（已核对 `README.md`、`docs/*`）。
- **为什么重要**：我们追加只读 PE 节，产物哈希与官方不同，是 Defender 云启发式的敏感对象；同类工具的存量 issue 证明误报几乎必然（[spicetify/cli#3097 "Windows defender false positive"](https://github.com/spicetify/cli/issues/3097)，调研 B 第 86 行标注为"仅索引可见标题"）。逐个 issue 解释成本极高。
- **同类怎么做**：[LunaTranslator 中文文档](https://docs.lunatranslator.org/zh/README.html)给出"软件目前由 Github Actions 自动构建，除非 Github 服务器中毒了，否则不可能包含病毒"的信任论证 + Defender 排除项点击路径；官方误报流程见 [Defender false positives](https://learn.microsoft.com/en-us/defender-endpoint/defender-endpoint-false-positives-negatives)。
- **建议动作**：`README.md` 新增"杀软误报 / SmartScreen / MOTW"FAQ 小节（中英双段），内容 = 原因（追加 PE 节 + 未签名）+ 信任论证（CI 构建、零依赖、源码可读）+ 三步操作（右键属性 → `Unblock` → "More info → Run anyway"）+ 明确**不推荐**用管理员权限运行、**不推荐**教用户全局加白（官方原文"Every exclusion lowers your level of protection"）。同步在 `docs/SUPPORTED-APPS.md` 之外新建 `docs/ANTIVIRUS.md` 承载长文，README 只放摘要链接。

### M2｜issue 模板强制"宿主版本 + 截图 + 复现步骤"（已知候选，部分已完成）
- **缺什么**：`bug_report.yml` 已强制 ArtCraft 版本、Windows 版本、Node 版本、`detect --json`、日志、复现步骤（第 60–120 行），但**"截图"只在可选的 `extra` 字段里被顺带提及**（第 122–128 行，`required: false`），且字段标签**只有中文**，没有 LunaTranslator 式的双语并排。
- **为什么重要**：界面类问题（方框缺字、文案未替换、白屏）没有截图基本无法判定；双语标签是国际贡献者唯一的自助入口。
- **同类怎么做**：[LunaTranslator 的 issue forms](https://github.com/HIllya51/LunaTranslator/tree/main/.github/ISSUE_TEMPLATE) 把 `screenshot 截图` 与 `Reproduction steps 复现步骤` 一并设为必填，字段标签中英并排，并用编号前缀强制排序（调研 C 第 73–76 行）。
- **建议动作**：把 `extra` 拆成"截图（必填，可粘贴或说明无法截图的原因）"独立字段；给所有 `label` 补英文（`问题描述 / Description`），或至少给模板加一行英文说明。

### M3｜`config.yml` 关闭空白 issue 并分流（已知候选，已完成）
- **状态**：**已完成**。`.github/ISSUE_TEMPLATE/config.yml` 第 1 行即 `blank_issues_enabled: false`，并有 4 条 `contact_links`（Discussions / 支持矩阵 / 贡献指南 / 安全漏洞私密报告）。调研 C 第 143 行把它列为 P0 建议。
- **剩余缺口**：没有指向"常见问题/FAQ"文档的 `contact_links`（LunaTranslator 的 README 首行就是【软件下载 & 常见问题】）。M1 落地后应补一条 `contact_links` 指向 `docs/ANTIVIRUS.md` 与 README FAQ 锚点。

### M4｜版本支持表的"不支持清单"（已知候选）
- **缺什么**：`docs/SUPPORTED-APPS.md` 已有完整状态表（含 3 个 ❌ 与原因），但**没有"已在支持范围内但当前版本不支持/已知失效"栏**——即"上游发新版后，补丁暂时不适配"这一栏。`src/artcraft-patch.mjs` 第 66 行 `SUPPORTED_MAIN_VERSIONS = ['0.41.0']` 这个关键边界只存在于代码里，对外不可见。
- **为什么重要**：DockerDesktop-CN 的 issue 列表证明版本漂移是主要维护成本（调研 C 第 66–70、128 行）；把边界写在代码里等于让用户自己踩。
- **同类怎么做**：Clash 汉化 README 写"支持的 clash 版本: 0.15.3 ~ 当前的最新兼容"（调研 C 第 129 行）；spicetify FAQ 直接承认"可能还不支持某个新的 Spotify 更新"（[FAQ](https://spicetify.app/docs/faq)，调研 B 第 44 行）。
- **建议动作**：`docs/SUPPORTED-APPS.md` 增加"主程序补丁支持的主程序版本"表，列 `0.41.0 = 已实测`，并加一行"其它版本 = 未适配，工具会拒绝而不是盲改"；从 `SUPPORTED_MAIN_VERSIONS` 单一来源生成，避免两处漂移。

### M5｜Release 附 SHA256SUMS（已知候选）
- **缺什么**：仓库有 `src/commands/verify.mjs` 与 `src/fsutil.mjs` 的 SHA-256 能力，但**发布侧没有任何哈希清单**；目前也没有 Release 流程文件（`.github/workflows/` 只有 `ci.yml`）。
- **为什么重要**：调研 C 第 120 行明确"本次未找到汉化类项目普遍提供校验哈希的证据"——做了就是差异化，也是反误报证据链的第一环。
- **同类怎么做**：[GalTransl](https://github.com/XD2333/GalTransl) 三平台 Actions 构建 + Release 附 `SHA256SUMS.txt`，且发布验收会在源码目录之外启动解压后的后端做冒烟（调研 A 第 55 行）。
- **建议动作**：新增 `docs/RELEASE.md` 定义发布检查表（产物哈希 + `BUILDINFO.txt`（输入哈希/工具版本/输出哈希）+ diffoscope 报告 + WDSI 提交回执），并让 CI 在打 tag 时生成 `SHA256SUMS.txt`。

### M6｜README 换成 Vencord 式措辞（已知候选，大部分已完成）
- **状态**：**大部分已完成**。`README.md` 第 8–14 行已有"非官方 / 无关联 / 未获授权、认可、赞助 / 不用其标识做品牌 / 请支持正版"。
- **剩余缺口**：**没有 ToS 类风险提示**。同类中 Vencord 用折叠块直说"Client modifications are against Discord's Terms of Service"（[README](https://raw.githubusercontent.com/Vendicated/Vencord/main/README.md)，调研 A 第 45 行）；BetterDiscord FAQ 也直答 ToS 问题（[FAQ](https://docs.betterdiscord.app/users/getting-started/faq)，调研 A 第 34 行）。我们目前只说"后果自负"，没说"这可能违反宿主的使用条款"。
- **建议动作**：在 README 声明块内补一条 `<details>` 折叠提示："本工具会改写宿主程序文件，这可能与 ArtCraft 的最终用户许可/使用条款相冲突；是否使用请自行判断，风险自负。"（措辞为事实性提示，不宣称合法性，也不假装已获授权。）

### M7｜"上游官方支持中文即归档"的生命周期条款（已知候选）
- **缺什么**：仓库无任何生命周期/退出条款。`CHANGELOG.md` 只有 `[Unreleased] Planned` 两条与 `[0.1.0] - 2026-10-13`。
- **为什么重要**：调研 A 第 70 行给的规律是"上游官方支持多语言后，第三方汉化的价值退化为'提前用上 + 质量'，长期结局多为停更或转投官方渠道"；调研 C 第 39–49 行归纳出三条路（停更 / 上游消失后维护旧版 / 转做补充翻译）。jetbrains-in-chinese 最新 tag 停在 2019-12-12 且 `releaseCount: 0`；notion-zh_CN 于 2024-04 停更。**但调研 C 第 45 行明确标注：停更与官方出中文包之间"未见作者声明的因果关系"**，只能给时间线。我们提前写条款，正是把这条不确定性变成对用户的明确承诺。
- **同类怎么做**：未找到同类写"官方支持即归档"的实例（**未找到公开依据**）。
- **建议动作**：`README.md` 加"项目生命周期"小节 + `docs/DISCLAIMER.md` 呼应：① 若上游官方提供简体中文，本项目转为"仅保留回滚与译表归档"；② 若上游引入签名或资源完整性自检导致补丁不可行（见第 6 节 T4），本项目明确公告不支持而不是硬碰；③ 若权利人提出要求，按 `docs/DISCLAIMER.md` 第五节配合下架。

### M8｜"重新汉化"入口（已知候选）
- **缺什么**：用户更新后要重跑 `hanhua`，此路径只在 FAQ 里被文字描述（`README.md` 第 141–143 行"更新后重新执行一次 `hanhua`"），**没有独立命令或显式入口**；`hanhua` 每次都会重跑全流程。
- **为什么重要**：调研 A 第 12–13 行显示 BetterDiscord 靠官方文档要求"repair"，Vencord 干脆写了 `persistAfterDiscordUpdates` 自动重 patch。我们是"手动重装触发覆盖"（主程序无自动更新器，见第 6 节 T3），因此至少要让"重打"是一步、可预期、且能识别"已经是汉化态"。
- **建议动作**：① README/FAQ 把"重新汉化"的推荐口令固化为 `node bin/artcraft-hanhua.mjs hanhua`（先 `revert` 再 `hanhua` 作为异常路径）；② 在 `detect`/`verify` 输出里显式报"当前是否已是汉化态"，让用户一眼知道要不要重打；③ 评估 `hanhua` 对"已打补丁且版本一致"的快速路径（检测产物存在 + 哈希匹配 → 直接报"已是汉化态"，不重复写盘）。

### M9｜`README_EN.md` 拆分约定（已知候选）
- **缺什么**：`README.md` 是"中英同文件"（中文 1–192 行 + English 194–379 行，已核对）。
- **为什么重要**：调研 C 第 58 行给出 GitHub 官方/社区口径——**GitHub 没有"按语言显示不同 README"的机制**（[Discussion #22310](https://github.com/orgs/community/discussions/22310) 答复原文"This is not possible to do right now"），所以国际读者的入口只能靠顶部锚点或独立文件。
- **同类怎么做**：GalTransl 用 `README.md` + [`README_EN.md`](https://raw.githubusercontent.com/GalTransl/GalTransl/main/README_EN.md)（实测两者均存在，`README_en.md` 与 `README_zh-CN.md` 均 404 → **大小写敏感，`README_EN.md` 是通行写法**）；LunaTranslator 用顶部语言切换条 + 文档站分语言。
- **建议动作**：我们已是 LunaTranslator 模式（对国际读者其实更友好）。若要再进一步：保留双语文档，另加极简 `README_EN.md`，只放英文摘要 + 指向 `README.md` 的 `#english` 锚点，并在 `README.md` 顶部语言行补上指向 `README_EN.md` 的链接。**不建议**现在就把 379 行 README 拆成两份维护。

### M10｜（新增）把两个质量闸门接进 CI
- **缺什么**：`tools/check-coverage.mjs` 与 `tools/check-mixed-language.mjs` 只出现在 `package.json` 的 `scripts`（第 20–21 行）；`.github/workflows/ci.yml` 的三个 job（`test` / `static` / `repo-guard`）**没有任何步骤调用它们**（已逐行核对：`static` job 只做 `node --check` 与译表结构断言）。
- **为什么重要**：这是"仓库自带两个质量闸门"这一对外可信度信号从**声明**变成**事实**的唯一缺口。`check-coverage.mjs` 自己定义了退出码语义（第 11–14 行：`2` = 发现高置信度残留 UI 英文），正好可作 CI 门禁；`check-mixed-language.mjs` 有 `allowlist.json` 支撑，接入前实测 296 行、清理后 105 行，属于可稳定门禁的状态。
- **同类怎么做**：GalTransl 把校验放 CI（三平台 Actions）；BetterDiscord 的 Crowdin 明确禁止纯机翻提译（调研 A 第 39 行）——同类也把"翻译质量"当 CI 职责。
- **依据**：`package.json` 第 20–21 行；`.github/workflows/ci.yml` 全文；`tools/check-coverage.mjs` 第 1–14 行；任务给定实测数据（1713 条候选 / 124 条有明确 UI 属性上下文；296 → 105 行）。
- **建议动作**：在 `static` job 增加一步运行 `node tools/check-mixed-language.mjs data/translations.tsv`（有 `allowlist.json` 兜底，可先以 `--out` 生成报告并允许非零退出前先在 PR 里观察）；`check-coverage.mjs` 需要原始/补丁后的 bundle 两个参数，**输入是用户本机解包产物、不能进仓库**，因此只能作为**本地发布前检查表**写进 `docs/RELEASE.md`（M5），不能做成无输入的 CI 门禁。

### M11｜（新增）译表条数四处不一致，必须先定真值
- **缺什么**：同一批数据有四个互相打架的数字——
  - 仓库 `data/translations.tsv`：**2773** 数据行（实测 2774 个 LF、146 834 字节、无 BOM，与 `docs/DEVELOPMENT.md` 第 174 行的 146 834 字节一致）；
  - `ci.yml` 第 111 行硬断言 `rows -ne 2773` 即报错；
  - `src/constants.mjs` 第 56 行 `EXPECTED_TRANSLATION_COUNT = 2773`；
  - `src/artcraft-patch.mjs` 的 `REFERENCE_FACTS.translations.total = 2773`；
  - 而交付的构建产物 `hanhua-build/translations-v3.tsv` 是 **2803** 行、148 445 字节（`merge-v2-report.txt` 第 135 行 final rows: 2803），补丁的参考产物也是按 **2803** 条构建的。
- **为什么重要**：CI 会**在正确方向上失败**——任何人把 2803 条的表提交上来，`static` job 立刻红；同时 e2e 参考产物无法用仓库里的 2773 条表复现。这是"CI 全绿"与"交付表已升级"之间的矛盾，不解决就没法对外宣布"2803 条文案已汉化"。
- **依据**：`data/translations.tsv`（实测 2774 LF / 146 834 B）；`.github/workflows/ci.yml` 第 93–118 行；`src/constants.mjs` 第 56 行；`src/artcraft-patch.mjs` `REFERENCE_FACTS`；`hanhua-build/merge-v2-report.txt` 第 135–141 行。
- **建议动作**：定真值（建议以 2803 为准，因为参考产物按它构建），一次改动四处：`data/translations.tsv`、`ci.yml` 行数断言、`EXPECTED_TRANSLATION_COUNT`、`REFERENCE_FACTS.translations.total`；并在 `ci.yml` 里把硬编码数字改为从 `src/constants.mjs` 读取，消除"数字写两处"的根因。

### M12｜（新增）e2e 测试只存在于注释里，且断言与"可复现性边界"矛盾
- **缺什么**：`src/artcraft-patch.mjs` 第 6 行注释指向 `test/artcraft-patch-e2e.test.mjs`，但该文件**不存在**；实际 e2e 位于 `test/artcraft-patch-algorithm.test.mjs` 第 613 行起的用例，且被 `ARTCRAFT_FULL_TEST=1` 门控（默认 skip，注释理由是"约 1 分钟"）。该用例断言 `report.sha256 === REFERENCE_FACTS.patchedExeSha256` 与 `compareImages(...) === -1`（即**整文件逐字节相同**，第 646–648 行），并依赖两处**绝对路径**（第 607–609 行的 `artcraft-poc\...`、第 651 行的 `extract-csp\assets`）与一个临时的 `if (!fs.existsSync(refPath)) continue;` 跳过。
- **为什么重要**：① 我们的验收标准是"解压后资源逐字节一致 + 结构自洽 + CSP 正确"，而这条测试把**整文件哈希**变成硬断言，两者口径不一致；② `continue` 跳过让"解压后逐字节一致"这条**真标准在缺失参考文件时静默不生效**，是最危险的一类假绿；③ 绝对路径与 `ARTCRAFT_FULL_TEST` 意味着这条 e2e 在 CI 里**永远不跑**（CI 无此目录、无此环境变量）。
- **依据**：`src/artcraft-patch.mjs` 第 6 行；`test/artcraft-patch-algorithm.test.mjs` 第 606–660 行；`.github/workflows/ci.yml`（无 `ARTCRAFT_FULL_TEST`）。
- **建议动作**：① 修正注释里的文件名；② 把"解压后逐字节一致"从 `continue` 改为**显式失败或显式 skip 并带原因**（`t.skip('缺少参考文件：...')`），不允许静默通过；③ 整文件哈希断言改为**信息性输出**（打印差异偏移与 `compareImages` 结果），把 hard-gate 移到"解压后一致 + `audit.changedOutside === 0` + `selfCheck.cspOk` + PE 对齐断言"，与第 8 节可复现性标准对齐；④ 参考文件路径改为环境变量/相对仓库路径。

### M13｜（新增）`tools/check-coverage.mjs` 的文档引用不存在
- **缺什么**：`tools/check-coverage.mjs` 第 6–7 行注释写"see docs/DEVELOPMENT.md"，但 `docs/DEVELOPMENT.md` 全文**没有**与该脚本或"解压后的包"相关的内容（第 6 节只讲 `data/translations.tsv` 的格式；`tools/` 目录甚至没出现在第 2 节目的树里）。
- **为什么重要**：这正是"质量闸门存在但无人知道怎么用"的典型状态——脚本要三个参数（原始 bundle / 补丁后 bundle / 译表），而"bundle 从哪来"没有任何文档说明，等于把最关键的复现知识留在作者本机。
- **依据**：`tools/check-coverage.mjs` 第 1–22 行；`docs/DEVELOPMENT.md` 第 29–57 行（目录树缺 `tools/`）、第 172–200 行（译表格式章节）。
- **建议动作**：`docs/DEVELOPMENT.md` 目录树补 `tools/`，并新增一节"质量闸门"：两个脚本的用途、输入如何获得（解包产物，**不得提交**）、退出码含义、`allowlist.json` 的维护规则（"只加品牌/模型名/格式/单位/键名/缩写/内部标识，绝不把用户可见英文加白"——直接引用其 `_comment`）。

### M14｜（新增）上游新版本检测未接入巡检
- **缺什么**：仓库已有定时巡检基础设施（`.monitor-state.json` 的 `last_check`、`BUG反馈摘要.md`），且 2026-10-13 那次巡检结论是"仓库当前没有任何 issue 也没有任何 pull request"。但**巡检只看本仓 issue/PR，不看上游是否发新版**。
- **为什么重要**：我们是"替换宿主资源"型项目，版本漂移是头号维护成本（调研 C 第 132 行把我们与 Docker、Clash 归为同一类）。`SUPPORTED_MAIN_VERSIONS` 只有 `0.41.0`，上游一发新版，`hanhua` 会正确拒绝，但用户只会看到"不支持"而没有上下文。
- **同类怎么做**：调研 C 第 149 行把"CI 比对上游版本 → 自动开 issue"列为 P2 建议，并注明**同类是否已做未验证**。
- **依据**：`.monitor-state.json`；`BUG反馈摘要.md`；`src/artcraft-patch.mjs` 第 66 行；调研 C 第 149 行。
- **建议动作**：把巡检扩展到"上游版本变化 → 在看板开一张卡片并附 `detect` 期望输出对比"，与本仓 issue 巡检共用同一张看板卡片；同时在 `docs/SUPPORTED-APPS.md` 的"主程序补丁支持版本"表（M4）里注明"上游新版发布后本表更新前，请勿套用补丁"。

### M15｜（新增）`docs/DEVELOPMENT.md` 已过期，与实现不符
- **缺什么**：`docs/DEVELOPMENT.md` 仍把主程序补丁描述为**骨架**——第 49 行"`src/artcraft-patch.mjs` # 主程序二进制补丁的接口骨架（算法待接入，注释里写明算法要点）"、第 138 行"`binary-patch` | 调 `src/artcraft-patch.mjs`（本轮 pending）"、第 203–214 行"本轮只有骨架"、第 256 行"主程序补丁尚未实现：`patchMainApp()` 抛「未实现」"。而实际实现是 1698 行、`ARTCRAFT_PATCH_VERSION = 2`、导出 `findPhfEntries` / `applyPatchToImage` / `verifyCspHashes` 等；`CHANGELOG.md` 也已经把主程序补丁列为 0.1.0 的 **experimental 支持**。
- **为什么重要**：这是维护者文档，也是最容易被新人/未来自己当作事实阅读的文件。它现在还声称"补丁未实现"，会直接误导接手者；同时它承诺的"单元测试会断言与参考产物逐字节相同"与实际门控测试不一致（见 M12）。
- **依据**：`docs/DEVELOPMENT.md` 第 49、138、203–228、254–263 行；`src/artcraft-patch.mjs` 第 1–6、63、331、1014、1135 行；`CHANGELOG.md` 的 `[0.1.0]` 条目（"**实验性**支持：ArtCraft 主程序 v0.41.0 的内嵌前端资源替换（打补丁），含原件自动备份与回滚"）。
- **建议动作**：重写 `docs/DEVELOPMENT.md` 第 7 节为"已实现"版本：算法要点保持不变，补上真实的导出清单、`REFERENCE_FACTS` 的用途（断言基线，不是"凑出来的数"）、`SUPPORTED_MAIN_VERSIONS` 的版本门、以及自检/审计返回字段（`selfCheck.cspOk`、`audit.changedOutside`、`pe.sizeOfImageAfter % sectionAlignment`）；第 9 节"待办"同步删除"未实现"一条。

---

## 6. 四类风险

> 标注含义：**[已做]** = 流程/代码已覆盖；**[未做]** = 建议但未落实；**[监测]** = 无法从当前产物预防，只能跟踪上游。
> 可能性为**判断**，依据来自调研结论与本仓库实测，不来自任何机器可算的概率模型。

### 6.1 法律风险

> ⚠️ **本节讨论的是存在争议的法律问题，不是法律意见，也不给出确定性结论。** 相关条文与观点的并列呈现见调研 C 第 5 节；本报告只做归纳。

**L1｜译表是否构成侵权（争议项）——可能性：中｜[部分已做]**

- **风险描述**：仓库发布"英文原文 + 中文译文"逐条对照表。若权利人主张译表构成**未经许可的翻译/演绎**，投诉会走 DMCA 流程并可能先下架后申诉。
- **双方依据（并列，非结论）**：
  - 倾向"有风险"：中国[《计算机软件保护条例》第八条](https://enipc.court.gov.cn/zh-cn/news/view-407.html)明确软件著作权人享有"**翻译权，即将原软件从一种自然语言文字转换成另一种自然语言文字的权利**"，第十七条只豁免"为学习和研究软件内含的设计思想和原理"而**使用**软件；美国 [17 U.S.C. §106(2)](https://www.copyright.gov/title17/92chap1.html) 的"prepare derivative works"，配合 [§107](https://www.copyright.gov/title17/92chap1.html) 合理使用四要素。
  - 倾向"可抗辩"：只发布**词条级对照数据**（不载入、不重分发宿主资源）、目的具转换性（让用户在自己合法安装的软件上用中文）、对原作品市场损害难以证明、主动声明非官方且不收费。
- **触发条件**：权利人提交合格 DMCA 通知；或 GitHub AUP 判定为"infringes any proprietary right"。
- **影响**：仓库被临时/永久下架；据 [GitHub DMCA Takedown Policy](https://docs.github.com/en/site-policy/content-removal-policies/dmca-takedown-policy)，部分文件的主张会给作者**约 1 个工作日**自行删除/修改，整仓主张则直接禁用。
- **缓解措施**：**[已做]** 只发译表不发宿主资源；`docs/DISCLAIMER.md` 第四、五节写明译表性质与配合下架承诺；不收费、不捆绑、不用于商业再分发。**[未做]** 译表的**单独许可与贡献条款**未声明（CFPAOrg 给译表用了 CC BY-NC-SA 4.0，我们只笼统写"MIT"）。
- **真实案例链接**：Terraria 反通知（[github/dmca 2019-02-21-Terraria-CounterNotice](https://github.com/github/dmca/blob/master/2019/02/2019-02-21-Terraria-CounterNotice.md)）——被删仓库反通知原文主张"My repository contained language files of the decompiled game code, which were only used to improve the German translation"，并称与 fair-use doctrine 冲突；youtube-dl 恢复（[GitHub Blog 2020-11-16](https://github.blog/news-insights/policy-news-and-insights/standing-up-for-developers-youtube-dl-is-back/)）——说明删除是流程驱动的、可申诉，但恢复不是必然。

**L2｜"改宿主可执行文件"落在 anti-circumvention 主张的射程内——可能性：中｜[已做]（缩小面积）**

- **风险描述**：我们做的不是改配置，而是**往宿主 exe 里追加 PE 节并回写 phf 条目**。调研 A 第 88 行明确把这一条列为我们的主要风险之一："PE 段追加 + 二进制回写"在 anti-circumvention 主张下比"改配置/改文案"更敏感。
- **触发条件**：权利人把"解包内嵌资源并重打包"描述为"绕过技术措施"。
- **影响**：GitHub 会对 anti-circumvention 主张做**技术+法律双重审查**，但政策原文写明"无法判断是否成立时倾向于开发者、保留内容"（err on the side of the developer），禁用前必先联系作者给回应机会，并可为作者提供 [Developer Defense Fund](https://github.blog/2021-07-27-github-developer-rights-fellowship-stanford-law-school/) 的免费法律咨询（见 [DMCA 政策 C 节](https://docs.github.com/en/site-policy/content-removal-policies/dmca-takedown-policy#c-what-about-circumvention-claims)）。
- **缓解措施**：**[已做]** 不改写授权/许可校验逻辑、不做功能解锁（`docs/DISCLAIMER.md` 第 23、35 行）；产物另存为新文件、不覆盖原 exe；`revert` 完整可逆；不用其商标做品牌。这些正是把"可被主张的面积"压到最小的做法（调研 A 第 83 行归纳的第 ④⑤ 条）。
- **真实案例链接**：[Spotify 2026-09-14 通知](https://github.com/github/dmca/blob/master/2026/09/2026-09-14-spotify.md)（主张绕过 DRM/加密）；[Spotify 2026-03-17 通知](https://github.com/github/dmca/blob/master/2026/03/2026-03-17-spotify.md)（主张未经授权复制/演绎）；[Discord 2022-12-06 通知](https://github.com/github/dmca/blob/master/2022/12/2022-12-06-discord.md)（**理由是再分发专有字体 gg sans**，GitHub 注明"未能认定有效的 anti-circumvention 主张，但认定存在其他有效版权主张"——这说明**真正咬人的常常不是"改客户端"，而是"夹带权利人资源"**）。
- **对照**：**未发现** Discord 对 BetterDiscord / Vencord 的公开 DMCA；[2016-01-07-DiscordClientModding](https://github.com/github/dmca/blob/master/2016/2016-01-07-DiscordClientModding.md) 经查是改装者内斗，与 Discord 公司无关（调研 A 第 35、80 行）。**未核实**：spicetify 是否收到过 Spotify 通知。

**L3｜商标与"非官方"表述——可能性：低｜[已做]**

- **风险描述**：仓库名与文档大量使用 `ArtCraft` 字样。
- **缓解措施**：**[已做]** `README.md` 第 12 行与 `docs/DISCLAIMER.md` 第三节共同声明：仅作**事实性指代**、不使用其标识作为本项目品牌/徽标/头像、不暗示合作、无授权认可赞助。
- **对照**：spicetify README **没有任何**"非官方/与官方无关"字样，只有 CONTRIBUTING 的 Legal Notice（调研 A 第 27 行）——我们的自我约束显著更严格。

**L4｜AUP 红线距离——可能性：低｜[已做]**

- **风险描述**：[GitHub Acceptable Use Policies](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies) 第 3 节禁止"infringes any proprietary right…"以及"software for bypassing checks for product licensing keys"。**"修改第三方软件"本身不是禁止项**，"侵权"和"绕过授权/许可校验"才是红线（调研 C 第 87 行）。
- **缓解措施**：**[已做]** 无任何授权绕过组件；`repo-guard` 杜绝夹带宿主二进制。

### 6.2 技术风险

| # | 风险 | 触发条件 | 影响 | 可能性 | 缓解措施（状态） |
|---|---|---|---|---|---|
| **T1** | CSP `sha256-` 失配 | 改动 HTML 内联脚本文本但未重算 CSP hash | 该 inline script 被 WebView2 拒绝执行 → 白屏/功能缺失，**极易误判为"翻译没生效"** | 高（调研 B 标注**已实际发生**） | **[已做]** 51 字符原位替换（`4ArYMF5…`→`gMY4MXtq…`）+ `verifyCspHashes` 双向集合校验 + 补丁返回 `selfCheck.cspOk`；**[未做]** CDP 运行时冒烟门禁（用 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` 传 `--remote-debugging-port` 收集 CSP violation 并断言 DOM 含预期中文） |
| **T2** | phf 表定位漂移 | 上游发新版，表位置/条目集合变化 | 改错数据 → 静默错误或启动崩溃 | 高（每次上游更新） | **[已做]** 已改为**搜索式**定位（`findPhfEntries`：40 字节步进 + 5 字段不变量 + 连续条目不变量 + brotli 解压内容指纹 + 条目数），硬编码偏移降级为可选断言 `expectedTableOffset`，目标 key 缺一个即抛错；`SUPPORTED_MAIN_VERSIONS = ['0.41.0']` 做版本门。**[未做]** M14 的上游版本自动检测 |
| **T3** | 上游更新覆盖汉化 | 用户手动重装/更新 ArtCraft | 汉化被官方包整体覆盖（**不是校验失败，而是资产被替换**） | **低**（主程序无自动更新器，见下） | **[已做]** FAQ 明确"更新后重新执行一次 `hanhua`"；产物另存为新文件、原件保留。**[未做]** M8 的显式"重新汉化"入口与"已是汉化态"识别 |
| **T4** | 上游改用完整性校验方案 | ArtCraft 换 Electron 式 ASAR integrity 或自研构建期资源哈希自检 | 启动即强制退出/闪退，补丁方案整体失效 | 低（结构性变化） | **[监测]** 无法预防。预警信号：产物出现新的哈希表/自校验字符串、上游开始 Authenticode 签名（调研 B 第 38 行：**"签名 + WDAC 才是真屏障，哈希本身不是"**） |
| **T5** | Defender 启发式误报 | 追加节的、哈希与官方不同的 PE 被云启发式命中 | 用户侧被拦/被隔离，口碑受损 | 中 | **[未做]** M1 的 FAQ + 每次新产物提交 [WDSI](https://www.microsoft.com/en-us/wdsi/filesubmission) 并把回执记在 release notes。同类实例：[spicetify/cli#3097](https://github.com/spicetify/cli/issues/3097)（调研 B 第 86 行标注仅索引可见）；被 PE 补丁破坏签名的案例：[whiteguo233/OpenBiliClaw#281](https://github.com/whiteguo233/OpenBiliClaw/issues/281)（同为索引可见标题） |
| **T6** | SmartScreen / MOTW 拦截 | 未签名 + 低信誉 + 下载后带 MOTW | 用户看到 "Windows protected your PC" 而放弃 | 高（未签名必然） | **[未做]** 文档化 `Unblock` + "More info → Run anyway"（M1）；长期靠 Authenticode 签名改善。依据：MOTW 官方表述见 [Microsoft Learn](https://learn.microsoft.com/en-us/deployoffice/security/internet-macros-blocked) |
| **T7** | WDAC / AppLocker 企业策略拦截 | 企业用**文件哈希规则**白名单，我们每次新产物哈希都变 | 新版本被拦，用户无自助解封 | 中（企业环境） | **[未做]** 文档说明"每个新产物都需重新加白"，并建议企业走内部签名或放宽策略。官方区分签名者规则 vs 文件哈希规则：[Select types of rules](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/design/select-types-of-rules-to-create) |
| **T8** | 产物数字签名失效 | 任何字节改动 | 打过补丁的 exe 签名必然失效 | 高（**当前无签名，故无实际损失**） | **[已做]** `docs/DEVELOPMENT.md` 第 224 行与 `src/artcraft-patch.mjs` 第 48 行都写明"签名必然失效是预期行为"。官方依据：证书表覆盖映像哈希，追加节破坏签名 |
| **T9** | PE 对齐/尺寸算错 | 新节 VA 未对齐、`SizeOfImage` 忘改、尾部未按 `FileAlignment` 补齐、节属性缺失 | 加载失败（`0xC000007B`，**该错误码映射为经验性结论，未找到官方逐条文档**）或数据读不到 | 中 | **[已做]** 实测已通过：`sections=7`（≤96 上限）、`SectionAlignment=0x1000`、`SizeOfImage=78680064` 为对齐倍数、每节 `PointerToRawData`/`SizeOfRawData` 为 `0x200` 倍数、`CheckSum=0`（官方：加载期只校验驱动/引导 DLL/关键进程 DLL）、只追加只读数据节。**[未做]** 把"节属性只读且不含代码""尾部对齐""`SizeOfHeaders` 覆盖节表"做成断言（部分已在测试里） |
| **T10** | 变更面过大导致难定位 | 一次性替换大量文案 | 出问题时无法判断是哪条/哪步造成 | 中 | **[已做]** 只改 3 个 phf 条目；先长后短排序替换；大小写敏感、不 trim；`report.audit.changedOutside` 审计白名单外的字节变化 |
| **T11** | 可复现性被破坏 | brotli 版本/实现变化、遍历顺序不定、写入时间戳 | 第三方复算不一致，"可复现"声明失效 | 中 | **[已做]** 固定 `BROTLI_PARAMS = { quality: 11, lgwin: 24, mode: 'text' }`、不写时间戳、不动 `TimeDateStamp`/调试目录；验收标准定为"解压后资源逐字节一致 + 结构自洽 + CSP 正确"。**[未做]** 锁定 brotli 库版本、`BUILDINFO.txt`、diffoscope 报告（M5）；**[矛盾]** e2e 里仍有整文件哈希硬断言（M12）。依据：Tauri 官方承认"you cannot fully rely on reproducible builds by default"（[Tauri: Application Lifecycle Threats](https://v2.tauri.app/security/lifecycle/)）；[reproducible-builds.org: SOURCE_DATE_EPOCH](https://reproducible-builds.org/docs/source-date-epoch/)；[diffoscope](https://diffoscope.org/) |
| **T12** | "Tauri 不做运行时资源校验"是**基于证据缺失的假设** | 若上游未来给 `EmbeddedAssets` 加运行时哈希自检 | 补丁产物启动失败 | 低 | **[监测]** 调研 B 的表述是"**未找到公开资料表明** Tauri v1/v2 对 EmbeddedAssets 做运行时哈希/完整性校验"，并以官方 "Future Work" 把"从二进制里提取前端资源"描述为应当很直接来反证——**这是 absence of evidence，不是官方声明无校验**。当前补丁产物可正常启动渲染，属于支持该假设的实测证据，但仍应归入第 9 节存疑项 |
| **T13** | 环境假阴性（误判补丁失败） | 从受限沙箱工作区启动 exe 被阻塞；`reg.exe`/PowerShell 管道捕获失败 | 误判为"补丁把程序改坏了" | 中 | **[已做]** 已定位为环境问题并记录；`docs/DEVELOPMENT.md` 第 21–23 行写明两处管道捕获失败的降级路径（注册表读不到→兜底目录；版本读不到→主程序判为不可打补丁） |

### 6.3 维护风险

| # | 风险 | 触发条件 | 影响 | 可能性 | 缓解措施（状态） |
|---|---|---|---|---|---|
| **D1** | 译表/常量/CI/参考产物四个数字不一致 | 已发生 | CI 在正确方向失败；e2e 无法复现；对外无法宣布真实覆盖数 | **高（已存在）** | **[未做]** M11 |
| **D2** | 质量闸门未进 CI | 已存在 | "自带两个质量闸门"只是声明；半译/漏译可静默进入 main | **高（已存在）** | **[未做]** M10。注意 `check-coverage.mjs` 需要用户本机解包产物，只能做发布前检查表 |
| **D3** | 维护者文档与实现不符 | 已存在 | 误导接手者；"补丁未实现"与"已实验性支持"两种说法并存 | **高（已存在）** | **[未做]** M15 |
| **D4** | 单人维护、无第二维护者 | 维护者长期不可用 | issue 堆积、上游新版无人适配 | 中 | **[已做]** 定时巡检自动化了"发现"这一步；**[未做]** CONTRIBUTING 里的"接手/共同维护"路径与权限移交说明（**未找到同类明确范本**） |
| **D5** | 上游官方支持简体中文 → 项目价值塌缩 | 上游发布中文界面 | 项目退化为止损/归档 | 中 | **[未做]** M7 的生命周期条款。时间线实证：jetbrains-in-chinese 最新 tag `v2019.3`（2019-12-12）且 `releaseCount: 0`；notion-zh_CN 2024-04 停更，README 自述"Notion 已经有了中文语料"。**因果未证实**，见第 9 节 |
| **D6** | 上游版本漂移带来的 issue 洪水 | 上游发新版 | "XX 版本不支持"重复报告 | 高（同类实证） | **[部分已做]** `bug_report.yml` 强制版本字段 + `SUPPORTED_MAIN_VERSIONS` 版本门 + `config.yml` 分流到支持矩阵。**[未做]** M4 对外"不支持清单" |
| **D7** | 译表许可与贡献条款未单独声明 | 有人想复用译表 | 许可边界不清；若权利人主张时缺少明确的权利声明基础 | 中 | **[部分已做]** `README.md` 第 190 行说"翻译数据同样以 MIT 许可提供"。**[未做]** 是否引入 DCO/CLA、是否对译表采用更合适（如 NC）的许可，未决定 |

### 6.4 社区风险

| # | 风险 | 触发条件 | 影响 | 可能性 | 缓解措施（状态） |
|---|---|---|---|---|---|
| **C1** | 用户把"方框缺字"当成汉化失败反复报 issue | 用户装上 DesignCraft / PdfCraft / FilmCraft | 重复 issue + 负面评价 | 高 | **[已做]** `README.md` 第 78–79、157–159 行 + `docs/SUPPORTED-APPS.md` 第 63–68、87–97 行明确写"上游内嵌日文字体的 CJK 渲染缺陷"+ 已实测排除"装中文字体"+ 明确不做二进制字体替换；`bug_report.yml` 的 preflight 勾选项已包含"已阅读 README 常见问题（BOM、App 更新后需重跑、方框缺字）" |
| **C2** | 用户把 CSP 失配/白屏误判为"翻译没生效" | 未来改动内联脚本却漏重算 | 报告质量问题而非技术问题 | 中 | **[已做]** `selfCheck.cspOk` 与 `verifyCspHashes` 让工具自己先知道。**[未做]** FAQ 里加"白屏 / 某块功能消失"的排查条目（指向 CSP 失配症状）；CDP 冒烟门禁（T1） |
| **C3** | 杀软误报引发信任危机 | 用户被 Defender 拦 | 卸载 + 负面传播 | 高 | **[未做]** M1 |
| **C4** | 反作弊/合规敏感用户的质疑 | 用户担心改 exe 影响账号或稳定 | 劝退与争论 | 低-中 | **[已做]** `docs/DISCLAIMER.md` 第 35 行"不规避授权"+ 明确不联网、不上传、不采集遥测（第 63 行） |
| **C5** | 若被下架无镜像、社区无处可去 | 仓库被禁用 | 用户与译表贡献者失联 | 低-中 | **[未做]** 无镜像/自建站点方案。同类做法：Vencord 有 Codeberg 镜像（调研 A 第 13 行）。**[未做]** 也**不建议**主动做镜像（会削弱"配合下架"的承诺口径，需与 `docs/DISCLAIMER.md` 第五节一致后再定） |
| **C6** | issue 信息不足导致往返成本 | 用户只贴一句"没中文" | 维护者时间被消耗 | 中 | **[已做]** `bug_report.yml` 强制版本/系统/Node/`detect --json`/日志/复现步骤/是否已 revert。**[未做]** M2 的截图必填与双语标签 |
| **C7** | stale bot 误伤长寿 issue | 引入自动关闭 | "缺字/等上游适配"类诉求被错误关闭 | 低 | **[未做]（建议不做）** 调研 C 第 79 行明确：stale bot 在翻译类项目的效果"**无实例证据，仅为经验判断**"，且这类 issue 天然长寿。**当前结论：不引入** |

---

## 7. 优先级改进清单

### P0（不解决则对外声明不成立）

| 动作 | 为什么 | 落在哪个文件 / 模块 | 验收方式 |
|---|---|---|---|
| **P0-A** 把 `check-mixed-language.mjs` 接进 CI 的 `static` job；把 `check-coverage.mjs` 写进发布前检查表 | 闸门存在但无人运行，等于没有（M10 / D2） | `.github/workflows/ci.yml`（新增 step）；`docs/RELEASE.md`（新建，M5） | CI 日志出现该脚本输出；故意注入一条半译（如"正在上传 "尾随空格）能让 CI 红；`check-coverage` 在发布检查表里以"需用户本机解包产物"标注 |
| **P0-B** 统一译表条数为 2803（或明确回退到 2773），四处同步 | 四个数字互相打架，CI 会在正确方向失败（M11 / D1） | `data/translations.tsv`、`.github/workflows/ci.yml` 第 111 行、`src/constants.mjs` 第 56 行、`src/artcraft-patch.mjs` 的 `REFERENCE_FACTS.translations.total` | `node --test` 全绿；`ci.yml` 的行数断言改为从 `src/constants.mjs` 读取而非硬编码；e2e（设 `ARTCRAFT_FULL_TEST=1`）能跑通 |
| **P0-C** 新增"杀软误报 / SmartScreen / MOTW"FAQ | 误报几乎必然，逐个解释成本极高（M1 / T5 / T6 / C3） | `docs/ANTIVIRUS.md`（新建）+ `README.md`（中英各一段摘要）+ `.github/ISSUE_TEMPLATE/config.yml`（新增 `contact_links`） | 文档包含：原因、CI 构建的信任论证、`Unblock` 与 "Run anyway" 三步、**明确不教全局加白**；`contact_links` 能跳到该文档 |
| **P0-D** 修 e2e 的静默跳过与整文件哈希硬断言 | `continue` 让"解压后逐字节一致"这条**真标准**在缺文件时静默通过；整文件哈希与我们自己的可复现性标准矛盾（M12 / T11） | `test/artcraft-patch-algorithm.test.mjs` 第 606–660 行；`src/artcraft-patch.mjs` 第 6 行注释 | `compareImages`/整文件哈希变成信息性输出；"解压后资源逐字节一致"在缺参考文件时 `t.skip` 并打印原因（不是 `continue`）；路径改为环境变量/相对路径 |

### P1（显著降低维护与社区成本）

| 动作 | 为什么 | 落在哪个文件 / 模块 | 验收方式 |
|---|---|---|---|
| **P1-A** `docs/SUPPORTED-APPS.md` 补"主程序补丁支持的主程序版本"表 + "不支持/未适配"清单 | 版本边界只写在代码里等于让用户踩（M4 / D6） | `docs/SUPPORTED-APPS.md`；数据源 `src/artcraft-patch.mjs` 第 66 行 | 表里列出 `0.41.0 = 已实测`，与 `SUPPORTED_MAIN_VERSIONS` 一致；有"其它版本工具会拒绝而不是盲改"的明确表述 |
| **P1-B** 重写 `docs/DEVELOPMENT.md` 第 7、9 节为"已实现"，目录树补 `tools/`，新增"质量闸门"一节 | 维护者文档现在谎称"补丁未实现"；`check-coverage.mjs` 引用了不存在的内容（M15 / M13 / D3） | `docs/DEVELOPMENT.md` | 文档不再出现"骨架""未实现""本轮 pending"；出现 `tools/` 与两个闸门的用途/退出码/`allowlist.json` 规则 |
| **P1-C** 新增 `docs/RELEASE.md` 与 tag 时生成 `SHA256SUMS.txt` | 同类普遍没做，做了就是差异化与反误报证据（M5 / T5） | `docs/RELEASE.md`（新建）、`.github/workflows/`（新增 release job） | Release 资产含 `SHA256SUMS.txt` 与 `BUILDINFO.txt`（输入哈希 + 工具版本 + 输出哈希）；检查表含 WDSI 回执与 diffoscope 报告 |
| **P1-D** 补"重新汉化"入口与"已是汉化态"识别 | 更新后重跑是最高频用户路径（M8 / T3） | `src/commands/detect.mjs`、`src/commands/verify.mjs`、`src/inspect.mjs`；`README.md` FAQ | `detect` / `verify` 输出显式字段表示"当前是否已是汉化态"（如 `mainAppPatchState: 'original' \| 'patched' \| 'stale'`）；FAQ 给出固化口令 |
| **P1-E** README 补 ToS 折叠提示 + "项目生命周期"小节 | 同类在 ToS 上是直说的；生命周期条款把上游自身支持中文的不确定性变成明确承诺（M6 / M7 / D5） | `README.md`（中英各一处）、`docs/DISCLAIMER.md`（呼应） | 折叠块存在且措辞为事实性提示（不宣称合法、不假装已获授权）；生命周期三条（官方支持中文 → 归档；上游加签名/自检 → 公告不支持；权利人要求 → 配合下架）齐备 |
| **P1-F** `bug_report.yml` 截图字段独立且必填；字段标签补英文 | 界面问题无截图难判定；双语标签是国际贡献者唯一自助入口（M2 / C6） | `.github/ISSUE_TEMPLATE/bug_report.yml` | 截图成为 required 字段；主要字段 `label` 形如"问题描述 / Description" |
| **P1-G** 上游版本检测接入既有巡检 | 版本漂移是头号维护成本；巡检已有基础设施（M14 / D6） | 巡检卡片配置 + `.monitor-state.json` + `BUG反馈摘要.md` | 巡检摘要在上游版本变化时给出提示，并附"支持矩阵需更新"的待办 |

### P2（长期与锦上添花）

| 动作 | 为什么 | 落在哪个文件 / 模块 | 验收方式 |
|---|---|---|---|
| **P2-A** 决定译表的单独许可与贡献条款（是否 DCO/CLA、是否沿用 MIT） | 法律风险 L1 的缓解；同类有 CC BY-NC-SA 先例 | `docs/DISCLAIMER.md` 第四节、`CONTRIBUTING.md` | 文档明确写出译表的许可；贡献流程说明是否需要 DCO 签名 |
| **P2-B** 加极简 `README_EN.md` + README 顶部语言行 | 补国际读者入口；保留现有双语同文件模式（M9） | `README_EN.md`（新建）、`README.md` 第 1 行区域 | `README_EN.md` 存在且指向 `README.md#english`；命名用大写 `_EN` |
| **P2-C** CDP 运行时冒烟门禁 | 把"翻译没生效"这类误判从人工排查变成自动断言（T1 / C2） | 发布前脚本（本地，不进仓库） | 启动补丁产物后收集 CSP violation 为空，且 DOM 含预期中文断言通过 |
| **P2-D** 补齐 PE 产物自检断言（节属性只读/不含代码、尾部对齐、`SizeOfHeaders` 覆盖节表） | 把已满足的约束从"手工核对"变成"自动断言"（T9） | `src/artcraft-patch.mjs`（自检函数）、`test/artcraft-patch-algorithm.test.mjs` | 断言集中出现上述四项，失配时报错退出而非静默 |
| **P2-E** 明确不引入 stale bot | 翻译类 issue 天然长寿，自动关闭可能误伤（C7） | `README.md` 或维护者说明 | 文档中写明"issue 不会因长期无活动被自动关闭" |
| **P2-F** 评估镜像/自建站点 | 被下架后社区无处可去（C5）；但与"配合下架"口径需先统一 | 待定（需先改 `docs/DISCLAIMER.md` 第五节口径） | 只有在法律口径明确后才考虑；**当前建议不动** |

---

## 8. 附录：受控的不汉化清单

以下条目**刻意不汉化**，不是漏译。清单来自任务给定的实测结论与 `tools/allowlist.json`。

| 类别 | 具体项 | 理由 |
|---|---|---|
| **ID3 标准流派枚举表** | 192 条（如 `Pop`、`Classic rock`、`Instrumental`、`Experimental`、`New age`、`Rhythm and blues`） | MP3/MP4 元数据解析器直接在用这些值。翻译等于**篡改格式枚举值**——写入文件后其它播放器/解析器会读不懂，属于破坏数据而非本地化。`hanhua-build/merge-v2-report.txt` 第 126–133 行的 `dropped (stay English): 192` 即这批条目（示例值可逐条核对） |
| **形状名与 `media_id` 同字面量** | `Cylinder` / `Donut` / `Sphere` / `Water`（4 项） | 这些字面量同时充当 `media_id`。翻译会让**英文版存过的 3D 场景匹配失败**——用户在自己英文版里保存的工程打不开或丢元素 |
| **品牌与模型名** | Midjourney、Grok、Runway、Kling、Sora、Vidu、Fal 等 | 专有名称，翻译会造成指代错误；也是 `allowlist.json` 的主要构成（另含 ArtCraft、Seedance、Seedream、Nano Banana、Stable Diffusion、ComfyUI 等） |
| **库/运行时开发者报文** | React Aria / Three.js / Konva 的报错与警告 | 这些字符串常被开发者用于搜索与定位；翻译后无法检索官方资料。半译版本更糟——`merge-v2-report.txt` 里 2289/2290/2328–2330 把 Konva 的 `Stage` 从"半译"改为"画布"，正是这一类被处理干净的例子 |
| **键盘键名** | Enter / Shift / Shift+Enter / Ctrl / Alt / Esc / Tab / Space / Backspace / PageUp 等 | 键名是物理标识，不是文案；翻译会让用户对不上键盘 |
| **库/框架类名与字段** | React Aria / Three.js / Konva 的类名与字段（如 `OrbitControls.js`、`ObjectLoader`、`DepthTexture`、`PointLight`、`aria-hidden`、`Symbol.dispose`） | 代码标识符，翻译会破坏语义与可检索性 |
| **内部 slug / id** | `sparkviewpoint`、`Image1`、`Video1`、`Audio1`、`sh1`、`UUIDv7` 等 | 内部标识符，改动会导致匹配失败 |

**维护规则（引用 `tools/allowlist.json` 的 `_comment` 原文）**：
> "Tokens that legitimately stay Latin inside Chinese UI text. Anything not listed here (and not matched by the library-message patterns in check-mixed-language.mjs) is reported as a half-translated string. Keep this list to brands, model names, file formats, units, keyboard keys, acronyms and internal identifiers - never add a word that is really user-visible UI text (for example Stage, Splat, Setup, keyframe, surface, History)."

即：**允许清单只能加"品牌 / 模型名 / 文件格式 / 单位 / 键盘键名 / 缩写 / 内部标识"，绝不允许把用户可见的英文单词加白**。这条规则应随 M13 一起写进 `docs/DEVELOPMENT.md`，让"不用 allowlist 掩盖漏译"成为可审查的约定。历史证据：`Stage`、`Splat`、`keyframe`、`surface`、`Plan`、`image`、`inpaint`、`Outliner`、`sink` 这一类词都**不被加白**，而是通过统一术语译掉（见 `merge-v2-report.txt` 的 `v2-fix*.tsv` 110 条修正）。

---

## 9. 未验证 / 存疑清单

> 以下条目**不得当作结论引用**。它们来自调研 A/B/C 的不确定项，以及本次核对中发现的、我们自己的假设与文档冲突。

**来自调研 A/B/C 的原生不确定项**

1. "24 小时内删除"式条款在 GitHub 汉化仓库中的**普遍程度**——未系统统计（调研 C 第 158 行）。
2. 第三方 JetBrains 汉化停更与官方中文包之间的**因果关系**——只有时间线（第三方最新 tag `v2019.3` / 2019-12-12；官方插件 13710 "Starting from version 2024.2, the plugin is bundled"），**无作者声明**（调研 C 第 45 行）。
3. 汉化补丁/译表在**中国的判例原文**——未取到；调研 C 第 5.2 节仅为条文与观点并列（第 107 行）。
4. **人人影视字幕组案**判决原文——抓取的报道页未取到正文，调研 C 不引用其细节（第 107、161 行）。
5. **winget / scoop / npm 分发汉化项目的实例**——未验证到；调研 C 明确说"不要把这条写进路线图当成行业惯例"（第 121 行）。
6. **`asxez/DDCS`** 汉化脚本的内部逻辑（备份/回滚/版本检测能力）——只确认仓库与文件存在（调研 C 第 115、163 行）。
7. **stale bot** 在翻译类项目中的实际效果——**无实例证据，仅为经验判断**（调研 C 第 79、164 行）。
8. **XUnity.AutoTranslator 的许可证与免责措辞**——调研 C 未定位到（第 165 行）。
9. **spicetify 是否收到过 Spotify 通知**——公开检索未命中针对该仓的通知（调研 A 第 81 行）。
10. **Discord 是否真的对改装用户封禁**——Vencord 自述"no known cases"，**未核实**（调研 A 第 46 行）。
11. **Vencord / BetterDiscord 如何应对 ASAR integrity**——调研 B 明确"未找到公开资料"（第 39 行）。
12. **Electron ASAR integrity 的 CFG 相关细节**——调研 B 第 109 行明确"本报告不对该细节下结论"。
13. **PE 加载失败错误码 `0xC000007B` 的映射**——调研 B 标注为**经验性结论，未找到官方逐条文档**（第 115 行）。
14. **`github/dmca` 里 Terraria 案对应的原始投诉通知**——2019/02 目录下未找到，未验证（调研 C 第 93 行）。
15. **`phf 0.13` 的开放寻址布局**是否有空槽/特殊编码——调研 B 第 145 行标为不确定项。**本次核对更新**：`src/artcraft-patch.mjs` 的 `findPhfEntries` 已按"候选窗口 228 个、密集分布在 `.rdata` 0x3cf0428..0x3cf2220"实现，需注意这仍是**针对该次构建实测的条目数与簇形状**，换版本后应由搜索+断言重新判定，而不是把 228 当成常量。
16. **README 语言是否影响搜索排名**——未找到 GitHub 官方说明；可确认的只有"GitHub 没有按语言切换 README 的功能"（调研 C 第 59 行）。

**本次核对新发现的不确定项 / 内部冲突**

17. **"Tauri v2 不对内嵌资源做运行时完整性校验"是 absence of evidence**，不是官方声明。调研 B 的原文是"**未找到公开资料表明**"（第 12 行），并以官方 "Future Work" 措辞作为反证。当前补丁产物能正常启动渲染，属于支持该假设的实测证据，但不能升级为"Tauri 保证不校验"。同理，**"主程序没有自动更新器"是本次对 `artcraft.exe` 的检索结论**（`tauri-plugin-updater` / `minisign` / `latest.json` / `UpdaterExt` / `check_for_update` 全部未命中；裸串 `updater`、`pubkey` 出现在 WebSocket 帧状态枚举与 BoringSSL x509 源码路径里，与更新无关）——它对 **v0.41.0 这一个构建**成立，对上游未来版本不成立。
18. **`tools/check-coverage.mjs` 的"1713 条候选 / 124 条有明确 UI 属性上下文"**与 **`check-mixed-language` 的"接入前 296 行 → 清理后 105 行"**均为任务给定实测数字，**本次未能独立复现**（`check-coverage.mjs` 需要用户本机解包的原始/补丁后 bundle 两个输入，仓库内无此数据；`check-mixed-language.mjs` 的运行结果本次未采集）。引用时应标注来源。
19. **调研 A 与调研 C 对 XUnity.AutoTranslator 给出不同仓库 URL**：调研 A 第 14、51–52 行用 [bbepis/XUnity.AutoTranslator](https://github.com/bbepis/XUnity.AutoTranslator)，调研 C 第 23 行用 [LavaGang/XUnity.AutoTranslator](https://github.com/LavaGang/XUnity.AutoTranslator)。**本次未核实哪个是当前上游**（迁移/改名都会造成这种差异）。第 3 节矩阵采用调研 A 的 URL，并在调研 C 的星标/版本数据旁不再重复引用该 URL。
20. **`test/artcraft-patch-e2e.test.mjs` 不存在**，但 `src/artcraft-patch.mjs` 第 6 行注释引用了它；实际 e2e 在 `test/artcraft-patch-algorithm.test.mjs`。是"文件被改名/合并"还是"计划中未创建"，**未找到依据**（见 M12）。
21. **参考产物的输入译表条数与仓库译表条数不一致**：参考产物按 **2803** 条构建，仓库表是 **2773** 条，e2e 断言 `translations.length === REFERENCE_FACTS.translations.total`（即 2773）。因此该 e2e **在设 `ARTCRAFT_FULL_TEST=1` 时应当失败**——但本次**未实际运行**（需 7 MB 原件 + 参考产物 + 约 1 分钟 brotli q11 重压；且不得运行任何 exe、不得改动仓库）。此判断为**静态推断**，需实测确认（见 M11）。
22. **`docs/DEVELOPMENT.md` 第 174 行称译表为 `hanhua-build/merged.tsv` 复制而来、146 834 字节**——与仓库实际字节数一致（已实测），但该路径在仓库外，属维护者本机上下文；`merged.tsv` 本身**本次未核对**。
23. **`CHANGELOG.md` 的 `[0.1.0] - 2026-10-13` 声称主程序补丁已"**实验性**支持**"，而 `docs/DEVELOPMENT.md` 仍说"未实现"**——两个仓库内文件互相矛盾。哪一个反映当前真实状态，**应以代码为准**（`src/artcraft-patch.mjs` 已实现 1698 行），但**"实验性"是否已对真实用户端到端验证过**（而不仅是 e2e 门控测试），本次未取得证据。
24. **定时巡检确实在运行**（`.monitor-state.json` 的 `last_check: 2026-10-13T15:48:46Z`；`BUG反馈摘要.md` 记录该次巡检"接口返回 HTTP 200 与空数组，仓库当前没有任何 issue 也没有任何 pull request"）——但这**只证明 2026-10-13 那一次**，不能推断此后仍在运行；本次未读取看板卡片本身。
25. **本报告未独立访问任何外部 URL**（遵守"不得编造 URL / 不得运行 exe / 不改动仓库其他文件"的约束）。所有链接均**转录自调研 A/B/C**，其中调研 B 第 86–87 行与第 39 行等多处已自标"仅索引可见""未读正文""未找到公开资料"。引用这些链接时应同时保留调研的取证强度标注。

---

## 附录：本报告发现项的处理状态（报告定稿后更新）

以下条目在报告写成之后已处理，**第 5–9 节与第 21 条的对应描述已过期**，以本节为准。

| 条目 | 状态 | 证据 / 落地位置 |
|---|---|---|
| **M11 / D1 译表条数四处打架** | **已修** | 译表统一为 **2803**（现行 id 连续 `0001`–`2803`）；`ci.yml` 不再硬编码，改为 `node -e "import('./src/constants.mjs')…"` 从**单一来源**取预期条数；`EXPECTED_TRANSLATION_COUNT = 2803`；`REFERENCE_FACTS.translations.total = 2803`。commit `9660712` + `406b600` |
| **M10 质量闸门没进 CI** | **部分已修** | `tools/check-mixed-language.mjs` 已作为**阻断门**接入 `static` job（带 `--allow` 与 token 级 `--baseline`，实测：干净表退出 0；人为注入一条新漏译退出 2）。`tools/check-coverage.mjs` **结构上无法进 CI**（需要用户本机解包的宿主 bundle，而仓库禁止携带宿主资源），改为写进 `docs/DEVELOPMENT.md` 第 9 节的**发布前检查表**。commit `9660712` |
| **M15 DEVELOPMENT.md 与 CHANGELOG 互相矛盾** | **已修** | 该文档不再称补丁为"骨架/未实现"，第 7 节按真实代码重写（导出清单、`ARTCRAFT_PATCH_VERSION = 2`、`SUPPORTED_MAIN_VERSIONS = ['0.41.0']`、`selfCheck`/`audit` 字段、可复现性边界）。commit `81266fc` |
| **M13 check-coverage 无文档** | **已修** | 同上，`DEVELOPMENT.md` 新增质量闸门与发布前检查表一节 |
| **M12 e2e 与可复现性标准矛盾** | **已修（并已实测）** | 端到端验收**已实际运行通过**：`ARTCRAFT_FULL_TEST=1` 下 **43/43 通过**，硬断言 `compareImages(产物, 参考) === -1`（逐字节相同）。Node 补丁实现从原件 + 2803 条译表出发，产出的 exe 与独立的 Python 构建**整文件 SHA-256 相同**（`0525f333…`），解压后三个资源逐字节相同。commit `0f17c10`（修掉测试里一个错误的节区索引与过期的 v3 CSP 参考值——**两处都不是补丁本身的缺陷**） |
| **第 21 条"e2e 应当失败"的静态推断** | **推断已被实测推翻** | 该 e2e 之所以当时会失败，只是 `REFERENCE_FACTS.jsCspHashAfter` 还留着 v1（2773 条）的旧哈希；补丁算出的 `sha256-KehCoiXg…` 与 Python 实现完全一致 |
| **第 18 条两组数字"未独立复现"** | **已复现** | `check-coverage.mjs` 实测 **1713 条候选 / 124 条有 UI 属性上下文**；`check-mixed-language` 实测接入前 **296 行**（256 面向用户 + 40 库报文）→ 清理与白名单后 **105 行**，基线化后新增项归零。报告写作时的"未复现"标注可以移除 |
| **第 19 条 XUnity.AutoTranslator 两个仓库 URL** | **仍未核实** | 保持"未核实"标注，矩阵继续采用调研 A 的 URL |
| **第 23 条"实验性是否对真实用户端到端验证过"** | **部分已答** | 补丁产物已在真实安装上启动并渲染中文（多次截图取证），但对**全部功能路径**（登录、生成、导出、保存场景）未做穷尽回归；第 6.2 节技术风险 T 项中"未做功能回归"仍然成立 |
| **`npm run check-mixed-language` 缺 `--baseline` 会误红** | **已修** | 脚本命令补上 `--allow` 与 `--baseline`（报告写作时该命令会以退出码 2 失败） |
| **`src/artcraft-patch.mjs` 第 137 行注释自相矛盾** | **已修** | 改为"这里记的是快照值，断言一律读实际数据" |
| **`tools/check-mixed-language.mjs` 的 `--fix` 只存在于用法文本** | **已修** | 从用法文本移除，并写明"为什么刻意不提供 `--fix`：某个 token 该翻译、该加白名单还是该进基线是判断题，不是一次重写" |

**仍然成立的最高优先级风险**（未因上述修复而消失）：法律定性（译表是否构成演绎作品、§1201 反规避主张）属**存在争议**且非法律意见；上游换成 Electron/ASAR integrity 一类带运行时校验的方案会让当前打法失效；"上游官方出中文即归档"的生命周期条款已写入 README，但**归档时机仍需人工判断**。


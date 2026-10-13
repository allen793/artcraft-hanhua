# 免责声明与法律边界 / Disclaimer & Legal Boundary

本文件面向使用者、贡献者与权利人，说明本项目的法律边界。若本文件与 `README.md` 中的表述有出入，以本文件为准。
This document states the legal boundary of this project for users, contributors, and rights holders. Where it differs from `README.md`, this document governs.

[中文](#中文) ｜ [English](#english)

---

## 中文

### 一、本项目提供什么

本项目**只提供两样东西**：

1. **补丁工具**：一个零第三方依赖的 Node.js 命令行程序，用于识别本机已安装的 ArtCraft 组件、改写其语言配置，或替换主程序内嵌的前端资源，并可回滚。
2. **翻译数据**：由社区贡献的纯文本界面翻译词条。

本项目**不提供、不包含、不重新分发**以下任何内容：

- ArtCraft 主程序、ArtCraft Launcher 或任何 Craft App 的可执行文件、安装包或更新包；
- 从上述程序中提取的原始资源文件（前端资源、字体、图像、图标、音频、语言文件等）；
- 任何绕过授权、许可或付费机制的组件、密钥或方法。

仓库中的一切内容均为工具源码、翻译数据与文档，且仓库**不接受**上述任何第三方二进制或资源（仓库守卫会拒绝 `*.exe`、`*.dll`、`*.msi`、`*.zip` 等文件的提交）。

### 二、使用者的责任

使用本工具即表示你确认并同意：

1. **合法性**：你已通过合法途径获得所修改软件的安装与使用权利；你需要**自行拥有合法的 ArtCraft 安装**。
2. **自用性质**：本工具仅供**个人学习、研究与自用汉化**。
3. **禁止商业再分发**：不得将本工具、其汉化产物或翻译数据用于**商业再分发**；不得与 ArtCraft 安装包、更新包捆绑分发；不得以本项目内容作为付费产品或付费服务的主要卖点。
4. **风险自担**：本工具会修改本机已安装的程序文件。尽管工具会先备份、记录哈希并支持回滚，你仍需自行评估风险，并在操作前保留可恢复的副本。因使用本工具造成的任何损失（包括程序无法启动、数据丢失、更新失败等），由使用者自行承担。
5. **不规避授权**：本工具**不**用于、也不得被用于规避任何授权、许可、订阅或付费机制。
6. **支持正版**：请通过官方渠道获取并支持正版软件。

### 三、关于商标与关联关系

1. `ArtCraft` 及相关名称、标识、图标是**其各自权利人的商标**或注册商标。
2. 本项目仅在**事实性指代**的意义上使用这些名称（例如说明"本工具用于给 ArtCraft 主程序做简体中文本地化"），**不使用其标识作为本项目的品牌、徽标或头像**，也不暗示任何形式的合作。
3. 本项目与 ArtCraft 及其开发团队、发行方**没有任何关联**，**未获得其授权、认可、赞助或支持**。
4. 本项目不由任何软件厂商维护，也不代表任何厂商的立场。

### 四、关于翻译数据

1. 翻译数据为**社区贡献**的原创文本，采用与本项目相同的 MIT 许可发布。
2. 翻译数据仅描述通用界面概念（如菜单名、按钮名、选项卡名）。若权利人认为某段译文与其官方术语冲突，或认为任何内容侵犯其权利，请按下节联系，本项目将配合处理。
3. 翻译可能存在错误或不准确之处，欢迎通过 Issue 或 PR 修正。

### 五、权利人的要求与下架承诺

如果商标权人、著作权人或任何权利人认为本项目的内容（包括名称、文档、翻译数据或工具实现）不妥或构成侵权：

1. 请通过 GitHub 私下联系维护者（[@allen793](https://github.com/allen793)）或在本仓库提交 Issue 说明情况；
2. 本项目将**及时核实并配合处理**，包括但不限于：修改表述、移除争议内容、删除翻译数据或**下架整个仓库**；
3. 本项目不以任何形式对抗或拖延此类要求。

本项目的目的是让中文用户在自己合法拥有的软件上获得更好的使用体验，无意侵犯任何人的权利。

### 六、其他

1. 本工具**不联网**：不下载内容、不上传数据、不采集遥测、不发送任何文件路径或配置信息。
2. 本工具按 MIT 许可"按原样"提供，**不提供任何明示或暗示的担保**。
3. 主程序的汉化路径涉及对可执行文件的修改，在本项目中明确标记为 **experimental（实验性）**，请谨慎使用。
4. 本文件不构成法律意见。如有法律疑问，请咨询专业人士。

---

## English

### 1. What This Project Provides

This project provides **exactly two things**:

1. **A patch tool** — a zero-dependency Node.js CLI that detects the ArtCraft components installed on the local machine, rewrites their language configuration or replaces the main application's embedded frontend resources, and can revert those changes.
2. **Translation data** — plain-text UI strings contributed by the community.

This project does **not** provide, contain, or redistribute any of the following:

- Executables, installers, or update packages for the ArtCraft main application, ArtCraft Launcher, or any Craft App;
- Original resource files extracted from those programs (frontend resources, fonts, images, icons, audio, language files, and similar);
- Any component, key, or method that bypasses licensing, activation, or payment mechanisms.

Everything in the repository is tool source, translation data, or documentation. The repository **refuses** third-party binaries and resources of the kind described above (a CI guard rejects commits containing `*.exe`, `*.dll`, `*.msi`, `*.zip`, and similar).

### 2. User Responsibilities

By using this tool you confirm and agree that:

1. **Lawfulness** — you obtained the software you are modifying through legitimate means; you must **own a legitimate ArtCraft installation** yourself.
2. **Personal use** — this tool is for **personal study, research, and self-use localization** only.
3. **No commercial redistribution** — you may not use this tool, its localized output, or its translation data for **commercial redistribution**, may not bundle them with an ArtCraft installer or update package, and may not make this project's content the main selling point of a paid product or service.
4. **Risk accepted** — the tool modifies program files installed on your machine. It backs up first, records hashes, and supports revert, but you must still assess the risk yourself and keep a recoverable copy before use. Any loss caused by using this tool (including a program that no longer starts, data loss, or failed updates) is borne by the user.
5. **No circumvention** — this tool does not, and must not be used to, circumvent any licensing, activation, subscription, or payment mechanism.
6. **Support the official software** — please obtain the software through official channels.

### 3. Trademarks and Affiliation

1. `ArtCraft` and related names, marks, and icons are **trademarks of their respective owners**.
2. This project uses those names only for **factual reference** (for example, to state that the tool provides Simplified Chinese localization for the ArtCraft main application). It does **not** use any ArtCraft mark as this project's brand, logo, or avatar, and implies no partnership.
3. This project is **not affiliated with** ArtCraft, its development team, or its publishers, and has **no authorization, endorsement, sponsorship, or support** from them.
4. This project is not maintained by, and does not represent, any software vendor.

### 4. Translation Data

1. Translation data is **community-contributed** original text, released under the same MIT license as the rest of the project.
2. It describes generic UI concepts only (menu, button, and tab names). If a rights holder believes a translation conflicts with official terminology or infringes their rights, please make contact as described below and the project will cooperate.
3. Translations may contain mistakes or inaccuracies; corrections through issues and pull requests are welcome.

### 5. Rights Holder Requests and Takedown Commitment

If a trademark owner, copyright owner, or any rights holder believes that content in this project (including its name, documentation, translation data, or implementation) is inappropriate or infringing:

1. Please contact the maintainer privately on GitHub ([@allen793](https://github.com/allen793)) or open an issue in this repository explaining the concern;
2. This project will **verify promptly and cooperate**, including by rewording, removing the disputed content, deleting translation data, or **taking down the entire repository**;
3. This project will not contest or delay such a request.

The goal of this project is to give Chinese-speaking users a better experience with software they legitimately own. It intends to infringe no one's rights.

### 6. Other

1. This tool **does not use the network**: it downloads nothing, uploads nothing, collects no telemetry, and transmits no file paths or configuration.
2. The tool is provided "as is" under the MIT license, **without warranty of any kind**, express or implied.
3. Localizing the main application involves modifying an executable and is explicitly marked **experimental**; use it with care.
4. This document is not legal advice. Consult a professional for legal questions.

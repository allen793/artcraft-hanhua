# 常见问题：杀软误报、SmartScreen 与更新 / FAQ: antivirus, SmartScreen and updates

> 本文只回答"工具本身"相关的疑问（误报、拦截、上游更新）。使用类的常见问题见 [README 的「常见问题」](../README.md#常见问题)，各程序的实测状态见 [docs/SUPPORTED-APPS.md](SUPPORTED-APPS.md)。
>
> **本文中的外部链接均于 2026-10-14 实际访问过**，来源为 Microsoft Learn / Microsoft 官方站点，页面内标注的 "Last updated" 也一并列出。**本文没有引用任何未经访问的链接**；对于查不到公开依据的说法，本文写明"未找到公开依据"。

[中文](#中文) ｜ [English](#english)

---

## 中文

### 0. 先厘清一件事：本项目不发布任何 exe

很多"汉化工具被报毒"的讨论默认工具作者发布了一个 exe。**本项目不是这样**：

- 仓库里只有 **Node.js 工具源码**与**纯文本译表**，没有 exe/dll/msi/zip/字体，CI 的 `repo-guard` 任务会拒绝这类文件（见 [.github/workflows/ci.yml](../.github/workflows/ci.yml)）。
- 你下载的 `artcraft.exe` / `artcraft-zh-full.exe` **不是我们发的**：前者来自 ArtCraft 官方安装包，后者是**在你自己机器上**由工具生成的。
- 所以"我们的产物哈希"这种东西并不存在固定值——**每次汉化生成的 `artcraft-zh-full.exe` 哈希都取决于你的原件**，无法预先公布一份清单。详见第 3 节。

这条事实决定了本文后面所有建议的形态：**我们能解释、能自证流程，但不能替某个 exe 背书。**

### 1. 为什么改了 exe 之后会被 SmartScreen 拦？

Microsoft 官方对 SmartScreen 的判定方式说明如下（[Microsoft Defender SmartScreen 概述](https://learn.microsoft.com/en-us/windows/security/operating-system-security/virus-and-threat-protection/microsoft-defender-smartscreen/)，页面标注 Last updated 2026-04-23，访问 2026-10-14）：

> - "Checking downloaded files against a list of files that are well known and downloaded frequently. If the file isn't on that list, Microsoft Defender SmartScreen shows a warning, advising caution."
> - "It also provides reputation checks for apps, checking downloaded programs and the digital signature used to sign a file. If a URL, a file, an app, or a certificate has an established reputation, users don't see any warnings. **If there's no reputation, the item is marked as a higher risk and presents a warning to the user.**"

翻成一句话：**SmartScreen 看的是"这个文件/这张证书有没有信誉"，而不是"这个文件有没有病毒"。** 一个新生成、从未被下载过、也没有数字签名的 exe，天然落入"没有信誉"这一档，于是弹警告。这是**基于信誉的默认行为**，不是针对本项目的判断。

对被打过补丁的 exe 来说，还有两个叠加因素：

1. **它是本机新生成的文件**：没有任何下载信誉记录；
2. **它的字节与官方产物不同**：官方安装包的哈希/信誉对不上它。

### 2. 为什么 Defender 可能报毒（而不是只弹警告）？

我们**不掌握** Microsoft 的查杀模型，所以这里只陈述可核对的事实，不做"一定不会报毒"的保证：

- 本工具对主程序做的事是：**在 PE 文件末尾追加一个新的只读数据节**（实测：节数 6 → 7，新节名 `.asst`，属性 `0x40000040` = `INITIALIZED_DATA | MEM_READ`），并改写 3 个 phf 条目里的 `value.ptr` / `value.len`，其余字节不动（`report.audit.changedOutside === 0`）。工具**不写代码节、不加可写节、不碰授权与许可校验**。
- 但"**自修改/被修改过的 PE**"在启发式引擎眼里本来就是敏感形态：字节与官方不一致、没有签名或签名失效、且是刚被生成出来的新文件。
- 因此实际到位的是两类东西：**SmartScreen 的信誉警告**（几乎必然，见第 1 节）与**启发式误报**（可能发生，取决于你机器上的引擎与云情报状态）。

**签名失效是预期行为，不是损坏。** 本项目的工具**不做任何签名操作**。打过补丁的 exe 即使原来有签名，也会因为字节改动而校验失败——这一点在 [src/artcraft-patch.mjs](../src/artcraft-patch.mjs) 的文件头注释里也写明了。原件当前是否有签名**请用下面第 3 节的命令自己核对**（本项目的评估材料把主程序记为"无 Authenticode 签名"，但那**不是本文实测的结论**）。

### 3. 怎么自查（不靠信任我们）？

按"从官方到本机"的顺序核对，每一步都能独立验证：

1. **确认原件来自官方安装包。** 汉化前后的东西都以你本机的 `artcraft.exe` 为输入；它是不是官方装的、有没有被替换过，只能由你自己确认。可以看文件版本资源：
   ```powershell
   (Get-Item 'H:\ArtCraft\artcraft.exe').VersionInfo | Format-List ProductName,ProductVersion,FileVersion,OriginalFilename
   (Get-AuthenticodeSignature 'H:\ArtCraft\artcraft.exe') | Format-List Status,StatusMessage
   ```
   （路径按你的安装位置改。）
2. **确认你跑的是本仓库的源代码，而不是别人打包的 exe。** 本项目零第三方运行时依赖，**不需要 `npm install`**，直接用仓库里的 Node 入口运行即可：
   ```powershell
   git clone https://github.com/allen793/artcraft-hanhua.git
   cd artcraft-hanhua
   node bin/artcraft-hanhua.mjs detect --json
   ```
   Node 本身请从 <https://nodejs.org/> 装官方版本。**没有"artcraft-hanhua.exe"这种官方发布物**；如果某个地方在提供它，那不是我们发布的。
3. **确认改动范围。** 补丁会打印自己的自检结果（`selfCheck.cspOk`、`audit.changedOutside`、PE 对齐），`hanhua --dry-run` 会先把计划打出来、一个字节都不写；`revert` 用备份还原并用 SHA-256 校验。任何一步对不上，工具是**报错退出**而不是继续写。
4. **确认改动只在你自己机器上发生。** 工具不联网、不上传、不采集遥测。

> ⚠️ **关于"GitHub Actions 构建可信度"的说明（重要，且与同类工具的说法不同）**
>
> 有些同类汉化/注入项目会用"本软件由 GitHub Actions 自动构建"来论证可信。**本项目不这么论证**，因为：
>
> - 我们没有需要构建的产物——发布物只有**可读的 JavaScript/文本源码**，你在本机直接运行，不存在"作者本机的编译器被污染"这一环；
> - 本仓库的 CI（[.github/workflows/ci.yml](../.github/workflows/ci.yml)）**只做检查**：跑测试、语法检查、译表结构断言、半译门禁、以及"仓库不得包含二进制/大文件"的守卫。**CI 不产出任何可供下载的二进制**。
>
> 也就是说：你可以自己读源码（`src/` 共 24 个 ESM 文件，零依赖），也可以自己跑 CI 里跑的同一套检查（`node --test`）。这比"相信一次构建"要强；但**它也不能证明你这台机器上生成的 exe 一定不被误报**——那是引擎与云情报的判断，我们无法代它下结论。

### 4. 被误报了怎么办（用户侧）

按"影响面从小到大"的顺序，推荐前两步：

1. **确认自己确实信任这个文件，再解除"来自 Internet"的标记（Mark of the Web）。**
   这是文件属性上的一个标记，不是杀毒判定。微软官方文档给出的定义与操作（[MSB3821 诊断代码](https://learn.microsoft.com/en-us/visualstudio/msbuild/errors/msb3821?view=vs-2022)，页面标注 Last updated 2026-09-02，访问 2026-10-14）：
   > "When you download web assets like HTML pages to a Windows device by using a browser, the browser inserts a marker called the _mark of the web_, which records the security zone of the site from which the page originated."
   >
   > "If you decide to trust the content in question, you can remove the _mark of the web_ by unblocking a single file from File Explorer. Open the **Properties** window on the file, and select **Unblock**. You can also unblock multiple files with a PowerShell script and the [Unblock-File](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/unblock-file) cmdlet."

   即：右键文件 → **属性** → 勾选 **解除锁定（Unblock）** → 确定。也可以用 `Unblock-File <路径>`。
2. **向微软提交误报分析。** 官方入口是 [Microsoft Security Intelligence 文件提交站](https://www.microsoft.com/en-us/wdsi/filesubmission)（访问 2026-10-14）；[SmartScreen 概述页](https://learn.microsoft.com/en-us/windows/security/operating-system-security/virus-and-threat-protection/microsoft-defender-smartscreen/)明确写了提交方式，并提示：
   > "When submitting a file for Microsoft Defender SmartScreen, make sure to select **Microsoft Defender SmartScreen** from the product menu."

   Defender 查杀误报的处置流程（含"哪些情况该提交、提交后会发生什么"）见 [Address false positives/negatives in Microsoft Defender for Endpoint](https://learn.microsoft.com/en-us/defender-endpoint/defender-endpoint-false-positives-negatives)（页面标注 Last updated 2026-09-02，访问 2026-10-14）。
3. **企业环境请交给 IT，而不是让用户自己加白。** 下面是官方文档的原话，我们**完整保留它的语气**，不改成"加白就好"（[Configure custom exclusions for Microsoft Defender Antivirus](https://learn.microsoft.com/en-us/defender-endpoint/microsoft-defender-antivirus-exclusions-configure)，页面标注 Last updated 2026-09-09，访问 2026-10-14）：
   > "You usually don't need to define exclusions for Microsoft Defender Antivirus."
   >
   > ⚠️ "**Every exclusion lowers your level of protection.**"

   出于同样的理由，**本项目不会教任何人做全局/无差别加白，也不建议为了跑这个工具去关闭实时保护**。企业环境的正确做法是由 IT 评估后走内部策略。
4. **企业 App Control（WDAC）/ AppLocker 用"文件哈希规则"时会每次都拦。** 官方说明（[Understand App Control for Business policy rules and file rules](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/design/select-types-of-rules-to-create)，页面标注 Last updated 2026-03-29，访问 2026-10-14）：
   > "**Hash**: Specifies individual Authenticode/PE image hash values for each discovered binary. This level is the most specific level, and requires more effort to maintain the current product versions' hash values. **Each time a binary is updated, the hash value changes, therefore requiring a policy update.**"

   而我们的产物**每个版本、每次打补丁哈希都会变**，所以"按哈希加白"意味着**每生成一个新产物就要重新加白一次**。这不是我们特有的缺陷，而是"改宿主二进制"这条路线的固有代价。企业用户请优先考虑签名者规则或内部签名，或干脆不使用本工具。
5. **我们能做但尚未做的事（如实标注）。** 上游路线是给主程序加 Authenticode 签名以改善信誉；本项目当前**没有**签名能力，**也没有**发布产物哈希清单（因为产物是你本机的输入决定的，见第 0 节）。**未找到公开依据**表明存在针对"本地生成的补丁产物"的集中信誉改善途径。

### 5. 上游发新版之后，汉化"'失效'了"或被覆盖了

**这通常不是汉化坏了，而是官方包把你的改动覆盖/替换掉了。**

- **现象**：界面回到英文；或工具报"主程序暂不处理：/ 不支持该版本"。
- **原因**：ArtCraft 更新会用官方文件整体替换被改写的内容——对配置文件是覆盖回英文，对主程序是换成新的 `artcraft.exe`。这是"资产被替换"，不是"校验失败"。
- **处置**：**重新跑一次汉化**。
  ```powershell
  node bin/artcraft-hanhua.mjs detect
  node bin/artcraft-hanhua.mjs hanhua --dry-run
  node bin/artcraft-hanhua.mjs hanhua
  ```
  如果出现异常状态，先回到干净状态再打：
  ```powershell
  node bin/artcraft-hanhua.mjs revert
  node bin/artcraft-hanhua.mjs hanhua
  ```
  `revert` 之后备份文件会保留，下次 `hanhua` 会复用它作为"原始副本"，因此反复 revert/hanhua 始终回到同一份原始内容。
- **主程序版本边界（关键）**：主程序补丁**只对 `SUPPORTED_MAIN_VERSIONS = ['0.41.0']` 这一份实测过的构建负责**（见 [src/artcraft-patch.mjs](../src/artcraft-patch.mjs) 与 [docs/SUPPORTED-APPS.md](SUPPORTED-APPS.md) 的"主程序补丁支持的主程序版本"一节）。其它版本**工具会明确拒绝，而不是盲改**——这是刻意的，因为 phf 表的位置与条目集合会随构建变化，硬套等于写坏用户的程序。
- **更新后需要重新汉化**这一条对**所有**目标都成立，不只是主程序：Language 配置文件同样会被官方更新覆盖。
- **关于自动更新器**：实测（针对 **v0.41.0 这一个构建**）**主程序没有内置自动更新器**——在 `artcraft.exe` 里检索 `tauri-plugin-updater` / `minisign` / `latest.json` / `UpdaterExt` / `check_for_update` 均无命中。因此"更新"来自你**手动重装/运行官方安装包**，这也意味着：**汉化不会被静默覆盖，只会被你自己的一次重装覆盖**。此结论只对 v0.41.0 成立，上游未来加不加更新器**未找到公开依据**，不做预测。

### 6. 一句话总结

| 现象 | 是什么 | 怎么办 |
| --- | --- | --- |
| "Windows protected your PC" | SmartScreen 的**信誉**警告（无签名/无下载记录） | 确认来源可信 → 属性 → 解除锁定；必要时按第 4 节第 2 步提交误报 |
| Defender 报毒/隔离 | **可能的启发式误报**（被修改过的、新生成的 PE） | 按第 3 节自查；确认可信后按官方流程提交误报；**不要**无差别加白或关实时保护 |
| 更新后中文变回英文 | 官方包**覆盖**了改动 | 重新跑 `hanhua`；异常时先 `revert` 再 `hanhua` |
| 工具说"不支持该版本" | 主程序补丁只对 0.41.0 实测 | 等支持矩阵更新；**不要**硬套 |

---

## English

### 0. First, a fact that changes every other answer: this project ships no executable

Discussions about "localization tools being flagged" usually assume the author published an `.exe`. **This project does not.**

- The repository holds **Node.js tool source** and a **plain-text translation table** only. No `exe`/`dll`/`msi`/`zip`/fonts; the CI `repo-guard` job rejects such files (see [.github/workflows/ci.yml](../.github/workflows/ci.yml)).
- The `artcraft.exe` you have is **not ours** (it comes from the vendor's installer), and `artcraft-zh-full.exe` is generated **on your own machine** from your own file.
- Therefore there is no fixed "our artifact hash" to publish: **the hash of every generated `artcraft-zh-full.exe` depends on your input.** See section 3.

So: we can explain the situation and let you verify the process, but **we cannot vouch for a specific binary.**

### 1. Why does SmartScreen warn about a patched executable?

Microsoft documents how SmartScreen decides (source: [Microsoft Defender SmartScreen overview](https://learn.microsoft.com/en-us/windows/security/operating-system-security/virus-and-threat-protection/microsoft-defender-smartscreen/); page states "Last updated on 2026-04-23"; accessed 2026-10-14):

> - "Checking downloaded files against a list of files that are well known and downloaded frequently. If the file isn't on that list, Microsoft Defender SmartScreen shows a warning, advising caution."
> - "It also provides reputation checks for apps, checking downloaded programs and the digital signature used to sign a file. If a URL, a file, an app, or a certificate has an established reputation, users don't see any warnings. **If there's no reputation, the item is marked as a higher risk and presents a warning to the user.**"

In other words, SmartScreen asks **"does this file or certificate have reputation?"**, not **"does this file contain malware?"** A freshly generated, never-downloaded, unsigned executable lands in the "no reputation" bucket by default. That is reputation-based behavior, not a verdict about this project.

Two extra factors apply to a patched executable: it is **newly created locally** (no download history), and its **bytes differ from the vendor build**.

### 2. Why might Defender report it as malware rather than just warn?

We do not have access to Microsoft's detection models, so this section states only checkable facts and makes **no promise that a detection is impossible**:

- What the tool actually does to the main app: **append one new read-only data section** to the PE (measured: section count 6 → 7, new section `.asst`, characteristics `0x40000040` = `INITIALIZED_DATA | MEM_READ`) and rewrite `value.ptr` / `value.len` of three phf entries. Nothing else changes (`report.audit.changedOutside === 0`). The tool **never adds a code section, never adds a writable section, and never touches licensing or activation checks.**
- Still, a **modified, freshly generated PE** is a shape heuristic engines treat cautiously: bytes differ from the vendor build, it is unsigned (or its signature is broken), and it has just appeared on disk.
- In practice you should expect two different things: a **SmartScreen reputation warning** (essentially guaranteed — section 1) and a **possible heuristic false positive** (depends on your engine and cloud intelligence state).

**A broken signature is expected, not corruption.** The tool performs no signing. A patched executable fails signature validation whenever its bytes change — the file header of [src/artcraft-patch.mjs](../src/artcraft-patch.mjs) says the same. Whether your original is currently signed is something **you should check with the command in section 3 below**; this project's assessment material records the main app as having no Authenticode signature, but that is **not a finding measured for this document**.

### 3. How to verify all of this yourself, instead of trusting us

From the vendor down to your machine — every step is independently checkable:

1. **Confirm your original comes from the vendor installer.**
   ```powershell
   (Get-Item 'H:\ArtCraft\artcraft.exe').VersionInfo | Format-List ProductName,ProductVersion,FileVersion,OriginalFilename
   (Get-AuthenticodeSignature 'H:\ArtCraft\artcraft.exe') | Format-List Status,StatusMessage
   ```
2. **Confirm you are running this repository's source, not somebody's repackaged `.exe`.** The project has zero runtime dependencies, needs **no `npm install`**, and runs straight from the Node entry point:
   ```powershell
   git clone https://github.com/allen793/artcraft-hanhua.git
   cd artcraft-hanhua
   node bin/artcraft-hanhua.mjs detect --json
   ```
   Install Node itself from <https://nodejs.org/>. **There is no official `artcraft-hanhua.exe`.** If a site offers one, it is not ours.
3. **Confirm the scope of changes.** The patcher prints its own self-checks (`selfCheck.cspOk`, `audit.changedOutside`, PE alignment); `hanhua --dry-run` prints the plan and writes nothing; `revert` restores from backup and verifies with SHA-256. Any mismatch makes the tool **fail loudly** instead of writing.
4. **Confirm nothing leaves your machine.** The tool does not use the network and uploads no data.

> ⚠️ **On "built by GitHub Actions" trust arguments** (note that ours differs from comparable projects)
>
> Some comparable projects argue trust with "this software is built automatically by GitHub Actions". **We deliberately do not**, because:
>
> - There is nothing to build: what we publish is **readable JavaScript/text source** you run yourself, so there is no "author's machine compiled a poisoned binary" step;
> - CI ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) **only checks**: tests, syntax checks, translation-table assertions, the mixed-language gate, and the no-binaries/large-files guard. **CI produces no downloadable binary.**
>
> You can read the source (`src/` is 24 zero-dependency ESM files) and run the very same checks locally (`node --test`). That is stronger than trusting one build — but **it still cannot prove your locally generated executable will never be flagged**, because that judgement belongs to the engine and its cloud intelligence, not to us.

### 4. If you are hit by a false positive (user side)

In order of increasing impact, with the first two recommended:

1. **If you trust the file, remove the mark of the web.**
   This is a file attribute, not an antivirus verdict. Microsoft documents both the concept and the fix ([MSB3821 diagnostic code](https://learn.microsoft.com/en-us/visualstudio/msbuild/errors/msb3821?view=vs-2022); page states "Last updated on 2026-09-02"; accessed 2026-10-14):
   > "When you download web assets like HTML pages to a Windows device by using a browser, the browser inserts a marker called the _mark of the web_, which records the security zone of the site from which the page originated."
   >
   > "If you decide to trust the content in question, you can remove the _mark of the web_ by unblocking a single file from File Explorer. Open the **Properties** window on the file, and select **Unblock**. You can also unblock multiple files with a PowerShell script and the [Unblock-File](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/unblock-file) cmdlet."

   Right-click → **Properties** → check **Unblock** → OK, or run `Unblock-File <path>`.
2. **Submit the false positive to Microsoft.** The official entry point is the [Microsoft Security Intelligence submission site](https://www.microsoft.com/en-us/wdsi/filesubmission) (accessed 2026-10-14). The [SmartScreen overview](https://learn.microsoft.com/en-us/windows/security/operating-system-security/virus-and-threat-protection/microsoft-defender-smartscreen/) adds:
   > "When submitting a file for Microsoft Defender SmartScreen, make sure to select **Microsoft Defender SmartScreen** from the product menu."

   For Defender detections, the full workflow (what to submit, what happens next, how to undo a quarantine) is in [Address false positives/negatives in Microsoft Defender for Endpoint](https://learn.microsoft.com/en-us/defender-endpoint/defender-endpoint-false-positives-negatives) (page states "Last updated on 2026-09-02"; accessed 2026-10-14).
3. **Enterprise users: go through IT, do not add exclusions yourself.** Microsoft's own guidance is quoted below, deliberately with its warning intact ([Configure custom exclusions for Microsoft Defender Antivirus](https://learn.microsoft.com/en-us/defender-endpoint/microsoft-defender-antivirus-exclusions-configure); page states "Last updated on 2026-09-09"; accessed 2026-10-14):
   > "You usually don't need to define exclusions for Microsoft Defender Antivirus."
   >
   > ⚠️ "**Every exclusion lowers your level of protection.**"

   For the same reason, **this project will not teach anyone to add blanket exclusions, and does not suggest disabling real-time protection to run it.**
4. **App Control (WDAC) / AppLocker hash rules will block every new build.** Microsoft documents the tradeoff ([Understand App Control for Business policy rules and file rules](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/design/select-types-of-rules-to-create); page states "Last updated on 2026-03-29"; accessed 2026-10-14):
   > "**Hash**: Specifies individual Authenticode/PE image hash values for each discovered binary. This level is the most specific level, and requires more effort to maintain the current product versions' hash values. **Each time a binary is updated, the hash value changes, therefore requiring a policy update.**"

   Our artifact hash changes on every machine and every patch, so hash-based allowlisting means re-allowlisting each new artifact. That is an inherent cost of modifying a host binary, not a defect specific to this tool. Prefer signer rules or internal signing, or simply do not use this tool.
5. **What we do not do (stated honestly).** Signing the main app with Authenticode would improve reputation, but this project has **no signing capability**, and **no published artifact hash list** (your local input determines the output hash — section 0). **No public basis was found** for a centralized reputation path for locally generated patched artifacts.

### 5. After an upstream release, the localization "breaks" or is overwritten

**This is usually not a broken localization — the vendor package replaced your changes.**

- **Symptom**: the UI is English again, or the tool reports the main app is not supported.
- **Cause**: an ArtCraft update replaces what was rewritten — config files are overwritten back to English and the main executable is replaced with a new `artcraft.exe`. The assets were replaced; nothing failed verification.
- **Fix**: **run `hanhua` again.**
  ```powershell
  node bin/artcraft-hanhua.mjs detect
  node bin/artcraft-hanhua.mjs hanhua --dry-run
  node bin/artcraft-hanhua.mjs hanhua
  ```
  If anything looks wrong, return to a clean state first:
  ```powershell
  node bin/artcraft-hanhua.mjs revert
  node bin/artcraft-hanhua.mjs hanhua
  ```
  After `revert`, the backup is kept and `hanhua` reuses it as the "original copy", so repeated revert/hanhua cycles always return to the same original bytes.
- **Main-app version boundary (important)**: the main-app patch is only responsible for `SUPPORTED_MAIN_VERSIONS = ['0.41.0']`, the build that was actually measured (see [src/artcraft-patch.mjs](../src/artcraft-patch.mjs) and the version table in [docs/SUPPORTED-APPS.md](SUPPORTED-APPS.md)). Other versions are **refused, not blind-patched** — the phf table's location and entry set change with the build, so guessing would corrupt your installation.
- **Re-running after an update applies to every target**, not just the main app: language config files are overwritten too.
- **About auto-updaters**: measured on **this v0.41.0 build only**, the main app ships **no built-in updater** — searching `artcraft.exe` for `tauri-plugin-updater`, `minisign`, `latest.json`, `UpdaterExt` and `check_for_update` produced no hits. So updates come from a **manual reinstall / vendor installer run**, which also means your localization is not silently overwritten by an updater — only by a reinstall you perform. This holds for v0.41.0; whether upstream adds an updater later has **no public basis** and is not predicted here.

### 6. Summary

| Symptom | What it is | What to do |
| --- | --- | --- |
| "Windows protected your PC" | SmartScreen **reputation** warning (unsigned / no download history) | Confirm the source, then Properties → Unblock; submit a false positive per section 4 step 2 if needed |
| Defender flags or quarantines it | **Possible heuristic false positive** (modified, newly generated PE) | Verify per section 3; if trusted, submit per the official process; **do not** add blanket exclusions or disable real-time protection |
| Chinese reverts to English after an update | The vendor package **overwrote** your changes | Run `hanhua` again; if odd, `revert` then `hanhua` |
| The tool says the version is unsupported | The patch is measured for 0.41.0 only | Wait for the support matrix; **do not** force it |

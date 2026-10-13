# Contributing to artcraft-hanhua

> **中文摘要**：本项目是零第三方依赖的 Node.js CLI（Node >= 18，仅支持 Windows）。欢迎提交 Issue 与 PR：请遵循 Conventional Commits，PR 前跑 `node --test`，新增程序支持时务必附上实测证据，并且**不要提交任何第三方二进制或资源**。

Thanks for taking the time to contribute. This document describes how to set up the repository, where things live, what standards we follow, and how to add language support for another ArtCraft program.

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Security issues must be reported privately as described in [SECURITY.md](SECURITY.md), never in a public issue.

## Table of Contents

- [Development Environment](#development-environment)
- [Repository Layout](#repository-layout)
- [Running Tests](#running-tests)
- [Commit Conventions](#commit-conventions)
- [Pull Request Process](#pull-request-process)
- [Adding Language Support for a New App](#adding-language-support-for-a-new-app)
- [Repository Guard: No Third-Party Binaries](#repository-guard-no-third-party-binaries)
- [Documentation Rules](#documentation-rules)
- [Getting Help](#getting-help)

## Development Environment

- **Node.js >= 18.** The project uses the built-in `node --test` runner and current ESM features.
- **Zero third-party dependencies.** Do not add `dependencies` or `devDependencies`. Do not expect, require, or document an `npm install` step — `git clone` must be enough to run the tool and the tests.
- **Windows is the only supported platform** for the tool itself. CI also runs the test suite on Ubuntu to catch platform-independent regressions, so keep pure logic (parsing, matching, config rewriting) free of Windows-only assumptions.

```powershell
git clone https://github.com/allen793/artcraft-hanhua.git
cd artcraft-hanhua
node bin/artcraft-hanhua.mjs detect
```

## Repository Layout

```text
artcraft-hanhua/
├─ bin/            CLI entry point (artcraft-hanhua.mjs)
├─ src/            Implementation: detection, config rewriting, main-app patch (experimental),
│                  hash verification, backup and revert
├─ data/           Translation data (community-contributed, plain text only)
├─ test/           Tests run by `node --test`
├─ docs/           Bilingual documentation (DISCLAIMER, SUPPORTED-APPS)
├─ .github/        Issue forms, PR template, CI workflow
└─ package.json    Package metadata and scripts
```

Conventions:

- Keep `bin/` thin: argument parsing, help text, and calls into `src/`.
- Keep per-program behavior in `src/` adapters rather than in branching inside the CLI.
- Anything that writes to a user's installation must go through the same backup and hash-verification path as the existing commands. Never write without a backup.
- All source, data, and documentation files are **UTF-8 without BOM**. Config files written back into a user's installation must also be BOM-less — see the BOM note in the [README FAQ](README.md#为什么配置文件会踩-bom-的坑).

## Running Tests

The test suite uses the Node.js built-in test runner, so there is no install step:

```powershell
# run the whole suite
node --test

# run a single file
node --test test/<file>.test.mjs
```

Guidelines:

- Every behavior change needs a test. Bug fixes should come with a test that fails before the fix.
- Tests must not touch a real ArtCraft installation. Use fixtures and temporary directories, and clean up after yourself.
- Never commit a captured binary, a real config file from an installation, or a large binary blob as a fixture. Use small, hand-written, synthetic text fixtures.
- If your change touches the main-app patch path, make the dry-run path testable without an actual executable.

## Commit Conventions

This project follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```text
<type>(<optional scope>): <short description>

<optional body>

<optional footer>
```

Common types:

| Type | Use for |
| --- | --- |
| `feat` | A new capability, for example support for another program |
| `fix` | A bug fix in detection, rewriting, backup, or revert |
| `docs` | Documentation only |
| `test` | Tests only |
| `refactor` | Internal change with no behavior change |
| `chore` | Tooling, CI, repository maintenance |
| `data` | Translation data updates |

Rules:

- Write the subject in the imperative mood, lower case, no trailing period (`feat(lightcraft): write zh-hans language field`).
- Keep the subject under about 72 characters.
- Use a scope naming the affected program or area when it helps (`launcher`, `designcraft`, `patch`, `detect`, `ci`).
- Put `BREAKING CHANGE:` in the footer for anything that changes CLI behavior or output format incompatibly.
- Reference issues in the footer (`Refs #12`, `Fixes #34`).
- **Note:** the CHANGELOG is currently maintained by hand and in English/Chinese pairs. When you add a user-visible change, add an entry under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md).

## Pull Request Process

1. Open an issue first for anything larger than a small fix, so the approach can be agreed on before you write code.
2. Fork the repository and create a topic branch (`feat/effectcraft-support`, `docs/fix-typo`).
3. Make your change, add or update tests, and update documentation in the same PR.
4. Run `node --test` locally and make sure it passes.
5. Update [CHANGELOG.md](CHANGELOG.md) under `## [Unreleased]` for user-visible changes.
6. Fill in the PR template, including the checklist. Describe what was verified and how.
7. Keep the PR focused: one logical change per PR makes review and revert simple.

What reviewers look for:

- No third-party dependencies added, no `npm install` step introduced.
- Every write to an installation is reversible and hash-verified.
- Claims in documentation match what was actually measured. Do not describe unverified behavior as working.
- No third-party binaries or original ArtCraft resources in the diff.

## Adding Language Support for a New App

This is the most valuable kind of contribution. Work through these steps in order and keep the evidence — a PR without evidence will be asked for it.

1. **Confirm the program is actually localizable.**
   Look for an in-app language setting first. If it exposes Simplified Chinese, the program is *natively Chinese* and no code change is needed — record it in [docs/SUPPORTED-APPS.md](docs/SUPPORTED-APPS.md) instead.
2. **Find the language entry point.**
   Check for a config file (JSON, RON, TOML, INI, or similar) under the install directory or the user data directory, and identify the exact key that selects the language. Note the exact accepted value — programs are often strict about `zh` versus `zh-CN` versus `zh-hans`.
3. **Read the program's accepted values before forcing one.**
   If the language whitelist does not include Chinese (for example only `auto / en / uk`), or the program has no language setting at all, the program is **not localizable**. Record that verdict with the evidence and do not add a writer for it — silently writing an unsupported value only produces a broken UI.
4. **Implement an adapter in `src/`.**
   Follow the existing per-program adapters: detect the installation, describe the planned change (dry run), apply it, and revert it. Reuse the shared backup and hash-verification helpers; do not hand-roll file writes.
5. **Write the file as UTF-8 without BOM.**
   A BOM will make most of these parsers reject or ignore the config. When you rewrite JSON, preserve the original formatting style as far as is practical so diffs stay small and revert stays clean.
6. **Add tests.**
   Cover: correct file located, dry run writes nothing, apply writes the expected value, revert restores the original bytes, and a missing/unreadable target is handled without corrupting anything.
7. **Record the evidence.**
   Capture the program name, version, the exact config path, the value written, and the observed result (including any tofu boxes or partial translation). Add the row to [docs/SUPPORTED-APPS.md](docs/SUPPORTED-APPS.md) and mention the version and the date of testing.
8. **Update the support matrix in [README.md](README.md#支持矩阵)** so the table and the docs page agree.
9. **Describe the risk honestly in the PR.**
   If the program needs binary modification (as the ArtCraft main application does), it is **experimental**: back up the original, state clearly that revert is supported, and never claim it is fully verified.

## Repository Guard: No Third-Party Binaries

**Do not commit any third-party binary or original resource.** This includes, but is not limited to:

- Executables and libraries: `*.exe`, `*.dll`, `*.msi`, `*.msix`, `*.so`, `*.dylib`
- Archives and installers: `*.zip`, `*.7z`, `*.rar`, `*.cab`, `*.tar.gz`
- Fonts, images, and other assets extracted from ArtCraft or any other product
- Packed or unpacked copies of an application's resources, whole or in part

CI runs a guard job that fails the build if such files are tracked, and it also flags unexpectedly large tracked files. Translation data must be plain text, small, and hand-reviewable — if a fixture would embarrass the project in a takedown request, it does not belong in the repository.

## Documentation Rules

- Documentation is bilingual: Chinese first, English after, or English with a Chinese summary at the top, matching the file it sits next to.
- Use fenced code blocks with a language tag, and keep commands copy-pasteable as written.
- Do not promise unimplemented behavior. Mark experimental paths as **experimental** wherever they are described.
- Do not describe unverified behavior as working. State what was measured, on which version, and when.
- Chinese prose uses full-width punctuation (，。：；！？（）【】「」) and code, paths, and identifiers stay in their original form.

## Getting Help

- Usage questions and ideas: [GitHub Discussions](https://github.com/allen793/artcraft-hanhua/discussions)
- Bugs and feature requests: use the issue forms
- Security reports: privately via [SECURITY.md](SECURITY.md)

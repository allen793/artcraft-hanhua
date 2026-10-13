# Security Policy

## Why the Security Boundary Matters Here

This tool **modifies programs installed on your own machine**. That makes its write path a security surface: a bug in path resolution, backup handling, or the main-application patch could damage or replace files outside the intended target, and a compromised or malicious build could do so deliberately.

What the tool promises, and what a security report should hold it to:

- It writes only to files belonging to a detected ArtCraft installation, plus its own backup files next to them.
- It backs up every file before modifying it, and `revert` restores the backed-up bytes.
- It verifies file hashes before and after modification.
- It **does not use the network**: no downloads, no telemetry, no remote code, no uploads. It never sends your file paths, configuration, project files, or logs anywhere.
- It does not download or bundle third-party binaries, nor any ArtCraft binary or resource.

The main-application patch is **experimental** because it rewrites an executable. Treat a bug there as a high-severity issue: an incorrect patch can leave a program that no longer starts, and a faulty path or byte-offset calculation is exactly the class of bug this policy exists to catch.

## Supported Versions

| Version | Supported |
| --- | --- |
| 0.1.x | :white_check_mark: |
| < 0.1.0 | :x: |

Security fixes are released on the latest `0.1.x` line. Only Windows is supported.

Two things are explicitly **out of scope** for this project, because they are upstream behavior rather than flaws in this tool:

- Upstream font rendering defects that show Han characters as tofu boxes (DesignCraft, PdfCraft, FilmCraft).
- Programs whose in-app language whitelist or settings provide no Chinese option (CADCraft, DeckCraft, SoundCraft).

## Reporting a Vulnerability

Please report security issues **privately**. Do not open a public issue, and do not post reproduction details, file contents, or exploit steps in Discussions.

Preferred channel: **GitHub Security Advisories** for this repository.

<https://github.com/allen793/artcraft-hanhua/security/advisories/new>

If you cannot use that form, contact the maintainer privately on GitHub ([@allen793](https://github.com/allen793)) and ask for a private channel before sharing details.

A useful report includes:

- A description of the issue and the impact you believe it has.
- The tool version, Node.js version, and Windows version.
- The exact commands run and their output (with any personal paths redacted).
- A minimal reproduction, ideally against fixtures rather than a real installation.
- Whether a backup was taken and whether `revert` still works.

Please include the words "security" and the affected command (`detect`, `hanhua`, `revert`, or the main-app patch) in the summary, and state clearly whether the issue is already public anywhere.

## What to Expect

- Acknowledgement of the report, normally within a few days.
- An assessment of severity and whether it is in scope, with reasoning.
- Updates while a fix is developed, and credit in the advisory and CHANGELOG if you want it.
- Please allow time for a fix and a release before public disclosure. Coordinated disclosure is appreciated; the maintainer will not ask you to keep a serious issue private indefinitely.

Especially interesting report classes:

- Path traversal or symlink handling that lets a write or delete escape the detected installation directory.
- A scenario where `revert` silently restores the wrong bytes, or deletes a file it did not create.
- Hash verification that can be bypassed or that reports success on a modified file.
- Any code path that reads or transmits data over the network — this should be impossible, so treat a working proof as a serious finding.
- Command injection through a path, version string, or config value.

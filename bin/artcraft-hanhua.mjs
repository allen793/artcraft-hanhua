#!/usr/bin/env node
/**
 * artcraft-hanhua 命令行入口。
 *
 * 用法见 `artcraft-hanhua --help`，架构与模块职责见 docs/DEVELOPMENT.md。
 */

import { main } from '../src/cli.mjs';

process.exitCode = await main(process.argv.slice(2));

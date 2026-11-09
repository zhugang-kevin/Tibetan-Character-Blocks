#!/usr/bin/env node
/**
 * _guard_project.js — 执行层项目边界守卫（硬隔离失效时的权威控制）
 *
 * 依据 docs/gameplay-match3-redesign.md 13.3 A / 12.3：
 *  - 路径校验必须在"实际执行层"实现，不能只靠 cwd 或一句声明。
 *  - 规范化绝对路径、按真实路径检查根目录边界；
 *  - 拒绝 `..` 逃逸、根前缀碰撞、UNC、符号链接/junction/reparse-point 跳出、仓库外 gitdir/工作树；
 *  - 写入新文件时核验最近已存在的父目录。
 *
 * 用法：
 *   node scripts/_guard_project.js check <mode:read|write> <path> [--json]
 *   mode=write 时，若路径不存在，会核验其最近已存在的父目录（必须已存在且仍在项目内）。
 * 退出码：0 = 允许；非 0 = 拒绝（含原因）。
 *
 * 本脚本自身位于 scripts/，PROJECT_ROOT 取 scripts/ 的上一级，避免依赖 cwd。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..'); // scripts/ -> 项目根
const ROOT_SEP = PROJECT_ROOT + path.sep;

function fail(msg, code) {
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify({ ok: false, reason: msg }) + '\n');
  } else {
    process.stderr.write('[guard] DENIED: ' + msg + '\n');
  }
  process.exit(code || 2);
}

function allow() {
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify({ ok: true, root: PROJECT_ROOT }) + '\n');
  }
  process.exit(0);
}

function main() {
  const args = process.argv.slice(2);
  const subcmd = args[0];
  const op = args[1];
  const target = args[2];
  if (subcmd !== 'check' || (op !== 'read' && op !== 'write') || !target) {
    fail('usage: node _guard_project.js check <read|write> <path>', 64);
  }

  // 1) UNC / 空 / 相对但含越界组件
  if (typeof target !== 'string' || target.length === 0) fail('empty path', 2);
  if (target.startsWith('\\\\') || /^\\\\\?\\/.test(target)) fail('UNC path rejected: ' + target, 3);

  // 2) 规范化绝对路径（解析 . 与 ..）
  let resolved;
  try {
    resolved = path.resolve(target);
  } catch (e) {
    fail('cannot resolve: ' + e.message, 4);
  }

  // 3) 根前缀碰撞：必须是 ROOT_SEP 为前缀，杜绝 "/i/藏趣游戏-evil" 这类
  if (resolved !== PROJECT_ROOT && !resolved.startsWith(ROOT_SEP)) {
    fail('outside project root: ' + resolved, 5);
  }

  // 4) 符号链接 / junction / reparse-point 跳出：解析真实路径后再次校验
  let real;
  try {
    real = fs.realpathSync(resolved);
  } catch (e) {
    // 文件/目录不存在（写入新文件场景）时，realpath 会失败；后面单独处理
    real = null;
  }
  if (real !== null) {
    if (real !== PROJECT_ROOT && !real.startsWith(ROOT_SEP)) {
      fail('symlink/junction escapes project: ' + real, 6);
    }
  }

  // 5) 仓库外 gitdir / 工作树：路径中若含非本项目 .git 视为逃逸
  const segs = resolved.split(path.sep);
  const gitIdx = segs.indexOf('.git');
  if (gitIdx >= 0 && resolved !== path.join(PROJECT_ROOT, '.git')) {
    // 允许项目自身的 .git（用于读取工作区状态），但拒绝仓库外的 .git
    const before = segs.slice(0, gitIdx).join(path.sep);
    if (before !== PROJECT_ROOT) fail('outside-repo .git rejected: ' + resolved, 7);
  }

  // 6) 写入新文件：核验最近已存在的父目录
  if (op === 'write') {
    if (real === null) {
      // 目标不存在：向上找最近已存在的父目录
      let parent = resolved;
      let found = null;
      while (true) {
        try {
          const st = fs.statSync(parent);
          if (st.isDirectory()) { found = parent; break; }
          parent = path.dirname(parent);
        } catch (e) {
          const up = path.dirname(parent);
          if (up === parent) break; // 到达文件系统根仍无已存在父目录
          parent = up;
        }
      }
      if (!found) fail('no existing parent directory for write: ' + resolved, 8);
      if (found !== PROJECT_ROOT && !found.startsWith(ROOT_SEP)) {
        fail('nearest existing parent outside project: ' + found, 9);
      }
    }
  }

  allow();
}

main();

---
name: self-upgrade
description: 自我升级开发能力 - 允许 AI 自主修改自身代码并重启服务生效
version: 1.0.0
author: chubao-ai
tags: [self-improvement, development, automation]
---

# Self-Upgrade Skill

## 概述

本 Skill 定义了 AI 自主升级开发的完整流程，包括代码修改、验证、重启等步骤。

## 使用场景

1. **修复 Bug**: AI 发现自身代码问题并修复
2. **添加功能**: 根据用户需求添加新工具或能力
3. **优化性能**: 重构代码提升性能
4. **自我迭代**: 基于使用经验持续改进

## 工作流程

### 基础流程

```
1. 分析需求
   ↓
2. 读取相关代码 (read_file)
   ↓
3. 规划修改方案
   ↓
4. 执行代码修改 (edit_file / write_file)
   ↓
5. 验证代码正确性 (validate_code)
   ↓
6. 重启服务生效 (restart_sidecar)
   ↓
7. 验证功能正常
```

### 长久运行安全流程（推荐）

```
1. 健康检查 (health_check)
   ↓
2. Git 备份 (git_backup) - 创建修改前备份
   ↓
3. 读取相关代码 (read_file)
   ↓
4. 规划修改方案
   ↓
5. 执行代码修改 (edit_file / write_file)
   ↓
6. 验证代码正确性 (validate_code)
   ↓
7. 记录升级日志 (log_self_upgrade)
   ↓
8. 重启服务生效 (restart_sidecar)
   ↓
9. 健康检查验证 (health_check)
   ↓
10. 记录成功日志 (log_self_upgrade)
```

### 失败回滚流程

```
升级失败或服务异常时：
1. 记录失败日志 (log_self_upgrade)
   ↓
2. Git 回滚 (git_rollback) - 恢复到之前版本
   ↓
3. 重启服务 (restart_sidecar)
   ↓
4. 健康检查确认恢复 (health_check)
```

## 工具使用指南

### 1. 代码修改前

- 使用 `read_file` 读取要修改的文件
- 使用 `search_files` 查找相关代码位置
- 理解代码结构和依赖关系

### 2. 代码修改

- 使用 `edit_file` 进行精确的搜索替换
- 或使用 `write_file` 创建新文件
- 确保修改符合 TypeScript 语法

### 3. 代码验证

- 使用 `validate_code` 检查 TypeScript 编译
- 修复所有编译错误
- 确保没有引入新的问题

### 4. 服务重启

- 使用 `restart_sidecar` 重启服务
- 设置适当的延迟时间（默认 2 秒）
- 记录重启原因

### 5. 功能验证

- 重启后验证修改是否生效
- 测试相关功能是否正常
- 如有问题可查看日志

## 安全约束

1. **路径限制**: 只能修改工作目录内的文件
2. **禁止操作**: 不能删除 node_modules、.git 等关键目录
3. **命令限制**: run_command 有黑名单保护
4. **重启保护**: restart_sidecar 只能执行安全的重启操作

## 示例

### 示例 1: 添加新工具

```
用户: 帮我添加一个计算字符串 MD5 的工具

AI 执行:
1. read_file: sidecars/node-backend/src/tools/devTools.ts
2. 在文件末尾添加 md5Tool 实现
3. edit_file: 将 md5Tool 添加到 devTools 数组
4. validate_code: 检查 TypeScript 编译
5. restart_sidecar: 重启服务生效
```

### 示例 2: 修复 Bug

```
用户: 修复 screenshot 工具返回路径错误的问题

AI 执行:
1. search_files: 查找 screenshot 相关代码
2. read_file: 读取 tools/index.ts 中的 screenshotTool
3. 分析问题原因
4. edit_file: 修复路径处理逻辑
5. validate_code: 验证修改
6. restart_sidecar: 重启生效
```

## 注意事项

1. **备份重要**: 修改前考虑使用 Git 提交当前代码
2. **小步快跑**: 每次修改尽量小，便于回滚
3. **验证充分**: 重启前确保代码能通过编译
4. **记录日志**: 记录所有修改便于追溯

## 相关工具

### 文件操作工具
- `read_file`: 读取文件内容
- `write_file`: 写入文件
- `edit_file`: 编辑文件（搜索替换）
- `list_dir`: 列出目录
- `search_files`: 搜索文件内容

### 代码验证与重启
- `validate_code`: 验证 TypeScript 代码正确性
- `restart_sidecar`: 重启服务使修改生效

### 版本控制（长久运行必需）
- `git_backup`: 创建 Git 备份，保存修改前状态
- `git_rollback`: 回滚到之前的版本，用于失败恢复

### 健康监控
- `health_check`: 检查服务健康状态
- `log_self_upgrade`: 记录自我升级操作日志
- `get_self_upgrade_history`: 获取升级历史记录

### 外部开发工具
- `opencode_run`: 调用 OpenCode CLI 执行开发任务
- `ohmyopencode_delegate`: 委派给专业 Agent
- `multi_agent_start`: 启动多 Agent 并行开发

## 长久运行最佳实践

### 1. 定期健康检查

建议每 30 分钟执行一次健康检查：

```
health_check({ service: 'all' })
```

### 2. 所有修改必须备份

每次自我升级前必须创建 Git 备份：

```
git_backup({ 
  message: 'Before adding new feature X',
  branch: 'feature-x'
})
```

### 3. 记录完整日志

所有自我升级操作都应该记录：

```
log_self_upgrade({
  type: 'modify',
  description: 'Added health_check tool',
  success: true
})
```

### 4. 监控资源使用

长久运行时需要关注：
- 内存使用（Node.js 堆内存）
- 磁盘空间（日志文件增长）
- 日志文件大小

### 5. 自动恢复策略

当检测到服务不健康时：
1. 尝试自动重启
2. 如果重启失败，尝试回滚到上一个稳定版本
3. 记录故障日志
4. 通知用户（如有必要）

## 版本历史

- v1.1.0 (2026-02-15): 添加长久运行支持（Git 备份、健康检查、日志记录）
- v1.0.0 (2026-02-15): 初始版本，定义自我升级流程

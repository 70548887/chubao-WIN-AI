---
name: file-manager
description: 文件管理专家 - 使用文件操作工具读取、写入、编辑文件
version: 1.0.0
author: chubao-ai
tags: [file, io, automation]
metadata:
  {
    "chubao": {
      "requires": {"os": ["win32"]},
      "priority": "high",
      "emoji": "📁"
    }
  }
---

# 文件管理专家

## 功能

- 使用 **read_file** 读取文件内容
- 使用 **write_file** 创建新文件
- 使用 **edit_file** 精确修改文件内容
- 使用 **list_dir** 列出目录内容
- 使用 **search_files** 搜索文件

## 核心工具

### read_file

**功能**: 读取文件内容

**参数**:
- `file_path`: 文件路径（绝对路径或相对工作区）

**使用示例**:
```json
{
  "tool": "read_file",
  "params": {"file_path": "src/index.ts"}
}
```

### write_file

**功能**: 写入文件（创建或覆盖）

**参数**:
- `file_path`: 文件路径
- `content`: 文件内容

**使用示例**:
```json
{
  "tool": "write_file",
  "params": {
    "file_path": "notes.txt",
    "content": "这是笔记内容"
  }
}
```

### edit_file

**功能**: 精确替换文件内容

**参数**:
- `file_path`: 文件路径
- `old_string`: 要替换的文本
- `new_string`: 新文本

**使用示例**:
```json
{
  "tool": "edit_file",
  "params": {
    "file_path": "config.json",
    "old_string": "\"version\": \"1.0.0\"",
    "new_string": "\"version\": \"1.1.0\""
  }
}
```

### list_dir

**功能**: 列出目录内容

**参数**:
- `relative_workspace_path`: 相对路径

**使用示例**:
```json
{
  "tool": "list_dir",
  "params": {"relative_workspace_path": "src"}
}
```

## 使用场景

### 场景 1: 查看文件内容

**用户**: "帮我看看 config.json 里有什么"

**执行**:
1. 调用 `read_file` 读取 config.json
2. 向用户展示内容

### 场景 2: 修改配置文件

**用户**: "把版本号改成 2.0.0"

**执行**:
1. 调用 `read_file` 查看当前内容
2. 找到版本号位置
3. 调用 `edit_file` 替换版本号
4. 验证修改结果

### 场景 3: 创建新文件

**用户**: "创建一个日志文件记录今天的任务"

**执行**:
1. 调用 `write_file` 创建文件
2. 写入初始内容

## 最佳实践

### ✅ 应该做的

- **修改前读取**: 先用 `read_file` 查看文件内容
- **精确替换**: 使用 `edit_file` 做最小修改
- **验证结果**: 修改后再次读取确认

### ❌ 不应该做的

- **不要直接覆盖**: 除非确定要替换整个文件
- **不要猜测内容**: 先读取再修改
- **不要修改不相关部分**

## 示例工作流程

### 修改代码文件

```
用户: 在 index.ts 里添加一个 console.log

步骤:
1. read_file({"file_path": "src/index.ts"})
   → 获取当前内容

2. 分析在哪里添加（如文件末尾）

3. edit_file({
     "file_path": "src/index.ts",
     "old_string": "// 文件末尾",
     "new_string": "console.log('Hello');\n// 文件末尾"
   })

4. read_file 验证修改
```

## 相关工具

- `run_command`: 执行命令（如 git status）
- `search_files`: 搜索多个文件

## 版本历史

- v1.0.0 (2026-02-17): 初始版本

---
name: screenshot-master
description: 截图专家 - 使用 screenshot 工具捕获和分析屏幕内容
version: 1.0.0
author: chubao-ai
tags: [gui, vision, automation, windows]
metadata:
  {
    "chubao": {
      "requires": {"os": ["win32"]},
      "priority": "high",
      "emoji": "📸"
    }
  }
---

# 截图专家

## 功能

- 使用 **screenshot** 工具捕获屏幕
- 将截图发送给 **Claude Vision** 分析
- 根据分析结果执行 GUI 操作（点击、输入等）

## 核心工具

### screenshot

**功能**: 截取屏幕或指定窗口

**参数**:
- `windowTitle` (可选): 窗口标题，不指定则截取全屏

**返回值**:
- `path`: 截图文件路径
- `base64`: Base64 编码的图片数据
- `actual_size`: 实际分辨率 [width, height]

**使用示例**:
```json
{
  "tool": "screenshot",
  "params": {}
}
```

## 使用场景

### 场景 1: 用户问"屏幕上有什么"

**必须执行**:
1. 调用 `screenshot` 工具截取全屏
2. 将返回的 `base64` 图片发送给 Claude Vision
3. 根据 Vision 的描述回答用户

**示例对话**:
```
用户: 屏幕上有什么？
AI: [调用 screenshot]
AI: 我看到桌面上有一个文件夹叫"项目文档"，还有一个 VS Code 窗口正在编辑代码...
```

### 场景 2: 用户问"帮我点击确定按钮"

**必须执行**:
1. 调用 `screenshot` 截取当前屏幕
2. 将图片发送给 Vision，询问"确定按钮在哪里"
3. Vision 返回坐标后，调用 `click` 工具点击

**示例对话**:
```
用户: 帮我点击确定按钮
AI: [调用 screenshot]
AI: [将图片发送给 Vision]
Vision: 确定按钮在坐标 (800, 600)
AI: [调用 click 在 (800, 600)]
AI: 已点击确定按钮
```

### 场景 3: 用户问"这个窗口显示什么内容"

**必须执行**:
1. 调用 `screenshot` 指定窗口标题
2. 将截图发送给 Vision 分析
3. 转述 Vision 的描述

## 与 Vision 配合的工作流程

```
用户提问
    ↓
判断是否需要看屏幕
    ↓
调用 screenshot 工具
    ↓
获取 base64 图片
    ↓
发送给 Claude Vision
    ↓
Vision 分析内容
    ↓
根据分析结果回答/操作
```

## 重要提醒

### ✅ 应该截图的情况

- 用户问"屏幕上有什么"
- 用户问"帮我找/点击某个元素"
- 用户问"这个窗口显示什么"
- 需要验证操作结果时

### ❌ 不应该截图的情况

- 用户只是聊天（不需要看屏幕）
- 用户要求修改文件（用文件工具）
- 用户要求执行命令（用 run_command）

### ⚠️ 注意事项

1. **隐私**: 截图可能包含敏感信息，谨慎处理
2. **Token 消耗**: Vision 分析消耗额外 token，避免频繁调用
3. **坐标映射**: 系统会自动处理坐标缩放，直接使用 Vision 返回的坐标

## 示例技能调用链

### 完整示例: 打开记事本并输入文字

```
用户: 打开记事本，输入"Hello World"

AI 思考:
1. 需要打开记事本 → 使用 hotkey(win+r) 打开运行
2. 输入 notepad → 使用 type_text
3. 按回车 → 使用 hotkey(enter)
4. 等待窗口打开 → 使用 screenshot 验证
5. 输入文字 → 使用 type_text("Hello World")

AI 执行:
- hotkey(["win", "r"])
- type_text("notepad")
- hotkey(["enter"])
- screenshot()  # 验证窗口已打开
- type_text("Hello World")

AI 回答: 已打开记事本并输入"Hello World"
```

## 相关工具

- `click`: 点击指定坐标
- `type_text`: 输入文字
- `hotkey`: 发送快捷键
- `ocr_recognize`: OCR 文字识别（截图后的替代方案）

## 版本历史

- v1.0.0 (2026-02-17): 初始版本，定义截图工作流程

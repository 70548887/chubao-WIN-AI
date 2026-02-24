---
name: windows-automation
description: Windows 自动化专家 - 控制鼠标键盘，自动化 GUI 操作
version: 1.0.0
author: chubao-ai
tags: [gui, automation, windows, pywinauto]
metadata:
  {
    "chubao": {
      "requires": {"os": ["win32"]},
      "priority": "high",
      "emoji": "🖱️"
    }
  }
---

# Windows 自动化专家

## 功能

- 使用 **click** 点击屏幕任意位置
- 使用 **type_text** 输入文字
- 使用 **hotkey** 发送快捷键
- 使用 **scroll** 滚动页面
- 配合 **screenshot** 和 **ocr** 实现智能自动化

## 核心工具

### click

**功能**: 鼠标点击指定位置

**参数**:
- `x`: X 坐标
- `y`: Y 坐标
- `button`: 按钮类型（left/right/middle，默认 left）

**使用示例**:
```json
{
  "tool": "click",
  "params": {"x": 800, "y": 600}
}
```

### type_text

**功能**: 键盘输入文字

**参数**:
- `text`: 要输入的文字
- `interval`: 输入间隔（可选）

**使用示例**:
```json
{
  "tool": "type_text",
  "params": {"text": "Hello World"}
}
```

### hotkey

**功能**: 发送快捷键组合

**参数**:
- `keys`: 按键数组，如 `["ctrl", "s"]`

**常用快捷键**:
- `["win", "r"]` - 打开运行对话框
- `["ctrl", "s"]` - 保存
- `["ctrl", "c"]` - 复制
- `["ctrl", "v"]` - 粘贴
- `["alt", "f4"]` - 关闭窗口
- `["enter"]` - 回车

**使用示例**:
```json
{
  "tool": "hotkey",
  "params": {"keys": ["ctrl", "s"]}
}
```

### scroll

**功能**: 鼠标滚动

**参数**:
- `amount`: 滚动量（正数向上，负数向下）
- `x`: 滚动位置 X（可选）
- `y`: 滚动位置 Y（可选）

**使用示例**:
```json
{
  "tool": "scroll",
  "params": {"amount": -3}
}
```

## 使用场景

### 场景 1: 打开应用

**用户**: "打开记事本"

**执行**:
1. `hotkey(["win", "r"])` - 打开运行
2. `type_text("notepad")` - 输入 notepad
3. `hotkey(["enter"])` - 回车打开

### 场景 2: 保存文件

**用户**: "保存当前文档"

**执行**:
1. `hotkey(["ctrl", "s"])` - 发送保存快捷键

### 场景 3: 点击特定元素

**用户**: "点击确定按钮"

**执行**:
1. `screenshot()` - 截图
2. Vision 分析确定按钮位置
3. `click({"x": 800, "y": 600})` - 点击

### 场景 4: 填写表单

**用户**: "在搜索框输入 AI 助手"

**执行**:
1. `click({"x": 搜索框X, "y": 搜索框Y})` - 点击搜索框
2. `type_text("AI 助手")` - 输入文字
3. `hotkey(["enter"])` - 回车搜索

## 最佳实践

### ✅ 应该做的

- **先截图定位**: 不确定位置时先用 screenshot + Vision
- **使用快捷键**: 优先使用 hotkey 而不是鼠标点击
- **添加延迟**: 操作之间适当等待（系统会自动处理）

### ❌ 不应该做的

- **不要盲点点**: 不知道坐标时不要随意 click
- **不要输入敏感信息**: 密码等敏感信息让用户自己输入

## 完整示例: 自动化记事本

```
用户: 打开记事本，输入"Hello"，然后保存为 test.txt

步骤:
1. hotkey(["win", "r"])
2. type_text("notepad")
3. hotkey(["enter"])
   （等待窗口打开）
4. type_text("Hello")
5. hotkey(["ctrl", "s"])
   （保存对话框打开）
6. type_text("test.txt")
7. hotkey(["enter"])
```

## 坐标系说明

- 屏幕左上角为 (0, 0)
- 右下角为 (屏幕宽度, 屏幕高度)
- 常用分辨率: 1920x1080, 2560x1440
- 系统会自动处理坐标缩放

## 相关技能

- **screenshot-master**: 截图分析
- **ocr-expert**: 文字识别定位

## 版本历史

- v1.0.0 (2026-02-17): 初始版本

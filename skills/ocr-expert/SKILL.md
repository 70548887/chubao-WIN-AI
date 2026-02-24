---
name: ocr-expert
description: OCR 专家 - 识别屏幕文字，实现基于文字的 GUI 自动化
version: 1.0.0
author: chubao-ai
tags: [ocr, vision, text, automation]
metadata:
  {
    "chubao": {
      "requires": {"os": ["win32"]},
      "priority": "normal",
      "emoji": "🔍"
    }
  }
---

# OCR 专家

## 功能

- 使用 **ocr_recognize** 识别屏幕上的所有文字
- 使用 **ocr_find_text** 查找特定文字位置
- 配合 **click** 实现"点击文字"功能
- 无需 Vision API 即可定位界面元素

## 核心工具

### ocr_recognize

**功能**: 识别屏幕上的所有文字

**参数**:
- `windowTitle` (可选): 指定窗口标题

**返回值**:
- 识别到的文字列表，包含文字内容和位置坐标

**使用示例**:
```json
{
  "tool": "ocr_recognize",
  "params": {}
}
```

### ocr_find_text

**功能**: 查找特定文字在屏幕上的位置

**参数**:
- `text`: 要查找的文字
- `windowTitle` (可选): 指定窗口

**返回值**:
- 文字的坐标位置 [x, y]

**使用示例**:
```json
{
  "tool": "ocr_find_text",
  "params": {"text": "确定"}
}
```

## 使用场景

### 场景 1: 查找并点击按钮

**用户**: "点击确定按钮"

**执行**:
1. `ocr_find_text({"text": "确定"})` - 查找"确定"位置
2. `click({"x": 结果.x, "y": 结果.y})` - 点击

### 场景 2: 识别屏幕文字

**用户**: "这个窗口显示什么文字"

**执行**:
1. `ocr_recognize()` - 识别所有文字
2. 整理并向用户展示

### 场景 3: 填写表单

**用户**: "在用户名框输入 admin"

**执行**:
1. `ocr_find_text({"text": "用户名"})` - 找到标签位置
2. `click()` - 点击输入框（通常在标签旁边）
3. `type_text("admin")` - 输入

## OCR vs Vision 对比

| 特性 | OCR | Vision |
|------|-----|--------|
| 速度 | 快（本地） | 慢（API 调用） |
| 成本 | 免费 | 消耗 token |
| 准确度 | 高（清晰文字） | 高（理解图像） |
| 适用场景 | 已知文字内容 | 未知界面布局 |

## 最佳实践

### ✅ 应该做的

- **优先 OCR**: 知道要找什么文字时先用 OCR
- **模糊匹配**: 文字可能有空格，尝试部分匹配
- **结合使用**: OCR 找到位置 + Vision 确认内容

### ❌ 不应该做的

- **不要识别图片**: OCR 只能识别文字，不能识别图像内容
- **不要期望 100%**: 艺术字、模糊文字可能识别失败

## 完整示例: 自动化登录

```
用户: 帮我登录系统，用户名 admin，密码我自己输

步骤:
1. ocr_find_text({"text": "用户名"})
   → 返回坐标 (400, 300)
2. click({"x": 400, "y": 330})  # 点击输入框（标签下方）
3. type_text("admin")
4. ocr_find_text({"text": "密码"})
   → 返回坐标 (400, 380)
5. click({"x": 400, "y": 410})
6. （提示用户输入密码）
7. ocr_find_text({"text": "登录"})
   → 返回坐标 (600, 500)
8. click({"x": 600, "y": 500})
```

## 相关技能

- **screenshot-master**: 截图 + Vision 分析
- **windows-automation**: 点击、输入操作

## 版本历史

- v1.0.0 (2026-02-17): 初始版本

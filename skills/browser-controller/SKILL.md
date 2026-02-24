---
name: browser-controller
description: 浏览器控制专家 - 自动化浏览器操作，网页数据采集
version: 1.0.0
author: chubao-ai
tags: [browser, web, automation, playwright]
metadata:
  {
    "chubao": {
      "requires": {"os": ["win32"]},
      "priority": "normal",
      "emoji": "🌐"
    }
  }
---

# 浏览器控制专家

## 功能

- 使用 **browser_navigate** 访问网页
- 使用 **browser_click** 点击页面元素
- 使用 **browser_type** 输入文字
- 使用 **browser_screenshot** 截取网页
- 使用 **browser_evaluate** 执行 JavaScript
- 使用 **browser_get_text** 提取页面文字

## 核心工具

### browser_navigate

**功能**: 导航到指定 URL

**参数**:
- `url`: 目标网址

**使用示例**:
```json
{
  "tool": "browser_navigate",
  "params": {"url": "https://www.example.com"}
}
```

### browser_click

**功能**: 点击页面元素

**参数**:
- `selector`: CSS 选择器，如 `"#submit-btn"`

**使用示例**:
```json
{
  "tool": "browser_click",
  "params": {"selector": "button[type='submit']"}
}
```

### browser_type

**功能**: 在输入框中输入文字

**参数**:
- `selector`: 输入框选择器
- `text`: 要输入的文字

**使用示例**:
```json
{
  "tool": "browser_type",
  "params": {
    "selector": "input[name='search']",
    "text": "AI 助手"
  }
}
```

### browser_screenshot

**功能**: 截取网页截图

**参数**:
- `fullPage` (可选): 是否截取完整页面，默认 false

**使用示例**:
```json
{
  "tool": "browser_screenshot",
  "params": {"fullPage": true}
}
```

### browser_get_text

**功能**: 提取页面文字内容

**参数**:
- `selector` (可选): 指定元素选择器，不指定则提取整个页面

**使用示例**:
```json
{
  "tool": "browser_get_text",
  "params": {"selector": "article"}
}
```

### browser_evaluate

**功能**: 在页面中执行 JavaScript

**参数**:
- `script`: JavaScript 代码

**使用示例**:
```json
{
  "tool": "browser_evaluate",
  "params": {"script": "document.title"}
}
```

## 使用场景

### 场景 1: 搜索信息

**用户**: "在 Google 搜索'AI 助手'"

**执行**:
1. `browser_navigate({"url": "https://google.com"})`
2. `browser_type({"selector": "textarea[name='q']", "text": "AI 助手"})`
3. `browser_click({"selector": "input[name='btnK']"})`
4. `browser_get_text({"selector": "#search"})` - 提取搜索结果

### 场景 2: 数据采集

**用户**: "提取这个网页的文章内容"

**执行**:
1. `browser_get_text({"selector": "article"})` 或
2. `browser_get_text({"selector": ".content"})`

### 场景 3: 表单填写

**用户**: "帮我填写注册表单"

**执行**:
1. `browser_navigate({"url": "https://example.com/register"})`
2. `browser_type({"selector": "#username", "text": "user123"})`
3. `browser_type({"selector": "#email", "text": "user@example.com"})`
4. `browser_click({"selector": "#submit"})`

## CSS 选择器指南

### 常用选择器

| 目标 | 选择器 |
|------|--------|
| ID | `#username` |
| Class | `.btn-primary` |
| 标签 | `button` |
| 属性 | `[type='submit']` |
| 组合 | `form#login input[name='pwd']` |

### 查找选择器的方法

1. **浏览器开发者工具**: F12 → 右键元素 → Copy → Copy selector
2. **简化选择器**: 优先使用 ID 或特定 class

## 完整示例: 自动化搜索

```
用户: 搜索"天气预报"并告诉我结果

步骤:
1. browser_navigate({"url": "https://www.bing.com"})
2. browser_type({
     "selector": "#sb_form_q",
     "text": "天气预报"
   })
3. browser_click({"selector": "#sb_form_go"})
   （等待页面加载）
4. browser_get_text({"selector": "#b_results"})
   → 返回搜索结果文本
5. 整理并向用户汇报
```

## 注意事项

### ✅ 应该做的

- **等待加载**: 操作后适当等待页面响应
- **使用稳定选择器**: 优先使用 ID 或特定 class
- **处理弹窗**: 注意可能出现的 cookie 同意弹窗

### ❌ 不应该做的

- **不要滥用**: 尊重网站的 robots.txt 和使用条款
- **不要频繁请求**: 避免对同一网站过于频繁的访问
- **不要处理敏感操作**: 银行、支付等敏感操作让用户自己完成

## 相关技能

- **screenshot-master**: 网页截图分析
- **data-extractor**: 数据提取和处理

## 版本历史

- v1.0.0 (2026-02-17): 初始版本

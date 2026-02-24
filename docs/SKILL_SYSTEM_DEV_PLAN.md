# 触宝AI 技能系统开发计划

> 目标：参考 OpenClaw 实现完善的技能加载机制，让 AI 能主动调用本地工具
> 创建时间：2026-02-17
> 状态：规划中

---

## 现状分析

### 当前问题
- ❌ 只有 2 个示例技能，没有实用技能
- ❌ Agent 不知道有哪些工具可用
- ❌ 没有技能加载机制
- ❌ 中转 API 限制导致 AI 无法讨论能力边界

### 解决思路
通过**技能系统**明确告诉 AI 它能做什么，绕过中转 API 的限制。

---

## 开发阶段

### Phase 1: 技能加载器核心 (Day 1)

#### T1.1: 创建 SkillLoader 模块
**文件**: `sidecars/node-backend/src/skills/loader.ts`

**功能**:
- 扫描 `skills/` 目录
- 解析 `SKILL.md` frontmatter
- 条件过滤 (OS, bins, env)
- 返回可用技能列表

**验收标准**:
```typescript
const loader = new SkillLoader();
const skills = loader.loadSkills();
// skills.length > 0
// skills[0].name, skills[0].description, skills[0].instructions
```

#### T1.2: 修改 Agent 系统提示
**文件**: `sidecars/node-backend/src/agent/runtime.ts`

**修改**:
- 在 `buildSystemPrompt` 中注入技能列表
- 让 AI 明确知道自己能调用哪些工具

**验收标准**:
- 系统提示包含可用技能列表
- AI 能回答"你能截图吗？" → "能！我有 screenshot 工具"

---

### Phase 2: 核心技能创建 (Day 1-2)

#### T2.1: 截图专家技能
**文件**: `skills/screenshot-master/SKILL.md`

**内容**:
- 说明 screenshot 工具的使用方法
- 何时使用：用户问"屏幕上有什么"
- 如何分析：截图后发送给 Vision

#### T2.2: 文件管理技能
**文件**: `skills/file-manager/SKILL.md`

**内容**:
- read_file, write_file, edit_file 的使用
- 文件操作最佳实践

#### T2.3: Windows 自动化技能
**文件**: `skills/windows-automation/SKILL.md`

**内容**:
- click, type_text, hotkey 的使用
- GUI 自动化场景

#### T2.4: OCR 专家技能
**文件**: `skills/ocr-expert/SKILL.md`

**内容**:
- ocr_recognize, ocr_find_text 的使用
- 文字识别场景

#### T2.5: 浏览器控制技能
**文件**: `skills/browser-controller/SKILL.md`

**内容**:
- browser_navigate, browser_click 等
- 浏览器自动化场景

---

### Phase 3: 技能注册表 (Day 2)

#### T3.1: 创建 SkillRegistry
**文件**: `sidecars/node-backend/src/skills/registry.ts`

**功能**:
- 管理已加载的技能
- 优先级处理：workspace > managed > bundled
- 技能查询接口

#### T3.2: 技能热重载
**功能**:
- 监听 `skills/` 目录变化
- 自动重新加载技能

---

### Phase 4: 技能市场 (Day 3)

#### T4.1: 技能安装命令
**命令**: `chubao skill install <skill-name>`

**功能**:
- 从远程仓库下载技能
- 安装到 `skills/installed/`

#### T4.2: 技能更新命令
**命令**: `chubao skill update --all`

**功能**:
- 更新所有已安装技能

#### T4.3: 技能列表命令
**命令**: `chubao skill list`

**功能**:
- 显示所有可用技能
- 显示已安装技能状态

---

## 技术设计

### 技能格式 (AgentSkills 兼容)

```markdown
---
name: screenshot-master
description: 截图专家 - 教 Agent 使用截图工具分析屏幕
version: 1.0.0
author: chubao-ai
tags: [gui, vision, automation]
metadata:
  {"chubao": {"requires": {"os": ["win32"]}, "priority": "high"}}
---

# 截图专家

## 功能
- 使用 screenshot 工具捕获屏幕
- 将截图发送给 Vision 模型分析
- 根据分析结果执行操作

## 使用场景

### 场景 1: 用户问"屏幕上有什么"
1. 调用 screenshot 工具截图
2. 将 base64 图片发送给 Claude Vision
3. 根据 Vision 描述回答用户

### 场景 2: 用户问"帮我点击确定按钮"
1. 调用 screenshot 截图
2. Vision 分析确定按钮位置
3. 调用 click 工具点击对应坐标

## 工具调用示例

```json
{
  "tool": "screenshot",
  "params": {}
}
```

## 注意事项
- 截图包含用户隐私信息，谨慎处理
- Vision 分析需要额外 token，避免频繁调用
```

### 技能加载流程

```
启动时:
  ↓
扫描 skills/ 目录
  ↓
解析每个 SKILL.md
  ↓
检查条件 (os, bins, env)
  ↓
过滤不可用技能
  ↓
按优先级排序
  ↓
注入到 Agent 系统提示
  ↓
AI 知道有哪些工具可用
```

---

## 验收标准

### 功能验收

| 测试项 | 预期结果 |
|--------|----------|
| 启动时加载技能 | 成功加载 5+ 个技能 |
| 系统提示包含技能 | AI 知道自己能截图 |
| 用户问"能截图吗" | AI 回答"能"并调用工具 |
| 技能热重载 | 修改 SKILL.md 后自动生效 |
| 安装新技能 | `chubao skill install` 成功 |

### 性能验收

- 技能加载时间 < 100ms
- 内存占用增加 < 10MB

---

## 依赖关系

```
Phase 1 (加载器)
    ↓
Phase 2 (核心技能)
    ↓
Phase 3 (注册表)
    ↓
Phase 4 (技能市场)
```

---

## 风险与应对

| 风险 | 应对 |
|------|------|
| 中转 API 仍限制工具调用 | 通过系统提示明确告知 AI 工具存在 |
| 技能过多导致 token 超标 | 只加载符合条件的技能，压缩格式 |
| 技能冲突 | 优先级机制：workspace > managed > bundled |

---

## 下一步行动

1. ✅ 创建开发计划文档 (当前)
2. ⏳ 开始 Phase 1: 实现 SkillLoader
3. ⏳ 创建 5 个核心技能
4. ⏳ 测试 AI 是否能主动调用工具

---

*文档版本: v1.0 | 最后更新: 2026-02-17*

# 功能接入计划 — Sprint 3

> 更新时间：2026-02-13  
> 状态：📋 待评审  
> 参考文档：[REFERENCE_PROJECTS.md](./REFERENCE_PROJECTS.md)

---

## 目录

1. [当前能力基线](#1-当前能力基线)
2. [能力差距分析](#2-能力差距分析)
3. [接入计划](#3-接入计划)
4. [详细设计](#4-详细设计)
5. [验收标准](#5-验收标准)
6. [新增：OpenCode & Oh-My-OpenCode Skills 集成方案](#6-新增opencode--oh-my-opencode-skills-集成方案)

---

## 1. 当前能力基线

### 1.1 已实现的控制能力

| 能力 | 实现位置 | 完成度 |
|------|----------|--------|
| 窗口列表获取 | `gui_control.py` → `list_windows` | ✅ |
| 控件信息获取 | `gui_control.py` → `get_controls` | ✅ |
| 左键点击 (坐标/控件) | `gui_control.py` → `click` | ✅ |
| 文字输入 | `gui_control.py` → `type_text` | ✅ |
| 菜单选择 | `gui_control.py` → `menu_select` | ✅ |
| 截图 (全屏/窗口/区域) | `gui_control.py` → `screenshot` | ✅ |
| OCR 文字识别 | `ocr_service.py` → `recognize` | ✅ |
| OCR 找字点击 | `ocr_service.py` + `gui_control.py` | ✅ |
| 滚动 | `gui_control.py` → `scroll` | ✅ |
| 快捷键 | `gui_control.py` → `hotkey` (Python 侧已实现) | ⚠️ API 未暴露 |
| Agent 工具调用 | `agent/runtime.ts` → `chat` | ⚠️ 仅单轮 |

### 1.2 已完成的迭代

| Sprint | 内容 | 状态 |
|--------|------|------|
| Sprint 0 | 项目初始化、目录结构、三端基础代码 | ✅ |
| Sprint 1 | Sidecar 生命周期、健康检查、服务控制台、smoke 脚本 | ✅ |
| Sprint 2 | i18n 语言包系统（中/英）、乱码修复 | ✅ |
| Sprint 3 | 参考项目分析、多 Agent 并发方案、OpenCode & Oh-My-OpenCode 集成研究 | ✅ |

---

## 2. 能力差距分析

### 2.1 关键缺失

| # | 缺失能力 | 影响 | 参考方案来源 |
|---|----------|------|-------------|
| G1 | 快捷键 API 未暴露 | `hotkeyTool` 返回 `not_implemented` | 内部修复 |
| G2 | Agent 仅单轮工具调用 | 无法多步推理，截图后不能继续操作 | `agents/agent.py` |
| G3 | 无截图→Vision 闭环 | 不能让 Claude 看见屏幕 | `computer-use-demo` |
| G4 | 无浏览器自动化 | `config/skills.json` 定义了 browser skill 但零实现 | `browser-use-demo` |
| G5 | 无安全沙箱 | Agent 可调用任何工具，无过滤 | `autonomous-coding/security.py` |
| G6 | 缺高级 GUI 操作 | 无右键、双击、拖拽、悬停 | `browser-use-demo` 动作列表 |
| G7 | 前端巨型组件 | `App.tsx` 83.7KB 难以维护 | `vibecraft/EventBus` |
| G8 | 缺乏专业编程工具集成 | 无 OpenCode/Oh-My-OpenCode 集成 | `opencode-dev`, `oh-my-opencode-dev` |

### 2.2 完整度评估

```
当前整体完整度: ━━━━━━━░░░░  ~55%
Sprint 3 完成后: ━━━━━━━━━░  ~85%
```

---

## 3. 接入计划

### 3.1 Phase 1：快速修复（Day 1）

#### T1: 快捷键 API 补全 — G1

**改动范围：** 2 个文件

| 文件 | 改动 |
|------|------|
| `sidecars/python-automation/main.py` | 新增 `/api/hotkey` 路由 |
| `sidecars/node-backend/src/tools/index.ts` | `hotkeyTool.execute` 改为调用 Python API |

**Python 侧已有实现：**
```python
# gui_control.py L172 — 已存在！
def hotkey(self, *keys: str) -> Dict[str, Any]:
    pyautogui.hotkey(*keys)
    return {'action': 'hotkey', 'keys': list(keys)}
```

**需新增的 Python 路由：**
```python
@app.route("/api/hotkey", methods=["POST"])
def hotkey():
    data = _body()
    keys = data.get("keys", [])
    if not keys:
        return _error_response("INVALID_ARGUMENT", "keys is required", 400)
    result = gui.hotkey(*keys)
    return _ok(result=result)
```

**需修改的 Node 工具：**
```typescript
execute: async (args: { keys: string[] }) => {
    const response = await fetchWithRetry(`${PYTHON_SERVICE_URL}/api/hotkey`, {
      method: 'POST',
      body: JSON.stringify({ keys: args.keys }),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Hotkey failed');
    return data.result;
}
```

**验收：** 前端调用 `hotkey(["ctrl", "s"])` 触发保存

---

### 3.2 Phase 2：Agent 多轮工具循环重写（Day 1-2）— G2

**改动范围：** 1 个文件

| 文件 | 改动 |
|------|------|
| `sidecars/node-backend/src/agent/runtime.ts` | 重写 `chat()` 方法 |

**参考：** `claude-quickstarts/agents/agent.py` 的标准循环

**当前问题（`runtime.ts` L82-88）：**
```typescript
// ❌ 只读取第一个 content block
const content = response.content[0];
if (content.type === 'text') { ... }
if (content.type === 'tool_use') { ... }  // 只处理一个工具
```

**目标架构：**
```
用户消息
    ↓
┌─ Claude API 调用 ←──────────────────────┐
│     ↓                                    │
│  response.content 可能包含多个 block:     │
│  [text, tool_use, tool_use, ...]        │
│     ↓                                    │
│  遍历所有 tool_use blocks                │
│     ↓                                    │
│  执行每个工具 → 收集 tool_result          │
│     ↓                                    │
│  如果 stop_reason === 'tool_use'         │
│     → 追加 tool_result 消息 ─────────────┘
│  如果 stop_reason === 'end_turn'
│     → 提取最终文本 → 返回
└──────────────────────────────────────────
```

**关键改动点：**
1. 遍历 `response.content` 所有 blocks（不止 `[0]`）
2. 工具结果使用 `{ role: 'user', content: [{ type: 'tool_result', tool_use_id, content }] }`
3. 循环判断 `response.stop_reason === 'tool_use'` 决定是否继续
4. 保留消息历史用于多轮对话

**验收：** 用户说"打开记事本并输入 Hello" → Agent 自动调用 `list_windows` → `click` → `type_text` 三步完成

---

### 3.3 Phase 3：截图→Vision→操作闭环（Day 2-3）— G3

**改动范围：** 3 个文件

| 文件 | 改动 |
|------|------|
| `sidecars/node-backend/src/tools/index.ts` | `screenshotTool` 返回增加 base64 |
| `sidecars/node-backend/src/agent/runtime.ts` | 截图结果作为 image content 发送 |
| `sidecars/python-automation/main.py` | `/api/screenshot` 增加 base64 返回 |

**参考：** `computer-use-demo/tools/computer.py`

**核心改动 — Python 截图 API 增加 base64：**
```python
import base64

@app.route("/api/screenshot", methods=["POST"])
def screenshot():
    data = _body()
    result = gui.screenshot(...)
    # 新增: 读取图片并 base64 编码
    with open(result["path"], "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")
    result["base64"] = b64
    result["media_type"] = "image/png"
    return _ok(result=result)
```

**核心改动 — Agent 将截图发给 Claude Vision：**
```typescript
// 在 tool_result 中包含图片
{
  type: 'tool_result',
  tool_use_id: toolUseId,
  content: [
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64Data } },
    { type: 'text', text: `Screenshot saved: ${path}, size: ${width}x${height}` }
  ]
}
```

**坐标缩放（参考 `coordinate_scaling.py`）：**
- 实际屏幕分辨率 → 缩放到 1024×768 发给 Claude
- Claude 返回的坐标 → 缩放回实际分辨率再操作

**验收：** 用户说"屏幕上有什么" → Agent 截图 → Claude 描述屏幕内容并定位元素

---

### 3.4 Phase 4：高级 GUI 操作补全（Day 3）— G6

**改动范围：** 2 个文件

| 文件 | 改动 |
|------|------|
| `sidecars/python-automation/gui_control.py` | 新增 right_click, double_click, drag, hover |
| `sidecars/python-automation/main.py` | 新增对应 API 路由 |
| `sidecars/node-backend/src/tools/index.ts` | 新增对应 Tool 定义 |

**新增 GUI 操作：**

| 操作 | Python 实现 | API 路由 |
|------|-------------|----------|
| 右键点击 | `pyautogui.rightClick(x, y)` | `POST /api/right_click` |
| 双击 | `pyautogui.doubleClick(x, y)` | `POST /api/double_click` |
| 拖拽 | `pyautogui.moveTo(x1,y1); pyautogui.drag(dx,dy)` | `POST /api/drag` |
| 悬停 | `pyautogui.moveTo(x, y)` | `POST /api/hover` |
| 鼠标按下/释放 | `pyautogui.mouseDown/mouseUp()` | `POST /api/mouse_down`, `/api/mouse_up` |

**验收：** 调用 `right_click` 能弹出右键菜单；`drag` 能拖动文件

---

### 3.5 Phase 5：浏览器自动化接入（Day 4-5）— G4

**改动范围：** 新增模块

| 文件 | 说明 |
|------|------|
| `sidecars/python-automation/browser_control.py` | 新增 — Playwright 浏览器控制 |
| `sidecars/python-automation/main.py` | 新增浏览器相关路由 |
| `sidecars/python-automation/requirements.txt` | 新增 `playwright` 依赖 |
| `sidecars/node-backend/src/tools/index.ts` | 新增浏览器 Tool 定义 |

**参考：** `browser-use-demo/tools/browser.py`

**暴露的 API：**

| 路由 | 功能 |
|------|------|
| `POST /api/browser/launch` | 启动浏览器实例 |
| `POST /api/browser/navigate` | 导航到 URL |
| `POST /api/browser/click` | 点击元素（ref 或坐标） |
| `POST /api/browser/type` | 在元素中输入文字 |
| `POST /api/browser/read_page` | 获取页面 DOM 树 |
| `POST /api/browser/get_text` | 提取页面纯文本 |
| `POST /api/browser/form_input` | 直接设置表单值 |
| `POST /api/browser/screenshot` | 浏览器截图 |
| `POST /api/browser/close` | 关闭浏览器 |

**验收：** 用户说"打开百度搜索 chubao AI" → Agent 启动浏览器 → 导航 → 输入 → 搜索

---

### 3.6 Phase 6：安全沙箱（Day 5）— G5

**改动范围：** 新增模块

| 文件 | 说明 |
|------|------|
| `sidecars/python-automation/security.py` | 新增 — 命令白名单 + 参数验证 |
| `sidecars/node-backend/src/agent/runtime.ts` | 工具调用前增加安全检查 |

**参考：** `autonomous-coding/security.py`

**安全层设计：**
```
用户请求 → Agent 决定调用工具
    ↓
安全检查层 (security.py)
  ├─ 工具是否在允许列表？
  ├─ 参数是否合法？（路径限制、命令过滤）
  └─ 操作是否需要用户确认？
    ↓
通过 → 执行工具
拒绝 → 返回安全提示
```

**白名单分级：**

| 级别 | 工具 | 说明 |
|------|------|------|
| **自由执行** | screenshot, list_windows, ocr_recognize, get_coding_progress | 只读操作 |
| **自动执行** | click, type_text, hotkey, scroll | 基本控制 |
| **需确认** | menu_select, drag, browser/* | 有副作用的操作 |
| **默认禁止** | 未注册的工具 | 拒绝并提示 |

---

## 4. 详细设计

### 4.1 改造后的 Agent 循环架构

```
┌─────────────────────────────────────────────────────────────┐
│                   Agent Runtime v2                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  用户消息 + 记忆上下文                                       │
│       ↓                                                     │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              ReAct 循环 (max 10 轮)                    │  │
│  │                                                       │  │
│  │  Claude API (支持 Vision)                              │  │
│  │    ↓                                                   │  │
│  │  遍历 response.content:                                │  │
│  │    ├─ text → 追加到最终回复                             │  │
│  │    ├─ tool_use → 安全检查 → 执行 → 收集 tool_result    │  │
│  │    └─ tool_use (screenshot) → base64 → image content  │  │
│  │    ↓                                                   │  │
│  │  stop_reason == 'tool_use' → 继续循环                  │  │
│  │  stop_reason == 'end_turn' → 退出                      │  │
│  └───────────────────────────────────────────────────────┘  │
│       ↓                                                     │
│  返回最终文本 + 保存对话到记忆                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 工具注册总览（Sprint 3 完成后）

| # | 工具名 | 类别 | 状态 |
|---|--------|------|------|
| 1 | list_windows | GUI 查看 | ✅ 已有 |
| 2 | get_window_controls | GUI 查看 | ✅ 已有 |
| 3 | click | GUI 控制 | ✅ 已有 |
| 4 | type_text | GUI 控制 | ✅ 已有 |
| 5 | menu_select | GUI 控制 | ✅ 已有 |
| 6 | screenshot | GUI 查看 | ✅ 已有 (需增加 base64) |
| 7 | ocr_recognize | OCR | ✅ 已有 |
| 8 | ocr_find_text | OCR | ✅ 已有 |
| 9 | ocr_click_text | OCR + 控制 | ✅ 已有 |
| 10 | hotkey | GUI 控制 | 🔧 Phase 1 补全 |
| 11 | get_coding_progress | 编程 | ✅ 已有 |
| 12 | right_click | GUI 控制 | 🆕 Phase 4 |
| 13 | double_click | GUI 控制 | 🆕 Phase 4 |
| 14 | drag | GUI 控制 | 🆕 Phase 4 |
| 15 | hover | GUI 控制 | 🆕 Phase 4 |
| 16 | browser_navigate | 浏览器 | 🆕 Phase 5 |
| 17 | browser_click | 浏览器 | 🆕 Phase 5 |
| 18 | browser_type | 浏览器 | 🆕 Phase 5 |
| 19 | browser_read_page | 浏览器 | 🆕 Phase 5 |
| 20 | browser_screenshot | 浏览器 | 🆕 Phase 5 |
| 21 | opencode_run | 编程 | 🆕 Phase 7 |
| 22 | opencode_create_project | 编程 | 🆕 Phase 7 |
| 23 | ohmyopencode_task | 编程 | 🆕 Phase 8 |
| 24 | ohmyopencode_delegate | 编程 | 🆕 Phase 8 |

---

## 5. 验收标准

### 5.1 分阶段验收

| Phase | 验收场景 | 验收命令/操作 |
|-------|----------|-------------|
| P1 | 快捷键生效 | Agent 调用 `hotkey(["ctrl","s"])` 触发保存 |
| P2 | 多轮推理 | "打开记事本并输入 Hello" → 自动完成 3 步 |
| P3 | 视觉理解 | "屏幕上有什么" → 描述当前屏幕内容 |
| P4 | 高级操作 | `right_click` 弹出菜单；`drag` 拖动文件 |
| P5 | 浏览器控制 | "打开百度搜索 AI" → 完成搜索流程 |
| P6 | 安全拦截 | 尝试执行非白名单操作被拒绝 |

### 5.2 整体验收

| 指标 | 当前 | 目标 |
|------|------|------|
| 已注册工具数 | 11 | 24+ |
| Agent 循环轮数 | 1 | 10 |
| GUI 操作类型 | 5 (click, type, menu, screenshot, scroll) | 10+ |
| 浏览器操作 | 0 | 8+ |
| 安全过滤 | 无 | 三级分类 |
| TypeScript 编译 | 0 error | 0 error |
| 控制能力完整度 | ~55% | ~85% |

### 5.3 联调 smoke 场景

```
Scenario 1: 桌面自动化端到端
  1. 用户: "打开记事本，输入今天的日期，然后保存为 test.txt"
  2. Agent: list_windows → 判断是否已打开 → 未打开则 hotkey(["win","r"]) → type_text("notepad") → hotkey(["enter"])
  3. Agent: screenshot → Vision 确认记事本已打开
  4. Agent: type_text(当前日期) → hotkey(["ctrl","s"]) → type_text("test.txt") → hotkey(["enter"])
  5. 验证: test.txt 文件存在且内容正确

Scenario 2: 浏览器自动化端到端
  1. 用户: "用浏览器打开 github.com 搜索 chubao"
  2. Agent: browser_navigate("https://github.com") → browser_read_page → browser_click(搜索框 ref)
  3. Agent: browser_type("chubao") → browser_click(搜索按钮) → browser_screenshot
  4. 验证: 截图显示搜索结果页

Scenario 3: 视觉理解
  1. 用户: "看看我的桌面上有什么图标"
  2. Agent: screenshot → Vision 分析 → 返回图标列表描述
  3. 验证: 描述与实际桌面一致
```

---

## 附录：Sprint 时间线

```
Day 1 ─── Phase 1 (快捷键补全) ✦ Phase 2 (Agent 循环重写)
Day 2 ─── Phase 2 (续) ✦ Phase 3 (Vision 闭环)
Day 3 ─── Phase 3 (续) ✦ Phase 4 (高级 GUI)
Day 4 ─── Phase 5 (浏览器自动化)
Day 5 ─── Phase 5 (续) ✦ Phase 6 (安全沙箱) ✦ 联调验收
Day 6 ─── Phase 7 (OpenCode Skills 集成)
Day 7 ─── Phase 8 (Oh-My-OpenCode Skills 集成) ✦ 整体联调
```

---

## 6. 新增：OpenCode & Oh-My-OpenCode Skills 集成方案

基于对 opencode-dev 和 oh-my-opencode-dev 项目的深入分析，我们可以通过 Skills 系统将这两个专业的编程工具集成到 chubao 中，实现 Windows 电脑自动化编程的能力。

### 6.1 集成目标

| 目标 | 说明 |
|------|------|
| **保持专注** | chubao 专注于 Windows 自动化控制，通过 Skills 调度专业工具 |
| **复用能力** | 利用 OpenCode 和 Oh-My-OpenCode 专业的编程能力 |
| **灵活扩展** | 通过 Skills 系统可以轻松集成更多开发工具 |
| **隔离复杂性** | 将编程工具的复杂性封装在 Skills 内部 |

### 6.2 技术实现路径

#### Phase 7：OpenCode Skills 集成（Day 6）

**改动范围：** 新增 Skills

| 文件 | 改动 |
|------|------|
| `sidecars/node-backend/src/tools/opencode.ts` | 新增 — OpenCode CLI 调用封装 |
| `sidecars/node-backend/src/tools/index.ts` | 注册 OpenCode 相关工具 |

**暴露的 API：**

| 工具名 | 功能 | 参数 |
|-------|------|------|
| `opencode_run` | 执行 OpenCode 开发任务 | `projectPath`, `prompt`, `agentType` |
| `opencode_create_project` | 创建新项目 | `projectName`, `template` |
| `opencode_check_status` | 检查任务状态 | `sessionId` |
| `opencode_cancel_task` | 取消任务 | `taskId` |

**实现方式：**
```typescript
// 封装 OpenCode CLI 命令
export const opencodeRunSkill = {
  name: "opencode_run",
  description: "运行 OpenCode 开发任务",
  parameters: {
    type: "object",
    properties: {
      projectPath: { type: "string", description: "项目路径" },
      prompt: { type: "string", description: "开发任务描述" },
      agentType: { type: "string", description: "使用的 Agent 类型 (build, plan, general, explore)" }
    }
  },
  execute: async ({ projectPath, prompt, agentType }) => {
    const command = `cd ${projectPath} && npx opencode run --prompt "${prompt}" --agent ${agentType || 'build'}`;
    const result = await exec(command);
    return { success: true, output: result.stdout, error: result.stderr };
  }
};
```

#### Phase 8：Oh-My-OpenCode Skills 集成（Day 7）

**改动范围：** 新增 Skills

| 文件 | 改动 |
|------|------|
| `sidecars/node-backend/src/tools/ohmyopencode.ts` | 新增 — Oh-My-OpenCode API 调用封装 |
| `sidecars/node-backend/src/tools/index.ts` | 注册 Oh-My-OpenCode 相关工具 |

**暴露的 API：**

| 工具名 | 功能 | 参数 |
|-------|------|------|
| `ohmyopencode_task` | 通过 Atlas 分配开发任务 | `taskCategory`, `taskPrompt`, `runInBackground` |
| `ohmyopencode_delegate` | 委派任务给专业 Agent | `agentType`, `taskDescription` |
| `ohmyopencode_list_agents` | 列出可用的 Agent | 无 |
| `ohmyopencode_check_concurrent_status` | 检查并发任务状态 | 无 |

**实现方式：**
```typescript
// 封装 Oh-My-OpenCode 任务委派
export const ohMyOpencodeTaskSkill = {
  name: "ohmyopencode_task",
  description: "通过 Oh-My-OpenCode 分配开发任务",
  parameters: {
    type: "object",
    properties: {
      taskCategory: { type: "string", description: "任务类别" },
      taskPrompt: { type: "string", description: "任务描述" },
      runInBackground: { type: "boolean", description: "是否后台运行" }
    }
  },
  execute: async ({ taskCategory, taskPrompt, runInBackground }) => {
    const command = `npx oh-my-opencode task --category ${taskCategory} --prompt "${taskPrompt}" --background=${runInBackground || false}`;
    const result = await exec(command);
    return { success: true, output: result.stdout, taskId: extractTaskId(result.stdout) };
  }
};
```

### 6.3 集成优势

| 优势 | 说明 |
|------|------|
| **完全自动化** | OpenCode 的非交互式模式实现 100% 自动化开发 |
| **专业分工** | Oh-My-OpenCode 的专业 Agent 系统实现精细化分工 |
| **并发执行** | BackgroundManager 支持多任务并行执行 |
| **隔离开发** | Git Worktree 确保各 Agent 任务互不干扰 |
| **统一控制** | chubao 作为主控制器协调整个开发流程 |
| **灵活委派** | Atlas 可根据任务类型委派给最适合的专业 Agent |

### 6.4 实施策略

1. **安装必要工具**：在系统中安装 OpenCode 和 Oh-My-OpenCode CLI
2. **创建封装 Skills**：将 CLI 命令封装为可调用的工具函数
3. **集成到 Agent**：将新工具注册到 Agent 的工具库中
4. **测试集成**：验证工具调用和结果返回
5. **优化体验**：增加进度反馈和错误处理机制

### 6.5 验收标准

| 验收场景 | 验收操作 |
|----------|----------|
| OpenCode 集成 | 用户说"帮我创建一个 React 项目" → Agent 调用 `opencode_create_project` 创建项目 |
| Oh-My-OpenCode 集成 | 用户说"帮我实现登录功能" → Agent 调用 `ohmyopencode_task` 分配任务 |
| 并发开发 | 用户说"同时开发前端和后端" → Agent 同时调用多个工具实现并行开发 |
| 任务监控 | 用户问"开发进度如何" → Agent 调用状态查询工具返回进度 |

---

*文档版本: v1.1 | 最后更新: 2026-02-13*

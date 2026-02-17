# 自动化示例

> 展示 Chubao AI 的 Windows 自动化和浏览器自动化能力

---

## 示例 1：自动填写表单

### 场景
自动打开计算器应用，执行计算并获取结果。

### 实现

```javascript
// 使用工具序列
const tools = [
  {
    tool: "hotkey",
    args: { keys: ["win", "r"] }  // 打开运行对话框
  },
  {
    tool: "type_text",
    args: { text: "calc", interval: 0.01 }
  },
  {
    tool: "hotkey",
    args: { keys: ["return"] }  // 启动计算器
  },
  {
    tool: "sleep",
    args: { ms: 500 }  // 等待启动
  },
  {
    tool: "click",
    args: { x: 100, y: 300 }  // 点击数字
  },
  {
    tool: "click",
    args: { x: 200, y: 300 }  // 点击运算符
  },
  {
    tool: "click",
    args: { x: 100, y: 300 }  // 点击数字
  },
  {
    tool: "click",
    args: { x: 300, y: 400 }  // 点击等于
  },
  {
    tool: "screenshot",
    args: { region: { x: 50, y: 100, width: 300, height: 100 } }
  }
];
```

### AI 对话方式

```
用户：请打开计算器，计算 123 + 456，然后截图给我看结果

AI：我来帮您完成这个任务。

[AI 自动执行]
1. 按 Win+R 打开运行
2. 输入 calc 启动计算器
3. 依次点击 1, 2, 3
4. 点击 +
5. 依次点击 4, 5, 6
6. 点击 =
7. 截图显示结果 579
```

---

## 示例 2：网页数据抓取

### 场景
自动登录网站并抓取数据。

### API 调用

```bash
#!/bin/bash
# scrape.sh - 网页数据抓取示例

# 1. 启动浏览器
curl -s -X POST http://localhost:3200/api/browser/launch \
  -d '{"headless": true, "width": 1920, "height": 1080}'

# 2. 导航到登录页
curl -s -X POST http://localhost:3200/api/browser/navigate \
  -d '{"url": "https://example.com/login"}'

# 3. 输入用户名
curl -s -X POST http://localhost:3200/api/browser/type \
  -d '{"selector": "input[name=username]", "text": "myuser"}'

# 4. 输入密码
curl -s -X POST http://localhost:3200/api/browser/type \
  -d '{"selector": "input[name=password]", "text": "mypass"}'

# 5. 点击登录
curl -s -X POST http://localhost:3200/api/browser/click \
  -d '{"selector": "button[type=submit]"}'

# 6. 等待页面加载
sleep 3

# 7. 获取页面文本
curl -s -X POST http://localhost:3200/api/browser/get_text

# 8. 截图保存
curl -s -X POST http://localhost:3200/api/browser/screenshot \
  -d '{"path": "./result.png"}'

# 9. 关闭浏览器
curl -s -X POST http://localhost:3200/api/browser/close
```

---

## 示例 3：批量文件处理

### 场景
批量重命名文件夹中的图片文件。

### 工具组合

```javascript
// batch-rename.js
const fs = require('fs');
const path = require('path');

async function batchRename(folderPath) {
  const files = fs.readdirSync(folderPath)
    .filter(f => f.endsWith('.jpg') || f.endsWith('.png'));
  
  for (let i = 0; i < files.length; i++) {
    const oldName = files[i];
    const ext = path.extname(oldName);
    const newName = `image_${String(i + 1).padStart(3, '0')}${ext}`;
    
    fs.renameSync(
      path.join(folderPath, oldName),
      path.join(folderPath, newName)
    );
    
    console.log(`Renamed: ${oldName} -> ${newName}`);
  }
}

// 使用 Chubao AI 工具执行
const toolCall = {
  tool: "run_command",
  args: {
    command: "node batch-rename.js C:/Users/Pictures",
    timeout: 30000
  }
};
```

---

## 示例 4：定时任务自动化

### 场景
每天早上 9 点自动发送工作报告。

### 设置定时任务

```bash
# 创建定时任务
curl -X POST http://localhost:3100/api/cron/add \
  -H "Content-Type: application/json" \
  -d '{
    "name": "morning-report",
    "schedule": "0 9 * * 1-5",
    "task": {
      "type": "generate_report",
      "actions": [
        {
          "tool": "analyze_coding_progress",
          "args": {"sinceDays": 1}
        },
        {
          "tool": "send_notification",
          "args": {
            "channel": "telegram",
            "message": "{{report}}"
          }
        }
      ]
    }
  }'
```

### Cron 表达式说明

| 表达式 | 含义 |
|--------|------|
| `0 9 * * *` | 每天 9:00 |
| `0 9 * * 1-5` | 工作日 9:00 |
| `*/30 * * * *` | 每 30 分钟 |
| `0 0 * * 0` | 每周日午夜 |

---

## 示例 5：Vision 辅助自动化

### 场景
AI 通过截图理解界面，然后执行操作。

### 工作流程

```
1. 用户：请帮我在 VS Code 中打开 settings.json

2. AI 执行：
   a. 截图查看当前屏幕
   b. 使用 Vision 分析界面
   c. 识别 VS Code 窗口
   d. 规划操作步骤：
      - 如果 VS Code 未打开：点击图标启动
      - 按 Ctrl+Shift+P 打开命令面板
      - 输入 "Preferences: Open Settings (JSON)"
      - 按 Enter 执行

3. AI 执行操作序列

4. 验证结果（再次截图）
```

### API 实现

```javascript
// vision-automation.js
async function openVSCodeSettings() {
  // 1. 截图
  const screenshot = await fetch('http://localhost:3200/api/screenshot', {
    method: 'POST',
    body: JSON.stringify({ fullScreen: true })
  });
  
  // 2. 发送给 AI 分析
  const analysis = await fetch('http://localhost:3100/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      message: '分析这张截图，告诉我 VS Code 是否已打开，' +
               '并给出打开 settings.json 的具体步骤',
      // 截图作为附件
    })
  });
  
  // 3. 根据 AI 建议执行操作
  const steps = analysis.steps;
  for (const step of steps) {
    await executeTool(step.tool, step.args);
  }
}
```

---

## 示例 6：多 Agent 协作

### 场景
代码审查自动化：一个 Agent 写代码，一个审查，一个测试。

### 实现

```bash
# 启动多 Agent 组
curl -X POST http://localhost:3100/api/multi-agent/start \
  -d '{
    "groupId": "code-review-pipeline",
    "agents": [
      {
        "role": "developer",
        "task": "实现用户请求的功能",
        "tools": ["write_file", "edit_file"]
      },
      {
        "role": "reviewer",
        "task": "审查代码质量和安全性",
        "tools": ["read_file", "analyze_code"]
      },
      {
        "role": "tester",
        "task": "生成并运行测试用例",
        "tools": ["write_file", "run_command"]
      }
    ]
  }'

# 发送任务给 Agent 组
curl -X POST http://localhost:3100/api/multi-agent/message \
  -d '{
    "groupId": "code-review-pipeline",
    "message": "实现一个斐波那契数列函数，包含输入验证"
  }'
```

### 执行流程

```
Developer → 编写代码 → Reviewer 审查
                              ↓
                          通过/不通过
                              ↓
              不通过 ← 修改代码 ← 问题反馈
                 ↓
              通过 → Tester 生成测试
                         ↓
                    运行测试
                         ↓
                    全部通过 → 完成任务
```

---

## 示例 7：错误自动诊断

### 场景
程序出错时，自动截图、收集日志、分析原因。

### 自动化脚本

```python
# auto-debug.py
import requests
import json

def auto_diagnose(error_message):
    # 1. 截图
    screenshot = requests.post('http://localhost:3200/api/screenshot')
    
    # 2. 收集系统信息
    system_info = {
        'error': error_message,
        'screenshot': screenshot.json()['base64'],
        'timestamp': datetime.now().isoformat()
    }
    
    # 3. 发送给 AI 分析
    response = requests.post('http://localhost:3100/api/chat', json={
        'message': f'''
        请诊断以下错误：
        
        错误信息：{error_message}
        
        截图显示了当前界面状态。
        
        请提供：
        1. 可能的原因
        2. 解决方案
        3. 预防建议
        '''
    })
    
    # 4. 根据建议自动修复
    suggestions = parse_suggestions(response.json()['response'])
    for action in suggestions.actions:
        execute_action(action)
    
    return suggestions
```

---

## 最佳实践

### 1. 错误处理

```javascript
// 始终添加错误处理
try {
  const result = await executeTool(tool, args);
  // 验证结果
  if (!result.success) {
    throw new Error(result.error);
  }
} catch (error) {
  // 截图保存现场
  await screenshot({ path: `./error-${Date.now()}.png` });
  throw error;
}
```

### 2. 等待策略

```javascript
// 使用智能等待，而非固定延时
async function waitForElement(selector, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const elements = await getControls({ selector });
    if (elements.length > 0) return elements[0];
    await sleep(100);
  }
  throw new Error(`Element not found: ${selector}`);
}
```

### 3. 日志记录

```javascript
// 记录所有操作
const log = [];

async function loggedExecute(tool, args) {
  console.log(`[${new Date().toISOString()}] Executing: ${tool}`);
  const start = Date.now();
  
  try {
    const result = await executeTool(tool, args);
    log.push({
      tool,
      args,
      result,
      duration: Date.now() - start,
      success: true
    });
    return result;
  } catch (error) {
    log.push({
      tool,
      args,
      error: error.message,
      duration: Date.now() - start,
      success: false
    });
    throw error;
  }
}
```

---

*更多示例见项目 `examples/` 目录*

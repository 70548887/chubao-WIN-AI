# 消息平台集成指南

> Chubao AI 支持飞书、Telegram 和 WhatsApp 三大消息平台

## 目录

1. [快速开始](#快速开始)
2. [飞书 (Lark) 集成](#飞书-lark-集成)
3. [Telegram 集成](#telegram-集成)
4. [WhatsApp 集成](#whatsapp-集成)
5. [API 接口](#api-接口)
6. [故障排除](#故障排除)

---

## 快速开始

### 1. 配置环境变量

复制 `.env.example` 到 `.env` 并配置相应的平台：

```bash
# 飞书
LARK_APP_ID=cli_xxxxxxxxxxxxxxxx
LARK_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Telegram
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz

# WhatsApp
WHATSAPP_ENABLED=true
```

### 2. 安装依赖

```bash
cd sidecars/node-backend
npm install
```

### 3. 启动服务

```bash
npm run dev
```

### 4. 检查状态

```bash
curl http://localhost:3100/api/platforms/status
```

---

## 飞书 (Lark) 集成

### 配置步骤

1. **访问飞书开放平台**
   - 打开 https://open.feishu.cn
   - 登录企业账号

2. **创建企业自建应用**
   - 点击「创建企业自建应用」
   - 填写应用名称：Chubao AI
   - 选择应用类型：企业内部应用

3. **获取凭证**
   - 进入「凭证与基础信息」
   - 复制 `App ID` 和 `App Secret`
   - 填入 `.env` 文件

4. **启用机器人能力**
   - 进入「机器人」
   - 开启「启用机器人」
   - 设置机器人名称和描述

5. **配置事件订阅**
   - 进入「事件订阅」
   - 开启「启用事件订阅」
   - 设置「请求地址」: `https://your-domain/lark/webhook`
   - 点击「添加事件」→ 搜索「接收消息」→ 选择 `im.message.receive_v1`
   - 点击「添加」

6. **配置权限**
   - 进入「权限管理」
   - 添加以下权限：
     - `im:chat:readonly` (读取群组信息)
     - `im:message:send` (发送消息)
     - `im:message.group_msg` (发送群消息)

7. **发布应用**
   - 进入「版本管理与发布」
   - 点击「创建版本」
   - 填写版本信息
   - 点击「申请发布」

### 安全设置（可选）

为加强安全性，可以配置：

```bash
LARK_ENCRYPT_KEY=your-encrypt-key
LARK_VERIFICATION_TOKEN=your-verification-token
```

- **Encrypt Key**: 用于解密消息，在事件订阅页面获取
- **Verification Token**: 用于验证请求来源，在事件订阅页面获取

### 使用方式

用户在飞书中：
1. 搜索并添加「Chubao AI」机器人
2. 在单聊或群聊中 @机器人或直接发送消息
3. 机器人会自动回复 AI 生成的内容

### 支持的命令

- 直接发送消息 - AI 对话
- `@机器人 /help` - 显示帮助（如实现）

---

## Telegram 集成

### 配置步骤

1. **创建 Bot**
   - 在 Telegram 中搜索 `@BotFather`
   - 发送 `/newbot`
   - 按提示设置名称和 username
   - 复制获得的 **Bot Token**

2. **配置环境变量**

```bash
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
# 可选：限制特定用户使用
TELEGRAM_ALLOWED_USERS=123456789,987654321
```

3. **（可选）配置 Webhook**

如果需要使用 Webhook 模式（适合有公网 IP 的服务器）：

```bash
TELEGRAM_WEBHOOK_URL=https://your-domain/telegram-webhook
```

如果不配置，默认使用 Long Polling 模式。

### 使用方式

1. 在 Telegram 中搜索你的 Bot username（如 `@ChubaoAIBot`）
2. 点击「Start」或发送 `/start`
3. 使用命令或发送消息开始对话

### 支持的命令

| 命令 | 描述 |
|------|------|
| `/start` | 开始对话，显示欢迎信息 |
| `/help` | 显示帮助信息 |
| `/status` | 查看系统状态 |
| `/windows` | 获取当前窗口列表 |
| `/screenshot` | 截取屏幕 |
| `/chat <消息>` | 发送消息给 AI |
| `/memory <关键词>` | 搜索记忆 |
| `/clear` | 清除对话历史 |

### 键盘快捷方式

- 📋 获取窗口列表
- 📸 截图
- 💬 开始聊天
- ⚙️ 设置

---

## WhatsApp 集成

### 配置步骤

1. **启用 WhatsApp 集成**

```bash
WHATSAPP_ENABLED=true
```

2. **（可选）配置参数**

```bash
# Session 名称（用于多账号）
WHATSAPP_SESSION_NAME=chubao-ai

# 数据存储路径
WHATSAPP_DATA_PATH=./whatsapp-session

# 是否无头模式（false 会显示浏览器窗口）
WHATSAPP_HEADLESS=true

# 授权号码列表（可选，逗号分隔）
WHATSAPP_AUTHORIZED_NUMBERS=86138xxxxxxxx,86139xxxxxxxx
```

3. **首次登录**

启动服务后：
1. 控制台会显示二维码
2. 使用 WhatsApp 手机应用扫描
3. 等待「认证成功」消息
4. 即可开始使用

**注意**: 二维码 60 秒后会自动刷新。

### 使用方式

1. 将 Bot 的 WhatsApp 号码添加到联系人
2. 发送消息开始对话
3. 使用 `/` 命令执行操作

### 支持的命令

| 命令 | 描述 |
|------|------|
| `/help` 或 `/h` | 显示帮助 |
| `/status` | 查看系统状态 |
| `/chat <消息>` | 与 AI 对话 |
| `/windows` | 获取窗口列表 |
| `/screenshot` | 截取屏幕 |
| `/memory <关键词>` | 搜索记忆 |
| `/clear` | 清除对话历史 |

---

## API 接口

### 获取平台状态

```http
GET /api/platforms/status
```

**响应示例：**

```json
{
  "success": true,
  "platforms": {
    "lark": {
      "enabled": true,
      "bot": {
        "activate_status": 1,
        "app_name": "Chubao AI",
        "avatar_url": "https://..."
      }
    },
    "telegram": {
      "enabled": true,
      "username": "ChubaoAIBot",
      "first_name": "Chubao AI"
    },
    "whatsapp": {
      "enabled": true,
      "ready": true,
      "hasQrCode": false,
      "authorizedNumbers": 2
    }
  }
}
```

### 飞书 Webhook

```http
POST /lark/webhook
```

接收飞书推送的事件消息。

**注意**: 需要在飞书开放平台配置此地址。

### 健康检查

```http
GET /lark/health
```

检查飞书集成健康状态。

---

## 故障排除

### 飞书

#### 无法接收消息

**症状**: 发送消息给 Bot 没有响应

**排查步骤**:
1. 检查 `.env` 中的 `LARK_APP_ID` 和 `LARK_APP_SECRET` 是否正确
2. 确认应用已发布（版本管理与发布 → 已发布）
3. 检查事件订阅的请求地址是否正确配置
4. 查看服务端日志是否有错误
5. 确认 Bot 已被添加到对话中

#### Token 过期

**症状**: 日志显示 "token expired" 或 99991663 错误

**解决**: 代码会自动刷新 token，如仍有问题请重启服务。

#### 签名验证失败

**症状**: 收到 401 错误

**解决**: 
1. 检查 `LARK_ENCRYPT_KEY` 是否与飞书平台一致
2. 如不启用加密，留空即可

### Telegram

#### Bot 无法启动

**症状**: 日志显示 "401 Unauthorized"

**解决**: 
1. 检查 `TELEGRAM_BOT_TOKEN` 是否正确
2. 确认 Token 没有过期（可在 @BotFather 重新生成）

#### 连接断开

**症状**: 日志显示连接错误

**解决**: 
- 代码会自动重连（最多 10 次）
- 如仍无法连接，检查网络状况
- 考虑使用 Webhook 模式替代 Long Polling

#### 消息发送失败

**症状**: 发送消息时出错

**解决**:
1. 检查是否触发 Telegram 频率限制（代码会自动重试）
2. 确认消息长度不超过 4096 字符
3. 检查 Markdown 格式是否正确

### WhatsApp

#### 二维码无法扫描

**症状**: 二维码扫描后无反应

**解决**:
1. 确保手机网络正常
2. 重启 WhatsApp 应用
3. 等待控制台显示新的二维码
4. 尝试设置 `WHATSAPP_HEADLESS=false` 查看浏览器窗口

#### 会话丢失

**症状**: 重启服务后需要重新扫码

**解决**:
1. 检查 `WHATSAPP_DATA_PATH` 目录权限
2. 确保目录可读写
3. 不要随意删除 session 文件

#### 无法发送消息

**症状**: 提示 "WhatsApp 客户端未就绪"

**解决**:
1. 检查服务状态：查看控制台是否有「WhatsApp 客户端已就绪」
2. 确认手机 WhatsApp 保持在线
3. 检查网络连接

#### 浏览器启动失败

**症状**: 日志显示 Puppeteer 错误

**解决**:
1. 确保已安装 Chrome 或 Chromium
2. Linux 系统可能需要额外依赖：
   ```bash
   sudo apt-get install -y gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation libappindicator1 libnss3 lsb-release xdg-utils wget
   ```

### 通用问题

#### 后端服务无法启动

**排查**:
1. 检查端口是否被占用：`lsof -i :3100`
2. 检查依赖是否安装完整：`npm install`
3. 检查 Node.js 版本：`node --version` (需要 22+)

#### AI 不回复消息

**排查**:
1. 检查 `ANTHROPIC_API_KEY` 是否正确配置
2. 检查 Claude API 额度是否充足
3. 查看服务端日志中的错误信息

#### Python 自动化服务连接失败

**排查**:
1. 检查 Python 服务是否运行：`curl http://localhost:3200/health`
2. 检查 `PYTHON_PORT` 配置
3. 检查 Python 依赖是否安装：`pip install -r requirements.txt`

---

## 安全建议

1. **使用白名单**: 对 Telegram 和 WhatsApp 配置 `ALLOWED_USERS`，限制只有特定用户可以使用
2. **保护 API 密钥**: 不要将 `.env` 文件提交到版本控制
3. **配置 HTTPS**: 生产环境使用 Webhook 时，确保使用 HTTPS
4. **定期更新**: 定期更新依赖包以修复安全漏洞
5. **监控日志**: 关注异常访问和错误日志

---

## 技术支持

如遇到问题，请：
1. 查看服务端日志
2. 检查 [故障排除](#故障排除) 章节
3. 提交 Issue 到 GitHub

---

*文档版本: v1.0 | 最后更新: 2026-02-13*

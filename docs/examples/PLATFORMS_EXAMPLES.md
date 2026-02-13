# 消息平台使用示例

> 本目录包含各消息平台的使用示例和代码片段

## 目录

- [飞书示例](#飞书示例)
- [Telegram 示例](#telegram-示例)
- [WhatsApp 示例](#whatsapp-示例)
- [多平台消息转发](#多平台消息转发)

---

## 飞书示例

### 基本消息接收

```typescript
import { LarkIntegration } from '../src/gateway/platforms/lark';

const lark = new LarkIntegration(
  {
    appId: process.env.LARK_APP_ID!,
    appSecret: process.env.LARK_APP_SECRET!,
  },
  agentRuntime
);

// 在 Express 中使用
app.use('/lark', lark.getRouter());
```

### 发送消息

```typescript
// 发送文本消息
await lark.sendMessage('chat_id_xxx', '你好，这是测试消息');

// 发送 Markdown 消息
await lark.sendMessage(
  'chat_id_xxx', 
  '**粗体文字**\n- 列表项1\n- 列表项2',
  'markdown'
);
```

### 处理群聊 @提及

```typescript
// 在 handleMessage 中自动处理
// 飞书会将 @机器人 的消息推送到 webhook
// 代码会自动解析并回复到群聊
```

---

## Telegram 示例

### 基本使用

```typescript
import { TelegramIntegration } from '../src/gateway/platforms/telegram';

const telegram = new TelegramIntegration(
  {
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    allowedUserIds: [123456789], // 可选：限制用户
  },
  agentRuntime
);

// 启动
await telegram.start();
```

### 发送消息

```typescript
// 发送到特定 chat
await telegram.sendMessage(123456789, '你好！这是来自 Chubao AI 的消息');

// 使用 Markdown 格式
await telegram.sendMessage(
  123456789,
  '*粗体* _斜体_ `代码` [链接](https://example.com)'
);
```

### 自定义命令处理

```typescript
// 在 TelegramIntegration 类中添加自定义命令
this.bot.command('custom', async (ctx) => {
  await ctx.reply('这是自定义命令的回复');
});
```

---

## WhatsApp 示例

### 基本使用

```typescript
import { WhatsAppIntegration } from '../src/gateway/platforms/whatsapp';

const whatsapp = new WhatsAppIntegration(
  {
    sessionName: 'my-bot',
    headless: true,
  },
  agentRuntime
);

// 设置授权号码
whatsapp.setAuthorizedNumbers(['86138xxxxxxxx', '86139xxxxxxxx']);

// 初始化
await whatsapp.init();

// 监听事件
whatsapp.on('qr', (qr) => {
  console.log('扫描二维码:', qr);
});

whatsapp.on('ready', () => {
  console.log('WhatsApp 已就绪');
});
```

### 发送消息

```typescript
// 发送文本
await whatsapp.sendMessage('86138xxxxxxxx', '你好！');

// 发送图片
await whatsapp.sendImage(
  '86138xxxxxxxx',
  '/path/to/image.png',
  '这是图片说明'
);
```

### 检查状态

```typescript
const status = whatsapp.getStatus();
console.log('就绪:', status.ready);
console.log('需要扫码:', status.qrCode !== null);
```

---

## 多平台消息转发

### 场景：将飞书消息转发到 Telegram

```typescript
import { LarkIntegration } from './gateway/platforms/lark';
import { TelegramIntegration } from './gateway/platforms/telegram';

// 初始化两个平台
const lark = new LarkIntegration(larkConfig, agentRuntime);
const telegram = new TelegramIntegration(telegramConfig, agentRuntime);

// 自定义 Lark 消息处理
class CustomLarkIntegration extends LarkIntegration {
  async handleMessage(event: any): Promise<void> {
    // 先执行原处理
    await super.handleMessage(event);
    
    // 转发到 Telegram
    const message = event.message;
    const content = JSON.parse(message.content).text;
    
    await telegram.sendMessage(
      process.env.TELEGRAM_ADMIN_CHAT_ID!,
      `📨 飞书消息转发\n来自: ${event.sender.sender_id.open_id}\n内容: ${content}`
    );
  }
}
```

### 场景：群发消息到所有平台

```typescript
async function broadcastMessage(message: string) {
  const results = await Promise.allSettled([
    // 发送到 Telegram
    telegram.sendMessage(process.env.TELEGRAM_CHAT_ID!, message),
    
    // 发送到飞书
    lark.sendMessage(process.env.LARK_CHAT_ID!, message),
    
    // 发送到 WhatsApp
    whatsapp.sendMessage(process.env.WHATSAPP_NUMBER!, message),
  ]);
  
  results.forEach((result, index) => {
    const platforms = ['Telegram', 'Lark', 'WhatsApp'];
    if (result.status === 'fulfilled') {
      console.log(`✅ ${platforms[index]} 发送成功`);
    } else {
      console.error(`❌ ${platforms[index]} 发送失败:`, result.reason);
    }
  });
}

// 使用
await broadcastMessage('这是一条群发消息！');
```

---

## 高级示例

### 消息队列处理

```typescript
class MessageQueue {
  private queue: Array<() => Promise<void>> = [];
  private processing = false;

  async add(task: () => Promise<void>) {
    this.queue.push(task);
    if (!this.processing) {
      await this.process();
    }
  }

  private async process() {
    this.processing = true;
    
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        try {
          await task();
          await new Promise(r => setTimeout(r, 100)); // 限速
        } catch (error) {
          console.error('任务执行失败:', error);
        }
      }
    }
    
    this.processing = false;
  }
}

// 使用
const queue = new MessageQueue();

// 添加到队列
queue.add(() => telegram.sendMessage(chatId, '消息1'));
queue.add(() => telegram.sendMessage(chatId, '消息2'));
```

### 消息过滤和审核

```typescript
class FilteredWhatsApp extends WhatsAppIntegration {
  private bannedWords = ['spam', '广告', '诈骗'];

  async handleMessage(msg: any): Promise<void> {
    const text = msg.body?.toLowerCase() || '';
    
    // 检查敏感词
    if (this.bannedWords.some(word => text.includes(word))) {
      await msg.reply('⚠️ 消息包含敏感内容，已被过滤');
      return;
    }

    // 继续正常处理
    await super.handleMessage(msg);
  }
}
```

### 定时任务示例

```typescript
import { CronJob } from 'cron';

// 每天早上 9 点发送状态报告
const statusJob = new CronJob('0 9 * * *', async () => {
  const status = `
📊 每日状态报告
时间: ${new Date().toLocaleString()}
WhatsApp: ${whatsapp.getStatus().ready ? '✅' : '❌'}
内存使用: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB
  `;

  await telegram.sendMessage(adminChatId, status);
});

statusJob.start();
```

---

## 完整工作流示例

### 智能客服工作流

```typescript
// 工作流：用户咨询 → AI 回复 → 满意度调查

class CustomerServiceFlow {
  async handleInquiry(platform: string, userId: string, message: string) {
    // 1. 记录会话开始
    console.log(`[${platform}] 用户 ${userId} 咨询: ${message}`);
    
    // 2. AI 生成回复
    const response = await agentRuntime.chat(message, `${platform}_${userId}`);
    
    // 3. 发送回复
    await this.sendToPlatform(platform, userId, response);
    
    // 4. 延迟发送满意度调查
    setTimeout(async () => {
      await this.sendToPlatform(
        platform, 
        userId,
        '请问刚才的回复是否解决了您的问题？\n1. ✅ 已解决\n2. ❌ 未解决'
      );
    }, 30000); // 30 秒后
  }

  private async sendToPlatform(platform: string, userId: string, message: string) {
    switch (platform) {
      case 'telegram':
        await telegram.sendMessage(parseInt(userId), message);
        break;
      case 'lark':
        await lark.sendMessage(userId, message);
        break;
      case 'whatsapp':
        await whatsapp.sendMessage(userId, message);
        break;
    }
  }
}
```

---

*示例代码仅供参考，请根据实际需求调整*

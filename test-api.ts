// 测试 OpenAI 兼容 API 连接
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: 'sk-87956943ece17f491d7e62699d754532b94c4d13ab85c5481bc42f55ccd6aeaa',
  baseURL: 'https://gmn.chuangzuoli.com/v1',
});

async function testConnection() {
  try {
    console.log('正在测试 API 连接...');
    
    const response = await openai.chat.completions.create({
      model: 'gpt-5.2-codex',
      messages: [
        { role: 'user', content: 'Hello, this is a test message' }
      ],
      max_tokens: 50
    });
    
    console.log('✅ 连接成功!');
    console.log('模型响应:', response.choices[0].message.content);
    console.log('使用的模型:', response.model);
    console.log('Token 使用量:', response.usage);
    
  } catch (error) {
    console.error('❌ 连接失败:', error.message);
    if (error.response) {
      console.error('错误详情:', error.response.data);
    }
  }
}

testConnection();

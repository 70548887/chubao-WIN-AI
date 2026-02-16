const { OpenAI } = require('openai');

// 配置 OpenAI 客户端
const openai = new OpenAI({
  apiKey: 'sk-87956943ece17f491d7e62699d754532b94c4d13ab85c5481bc42f55ccd6aeaa',
  baseURL: 'https://gmn.chuangzuoli.com/v1',
});

async function testAPI() {
  try {
    console.log('🔄 正在测试 API 连接...\n');
    
    const response = await openai.chat.completions.create({
      model: 'gpt-5.2-codex',
      messages: [
        { role: 'user', content: 'Hello, 请用一句话介绍你自己' }
      ],
      max_tokens: 50
    });
    
    console.log('✅ API 连接成功!\n');
    console.log('📝 响应内容:');
    console.log(response.choices[0].message.content);
    console.log('\n📊 使用统计:');
    console.log(`模型: ${response.model}`);
    console.log(`总 Token: ${response.usage?.total_tokens || 'N/A'}`);
    
  } catch (error) {
    console.error('❌ API 连接失败!\n');
    console.error('错误信息:', error.message);
    if (error.response) {
      console.error('响应状态:', error.response.status);
      console.error('响应数据:', error.response.data);
    }
  }
}

testAPI();

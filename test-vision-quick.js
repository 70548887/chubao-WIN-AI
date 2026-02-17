// Phase 3 Vision 简化测试 - 只测试截图功能
import http from 'http';

const request = (path, method = 'GET', body = null) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 3100,
      path,
      method,
      headers: body ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify(body))
      } : {}
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
};

async function testVisionQuick() {
  console.log('\n🧪 Phase 3 Vision 快速验证\n');

  // Test 1: 健康检查
  console.log('📌 Test 1: 健康检查');
  try {
    const health = await request('/health');
    console.log('✅ Backend 在线:', health.status);
  } catch (error) {
    console.log('❌ Backend 不可用:', error.message);
    return;
  }

  // Test 2: 截图测试（简单）
  console.log('\n📌 Test 2: 截图工具测试');
  try {
    const response = await request('/api/chat', 'POST', {
      message: '请截一张屏幕截图',
      sessionId: 'test-screenshot-' + Date.now()
    });
    
    console.log('📸 响应类型:', typeof response);
    console.log('📸 响应内容:', JSON.stringify(response).substring(0, 200));
    
    if (response.success && response.response) {
      console.log('✅ 截图工具执行成功');
      console.log('   响应:', response.response.substring(0, 150));
    } else if (response.response) {
      console.log('⚠️  收到响应:', response.response.substring(0, 150));
    } else {
      console.log('❌ 未能正确执行:', JSON.stringify(response).substring(0, 200));
    }
  } catch (error) {
    console.log('❌ 测试失败:', error.message);
  }

  console.log('\n✨ 快速验证完成！');
}

testVisionQuick().catch(console.error);

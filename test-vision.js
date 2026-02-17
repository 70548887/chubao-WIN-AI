// Phase 3 Vision 集成测试
// 测试场景：Agent 截图 → Claude Vision 分析 → 返回描述

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

async function testVision() {
  console.log('\n🧪 Phase 3 Vision 集成测试\n');

  // Test 1: 健康检查
  console.log('📌 Test 1: 健康检查');
  try {
    const health = await request('/health');
    console.log('✅ Backend 健康:', health);
  } catch (error) {
    console.log('❌ Backend 不可用:', error.message);
    return;
  }

  // Test 2: 截图工具验证（通过 Agent）
  console.log('\n📌 Test 2: 通过 Agent 调用截图工具');
  try {
    const response = await request('/api/chat', 'POST', {
      message: '请截一张屏幕截图',
      sessionId: 'test-vision-' + Date.now()
    });
    
    console.log('📸 Agent 响应:', response.response || response.error || JSON.stringify(response));
    
    if (response.response && response.response.includes('Screenshot')) {
      console.log('✅ 截图工具调用成功');
    } else {
      console.log('⚠️ 截图工具可能未正确触发');
    }
  } catch (error) {
    console.log('❌ 截图测试失败:', error.message);
  }

  // Test 3: Vision 视觉理解（截图 + 分析）
  console.log('\n📌 Test 3: Vision 视觉理解测试');
  try {
    const response = await request('/api/chat', 'POST', {
      message: '请截图并告诉我屏幕上有什么内容',
      sessionId: 'test-vision-analyze-' + Date.now()
    });
    
    console.log('🔍 Vision 分析响应:', response.response || response.error || JSON.stringify(response));
    
    if (response.response) {
      const hasVisionKeywords = 
        response.response.includes('屏幕') ||
        response.response.includes('窗口') ||
        response.response.includes('显示') ||
        response.response.includes('内容') ||
        response.response.includes('界面') ||
        response.response.includes('图片') ||
        response.response.includes('截图');
      
      if (hasVisionKeywords) {
        console.log('✅ Claude Vision 视觉理解成功');
      } else {
        console.log('⚠️ 响应中未包含视觉描述关键词');
      }
    }
  } catch (error) {
    console.log('❌ Vision 测试失败:', error.message);
  }

  // Test 4: 坐标映射验证
  console.log('\n📌 Test 4: 坐标映射验证');
  try {
    const response = await request('/api/chat', 'POST', {
      message: '截图后，点击屏幕中心位置（使用模型坐标 512, 384）',
      sessionId: 'test-vision-coord-' + Date.now()
    });
    
    console.log('📍 坐标映射响应:', response.response || response.error || JSON.stringify(response));
    
    if (response.response && response.response.includes('click')) {
      console.log('✅ 坐标映射功能正常');
    } else {
      console.log('⚠️ 坐标映射可能未触发');
    }
  } catch (error) {
    console.log('❌ 坐标映射测试失败:', error.message);
  }

  console.log('\n✨ Phase 3 测试完成！');
}

testVision().catch(console.error);

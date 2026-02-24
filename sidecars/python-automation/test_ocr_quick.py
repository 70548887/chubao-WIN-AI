"""
Local_AI_OCR 快速测试 - 模型已加载
"""
import time
import base64
import requests
from gui_control import GuiController

print('=== Local_AI_OCR 快速测试 ===')
print('模型已加载，测试 OCR 识别速度...\n')

# 1. 截图
print('1. 截图...')
gui = GuiController()
screenshot = gui.screenshot()
print(f'   截图: {screenshot["path"]}')

# 2. 转换为 base64
print('2. 编码图片...')
with open(screenshot['path'], 'rb') as f:
    image_base64 = base64.b64encode(f.read()).decode('utf-8')
print(f'   大小: {len(image_base64)} 字符')

# 3. 调用 OCR
print('3. OCR 识别...')
start = time.time()

try:
    response = requests.post(
        'http://localhost:11434/api/generate',
        json={
            'model': 'deepseek-ocr:3b',
            'prompt': '识别图片中的所有文字：',
            'images': [image_base64],
            'stream': False
        },
        timeout=180  # CPU 模式需要更长时间
    )
    
    elapsed = time.time() - start
    
    if response.status_code == 200:
        result = response.json()
        text = result.get('response', '')
        print(f'\n   ✅ 成功！耗时: {elapsed:.2f}秒')
        print(f'   识别文字数: {len(text)} 字符')
        print(f'\n   识别结果:')
        print(f'   {text[:500]}...')
    else:
        print(f'   ❌ 失败: {response.status_code}')
        print(f'   {response.text[:200]}')
        
except Exception as e:
    elapsed = time.time() - start
    print(f'   ❌ 错误: {e}')
    print(f'   耗时: {elapsed:.2f}秒')

print('\n=== 测试完成 ===')

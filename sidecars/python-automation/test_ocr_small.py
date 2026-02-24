"""
Local_AI_OCR 小图测试 - 使用更小的图片
"""
import time
import base64
import requests
from PIL import Image
import io

print('=== Local_AI_OCR 小图测试 ===')
print('使用压缩后的图片进行测试...\n')

# 1. 截图并压缩
print('1. 截图并压缩...')
from gui_control import GuiController
gui = GuiController()
screenshot = gui.screenshot()

# 压缩图片
img = Image.open(screenshot['path'])
img = img.resize((640, 360))  # 缩小到 640x360
buffer = io.BytesIO()
img.save(buffer, format='JPEG', quality=50)
image_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')

print(f'   原始: {screenshot["path"]}')
print(f'   压缩后: {len(image_base64)} 字符')

# 2. 调用 OCR
print('2. OCR 识别...')
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
        timeout=600  # 10分钟超时，先验证功能
    )
    
    elapsed = time.time() - start
    
    if response.status_code == 200:
        result = response.json()
        text = result.get('response', '')
        print(f'\n   ✅ 成功！耗时: {elapsed:.2f}秒')
        print(f'   识别文字数: {len(text)} 字符')
        print(f'\n   识别结果:')
        print(f'   {text[:800]}...')
    else:
        print(f'   ❌ 失败: {response.status_code}')
        print(f'   {response.text[:200]}')
        
except Exception as e:
    elapsed = time.time() - start
    print(f'   ❌ 错误: {e}')
    print(f'   耗时: {elapsed:.2f}秒')

print('\n=== 测试完成 ===')

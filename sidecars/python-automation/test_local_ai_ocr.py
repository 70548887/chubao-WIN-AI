"""
Local_AI_OCR 测试脚本 - 通过 Ollama API 调用
"""
import time
import base64
from gui_control import GuiController

print('=== Local_AI_OCR 测试开始 ===')

# 1. 截图
print('1. 截图测试...')
gui = GuiController()
screenshot = gui.screenshot()
print(f'   ✓ 截图路径: {screenshot["path"]}')

# 2. 读取图片并转换为 base64
print('2. 读取图片...')
with open(screenshot['path'], 'rb') as f:
    image_base64 = base64.b64encode(f.read()).decode('utf-8')
print(f'   ✓ 图片大小: {len(image_base64)} 字符')

# 3. 调用 Ollama API 进行 OCR
print('3. 调用 Local_AI_OCR (DeepSeek-OCR)...')
print('   等待模型加载（首次可能需要 30-60 秒）...')

import requests

start_time = time.time()
try:
    response = requests.post(
        'http://localhost:11434/api/generate',
        json={
            'model': 'deepseek-ocr:3b',
            'prompt': '识别这张图片中的所有文字，保持原有格式：',
            'images': [image_base64],
            'stream': False
        },
        timeout=300  # 增加到5分钟，首次加载模型需要较长时间
    )
    
    elapsed = time.time() - start_time
    
    if response.status_code == 200:
        result = response.json()
        text = result.get('response', '')
        print(f'   ✅ OCR 成功！耗时: {elapsed:.2f}秒')
        print(f'   识别文字数: {len(text)} 字符')
        print(f'\n   识别结果预览（前200字符）:')
        print(f'   {text[:200]}...')
        print(f'\n   完整结果:')
        print(f'   {text}')
    else:
        print(f'   ❌ 请求失败: {response.status_code}')
        print(f'   {response.text}')
        
except Exception as e:
    elapsed = time.time() - start_time
    print(f'   ❌ OCR 失败: {e}')
    print(f'   耗时: {elapsed:.2f}秒')

print('\n=== 测试结束 ===')

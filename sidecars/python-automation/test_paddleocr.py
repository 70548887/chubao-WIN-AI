"""
PaddleOCR 性能测试脚本
"""
import time
from ocr_service import OcrService
from gui_control import GuiController

print('=== PaddleOCR 测试开始 ===')
print('1. 导入模块... ✓')

print('2. 创建服务实例...')
ocr = OcrService()
gui = GuiController()
print('   ✓ 服务实例创建成功')

print('3. 截图测试...')
screenshot = gui.screenshot()
print(f'   ✓ 截图路径: {screenshot["path"]}')

print('4. 初始化 OCR（可能需要 1-5 分钟）...')
start_init = time.time()
try:
    text = ocr.extract_text_only(screenshot['path'])
    init_time = time.time() - start_init
    print(f'   ✅ 初始化成功，耗时: {init_time:.2f}秒')
    print(f'   识别文字数: {len(text)} 字符')
    print(f'   前100字符预览:')
    print(f'   {text[:100]}...')
    print(f'\n   完整文字:')
    print(f'   {text}')
except Exception as e:
    init_time = time.time() - start_init
    print(f'   ❌ 初始化失败: {e}')
    print(f'   失败前耗时: {init_time:.2f}秒')

print('\n=== 测试结束 ===')

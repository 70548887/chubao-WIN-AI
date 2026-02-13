"""
Chubao AI - Python 自动化服务入口
提供 GUI 控制和 OCR 识别能力
"""

import os
import sys
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from gui_control import GuiController
from ocr_service import OcrService

load_dotenv()

app = Flask(__name__)
CORS(app)

# 初始化服务
gui = GuiController()
ocr = OcrService()

PORT = int(os.getenv('PYTHON_PORT', '3200'))


@app.route('/health', methods=['GET'])
def health():
    """健康检查"""
    return jsonify({
        'status': 'ok',
        'service': 'python-automation',
        'capabilities': ['gui', 'ocr', 'screenshot']
    })


@app.route('/api/windows', methods=['GET'])
def list_windows():
    """获取所有窗口列表"""
    try:
        windows = gui.list_windows()
        return jsonify({'success': True, 'windows': windows})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/window/controls', methods=['POST'])
def get_controls():
    """获取窗口的控件信息"""
    try:
        data = request.json
        title = data.get('title')
        controls = gui.get_controls(title)
        return jsonify({'success': True, 'controls': controls})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/click', methods=['POST'])
def click():
    """点击操作"""
    try:
        data = request.json
        result = gui.click(
            x=data.get('x'),
            y=data.get('y'),
            target=data.get('target'),
            window_title=data.get('window_title')
        )
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/type', methods=['POST'])
def type_text():
    """输入文字"""
    try:
        data = request.json
        result = gui.type_text(
            text=data.get('text'),
            target=data.get('target'),
            window_title=data.get('window_title')
        )
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/menu', methods=['POST'])
def menu_select():
    """菜单操作"""
    try:
        data = request.json
        result = gui.menu_select(
            menu_path=data.get('menu_path'),
            window_title=data.get('window_title')
        )
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/screenshot', methods=['POST'])
def screenshot():
    """截图"""
    try:
        data = request.json or {}
        result = gui.screenshot(
            region=data.get('region'),
            window_title=data.get('window_title'),
            save_path=data.get('save_path')
        )
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/ocr', methods=['POST'])
def ocr_recognize():
    """OCR 文字识别"""
    try:
        data = request.json
        image_path = data.get('image_path')
        
        # 如果没有图片路径，先截图
        if not image_path:
            screenshot_result = gui.screenshot()
            image_path = screenshot_result.get('path')
        
        result = ocr.recognize(image_path)
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/ocr/find', methods=['POST'])
def ocr_find_text():
    """查找文字位置"""
    try:
        data = request.json
        text = data.get('text')
        image_path = data.get('image_path')
        
        if not image_path:
            screenshot_result = gui.screenshot()
            image_path = screenshot_result.get('path')
        
        result = ocr.find_text(image_path, text)
        return jsonify({'success': True, 'result': result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/ocr/click', methods=['POST'])
def ocr_click_text():
    """通过 OCR 找到文字并点击"""
    try:
        data = request.json
        text = data.get('text')
        
        # 截图
        screenshot_result = gui.screenshot()
        image_path = screenshot_result.get('path')
        
        # 查找文字
        find_result = ocr.find_text(image_path, text)
        if not find_result.get('found'):
            return jsonify({'success': False, 'error': f'未找到文字: {text}'})
        
        # 点击
        x, y = find_result['center']
        gui.click(x=x, y=y)
        
        return jsonify({'success': True, 'result': {'clicked': text, 'position': [x, y]}})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


if __name__ == '__main__':
    print(f'🐍 Python 自动化服务启动: http://localhost:{PORT}')
    app.run(host='127.0.0.1', port=PORT, debug=False)

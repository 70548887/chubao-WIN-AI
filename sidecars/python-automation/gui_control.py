"""
GUI 控制模块 - 基于 pywinauto + pyautogui
"""

import time
from typing import Optional, Dict, List, Any
import pyautogui
from pywinauto import Application, Desktop
from pywinauto.findwindows import ElementNotFoundError


class GuiController:
    """Windows GUI 控制器"""
    
    def __init__(self):
        # 设置 pyautogui 安全措施
        pyautogui.FAILSAFE = True
        pyautogui.PAUSE = 0.1
        
        self.screenshot_dir = './screenshots'
    
    def list_windows(self) -> List[Dict[str, Any]]:
        """获取所有可见窗口列表"""
        windows = []
        desktop = Desktop(backend='uia')
        
        for win in desktop.windows():
            try:
                if win.is_visible() and win.window_text():
                    windows.append({
                        'title': win.window_text(),
                        'class_name': win.class_name(),
                        'rectangle': {
                            'left': win.rectangle().left,
                            'top': win.rectangle().top,
                            'right': win.rectangle().right,
                            'bottom': win.rectangle().bottom
                        }
                    })
            except Exception:
                pass
        
        return windows
    
    def get_controls(self, window_title: str) -> List[Dict[str, Any]]:
        """获取窗口的所有控件"""
        try:
            app = Application(backend='uia').connect(title_re=f'.*{window_title}.*')
            window = app.window()
            
            controls = []
            for ctrl in window.descendants():
                try:
                    ctrl_info = {
                        'name': ctrl.window_text(),
                        'control_type': ctrl.element_info.control_type,
                        'class_name': ctrl.element_info.class_name,
                        'rectangle': {
                            'left': ctrl.rectangle().left,
                            'top': ctrl.rectangle().top,
                            'right': ctrl.rectangle().right,
                            'bottom': ctrl.rectangle().bottom
                        }
                    }
                    if ctrl_info['name']:  # 只返回有名称的控件
                        controls.append(ctrl_info)
                except Exception:
                    pass
            
            return controls
        except ElementNotFoundError:
            raise Exception(f'未找到窗口: {window_title}')
    
    def click(self, x: Optional[int] = None, y: Optional[int] = None,
              target: Optional[str] = None, window_title: Optional[str] = None) -> Dict[str, Any]:
        """点击操作"""
        
        if x is not None and y is not None:
            # 坐标点击
            pyautogui.click(x, y)
            return {'action': 'click', 'position': [x, y]}
        
        if target and window_title:
            # 通过控件名称点击
            try:
                app = Application(backend='uia').connect(title_re=f'.*{window_title}.*')
                window = app.window()
                ctrl = window.child_window(title_re=f'.*{target}.*')
                ctrl.click_input()
                return {'action': 'click', 'target': target}
            except ElementNotFoundError:
                raise Exception(f'未找到控件: {target}')
        
        raise ValueError('需要提供坐标 (x, y) 或控件名称 (target, window_title)')
    
    def type_text(self, text: str, target: Optional[str] = None,
                  window_title: Optional[str] = None) -> Dict[str, Any]:
        """输入文字"""
        
        if target and window_title:
            # 在指定控件输入
            try:
                app = Application(backend='uia').connect(title_re=f'.*{window_title}.*')
                window = app.window()
                ctrl = window.child_window(title_re=f'.*{target}.*')
                ctrl.type_keys(text, with_spaces=True)
                return {'action': 'type', 'target': target, 'text': text}
            except ElementNotFoundError:
                raise Exception(f'未找到控件: {target}')
        else:
            # 直接输入 (当前焦点)
            pyautogui.typewrite(text, interval=0.05)
            return {'action': 'type', 'text': text}
    
    def menu_select(self, menu_path: str, window_title: str) -> Dict[str, Any]:
        """菜单操作 (如: "File->Save")"""
        try:
            app = Application(backend='uia').connect(title_re=f'.*{window_title}.*')
            window = app.window()
            window.menu_select(menu_path)
            return {'action': 'menu_select', 'path': menu_path}
        except ElementNotFoundError:
            raise Exception(f'未找到窗口: {window_title}')
        except Exception as e:
            raise Exception(f'菜单操作失败: {str(e)}')
    
    def screenshot(self, region: Optional[Dict] = None,
                   window_title: Optional[str] = None,
                   save_path: Optional[str] = None) -> Dict[str, Any]:
        """截图"""
        import os
        from datetime import datetime
        
        # 确保截图目录存在
        os.makedirs(self.screenshot_dir, exist_ok=True)
        
        # 生成文件名
        if not save_path:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            save_path = os.path.join(self.screenshot_dir, f'screenshot_{timestamp}.png')
        
        if window_title:
            # 截取指定窗口
            try:
                app = Application(backend='uia').connect(title_re=f'.*{window_title}.*')
                window = app.window()
                rect = window.rectangle()
                image = pyautogui.screenshot(region=(rect.left, rect.top, 
                                                     rect.width(), rect.height()))
            except ElementNotFoundError:
                raise Exception(f'未找到窗口: {window_title}')
        elif region:
            # 截取指定区域
            image = pyautogui.screenshot(region=(
                region.get('left', 0),
                region.get('top', 0),
                region.get('width', 100),
                region.get('height', 100)
            ))
        else:
            # 截取全屏
            image = pyautogui.screenshot()
        
        image.save(save_path)
        
        return {
            'action': 'screenshot',
            'path': save_path,
            'size': [image.width, image.height]
        }
    
    def hotkey(self, *keys: str) -> Dict[str, Any]:
        """快捷键"""
        pyautogui.hotkey(*keys)
        return {'action': 'hotkey', 'keys': list(keys)}
    
    def scroll(self, clicks: int, x: Optional[int] = None, 
               y: Optional[int] = None) -> Dict[str, Any]:
        """滚动"""
        if x is not None and y is not None:
            pyautogui.scroll(clicks, x, y)
        else:
            pyautogui.scroll(clicks)
        return {'action': 'scroll', 'clicks': clicks}

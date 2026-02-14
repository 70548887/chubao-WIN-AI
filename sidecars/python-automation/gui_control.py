"""
GUI control module based on pywinauto + pyautogui.
"""

from typing import Optional, Dict, List, Any
import pyautogui
from pywinauto import Application, Desktop
from pywinauto.findwindows import ElementNotFoundError


class GuiController:
    """Windows GUI controller."""

    def __init__(self):
        pyautogui.FAILSAFE = True
        pyautogui.PAUSE = 0.1
        self.screenshot_dir = './screenshots'

    def list_windows(self) -> List[Dict[str, Any]]:
        """Get all visible windows."""
        windows = []
        desktop = Desktop(backend='uia')

        for win in desktop.windows():
            try:
                if win.is_visible() and win.window_text():
                    windows.append(
                        {
                            'title': win.window_text(),
                            'class_name': win.class_name(),
                            'rectangle': {
                                'left': win.rectangle().left,
                                'top': win.rectangle().top,
                                'right': win.rectangle().right,
                                'bottom': win.rectangle().bottom,
                            },
                        }
                    )
            except Exception:
                pass

        return windows

    def get_controls(self, window_title: str) -> List[Dict[str, Any]]:
        """Get all controls from a window."""
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
                            'bottom': ctrl.rectangle().bottom,
                        },
                    }
                    if ctrl_info['name']:
                        controls.append(ctrl_info)
                except Exception:
                    pass

            return controls
        except ElementNotFoundError:
            raise Exception(f'Window not found: {window_title}')

    def click(
        self,
        x: Optional[int] = None,
        y: Optional[int] = None,
        target: Optional[str] = None,
        window_title: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Click by coordinates or control target."""
        if x is not None and y is not None:
            pyautogui.click(x, y)
            return {'action': 'click', 'position': [x, y]}

        if target and window_title:
            try:
                app = Application(backend='uia').connect(title_re=f'.*{window_title}.*')
                window = app.window()
                ctrl = window.child_window(title_re=f'.*{target}.*')
                ctrl.click_input()
                return {'action': 'click', 'target': target}
            except ElementNotFoundError:
                raise Exception(f'Control not found: {target}')

        raise ValueError('either (x, y) or (target, window_title) is required')

    def type_text(
        self,
        text: str,
        target: Optional[str] = None,
        window_title: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Type text to target control or focused element."""
        if target and window_title:
            try:
                app = Application(backend='uia').connect(title_re=f'.*{window_title}.*')
                window = app.window()
                ctrl = window.child_window(title_re=f'.*{target}.*')
                ctrl.type_keys(text, with_spaces=True)
                return {'action': 'type', 'target': target, 'text': text}
            except ElementNotFoundError:
                raise Exception(f'Control not found: {target}')

        pyautogui.typewrite(text, interval=0.05)
        return {'action': 'type', 'text': text}

    def menu_select(self, menu_path: str, window_title: str) -> Dict[str, Any]:
        """Select menu path on target window."""
        try:
            app = Application(backend='uia').connect(title_re=f'.*{window_title}.*')
            window = app.window()
            window.menu_select(menu_path)
            return {'action': 'menu_select', 'path': menu_path}
        except ElementNotFoundError:
            raise Exception(f'Window not found: {window_title}')
        except Exception as e:
            raise Exception(f'Menu operation failed: {str(e)}')

    def screenshot(
        self,
        region: Optional[Dict] = None,
        window_title: Optional[str] = None,
        save_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Take screenshot for full screen, region, or window."""
        import os
        from datetime import datetime

        os.makedirs(self.screenshot_dir, exist_ok=True)

        if not save_path:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            save_path = os.path.join(self.screenshot_dir, f'screenshot_{timestamp}.png')

        if window_title:
            try:
                app = Application(backend='uia').connect(title_re=f'.*{window_title}.*')
                window = app.window()
                rect = window.rectangle()
                image = pyautogui.screenshot(
                    region=(rect.left, rect.top, rect.width(), rect.height())
                )
            except ElementNotFoundError:
                raise Exception(f'Window not found: {window_title}')
        elif region:
            image = pyautogui.screenshot(
                region=(
                    region.get('left', 0),
                    region.get('top', 0),
                    region.get('width', 100),
                    region.get('height', 100),
                )
            )
        else:
            image = pyautogui.screenshot()

        image.save(save_path)

        return {
            'action': 'screenshot',
            'path': save_path,
            'size': [image.width, image.height],
        }

    def hotkey(self, *keys: str) -> Dict[str, Any]:
        """Press hotkey combination."""
        pyautogui.hotkey(*keys)
        return {'action': 'hotkey', 'keys': list(keys)}

    def right_click(self, x: int, y: int) -> Dict[str, Any]:
        """Right click."""
        pyautogui.rightClick(x, y)
        return {'action': 'right_click', 'position': [x, y]}

    def double_click(self, x: int, y: int, interval: float = 0.1) -> Dict[str, Any]:
        """Double click."""
        safe_interval = max(0.0, interval)
        pyautogui.doubleClick(x, y, interval=safe_interval)
        return {'action': 'double_click', 'position': [x, y], 'interval': safe_interval}

    def hover(self, x: int, y: int, duration: float = 0.0) -> Dict[str, Any]:
        """Move cursor to coordinates."""
        move_duration = max(0.0, duration)
        pyautogui.moveTo(x, y, duration=move_duration)
        return {'action': 'hover', 'position': [x, y], 'duration': move_duration}

    def drag(
        self,
        start_x: int,
        start_y: int,
        end_x: int,
        end_y: int,
        duration: float = 0.2,
        button: str = 'left',
    ) -> Dict[str, Any]:
        """Drag cursor from start point to end point."""
        drag_duration = max(0.0, duration)
        button_name = (button or 'left').lower()
        if button_name not in ['left', 'right', 'middle']:
            raise ValueError('button must be one of: left, right, middle')

        pyautogui.moveTo(start_x, start_y)
        pyautogui.dragTo(end_x, end_y, duration=drag_duration, button=button_name)
        return {
            'action': 'drag',
            'from': [start_x, start_y],
            'to': [end_x, end_y],
            'duration': drag_duration,
            'button': button_name,
        }

    def scroll(self, clicks: int, x: Optional[int] = None, y: Optional[int] = None) -> Dict[str, Any]:
        """Scroll mouse wheel."""
        if x is not None and y is not None:
            pyautogui.scroll(clicks, x, y)
        else:
            pyautogui.scroll(clicks)
        return {'action': 'scroll', 'clicks': clicks}

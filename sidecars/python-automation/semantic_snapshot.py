"""
Windows 语义快照 - 类似 OpenClaw 的 a11y tree 实现
使用 Windows UI Automation (UIA) API
"""
import comtypes.client
import win32gui
from typing import Dict, List, Optional, Any
import json


class SemanticSnapshot:
    """Windows 语义快照捕获器"""
    
    def __init__(self):
        self.snapshot_id = 0
        self.element_map = {}
        
    def get_active_window_snapshot(self) -> Dict[str, Any]:
        """获取当前活动窗口的语义快照"""
        hwnd = win32gui.GetForegroundWindow()
        return self.get_window_snapshot_by_handle(hwnd)
    
    def get_window_snapshot_by_title(self, title_pattern: str) -> Dict[str, Any]:
        """通过标题匹配获取窗口快照"""
        def callback(hwnd, extra):
            if win32gui.IsWindowVisible(hwnd):
                title = win32gui.GetWindowText(hwnd)
                if title_pattern.lower() in title.lower():
                    extra.append(hwnd)
            return True
        
        handles = []
        win32gui.EnumWindows(callback, handles)
        
        if handles:
            return self.get_window_snapshot_by_handle(handles[0])
        return None
    
    def get_window_snapshot_by_handle(self, hwnd: int) -> Dict[str, Any]:
        """通过句柄获取窗口快照"""
        try:
            # 使用 pywinauto 获取 UIA 信息
            from pywinauto import Desktop
            
            desktop = Desktop(backend="uia")
            window = desktop.window(handle=hwnd)
            
            # 构建语义树
            tree = self._build_semantic_tree(window)
            
            # 生成文本表示
            text_format = self._to_text_format(tree)
            
            return {
                "type": "semantic",
                "window_title": window.window_text(),
                "window_handle": hwnd,
                "tree": tree,
                "text": text_format,
                "element_count": len(self.element_map),
                "refs": self.element_map
            }
        except Exception as e:
            return {
                "type": "error",
                "error": str(e),
                "window_handle": hwnd
            }
    
    def _build_semantic_tree(self, element, depth: int = 0) -> Dict[str, Any]:
        """递归构建语义树"""
        self.snapshot_id += 1
        ref_id = self.snapshot_id
        
        try:
            info = element.element_info
            node = {
                "ref": ref_id,
                "type": str(info.control_type).replace("ControlType.", "").lower(),
                "name": info.name or "",
                "automation_id": info.automation_id or "",
                "class_name": info.class_name or "",
                "rectangle": {
                    "left": info.rectangle.left,
                    "top": info.rectangle.top,
                    "right": info.rectangle.right,
                    "bottom": info.rectangle.bottom
                } if info.rectangle else None,
                "enabled": info.enabled,
                "visible": info.visible,
                "children": [],
                "depth": depth
            }
            
            # 存储元素引用以便后续操作
            self.element_map[ref_id] = {
                "element": element,
                "info": node
            }
            
            # 递归处理子元素（限制深度）
            if depth < 8:  # 限制递归深度
                try:
                    children = element.children()
                    for child in children:
                        child_node = self._build_semantic_tree(child, depth + 1)
                        if child_node["name"] or child_node["children"]:
                            node["children"].append(child_node)
                except Exception:
                    pass
            
            return node
            
        except Exception as e:
            return {
                "ref": ref_id,
                "type": "unknown",
                "name": f"<error: {e}>",
                "children": [],
                "depth": depth
            }
    
    def _to_text_format(self, node: Dict[str, Any], indent: int = 0) -> str:
        """将语义树转换为文本格式（类似 OpenClaw）"""
        lines = []
        
        control_type = node.get("type", "unknown")
        name = node.get("name", "")
        ref = node.get("ref", 0)
        
        # 只显示有意义的元素
        if name or control_type in ["window", "pane", "document", "list"]:
            prefix = "  " * indent
            line = f"{prefix}- {control_type}"
            if name:
                line += f' "{name}"'
            line += f" [ref={ref}]"
            lines.append(line)
        
        # 处理子元素
        for child in node.get("children", []):
            child_lines = self._to_text_format(child, indent + 1)
            if child_lines:
                lines.append(child_lines)
        
        return "\n".join(lines) if lines else ""
    
    def find_element_by_ref(self, ref_id: int) -> Optional[Any]:
        """通过引用 ID 查找元素"""
        entry = self.element_map.get(ref_id)
        return entry["element"] if entry else None
    
    def click_by_ref(self, ref_id: int) -> bool:
        """通过引用 ID 点击元素"""
        element = self.find_element_by_ref(ref_id)
        if element:
            try:
                element.click()
                return True
            except Exception:
                pass
        return False
    
    def type_text_by_ref(self, ref_id: int, text: str) -> bool:
        """通过引用 ID 输入文本"""
        element = self.find_element_by_ref(ref_id)
        if element:
            try:
                element.type_keys(text, with_spaces=True)
                return True
            except Exception:
                pass
        return False


def get_ui_state(window_title: Optional[str] = None, 
                 prefer_semantic: bool = True) -> Dict[str, Any]:
    """
    智能获取 UI 状态：优先语义快照，失败时回退到截图
    
    Args:
        window_title: 窗口标题（可选）
        prefer_semantic: 是否优先使用语义快照
    
    Returns:
        UI 状态字典
    """
    snapshot = SemanticSnapshot()
    
    if prefer_semantic:
        try:
            if window_title:
                result = snapshot.get_window_snapshot_by_title(window_title)
            else:
                result = snapshot.get_active_window_snapshot()
            
            if result and result.get("type") == "semantic":
                # 检查是否有足够的信息
                if len(result.get("text", "")) > 50:
                    return result
        except Exception as e:
            print(f"[SemanticSnapshot] 失败: {e}")
    
    # 回退到截图方案
    print("[UIState] 回退到截图方案...")
    from gui_control import GuiController
    
    gui = GuiController()
    screenshot = gui.screenshot(window_title)
    
    return {
        "type": "screenshot",
        "path": screenshot["path"],
        "base64": screenshot.get("base64", ""),
        "refs": {}
    }


# 测试函数
if __name__ == "__main__":
    print("=== Windows 语义快照测试 ===")
    
    snapshot = SemanticSnapshot()
    result = snapshot.get_active_window_snapshot()
    
    if result["type"] == "semantic":
        print(f"\n窗口标题: {result['window_title']}")
        print(f"元素数量: {result['element_count']}")
        print(f"\n语义快照:\n")
        print(result["text"])
    else:
        print(f"获取失败: {result.get('error')}")

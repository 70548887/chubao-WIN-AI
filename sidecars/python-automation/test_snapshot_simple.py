import warnings
warnings.filterwarnings('ignore')
from semantic_snapshot import SemanticSnapshot

s = SemanticSnapshot()
r = s.get_active_window_snapshot()

print('=== 语义快照测试结果 ===')
print(f'窗口标题: {r.get("window_title", "N/A")}')
print(f'窗口句柄: {r.get("window_handle", "N/A")}')
print(f'快照类型: {r.get("type", "N/A")}')
print(f'元素数量: {r.get("element_count", 0)}')
print(f'文本长度: {len(r.get("text", ""))}')
print()
print('语义快照内容 (前1500字符):')
print('-' * 60)
text = r.get('text', '')
print(text[:1500])
if len(text) > 1500:
    print('...')
print('-' * 60)

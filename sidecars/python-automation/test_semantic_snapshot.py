"""
测试语义快照功能
"""
from semantic_snapshot import SemanticSnapshot, get_ui_state

print("=== Windows 语义快照测试 ===")
print("正在捕获当前活动窗口...\n")

# 方法1: 直接使用 SemanticSnapshot
snapshot = SemanticSnapshot()
result = snapshot.get_active_window_snapshot()

if result["type"] == "semantic":
    print(f"✅ 成功获取语义快照")
    print(f"窗口标题: {result['window_title']}")
    print(f"窗口句柄: {result['window_handle']}")
    print(f"元素数量: {result['element_count']}")
    print(f"\n语义快照文本表示:\n")
    print("-" * 60)
    print(result["text"][:2000])  # 只显示前2000字符
    if len(result["text"]) > 2000:
        print("\n... (已截断)")
    print("-" * 60)
    
    # 显示可交互元素
    print("\n可交互元素 (前10个):")
    interactive_types = ["button", "edit", "listitem", "menuitem", "hyperlink"]
    count = 0
    for ref_id, entry in result["refs"].items():
        info = entry["info"]
        if info["type"] in interactive_types and info["name"]:
            print(f"  [ref={ref_id}] {info['type']}: \"{info['name']}\"")
            count += 1
            if count >= 10:
                break
    
else:
    print(f"❌ 获取失败: {result.get('error')}")

print("\n=== 测试完成 ===")

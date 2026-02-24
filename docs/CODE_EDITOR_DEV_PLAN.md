# 代码编辑器开发计划

> 目标：集成 Monaco Editor，实现代码查看和编辑功能
> 创建时间：2026-02-17
> 预估工时：3 天

---

## 功能需求

### 核心功能
- 代码语法高亮（支持多语言）
- 代码编辑和保存
- 文件浏览器（项目文件树）
- 代码对比（Diff 视图）
- 快捷键支持

### 支持语言
- TypeScript/JavaScript
- Python
- JSON
- Markdown
- HTML/CSS
- PowerShell
- Rust

---

## 技术方案

### 1. Monaco Editor

使用 @monaco-editor/react 集成：

```typescript
import Editor from '@monaco-editor/react';

<Editor
  height="100%"
  language="typescript"
  value={code}
  onChange={setCode}
  theme={isDark ? 'vs-dark' : 'light'}
/>
```

### 2. 文件浏览器

使用递归组件渲染文件树：

```typescript
interface FileNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: FileNode[];
}
```

### 3. 文件操作

通过后端 API 读写文件：

```typescript
// 读取文件
GET /api/files/read?path=src/index.ts

// 保存文件
POST /api/files/write
{ path: 'src/index.ts', content: '...' }
```

---

## 开发步骤

### Phase 1: Monaco Editor 集成 (Day 1)

#### T1.1: 安装依赖
```bash
npm install @monaco-editor/react monaco-editor
```

#### T1.2: 创建编辑器组件
**文件**: `src/components/CodeEditor.tsx`

**功能**:
- Monaco Editor 封装
- 主题切换（跟随系统主题）
- 语言检测

### Phase 2: 文件浏览器 (Day 1-2)

#### T2.1: 创建文件树组件
**文件**: `src/components/FileTree.tsx`

**功能**:
- 递归渲染文件树
- 展开/折叠目录
- 选择文件

#### T2.2: 后端文件 API
**文件**: `sidecars/node-backend/src/api/files.ts`

**功能**:
- 列出目录
- 读取文件
- 写入文件

### Phase 3: 编辑器面板 (Day 2)

#### T3.1: 创建编辑器面板
**文件**: `src/components/EditorPanel.tsx`

**功能**:
- 文件浏览器 + 编辑器布局
- 打开多个文件（Tab）
- 保存文件

#### T3.2: 集成到主界面
**文件**: `src/App.tsx`

**改动**:
- 添加编辑器标签页
- 与 Chat 界面切换

### Phase 4: 增强功能 (Day 3)

#### T4.1: 代码对比
**文件**: `src/components/DiffEditor.tsx`

**功能**:
- 对比两个文件
- 显示差异

#### T4.2: 快捷键
**功能**:
- Ctrl+S 保存
- Ctrl+P 快速打开

---

## 文件变更清单

### 新增文件
- `src/components/CodeEditor.tsx` - 代码编辑器
- `src/components/FileTree.tsx` - 文件树
- `src/components/EditorPanel.tsx` - 编辑器面板
- `sidecars/node-backend/src/api/files.ts` - 文件 API

### 修改文件
- `src/App.tsx` - 添加编辑器入口
- `package.json` - 添加依赖

---

## 验收标准

### 功能验收
- [ ] 正确显示代码高亮
- [ ] 文件树正确渲染
- [ ] 文件可正常打开编辑
- [ ] 保存文件成功
- [ ] 主题切换正常

### 性能验收
- [ ] 大文件（>1MB）不卡顿
- [ ] 文件树加载 < 1s

---

## 下一步行动

1. ✅ 创建开发计划文档 (当前)
2. ⏳ 安装 Monaco Editor 依赖
3. ⏳ 创建编辑器组件

---

*文档版本: v1.0 | 最后更新: 2026-02-17*

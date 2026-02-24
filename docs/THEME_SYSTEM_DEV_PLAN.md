# 主题切换系统开发计划

> 目标：实现暗色/亮色/自动主题切换功能
> 创建时间：2026-02-17
> 预估工时：2 天

---

## 功能需求

### 核心功能
- 支持三种主题模式：亮色 (light)、暗色 (dark)、自动 (auto)
- 自动模式根据系统偏好自动切换
- 主题切换实时生效，无需刷新
- 主题偏好持久化保存

### 用户体验
- 设置面板提供主题切换选项
- 支持快捷键快速切换
- 切换时有平滑过渡动画

---

## 技术方案

### 1. CSS Variables 方案

使用 CSS 自定义属性（变量）定义主题颜色：

```css
:root {
  /* 亮色主题（默认） */
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --text-primary: #1a1a1a;
  --text-secondary: #666666;
  --border-color: #e0e0e0;
  --accent-color: #0066cc;
}

[data-theme="dark"] {
  /* 暗色主题 */
  --bg-primary: #1a1a1a;
  --bg-secondary: #2d2d2d;
  --text-primary: #ffffff;
  --text-secondary: #b0b0b0;
  --border-color: #404040;
  --accent-color: #4d9fff;
}
```

### 2. 状态管理

使用 React Context + useState 管理主题状态：

```typescript
interface ThemeContextType {
  theme: 'light' | 'dark' | 'auto';
  effectiveTheme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark' | 'auto') => void;
  toggleTheme: () => void;
}
```

### 3. 持久化存储

使用 localStorage 保存用户偏好：
- Key: `chubao-theme`
- Value: `'light' | 'dark' | 'auto'`

---

## 开发步骤

### Phase 1: 基础架构 (Day 1)

#### T1.1: 创建主题 CSS 变量
**文件**: `src/styles/theme.css`

**内容**:
- 定义完整的 CSS 变量系统
- 包含亮色和暗色两套变量
- 覆盖所有 UI 元素颜色

#### T1.2: 创建 ThemeContext
**文件**: `src/contexts/ThemeContext.tsx`

**功能**:
- 提供主题状态
- 处理自动模式逻辑
- 监听系统主题变化
- 持久化到 localStorage

#### T1.3: 创建主题切换组件
**文件**: `src/components/ThemeToggle.tsx`

**功能**:
- 下拉选择主题模式
- 显示当前主题图标
- 触发主题切换

### Phase 2: 应用集成 (Day 1-2)

#### T2.1: 替换硬编码颜色
**文件**: `src/styles/*.css`, `src/components/*.tsx`

**改动**:
- 将所有硬编码颜色替换为 CSS 变量
- 确保所有组件使用主题变量

#### T2.2: 集成到设置面板
**文件**: `src/components/SettingsPanel.tsx`

**改动**:
- 添加主题设置选项
- 集成 ThemeToggle 组件

#### T2.3: 添加快捷键支持
**文件**: `src/hooks/useThemeShortcut.ts`

**功能**:
- Ctrl/Cmd + Shift + L 切换主题
- 显示快捷键提示

### Phase 3: 优化完善 (Day 2)

#### T3.1: 添加过渡动画
**文件**: `src/styles/theme.css`

**内容**:
- 主题切换时颜色过渡动画
- 时长 300ms，ease 缓动

#### T3.2: 测试验证
**验收项**:
- [ ] 亮色主题正常显示
- [ ] 暗色主题正常显示
- [ ] 自动模式跟随系统
- [ ] 刷新后保持主题设置
- [ ] 快捷键切换有效

---

## 文件变更清单

### 新增文件
- `src/styles/theme.css` - 主题变量定义
- `src/contexts/ThemeContext.tsx` - 主题状态管理
- `src/components/ThemeToggle.tsx` - 主题切换组件
- `src/hooks/useThemeShortcut.ts` - 主题快捷键

### 修改文件
- `src/main.tsx` - 注入 ThemeProvider
- `src/styles/index.css` - 导入主题样式
- `src/components/SettingsPanel.tsx` - 添加主题设置
- `src/App.tsx` - 应用主题类名

---

## 验收标准

### 功能验收
- [ ] 三种主题模式可正常切换
- [ ] 自动模式正确响应系统主题变化
- [ ] 主题偏好持久化保存
- [ ] 快捷键 Ctrl+Shift+L 可切换主题

### 视觉验收
- [ ] 暗色主题无刺眼亮色元素
- [ ] 所有组件颜色协调一致
- [ ] 过渡动画平滑自然

### 代码验收
- [ ] 无 TypeScript 错误
- [ ] 无 CSS 语法错误
- [ ] 构建成功

---

## 依赖关系

```
T1.1 (CSS 变量)
    ↓
T1.2 (ThemeContext)
    ↓
T1.3 (ThemeToggle)
    ↓
T2.1 (替换颜色) ←→ T2.2 (设置面板)
    ↓
T2.3 (快捷键)
    ↓
T3.1 (动画) ←→ T3.2 (测试)
```

---

## 下一步行动

1. ✅ 创建开发计划文档 (当前)
2. ⏳ 开始 Phase 1: 创建主题 CSS 变量
3. ⏳ 实现 ThemeContext
4. ⏳ 创建主题切换组件

---

*文档版本: v1.0 | 最后更新: 2026-02-17*

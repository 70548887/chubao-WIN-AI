# 自升级系统开发计划

> 目标：实现自动检查更新、下载、安装功能
> 创建时间：2026-02-17
> 预估工时：3 天

---

## 功能需求

### 核心功能
- 自动检查 GitHub 最新版本
- 对比当前版本与最新版本
- 下载更新包
- 执行升级安装
- 升级前自动备份

### 用户体验
- 设置面板显示当前版本
- 发现更新时通知用户
- 一键升级按钮
- 升级进度显示
- 升级失败回滚

---

## 技术方案

### 1. 版本检查

使用 GitHub API 获取最新 Release：

```typescript
const response = await fetch('https://api.github.com/repos/YaTou91-code/chubao-WIN-AI/releases/latest');
const data = await response.json();
const latestVersion = data.tag_name.replace('v', '');
```

### 2. 升级流程

```
检查更新
    ↓
发现新版本
    ↓
下载更新包
    ↓
备份当前版本
    ↓
执行升级脚本
    ↓
重启应用
```

### 3. 升级脚本

使用 PowerShell 脚本执行升级：

```powershell
# 1. 停止服务
# 2. 备份当前文件
# 3. 解压新版本
# 4. 重启应用
```

---

## 开发步骤

### Phase 1: 版本检查 (Day 1)

#### T1.1: 创建升级服务
**文件**: `src/services/upgradeService.ts`

**功能**:
- 检查 GitHub 最新版本
- 版本号对比
- 获取 Release 信息

#### T1.2: 创建版本检查 Hook
**文件**: `src/hooks/useVersionCheck.ts`

**功能**:
- 定期检查更新
- 缓存检查结果
- 返回更新状态

### Phase 2: 升级界面 (Day 1-2)

#### T2.1: 创建升级按钮组件
**文件**: `src/components/UpgradeButton.tsx`

**功能**:
- 显示当前版本
- 显示更新状态
- 触发升级流程

#### T2.2: 升级进度对话框
**文件**: `src/components/UpgradeDialog.tsx`

**功能**:
- 显示升级进度
- 显示下载进度
- 错误处理

### Phase 3: 升级执行 (Day 2)

#### T3.1: 后端升级 API
**文件**: `sidecars/node-backend/src/api/upgrade.ts`

**功能**:
- 下载更新包
- 执行升级脚本
- 返回升级状态

#### T3.2: PowerShell 升级脚本
**文件**: `scripts/upgrade.ps1`

**功能**:
- 停止服务
- 备份文件
- 执行升级
- 重启应用

### Phase 4: 设置集成 (Day 3)

#### T4.1: 设置面板添加版本信息
**文件**: `src/components/SettingsPanelNew.tsx`

**改动**:
- 显示当前版本
- 添加检查更新按钮
- 显示更新日志

#### T4.2: 自动检查配置
**功能**:
- 是否自动检查
- 检查频率设置

---

## 文件变更清单

### 新增文件
- `src/services/upgradeService.ts` - 升级服务
- `src/hooks/useVersionCheck.ts` - 版本检查 Hook
- `src/components/UpgradeButton.tsx` - 升级按钮
- `src/components/UpgradeDialog.tsx` - 升级对话框
- `sidecars/node-backend/src/api/upgrade.ts` - 升级 API
- `scripts/upgrade.ps1` - 升级脚本

### 修改文件
- `src/components/SettingsPanelNew.tsx` - 添加版本信息
- `package.json` - 添加版本号

---

## 验收标准

### 功能验收
- [ ] 正确检测新版本
- [ ] 版本号对比准确
- [ ] 下载更新包成功
- [ ] 升级脚本执行成功
- [ ] 升级失败可回滚

### 安全验收
- [ ] 升级前自动备份
- [ ] 升级失败不破坏现有功能
- [ ] 数字签名验证（可选）

---

## 下一步行动

1. ✅ 创建开发计划文档 (当前)
2. ⏳ 开始 Phase 1: 创建升级服务
3. ⏳ 创建版本检查 Hook

---

*文档版本: v1.0 | 最后更新: 2026-02-17*

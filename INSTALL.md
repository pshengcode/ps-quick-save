# 快速安装指南

## 安装步骤

### 1. 准备工作
确保你的系统满足以下要求：
- Adobe Photoshop 22.1.0 或更高版本
- 已安装 Adobe UXP Developer Tool (UDT)

### 2. 加载插件

1. **打开 UDT**
   - 在应用程序中找到并启动 Adobe UXP Developer Tool

2. **添加插件**
   - 点击 "Add Plugin" 按钮
   - 浏览并选择此项目文件夹中的 `manifest.json` 文件

3. **加载插件**
   - 确保 Photoshop 正在运行
   - 在插件列表中找到 "保存历史工具"
   - 点击右侧的三个点 (•••) 菜单
   - 选择 "Load"

4. **在 Photoshop 中使用**
   - 切换到 Photoshop
   - 通过菜单 `插件 > 保存历史` 打开插件面板
   - 开始使用！

## 清理模板文件（可选）

由于这个插件不再使用 WebView 功能，你可以安全地删除以下文件夹：
- `Receiver/` 文件夹（包含旧的 WebView 示例文件）

这不会影响插件的任何功能。

## 开发模式

如果你想修改插件代码：

1. 修改 `index.html`、`index.js` 或其他文件
2. 在 UDT 中点击插件旁的"重新加载"图标
3. 切换回 Photoshop 查看更改

## 故障排除

**插件无法加载？**
- 检查 Photoshop 是否在 UDT 的"Connected apps"列表中
- 确保 Photoshop 版本 ≥ 22.1.0
- 尝试重启 Photoshop 和 UDT

**插件面板显示空白？**
- 打开浏览器开发者工具（右键点击面板 > 检查元素）
- 查看控制台是否有错误信息

**保存失败？**
- 确保文件路径有效且有写入权限
- 检查磁盘空间是否充足

## 卸载

1. 在 UDT 中找到插件
2. 点击三个点菜单
3. 选择 "Remove"
4. 重启 Photoshop

---

更多详细信息请查看 [README.md](./README.md)


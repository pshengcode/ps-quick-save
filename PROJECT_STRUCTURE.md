# 项目结构说明

## 核心文件

```
Test-mx05h8/
├── manifest.json          # 插件配置文件（必需）
├── index.html            # 主界面HTML（必需）
├── index.js              # 主要功能代码（必需）
├── images/               # 图标资源（必需）
│   ├── icon@1x.png
│   └── icon@2x.png
├── README.md             # 详细使用说明
├── INSTALL.md            # 快速安装指南
└── PROJECT_STRUCTURE.md  # 本文件
```

## 可删除的文件

以下文件/文件夹是原模板项目的示例文件，不再需要：

```
Receiver/                 # WebView示例文件夹
├── index.html           # 可删除
├── index.js             # 可删除
└── webgl.css            # 可删除
```

## 文件说明

### manifest.json
插件的配置清单，包含：
- 插件ID、名称、版本
- 所需的Photoshop版本
- 权限设置（文件系统访问、剪贴板等）
- 面板大小配置
- 图标路径

### index.html
插件的用户界面，包含：
- 缩略图网格布局
- 按钮和控制元素
- CSS样式定义

### index.js
插件的核心逻辑，实现：
- 保存文档功能
- 生成缩略图
- 历史记录管理（localStorage）
- 覆盖保存功能
- UI渲染和事件处理

## 数据存储

插件使用浏览器的 `localStorage` 存储历史记录：
- 存储键：`saveHistory`
- 数据格式：JSON数组
- 最大记录数：50条
- 存储位置：Photoshop的UXP缓存目录

每条历史记录包含：
```javascript
{
  id: "时间戳",
  filename: "文件名",
  path: "完整路径",
  timestamp: 时间戳,
  width: 宽度,
  height: 高度,
  thumbnail: "base64编码的缩略图"
}
```

## 开发建议

### 修改UI
- 编辑 `index.html` 中的HTML结构
- 修改 `<style>` 标签中的CSS样式
- 支持Spectrum Web Components组件

### 修改功能
- 编辑 `index.js` 中的JavaScript代码
- 使用 Photoshop 的 `batchPlay` API
- 使用 `executeAsModal` 执行需要修改文档的操作

### 调试技巧
1. 在UDT中加载插件
2. 在插件面板上右键点击 > 检查元素
3. 使用开发者工具查看控制台日志和错误
4. 修改代码后在UDT中重新加载插件

## API使用

### Photoshop API
```javascript
const { app } = require('photoshop');
const { core } = require('photoshop');
const { action } = require('photoshop');

// 获取当前文档
const doc = app.activeDocument;

// 执行需要修改文档的操作
await core.executeAsModal(async () => {
  // 你的代码
}, { commandName: '操作名称' });

// 使用batchPlay执行动作
await action.batchPlay([...], {});
```

### UXP 文件系统API
```javascript
const { storage } = require('uxp');
const localFileSystem = storage.localFileSystem;

// 获取保存文件对话框
const file = await localFileSystem.getFileForSaving('标题', {
  types: ['psd', 'jpg', 'png']
});

// 读写文件
const content = await file.read();
await file.write(data);
```

## 常见修改

### 修改最大历史记录数
在 `index.js` 中修改 `addToHistory` 函数：
```javascript
if (history.length > 50) {  // 改为你想要的数字
    history.pop();
}
```

### 修改缩略图大小
在 `index.js` 中修改 `generateThumbnail` 函数：
```javascript
const maxSize = 300;  // 改为你想要的尺寸
```

### 修改面板默认大小
在 `manifest.json` 中修改：
```json
"preferredDockedSize": {
  "width": 600,   // 改为你想要的宽度
  "height": 700   // 改为你想要的高度
}
```

## 性能优化建议

1. **缩略图生成**：对于大型文档，考虑使用更低的质量或更小的尺寸
2. **历史记录**：定期清理旧记录以保持性能
3. **存储空间**：base64缩略图会占用localStorage空间，注意限制

## 许可和分发

如需分发插件：
1. 测试所有功能
2. 更新版本号（manifest.json）
3. 准备插件图标
4. 考虑提交到Adobe Exchange

## 技术支持

- Photoshop UXP文档：https://developer.adobe.com/photoshop/uxp/
- UXP API参考：https://developer.adobe.com/photoshop/uxp/2022/uxp-api/
- batchPlay参考：https://developer.adobe.com/photoshop/uxp/2022/ps_reference/


// 全局变量
let app, localFileSystem, storage;

// 存储历史记录的键
const HISTORY_KEY = 'saveHistory';

// 获取保存历史
function getHistory() {
    try {
        const historyJson = localStorage.getItem(HISTORY_KEY);
        return historyJson ? JSON.parse(historyJson) : [];
    } catch (error) {
        console.error('读取历史失败:', error);
        return [];
    }
}

// 保存历史
function saveHistory(history) {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
} catch (error) {
        console.error('保存历史失败:', error);
    }
}

// 添加或更新历史记录
function addToHistory(record) {
    const history = getHistory();
    
    // 查找是否存在相同路径的记录
    const existingIndex = history.findIndex(item => item.path === record.path);
    
    if (existingIndex !== -1) {
        // 如果存在，删除旧记录，以便将新记录添加到顶部
        history.splice(existingIndex, 1);
    }
    
    // 添加到开头
    history.unshift(record);
    
    // 最多保存50条历史
    if (history.length > 50) {
        history.pop();
    }
    saveHistory(history);
}

// 删除历史记录
function removeFromHistory(id) {
    const history = getHistory();
    const newHistory = history.filter(item => item.id !== id);
    saveHistory(newHistory);
}

// 清空历史
function clearHistory() {
    saveHistory([]);
}

// 获取文档属性（兼容旧版本API）
async function getDocumentInfo(doc) {
    try {
        const photoshop = require('photoshop');
        const { batchPlay } = photoshop.action;
        
        // 使用 batchPlay 获取文档信息
        const result = await batchPlay([{
            _obj: "get",
            _target: [{
                _ref: "document",
                _enum: "ordinal",
                _value: "targetEnum"
            }],
            _options: {
                dialogOptions: "dontDisplay"
            }
        }], {});
        
        if (result && result[0]) {
            const docInfo = result[0];
            return {
                name: docInfo.title || doc.name || '未命名',
                path: docInfo.fileReference?._path || doc.path || null,
                width: docInfo.width?._value || doc.width || 0,
                height: docInfo.height?._value || doc.height || 0,
                saved: docInfo.hasBackgroundLayer !== undefined
            };
        }
    } catch (error) {
        console.warn('[文档信息] 使用 batchPlay 获取失败，使用备用方法:', error);
    }
    
    // 备用方法：直接读取属性
    return {
        name: doc.name || doc.title || '未命名',
        path: doc.path || null,
        width: doc.width || 0,
        height: doc.height || 0,
        saved: true
    };
}

// base64 编码函数（UXP 兼容）
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    // 使用 Buffer 进行 base64 编码（UXP 支持）
    try {
        return Buffer.from(binary, 'binary').toString('base64');
    } catch (e) {
        // 备用方案：手动编码
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        let result = '';
        let i = 0;
        while (i < binary.length) {
            const a = binary.charCodeAt(i++);
            const b = i < binary.length ? binary.charCodeAt(i++) : 0;
            const c = i < binary.length ? binary.charCodeAt(i++) : 0;
            const bitmap = (a << 16) | (b << 8) | c;
            result += chars[(bitmap >> 18) & 63];
            result += chars[(bitmap >> 12) & 63];
            result += i - 2 < binary.length ? chars[(bitmap >> 6) & 63] : '=';
            result += i - 1 < binary.length ? chars[bitmap & 63] : '=';
        }
        return result;
    }
}

// 从 PSD 文件读取缩略图
async function generateThumbnailFromFile(docPath) {
    try {
        console.log('[缩略图] 尝试从文件读取缩略图:', docPath);
        
        // 使用 batchPlay 获取文档缩略图
        const photoshop = require('photoshop');
        const { batchPlay } = photoshop.action;
        
        const result = await batchPlay([{
            _obj: "get",
            _target: [{
                _ref: "property",
                _property: "fileInfo"
            }, {
                _ref: "document",
                _enum: "ordinal",
                _value: "targetEnum"
            }]
        }], {});
        
        console.log('[缩略图] 文档信息获取结果:', result);
        
        // 如果有缩略图数据，返回
        if (result && result[0] && result[0].thumbnail) {
            console.log('[缩略图] 找到内置缩略图');
            return result[0].thumbnail;
        }
        
        console.log('[缩略图] 文件没有内置缩略图');
        return null;
        
    } catch (error) {
        console.error('[缩略图] 读取文件缩略图失败:', error);
        return null;
    }
}

// 简化的缩略图生成（直接返回null）
async function generateThumbnailSimple() {
    console.log('[缩略图] 跳过缩略图生成');
    return null;
}

// 生成缩略图
async function generateThumbnail(docPath) {
    try {
        console.log('[缩略图] 开始生成缩略图');
        
        // 方案1: 尝试从文件读取内置缩略图
        if (docPath) {
            const fileThumbnail = await generateThumbnailFromFile(docPath);
            if (fileThumbnail) {
                return fileThumbnail;
            }
        }
        
        // 方案2: 使用占位符
        console.log('[缩略图] 使用占位符');
        return await generateThumbnailSimple();
    } catch (error) {
        console.error('生成缩略图失败:', error);
        return null;
    }
}

// 保存当前文档（另存为）
async function saveCurrentDocument() {
    try {
        const doc = app.activeDocument;
        if (!doc) {
            await showAlert('错误', '没有打开的文档');
            return;
        }

        const photoshop = require('photoshop');
        const executeAsModal = photoshop.core.executeAsModal;
        const { batchPlay } = photoshop.action;
        
        // 获取选择的格式
        const formatPicker = document.getElementById('saveFormat');
        const selectedFormat = formatPicker ? formatPicker.value : 'png';
        console.log('选择的保存格式:', selectedFormat);

        const docInfo = await getDocumentInfo(doc);
        let savedPath = null;
        let docName = docInfo.name;
        
        // 移除扩展名，准备添加新扩展名
        if (docName.includes('.')) {
            docName = docName.substring(0, docName.lastIndexOf('.'));
        }
        
        // 总是弹出保存框（另存为）
        const file = await localFileSystem.getFileForSaving(docName, {
            types: [selectedFormat]
        });

        if (!file) {
            return; // 用户取消了
        }

        // 获取 Session Token 用于保存
        let sessionToken = null;
        try {
            sessionToken = await localFileSystem.createSessionToken(file);
        } catch (e) {
            console.warn('创建会话 Token 失败:', e);
        }

        // 构建保存命令
        const saveOptions = {
            _obj: "save",
            in: { _path: sessionToken || file.nativePath, _kind: "local" },
            lowerCase: true,
            saveStage: { _enum: "saveStageType", _value: "saveSucceeded" }
        };

        // 根据格式设置参数
        if (selectedFormat === 'psd') {
            saveOptions.as = { _obj: "photoshop35Format" };
        } else if (selectedFormat === 'jpg') {
            saveOptions.as = { _obj: "JPEG", quality: 12 };
        } else if (selectedFormat === 'png') {
            saveOptions.as = { _obj: "PNGFormat" };
        } else if (selectedFormat === 'tga') {
            saveOptions.as = { 
                _obj: "targaFormat", 
                resolution: { _enum: "targaResolution", _value: "thirtyTwoBit" },
                rleCompression: true
            };
        }

        // 执行保存
        if (executeAsModal) {
            await executeAsModal(async () => {
                await batchPlay([saveOptions], {});
            }, { commandName: '另存为文档' });
        } else {
            await batchPlay([saveOptions], {});
        }

        savedPath = file.nativePath;
        docName = file.name;
        
        // 修正文件名显示：如果系统返回的文件名没有后缀，手动加上
        if (!docName.includes('.')) {
            docName = `${docName}.${selectedFormat}`;
        }
        
        // 创建持久化 token
        let token = null;
        try {
            token = await localFileSystem.createPersistentToken(file);
            console.log('已创建持久化 token:', token);
        } catch (e) {
            console.error('创建 token 失败:', e);
        }

        // 重新获取文档信息（保存后可能有变化）
        const updatedInfo = await getDocumentInfo(doc);
        
        // 生成缩略图
        const thumbnail = await generateThumbnail(savedPath);

        // 添加到历史
        const record = {
            id: Date.now().toString(),
            filename: docName,
            path: savedPath,
            timestamp: Date.now(),
            width: updatedInfo.width,
            height: updatedInfo.height,
            thumbnail: thumbnail,
            token: token, // 保存 Token
            format: selectedFormat.toUpperCase() // 保存格式信息
        };

        addToHistory(record);
        renderThumbnails();

        await showAlert('成功', `文档已另存为: ${docName}`);
    } catch (error) {
        console.error('保存文档失败:', error);
        await showAlert('错误', `保存失败: ${error.message}`);
    }
}

// 覆盖保存到指定路径
async function overwriteSave(targetPath) {
    try {
        const doc = app.activeDocument;
        if (!doc) {
            await showAlert('错误', '没有打开的文档');
            return;
        }

        const photoshop = require('photoshop');
        const executeAsModal = photoshop.core.executeAsModal;
        const { batchPlay } = photoshop.action;

        // 查找 token
        const history = getHistory();
        let recordIndex = history.findIndex(item => item.path === targetPath);
        const record = recordIndex !== -1 ? history[recordIndex] : null;
        let sessionToken = null;

        if (record && record.token) {
            try {
                const entry = await localFileSystem.getEntryForPersistentToken(record.token);
                if (entry) {
                    sessionToken = await localFileSystem.createSessionToken(entry);
                }
            } catch (e) {
                console.warn('获取文件 token 失败:', e);
            }
        }

        // 如果没有 token，尝试通过路径恢复 (需要 fullAccess)
        if (!sessionToken) {
            console.warn('没有有效的文件访问 token，尝试通过路径恢复...');
            try {
                let fileUrl = "file:" + targetPath;
                // 处理 Windows 路径
                if (targetPath.match(/^[a-zA-Z]:/)) {
                     fileUrl = "file:/" + targetPath.replace(/\\/g, "/");
                } else if (targetPath.startsWith("/")) {
                     fileUrl = "file://" + targetPath;
                }
                
                console.log('尝试恢复 Token, URL:', fileUrl);
                let entry = null;
                try {
                    entry = await localFileSystem.getEntryWithUrl(fileUrl);
                } catch (e) {
                    console.warn('第一次尝试 getEntryWithUrl 失败:', e);
                    // 尝试使用 file:/// 格式 (Windows 有时需要)
                    if (fileUrl.startsWith("file:/") && !fileUrl.startsWith("file:///")) {
                        const fileUrl3 = fileUrl.replace("file:/", "file:///");
                        console.log('尝试使用 file:/// 格式:', fileUrl3);
                        try {
                            entry = await localFileSystem.getEntryWithUrl(fileUrl3);
                        } catch (e2) {
                            console.warn('第二次尝试 getEntryWithUrl 失败:', e2);
                        }
                    }
                }

                if (entry) {
                    sessionToken = await localFileSystem.createSessionToken(entry);
                    console.log('成功通过路径恢复 token');
                    
                    // 更新历史记录
                    const persistentToken = await localFileSystem.createPersistentToken(entry);
                    if (recordIndex !== -1) {
                        history[recordIndex].token = persistentToken;
                        saveHistory(history);
                    }
                }
            } catch (e) {
                console.warn('通过路径恢复 token 失败:', e);
            }
        }

        // 如果仍然没有 token，直接让用户重新选择
        if (!sessionToken) {
            // 提示用户
            console.log('权限不足，请求用户重新选择文件...');
            
            const fileName = targetPath.split(/[/\\]/).pop();
            // 获取扩展名
            const ext = fileName.includes('.') ? fileName.split('.').pop() : 'psd';

            // 注意：getFileForSaving 的第一个参数只能是文件名，不能包含路径，否则会报错
            const file = await localFileSystem.getFileForSaving(fileName, {
                types: [ext]
            });
            
            if (file) {
                sessionToken = await localFileSystem.createSessionToken(file);
                // 更新历史记录
                const persistentToken = await localFileSystem.createPersistentToken(file);
                
                // 如果之前有记录，更新它；如果没有，可能是在保存一个不在历史中的文件（不太可能，但为了健壮性）
                if (recordIndex !== -1) {
                    history[recordIndex].token = persistentToken;
                    history[recordIndex].path = file.nativePath;
                    saveHistory(history);
                }
                
                // 更新目标路径
                targetPath = file.nativePath;
            } else {
                return; // 用户取消
            }
        }

        // 保存到目标文件的函数
        const doSave = async () => {
            // 确定保存格式：优先使用记录中的格式，否则尝试从路径解析
            let ext = 'psd';
            if (record && record.format) {
                ext = record.format.toLowerCase();
            } else {
                const fileName = targetPath.split(/[/\\]/).pop();
                if (fileName.includes('.')) {
                    ext = fileName.split('.').pop().toLowerCase();
                }
            }
            
            console.log(`[覆盖保存] 目标格式: ${ext}`);
            
            // 构建 save 命令的 in 参数
            let inParam;
            if (sessionToken) {
                inParam = { _path: sessionToken, _kind: "local" };
            } else {
                inParam = { _path: targetPath, _kind: "local" };
            }

            const saveOptions = {
                documentID: doc._id,
                lowerCase: true,
                saveStage: {
                    _enum: "saveStageType",
                    _value: "saveSucceeded"
                },
                in: inParam
            };

            let saveCmd = {
                _obj: "save",
                ...saveOptions
            };

            if (ext === 'psd') {
                saveCmd.as = { _obj: "photoshop35Format" };
            } else if (ext === 'jpg' || ext === 'jpeg') {
                saveCmd.as = { _obj: "JPEG", quality: 12 };
            } else if (ext === 'png') {
                saveCmd.as = { _obj: "PNGFormat" };
            } else if (ext === 'tga') {
                saveCmd.as = { 
                    _obj: "targaFormat", 
                    resolution: { _enum: "targaResolution", _value: "thirtyTwoBit" },
                    rleCompression: true
                };
            } else {
                saveCmd.as = { _obj: "photoshop35Format" };
            }

            await batchPlay([saveCmd], {});
        };
        
        // 执行保存
        if (executeAsModal) {
            await executeAsModal(doSave, { commandName: '覆盖保存文档' });
        } else {
            await doSave();
        }

        // 重新获取文档信息
        const docInfo = await getDocumentInfo(doc);
        
        // 更新缩略图
        const thumbnail = await generateThumbnail(targetPath);
        
        // 更新历史记录中的缩略图
        // 重新获取最新的历史记录（因为可能在其他地方被修改）
        const currentHistory = getHistory();
        recordIndex = currentHistory.findIndex(item => item.path === targetPath);
        
        if (recordIndex !== -1) {
            const updatedRecord = currentHistory[recordIndex];
            updatedRecord.thumbnail = thumbnail;
            updatedRecord.timestamp = Date.now();
            updatedRecord.width = docInfo.width;
            updatedRecord.height = docInfo.height;
            
            // 移动到顶部
            currentHistory.splice(recordIndex, 1);
            currentHistory.unshift(updatedRecord);
            
            saveHistory(currentHistory);
            renderThumbnails();
        }

        await showAlert('成功', `已覆盖保存到: ${targetPath.split(/[/\\]/).pop()}`);
    } catch (error) {
        console.error('覆盖保存失败:', error);
        if (error.message && error.message.includes('invalid file token')) {
            await showAlert('权限错误', '插件没有该文件的写入权限。请尝试使用"保存当前文档"按钮重新保存一次以获取权限。');
        } else {
            await showAlert('错误', `覆盖保存失败: ${error.message}`);
        }
    }
}

// 显示提示框
async function showAlert(title, message) {
    return new Promise((resolve) => {
        const dialog = document.createElement('dialog');
        dialog.innerHTML = `
            <form method="dialog">
                <sp-heading>${title}</sp-heading>
                <sp-divider size="medium"></sp-divider>
                <sp-body style="margin: 16px 0;">${message}</sp-body>
                <footer>
                    <sp-button type="submit" variant="cta">确定</sp-button>
                </footer>
            </form>
        `;
        document.body.appendChild(dialog);
        
        dialog.addEventListener('close', () => {
            dialog.remove();
            resolve();
        });
        
        dialog.showModal();
    });
}

// 显示确认对话框
async function showConfirm(title, message) {
    return new Promise((resolve) => {
        const dialog = document.createElement('dialog');
        dialog.innerHTML = `
            <form method="dialog">
                <sp-heading>${title}</sp-heading>
                <sp-divider size="medium"></sp-divider>
                <sp-body style="margin: 16px 0;">${message}</sp-body>
                <footer style="display: flex; gap: 8px; justify-content: flex-end;">
                    <sp-button id="cancelBtn" variant="secondary">取消</sp-button>
                    <sp-button id="confirmBtn" variant="cta">确定</sp-button>
                </footer>
            </form>
        `;
        document.body.appendChild(dialog);
        
        const cancelBtn = dialog.querySelector('#cancelBtn');
        const confirmBtn = dialog.querySelector('#confirmBtn');
        
        cancelBtn.onclick = () => {
            dialog.close('false');
        };
        
        confirmBtn.onclick = () => {
            dialog.close('true');
        };
        
        dialog.addEventListener('close', () => {
            const result = dialog.returnValue === 'true';
            dialog.remove();
            resolve(result);
        });
        
        dialog.showModal();
    });
}

// 格式化时间
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) { // 1分钟内
        return '刚刚';
    } else if (diff < 3600000) { // 1小时内
        return `${Math.floor(diff / 60000)}分钟前`;
    } else if (diff < 86400000) { // 24小时内
        return `${Math.floor(diff / 3600000)}小时前`;
    } else {
        return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
    }
}

// 渲染缩略图
function renderThumbnails() {
    console.log('[渲染] 开始渲染缩略图...');
    
    const container = document.getElementById('thumbnailContainer');
    if (!container) {
        console.error('[渲染] ❌ 找不到容器元素 #thumbnailContainer');
        return;
    }
    
    console.log('[渲染] ✅ 容器元素找到:', container);
    const containerStyle = window.getComputedStyle(container);
    console.log('[渲染] 容器样式 - display:', containerStyle.display);
    console.log('[渲染] 容器样式 - visibility:', containerStyle.visibility);
    console.log('[渲染] 容器样式 - height:', containerStyle.height);
    console.log('[渲染] 容器样式 - minHeight:', containerStyle.minHeight);
    console.log('[渲染] 容器实际高度:', container.offsetHeight, 'px');
    console.log('[渲染] 容器当前子元素数:', container.children.length);
    
    const history = getHistory();
    console.log(`[渲染] 历史记录数量: ${history.length}`);
    console.log('[渲染] 历史记录详情:', JSON.stringify(history, null, 2));

    if (history.length === 0) {
        console.log('[渲染] 无历史记录，显示空状态');
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📁</div>
                <div>暂无保存历史</div>
                <div style="font-size: 11px; margin-top: 8px;">使用 Ctrl+S 保存文档或点击"保存当前文档"按钮</div>
                <div style="font-size: 10px; margin-top: 4px; color: var(--uxp-host-text-color-secondary);">💡 点击"测试记录"按钮测试功能</div>
            </div>
        `;
        return;
    }

    // 直接用 HTML 渲染
    let html = '';
    
    history.forEach((record, index) => {
        console.log(`[渲染] 渲染记录 ${index + 1}: ${record.filename}`);
        
        // 权限状态图标
        const hasToken = !!record.token;
        const tokenIcon = hasToken 
            ? `<div title="已获取写入权限" style="position: absolute; top: 8px; left: 8px; color: #4caf50; font-size: 16px; cursor: help; z-index: 5;">🔓</div>`
            : `<div title="未获取权限 (双击保存时需确认)" style="position: absolute; top: 8px; left: 8px; color: #f44336; font-size: 16px; cursor: help; z-index: 5;">🔒</div>`;

        // 获取文件扩展名 (优先使用保存的格式，否则尝试从路径解析)
        let ext = record.format || 'FILE';
        if (!record.format) {
            const parts = record.path.split('.');
            // 简单的校验：如果分割后的最后一部分太长或包含路径分隔符，说明可能没有扩展名
            if (parts.length > 1) {
                const possibleExt = parts.pop().toUpperCase();
                if (possibleExt.length <= 5 && !possibleExt.includes('/') && !possibleExt.includes('\\')) {
                    ext = possibleExt;
                }
            }
        }

        html += `
            <div class="thumbnail-item" style="background: #2a2a2a; border: 2px solid #444; border-radius: 8px; padding: 12px; min-height: 220px; display: block; position: relative; margin-bottom: 16px;" data-path="${record.path}" data-id="${record.id}">
                ${tokenIcon}
                <button class="delete-btn" style="position: absolute; top: 8px; right: 8px; background: rgba(255, 0, 0, 0.8); color: white; border: none; border-radius: 50%; width: 28px; height: 28px; cursor: pointer; font-size: 18px; line-height: 28px; z-index: 10;">×</button>
                <div class="thumbnail-image" style="width: 100%; height: 100px; background: #333; display: flex; align-items: center; justify-content: center; color: #888; font-size: 32px; font-weight: bold; border-radius: 4px; margin-bottom: 12px;">${ext}</div>
                <div class="thumbnail-info" style="width: 100%; text-align: center;">
                    <div style="font-size: 13px; color: #fff; margin: 6px 0; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${record.filename}">${record.filename}</div>
                    <div style="font-size: 10px; color: #4a9eff; margin: 4px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: help;" title="${record.path}">📁 ${record.path}</div>
                    <div style="font-size: 11px; color: #aaa; margin: 4px 0;">${formatTime(record.timestamp)}</div>
                    <div style="font-size: 10px; color: #888;">${Math.round(record.width)} × ${Math.round(record.height)}</div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    container.style.minHeight = '400px';
    container.style.background = '#1a1a1a';
    container.style.padding = '16px';
    
    // 绑定事件
    const items = container.querySelectorAll('.thumbnail-item');
    items.forEach((item, index) => {
        const record = history[index];
        
        // 删除按钮
        const deleteBtn = item.querySelector('.delete-btn');
        deleteBtn.onclick = async (e) => {
            e.stopPropagation();
            const confirmed = await showConfirm('确认删除', `确定要删除 "${record.filename}" 的历史记录吗？`);
            if (confirmed) {
                removeFromHistory(record.id);
                renderThumbnails();
            }
        };
        
        // 双击事件
        item.ondblclick = async () => {
            const confirmed = await showConfirm(
                '确认覆盖保存',
                `确定要将当前打开的文档覆盖保存到以下文件吗？\n\n${record.path}`
            );
            if (confirmed) {
                await overwriteSave(record.path);
            }
        };
        
        console.log(`[渲染] 元素 ${index + 1} 已绑定事件`);
    });
    
    console.log(`[渲染] 缩略图渲染完成，容器子元素数量: ${container.children.length}`);
    console.log('[渲染] 容器内容:', container.innerHTML.substring(0, 200));
    console.log('[渲染] 容器位置 - offsetTop:', container.offsetTop, 'offsetLeft:', container.offsetLeft);
    console.log('[渲染] 容器尺寸 - offsetWidth:', container.offsetWidth, 'offsetHeight:', container.offsetHeight);
    console.log('[渲染] 容器父元素:', container.parentElement);
    
    // 强制滚动到容器位置
    setTimeout(() => {
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        console.log('[渲染] 已滚动到容器位置');
    }, 100);
}

// 记录文档信息到历史（不包含保存操作）
async function recordDocumentToHistory(eventType = 'unknown', overridePath = null) {
    try {
        console.log(`[记录] ========================================`);
        console.log(`[记录] 开始记录文档，事件类型: ${eventType}`);
        console.log(`[记录] 覆盖路径参数: ${overridePath}`);
        
        const doc = app.activeDocument;
        if (!doc) {
            console.log('[记录] 没有活动文档');
            return;
        }

        // 获取文档信息
        const docInfo = await getDocumentInfo(doc);
        
        // 使用保存事件中提取的路径，如果有的话
        let savedPath = overridePath || docInfo.path;
        let docName = docInfo.name;
        
        // 如果有覆盖路径，从路径中提取文件名
        if (overridePath) {
            const pathParts = overridePath.split(/[/\\]/);
            docName = pathParts[pathParts.length - 1];
            console.log(`[记录] 使用保存事件的路径: ${overridePath}`);
            console.log(`[记录] 提取的文件名: ${docName}`);
        }
        
        console.log(`[记录] 最终文档名称: ${docName}`);
        console.log(`[记录] 最终保存路径: ${savedPath}`);
        console.log(`[记录] 文档尺寸: ${docInfo.width} × ${docInfo.height}`);

        // 检查是否有路径
        if (!savedPath) {
            console.log('[记录] 无保存路径，跳过记录');
            return;
        }

        // 尝试获取文件 Token (自动授权)
        let persistentToken = null;
        try {
            console.log('[记录] 尝试自动获取文件授权...');
            let fileUrl = "file:" + savedPath;
            // 处理 Windows 路径
            if (savedPath.match(/^[a-zA-Z]:/)) {
                    fileUrl = "file:/" + savedPath.replace(/\\/g, "/");
            } else if (savedPath.startsWith("/")) {
                    fileUrl = "file://" + savedPath;
            }
            
            let entry = null;
            try {
                entry = await localFileSystem.getEntryWithUrl(fileUrl);
            } catch (e) {
                // 尝试使用 file:/// 格式
                if (fileUrl.startsWith("file:/") && !fileUrl.startsWith("file:///")) {
                    const fileUrl3 = fileUrl.replace("file:/", "file:///");
                    try {
                        entry = await localFileSystem.getEntryWithUrl(fileUrl3);
                    } catch (e2) { }
                }
            }

            if (entry) {
                persistentToken = await localFileSystem.createPersistentToken(entry);
                console.log('[记录] ✅ 成功获取文件授权 Token');
            } else {
                console.log('[记录] ⚠️ 无法自动获取文件授权 (可能受沙箱限制)');
            }
        } catch (e) {
            console.warn('[记录] 获取 Token 过程出错:', e);
        }

        // 生成缩略图
        console.log('[记录] 开始生成缩略图...');
        const thumbnail = await generateThumbnail(savedPath);
        console.log('[记录] 缩略图生成完成');

        // 检查是否已存在该路径的记录
        const history = getHistory();
        const existingIndex = history.findIndex(item => item.path === savedPath);

        if (existingIndex !== -1) {
            // 更新现有记录
            console.log('[记录] 更新现有记录:', docName);
            history[existingIndex].thumbnail = thumbnail;
            history[existingIndex].timestamp = Date.now();
            history[existingIndex].width = docInfo.width;
            history[existingIndex].height = docInfo.height;
            history[existingIndex].filename = docName;
            // 如果获取到了新的 Token，更新它
            if (persistentToken) {
                history[existingIndex].token = persistentToken;
            }
            saveHistory(history);
        } else {
            // 添加新记录
            console.log('[记录] 添加新记录:', docName);
            const record = {
                id: Date.now().toString(),
                filename: docName,
                path: savedPath,
                timestamp: Date.now(),
                width: docInfo.width,
                height: docInfo.height,
                thumbnail: thumbnail,
                token: persistentToken // 保存 Token
            };
            addToHistory(record);
        }

        renderThumbnails();
        console.log('[记录] 记录完成:', docName);
    } catch (error) {
        console.error('[记录] 记录文档失败:', error);
    }
}

// 监听 Photoshop 保存事件
function setupSaveListener() {
    // 已禁用自动监听保存事件
    console.log('[监听器] 自动保存监听已禁用，仅记录通过插件进行的保存操作');
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    console.log('=== 插件初始化开始 ===');
    
    // 初始化模块引用
    try {
        const photoshop = require('photoshop');
        const uxp = require('uxp');
        
        app = photoshop.app;
        storage = uxp.storage;
        localFileSystem = storage.localFileSystem;
        
        console.log('✅ 模块加载成功');
        console.log('- Photoshop app:', !!app);
        console.log('- Storage:', !!storage);
        console.log('- LocalFileSystem:', !!localFileSystem);
    } catch (error) {
        console.error('❌ 模块加载失败:', error);
        return;
    }
    
    // 保存当前文档按钮
    const saveBtn = document.getElementById('saveCurrentBtn');
    if (saveBtn) {
        saveBtn.onclick = saveCurrentDocument;
        console.log('✅ 保存按钮已绑定');
    } else {
        console.error('❌ 找不到保存按钮');
    }

    // 测试记录按钮
    const testBtn = document.getElementById('testRecordBtn');
    if (testBtn) {
        testBtn.onclick = async () => {
            console.log('=== 测试记录功能 ===');
            try {
                const doc = app.activeDocument;
                if (!doc) {
                    await showAlert('提示', '请先打开一个文档');
                    return;
                }
                
                const docInfo = await getDocumentInfo(doc);
                console.log('当前文档信息:');
                console.log('- 名称:', docInfo.name);
                console.log('- 路径:', docInfo.path || '无');
                console.log('- 已保存:', docInfo.saved);
                console.log('- 宽度:', docInfo.width);
                console.log('- 高度:', docInfo.height);
                
                if (!docInfo.path) {
                    await showAlert('提示', '文档还未保存过，请先保存文档（Ctrl+S）然后再测试');
                    return;
                }
                
                await recordDocumentToHistory('手动测试');
                await showAlert('测试完成', '已尝试记录当前文档，请查看控制台日志和历史列表');
            } catch (error) {
                console.error('测试失败:', error);
                await showAlert('错误', `测试失败: ${error.message}`);
            }
        };
        console.log('✅ 测试按钮已绑定');
    }

    // 清空历史按钮
    const clearBtn = document.getElementById('clearHistoryBtn');
    if (clearBtn) {
        clearBtn.onclick = async () => {
            const confirmed = await showConfirm('确认清空', '确定要清空所有历史记录吗？此操作不可恢复！');
            if (confirmed) {
                clearHistory();
                renderThumbnails();
            }
        };
        console.log('✅ 清空按钮已绑定');
    } else {
        console.error('❌ 找不到清空按钮');
    }

    // 设置保存事件监听
    setupSaveListener();

    // 渲染缩略图
    console.log('开始渲染缩略图...');
    renderThumbnails();
    
    console.log('=== 插件初始化完成 ===');
    console.log('💡 提示：打开控制台（右键 > 检查元素）查看详细日志');
});

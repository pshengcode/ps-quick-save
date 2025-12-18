// 全局变量
let app, localFileSystem, storage;

// 本地化资源
const i18n = {
    "en": {
        "saveAs": "Save As",
        "clear": "Clear",
        "noHistory": "No History",
        "addRecordHint": "Click 'Save As' above to add record",
        "overwriteHint": "Double-click item to overwrite save",
        "confirmDelete": "Confirm Delete",
        "deleteMessage": "Are you sure you want to delete history for \"{0}\"?",
        "confirmClear": "Confirm Clear",
        "clearMessage": "Are you sure you want to clear all history? This cannot be undone!",
        "confirmOverwrite": "Confirm Overwrite",
        "overwriteMessage": "Overwrite the following file:\n{0}",
        "saved": "Saved",
        "error": "Error",
        "success": "Success",
        "noDoc": "No active document",
        "saveSuccess": "Document saved as: {0}",
        "saveFail": "Save failed: {0}"
    },
    "zh": {
        "saveAs": "另存为",
        "clear": "清空",
        "noHistory": "暂无保存历史",
        "addRecordHint": "点击上方 \"另存为\" 按钮添加记录",
        "overwriteHint": "双击列表项可快速覆盖保存",
        "confirmDelete": "确认删除",
        "deleteMessage": "确定要删除 \"{0}\" 的历史记录吗？",
        "confirmClear": "确认清空",
        "clearMessage": "确定要清空所有历史记录吗？此操作不可恢复！",
        "confirmOverwrite": "确认覆盖保存",
        "overwriteMessage": "覆盖以下文件：\n{0}",
        "saved": "已保存",
        "error": "错误",
        "success": "成功",
        "noDoc": "没有打开的文档",
        "saveSuccess": "文档已另存为: {0}",
        "saveFail": "保存失败: {0}"
    }
};

// 获取当前语言文本
function t(key, ...args) {
    try {
        const uxp = require('uxp');
        const locale = uxp.host.uiLocale || 'en';
        const lang = locale.startsWith('zh') ? 'zh' : 'en';
        let text = i18n[lang][key] || i18n['en'][key] || key;
        
        // 简单的参数替换 {0}, {1}...
        args.forEach((arg, index) => {
            text = text.replace(`{${index}}`, arg);
        });
        
        return text;
    } catch (e) {
        return key;
    }
}

// 更新 UI 文本
function updateUILanguage() {
    const map = {
        'saveCurrentBtn': 'saveAs',
        'clearHistoryBtn': 'clear'
    };
    
    for (const [id, key] of Object.entries(map)) {
        const el = document.getElementById(id);
        if (el) el.textContent = t(key);
    }
}

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
async function removeFromHistory(id) {
    const history = getHistory();
    
    // 删除对应的缩略图缓存
    const itemToDelete = history.find(item => item.id === id);
    if (itemToDelete && itemToDelete.path) {
        await deleteThumbnailFromCache(itemToDelete.path);
    }

    const newHistory = history.filter(item => item.id !== id);
    saveHistory(newHistory);
}

// 清空历史
async function clearHistory() {
    await deleteAllThumbnails();
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
            
            let width = docInfo.width?._value || doc.width || 0;
            let height = docInfo.height?._value || doc.height || 0;
            
            // 获取分辨率：尝试多个来源
            let resolution = docInfo.resolution?._value;
            if (!resolution && docInfo.imageResolution) {
                 resolution = docInfo.imageResolution._value;
            }
            if (!resolution) {
                resolution = doc.resolution;
            }
            if (!resolution) {
                resolution = 72;
            }

            const resolutionUnit = docInfo.resolution?._unit;
            
            // 确保分辨率为 PPI (Pixels Per Inch)
            if (resolutionUnit === "pixelsPerCentimeterUnit") {
                resolution = resolution * 2.54;
            }

            const widthUnit = docInfo.width?._unit;
            const heightUnit = docInfo.height?._unit;
            
            // 辅助函数：转换单位为像素
            const convertToPixels = (value, unit, res) => {
                if (!unit || unit === "pixelsUnit") return value;
                switch (unit) {
                    case "inchesUnit": return value * res;
                    case "centimetersUnit": return (value / 2.54) * res;
                    case "millimetersUnit": return (value / 25.4) * res;
                    case "pointsUnit": return (value / 72) * res;
                    case "picasUnit": return (value / 6) * res;
                    default: return value; // 未知单位，保持原值
                }
            };

            let finalWidth = convertToPixels(width, widthUnit, resolution);
            let finalHeight = convertToPixels(height, heightUnit, resolution);

            // 安全检查：如果 DOM 属性存在且数值远大于计算值（通常是因为分辨率获取失败导致计算偏小）
            // 例如：512px @ 300ppi，Points=123。如果分辨率误用72，计算结果为123px。
            // 此时 doc.width 为 512，远大于 123，应使用 doc.width。
            if (doc.width && doc.width > finalWidth * 1.5) {
                console.log(`[文档信息] 修正宽度: 计算值 ${finalWidth} -> DOM值 ${doc.width}`);
                finalWidth = doc.width;
            }
            if (doc.height && doc.height > finalHeight * 1.5) {
                console.log(`[文档信息] 修正高度: 计算值 ${finalHeight} -> DOM值 ${doc.height}`);
                finalHeight = doc.height;
            }

            return {
                name: docInfo.title || doc.name || '未命名',
                path: docInfo.fileReference?._path || doc.path || null,
                width: Math.round(finalWidth),
                height: Math.round(finalHeight),
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

// 生成路径哈希
function getPathHash(path) {
    if (!path) return 'unknown';
    // 简单的字符串哈希
    let hash = 0, i, chr;
    const str = path.replace(/\\/g, '/').toLowerCase(); // 归一化
    if (str.length === 0) return hash;
    for (i = 0; i < str.length; i++) {
        chr = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
    }
    // 转为无符号十六进制字符串，并处理负数
    return "thumb_" + (hash >>> 0).toString(16);
}

// 生成并保存缩略图到缓存
async function saveThumbnailToCache(doc, originalPath) {
    try {
        console.log('[缩略图缓存] 开始生成缓存缩略图:', originalPath);
        const photoshop = require('photoshop');
        // 安全获取 executeAsModal
        const executeAsModal = photoshop.core ? photoshop.core.executeAsModal : null;
        const { batchPlay } = photoshop.action;
        const fs = require('uxp').storage.localFileSystem;
        
        // 1. 准备缓存目录
        const dataFolder = await fs.getDataFolder();
        let thumbFolder;
        try {
            // 优先尝试获取，如果不存在则创建
            try {
                thumbFolder = await dataFolder.getEntry("thumbnails");
            } catch (e) {
                thumbFolder = await dataFolder.createFolder("thumbnails", { ensure: true });
            }
        } catch (e) {
            console.warn('[缩略图缓存] 文件夹准备失败:', e);
            // 最后的尝试：清理同名文件
            try {
                const entry = await dataFolder.getEntry("thumbnails");
                if (!entry.isFolder) {
                    await entry.delete();
                    thumbFolder = await dataFolder.createFolder("thumbnails", { ensure: true });
                }
            } catch (e2) {
                console.error('[缩略图缓存] 无法创建 thumbnails 文件夹:', e2);
                return false;
            }
        }
        
        // 2. 计算哈希文件名
        const hash = getPathHash(originalPath);
        const filename = hash + ".jpg";
        
        let thumbFile;
        try {
            // 尝试先删除旧文件（如果存在）
            try {
                const oldEntry = await thumbFolder.getEntry(filename);
                if (oldEntry) await oldEntry.delete();
            } catch (e) { /* 忽略不存在 */ }
            
            thumbFile = await thumbFolder.createFile(filename, { overwrite: true });
        } catch (e) {
            console.error('[缩略图缓存] 创建文件失败:', e);
            return false;
        }

        const thumbToken = await fs.createSessionToken(thumbFile);
        
        // 3. 执行生成逻辑 (复制 -> 调整大小 -> 保存 -> 关闭)
        const task = async () => {
            // 复制文档
            await batchPlay([{
                _obj: "duplicate",
                _target: [{ _ref: "document", _enum: "ordinal", _value: "targetEnum" }],
                name: "temp_thumbnail_gen"
            }], {});
            
            try {
                // 获取当前文档（副本）尺寸
                const result = await batchPlay([{
                    _obj: "get",
                    _target: [{ _ref: "document", _enum: "ordinal", _value: "targetEnum" }],
                    _options: { dialogOptions: "dontDisplay" }
                }], {});
                
                let width = 0, height = 0;
                if (result && result[0]) {
                    width = result[0].width._value;
                    height = result[0].height._value;
                }
                
                let resizeCmd = {
                    _obj: "imageSize",
                    constrainProportions: true,
                    scaleStyles: true,
                    resampleMethod: { _enum: "samplingMethod", _value: "bicubicAutomatic" }
                };
                
                if (width >= height) {
                    resizeCmd.width = { _unit: "pixelsUnit", _value: 128 };
                } else {
                    resizeCmd.height = { _unit: "pixelsUnit", _value: 128 };
                }
                
                // 调整大小
                await batchPlay([resizeCmd], {});
                
                // 保存为 JPG
                await batchPlay([{
                    _obj: "save",
                    as: { _obj: "JPEG", quality: 8 },
                    in: { _path: thumbToken, _kind: "local" },
                    lowerCase: true,
                    saveStage: { _enum: "saveStageType", _value: "saveSucceeded" }
                }], {});
            } finally {
                // 无论成功失败，都尝试关闭副本 (不保存)
                try {
                    // 安全检查：确认当前文档是临时文档再关闭
                    const docCheck = await batchPlay([{
                        _obj: "get",
                        _target: [{ _ref: "document", _enum: "ordinal", _value: "targetEnum" }],
                        _options: { dialogOptions: "dontDisplay" }
                    }], {});

                    if (docCheck && docCheck[0] && docCheck[0].title === "temp_thumbnail_gen") {
                        await batchPlay([{
                            _obj: "close",
                            saving: { _enum: "yesNo", _value: "no" },
                            _target: [{ _ref: "document", _enum: "ordinal", _value: "targetEnum" }]
                        }], {});
                    } else {
                        console.warn('[缩略图缓存] 当前文档不是临时文档，跳过关闭操作');
                    }
                } catch (e) {
                    console.error('[缩略图缓存] 关闭临时文档失败:', e);
                }
            }
        };

        if (executeAsModal) {
            await executeAsModal(task, { commandName: "生成缩略图缓存" });
        } else {
            console.warn('[缩略图缓存] executeAsModal 不可用，尝试直接执行');
            await task();
        }
        
        console.log('[缩略图缓存] 生成成功:', filename);
        return true;
        
    } catch (error) {
        console.error('[缩略图缓存] 生成失败:', error);
        return false;
    }
}

// 删除缓存中的缩略图
async function deleteThumbnailFromCache(originalPath) {
    try {
        const fs = require('uxp').storage.localFileSystem;
        const dataFolder = await fs.getDataFolder();
        
        try {
            const thumbFolder = await dataFolder.getEntry("thumbnails");
            const hash = getPathHash(originalPath);
            const filename = hash + ".jpg";
            
            const file = await thumbFolder.getEntry(filename);
            if (file) {
                await file.delete();
                console.log('[缩略图缓存] 已删除缓存文件:', filename);
            }
        } catch (e) {
            // 文件不存在或文件夹不存在，忽略
        }
    } catch (error) {
        console.error('[缩略图缓存] 删除操作出错:', error);
    }
}

// 删除所有缩略图缓存
async function deleteAllThumbnails() {
    try {
        const fs = require('uxp').storage.localFileSystem;
        const dataFolder = await fs.getDataFolder();
        
        try {
            const thumbFolder = await dataFolder.getEntry("thumbnails");
            if (thumbFolder) {
                const entries = await thumbFolder.getEntries();
                for (const entry of entries) {
                    if (entry.isFile) {
                        await entry.delete();
                    }
                }
                console.log('[缩略图缓存] 已清空所有缓存文件');
            }
        } catch (e) {
            // 文件夹不存在，忽略
        }
    } catch (error) {
        console.error('[缩略图缓存] 清空操作出错:', error);
    }
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
        
        // 生成并保存缩略图缓存
        await saveThumbnailToCache(doc, savedPath);
        
        // 生成缩略图 (旧逻辑保留，但主要依赖缓存)
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

        // await showAlert('成功', `文档已另存为: ${docName}`);
    } catch (error) {
        // 忽略用户取消或拒绝的错误
        const errMsg = error.message || '';
        if (errMsg.toLowerCase().includes('cancel') || errMsg.toLowerCase().includes('reject')) {
            console.log('用户取消了保存操作');
            return;
        }
        console.error('保存文档失败:', error);
        await showAlert(t('error'), t('saveFail', error.message));
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
        
        // 生成并保存缩略图缓存
        await saveThumbnailToCache(doc, targetPath);
        
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
            renderThumbnails(targetPath);
            
            // 1.2秒后重新渲染以移除提示状态，确保提示消失
            setTimeout(() => {
                renderThumbnails();
            }, 1200);
        }

        // 成功时不弹窗，显示进度条动画
        // 动画已在 renderThumbnails 中通过 activePath 参数触发
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

// 异步加载缩略图
async function loadThumbnails() {
    console.log('[缩略图加载] 开始加载...');
    const uxp = require('uxp');
    const fs = uxp.storage.localFileSystem;
    const formats = uxp.storage.formats;
    
    let thumbFolder;
    try {
        const dataFolder = await fs.getDataFolder();
        thumbFolder = await dataFolder.getEntry("thumbnails");
    } catch (e) { 
        console.log('[缩略图加载] 缩略图文件夹不存在');
        return; 
    }

    const items = document.querySelectorAll('.thumbnail-image[data-hash]');
    console.log(`[缩略图加载] 发现 ${items.length} 个待加载项`);
    
    for (const item of items) {
        const hash = item.dataset.hash;
        if (!hash) continue;
        
        try {
            // console.log(`[缩略图加载] 尝试读取: ${hash}.jpg`);
            const file = await thumbFolder.getEntry(hash + ".jpg");
            const data = await file.read({format: formats.binary});
            // console.log(`[缩略图加载] 读取成功，大小: ${data.byteLength}`);
            const base64 = arrayBufferToBase64(data);
            
            if (base64) {
                // console.log(`[缩略图加载] Base64转换成功`);
                // 创建图片元素
                const img = document.createElement('img');
                img.src = `data:image/jpeg;base64,${base64}`;
                img.style.cssText = "width:100%;height:100%;object-fit:contain;border-radius:4px;position:absolute;top:0;left:0;";
                
                // 隐藏占位符
                const placeholder = item.querySelector('.thumb-placeholder');
                if (placeholder) placeholder.style.visibility = 'hidden';
                
                item.appendChild(img);
                item.removeAttribute('data-hash'); // 标记为已加载
            }
        } catch (e) {
            // 文件不存在或读取失败，保持占位符显示
            // 忽略文件不存在的错误，只记录其他错误
            if (e.message && e.message.includes('Could not find an entry')) {
                // console.log(`[缩略图加载] 缩略图不存在: ${hash}`);
            } else {
                console.log(`[缩略图加载] 加载失败 (${hash}):`, e);
            }
        }
    }
}

// 渲染缩略图
function renderThumbnails(activePath = null) {
    console.log('[渲染] 开始渲染缩略图...');
    
    const container = document.getElementById('thumbnailContainer');
    if (!container) {
        console.error('[渲染] ❌ 找不到容器元素 #thumbnailContainer');
        return;
    }
    
    // ... (省略日志)
    
    const history = getHistory();

    if (history.length === 0) {
        // ... (省略空状态)
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📁</div>
                <div>${t('noHistory')}</div>
                <div style="font-size: 11px; margin-top: 8px;">${t('addRecordHint')}</div>
                <div style="font-size: 10px; margin-top: 4px; color: var(--uxp-host-text-color-secondary);">${t('overwriteHint')}</div>
            </div>
        `;
        return;
    }

    // 直接用 HTML 渲染
    let html = '';
    
    history.forEach((record, index) => {
        // 权限状态
        const hasToken = !!record.token;
        const itemClass = hasToken ? 'thumbnail-item has-token' : 'thumbnail-item';

        // 获取文件扩展名
        let ext = record.format || 'FILE';
        if (!record.format) {
            const parts = record.path.split('.');
            if (parts.length > 1) {
                const possibleExt = parts.pop().toUpperCase();
                if (possibleExt.length <= 5 && !possibleExt.includes('/') && !possibleExt.includes('\\')) {
                    ext = possibleExt;
                }
            }
        }

        // 处理显示名称
        let displayName = record.filename;
        if (record.path) {
            const nameFromPath = record.path.split(/[/\\]/).pop();
            if (nameFromPath) {
                displayName = nameFromPath;
            }
        } else if (displayName && (displayName.includes('/') || displayName.includes('\\'))) {
            displayName = displayName.split(/[/\\]/).pop();
        }

        // 归一化路径用于比较
        const normalize = p => p ? p.replace(/\\/g, '/').toLowerCase() : '';
        const isActive = activePath && normalize(record.path) === normalize(activePath);

        // 成功提示 HTML
        let successOverlayHtml = '';
        if (isActive) {
             successOverlayHtml = `<div class="success-overlay">✔ ${t('saved')}</div>`;
        }
        
        // 权限指示点 HTML
        let tokenIndicatorHtml = '';
        if (hasToken) {
            tokenIndicatorHtml = '<div class="token-indicator" title="已获取写入权限"></div>';
        }

        // 缩略图哈希
        const hash = getPathHash(record.path);

        html += `
            <div class="${itemClass}" data-path="${record.path}" data-id="${record.id}">
                ${tokenIndicatorHtml}
                <button class="delete-btn">×</button>
                <div class="thumbnail-image" data-hash="${hash}" style="width: 100%; height: 64px; background: #333; display: flex; align-items: center; justify-content: center; color: #888; font-size: 20px; font-weight: bold; border-radius: 4px; margin-bottom: 6px; position: relative; overflow: hidden;">
                    <div class="thumb-placeholder" style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">${ext}</div>
                </div>
                <div class="thumbnail-info" style="width: 100%; text-align: center; overflow: hidden;">
                    <div style="font-size: 11px; color: #fff; margin: 2px 0; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${displayName}">${displayName}</div>
                    <div style="font-size: 9px; color: #aaa; margin: 1px 0;">${formatTime(record.timestamp)}</div>
                    <div style="font-size: 9px; color: #666;">${Math.round(record.width)}px × ${Math.round(record.height)}px</div>
                </div>
                ${successOverlayHtml}
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    // 异步加载缩略图
    setTimeout(loadThumbnails, 10);
    
    // 绑定事件
    const items = container.querySelectorAll('.thumbnail-item');
    items.forEach((item, index) => {
        const record = history[index];
        
        // 删除按钮
        const deleteBtn = item.querySelector('.delete-btn');
        deleteBtn.onclick = async (e) => {
            e.stopPropagation();
            const confirmed = await showConfirm(t('confirmDelete'), t('deleteMessage', record.filename));
            if (confirmed) {
                await removeFromHistory(record.id);
                renderThumbnails();
            }
        };
        
        // 鼠标悬停显示路径
        item.addEventListener('mouseenter', () => {
            const pathDisplay = document.getElementById('pathDisplay');
            if (pathDisplay) {
                // 优先显示路径，如果没有则显示文件名
                let text = record.path || record.filename || '无路径信息';
                
                // 确保显示扩展名：如果路径/文件名中没有点号，尝试追加格式
                if (text !== '无路径信息' && !text.includes('.')) {
                    const ext = record.format || 'psd'; // 默认追加 psd
                    text += '.' + ext;
                }

                pathDisplay.textContent = text;
                pathDisplay.title = text;
                // 确保文字颜色可见 (使用 CSS 变量适配主题)
                pathDisplay.style.color = 'var(--uxp-host-text-color)';
            }
        });
        
        item.addEventListener('mouseleave', () => {
            const pathDisplay = document.getElementById('pathDisplay');
            if (pathDisplay) {
                // 恢复为空，但保留占位符以防布局跳动
                pathDisplay.innerHTML = '&nbsp;';
                pathDisplay.title = '';
            }
        });

        // 双击事件
        item.ondblclick = async () => {
            const confirmed = await showConfirm(
                t('confirmOverwrite'),
                t('overwriteMessage', record.path)
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

        // 生成并保存缩略图缓存
        await saveThumbnailToCache(doc, savedPath);

        // 生成缩略图 (旧逻辑)
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
        
        // 初始化语言
        updateUILanguage();
        
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
                
                // 生成随机路径以支持多次测试添加不同记录
                const randomId = Math.floor(Math.random() * 100000);
                let basePath = docInfo.path;
                
                if (!basePath) {
                    basePath = "C:\\Test\\Untitled.psd";
                }
                
                // 构造带随机数的测试路径
                const lastDot = basePath.lastIndexOf('.');
                let testPath;
                if (lastDot > -1) {
                    testPath = basePath.substring(0, lastDot) + "_Test_" + randomId + basePath.substring(lastDot);
                } else {
                    testPath = basePath + "_Test_" + randomId;
                }
                
                console.log(`[测试] 生成随机路径: ${testPath}`);
                
                await recordDocumentToHistory('手动测试', testPath);
                console.log('测试记录已添加');
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
            const confirmed = await showConfirm(t('confirmClear'), t('clearMessage'));
            if (confirmed) {
                await clearHistory();
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

const { clipboard, app, desktopCapturer } = require('electron');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

// 确保在 DOM 加载完成后初始化 services
window.addEventListener('DOMContentLoaded', () => {
  // 清理临时文件（兼容版）
  const cleanupTempFiles = async (dir) => {
    try {
      const files = await fsPromises.readdir(dir);
      const now = Date.now();
      for (const file of files) {
        if (file.startsWith('qwen_ocr_')) {
          const filePath = path.join(dir, file);
          const stats = await fsPromises.stat(filePath);
          if (now - stats.mtimeMs > 3600000) { // 超过1小时
            await fsPromises.unlink(filePath);
          }
        }
      }
    } catch (error) {
      console.error('清理临时文件失败:', error);
    }
  };

  window.services = {
    // 获取设置（用 localStorage 替换 utools.dbStorage）
    getSettings: () => {
      try {
        const data = localStorage.getItem('qwen_ocr_settings');
        return data ? JSON.parse(data) : { tokens: [], prompt: '' };
      } catch (error) {
        console.error('获取设置失败:', error);
        return { tokens: [], prompt: '' };
      }
    },

    // 保存设置
    saveSettings: (settings) => {
      try {
        if (!settings || typeof settings !== 'object') {
          throw new Error('无效的设置对象');
        }
        if (typeof settings.tokens === 'string') {
          settings.tokens = settings.tokens.split(',').map(t => t.trim()).filter(t => t);
        }
        if (!Array.isArray(settings.tokens)) {
          settings.tokens = [];
        }
        localStorage.setItem('qwen_ocr_settings', JSON.stringify(settings));
      } catch (error) {
        console.error('保存设置失败:', error);
        throw error;
      }
    },

    // 获取随机 token
    getRandomToken: () => {
      try {
        const settings = window.services.getSettings();
        const tokens = settings.tokens;
        if (!tokens || tokens.length === 0) return null;
        return tokens[Math.floor(Math.random() * tokens.length)];
      } catch (error) {
        console.error('获取Token失败:', error);
        return null;
      }
    },

    // 复制文本到剪贴板（原样兼容）
    copyToClipboard: (text) => {
      try {
        if (typeof text !== 'string') {
          throw new Error('复制内容必须是字符串');
        }
        clipboard.writeText(text);
      } catch (error) {
        console.error('复制到剪贴板失败:', error);
        throw error;
      }
    },

    // 保存图片到临时文件（用 app.getPath 替换）
    saveTempImage: (base64Data) => {
      try {
        if (!base64Data || typeof base64Data !== 'string') {
          throw new Error('无效的图片数据');
        }
        const tempDir = app.getPath('temp');
        const imagePath = path.join(tempDir, `qwen_ocr_${Date.now()}.png`);
        const base64Image = base64Data.replace(/^data:image\/\w+;base64,/, '');
        fs.writeFileSync(imagePath, Buffer.from(base64Image, 'base64'));
        return imagePath;
      } catch (error) {
        console.error('保存临时图片失败:', error);
        throw error;
      }
    },

    // 从文件路径读取图片为 base64（原样）
    readImageAsBase64: (filePath) => {
      try {
        if (!filePath || typeof filePath !== 'string') {
          throw new Error('无效的文件路径');
        }
        const data = fs.readFileSync(filePath);
        return `data:image/png;base64,${data.toString('base64')}`;
      } catch (error) {
        console.error('读取图片失败:', error);
        throw error;
      }
    }
  };

  // 定期清理临时文件
  const tempDir = app.getPath('temp');
  cleanupTempFiles(tempDir);
  setInterval(() => cleanupTempFiles(tempDir), 3600000); // 每小时清理一次

  // 监听插件进入事件（Rubick 用事件监听替换）
  // 注意：Rubick 可能用 window.rubick.on('plugin-enter', ...) 或类似
  // 这里假设 Rubick 暴露了 rubick 对象；如果没有，需查 Rubick 文档或用 Electron ipcRenderer
  if (window.rubick) {
    window.rubick.on('plugin-enter', ({ code, type, payload }) => {
      try {
        console.log('Plugin enter event:', { code, type, payload });

        if (payload === '截图文字识别') {
          // 隐藏主窗口（用 rubick 或 Electron 方法）
          if (window.rubick && window.rubick.hideMainWindow) {
            window.rubick.hideMainWindow();
          }
          setTimeout(() => {
            // 截图（Rubick 如果有 screenCapture API，否则用 desktopCapturer 实现）
            // 简化版：假设 Rubick 有 rubick.screenCapture；否则需实现
            if (window.rubick && window.rubick.screenCapture) {
              window.rubick.screenCapture((imageBase64) => {
                if (window.rubick && window.rubick.showMainWindow) {
                  window.rubick.showMainWindow();
                }
                if (imageBase64 && window.processPluginImage) {
                  window.processPluginImage(imageBase64);
                }
              });
            } else {
              console.warn('Rubick screenCapture 未实现，使用 fallback');
              // fallback: 用 desktopCapturer 手动截全屏（需额外实现）
            }
          }, 100);
        }
        // 处理图片类型输入
        else if (type === 'img') {
          const imageData = payload; // base64
          console.log('Processing image from enter event');
          if (window.processPluginImage) {
            window.processPluginImage(imageData);
          }
        }
        // 处理文件类型输入
        else if (type === 'files' && Array.isArray(payload) && payload.length > 0) {
          const fileObj = payload[0];
          if (fileObj.isFile && /\.(jpg|jpeg|png|gif|bmp)$/i.test(fileObj.path)) {
            const imageData = window.services.readImageAsBase64(fileObj.path);
            if (window.processPluginImage) {
              window.processPluginImage(imageData);
            }
          }
        }
      } catch (error) {
        console.error('插件处理失败:', error);
      }
    });
  } else {
    console.error('Rubick 对象未暴露，无法监听 plugin-enter 事件');
  }
});

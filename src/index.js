// HTML Showing - Cloudflare Workers
// 在线HTML预览服务

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 处理CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // 主页面
      if (path === '/' || path === '/index.html') {
        return new Response(getMainHTML(), {
          headers: { 
            'Content-Type': 'text/html; charset=utf-8',
            ...corsHeaders
          }
        });
      }

      // 样式文件
      if (path === '/style.css') {
        return new Response(getCSS(), {
          headers: { 
            'Content-Type': 'text/css',
            ...corsHeaders
          }
        });
      }

      // JavaScript文件
      if (path === '/script.js') {
        return new Response(getJS(), {
          headers: { 
            'Content-Type': 'application/javascript',
            ...corsHeaders
          }
        });
      }

      // API: 上传HTML并生成预览链接
      if (path === '/api/upload' && request.method === 'POST') {
        const formData = await request.formData();
        const htmlContent = formData.get('html');
        
        if (!htmlContent) {
          return new Response(JSON.stringify({ error: '请提供HTML内容' }), {
            status: 400,
            headers: { 
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }

        // 生成唯一ID
        const previewId = generateUUID();
        
        // 存储到KV，设置1年过期时间 (365 * 24 * 60 * 60 = 31536000秒)
        await env.HTML_STORAGE.put(previewId, htmlContent, {
          expirationTtl: 31536000
        });

        const previewUrl = `${url.origin}/preview/${previewId}`;
        
        return new Response(JSON.stringify({ 
          success: true, 
          previewUrl: previewUrl,
          previewId: previewId
        }), {
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      // 预览页面
      if (path.startsWith('/preview/')) {
        const previewId = path.split('/preview/')[1];
        
        if (!previewId) {
          return new Response('预览ID无效', { status: 400 });
        }

        const htmlContent = await env.HTML_STORAGE.get(previewId);
        
        if (!htmlContent) {
          return new Response(getNotFoundHTML(), {
            status: 404,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        }

        return new Response(htmlContent, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      // 404页面
      return new Response('页面未找到', { status: 404 });

    } catch (error) {
      console.error('Error:', error);
      return new Response(JSON.stringify({ error: '服务器内部错误' }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  }
};

// 生成UUID
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 主页面HTML
function getMainHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HTML在线预览 - HTML Showing</title>
    <link rel="stylesheet" href="/style.css">
</head>
<body>
    <div class="container">
        <header>
            <h1>🌟 HTML在线预览</h1>
            <p>上传HTML文件或粘贴代码，生成在线预览链接</p>
        </header>

        <main>
            <div class="upload-section">
                <div class="tabs">
                    <button class="tab-btn active" data-tab="upload">📁 文件上传</button>
                    <button class="tab-btn" data-tab="paste">📝 代码粘贴</button>
                </div>

                <div class="tab-content active" id="upload-tab">
                    <div class="file-upload">
                        <input type="file" id="htmlFile" accept=".html,.htm" />
                        <label for="htmlFile" class="file-label">
                            <span class="file-icon">📄</span>
                            <span class="file-text">点击选择HTML文件</span>
                        </label>
                    </div>
                </div>

                <div class="tab-content" id="paste-tab">
                    <textarea id="htmlCode" placeholder="在这里粘贴你的HTML代码..."></textarea>
                </div>

                <button id="generateBtn" class="generate-btn" disabled>
                    🚀 生成预览链接
                </button>
            </div>

            <div class="result-section" id="resultSection" style="display: none;">
                <h3>✅ 预览链接生成成功！</h3>
                <div class="link-container">
                    <input type="text" id="previewLink" readonly />
                    <button id="copyBtn" class="copy-btn">📋 复制</button>
                </div>
                <div class="link-actions">
                    <a id="openLink" href="#" target="_blank" class="open-btn">🔗 打开预览</a>
                    <button id="newUpload" class="new-btn">🆕 新建预览</button>
                </div>
                <p class="expire-info">⏰ 链接有效期：1年</p>
            </div>

            <div class="loading" id="loading" style="display: none;">
                <div class="spinner"></div>
                <p>正在生成预览链接...</p>
            </div>
        </main>

        <footer>
            <p>💖 Powered by Cloudflare Workers</p>
        </footer>
    </div>

    <script src="/script.js"></script>
</body>
</html>`;
}

// 404页面HTML
function getNotFoundHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>预览不存在 - HTML Showing</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        .error-container { max-width: 500px; margin: 0 auto; }
        h1 { color: #e74c3c; font-size: 3em; margin-bottom: 20px; }
        p { color: #666; font-size: 1.2em; margin-bottom: 30px; }
        a { color: #3498db; text-decoration: none; font-weight: bold; }
        a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="error-container">
        <h1>😵 404</h1>
        <p>抱歉，您访问的预览链接不存在或已过期。</p>
        <p>预览链接的有效期为1年，过期后会自动删除。</p>
        <a href="/">← 返回首页创建新的预览</a>
    </div>
</body>
</html>`;
}

// CSS样式
function getCSS() {
  return `* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
    color: #333;
}

.container {
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
}

header {
    text-align: center;
    margin-bottom: 40px;
    color: white;
}

header h1 {
    font-size: 2.5em;
    margin-bottom: 10px;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
}

header p {
    font-size: 1.1em;
    opacity: 0.9;
}

main {
    flex: 1;
    background: white;
    border-radius: 15px;
    padding: 30px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
}

.tabs {
    display: flex;
    margin-bottom: 20px;
    border-bottom: 2px solid #f0f0f0;
}

.tab-btn {
    flex: 1;
    padding: 15px;
    border: none;
    background: none;
    font-size: 1.1em;
    cursor: pointer;
    transition: all 0.3s ease;
    border-bottom: 3px solid transparent;
}

.tab-btn.active {
    color: #667eea;
    border-bottom-color: #667eea;
    font-weight: bold;
}

.tab-btn:hover {
    background: #f8f9ff;
}

.tab-content {
    display: none;
    margin-bottom: 30px;
}

.tab-content.active {
    display: block;
}

.file-upload {
    text-align: center;
    padding: 40px 20px;
}

#htmlFile {
    display: none;
}

.file-label {
    display: inline-block;
    padding: 30px 40px;
    border: 3px dashed #667eea;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.3s ease;
    background: #f8f9ff;
}

.file-label:hover {
    border-color: #764ba2;
    background: #f0f4ff;
    transform: translateY(-2px);
}

.file-icon {
    font-size: 3em;
    display: block;
    margin-bottom: 10px;
}

.file-text {
    font-size: 1.2em;
    color: #667eea;
    font-weight: bold;
}

#htmlCode {
    width: 100%;
    height: 300px;
    padding: 20px;
    border: 2px solid #e0e0e0;
    border-radius: 10px;
    font-family: 'Courier New', monospace;
    font-size: 14px;
    resize: vertical;
    transition: border-color 0.3s ease;
}

#htmlCode:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 10px rgba(102, 126, 234, 0.2);
}

.generate-btn {
    width: 100%;
    padding: 15px;
    font-size: 1.2em;
    font-weight: bold;
    color: white;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border: none;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.3s ease;
}

.generate-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
}

.generate-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.result-section {
    text-align: center;
    padding: 30px;
    background: #f8f9ff;
    border-radius: 10px;
    margin-top: 20px;
}

.result-section h3 {
    color: #27ae60;
    margin-bottom: 20px;
    font-size: 1.5em;
}

.link-container {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
}

#previewLink {
    flex: 1;
    padding: 12px;
    border: 2px solid #e0e0e0;
    border-radius: 8px;
    font-size: 14px;
    background: white;
}

.copy-btn {
    padding: 12px 20px;
    background: #3498db;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: bold;
    transition: background 0.3s ease;
}

.copy-btn:hover {
    background: #2980b9;
}

.link-actions {
    display: flex;
    gap: 15px;
    justify-content: center;
    margin-bottom: 15px;
}

.open-btn, .new-btn {
    padding: 12px 25px;
    border-radius: 8px;
    text-decoration: none;
    font-weight: bold;
    transition: all 0.3s ease;
}

.open-btn {
    background: #27ae60;
    color: white;
}

.open-btn:hover {
    background: #229954;
    transform: translateY(-1px);
}

.new-btn {
    background: #e74c3c;
    color: white;
    border: none;
    cursor: pointer;
}

.new-btn:hover {
    background: #c0392b;
    transform: translateY(-1px);
}

.expire-info {
    color: #666;
    font-size: 0.9em;
}

.loading {
    text-align: center;
    padding: 40px;
}

.spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #f3f3f3;
    border-top: 4px solid #667eea;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 20px;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

footer {
    text-align: center;
    margin-top: 30px;
    color: white;
    opacity: 0.8;
}

@media (max-width: 600px) {
    .container {
        padding: 10px;
    }

    header h1 {
        font-size: 2em;
    }

    main {
        padding: 20px;
    }

    .link-container {
        flex-direction: column;
    }

    .link-actions {
        flex-direction: column;
    }
}`;
}

// JavaScript代码
function getJS() {
  return `document.addEventListener('DOMContentLoaded', function() {
    // 元素引用
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const htmlFile = document.getElementById('htmlFile');
    const htmlCode = document.getElementById('htmlCode');
    const generateBtn = document.getElementById('generateBtn');
    const resultSection = document.getElementById('resultSection');
    const loading = document.getElementById('loading');
    const previewLink = document.getElementById('previewLink');
    const copyBtn = document.getElementById('copyBtn');
    const openLink = document.getElementById('openLink');
    const newUpload = document.getElementById('newUpload');

    let currentHtmlContent = '';

    // 标签页切换
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            // 更新标签按钮状态
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // 更新标签内容显示
            tabContents.forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(tabId + '-tab').classList.add('active');

            // 检查是否有内容
            checkContent();
        });
    });

    // 文件上传处理
    htmlFile.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                currentHtmlContent = e.target.result;
                updateFileLabel(file.name);
                checkContent();
            };
            reader.readAsText(file);
        }
    });

    // 代码输入处理
    htmlCode.addEventListener('input', function() {
        currentHtmlContent = this.value;
        checkContent();
    });

    // 检查内容并更新按钮状态
    function checkContent() {
        const hasContent = currentHtmlContent.trim().length > 0;
        generateBtn.disabled = !hasContent;
    }

    // 更新文件标签显示
    function updateFileLabel(filename) {
        const fileText = document.querySelector('.file-text');
        fileText.textContent = '已选择: ' + filename;
        document.querySelector('.file-label').style.borderColor = '#27ae60';
        document.querySelector('.file-label').style.background = '#f0fff4';
    }

    // 生成预览链接
    generateBtn.addEventListener('click', async function() {
        if (!currentHtmlContent.trim()) {
            alert('请先上传HTML文件或输入HTML代码！');
            return;
        }

        // 显示加载状态
        loading.style.display = 'block';
        resultSection.style.display = 'none';
        generateBtn.disabled = true;

        try {
            const formData = new FormData();
            formData.append('html', currentHtmlContent);

            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                // 显示结果
                previewLink.value = result.previewUrl;
                openLink.href = result.previewUrl;

                loading.style.display = 'none';
                resultSection.style.display = 'block';
            } else {
                throw new Error(result.error || '生成预览链接失败');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('生成预览链接失败: ' + error.message);
            loading.style.display = 'none';
            generateBtn.disabled = false;
        }
    });

    // 复制链接
    copyBtn.addEventListener('click', async function() {
        try {
            await navigator.clipboard.writeText(previewLink.value);
            const originalText = copyBtn.textContent;
            copyBtn.textContent = '✅ 已复制';
            copyBtn.style.background = '#27ae60';

            setTimeout(() => {
                copyBtn.textContent = originalText;
                copyBtn.style.background = '#3498db';
            }, 2000);
        } catch (error) {
            // 降级方案
            previewLink.select();
            document.execCommand('copy');
            alert('链接已复制到剪贴板！');
        }
    });

    // 新建预览
    newUpload.addEventListener('click', function() {
        // 重置所有状态
        currentHtmlContent = '';
        htmlFile.value = '';
        htmlCode.value = '';

        // 重置文件标签
        const fileText = document.querySelector('.file-text');
        fileText.textContent = '点击选择HTML文件';
        document.querySelector('.file-label').style.borderColor = '#667eea';
        document.querySelector('.file-label').style.background = '#f8f9ff';

        // 隐藏结果区域
        resultSection.style.display = 'none';
        loading.style.display = 'none';

        // 重置按钮状态
        generateBtn.disabled = true;

        // 切换到第一个标签
        tabBtns[0].click();
    });

    // 拖拽上传支持
    const fileLabel = document.querySelector('.file-label');

    fileLabel.addEventListener('dragover', function(e) {
        e.preventDefault();
        this.style.borderColor = '#27ae60';
        this.style.background = '#f0fff4';
    });

    fileLabel.addEventListener('dragleave', function(e) {
        e.preventDefault();
        this.style.borderColor = '#667eea';
        this.style.background = '#f8f9ff';
    });

    fileLabel.addEventListener('drop', function(e) {
        e.preventDefault();
        this.style.borderColor = '#667eea';
        this.style.background = '#f8f9ff';

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.type === 'text/html' || file.name.endsWith('.html') || file.name.endsWith('.htm')) {
                htmlFile.files = files;
                htmlFile.dispatchEvent(new Event('change'));
            } else {
                alert('请选择HTML文件！');
            }
        }
    });
});`;
}

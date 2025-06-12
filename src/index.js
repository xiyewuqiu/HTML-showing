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

// 主页面HTML - 科技炫酷风
function getMainHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>⚡ HTML在线预览 - 科技版</title>
    <link rel="stylesheet" href="/style.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Fira+Code:wght@300;400;500&display=swap" rel="stylesheet">
</head>
<body>
    <div class="cyber-grid"></div>
    <div class="container">
        <header>
            <h1>⚡ HTML在线预览 ⚡</h1>
            <p>🚀 上传HTML文件或粘贴代码，生成炫酷预览链接 🚀</p>
        </header>

        <main>
            <div class="upload-section">
                <div class="tabs">
                    <button class="tab-btn active" data-tab="upload">⚡ 文件上传</button>
                    <button class="tab-btn" data-tab="paste">💻 代码输入</button>
                </div>

                <div class="tab-content active" id="upload-tab">
                    <div class="file-upload">
                        <input type="file" id="htmlFile" accept=".html,.htm" />
                        <label for="htmlFile" class="file-label">
                            <span class="file-icon">🔮</span>
                            <span class="file-text">选择HTML文件或拖拽到此处</span>
                        </label>
                    </div>
                </div>

                <div class="tab-content" id="paste-tab">
                    <textarea id="htmlCode" placeholder="// 在这里粘贴你的HTML代码...
// 支持完整的HTML、CSS、JavaScript
// 让科技为你的创意赋能 ⚡"></textarea>
                </div>

                <button id="generateBtn" class="generate-btn" disabled>
                    🚀 启动预览生成器 🚀
                </button>
            </div>

            <div class="result-section" id="resultSection" style="display: none;">
                <h3>⚡ 预览链接生成成功！⚡</h3>
                <div class="link-container">
                    <input type="text" id="previewLink" readonly />
                    <button id="copyBtn" class="copy-btn">📋 复制链接</button>
                </div>
                <div class="link-actions">
                    <a id="openLink" href="#" target="_blank" class="open-btn">🚀 启动预览</a>
                    <button id="newUpload" class="new-btn">🔄 重新开始</button>
                </div>
                <p class="expire-info">⏰ 链接有效期：365天 | 🔒 安全存储</p>
            </div>

            <div class="loading" id="loading" style="display: none;">
                <div class="spinner"></div>
                <p>⚡ 正在启动量子预览生成器... ⚡</p>
            </div>
        </main>

        <footer>
            <p>⚡ Powered by Cloudflare Workers ⚡</p>
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

// CSS样式 - 科技炫酷风
function getCSS() {
  return `* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Orbitron', 'Segoe UI', monospace, sans-serif;
    background:
        radial-gradient(circle at 20% 80%, #120458 0%, transparent 50%),
        radial-gradient(circle at 80% 20%, #421a78 0%, transparent 50%),
        radial-gradient(circle at 40% 40%, #1a0b3d 0%, transparent 50%),
        linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%);
    min-height: 100vh;
    color: #00ffff;
    overflow-x: hidden;
    position: relative;
}

/* 科技背景动画 */
body::before {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background:
        repeating-linear-gradient(
            90deg,
            transparent,
            transparent 98px,
            rgba(0, 255, 255, 0.03) 100px
        ),
        repeating-linear-gradient(
            0deg,
            transparent,
            transparent 98px,
            rgba(0, 255, 255, 0.03) 100px
        );
    pointer-events: none;
    z-index: 1;
}

/* 动态粒子效果 */
body::after {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-image:
        radial-gradient(2px 2px at 20px 30px, #00ffff, transparent),
        radial-gradient(2px 2px at 40px 70px, #ff00ff, transparent),
        radial-gradient(1px 1px at 90px 40px, #00ff00, transparent),
        radial-gradient(1px 1px at 130px 80px, #ffff00, transparent),
        radial-gradient(2px 2px at 160px 30px, #ff0080, transparent);
    background-repeat: repeat;
    background-size: 200px 100px;
    animation: sparkle 20s linear infinite;
    pointer-events: none;
    z-index: 1;
    opacity: 0.6;
}

@keyframes sparkle {
    from { transform: translateY(0px); }
    to { transform: translateY(-100px); }
}

.container {
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    position: relative;
    z-index: 2;
}

header {
    text-align: center;
    margin-bottom: 40px;
    color: #00ffff;
    position: relative;
}

header h1 {
    font-size: 2.8em;
    margin-bottom: 15px;
    font-weight: 700;
    text-shadow:
        0 0 10px #00ffff,
        0 0 20px #00ffff,
        0 0 40px #00ffff,
        0 0 80px #00ffff;
    animation: glow-pulse 2s ease-in-out infinite alternate;
    letter-spacing: 2px;
}

@keyframes glow-pulse {
    from {
        text-shadow:
            0 0 10px #00ffff,
            0 0 20px #00ffff,
            0 0 40px #00ffff,
            0 0 80px #00ffff;
    }
    to {
        text-shadow:
            0 0 5px #00ffff,
            0 0 10px #00ffff,
            0 0 20px #00ffff,
            0 0 40px #00ffff,
            0 0 80px #00ffff,
            0 0 120px #00ffff;
    }
}

header p {
    font-size: 1.2em;
    color: #80ffff;
    text-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
    font-weight: 300;
    letter-spacing: 1px;
}

main {
    flex: 1;
    background:
        linear-gradient(145deg, rgba(26, 26, 46, 0.9), rgba(22, 33, 62, 0.9));
    border: 1px solid rgba(0, 255, 255, 0.3);
    border-radius: 20px;
    padding: 35px;
    box-shadow:
        0 0 30px rgba(0, 255, 255, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.1),
        0 10px 50px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(10px);
    position: relative;
    overflow: hidden;
}

/* 主容器发光边框动画 */
main::before {
    content: '';
    position: absolute;
    top: -2px;
    left: -2px;
    right: -2px;
    bottom: -2px;
    background: linear-gradient(45deg, #00ffff, #ff00ff, #00ff00, #ffff00, #00ffff);
    border-radius: 22px;
    z-index: -1;
    animation: border-glow 3s linear infinite;
    opacity: 0.6;
}

@keyframes border-glow {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
}

.tabs {
    display: flex;
    margin-bottom: 25px;
    border-bottom: 2px solid rgba(0, 255, 255, 0.3);
    position: relative;
}

.tab-btn {
    flex: 1;
    padding: 18px;
    border: none;
    background: transparent;
    font-size: 1.1em;
    cursor: pointer;
    transition: all 0.4s ease;
    border-bottom: 3px solid transparent;
    color: #80ffff;
    font-weight: 500;
    letter-spacing: 1px;
    position: relative;
    overflow: hidden;
}

.tab-btn::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(0, 255, 255, 0.2), transparent);
    transition: left 0.5s;
}

.tab-btn:hover::before {
    left: 100%;
}

.tab-btn.active {
    color: #00ffff;
    border-bottom-color: #00ffff;
    font-weight: bold;
    text-shadow: 0 0 10px #00ffff;
    background: rgba(0, 255, 255, 0.1);
}

.tab-btn:hover {
    background: rgba(0, 255, 255, 0.05);
    color: #00ffff;
    transform: translateY(-2px);
}

.tab-content {
    display: none;
    margin-bottom: 35px;
    animation: fadeIn 0.5s ease-in-out;
}

.tab-content.active {
    display: block;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
}

.file-upload {
    text-align: center;
    padding: 50px 25px;
}

#htmlFile {
    display: none;
}

.file-label {
    display: inline-block;
    padding: 40px 50px;
    border: 3px dashed #00ffff;
    border-radius: 15px;
    cursor: pointer;
    transition: all 0.4s ease;
    background:
        linear-gradient(145deg, rgba(0, 255, 255, 0.05), rgba(255, 0, 255, 0.05));
    position: relative;
    overflow: hidden;
    backdrop-filter: blur(5px);
}

.file-label::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(45deg, #00ffff, #ff00ff, #00ffff);
    opacity: 0;
    transition: opacity 0.3s ease;
    z-index: -1;
}

.file-label:hover {
    border-color: #ff00ff;
    background: rgba(0, 255, 255, 0.1);
    transform: translateY(-5px) scale(1.02);
    box-shadow:
        0 10px 30px rgba(0, 255, 255, 0.3),
        0 0 50px rgba(255, 0, 255, 0.2);
}

.file-label:hover::before {
    opacity: 0.1;
}

.file-icon {
    font-size: 4em;
    display: block;
    margin-bottom: 15px;
    color: #00ffff;
    text-shadow: 0 0 20px #00ffff;
    animation: float 3s ease-in-out infinite;
}

@keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-10px); }
}

.file-text {
    font-size: 1.3em;
    color: #00ffff;
    font-weight: bold;
    text-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
    letter-spacing: 1px;
}

#htmlCode {
    width: 100%;
    height: 320px;
    padding: 25px;
    border: 2px solid rgba(0, 255, 255, 0.3);
    border-radius: 15px;
    font-family: 'Fira Code', 'Courier New', monospace;
    font-size: 14px;
    resize: vertical;
    transition: all 0.4s ease;
    background:
        linear-gradient(145deg, rgba(26, 26, 46, 0.8), rgba(22, 33, 62, 0.8));
    color: #00ffff;
    backdrop-filter: blur(5px);
}

#htmlCode:focus {
    outline: none;
    border-color: #ff00ff;
    box-shadow:
        0 0 20px rgba(0, 255, 255, 0.4),
        0 0 40px rgba(255, 0, 255, 0.2),
        inset 0 0 20px rgba(0, 255, 255, 0.1);
    background:
        linear-gradient(145deg, rgba(26, 26, 46, 0.9), rgba(22, 33, 62, 0.9));
}

#htmlCode::placeholder {
    color: rgba(128, 255, 255, 0.6);
}

.generate-btn {
    width: 100%;
    padding: 18px;
    font-size: 1.3em;
    font-weight: bold;
    color: #000;
    background: linear-gradient(45deg, #00ffff, #ff00ff, #00ff00, #ffff00);
    background-size: 300% 300%;
    border: none;
    border-radius: 15px;
    cursor: pointer;
    transition: all 0.4s ease;
    position: relative;
    overflow: hidden;
    text-transform: uppercase;
    letter-spacing: 2px;
    animation: gradient-shift 3s ease infinite;
}

@keyframes gradient-shift {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
}

.generate-btn::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
    transition: left 0.5s;
}

.generate-btn:hover:not(:disabled)::before {
    left: 100%;
}

.generate-btn:hover:not(:disabled) {
    transform: translateY(-3px) scale(1.02);
    box-shadow:
        0 10px 30px rgba(0, 255, 255, 0.4),
        0 0 50px rgba(255, 0, 255, 0.3);
}

.generate-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    background: linear-gradient(45deg, #333, #555);
    animation: none;
}

.result-section {
    text-align: center;
    padding: 35px;
    background:
        linear-gradient(145deg, rgba(0, 255, 0, 0.1), rgba(0, 255, 255, 0.1));
    border: 1px solid rgba(0, 255, 0, 0.3);
    border-radius: 15px;
    margin-top: 25px;
    backdrop-filter: blur(10px);
    position: relative;
    overflow: hidden;
}

.result-section::before {
    content: '';
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background:
        radial-gradient(circle, rgba(0, 255, 0, 0.1) 0%, transparent 70%);
    animation: success-pulse 4s ease-in-out infinite;
    z-index: -1;
}

@keyframes success-pulse {
    0%, 100% { transform: scale(0.8) rotate(0deg); opacity: 0.3; }
    50% { transform: scale(1.2) rotate(180deg); opacity: 0.6; }
}

.result-section h3 {
    color: #00ff00;
    margin-bottom: 25px;
    font-size: 1.6em;
    text-shadow: 0 0 15px #00ff00;
    animation: success-glow 2s ease-in-out infinite alternate;
}

@keyframes success-glow {
    from { text-shadow: 0 0 15px #00ff00; }
    to { text-shadow: 0 0 25px #00ff00, 0 0 35px #00ff00; }
}

.link-container {
    display: flex;
    gap: 12px;
    margin-bottom: 25px;
}

#previewLink {
    flex: 1;
    padding: 15px;
    border: 2px solid rgba(0, 255, 255, 0.4);
    border-radius: 10px;
    font-size: 14px;
    background:
        linear-gradient(145deg, rgba(26, 26, 46, 0.8), rgba(22, 33, 62, 0.8));
    color: #00ffff;
    font-family: 'Fira Code', monospace;
    backdrop-filter: blur(5px);
}

.copy-btn {
    padding: 15px 25px;
    background: linear-gradient(45deg, #00ffff, #0080ff);
    color: #000;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    font-weight: bold;
    transition: all 0.4s ease;
    text-transform: uppercase;
    letter-spacing: 1px;
    position: relative;
    overflow: hidden;
}

.copy-btn::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
    transition: left 0.5s;
}

.copy-btn:hover::before {
    left: 100%;
}

.copy-btn:hover {
    background: linear-gradient(45deg, #0080ff, #00ffff);
    transform: translateY(-2px);
    box-shadow: 0 5px 20px rgba(0, 255, 255, 0.4);
}

.link-actions {
    display: flex;
    gap: 20px;
    justify-content: center;
    margin-bottom: 20px;
}

.open-btn, .new-btn {
    padding: 15px 30px;
    border-radius: 12px;
    text-decoration: none;
    font-weight: bold;
    transition: all 0.4s ease;
    text-transform: uppercase;
    letter-spacing: 1px;
    position: relative;
    overflow: hidden;
}

.open-btn {
    background: linear-gradient(45deg, #00ff00, #00ff80);
    color: #000;
    border: 1px solid rgba(0, 255, 0, 0.5);
}

.open-btn::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
    transition: left 0.5s;
}

.open-btn:hover::before {
    left: 100%;
}

.open-btn:hover {
    background: linear-gradient(45deg, #00ff80, #00ff00);
    transform: translateY(-3px);
    box-shadow: 0 8px 25px rgba(0, 255, 0, 0.4);
}

.new-btn {
    background: linear-gradient(45deg, #ff0080, #ff00ff);
    color: #fff;
    border: 1px solid rgba(255, 0, 128, 0.5);
    cursor: pointer;
}

.new-btn::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
    transition: left 0.5s;
}

.new-btn:hover::before {
    left: 100%;
}

.new-btn:hover {
    background: linear-gradient(45deg, #ff00ff, #ff0080);
    transform: translateY(-3px);
    box-shadow: 0 8px 25px rgba(255, 0, 255, 0.4);
}

.expire-info {
    color: #80ffff;
    font-size: 1em;
    text-shadow: 0 0 10px rgba(128, 255, 255, 0.5);
    font-weight: 300;
}

.loading {
    text-align: center;
    padding: 50px;
    color: #00ffff;
}

.loading p {
    color: #80ffff;
    font-size: 1.1em;
    text-shadow: 0 0 10px rgba(128, 255, 255, 0.5);
    margin-top: 20px;
    animation: loading-text 2s ease-in-out infinite;
}

@keyframes loading-text {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
}

.spinner {
    width: 60px;
    height: 60px;
    border: 4px solid rgba(0, 255, 255, 0.2);
    border-top: 4px solid #00ffff;
    border-right: 4px solid #ff00ff;
    border-bottom: 4px solid #00ff00;
    border-left: 4px solid #ffff00;
    border-radius: 50%;
    animation: cyber-spin 1.5s linear infinite;
    margin: 0 auto 20px;
    position: relative;
}

.spinner::before {
    content: '';
    position: absolute;
    top: -8px;
    left: -8px;
    right: -8px;
    bottom: -8px;
    border: 2px solid transparent;
    border-top: 2px solid rgba(0, 255, 255, 0.4);
    border-radius: 50%;
    animation: cyber-spin 2s linear infinite reverse;
}

@keyframes cyber-spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

footer {
    text-align: center;
    margin-top: 40px;
    color: #80ffff;
    font-size: 1.1em;
    text-shadow: 0 0 10px rgba(128, 255, 255, 0.3);
    position: relative;
}

footer::before {
    content: '⚡';
    margin-right: 10px;
    animation: electric 2s ease-in-out infinite;
}

footer::after {
    content: '⚡';
    margin-left: 10px;
    animation: electric 2s ease-in-out infinite 1s;
}

@keyframes electric {
    0%, 100% { opacity: 0.5; transform: scale(1); }
    50% { opacity: 1; transform: scale(1.2); }
}

/* 响应式设计 */
@media (max-width: 768px) {
    .container {
        padding: 15px;
    }

    header h1 {
        font-size: 2.2em;
    }

    main {
        padding: 25px;
    }

    .link-container {
        flex-direction: column;
        gap: 15px;
    }

    .link-actions {
        flex-direction: column;
        gap: 15px;
    }

    .tabs {
        flex-direction: column;
    }

    .tab-btn {
        border-bottom: none;
        border-right: 3px solid transparent;
    }

    .tab-btn.active {
        border-right-color: #00ffff;
        border-bottom: none;
    }
}

@media (max-width: 480px) {
    header h1 {
        font-size: 1.8em;
    }

    main {
        padding: 20px;
    }

    .file-label {
        padding: 30px 25px;
    }

    .file-icon {
        font-size: 3em;
    }

    .generate-btn {
        font-size: 1.1em;
        padding: 15px;
    }
}

/* 额外的科技效果 */
.cyber-grid {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-image:
        linear-gradient(rgba(0, 255, 255, 0.1) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0, 255, 255, 0.1) 1px, transparent 1px);
    background-size: 50px 50px;
    pointer-events: none;
    z-index: 0;
    animation: grid-move 20s linear infinite;
}

@keyframes grid-move {
    0% { transform: translate(0, 0); }
    100% { transform: translate(50px, 50px); }
}

/* 鼠标悬停时的粒子效果 */
.particle-effect {
    position: absolute;
    width: 4px;
    height: 4px;
    background: #00ffff;
    border-radius: 50%;
    pointer-events: none;
    animation: particle-float 2s ease-out forwards;
}

@keyframes particle-float {
    0% {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
    100% {
        opacity: 0;
        transform: translateY(-100px) scale(0);
    }
}

/* 滚动条美化 */
::-webkit-scrollbar {
    width: 12px;
}

::-webkit-scrollbar-track {
    background: rgba(26, 26, 46, 0.8);
    border-radius: 6px;
}

::-webkit-scrollbar-thumb {
    background: linear-gradient(45deg, #00ffff, #ff00ff);
    border-radius: 6px;
    border: 2px solid rgba(26, 26, 46, 0.8);
}

::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(45deg, #ff00ff, #00ffff);
}

/* 选中文本的样式 */
::selection {
    background: rgba(0, 255, 255, 0.3);
    color: #00ffff;
}

::-moz-selection {
    background: rgba(0, 255, 255, 0.3);
    color: #00ffff;
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
        fileText.textContent = '⚡ 已加载: ' + filename;
        const label = document.querySelector('.file-label');
        label.style.borderColor = '#00ff00';
        label.style.background = 'linear-gradient(145deg, rgba(0, 255, 0, 0.1), rgba(0, 255, 255, 0.1))';
        label.style.boxShadow = '0 0 20px rgba(0, 255, 0, 0.3)';

        // 添加成功动画效果
        label.style.animation = 'success-flash 0.5s ease-in-out';
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

    // 复制链接 - 科技版
    copyBtn.addEventListener('click', async function() {
        try {
            await navigator.clipboard.writeText(previewLink.value);
            const originalText = copyBtn.textContent;
            copyBtn.textContent = '⚡ 已复制';
            copyBtn.style.background = 'linear-gradient(45deg, #00ff00, #00ff80)';
            copyBtn.style.boxShadow = '0 0 20px rgba(0, 255, 0, 0.5)';

            // 添加粒子效果
            createParticleEffect(copyBtn);

            setTimeout(() => {
                copyBtn.textContent = originalText;
                copyBtn.style.background = 'linear-gradient(45deg, #00ffff, #0080ff)';
                copyBtn.style.boxShadow = 'none';
            }, 2000);
        } catch (error) {
            // 降级方案
            previewLink.select();
            document.execCommand('copy');
            showNotification('⚡ 链接已复制到剪贴板！');
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
        fileText.textContent = '选择HTML文件或拖拽到此处';
        const label = document.querySelector('.file-label');
        label.style.borderColor = '#00ffff';
        label.style.background = 'linear-gradient(145deg, rgba(0, 255, 255, 0.05), rgba(255, 0, 255, 0.05))';
        label.style.boxShadow = 'none';
        label.style.animation = 'none';

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

    // 科技感辅助函数

    // 创建粒子效果
    function createParticleEffect(element) {
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        for (let i = 0; i < 12; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle-effect';
            particle.style.left = centerX + 'px';
            particle.style.top = centerY + 'px';
            particle.style.background = ['#00ffff', '#ff00ff', '#00ff00', '#ffff00'][i % 4];

            const angle = (i / 12) * Math.PI * 2;
            const distance = 50 + Math.random() * 30;
            const finalX = centerX + Math.cos(angle) * distance;
            const finalY = centerY + Math.sin(angle) * distance;

            particle.style.setProperty('--final-x', finalX + 'px');
            particle.style.setProperty('--final-y', finalY + 'px');

            document.body.appendChild(particle);

            setTimeout(() => {
                if (particle.parentNode) {
                    particle.parentNode.removeChild(particle);
                }
            }, 2000);
        }
    }

    // 显示科技感通知
    function showNotification(message) {
        const notification = document.createElement('div');
        notification.style.cssText = \`
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(45deg, #00ffff, #ff00ff);
            color: #000;
            padding: 15px 25px;
            border-radius: 10px;
            font-weight: bold;
            z-index: 10000;
            animation: slideIn 0.5s ease-out;
            box-shadow: 0 0 20px rgba(0, 255, 255, 0.5);
        \`;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.5s ease-in forwards';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 500);
        }, 3000);
    }

    // 添加鼠标跟踪效果
    document.addEventListener('mousemove', function(e) {
        if (Math.random() < 0.02) { // 2% 概率生成粒子
            const particle = document.createElement('div');
            particle.style.cssText = \`
                position: fixed;
                width: 2px;
                height: 2px;
                background: #00ffff;
                border-radius: 50%;
                pointer-events: none;
                z-index: 1;
                left: \${e.clientX}px;
                top: \${e.clientY}px;
                animation: mouseFade 1s ease-out forwards;
            \`;
            document.body.appendChild(particle);

            setTimeout(() => {
                if (particle.parentNode) {
                    particle.parentNode.removeChild(particle);
                }
            }, 1000);
        }
    });
});

// 添加额外的CSS动画
const additionalStyles = \`
@keyframes success-flash {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
}

@keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
}

@keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
}

@keyframes mouseFade {
    0% { opacity: 1; transform: scale(1); }
    100% { opacity: 0; transform: scale(0); }
}
\`;

// 动态添加样式
const styleSheet = document.createElement('style');
styleSheet.textContent = additionalStyles;
document.head.appendChild(styleSheet);`;
}

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

      // API: 上传代码文件并生成预览链接
      if (path === '/api/upload' && request.method === 'POST') {
        const formData = await request.formData();
        const content = formData.get('html') || formData.get('content');
        const fileType = formData.get('fileType') || 'html';

        if (!content) {
          return new Response(JSON.stringify({ error: '请提供文件内容' }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }

        // 生成唯一ID
        const previewId = generateUUID();

        // 创建文件信息对象
        const fileInfo = {
          content: content,
          fileType: fileType,
          uploadTime: new Date().toISOString(),
          originalSize: content.length,
          stats: {
            views: 0,
            lastViewed: null,
            firstViewed: null,
            uniqueVisitors: [],
            dailyViews: {},
            referrers: {},
            userAgents: {}
          }
        };

        // 存储到KV，设置1年过期时间 (365 * 24 * 60 * 60 = 31536000秒)
        await env.HTML_STORAGE.put(previewId, JSON.stringify(fileInfo), {
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

        const storedData = await env.HTML_STORAGE.get(previewId);

        if (!storedData) {
          return new Response(getNotFoundHTML(), {
            status: 404,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        }

        let fileInfo;
        try {
          fileInfo = JSON.parse(storedData);
        } catch (e) {
          // 兼容旧格式（直接存储HTML内容）
          fileInfo = {
            content: storedData,
            fileType: 'html',
            uploadTime: new Date().toISOString(),
            originalSize: storedData.length,
            stats: {
              views: 0,
              lastViewed: null,
              firstViewed: null,
              uniqueVisitors: [],
              dailyViews: {},
              referrers: {},
              userAgents: {}
            }
          };
        }

        // 更新访问统计
        await updateViewStats(env, previewId, fileInfo, request);

        const { content, fileType } = fileInfo;

        // 根据文件类型返回适当的预览
        return new Response(generatePreviewHTML(content, fileType, previewId), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      // API: 获取预览统计
      if (path.startsWith('/api/stats/') && request.method === 'GET') {
        const previewId = path.split('/api/stats/')[1];

        if (!previewId) {
          return new Response(JSON.stringify({ error: '预览ID无效' }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }

        const storedData = await env.HTML_STORAGE.get(previewId);

        if (!storedData) {
          return new Response(JSON.stringify({ error: '预览不存在' }), {
            status: 404,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }

        let fileInfo;
        try {
          fileInfo = JSON.parse(storedData);
        } catch (e) {
          return new Response(JSON.stringify({ error: '数据格式错误' }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }

        // 返回统计信息
        const stats = fileInfo.stats || {
          views: 0,
          lastViewed: null,
          firstViewed: null,
          uniqueVisitors: [],
          dailyViews: {},
          referrers: {},
          userAgents: {}
        };

        return new Response(JSON.stringify({
          success: true,
          previewId: previewId,
          fileType: fileInfo.fileType,
          uploadTime: fileInfo.uploadTime,
          stats: {
            ...stats,
            uniqueVisitors: stats.uniqueVisitors.length // 只返回数量，不返回具体IP
          }
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
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

// 更新访问统计
async function updateViewStats(env, previewId, fileInfo, request) {
  try {
    // 获取访问者信息
    const clientIP = request.headers.get('CF-Connecting-IP') ||
                     request.headers.get('X-Forwarded-For') ||
                     'unknown';
    const userAgent = request.headers.get('User-Agent') || 'unknown';
    const referer = request.headers.get('Referer') || 'direct';

    // 初始化统计对象
    if (!fileInfo.stats) {
      fileInfo.stats = {
        views: 0,
        lastViewed: null,
        firstViewed: null,
        uniqueVisitors: [],
        dailyViews: {},
        referrers: {},
        userAgents: {}
      };
    }

    const now = new Date();
    const today = now.toISOString().split('T')[0]; // YYYY-MM-DD格式
    const timestamp = now.toISOString();

    // 更新基本统计
    fileInfo.stats.views++;
    fileInfo.stats.lastViewed = timestamp;

    if (!fileInfo.stats.firstViewed) {
      fileInfo.stats.firstViewed = timestamp;
    }

    // 更新唯一访问者（使用IP的哈希值保护隐私）
    const visitorHash = await hashString(clientIP);
    if (!fileInfo.stats.uniqueVisitors.includes(visitorHash)) {
      fileInfo.stats.uniqueVisitors.push(visitorHash);

      // 限制存储的唯一访问者数量（最多1000个）
      if (fileInfo.stats.uniqueVisitors.length > 1000) {
        fileInfo.stats.uniqueVisitors = fileInfo.stats.uniqueVisitors.slice(-1000);
      }
    }

    // 更新每日访问统计
    if (!fileInfo.stats.dailyViews[today]) {
      fileInfo.stats.dailyViews[today] = 0;
    }
    fileInfo.stats.dailyViews[today]++;

    // 清理超过30天的每日统计
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const cutoffDate = thirtyDaysAgo.toISOString().split('T')[0];
    Object.keys(fileInfo.stats.dailyViews).forEach(date => {
      if (date < cutoffDate) {
        delete fileInfo.stats.dailyViews[date];
      }
    });

    // 更新来源统计
    const refererDomain = extractDomain(referer);
    if (!fileInfo.stats.referrers[refererDomain]) {
      fileInfo.stats.referrers[refererDomain] = 0;
    }
    fileInfo.stats.referrers[refererDomain]++;

    // 更新用户代理统计（简化版本）
    const simplifiedUA = simplifyUserAgent(userAgent);
    if (!fileInfo.stats.userAgents[simplifiedUA]) {
      fileInfo.stats.userAgents[simplifiedUA] = 0;
    }
    fileInfo.stats.userAgents[simplifiedUA]++;

    // 限制统计对象的大小
    limitStatsSize(fileInfo.stats);

    // 保存更新后的数据
    await env.HTML_STORAGE.put(previewId, JSON.stringify(fileInfo), {
      expirationTtl: 31536000 // 1年
    });

  } catch (error) {
    console.error('更新统计失败:', error);
    // 统计更新失败不应该影响正常访问
  }
}

// 生成字符串哈希值（用于保护IP隐私）
async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

// 提取域名
function extractDomain(url) {
  if (url === 'direct' || !url) return 'direct';
  try {
    const domain = new URL(url).hostname;
    return domain.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

// 简化用户代理字符串
function simplifyUserAgent(ua) {
  if (!ua || ua === 'unknown') return 'unknown';

  // 检测主要浏览器
  if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('Opera')) return 'Opera';

  // 检测移动设备
  if (ua.includes('Mobile')) return 'Mobile';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';

  return 'Other';
}

// 限制统计对象大小
function limitStatsSize(stats) {
  // 限制来源统计数量
  const refererEntries = Object.entries(stats.referrers);
  if (refererEntries.length > 100) {
    // 保留访问量最高的100个来源
    const topReferrers = refererEntries
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100);
    stats.referrers = Object.fromEntries(topReferrers);
  }

  // 限制用户代理统计数量
  const uaEntries = Object.entries(stats.userAgents);
  if (uaEntries.length > 50) {
    const topUAs = uaEntries
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50);
    stats.userAgents = Object.fromEntries(topUAs);
  }
}

// 生成不同文件类型的预览HTML
function generatePreviewHTML(content, fileType, previewId) {
  switch (fileType) {
    case 'html':
      return content;

    case 'css':
      return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CSS预览 - ${previewId}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .preview-container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .preview-header {
            background: linear-gradient(45deg, #667eea, #764ba2);
            color: white;
            padding: 20px;
            text-align: center;
        }
        .preview-content {
            padding: 30px;
        }
        .demo-section {
            margin-bottom: 30px;
            padding: 20px;
            border: 2px dashed #ddd;
            border-radius: 10px;
        }
        .demo-title {
            color: #333;
            margin-bottom: 15px;
            font-size: 18px;
            font-weight: bold;
        }
    </style>
    <style>
        /* 用户的CSS代码 */
        ${content}
    </style>
</head>
<body>
    <div class="preview-container">
        <div class="preview-header">
            <h1>🎨 CSS样式预览</h1>
            <p>以下是您的CSS代码的预览效果</p>
        </div>
        <div class="preview-content">
            <div class="demo-section">
                <div class="demo-title">HTML元素示例</div>
                <h1>这是一级标题</h1>
                <h2>这是二级标题</h2>
                <h3>这是三级标题</h3>
                <p>这是一个段落文本，用于展示您的CSS样式效果。</p>
                <div class="example-div">这是一个div元素</div>
                <span class="example-span">这是一个span元素</span>
                <ul>
                    <li>列表项目1</li>
                    <li>列表项目2</li>
                    <li>列表项目3</li>
                </ul>
                <button class="example-button">示例按钮</button>
                <input type="text" placeholder="输入框示例" class="example-input">
            </div>
        </div>
    </div>
</body>
</html>`;

    case 'javascript':
      return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JavaScript预览 - ${previewId}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .preview-container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .preview-header {
            background: linear-gradient(45deg, #f7df1e, #f0db4f);
            color: #333;
            padding: 20px;
            text-align: center;
        }
        .preview-content {
            padding: 30px;
        }
        .console-output {
            background: #1e1e1e;
            color: #d4d4d4;
            padding: 20px;
            border-radius: 10px;
            font-family: 'Courier New', monospace;
            margin: 20px 0;
            max-height: 300px;
            overflow-y: auto;
        }
        .demo-section {
            margin-bottom: 30px;
            padding: 20px;
            border: 2px dashed #ddd;
            border-radius: 10px;
        }
        .run-button {
            background: #f7df1e;
            color: #333;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
            margin: 10px 5px;
        }
        .run-button:hover {
            background: #f0db4f;
        }
    </style>
</head>
<body>
    <div class="preview-container">
        <div class="preview-header">
            <h1>⚡ JavaScript代码预览</h1>
            <p>以下是您的JavaScript代码的执行结果</p>
        </div>
        <div class="preview-content">
            <div class="demo-section">
                <h3>控制台输出</h3>
                <div id="console-output" class="console-output">
                    <div>JavaScript控制台输出将显示在这里...</div>
                </div>
                <button class="run-button" onclick="runUserCode()">🚀 运行代码</button>
                <button class="run-button" onclick="clearConsole()">🗑️ 清空控制台</button>
            </div>
            <div class="demo-section">
                <h3>交互演示区域</h3>
                <div id="demo-area">
                    <p>JavaScript代码可以在这里操作DOM元素</p>
                    <button id="demo-button">点击我</button>
                    <div id="demo-output"></div>
                </div>
            </div>
        </div>
    </div>

    <script>
        // 重写console.log以显示在页面上
        const originalConsoleLog = console.log;
        const consoleOutput = document.getElementById('console-output');

        console.log = function(...args) {
            originalConsoleLog.apply(console, args);
            const message = args.map(arg =>
                typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
            ).join(' ');

            const logElement = document.createElement('div');
            logElement.textContent = '> ' + message;
            logElement.style.marginBottom = '5px';
            consoleOutput.appendChild(logElement);
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
        };

        function clearConsole() {
            consoleOutput.innerHTML = '<div>控制台已清空...</div>';
        }

        function runUserCode() {
            try {
                console.log('=== 开始执行用户代码 ===');
                ${content}
                console.log('=== 代码执行完成 ===');
            } catch (error) {
                console.log('❌ 执行错误: ' + error.message);
            }
        }

        // 页面加载时自动运行一次
        window.addEventListener('load', function() {
            setTimeout(runUserCode, 500);
        });
    </script>
</body>
</html>`;

    case 'json':
      return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JSON预览 - ${previewId}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .preview-container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .preview-header {
            background: linear-gradient(45deg, #ff6b6b, #ee5a24);
            color: white;
            padding: 20px;
            text-align: center;
        }
        .json-viewer {
            padding: 30px;
            font-family: 'Courier New', monospace;
            background: #f8f9fa;
            white-space: pre-wrap;
            overflow-x: auto;
            line-height: 1.6;
        }
        .json-key { color: #d73a49; font-weight: bold; }
        .json-string { color: #032f62; }
        .json-number { color: #005cc5; }
        .json-boolean { color: #e36209; }
        .json-null { color: #6f42c1; }
        .json-bracket { color: #24292e; font-weight: bold; }
        .stats {
            padding: 20px;
            background: #f1f3f4;
            border-top: 1px solid #e1e4e8;
        }
        .stat-item {
            display: inline-block;
            margin: 5px 15px 5px 0;
            padding: 5px 10px;
            background: white;
            border-radius: 5px;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="preview-container">
        <div class="preview-header">
            <h1>📋 JSON数据预览</h1>
            <p>格式化显示您的JSON数据</p>
        </div>
        <div class="json-viewer" id="json-content"></div>
        <div class="stats" id="json-stats"></div>
    </div>

    <script>
        function formatJSON(jsonString) {
            try {
                const parsed = JSON.parse(jsonString);
                return JSON.stringify(parsed, null, 2);
            } catch (e) {
                return jsonString;
            }
        }

        function highlightJSON(json) {
            return json
                .replace(/(".*?")(\s*:)/g, '<span class="json-key">$1</span>$2')
                .replace(/:\s*(".*?")/g, ': <span class="json-string">$1</span>')
                .replace(/:\s*(\d+\.?\d*)/g, ': <span class="json-number">$1</span>')
                .replace(/:\s*(true|false)/g, ': <span class="json-boolean">$1</span>')
                .replace(/:\s*(null)/g, ': <span class="json-null">$1</span>')
                .replace(/([{}\\[\\]])/g, '<span class="json-bracket">$1</span>');
        }

        function analyzeJSON(jsonString) {
            try {
                const parsed = JSON.parse(jsonString);
                const stats = {
                    size: jsonString.length,
                    keys: 0,
                    arrays: 0,
                    objects: 0,
                    strings: 0,
                    numbers: 0,
                    booleans: 0,
                    nulls: 0
                };

                function analyze(obj) {
                    if (Array.isArray(obj)) {
                        stats.arrays++;
                        obj.forEach(analyze);
                    } else if (obj !== null && typeof obj === 'object') {
                        stats.objects++;
                        Object.keys(obj).forEach(key => {
                            stats.keys++;
                            analyze(obj[key]);
                        });
                    } else if (typeof obj === 'string') {
                        stats.strings++;
                    } else if (typeof obj === 'number') {
                        stats.numbers++;
                    } else if (typeof obj === 'boolean') {
                        stats.booleans++;
                    } else if (obj === null) {
                        stats.nulls++;
                    }
                }

                analyze(parsed);
                return stats;
            } catch (e) {
                return null;
            }
        }

        const jsonContent = \`${content.replace(/`/g, '\\`')}\`;
        const formatted = formatJSON(jsonContent);
        const highlighted = highlightJSON(formatted);
        const stats = analyzeJSON(jsonContent);

        document.getElementById('json-content').innerHTML = highlighted;

        if (stats) {
            document.getElementById('json-stats').innerHTML = \`
                <div class="stat-item">📏 大小: \${stats.size} 字符</div>
                <div class="stat-item">🔑 键: \${stats.keys}</div>
                <div class="stat-item">📦 对象: \${stats.objects}</div>
                <div class="stat-item">📋 数组: \${stats.arrays}</div>
                <div class="stat-item">📝 字符串: \${stats.strings}</div>
                <div class="stat-item">🔢 数字: \${stats.numbers}</div>
                <div class="stat-item">✅ 布尔: \${stats.booleans}</div>
                <div class="stat-item">❌ 空值: \${stats.nulls}</div>
            \`;
        }
    </script>
</body>
</html>`;

    case 'xml':
      return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>XML预览 - ${previewId}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .preview-container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .preview-header {
            background: linear-gradient(45deg, #26de81, #20bf6b);
            color: white;
            padding: 20px;
            text-align: center;
        }
        .xml-viewer {
            padding: 30px;
            font-family: 'Courier New', monospace;
            background: #f8f9fa;
            white-space: pre-wrap;
            overflow-x: auto;
            line-height: 1.6;
        }
        .xml-tag { color: #d73a49; font-weight: bold; }
        .xml-attribute { color: #005cc5; }
        .xml-text { color: #24292e; }
        .xml-comment { color: #6a737d; font-style: italic; }
        .xml-declaration { color: #e36209; font-weight: bold; }
        .stats {
            padding: 20px;
            background: #f1f3f4;
            border-top: 1px solid #e1e4e8;
        }
        .stat-item {
            display: inline-block;
            margin: 5px 15px 5px 0;
            padding: 5px 10px;
            background: white;
            border-radius: 5px;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="preview-container">
        <div class="preview-header">
            <h1>📄 XML文档预览</h1>
            <p>格式化显示您的XML文档</p>
        </div>
        <div class="xml-viewer" id="xml-content"></div>
        <div class="stats" id="xml-stats"></div>
    </div>

    <script>
        function formatXML(xmlString) {
            const formatted = xmlString.replace(/(>)(<)(\\/?)/g, '$1\\n$2$3');
            const lines = formatted.split('\\n');
            let indent = 0;
            const indentedLines = lines.map(line => {
                if (line.match(/<\\//)) indent--;
                const indentedLine = '  '.repeat(Math.max(0, indent)) + line.trim();
                if (line.match(/<[^?!][^>]*[^/]>/)) indent++;
                return indentedLine;
            });
            return indentedLines.join('\\n');
        }

        function highlightXML(xml) {
            return xml
                .replace(/(&lt;\\?xml.*?\\?&gt;)/g, '<span class="xml-declaration">$1</span>')
                .replace(/(&lt;!--.*?--&gt;)/gs, '<span class="xml-comment">$1</span>')
                .replace(/(&lt;\\/?[^&gt;]+&gt;)/g, '<span class="xml-tag">$1</span>')
                .replace(/(\\w+)=("[^"]*")/g, '<span class="xml-attribute">$1</span>=<span class="xml-attribute">$2</span>');
        }

        function analyzeXML(xmlString) {
            const stats = {
                size: xmlString.length,
                lines: xmlString.split('\\n').length,
                elements: (xmlString.match(/<[^!?][^>]*>/g) || []).length,
                attributes: (xmlString.match(/\\w+="/g) || []).length,
                comments: (xmlString.match(/<!--.*?-->/gs) || []).length
            };
            return stats;
        }

        const xmlContent = \`${content.replace(/`/g, '\\`').replace(/</g, '&lt;').replace(/>/g, '&gt;')}\`;
        const formatted = formatXML(xmlContent);
        const highlighted = highlightXML(formatted);
        const stats = analyzeXML(xmlContent);

        document.getElementById('xml-content').innerHTML = highlighted;
        document.getElementById('xml-stats').innerHTML = \`
            <div class="stat-item">📏 大小: \${stats.size} 字符</div>
            <div class="stat-item">📄 行数: \${stats.lines}</div>
            <div class="stat-item">🏷️ 元素: \${stats.elements}</div>
            <div class="stat-item">⚙️ 属性: \${stats.attributes}</div>
            <div class="stat-item">💬 注释: \${stats.comments}</div>
        \`;
    </script>
</body>
</html>`;

    case 'svg':
      return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SVG预览 - ${previewId}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .preview-container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .preview-header {
            background: linear-gradient(45deg, #fd79a8, #e84393);
            color: white;
            padding: 20px;
            text-align: center;
        }
        .svg-display {
            padding: 30px;
            text-align: center;
            background: #f8f9fa;
            min-height: 300px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .svg-code {
            padding: 20px;
            background: #1e1e1e;
            color: #d4d4d4;
            font-family: 'Courier New', monospace;
            overflow-x: auto;
            white-space: pre-wrap;
            font-size: 14px;
        }
        .toggle-button {
            background: #fd79a8;
            color: white;
            border: none;
            padding: 10px 20px;
            margin: 10px;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
        }
        .toggle-button:hover {
            background: #e84393;
        }
        .stats {
            padding: 20px;
            background: #f1f3f4;
            border-top: 1px solid #e1e4e8;
        }
        .stat-item {
            display: inline-block;
            margin: 5px 15px 5px 0;
            padding: 5px 10px;
            background: white;
            border-radius: 5px;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="preview-container">
        <div class="preview-header">
            <h1>🎨 SVG图形预览</h1>
            <p>显示您的SVG矢量图形</p>
            <button class="toggle-button" onclick="toggleView()">🔄 切换视图</button>
        </div>
        <div class="svg-display" id="svg-display">
            ${content}
        </div>
        <div class="svg-code" id="svg-code" style="display: none;">
            ${content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
        </div>
        <div class="stats" id="svg-stats"></div>
    </div>

    <script>
        let showingCode = false;

        function toggleView() {
            const display = document.getElementById('svg-display');
            const code = document.getElementById('svg-code');
            const button = document.querySelector('.toggle-button');

            if (showingCode) {
                display.style.display = 'flex';
                code.style.display = 'none';
                button.textContent = '🔄 查看代码';
                showingCode = false;
            } else {
                display.style.display = 'none';
                code.style.display = 'block';
                button.textContent = '🔄 查看图形';
                showingCode = true;
            }
        }

        function analyzeSVG(svgString) {
            const stats = {
                size: svgString.length,
                elements: (svgString.match(/<[^!?][^>]*>/g) || []).length,
                paths: (svgString.match(/<path/g) || []).length,
                circles: (svgString.match(/<circle/g) || []).length,
                rects: (svgString.match(/<rect/g) || []).length,
                lines: (svgString.match(/<line/g) || []).length,
                polygons: (svgString.match(/<polygon/g) || []).length
            };
            return stats;
        }

        const svgContent = \`${content.replace(/`/g, '\\`')}\`;
        const stats = analyzeSVG(svgContent);

        document.getElementById('svg-stats').innerHTML = \`
            <div class="stat-item">📏 大小: \${stats.size} 字符</div>
            <div class="stat-item">🏷️ 元素: \${stats.elements}</div>
            <div class="stat-item">🛤️ 路径: \${stats.paths}</div>
            <div class="stat-item">⭕ 圆形: \${stats.circles}</div>
            <div class="stat-item">⬜ 矩形: \${stats.rects}</div>
            <div class="stat-item">📏 直线: \${stats.lines}</div>
            <div class="stat-item">🔷 多边形: \${stats.polygons}</div>
        \`;
    </script>
</body>
</html>`;

    default:
      // 对于其他文件类型，显示为纯文本
      return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>文件预览 - ${previewId}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .preview-container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .preview-header {
            background: linear-gradient(45deg, #74b9ff, #0984e3);
            color: white;
            padding: 20px;
            text-align: center;
        }
        .text-content {
            padding: 30px;
            font-family: 'Courier New', monospace;
            background: #f8f9fa;
            white-space: pre-wrap;
            overflow-x: auto;
            line-height: 1.6;
            font-size: 14px;
        }
        .stats {
            padding: 20px;
            background: #f1f3f4;
            border-top: 1px solid #e1e4e8;
        }
        .stat-item {
            display: inline-block;
            margin: 5px 15px 5px 0;
            padding: 5px 10px;
            background: white;
            border-radius: 5px;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="preview-container">
        <div class="preview-header">
            <h1>📄 文本文件预览</h1>
            <p>文件类型: ${fileType.toUpperCase()}</p>
        </div>
        <div class="text-content">${content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
        <div class="stats">
            <div class="stat-item">📏 大小: ${content.length} 字符</div>
            <div class="stat-item">📄 行数: ${content.split('\n').length}</div>
            <div class="stat-item">📝 类型: ${fileType.toUpperCase()}</div>
        </div>
    </div>
</body>
</html>`;
  }
}

// 主页面HTML - 科技炫酷风
function getMainHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>⚡ 多格式代码预览 - 科技版</title>
    <link rel="stylesheet" href="/style.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Fira+Code:wght@300;400;500&display=swap" rel="stylesheet">
    <!-- Monaco Editor -->
    <script src="https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs/loader.js"></script>
</head>
<body>
    <div class="cyber-grid"></div>
    <div class="container">
        <header>
            <h1>⚡ 多格式代码预览 ⚡</h1>
            <p>🚀 支持HTML、CSS、JS、JSON、XML、SVG等多种格式预览 🚀</p>
        </header>

        <main>
            <div class="upload-section">
                <div class="tabs">
                    <button class="tab-btn active" data-tab="upload">⚡ 文件上传</button>
                    <button class="tab-btn" data-tab="paste">💻 代码输入</button>
                    <button class="tab-btn" data-tab="history">📚 历史记录</button>
                </div>

                <div class="tab-content active" id="upload-tab">
                    <div class="upload-mode-selector">
                        <label class="upload-mode-option">
                            <input type="radio" name="uploadMode" value="single" checked>
                            <span class="mode-label">📄 单文件上传</span>
                        </label>
                        <label class="upload-mode-option">
                            <input type="radio" name="uploadMode" value="batch">
                            <span class="mode-label">📁 批量上传</span>
                        </label>
                    </div>

                    <div class="file-upload" id="singleUpload">
                        <input type="file" id="htmlFile" accept=".html,.htm,.css,.js,.xml,.json,.svg,text/*" />
                        <label for="htmlFile" class="file-label">
                            <span class="file-icon">🔮</span>
                            <span class="file-text">选择代码文件或拖拽到此处</span>
                            <span class="file-hint">支持 HTML, CSS, JS, XML, JSON, SVG</span>
                        </label>
                    </div>

                    <div class="file-upload" id="batchUpload" style="display: none;">
                        <input type="file" id="batchFiles" accept=".html,.htm,.css,.js,.xml,.json,.svg,text/*" multiple />
                        <label for="batchFiles" class="file-label batch-label">
                            <span class="file-icon">📁</span>
                            <span class="file-text">选择多个文件或拖拽文件夹到此处</span>
                            <span class="file-hint">支持同时上传多个文件，最多20个</span>
                        </label>
                        <div class="batch-file-list" id="batchFileList"></div>
                    </div>
                </div>

                <div class="tab-content" id="paste-tab">
                    <div class="editor-container">
                        <div class="editor-toolbar">
                            <select id="languageSelect" class="language-selector">
                                <option value="html">HTML</option>
                                <option value="css">CSS</option>
                                <option value="javascript">JavaScript</option>
                                <option value="xml">XML</option>
                                <option value="json">JSON</option>
                            </select>
                            <button id="formatCode" class="format-btn">🎨 格式化代码</button>
                        </div>
                        <div id="monacoEditor" class="monaco-editor-container"></div>
                        <textarea id="htmlCode" placeholder="// 在这里粘贴你的HTML代码...
// 支持完整的HTML、CSS、JavaScript
// 让科技为你的创意赋能 ⚡" style="display: none;"></textarea>
                    </div>
                </div>

                <div class="tab-content" id="history-tab">
                    <div class="history-container">
                        <div class="history-header">
                            <h3>📚 预览历史记录</h3>
                            <div class="history-actions">
                                <button id="clearHistory" class="clear-history-btn">🗑️ 清空历史</button>
                                <button id="exportHistory" class="export-history-btn">📤 导出历史</button>
                            </div>
                        </div>
                        <div class="history-stats">
                            <span class="stat-item">📊 总计: <span id="historyCount">0</span> 个预览</span>
                            <span class="stat-item">💾 存储: <span id="historySize">0</span> KB</span>
                        </div>
                        <div class="history-search">
                            <input type="text" id="historySearch" placeholder="🔍 搜索历史记录..." class="history-search-input">
                            <select id="historyFilter" class="history-filter">
                                <option value="all">全部类型</option>
                                <option value="html">HTML</option>
                                <option value="css">CSS</option>
                                <option value="javascript">JavaScript</option>
                                <option value="json">JSON</option>
                                <option value="xml">XML</option>
                                <option value="svg">SVG</option>
                            </select>
                        </div>
                        <div class="history-list" id="historyList">
                            <div class="history-empty">
                                <div class="empty-icon">📝</div>
                                <p>还没有预览历史记录</p>
                                <p>创建第一个预览来开始记录吧！</p>
                            </div>
                        </div>
                    </div>
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
                <p id="loadingText">⚡ 正在启动量子预览生成器... ⚡</p>
                <div class="loading-progress">
                    <div class="progress-bar" id="progressBar"></div>
                </div>
            </div>

            <!-- 通知系统 -->
            <div id="notificationContainer" class="notification-container"></div>

            <!-- 错误详情模态框 -->
            <div id="errorModal" class="error-modal" style="display: none;">
                <div class="error-modal-content">
                    <div class="error-modal-header">
                        <h3>❌ 错误详情</h3>
                        <button class="error-modal-close" onclick="closeErrorModal()">✕</button>
                    </div>
                    <div class="error-modal-body">
                        <div id="errorDetails"></div>
                        <div class="error-actions">
                            <button class="retry-btn" onclick="retryLastAction()">🔄 重试</button>
                            <button class="report-btn" onclick="reportError()">📧 报告问题</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 统计详情模态框 -->
            <div id="statsModal" class="stats-modal" style="display: none;">
                <div class="stats-modal-content">
                    <div class="stats-modal-header">
                        <h3>📊 预览统计</h3>
                        <button class="stats-modal-close" onclick="closeStatsModal()">✕</button>
                    </div>
                    <div class="stats-modal-body">
                        <div class="stats-loading" id="statsLoading">
                            <div class="spinner"></div>
                            <p>正在加载统计数据...</p>
                        </div>
                        <div class="stats-content" id="statsContent" style="display: none;">
                            <div class="stats-overview">
                                <div class="stat-card">
                                    <div class="stat-icon">👁️</div>
                                    <div class="stat-info">
                                        <div class="stat-value" id="totalViews">0</div>
                                        <div class="stat-label">总访问量</div>
                                    </div>
                                </div>
                                <div class="stat-card">
                                    <div class="stat-icon">👥</div>
                                    <div class="stat-info">
                                        <div class="stat-value" id="uniqueVisitors">0</div>
                                        <div class="stat-label">独立访客</div>
                                    </div>
                                </div>
                                <div class="stat-card">
                                    <div class="stat-icon">📅</div>
                                    <div class="stat-info">
                                        <div class="stat-value" id="lastViewed">-</div>
                                        <div class="stat-label">最后访问</div>
                                    </div>
                                </div>
                                <div class="stat-card">
                                    <div class="stat-icon">🚀</div>
                                    <div class="stat-info">
                                        <div class="stat-value" id="firstViewed">-</div>
                                        <div class="stat-label">首次访问</div>
                                    </div>
                                </div>
                            </div>
                            <div class="stats-charts">
                                <div class="chart-section">
                                    <h4>📈 每日访问趋势</h4>
                                    <div class="daily-chart" id="dailyChart"></div>
                                </div>
                                <div class="chart-section">
                                    <h4>🌐 访问来源</h4>
                                    <div class="referrer-chart" id="referrerChart"></div>
                                </div>
                                <div class="chart-section">
                                    <h4>💻 浏览器分布</h4>
                                    <div class="browser-chart" id="browserChart"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
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

/* 上传模式选择器 */
.upload-mode-selector {
    display: flex;
    gap: 20px;
    justify-content: center;
    margin-bottom: 30px;
    padding: 20px;
    background: linear-gradient(145deg, rgba(0, 255, 255, 0.05), rgba(255, 0, 255, 0.05));
    border-radius: 15px;
    border: 1px solid rgba(0, 255, 255, 0.2);
}

.upload-mode-option {
    display: flex;
    align-items: center;
    cursor: pointer;
    padding: 12px 20px;
    border-radius: 10px;
    transition: all 0.3s ease;
    border: 2px solid transparent;
}

.upload-mode-option:hover {
    background: rgba(0, 255, 255, 0.1);
    border-color: rgba(0, 255, 255, 0.3);
}

.upload-mode-option input[type="radio"] {
    display: none;
}

.upload-mode-option input[type="radio"]:checked + .mode-label {
    color: #00ffff;
    text-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
    font-weight: bold;
}

.upload-mode-option input[type="radio"]:checked {
    & + .mode-label::before {
        content: '✓ ';
        color: #00ff00;
        font-weight: bold;
    }
}

.mode-label {
    color: #80ffff;
    font-size: 16px;
    font-weight: 500;
    letter-spacing: 1px;
    transition: all 0.3s ease;
}

.file-upload {
    text-align: center;
    padding: 50px 25px;
}

.batch-label {
    background: linear-gradient(145deg, rgba(255, 0, 255, 0.05), rgba(0, 255, 255, 0.05));
    border-color: #ff00ff;
}

.batch-label:hover {
    border-color: #00ffff;
    background: rgba(255, 0, 255, 0.1);
    box-shadow:
        0 10px 30px rgba(255, 0, 255, 0.3),
        0 0 50px rgba(0, 255, 255, 0.2);
}

.batch-file-list {
    margin-top: 25px;
    max-height: 300px;
    overflow-y: auto;
    text-align: left;
}

.batch-file-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    margin-bottom: 8px;
    background: linear-gradient(145deg, rgba(26, 26, 46, 0.6), rgba(22, 33, 62, 0.6));
    border: 1px solid rgba(0, 255, 255, 0.2);
    border-radius: 10px;
    transition: all 0.3s ease;
}

.batch-file-item:hover {
    border-color: rgba(0, 255, 255, 0.5);
    background: linear-gradient(145deg, rgba(26, 26, 46, 0.8), rgba(22, 33, 62, 0.8));
    transform: translateX(5px);
}

.batch-file-info {
    display: flex;
    align-items: center;
    flex: 1;
}

.batch-file-icon {
    font-size: 20px;
    margin-right: 12px;
}

.batch-file-details {
    flex: 1;
}

.batch-file-name {
    color: #00ffff;
    font-weight: bold;
    font-size: 14px;
    margin-bottom: 4px;
}

.batch-file-meta {
    color: #80ffff;
    font-size: 12px;
    opacity: 0.8;
}

.batch-file-status {
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1px;
}

.batch-file-status.pending {
    background: rgba(255, 255, 0, 0.2);
    color: #ffff00;
    border: 1px solid rgba(255, 255, 0, 0.3);
}

.batch-file-status.processing {
    background: rgba(0, 255, 255, 0.2);
    color: #00ffff;
    border: 1px solid rgba(0, 255, 255, 0.3);
    animation: pulse-glow 1.5s ease-in-out infinite;
}

.batch-file-status.success {
    background: rgba(0, 255, 0, 0.2);
    color: #00ff00;
    border: 1px solid rgba(0, 255, 0, 0.3);
}

.batch-file-status.error {
    background: rgba(255, 0, 0, 0.2);
    color: #ff4757;
    border: 1px solid rgba(255, 0, 0, 0.3);
}

.batch-file-remove {
    background: none;
    border: none;
    color: #ff4757;
    cursor: pointer;
    font-size: 16px;
    padding: 4px;
    border-radius: 4px;
    transition: all 0.3s ease;
    margin-left: 8px;
}

.batch-file-remove:hover {
    background: rgba(255, 71, 87, 0.2);
    transform: scale(1.2);
}

@keyframes pulse-glow {
    0%, 100% {
        box-shadow: 0 0 5px rgba(0, 255, 255, 0.3);
        transform: scale(1);
    }
    50% {
        box-shadow: 0 0 15px rgba(0, 255, 255, 0.6);
        transform: scale(1.05);
    }
}

/* 批量结果样式 */
.batch-results {
    background: linear-gradient(145deg, rgba(0, 255, 0, 0.05), rgba(0, 255, 255, 0.05));
    border: 1px solid rgba(0, 255, 0, 0.3);
    border-radius: 15px;
    padding: 25px;
    margin-top: 20px;
}

.batch-results-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding-bottom: 15px;
    border-bottom: 2px solid rgba(0, 255, 255, 0.3);
}

.batch-results-header h3 {
    color: #00ff00;
    margin: 0;
    font-size: 1.4em;
    text-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
}

.batch-stats {
    display: flex;
    gap: 15px;
}

.stat-success, .stat-error {
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: bold;
}

.stat-success {
    background: rgba(0, 255, 0, 0.2);
    color: #00ff00;
    border: 1px solid rgba(0, 255, 0, 0.3);
}

.stat-error {
    background: rgba(255, 0, 0, 0.2);
    color: #ff4757;
    border: 1px solid rgba(255, 0, 0, 0.3);
}

.batch-results-list {
    max-height: 400px;
    overflow-y: auto;
    margin-bottom: 20px;
}

.batch-result-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    margin-bottom: 8px;
    border-radius: 10px;
    transition: all 0.3s ease;
}

.batch-result-item.success {
    background: linear-gradient(145deg, rgba(0, 255, 0, 0.1), rgba(0, 255, 255, 0.1));
    border: 1px solid rgba(0, 255, 0, 0.3);
}

.batch-result-item.error {
    background: linear-gradient(145deg, rgba(255, 0, 0, 0.1), rgba(255, 100, 100, 0.1));
    border: 1px solid rgba(255, 0, 0, 0.3);
}

.batch-result-item:hover {
    transform: translateX(5px);
    box-shadow: 0 5px 15px rgba(0, 255, 255, 0.2);
}

.result-info {
    display: flex;
    align-items: center;
    flex: 1;
}

.result-icon {
    font-size: 18px;
    margin-right: 12px;
}

.result-name {
    color: #00ffff;
    font-weight: bold;
    margin-right: 12px;
}

.result-type {
    background: rgba(0, 255, 255, 0.2);
    color: #00ffff;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: bold;
    margin-right: 12px;
}

.result-error {
    color: #ff4757;
    font-size: 12px;
    opacity: 0.9;
    margin-left: 12px;
}

.result-actions {
    display: flex;
    gap: 8px;
}

.result-btn {
    padding: 6px 12px;
    border: 1px solid rgba(0, 255, 255, 0.3);
    border-radius: 6px;
    background: rgba(0, 255, 255, 0.1);
    color: #00ffff;
    cursor: pointer;
    font-size: 11px;
    font-weight: bold;
    transition: all 0.3s ease;
}

.result-btn:hover {
    background: rgba(0, 255, 255, 0.2);
    border-color: rgba(0, 255, 255, 0.5);
    transform: translateY(-1px);
}

.batch-results-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
    padding-top: 15px;
    border-top: 1px solid rgba(0, 255, 255, 0.3);
}

.batch-action-btn {
    padding: 10px 20px;
    border: 1px solid rgba(0, 255, 255, 0.3);
    border-radius: 8px;
    background: linear-gradient(45deg, rgba(0, 255, 255, 0.1), rgba(255, 0, 255, 0.1));
    color: #00ffff;
    cursor: pointer;
    font-weight: bold;
    transition: all 0.3s ease;
    font-size: 14px;
}

.batch-action-btn:hover {
    background: linear-gradient(45deg, rgba(0, 255, 255, 0.2), rgba(255, 0, 255, 0.2));
    border-color: rgba(0, 255, 255, 0.5);
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(0, 255, 255, 0.3);
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
    display: block;
    margin-bottom: 8px;
}

.file-hint {
    font-size: 0.9em;
    color: #80ffff;
    font-weight: normal;
    opacity: 0.8;
    display: block;
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

/* Monaco Editor 样式 */
.editor-container {
    border: 2px solid rgba(0, 255, 255, 0.3);
    border-radius: 15px;
    overflow: hidden;
    background: linear-gradient(145deg, rgba(26, 26, 46, 0.8), rgba(22, 33, 62, 0.8));
    backdrop-filter: blur(5px);
    transition: all 0.4s ease;
}

.editor-container:focus-within {
    border-color: #ff00ff;
    box-shadow:
        0 0 20px rgba(0, 255, 255, 0.4),
        0 0 40px rgba(255, 0, 255, 0.2),
        inset 0 0 20px rgba(0, 255, 255, 0.1);
}

.editor-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 20px;
    background: linear-gradient(90deg, rgba(0, 255, 255, 0.1), rgba(255, 0, 255, 0.1));
    border-bottom: 1px solid rgba(0, 255, 255, 0.2);
}

.language-selector {
    padding: 8px 15px;
    border: 1px solid rgba(0, 255, 255, 0.3);
    border-radius: 8px;
    background: linear-gradient(145deg, rgba(26, 26, 46, 0.9), rgba(22, 33, 62, 0.9));
    color: #00ffff;
    font-family: 'Fira Code', monospace;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.3s ease;
}

.language-selector:focus {
    outline: none;
    border-color: #ff00ff;
    box-shadow: 0 0 10px rgba(255, 0, 255, 0.3);
}

.language-selector option {
    background: rgba(26, 26, 46, 0.95);
    color: #00ffff;
}

.format-btn {
    padding: 8px 16px;
    border: 1px solid rgba(0, 255, 255, 0.3);
    border-radius: 8px;
    background: linear-gradient(45deg, #00ffff, #0080ff);
    color: #000;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.3s ease;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
}

.format-btn:hover {
    background: linear-gradient(45deg, #0080ff, #00ffff);
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(0, 255, 255, 0.3);
}

.monaco-editor-container {
    height: 320px;
    width: 100%;
    position: relative;
}

/* Monaco Editor 主题自定义 */
.monaco-editor {
    background: transparent !important;
}

.monaco-editor .margin {
    background: rgba(26, 26, 46, 0.5) !important;
}

.monaco-editor .monaco-editor-background {
    background: linear-gradient(145deg, rgba(26, 26, 46, 0.8), rgba(22, 33, 62, 0.8)) !important;
}

.monaco-editor .current-line {
    background: rgba(0, 255, 255, 0.1) !important;
    border: none !important;
}

.monaco-editor .line-numbers {
    color: rgba(0, 255, 255, 0.6) !important;
}

.monaco-editor .cursor {
    color: #00ffff !important;
}

.monaco-editor .selected-text {
    background: rgba(0, 255, 255, 0.2) !important;
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

.loading-progress {
    width: 200px;
    height: 4px;
    background: rgba(0, 255, 255, 0.2);
    border-radius: 2px;
    margin: 20px auto 0;
    overflow: hidden;
}

.progress-bar {
    height: 100%;
    background: linear-gradient(90deg, #00ffff, #ff00ff, #00ff00, #ffff00);
    background-size: 200% 100%;
    border-radius: 2px;
    animation: progress-flow 2s linear infinite;
    width: 0%;
    transition: width 0.3s ease;
}

@keyframes progress-flow {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
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

    /* Monaco编辑器移动端适配 */
    .monaco-editor-container {
        height: 250px;
    }

    .editor-toolbar {
        flex-direction: column;
        gap: 10px;
        align-items: stretch;
    }

    .language-selector,
    .format-btn {
        width: 100%;
        text-align: center;
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

    /* 小屏幕Monaco编辑器优化 */
    .monaco-editor-container {
        height: 200px;
    }

    .editor-toolbar {
        padding: 8px 15px;
    }

    .language-selector,
    .format-btn {
        padding: 6px 12px;
        font-size: 12px;
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
}

/* 通知系统样式 */
.notification-container {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10000;
    max-width: 400px;
}

.notification {
    background: linear-gradient(145deg, rgba(26, 26, 46, 0.95), rgba(22, 33, 62, 0.95));
    border: 1px solid rgba(0, 255, 255, 0.3);
    border-radius: 12px;
    padding: 16px 20px;
    margin-bottom: 12px;
    color: #00ffff;
    font-size: 14px;
    box-shadow:
        0 8px 32px rgba(0, 0, 0, 0.3),
        0 0 20px rgba(0, 255, 255, 0.2);
    backdrop-filter: blur(10px);
    transform: translateX(100%);
    animation: slideInNotification 0.5s ease-out forwards;
    position: relative;
    overflow: hidden;
}

.notification::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, #00ffff, #ff00ff, #00ff00, #ffff00);
    background-size: 200% 100%;
    animation: notification-glow 2s linear infinite;
}

.notification.success {
    border-color: rgba(0, 255, 0, 0.5);
    color: #00ff00;
}

.notification.success::before {
    background: linear-gradient(90deg, #00ff00, #00ff80);
}

.notification.warning {
    border-color: rgba(255, 255, 0, 0.5);
    color: #ffff00;
}

.notification.warning::before {
    background: linear-gradient(90deg, #ffff00, #ff8000);
}

.notification.error {
    border-color: rgba(255, 0, 0, 0.5);
    color: #ff4757;
}

.notification.error::before {
    background: linear-gradient(90deg, #ff4757, #ff3838);
}

.notification-icon {
    display: inline-block;
    margin-right: 8px;
    font-size: 16px;
}

.notification-close {
    position: absolute;
    top: 8px;
    right: 12px;
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 16px;
    opacity: 0.7;
    transition: opacity 0.3s ease;
}

.notification-close:hover {
    opacity: 1;
}

@keyframes slideInNotification {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
}

@keyframes slideOutNotification {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
}

@keyframes notification-glow {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
}

/* 错误模态框样式 */
.error-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(5px);
    z-index: 20000;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeInModal 0.3s ease-out;
}

.error-modal-content {
    background: linear-gradient(145deg, rgba(26, 26, 46, 0.95), rgba(22, 33, 62, 0.95));
    border: 2px solid rgba(255, 0, 0, 0.5);
    border-radius: 20px;
    max-width: 500px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow:
        0 20px 60px rgba(0, 0, 0, 0.5),
        0 0 40px rgba(255, 0, 0, 0.3);
    animation: scaleInModal 0.3s ease-out;
}

.error-modal-header {
    padding: 20px 25px;
    border-bottom: 1px solid rgba(255, 0, 0, 0.3);
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.error-modal-header h3 {
    color: #ff4757;
    margin: 0;
    font-size: 18px;
    text-shadow: 0 0 10px rgba(255, 71, 87, 0.5);
}

.error-modal-close {
    background: none;
    border: none;
    color: #ff4757;
    font-size: 24px;
    cursor: pointer;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.3s ease;
}

.error-modal-close:hover {
    background: rgba(255, 71, 87, 0.2);
    transform: rotate(90deg);
}

.error-modal-body {
    padding: 25px;
}

#errorDetails {
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 0, 0, 0.3);
    border-radius: 10px;
    padding: 15px;
    margin-bottom: 20px;
    font-family: 'Fira Code', monospace;
    font-size: 13px;
    color: #ff6b7a;
    white-space: pre-wrap;
    overflow-x: auto;
}

.error-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
}

.retry-btn, .report-btn {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: bold;
    transition: all 0.3s ease;
    font-size: 14px;
}

.retry-btn {
    background: linear-gradient(45deg, #00ffff, #0080ff);
    color: #000;
}

.retry-btn:hover {
    background: linear-gradient(45deg, #0080ff, #00ffff);
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(0, 255, 255, 0.3);
}

.report-btn {
    background: linear-gradient(45deg, #ff6b7a, #ff4757);
    color: #fff;
}

.report-btn:hover {
    background: linear-gradient(45deg, #ff4757, #ff6b7a);
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(255, 71, 87, 0.3);
}

@keyframes fadeInModal {
    from { opacity: 0; }
    to { opacity: 1; }
}

@keyframes scaleInModal {
    from { transform: scale(0.8); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
}

/* 统计模态框样式 */
.stats-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(5px);
    z-index: 20000;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeInModal 0.3s ease-out;
}

.stats-modal-content {
    background: linear-gradient(145deg, rgba(26, 26, 46, 0.95), rgba(22, 33, 62, 0.95));
    border: 2px solid rgba(0, 255, 255, 0.5);
    border-radius: 20px;
    max-width: 800px;
    width: 90%;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow:
        0 20px 60px rgba(0, 0, 0, 0.5),
        0 0 40px rgba(0, 255, 255, 0.3);
    animation: scaleInModal 0.3s ease-out;
}

.stats-modal-header {
    padding: 20px 25px;
    border-bottom: 1px solid rgba(0, 255, 255, 0.3);
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.stats-modal-header h3 {
    color: #00ffff;
    margin: 0;
    font-size: 18px;
    text-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
}

.stats-modal-close {
    background: none;
    border: none;
    color: #00ffff;
    font-size: 24px;
    cursor: pointer;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.3s ease;
}

.stats-modal-close:hover {
    background: rgba(0, 255, 255, 0.2);
    transform: rotate(90deg);
}

.stats-modal-body {
    padding: 25px;
}

.stats-loading {
    text-align: center;
    padding: 40px;
    color: #00ffff;
}

.stats-loading .spinner {
    width: 40px;
    height: 40px;
    margin: 0 auto 20px;
}

.stats-overview {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
}

.stat-card {
    background: linear-gradient(145deg, rgba(0, 255, 255, 0.1), rgba(255, 0, 255, 0.1));
    border: 1px solid rgba(0, 255, 255, 0.3);
    border-radius: 12px;
    padding: 20px;
    text-align: center;
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
}

.stat-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, #00ffff, #ff00ff, #00ff00);
    opacity: 0;
    transition: opacity 0.3s ease;
}

.stat-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 10px 30px rgba(0, 255, 255, 0.3);
}

.stat-card:hover::before {
    opacity: 1;
}

.stat-icon {
    font-size: 2.5em;
    margin-bottom: 10px;
    opacity: 0.8;
}

.stat-value {
    font-size: 2em;
    font-weight: bold;
    color: #00ffff;
    text-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
    margin-bottom: 5px;
}

.stat-label {
    color: #80ffff;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 1px;
}

.stats-charts {
    display: grid;
    gap: 30px;
}

.chart-section {
    background: linear-gradient(145deg, rgba(26, 26, 46, 0.6), rgba(22, 33, 62, 0.6));
    border: 1px solid rgba(0, 255, 255, 0.2);
    border-radius: 12px;
    padding: 20px;
}

.chart-section h4 {
    color: #00ffff;
    margin: 0 0 15px 0;
    font-size: 16px;
    text-shadow: 0 0 5px rgba(0, 255, 255, 0.3);
}

.daily-chart, .referrer-chart, .browser-chart {
    min-height: 200px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.chart-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
}

.chart-label {
    min-width: 80px;
    color: #80ffff;
    font-size: 12px;
    text-align: right;
}

.chart-bar-container {
    flex: 1;
    height: 20px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 10px;
    overflow: hidden;
    position: relative;
}

.chart-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #00ffff, #ff00ff);
    border-radius: 10px;
    transition: width 0.8s ease;
    position: relative;
}

.chart-bar-fill::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
    animation: shimmer 2s infinite;
}

.chart-value {
    min-width: 40px;
    color: #00ffff;
    font-size: 12px;
    font-weight: bold;
    text-align: left;
}

@keyframes shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
}

/* 历史记录样式 */
.history-container {
    padding: 0;
}

.history-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 0 15px;
    border-bottom: 2px solid rgba(0, 255, 255, 0.3);
    margin-bottom: 20px;
}

.history-header h3 {
    color: #00ffff;
    margin: 0;
    font-size: 1.4em;
    text-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
}

.history-actions {
    display: flex;
    gap: 10px;
}

.clear-history-btn, .export-history-btn {
    padding: 8px 16px;
    border: 1px solid rgba(0, 255, 255, 0.3);
    border-radius: 8px;
    background: linear-gradient(45deg, rgba(0, 255, 255, 0.1), rgba(255, 0, 255, 0.1));
    color: #00ffff;
    cursor: pointer;
    transition: all 0.3s ease;
    font-size: 12px;
    font-weight: bold;
}

.clear-history-btn:hover {
    background: linear-gradient(45deg, rgba(255, 0, 0, 0.2), rgba(255, 100, 100, 0.2));
    border-color: rgba(255, 0, 0, 0.5);
    color: #ff4757;
}

.export-history-btn:hover {
    background: linear-gradient(45deg, rgba(0, 255, 0, 0.2), rgba(0, 255, 100, 0.2));
    border-color: rgba(0, 255, 0, 0.5);
    color: #00ff00;
}

.history-stats {
    display: flex;
    gap: 20px;
    margin-bottom: 20px;
    padding: 15px;
    background: linear-gradient(145deg, rgba(0, 255, 255, 0.05), rgba(255, 0, 255, 0.05));
    border-radius: 10px;
    border: 1px solid rgba(0, 255, 255, 0.2);
}

.history-stats .stat-item {
    color: #80ffff;
    font-size: 14px;
    font-weight: 500;
}

.history-search {
    display: flex;
    gap: 12px;
    margin-bottom: 20px;
}

.history-search-input {
    flex: 1;
    padding: 12px 16px;
    border: 2px solid rgba(0, 255, 255, 0.3);
    border-radius: 10px;
    background: linear-gradient(145deg, rgba(26, 26, 46, 0.8), rgba(22, 33, 62, 0.8));
    color: #00ffff;
    font-family: 'Fira Code', monospace;
    font-size: 14px;
    transition: all 0.3s ease;
}

.history-search-input:focus {
    outline: none;
    border-color: #ff00ff;
    box-shadow: 0 0 15px rgba(255, 0, 255, 0.3);
}

.history-search-input::placeholder {
    color: rgba(128, 255, 255, 0.6);
}

.history-filter {
    padding: 12px 16px;
    border: 2px solid rgba(0, 255, 255, 0.3);
    border-radius: 10px;
    background: linear-gradient(145deg, rgba(26, 26, 46, 0.8), rgba(22, 33, 62, 0.8));
    color: #00ffff;
    font-family: 'Fira Code', monospace;
    font-size: 14px;
    cursor: pointer;
    min-width: 120px;
}

.history-filter:focus {
    outline: none;
    border-color: #ff00ff;
    box-shadow: 0 0 15px rgba(255, 0, 255, 0.3);
}

.history-filter option {
    background: rgba(26, 26, 46, 0.95);
    color: #00ffff;
}

.history-list {
    max-height: 400px;
    overflow-y: auto;
    padding-right: 10px;
}

.history-empty {
    text-align: center;
    padding: 60px 20px;
    color: #80ffff;
}

.history-empty .empty-icon {
    font-size: 4em;
    margin-bottom: 20px;
    opacity: 0.6;
}

.history-empty p {
    margin: 10px 0;
    font-size: 16px;
}

.history-item {
    background: linear-gradient(145deg, rgba(26, 26, 46, 0.6), rgba(22, 33, 62, 0.6));
    border: 1px solid rgba(0, 255, 255, 0.2);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 12px;
    transition: all 0.3s ease;
    cursor: pointer;
    position: relative;
    overflow: hidden;
}

.history-item::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, #00ffff, #ff00ff, #00ff00);
    opacity: 0;
    transition: opacity 0.3s ease;
}

.history-item:hover {
    border-color: rgba(0, 255, 255, 0.5);
    background: linear-gradient(145deg, rgba(26, 26, 46, 0.8), rgba(22, 33, 62, 0.8));
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(0, 255, 255, 0.2);
}

.history-item:hover::before {
    opacity: 1;
}

.history-item-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 10px;
}

.history-item-title {
    color: #00ffff;
    font-weight: bold;
    font-size: 16px;
    margin: 0;
    text-shadow: 0 0 5px rgba(0, 255, 255, 0.3);
}

.history-item-type {
    background: linear-gradient(45deg, #ff00ff, #ff0080);
    color: white;
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1px;
}

.history-item-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    font-size: 13px;
    color: #80ffff;
}

.history-item-date {
    opacity: 0.8;
}

.history-item-size {
    opacity: 0.8;
}

.history-item-preview {
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(0, 255, 255, 0.2);
    border-radius: 8px;
    padding: 12px;
    font-family: 'Fira Code', monospace;
    font-size: 12px;
    color: #80ffff;
    white-space: pre-wrap;
    overflow: hidden;
    max-height: 80px;
    position: relative;
}

.history-item-preview::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 20px;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
    pointer-events: none;
}

.history-item-actions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
    opacity: 0;
    transition: opacity 0.3s ease;
}

.history-item:hover .history-item-actions {
    opacity: 1;
}

.history-action-btn {
    padding: 6px 12px;
    border: 1px solid rgba(0, 255, 255, 0.3);
    border-radius: 6px;
    background: rgba(0, 255, 255, 0.1);
    color: #00ffff;
    cursor: pointer;
    font-size: 11px;
    font-weight: bold;
    transition: all 0.3s ease;
}

.history-action-btn:hover {
    background: rgba(0, 255, 255, 0.2);
    border-color: rgba(0, 255, 255, 0.5);
    transform: translateY(-1px);
}

.history-action-btn.delete {
    border-color: rgba(255, 0, 0, 0.3);
    background: rgba(255, 0, 0, 0.1);
    color: #ff4757;
}

.history-action-btn.delete:hover {
    background: rgba(255, 0, 0, 0.2);
    border-color: rgba(255, 0, 0, 0.5);
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
    const languageSelect = document.getElementById('languageSelect');
    const formatBtn = document.getElementById('formatCode');

    let currentHtmlContent = '';
    let monacoEditor = null;
    let isMonacoLoaded = false;
    let lastAction = null;
    let currentError = null;
    let previewHistory = [];
    let filteredHistory = [];
    let batchFiles = [];
    let batchResults = [];

    // 初始化Monaco编辑器
    function initMonacoEditor() {
        try {
            if (typeof require !== 'undefined') {
                require.config({
                    paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' },
                    'vs/nls': { availableLanguages: { '*': 'zh-cn' } }
                });

                require(['vs/editor/editor.main'], function () {
                    try {
                // 定义科技风主题
                monaco.editor.defineTheme('cyber-theme', {
                    base: 'vs-dark',
                    inherit: true,
                    rules: [
                        { token: 'comment', foreground: '80ffff', fontStyle: 'italic' },
                        { token: 'keyword', foreground: '00ffff', fontStyle: 'bold' },
                        { token: 'string', foreground: '00ff00' },
                        { token: 'number', foreground: 'ff00ff' },
                        { token: 'tag', foreground: 'ffff00' },
                        { token: 'attribute.name', foreground: '00ffff' },
                        { token: 'attribute.value', foreground: '00ff00' },
                    ],
                    colors: {
                        'editor.background': '#1a1a2e00',
                        'editor.foreground': '#00ffff',
                        'editor.lineHighlightBackground': '#00ffff20',
                        'editor.selectionBackground': '#00ffff30',
                        'editorCursor.foreground': '#00ffff',
                        'editorLineNumber.foreground': '#00ffff60',
                        'editorLineNumber.activeForeground': '#00ffff',
                    }
                });

                monacoEditor = monaco.editor.create(document.getElementById('monacoEditor'), {
                    value: '<!-- 在这里输入你的HTML代码... -->\\n<!-- 支持语法高亮、代码折叠、自动补全等功能 -->\\n<!-- 让科技为你的创意赋能 ⚡ -->',
                    language: 'html',
                    theme: 'cyber-theme',
                    fontSize: 14,
                    fontFamily: 'Fira Code, Consolas, monospace',
                    minimap: { enabled: true },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    wordWrap: 'on',
                    lineNumbers: 'on',
                    folding: true,
                    bracketMatching: 'always',
                    autoIndent: 'full',
                    formatOnPaste: true,
                    formatOnType: true,
                    suggestOnTriggerCharacters: true,
                    quickSuggestions: true,
                    parameterHints: { enabled: true },
                    hover: { enabled: true },
                    contextmenu: true,
                    mouseWheelZoom: true,
                    cursorBlinking: 'smooth',
                    cursorSmoothCaretAnimation: true,
                    smoothScrolling: true,
                    renderWhitespace: 'selection',
                    renderControlCharacters: true,
                    renderIndentGuides: true,
                    highlightActiveIndentGuide: true,
                    showFoldingControls: 'mouseover',
                    foldingStrategy: 'indentation',
                    occurrencesHighlight: true,
                    selectionHighlight: true,
                    codeLens: true,
                    colorDecorators: true,
                    lightbulb: { enabled: true },
                    find: {
                        addExtraSpaceOnTop: false,
                        autoFindInSelection: 'never',
                        seedSearchStringFromSelection: true
                    }
                });

                // 监听内容变化
                monacoEditor.onDidChangeModelContent(() => {
                    currentHtmlContent = monacoEditor.getValue();
                    checkContent();
                });

                        isMonacoLoaded = true;
                        showNotification('✨ 代码编辑器加载完成', 'success', 2000);

                    } catch (editorError) {
                        console.error('Monaco编辑器初始化失败:', editorError);
                        showNotification('⚠️ 代码编辑器加载失败，使用基础编辑器', 'warning');
                        // 显示备用的textarea
                        document.getElementById('htmlCode').style.display = 'block';
                    }
                }, function(error) {
                    console.error('Monaco编辑器加载失败:', error);
                    showNotification('⚠️ 代码编辑器加载失败，使用基础编辑器', 'warning');
                    // 显示备用的textarea
                    document.getElementById('htmlCode').style.display = 'block';
                });
            } else {
                // 如果require不可用，直接使用textarea
                showNotification('ℹ️ 使用基础代码编辑器', 'info', 2000);
                document.getElementById('htmlCode').style.display = 'block';
            }
        } catch (error) {
            console.error('Monaco编辑器初始化错误:', error);
            showNotification('⚠️ 代码编辑器初始化失败，使用基础编辑器', 'warning');
            document.getElementById('htmlCode').style.display = 'block';
        }
    }

    // 初始化Monaco编辑器
    initMonacoEditor();

    // 初始化历史记录
    loadPreviewHistory();

    // 初始化批量上传
    initBatchUpload();

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

            // 如果切换到代码输入标签且Monaco编辑器已加载，调整布局
            if (tabId === 'paste' && monacoEditor) {
                setTimeout(() => {
                    monacoEditor.layout();
                }, 100);
            }

            // 检查是否有内容
            checkContent();
        });
    });

    // 文件上传处理
    htmlFile.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        // 文件大小检查
        if (file.size > 10 * 1024 * 1024) { // 10MB限制
            showNotification('❌ 文件大小超过10MB限制', 'error');
            this.value = '';
            return;
        }

        // 文件类型检查
        const fileName = file.name.toLowerCase();
        const supportedExtensions = ['.html', '.htm', '.css', '.js', '.xml', '.json', '.svg', '.txt'];
        const isSupported = supportedExtensions.some(ext => fileName.endsWith(ext)) ||
                           file.type.startsWith('text/');

        if (!isSupported) {
            showNotification('⚠️ 不支持的文件类型，请选择文本文件', 'warning');
            this.value = '';
            return;
        }

        const hideLoading = showLoading(\`📖 正在读取文件 "\${file.name}"...\`, false);

        const reader = new FileReader();

        reader.onload = function(e) {
            try {
                currentHtmlContent = e.target.result;

                // 检查文件内容是否为空
                if (!currentHtmlContent.trim()) {
                    throw new Error('文件内容为空');
                }

                // 如果Monaco编辑器已加载，将内容设置到编辑器中
                if (monacoEditor) {
                    monacoEditor.setValue(currentHtmlContent);

                    // 根据文件扩展名设置语言
                    const fileExtension = file.name.split('.').pop().toLowerCase();
                    let language = 'html';
                    switch(fileExtension) {
                        case 'css': language = 'css'; break;
                        case 'js': language = 'javascript'; break;
                        case 'json': language = 'json'; break;
                        case 'xml': language = 'xml'; break;
                        case 'svg': language = 'xml'; break;
                        case 'htm':
                        case 'html': language = 'html'; break;
                        default: language = 'plaintext'; break;
                    }

                    if (languageSelect) {
                        languageSelect.value = language;
                    }
                    monaco.editor.setModelLanguage(monacoEditor.getModel(), language);

                    // 切换到代码输入标签以显示内容
                    tabBtns[1].click();
                } else {
                    // 备用方案：设置到textarea
                    htmlCode.value = currentHtmlContent;
                }

                updateFileLabel(file.name);
                checkContent();
                hideLoading();

                showNotification(\`✅ 文件 "\${file.name}" 加载成功\`, 'success');

            } catch (error) {
                hideLoading();
                console.error('文件读取错误:', error);
                showNotification(\`❌ 文件读取失败: \${error.message}\`, 'error');
                showErrorModal(error, \`读取文件 "\${file.name}" 时发生错误\`);
            }
        };

        reader.onerror = function() {
            hideLoading();
            const error = new Error('文件读取失败，可能文件已损坏');
            showNotification('❌ 文件读取失败，请重试', 'error');
            showErrorModal(error, \`读取文件 "\${file.name}" 时发生错误\`);
        };

        reader.readAsText(file, 'UTF-8');
    });

    // 代码输入处理（备用textarea）
    htmlCode.addEventListener('input', function() {
        if (!isMonacoLoaded) {
            currentHtmlContent = this.value;
            checkContent();
        }
    });

    // 语言选择器处理
    if (languageSelect) {
        languageSelect.addEventListener('change', function() {
            if (monacoEditor) {
                const language = this.value;
                monaco.editor.setModelLanguage(monacoEditor.getModel(), language);

                // 根据语言类型设置默认内容
                if (monacoEditor.getValue().trim() === '' || monacoEditor.getValue().includes('在这里输入你的')) {
                    let defaultContent = '';
                    switch(language) {
                        case 'html':
                            defaultContent = '<!DOCTYPE html>\\n<html lang="zh-CN">\\n<head>\\n    <meta charset="UTF-8">\\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\\n    <title>我的页面</title>\\n</head>\\n<body>\\n    <h1>Hello World!</h1>\\n</body>\\n</html>';
                            break;
                        case 'css':
                            defaultContent = '/* CSS 样式 */\\nbody {\\n    font-family: Arial, sans-serif;\\n    margin: 0;\\n    padding: 20px;\\n    background: #f0f0f0;\\n}\\n\\nh1 {\\n    color: #333;\\n    text-align: center;\\n}';
                            break;
                        case 'javascript':
                            defaultContent = '// JavaScript 代码\\nconsole.log("Hello World!");\\n\\n// 示例函数\\nfunction greet(name) {\\n    return "Hello, " + name + "!";\\n}\\n\\n// 调用函数\\nconst message = greet("World");\\nconsole.log(message);';
                            break;
                        case 'json':
                            defaultContent = '{\\n  "name": "示例JSON",\\n  "version": "1.0.0",\\n  "description": "这是一个JSON示例",\\n  "data": {\\n    "items": [\\n      { "id": 1, "name": "项目1" },\\n      { "id": 2, "name": "项目2" }\\n    ]\\n  }\\n}';
                            break;
                        case 'xml':
                            defaultContent = '<?xml version="1.0" encoding="UTF-8"?>\\n<root>\\n    <item id="1">\\n        <name>示例项目</name>\\n        <description>这是一个XML示例</description>\\n    </item>\\n</root>';
                            break;
                        default:
                            defaultContent = '<!-- 在这里输入你的代码... -->';
                    }
                    monacoEditor.setValue(defaultContent);
                }
            }
        });
    }

    // 代码格式化处理
    if (formatBtn) {
        formatBtn.addEventListener('click', function() {
            if (monacoEditor) {
                monacoEditor.getAction('editor.action.formatDocument').run();

                // 添加格式化成功的视觉反馈
                const originalText = this.textContent;
                this.textContent = '✨ 已格式化';
                this.style.background = 'linear-gradient(45deg, #00ff00, #00ff80)';

                setTimeout(() => {
                    this.textContent = originalText;
                    this.style.background = 'linear-gradient(45deg, #00ffff, #0080ff)';
                }, 1500);
            }
        });
    }

    // 检查内容并更新按钮状态
    function checkContent() {
        // 优先从Monaco编辑器获取内容
        if (monacoEditor) {
            currentHtmlContent = monacoEditor.getValue();
        } else if (htmlCode.value) {
            currentHtmlContent = htmlCode.value;
        }

        const hasContent = currentHtmlContent.trim().length > 0 &&
                          !currentHtmlContent.includes('在这里输入你的') &&
                          !currentHtmlContent.includes('在这里粘贴你的');
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
        // 检查当前上传模式
        const uploadMode = document.querySelector('input[name="uploadMode"]:checked').value;

        if (uploadMode === 'batch') {
            await processBatchFiles();
            return;
        }

        // 单文件模式
        checkContent();

        if (!currentHtmlContent.trim() ||
            currentHtmlContent.includes('在这里输入你的') ||
            currentHtmlContent.includes('在这里粘贴你的')) {
            showNotification('⚠️ 请先上传文件或输入代码内容！', 'warning');
            return;
        }

        // 保存当前操作以便重试
        lastAction = () => generateBtn.click();

        // 显示加载状态
        const hideLoading = showLoading('⚡ 正在生成预览链接...', true);
        resultSection.style.display = 'none';
        generateBtn.disabled = true;

        try {
            // 验证内容大小
            const contentSize = new Blob([currentHtmlContent]).size;
            if (contentSize > 10 * 1024 * 1024) { // 10MB限制
                throw new Error('文件大小超过10MB限制，请减少内容后重试');
            }

            showNotification('📤 正在上传文件...', 'info', 2000);

            const formData = new FormData();
            formData.append('html', currentHtmlContent);

            // 获取当前选择的文件类型
            const fileType = languageSelect ? languageSelect.value : 'html';
            formData.append('fileType', fileType);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时

            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(\`服务器错误 (\${response.status}): \${errorText}\`);
            }

            const result = await response.json();

            if (result.success) {
                hideLoading();

                // 显示结果
                previewLink.value = result.previewUrl;
                openLink.href = result.previewUrl;
                resultSection.style.display = 'block';

                showNotification('🎉 预览链接生成成功！', 'success');

                // 添加到历史记录
                addToHistory({
                    id: result.previewId,
                    url: result.previewUrl,
                    content: currentHtmlContent,
                    fileType: fileType,
                    title: generateTitle(currentHtmlContent, fileType),
                    size: contentSize,
                    timestamp: Date.now()
                });

                // 重置重试操作
                lastAction = null;
            } else {
                throw new Error(result.error || '生成预览链接失败');
            }
        } catch (error) {
            hideLoading();
            generateBtn.disabled = false;

            console.error('生成预览链接错误:', error);

            let errorMessage = '生成预览链接失败';
            let showModal = false;

            if (error.name === 'AbortError') {
                errorMessage = '⏰ 请求超时，请检查网络连接后重试';
            } else if (error.message.includes('Failed to fetch')) {
                errorMessage = '🌐 网络连接失败，请检查网络后重试';
            } else if (error.message.includes('服务器错误')) {
                errorMessage = '🔧 服务器暂时不可用，请稍后重试';
                showModal = true;
            } else if (error.message.includes('大小超过')) {
                errorMessage = error.message;
            } else {
                errorMessage = \`❌ \${error.message}\`;
                showModal = true;
            }

            showNotification(errorMessage, 'error', 8000);

            if (showModal) {
                showErrorModal(error, '生成预览链接时发生错误');
            }
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

        // 重置Monaco编辑器
        if (monacoEditor) {
            monacoEditor.setValue('<!-- 在这里输入你的HTML代码... -->\\n<!-- 支持语法高亮、代码折叠、自动补全等功能 -->\\n<!-- 让科技为你的创意赋能 ⚡ -->');
            if (languageSelect) {
                languageSelect.value = 'html';
                monaco.editor.setModelLanguage(monacoEditor.getModel(), 'html');
            }
        }

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
            const fileName = file.name.toLowerCase();
            const supportedExtensions = ['.html', '.htm', '.css', '.js', '.xml', '.json', '.svg'];
            const isSupported = supportedExtensions.some(ext => fileName.endsWith(ext));

            if (isSupported || file.type.startsWith('text/')) {
                htmlFile.files = files;
                htmlFile.dispatchEvent(new Event('change'));
            } else {
                showNotification('⚠️ 请选择支持的文件类型：HTML, CSS, JS, XML, JSON, SVG');
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

    // 增强的通知系统
    function showNotification(message, type = 'info', duration = 5000) {
        const container = document.getElementById('notificationContainer');
        const notification = document.createElement('div');
        notification.className = \`notification \${type}\`;

        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        notification.innerHTML = \`
            <span class="notification-icon">\${icons[type] || icons.info}</span>
            <span class="notification-message">\${message}</span>
            <button class="notification-close" onclick="this.parentElement.remove()">✕</button>
        \`;

        container.appendChild(notification);

        // 自动移除
        if (duration > 0) {
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.style.animation = 'slideOutNotification 0.5s ease-in forwards';
                    setTimeout(() => {
                        if (notification.parentNode) {
                            notification.remove();
                        }
                    }, 500);
                }
            }, duration);
        }

        return notification;
    }

    // 显示加载状态
    function showLoading(message, showProgress = false) {
        const loadingElement = document.getElementById('loading');
        const loadingText = document.getElementById('loadingText');
        const progressBar = document.getElementById('progressBar');

        loadingText.textContent = message;
        loadingElement.style.display = 'block';

        if (showProgress) {
            progressBar.style.width = '0%';
            let progress = 0;
            const interval = setInterval(() => {
                progress += Math.random() * 15;
                if (progress > 90) progress = 90;
                progressBar.style.width = progress + '%';
            }, 200);

            return () => {
                clearInterval(interval);
                progressBar.style.width = '100%';
                setTimeout(() => {
                    loadingElement.style.display = 'none';
                    progressBar.style.width = '0%';
                }, 300);
            };
        }

        return () => {
            loadingElement.style.display = 'none';
        };
    }

    // 显示错误详情
    function showErrorModal(error, context = '') {
        currentError = error;
        const modal = document.getElementById('errorModal');
        const errorDetails = document.getElementById('errorDetails');

        let errorInfo = \`错误类型: \${error.name || 'Unknown Error'}\\n\`;
        errorInfo += \`错误信息: \${error.message || '未知错误'}\\n\`;
        if (context) errorInfo += \`上下文: \${context}\\n\`;
        errorInfo += \`时间: \${new Date().toLocaleString()}\\n\`;
        if (error.stack) errorInfo += \`\\n堆栈信息:\\n\${error.stack}\`;

        errorDetails.textContent = errorInfo;
        modal.style.display = 'flex';
    }

    // 关闭错误模态框
    window.closeErrorModal = function() {
        document.getElementById('errorModal').style.display = 'none';
    };

    // 重试上次操作
    window.retryLastAction = function() {
        closeErrorModal();
        if (lastAction) {
            showNotification('🔄 正在重试操作...', 'info', 2000);
            setTimeout(lastAction, 500);
        } else {
            showNotification('⚠️ 没有可重试的操作', 'warning');
        }
    };

    // 报告错误
    window.reportError = function() {
        if (currentError) {
            const subject = encodeURIComponent('代码预览服务错误报告');
            const body = encodeURIComponent(\`
错误详情:
- 错误类型: \${currentError.name || 'Unknown'}
- 错误信息: \${currentError.message || '未知错误'}
- 浏览器: \${navigator.userAgent}
- 时间: \${new Date().toISOString()}
- URL: \${window.location.href}

请描述您遇到问题时的操作步骤:
1.
2.
3.

其他信息:

            \`);

            window.open(\`mailto:support@example.com?subject=\${subject}&body=\${body}\`);
            showNotification('📧 已打开邮件客户端，请发送错误报告', 'info');
        }
        closeErrorModal();
    };

    // 历史记录管理函数
    function loadPreviewHistory() {
        try {
            const stored = localStorage.getItem('previewHistory');
            previewHistory = stored ? JSON.parse(stored) : [];
            filteredHistory = [...previewHistory];
            updateHistoryDisplay();
            updateHistoryStats();
        } catch (error) {
            console.error('加载历史记录失败:', error);
            previewHistory = [];
            filteredHistory = [];
        }
    }

    function savePreviewHistory() {
        try {
            // 只保留最近50个记录
            if (previewHistory.length > 50) {
                previewHistory = previewHistory.slice(-50);
            }
            localStorage.setItem('previewHistory', JSON.stringify(previewHistory));
        } catch (error) {
            console.error('保存历史记录失败:', error);
            showNotification('⚠️ 历史记录保存失败', 'warning');
        }
    }

    function addToHistory(item) {
        // 检查是否已存在相同的预览
        const existingIndex = previewHistory.findIndex(h => h.id === item.id);
        if (existingIndex !== -1) {
            previewHistory.splice(existingIndex, 1);
        }

        // 添加到开头
        previewHistory.unshift(item);

        // 保存并更新显示
        savePreviewHistory();
        filteredHistory = [...previewHistory];
        updateHistoryDisplay();
        updateHistoryStats();

        showNotification('📚 已添加到历史记录', 'success', 2000);
    }

    function generateTitle(content, fileType) {
        const lines = content.split('\n').filter(line => line.trim());

        switch (fileType) {
            case 'html':
                // 尝试提取title标签
                const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
                if (titleMatch) return titleMatch[1].trim();

                // 尝试提取第一个h1标签
                const h1Match = content.match(/<h1[^>]*>([^<]+)<\/h1>/i);
                if (h1Match) return h1Match[1].replace(/<[^>]*>/g, '').trim();
                break;

            case 'css':
                // 尝试提取第一个注释作为标题
                const cssCommentMatch = content.match(/\/\*\s*([^*]+)\s*\*\//);
                if (cssCommentMatch) return cssCommentMatch[1].trim();
                break;

            case 'javascript':
                // 尝试提取第一个注释
                const jsCommentMatch = content.match(/\/\/\s*(.+)/);
                if (jsCommentMatch) return jsCommentMatch[1].trim();
                break;

            case 'json':
                // 尝试提取name字段
                try {
                    const parsed = JSON.parse(content);
                    if (parsed.name) return parsed.name;
                    if (parsed.title) return parsed.title;
                } catch (e) {}
                break;
        }

        // 默认使用第一行非空内容
        const firstLine = lines[0];
        if (firstLine) {
            return firstLine.replace(/<[^>]*>/g, '').replace(/[\/\*#]/g, '').trim().substring(0, 50);
        }

        return fileType.toUpperCase() + ' 预览';
    }

    function updateHistoryDisplay() {
        const historyList = document.getElementById('historyList');

        if (filteredHistory.length === 0) {
            historyList.innerHTML = '<div class="history-empty">' +
                '<div class="empty-icon">📝</div>' +
                '<p>没有找到匹配的历史记录</p>' +
                '<p>尝试调整搜索条件或创建新的预览</p>' +
                '</div>';
            return;
        }

        historyList.innerHTML = filteredHistory.map(item => {
            const preview = item.content.substring(0, 200) + (item.content.length > 200 ? '...' : '');
            return '<div class="history-item" data-id="' + item.id + '">' +
                '<div class="history-item-header">' +
                '<h4 class="history-item-title">' + item.title + '</h4>' +
                '<span class="history-item-type">' + item.fileType + '</span>' +
                '</div>' +
                '<div class="history-item-meta">' +
                '<span class="history-item-date">' + formatDate(item.timestamp) + '</span>' +
                '<span class="history-item-size">' + formatSize(item.size) + '</span>' +
                '</div>' +
                '<div class="history-item-preview">' + preview + '</div>' +
                '<div class="history-item-actions">' +
                '<button class="history-action-btn" onclick="openHistoryItem(\'' + item.id + '\')">🚀 打开预览</button>' +
                '<button class="history-action-btn" onclick="loadHistoryItem(\'' + item.id + '\')">📝 编辑代码</button>' +
                '<button class="history-action-btn" onclick="copyHistoryUrl(\'' + item.url + '\')">📋 复制链接</button>' +
                '<button class="history-action-btn" onclick="showItemStats(\'' + item.id + '\')">📊 查看统计</button>' +
                '<button class="history-action-btn delete" onclick="deleteHistoryItem(\'' + item.id + '\')">🗑️ 删除</button>' +
                '</div>' +
                '</div>';
        }).join('');
    }

    function updateHistoryStats() {
        const countElement = document.getElementById('historyCount');
        const sizeElement = document.getElementById('historySize');

        if (countElement) countElement.textContent = previewHistory.length;

        if (sizeElement) {
            const totalSize = previewHistory.reduce((sum, item) => sum + (item.size || 0), 0);
            sizeElement.textContent = Math.round(totalSize / 1024);
        }
    }

    function formatDate(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
        if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
        if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';

        return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return Math.round(bytes / 1024) + ' KB';
        return Math.round(bytes / 1048576) + ' MB';
    }

    // 历史记录事件处理
    const historySearch = document.getElementById('historySearch');
    const historyFilter = document.getElementById('historyFilter');
    const clearHistoryBtn = document.getElementById('clearHistory');
    const exportHistoryBtn = document.getElementById('exportHistory');

    if (historySearch) {
        historySearch.addEventListener('input', function() {
            filterHistory();
        });
    }

    if (historyFilter) {
        historyFilter.addEventListener('change', function() {
            filterHistory();
        });
    }

    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', function() {
            if (confirm('确定要清空所有历史记录吗？此操作不可撤销。')) {
                previewHistory = [];
                filteredHistory = [];
                savePreviewHistory();
                updateHistoryDisplay();
                updateHistoryStats();
                showNotification('🗑️ 历史记录已清空', 'success');
            }
        });
    }

    if (exportHistoryBtn) {
        exportHistoryBtn.addEventListener('click', function() {
            exportHistory();
        });
    }

    function filterHistory() {
        const searchTerm = historySearch ? historySearch.value.toLowerCase() : '';
        const filterType = historyFilter ? historyFilter.value : 'all';

        filteredHistory = previewHistory.filter(item => {
            const matchesSearch = !searchTerm ||
                item.title.toLowerCase().includes(searchTerm) ||
                item.content.toLowerCase().includes(searchTerm);

            const matchesType = filterType === 'all' || item.fileType === filterType;

            return matchesSearch && matchesType;
        });

        updateHistoryDisplay();
    }

    function exportHistory() {
        if (previewHistory.length === 0) {
            showNotification('⚠️ 没有历史记录可导出', 'warning');
            return;
        }

        const exportData = {
            exportTime: new Date().toISOString(),
            version: '1.0',
            count: previewHistory.length,
            history: previewHistory.map(item => ({
                id: item.id,
                title: item.title,
                fileType: item.fileType,
                size: item.size,
                timestamp: item.timestamp,
                url: item.url,
                content: item.content
            }))
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'preview-history-' + new Date().toISOString().split('T')[0] + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showNotification('📤 历史记录导出成功', 'success');
    }

    // 全局函数，供HTML调用
    window.openHistoryItem = function(id) {
        const item = previewHistory.find(h => h.id === id);
        if (item) {
            window.open(item.url, '_blank');
            showNotification('🚀 已打开预览页面', 'success', 2000);
        }
    };

    window.loadHistoryItem = function(id) {
        const item = previewHistory.find(h => h.id === id);
        if (item) {
            currentHtmlContent = item.content;

            if (monacoEditor) {
                monacoEditor.setValue(item.content);
                if (languageSelect) {
                    languageSelect.value = item.fileType;
                    monaco.editor.setModelLanguage(monacoEditor.getModel(), item.fileType);
                }
            } else {
                htmlCode.value = item.content;
            }

            // 切换到代码输入标签
            tabBtns[1].click();
            checkContent();

            showNotification('📝 代码已加载到编辑器', 'success');
        }
    };

    window.copyHistoryUrl = function(url) {
        navigator.clipboard.writeText(url).then(() => {
            showNotification('📋 链接已复制到剪贴板', 'success', 2000);
        }).catch(() => {
            // 降级方案
            const textArea = document.createElement('textarea');
            textArea.value = url;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showNotification('📋 链接已复制到剪贴板', 'success', 2000);
        });
    };

    window.deleteHistoryItem = function(id) {
        if (confirm('确定要删除这个历史记录吗？')) {
            const index = previewHistory.findIndex(h => h.id === id);
            if (index !== -1) {
                previewHistory.splice(index, 1);
                savePreviewHistory();
                filterHistory();
                updateHistoryStats();
                showNotification('🗑️ 历史记录已删除', 'success', 2000);
            }
        }
    };

    // 批量上传功能
    function initBatchUpload() {
        const uploadModeRadios = document.querySelectorAll('input[name="uploadMode"]');
        const singleUpload = document.getElementById('singleUpload');
        const batchUpload = document.getElementById('batchUpload');
        const batchFilesInput = document.getElementById('batchFiles');
        const batchFileList = document.getElementById('batchFileList');

        // 上传模式切换
        uploadModeRadios.forEach(radio => {
            radio.addEventListener('change', function() {
                if (this.value === 'single') {
                    singleUpload.style.display = 'block';
                    batchUpload.style.display = 'none';
                    // 清空批量文件
                    batchFiles = [];
                    updateBatchFileList();
                } else {
                    singleUpload.style.display = 'none';
                    batchUpload.style.display = 'block';
                }
            });
        });

        // 批量文件选择
        if (batchFilesInput) {
            batchFilesInput.addEventListener('change', function(e) {
                handleBatchFiles(Array.from(e.target.files));
            });
        }

        // 批量拖拽支持
        if (batchUpload) {
            batchUpload.addEventListener('dragover', function(e) {
                e.preventDefault();
                this.style.borderColor = '#00ff00';
                this.style.background = 'linear-gradient(145deg, rgba(0, 255, 0, 0.1), rgba(0, 255, 255, 0.1))';
            });

            batchUpload.addEventListener('dragleave', function(e) {
                e.preventDefault();
                this.style.borderColor = '#ff00ff';
                this.style.background = 'linear-gradient(145deg, rgba(255, 0, 255, 0.05), rgba(0, 255, 255, 0.05))';
            });

            batchUpload.addEventListener('drop', function(e) {
                e.preventDefault();
                this.style.borderColor = '#ff00ff';
                this.style.background = 'linear-gradient(145deg, rgba(255, 0, 255, 0.05), rgba(0, 255, 255, 0.05))';

                const files = Array.from(e.dataTransfer.files);
                handleBatchFiles(files);
            });
        }
    }

    function handleBatchFiles(files) {
        const maxFiles = 20;
        const supportedExtensions = ['.html', '.htm', '.css', '.js', '.xml', '.json', '.svg', '.txt'];

        // 过滤文件
        const validFiles = files.filter(file => {
            const fileName = file.name.toLowerCase();
            const isSupported = supportedExtensions.some(ext => fileName.endsWith(ext)) ||
                               file.type.startsWith('text/');

            if (!isSupported) {
                showNotification('⚠️ 跳过不支持的文件: ' + file.name, 'warning', 3000);
                return false;
            }

            if (file.size > 10 * 1024 * 1024) {
                showNotification('⚠️ 跳过过大的文件: ' + file.name, 'warning', 3000);
                return false;
            }

            return true;
        });

        // 检查文件数量限制
        if (batchFiles.length + validFiles.length > maxFiles) {
            showNotification('⚠️ 最多只能上传' + maxFiles + '个文件', 'warning');
            return;
        }

        // 添加文件到批量列表
        validFiles.forEach(file => {
            const fileId = generateUUID();
            const fileExtension = file.name.split('.').pop().toLowerCase();
            let fileType = 'html';

            switch(fileExtension) {
                case 'css': fileType = 'css'; break;
                case 'js': fileType = 'javascript'; break;
                case 'json': fileType = 'json'; break;
                case 'xml': fileType = 'xml'; break;
                case 'svg': fileType = 'xml'; break;
                case 'htm':
                case 'html': fileType = 'html'; break;
                default: fileType = 'plaintext'; break;
            }

            batchFiles.push({
                id: fileId,
                file: file,
                name: file.name,
                size: file.size,
                type: fileType,
                status: 'pending',
                content: null,
                result: null
            });
        });

        updateBatchFileList();

        if (validFiles.length > 0) {
            showNotification('📁 已添加 ' + validFiles.length + ' 个文件到批量列表', 'success');
        }
    }

    function updateBatchFileList() {
        const batchFileList = document.getElementById('batchFileList');
        if (!batchFileList) return;

        if (batchFiles.length === 0) {
            batchFileList.innerHTML = '';
            return;
        }

        batchFileList.innerHTML = batchFiles.map(file => {
            const icon = getFileIcon(file.type);
            const statusClass = file.status;
            const statusText = getStatusText(file.status);

            return '<div class="batch-file-item" data-id="' + file.id + '">' +
                '<div class="batch-file-info">' +
                '<span class="batch-file-icon">' + icon + '</span>' +
                '<div class="batch-file-details">' +
                '<div class="batch-file-name">' + file.name + '</div>' +
                '<div class="batch-file-meta">' + formatSize(file.size) + ' • ' + file.type.toUpperCase() + '</div>' +
                '</div>' +
                '</div>' +
                '<div class="batch-file-status ' + statusClass + '">' + statusText + '</div>' +
                '<button class="batch-file-remove" onclick="removeBatchFile(\'' + file.id + '\')">✕</button>' +
                '</div>';
        }).join('');
    }

    function getFileIcon(fileType) {
        const icons = {
            html: '🌐',
            css: '🎨',
            javascript: '⚡',
            json: '📋',
            xml: '📄',
            svg: '🖼️',
            plaintext: '📝'
        };
        return icons[fileType] || '📄';
    }

    function getStatusText(status) {
        const texts = {
            pending: '等待中',
            processing: '处理中',
            success: '成功',
            error: '失败'
        };
        return texts[status] || status;
    }

    window.removeBatchFile = function(fileId) {
        const index = batchFiles.findIndex(f => f.id === fileId);
        if (index !== -1) {
            batchFiles.splice(index, 1);
            updateBatchFileList();
            showNotification('🗑️ 已移除文件', 'success', 2000);
        }
    };

    // 批量处理文件
    async function processBatchFiles() {
        if (batchFiles.length === 0) {
            showNotification('⚠️ 请先选择要上传的文件', 'warning');
            return;
        }

        // 重置结果
        batchResults = [];

        // 显示加载状态
        const hideLoading = showLoading('📁 正在批量处理文件...', true);
        generateBtn.disabled = true;
        resultSection.style.display = 'none';

        try {
            showNotification('🚀 开始批量处理 ' + batchFiles.length + ' 个文件', 'info', 3000);

            // 逐个处理文件
            for (let i = 0; i < batchFiles.length; i++) {
                const file = batchFiles[i];

                try {
                    // 更新状态为处理中
                    file.status = 'processing';
                    updateBatchFileList();

                    // 读取文件内容
                    const content = await readFileContent(file.file);
                    file.content = content;

                    // 上传文件
                    const result = await uploadSingleFile(content, file.type);

                    if (result.success) {
                        file.status = 'success';
                        file.result = result;

                        // 添加到历史记录
                        addToHistory({
                            id: result.previewId,
                            url: result.previewUrl,
                            content: content,
                            fileType: file.type,
                            title: generateTitle(content, file.type) || file.name,
                            size: file.size,
                            timestamp: Date.now()
                        });

                        batchResults.push({
                            fileName: file.name,
                            fileType: file.type,
                            url: result.previewUrl,
                            success: true
                        });
                    } else {
                        throw new Error(result.error || '上传失败');
                    }

                } catch (error) {
                    console.error('处理文件失败:', file.name, error);
                    file.status = 'error';
                    file.error = error.message;

                    batchResults.push({
                        fileName: file.name,
                        fileType: file.type,
                        error: error.message,
                        success: false
                    });
                }

                updateBatchFileList();

                // 显示进度
                const progress = Math.round(((i + 1) / batchFiles.length) * 100);
                showNotification('📊 处理进度: ' + progress + '% (' + (i + 1) + '/' + batchFiles.length + ')', 'info', 1000);
            }

            hideLoading();
            generateBtn.disabled = false;

            // 显示批量结果
            showBatchResults();

        } catch (error) {
            hideLoading();
            generateBtn.disabled = false;
            console.error('批量处理错误:', error);
            showNotification('❌ 批量处理失败: ' + error.message, 'error');
            showErrorModal(error, '批量处理文件时发生错误');
        }
    }

    function readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsText(file, 'UTF-8');
        });
    }

    async function uploadSingleFile(content, fileType) {
        const formData = new FormData();
        formData.append('html', content);
        formData.append('fileType', fileType);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error('服务器错误 (' + response.status + '): ' + errorText);
            }

            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            throw error;
        }
    }

    function showBatchResults() {
        const successCount = batchResults.filter(r => r.success).length;
        const errorCount = batchResults.filter(r => !r.success).length;

        // 创建结果显示区域
        const batchResultsHTML = '<div class="batch-results">' +
            '<div class="batch-results-header">' +
            '<h3>📊 批量处理结果</h3>' +
            '<div class="batch-stats">' +
            '<span class="stat-success">✅ 成功: ' + successCount + '</span>' +
            '<span class="stat-error">❌ 失败: ' + errorCount + '</span>' +
            '</div>' +
            '</div>' +
            '<div class="batch-results-list">' +
            batchResults.map(result => {
                if (result.success) {
                    return '<div class="batch-result-item success">' +
                        '<div class="result-info">' +
                        '<span class="result-icon">✅</span>' +
                        '<span class="result-name">' + result.fileName + '</span>' +
                        '<span class="result-type">' + result.fileType.toUpperCase() + '</span>' +
                        '</div>' +
                        '<div class="result-actions">' +
                        '<button class="result-btn" onclick="window.open(\'' + result.url + '\', \'_blank\')">🚀 打开</button>' +
                        '<button class="result-btn" onclick="copyToClipboard(\'' + result.url + '\')">📋 复制</button>' +
                        '</div>' +
                        '</div>';
                } else {
                    return '<div class="batch-result-item error">' +
                        '<div class="result-info">' +
                        '<span class="result-icon">❌</span>' +
                        '<span class="result-name">' + result.fileName + '</span>' +
                        '<span class="result-error">' + result.error + '</span>' +
                        '</div>' +
                        '</div>';
                }
            }).join('') +
            '</div>' +
            '<div class="batch-results-actions">' +
            '<button class="batch-action-btn" onclick="exportBatchResults()">📤 导出结果</button>' +
            '<button class="batch-action-btn" onclick="clearBatchResults()">🔄 重新开始</button>' +
            '</div>' +
            '</div>';

        // 显示结果
        resultSection.innerHTML = batchResultsHTML;
        resultSection.style.display = 'block';

        if (successCount > 0) {
            showNotification('🎉 批量处理完成！成功: ' + successCount + ', 失败: ' + errorCount, 'success');
        } else {
            showNotification('😞 批量处理完成，但所有文件都失败了', 'error');
        }
    }

    window.copyToClipboard = function(text) {
        navigator.clipboard.writeText(text).then(() => {
            showNotification('📋 链接已复制', 'success', 2000);
        }).catch(() => {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showNotification('📋 链接已复制', 'success', 2000);
        });
    };

    window.exportBatchResults = function() {
        const exportData = {
            timestamp: new Date().toISOString(),
            totalFiles: batchResults.length,
            successCount: batchResults.filter(r => r.success).length,
            errorCount: batchResults.filter(r => !r.success).length,
            results: batchResults
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'batch-upload-results-' + new Date().toISOString().split('T')[0] + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showNotification('📤 结果已导出', 'success');
    };

    window.clearBatchResults = function() {
        batchFiles = [];
        batchResults = [];
        updateBatchFileList();
        resultSection.style.display = 'none';
        showNotification('🔄 已重置批量上传', 'success');
    };

    // 统计功能
    window.showItemStats = async function(previewId) {
        const modal = document.getElementById('statsModal');
        const loading = document.getElementById('statsLoading');
        const content = document.getElementById('statsContent');

        // 显示模态框和加载状态
        modal.style.display = 'flex';
        loading.style.display = 'block';
        content.style.display = 'none';

        try {
            const response = await fetch('/api/stats/' + previewId);

            if (!response.ok) {
                throw new Error('获取统计数据失败: ' + response.status);
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || '获取统计数据失败');
            }

            // 显示统计数据
            displayStats(data);

            loading.style.display = 'none';
            content.style.display = 'block';

        } catch (error) {
            console.error('获取统计数据失败:', error);
            loading.innerHTML = '<div style="color: #ff4757; text-align: center;">' +
                '<div style="font-size: 3em; margin-bottom: 15px;">😞</div>' +
                '<p>获取统计数据失败</p>' +
                '<p style="font-size: 14px; opacity: 0.8;">' + error.message + '</p>' +
                '<button onclick="closeStatsModal()" style="margin-top: 15px; padding: 8px 16px; background: #ff4757; color: white; border: none; border-radius: 6px; cursor: pointer;">关闭</button>' +
                '</div>';
        }
    };

    window.closeStatsModal = function() {
        document.getElementById('statsModal').style.display = 'none';
    };

    function displayStats(data) {
        const stats = data.stats;

        // 更新概览数据
        document.getElementById('totalViews').textContent = stats.views || 0;
        document.getElementById('uniqueVisitors').textContent = stats.uniqueVisitors || 0;
        document.getElementById('lastViewed').textContent = stats.lastViewed ?
            formatRelativeTime(stats.lastViewed) : '从未访问';
        document.getElementById('firstViewed').textContent = stats.firstViewed ?
            formatRelativeTime(stats.firstViewed) : '从未访问';

        // 显示每日访问趋势
        displayDailyChart(stats.dailyViews || {});

        // 显示访问来源
        displayReferrerChart(stats.referrers || {});

        // 显示浏览器分布
        displayBrowserChart(stats.userAgents || {});
    }

    function displayDailyChart(dailyViews) {
        const chartContainer = document.getElementById('dailyChart');
        const entries = Object.entries(dailyViews).sort((a, b) => a[0].localeCompare(b[0]));

        if (entries.length === 0) {
            chartContainer.innerHTML = '<div style="text-align: center; color: #80ffff; padding: 40px;">暂无访问数据</div>';
            return;
        }

        const maxViews = Math.max(...entries.map(([, views]) => views));

        chartContainer.innerHTML = entries.map(([date, views]) => {
            const percentage = maxViews > 0 ? (views / maxViews) * 100 : 0;
            const formattedDate = formatDate2(date);

            return '<div class="chart-bar">' +
                '<div class="chart-label">' + formattedDate + '</div>' +
                '<div class="chart-bar-container">' +
                '<div class="chart-bar-fill" style="width: ' + percentage + '%"></div>' +
                '</div>' +
                '<div class="chart-value">' + views + '</div>' +
                '</div>';
        }).join('');
    }

    function displayReferrerChart(referrers) {
        const chartContainer = document.getElementById('referrerChart');
        const entries = Object.entries(referrers).sort((a, b) => b[1] - a[1]).slice(0, 10);

        if (entries.length === 0) {
            chartContainer.innerHTML = '<div style="text-align: center; color: #80ffff; padding: 40px;">暂无来源数据</div>';
            return;
        }

        const maxViews = Math.max(...entries.map(([, views]) => views));

        chartContainer.innerHTML = entries.map(([referrer, views]) => {
            const percentage = maxViews > 0 ? (views / maxViews) * 100 : 0;
            const displayName = referrer === 'direct' ? '直接访问' : referrer;

            return '<div class="chart-bar">' +
                '<div class="chart-label" title="' + displayName + '">' +
                (displayName.length > 12 ? displayName.substring(0, 12) + '...' : displayName) +
                '</div>' +
                '<div class="chart-bar-container">' +
                '<div class="chart-bar-fill" style="width: ' + percentage + '%"></div>' +
                '</div>' +
                '<div class="chart-value">' + views + '</div>' +
                '</div>';
        }).join('');
    }

    function displayBrowserChart(userAgents) {
        const chartContainer = document.getElementById('browserChart');
        const entries = Object.entries(userAgents).sort((a, b) => b[1] - a[1]);

        if (entries.length === 0) {
            chartContainer.innerHTML = '<div style="text-align: center; color: #80ffff; padding: 40px;">暂无浏览器数据</div>';
            return;
        }

        const maxViews = Math.max(...entries.map(([, views]) => views));

        chartContainer.innerHTML = entries.map(([browser, views]) => {
            const percentage = maxViews > 0 ? (views / maxViews) * 100 : 0;
            const icon = getBrowserIcon(browser);

            return '<div class="chart-bar">' +
                '<div class="chart-label">' + icon + ' ' + browser + '</div>' +
                '<div class="chart-bar-container">' +
                '<div class="chart-bar-fill" style="width: ' + percentage + '%"></div>' +
                '</div>' +
                '<div class="chart-value">' + views + '</div>' +
                '</div>';
        }).join('');
    }

    function formatRelativeTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
        if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
        if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';

        return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    function formatDate2(dateStr) {
        const date = new Date(dateStr);
        const today = new Date();
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

        if (dateStr === today.toISOString().split('T')[0]) return '今天';
        if (dateStr === yesterday.toISOString().split('T')[0]) return '昨天';

        return date.toLocaleDateString('zh-CN', {
            month: 'short',
            day: 'numeric'
        });
    }

    function getBrowserIcon(browser) {
        const icons = {
            'Chrome': '🌐',
            'Firefox': '🦊',
            'Safari': '🧭',
            'Edge': '🔷',
            'Opera': '🎭',
            'Mobile': '📱',
            'Android': '🤖',
            'iOS': '🍎',
            'Other': '💻'
        };
        return icons[browser] || '💻';
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

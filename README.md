# HTML Showing - 在线HTML预览服务

🌟 基于Cloudflare Workers的在线HTML预览服务，支持文件上传和代码粘贴，生成可分享的预览链接。

## ✨ 功能特性

- 📁 **文件上传**: 支持拖拽上传HTML文件
- 📝 **代码粘贴**: 直接在文本框中粘贴HTML代码
- 🔗 **链接生成**: 生成唯一的预览链接，方便分享
- ⏰ **长期有效**: 预览链接有效期最长1年
- 🎨 **完美渲染**: 完整的HTML页面渲染效果
- 📱 **响应式设计**: 支持移动端访问
- 🚀 **高性能**: 基于Cloudflare全球CDN

## 🛠️ 技术栈

- **后端**: Cloudflare Workers
- **存储**: Cloudflare KV
- **前端**: 原生HTML/CSS/JavaScript
- **部署**: Cloudflare自动部署

## 📦 部署说明

### 前置要求

1. Cloudflare账户
2. 已创建的KV命名空间
3. Node.js环境（用于本地开发，可选）

### 部署步骤

1. **克隆或下载项目文件**
   ```bash
   # 如果使用Git
   git clone <your-repo-url>
   cd html-showing
   ```

2. **配置KV命名空间**
   - 确保你的Cloudflare账户中已创建名为 `html-showing` 的KV命名空间
   - 记录KV命名空间的ID
   - 在 `wrangler.toml` 中更新KV命名空间ID（如果需要）

3. **安装依赖（可选，用于本地开发）**
   ```bash
   npm install
   ```

4. **部署到Cloudflare**
   ```bash
   # 登录Cloudflare
   npx wrangler login
   
   # 部署Worker
   npx wrangler deploy
   ```

5. **访问你的服务**
   - 部署成功后，Cloudflare会提供一个访问URL
   - 访问该URL即可使用HTML预览服务

## 📁 项目结构

```
html-showing/
├── src/
│   └── index.js          # 主要的Worker逻辑
├── wrangler.toml         # Cloudflare Workers配置
├── package.json          # 项目依赖配置
└── README.md            # 项目说明文档
```

## 🔧 配置说明

### wrangler.toml

```toml
name = "html-showing"
main = "src/index.js"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "HTML_STORAGE"
id = "your-kv-namespace-id"
preview_id = "your-kv-namespace-id"
```

### 环境变量

- `HTML_STORAGE`: KV命名空间绑定名称
- 预览链接有效期: 31536000秒（1年）

## 🚀 使用方法

1. **访问服务**: 打开部署后的URL
2. **上传HTML**: 
   - 方式1: 点击"文件上传"标签，选择或拖拽HTML文件
   - 方式2: 点击"代码粘贴"标签，直接粘贴HTML代码
3. **生成链接**: 点击"生成预览链接"按钮
4. **分享预览**: 复制生成的链接，分享给其他人

## 📝 API接口

### POST /api/upload

上传HTML内容并生成预览链接

**请求参数:**
- `html` (FormData): HTML内容

**响应格式:**
```json
{
  "success": true,
  "previewUrl": "https://your-domain.workers.dev/preview/uuid",
  "previewId": "uuid"
}
```

### GET /preview/{id}

访问HTML预览页面

**参数:**
- `id`: 预览ID

**响应:** 渲染的HTML页面

## 🔒 安全说明

- 预览链接使用UUID生成，具有足够的随机性
- HTML内容存储在Cloudflare KV中，安全可靠
- 预览链接自动过期，避免长期占用存储空间
- 支持CORS，但建议在生产环境中配置适当的域名限制

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 💖 致谢

感谢Cloudflare提供的优秀服务！

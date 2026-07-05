# English

一个可直接部署到 GitHub Pages 的雅思词汇学习页面。当前实现是纯静态前端，不依赖 Flask 后端。

## 功能

- 按现有 `vocabulary.txt` 解析章节、词群、单词、词性、释义和例句。
- 使用浏览器 Web Speech API 播放英文发音，适配 Android Chrome。
- 支持 A 类本 / B 类本工作区；工作区只保存在本次页面内存中，刷新或重新进入后为空。
- 支持导出本次工作区为 Markdown 文件，手机下载后可本地保存。
- 支持通过 Cloudflare Worker 代理调用助记 API，API Key 不写入仓库。
- 支持默写检查和搜索。

## GitHub Pages 部署

1. 将仓库推送到 GitHub。
2. 进入仓库 `Settings` -> `Pages`。
3. `Build and deployment` 选择 `Deploy from a branch`。
4. 分支选择 `main`，目录选择 `/ (root)`。
5. 保存后访问 GitHub Pages 给出的地址。

## 本地预览

在仓库根目录运行：

```bash
source /opt/miniconda3/etc/profile.d/conda.sh
conda activate base
python -m http.server 8000
```

然后访问：

```text
http://localhost:8000/
```

## 助记 API 说明

GitHub Pages 是纯静态页面，浏览器直接请求 `chat.ecnu.edu.cn` 时会被 CORS 策略拦截。推荐使用 Cloudflare Worker 做一层代理：

1. 在 Cloudflare 创建一个 Worker。
2. 把仓库里的 `cloudflare-worker.js` 内容粘贴进去并部署。
3. 在 Worker 的 `Settings` -> `Variables and Secrets` 里添加 Secret：
   - `API_KEY`: 真实大模型 API Key
4. 可选添加普通环境变量：
   - `API_URL`: 默认是 `https://chat.ecnu.edu.cn/open/api/v1/chat/completions`
   - `MODEL_NAME`: 默认是 `ecnu-max`
5. 打开词汇网页，点击右上角设置按钮：
   - `接口地址`: 填 Worker 地址，例如 `https://your-worker.your-name.workers.dev`
   - `模型`: 填 `ecnu-max`
   - `API Key`: 留空

如果你坚持在网页里直连原始接口，则接口服务必须允许浏览器跨域请求，否则仍会报 CORS 错误。

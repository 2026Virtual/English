# English

一个可直接部署到 GitHub Pages 的雅思词汇学习页面。当前实现是纯静态前端，不依赖 Flask 后端。

## 功能

- 按现有 `vocabulary.txt` 解析章节、词群、单词、词性、释义和例句。
- 使用浏览器 Web Speech API 播放英文发音，适配 Android Chrome。
- 支持 A 类本 / B 类本工作区；工作区只保存在本次页面内存中，刷新或重新进入后为空。
- 支持导出本次工作区为 Markdown 文件，手机下载后可本地保存。
- 支持配置兼容 Chat Completions 的助记 API；API Key 不写入仓库，也不会持久化保存。
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

静态网页不能安全内置 API Key。页面右上角设置按钮可以临时填写接口地址、模型和 API Key。接口需要支持浏览器跨域请求，否则会被浏览器 CORS 策略阻止。

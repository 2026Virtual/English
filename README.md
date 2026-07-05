# English

一个可直接部署到 GitHub Pages 的雅思词汇学习页面。当前实现是纯静态前端，不依赖 Flask 后端。

## 功能

- 按现有 `vocabulary.txt` 解析章节、词群、单词、词性、释义和例句。
- 使用浏览器 Web Speech API 播放英文发音，适配 Android Chrome。
- 支持 A 类本 / B 类本工作区；工作区只保存在本次页面内存中，刷新或重新进入后为空。
- 支持工作区按单词去重，并导出本次工作区为简洁 Markdown 文件，手机下载后可本地保存。
- 支持通过 Supabase Edge Function 代理调用助记 API，真实大模型 API Key 不写入仓库。
- 支持页面打开后立即预热 Supabase Edge Function，并每 10 分钟自动预热一次。
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

GitHub Pages 是纯静态页面，浏览器直接请求 `chat.ecnu.edu.cn` 时会被 CORS 策略拦截。当前方案使用 Supabase Edge Function 做一层边缘代理：

```text
GitHub Pages 前端 -> Supabase Edge Function -> 大模型 API
```

### Supabase 后台配置

1. 登录 Supabase Dashboard，进入你的项目。
2. 左侧进入 `Edge Functions`。
3. 点击 `Create a new function`，函数名填：

```text
mnemonic-proxy
```

4. 进入在线编辑器后，把 `supabase/functions/mnemonic-proxy/index.ts` 的内容完整复制进去。
5. 保持 `JWT Verification` 开启，然后创建并部署函数。
6. 进入 `Edge Functions` 页面顶部或右上角的 `Secrets`，添加：

```text
LLM_API_KEY=你的真实大模型 API Key
LLM_API_URL=https://chat.ecnu.edu.cn/open/api/v1/chat/completions
LLM_MODEL=ecnu-max
```

其中 `LLM_API_URL` 和 `LLM_MODEL` 可以不填，函数里已经有默认值；`LLM_API_KEY` 必须填。

7. 部署完成后复制函数 URL，格式类似：

```text
https://<project-ref>.supabase.co/functions/v1/mnemonic-proxy
```

8. 在 Supabase 项目 `Settings` -> `API` 中复制 `anon public` key。它通常以 `eyJ` 开头，可以放在浏览器里；不要复制 `service_role` key。

### 网页里填写

打开 GitHub Pages 词汇网页，点击右上角设置：

- `Supabase Function URL`: 填第 7 步复制的函数 URL
- `模型`: `ecnu-max`
- `Supabase anon key`: 填第 8 步复制的 anon public key

保存后页面顶部状态应显示 `Supabase 代理：ecnu-max`，再点击单词卡片里的 `助记`。

网页会把 Supabase Function URL、模型名和 anon public key 保存在浏览器 `localStorage`，用于下次打开页面后自动预热 Edge Function。这里保存的不是大模型密钥；真实大模型密钥仍只保存在 Supabase Secrets 的 `LLM_API_KEY` 中。

### CLI 部署可选

如果你使用 Supabase CLI，仓库里也提供了：

```text
supabase/functions/mnemonic-proxy/index.ts
supabase/config.toml
```

对应配置保持：

```toml
[functions.mnemonic-proxy]
verify_jwt = true
```

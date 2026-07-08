# Supabase 云端笔记本配置

## 1. 创建表和权限

在 Supabase Dashboard 打开你的项目，进入 SQL Editor，执行：

```sql
-- 复制 supabase/vocabulary_mistakes.sql 的全部内容执行
```

这个 SQL 会创建 `public.vocabulary_mistakes` 表，并开启 RLS。默认规则是：登录用户只能读写自己 `user_id = auth.uid()` 的词汇笔记。

如果你之前已经执行过旧版 SQL，也可以重新执行这个文件。它会把唯一键调整为 `user_id + source_label + word_key`，也就是同一个用户在不同云端笔记本里可以保留相同单词。

新版 SQL 还会增加 `sort_order` 字段，用来保留导入顺序。旧数据会按创建时间自动补一个顺序。

## 2. 配置 Auth

进入 Authentication > Providers，启用 Email 登录。

进入 Authentication > URL Configuration：

- Site URL 填你的 GitHub Pages 地址，例如 `https://2026virtual.github.io/English/`
- 本地调试可以把 `http://127.0.0.1:5173/*` 加到 Redirect URLs

如果你只想自己使用：

1. 先在网页里用自己的邮箱注册，或在 Authentication > Users 里手动创建用户。
2. 确认自己的账号可以登录后，关闭公开注册。
3. 保持 RLS 开启，不要关闭。

更严格的做法是在 `supabase/vocabulary_mistakes.sql` 里把 policy 增加邮箱白名单条件：

```sql
and lower(coalesce(auth.jwt() ->> 'email', '')) = lower('你的邮箱')
```

## 3. 在网页里填写

打开背单词页，点击“笔记本” > “配置”，填写：

- Supabase Project URL：形如 `https://xxxx.supabase.co`
- Supabase anon key：项目 Settings > API 里的 `anon public` key
- 邮箱和密码：你的 Supabase Auth 账号

不要把 `service_role` key 填进网页。网页只应该使用 anon key。

## 4. 使用方式

- 每天手机端继续导出 `词汇笔记*.md`。
- 周末电脑端打开“笔记本”，点击“导入笔记”，可以一次选择一个或多个 Markdown 文件。
- 多个文件会合并成一个新的云端笔记本，标题格式是 `云端词汇整理07-08-1200`。
- 合并时会先按文件名从小到大排序，再保留每个文件内部的原始单词顺序。
- A 类词进入同一个 `## A类本`，B 类词进入同一个 `## B类本`，同一个笔记本内按单词去重。
- 重复单词以最后一次出现为准，最终位置和词条内容都按最后一次出现的记录计算。
- “保存工作区”会把当前浏览器工作区里的单词保存成一个新的 `云端词汇整理07-08-1200`。
- “同步”只从 Supabase 拉取最新笔记本到当前设备显示。
- 选择某个云端笔记本后，可以点击“下载笔记本”导出 Markdown 到本地。
- 选择某个云端笔记本后，可以点击“删除笔记本”从 Supabase 完整删除这个整理。

当前导入器支持现有导出格式：

```markdown
# 词汇笔记07-08-1200

## A类本

abandon ｜v. ｜放弃 ｜例句 ｜助记

## B类本

retain ｜v. ｜保留 ｜例句 ｜助记
```

# Hugo 博客哔哔同步

FlareMo 可在公开 Memo 创建、编辑、删除或附件变更后，自动触发 cosine00/hug00 仓库的 Fetch Memos GitHub Actions。博客端重新拉取完整公开 Memo 列表，不向 GitHub 发送 Memo 正文或附件内容。

## 配置

1. 在 GitHub 创建 Fine-grained personal access token。
2. Resource owner 选择 cosine00，Repository access 仅选 hug00。
3. Repository permissions 中只授予 Actions: Read and write。Token 仅用于调用 workflow dispatch API。
4. 在 FlareMo 项目根目录运行：

   pnpm exec wrangler secret put FLAREMO_MEMO_SYNC_GITHUB_TOKEN

   按提示粘贴 Token。也可以在 Cloudflare Dashboard 的 FlareMo Worker → Settings → Variables and Secrets 中添加同名 Secret。

5. 部署包含本功能的新 Worker 版本。

默认目标为 cosine00/hug00 的 master 分支和 fetch-memos.yml。更换目标时可设置非敏感变量 FLAREMO_MEMO_SYNC_GITHUB_REPOSITORY（owner/repo）和 FLAREMO_MEMO_SYNC_GITHUB_REF（分支名）。

## 触发范围

- 新建公开 Memo：触发。
- 编辑公开 Memo：触发。
- 修改可见性：触发，确保从 PUBLIC 改为 PRIVATE/PROTECTED 时博客及时移除。
- 删除、恢复 Memo：触发。
- 绑定、解绑 Memo 附件：触发。
- 新建 PRIVATE/PROTECTED 的 JSON Memo：不触发。
- 二进制 Memos Connect 创建请求无法从 protobuf 响应安全读取可见性，因此保守触发一次；博客端仍只允许 visibility === PUBLIC 的 Memo 写入公开产物。

## 单条同步

触发请求携带 `memo_id` 与 `action`（`upsert` / `remove`），博客据此只读一条 Memo 并合并进现有 `static/memos.json`，不再每次重拉全库：

```json
{ "ref": "master", "inputs": { "memo_id": "1276", "action": "upsert" } }
```

`memo_id` 的来源：

| 写入 | 来源 |
| --- | --- |
| `POST /api/v1/memos`、`POST /api/app/memos` | 响应体的 `name` / `id` |
| `PATCH`/`DELETE /api/v1/memos/{id}`、`/attachments`、`/revisions/restore` | 路径参数 |
| `POST`/`PATCH /api/v1/attachments` | 响应体的 `memo` |
| Connect JSON 响应 | 响应体的 `name` |
| Connect 二进制响应、附件删除 | 取不到 → **不带 inputs，退回全量** |

请求体永远不含 Memo 正文或附件地址：博客用自己的 PAT 重新读取，私密内容不会进入 Actions 日志。

## 安全边界

hug00 的同步脚本在下载附件前过滤可见性。只有 PUBLIC Memo 会进入 static/memos.json、BB 页面和 BB RSS；PRIVATE、PROTECTED 以及状态不在 MEMO_STATES 中的条目不会写入博客，也不会转存其附件。

单条模式下边界不变：接口返回 200 但 visibility/state 不合格、或返回 404，都只移除这一条；鉴权失败、5xx、超时一律不改写文件，交给每日全量兜底。删除与「查询失败」必须分开——不能因为一次失败的查询就把博客里的记录删掉。

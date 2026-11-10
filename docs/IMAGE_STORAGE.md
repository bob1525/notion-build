# 图片存储

上传仍然走 `POST /api/uploads`。校验还在路由里：必须登录，MIME 和体积、文件头都由 `imageFileError` 检查。通过之后才交给存储。默认后端还是本机 `public/uploads`，返回的地址仍是 `/uploads/<uuid>.<ext>`。现有图片上传端到端没有改断言。

## 接口

```ts
interface ImageStorage {
  upload(file: { bytes: Uint8Array; contentType: string }): Promise<{ key: string; url: string }>
  getUrl(key: string): string
  delete(key: string): Promise<void>
}
```

`key` 只接受 `uuid.png|jpg|gif|webp`。`../`、子目录和其他扩展名在 `getUrl` 和 `delete` 里都会拒绝，避免删到上传目录外面。

`createImageStorage(env)` 每次请求现读环境变量：

| `IMAGE_STORAGE` | 行为 |
| --- | --- |
| 未设置、空、`local` | `public/uploads`。目录可以在测试里换成临时目录 |
| `s3` | 对象存储。缺任一必填项就抛出「对象存储还没配好：缺少 …」 |
| 其他值 | 「未知的图片存储：…」 |

路由把配置错误转成 500，正文是上面这句中文，不含密钥。磁盘或对象存储调用失败仍走原来的「服务器开小差了」。

## 本地

`createLocalImageStorage` 用 `mkdir` 和 `writeFile` 把字节写到 `public/uploads/<uuid>.<ext>`。`getUrl` 返回 `/uploads/<key>`。`delete` 删除该文件；文件已经不在时不报错。扩展名沿用 `extensionForImage`，jpeg 仍是 `.jpg`。

`.gitignore` 继续忽略 `public/uploads/*`，只保留 `.gitkeep`。

## 对象存储

`src/lib/s3-client.ts` 是一个不依赖 AWS SDK 的示例。它用 `fetch` 发 path-style 请求：`{S3_ENDPOINT}/{bucket}/{key}`。签名是 AWS Signature Version 4，只签 `PUT` 和 `DELETE`，请求体用 SHA-256，不使用 `UNSIGNED-PAYLOAD`。时钟可以注入，测试不用打到真实的桶。

`S3_PUBLIC_BASE_URL` 是浏览器能直接打开的前缀，末尾斜杠会去掉。上传和 `getUrl` 都返回 `{前缀}/{key}`。这个地址不是预签名。桶必须让这个前缀公开可读，否则页面上的 `<img>` 打不开。编辑器用的是普通 `img`，不经过 `next/image`，所以不用再配 `images.remotePatterns`。

| 变量 | 何时需要 | 含义 |
| --- | --- | --- |
| `IMAGE_STORAGE` | 可选，默认 `local` | `local` 或 `s3` |
| `S3_BUCKET` | `s3` | 桶名，单个路径段 |
| `S3_ENDPOINT` | `s3` | 兼容接口地址，不要把桶名写在路径里 |
| `S3_ACCESS_KEY_ID` | `s3` | 访问密钥 |
| `S3_SECRET_ACCESS_KEY` | `s3` | 私密密钥，不要提交 |
| `S3_PUBLIC_BASE_URL` | `s3` | 浏览器可读的图片前缀，`http` 或 `https`，不能带账号、查询或 hash |
| `S3_REGION` | 可选 | 签名用的区域。缺省是 `auto`，给 Cloudflare R2 用 |

`.env.example` 里写了同样的说明。`S3_*` 默认注释掉。本地和 CI 不设置它们，上传仍进 `public/uploads`。

Cloudflare R2 可以这样配（值换成自己的，写在部署环境里，不写进仓库）：

```bash
IMAGE_STORAGE=s3
S3_BUCKET=folio-images
S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY_ID=<r2 access key>
S3_SECRET_ACCESS_KEY=<r2 secret>
S3_PUBLIC_BASE_URL=https://images.example.com
```

`S3_ENDPOINT` 是带签名的 API，浏览器打不开。`S3_PUBLIC_BASE_URL` 要另给公开域名或 r2.dev 域名。MinIO 同一台机器上两者可以是 `http://127.0.0.1:9000` 和 `http://127.0.0.1:9000/folio-images`。

## Serverless

Vercel、以及别的没有持久磁盘的运行时，不能靠 `public/uploads`。部署包里的 `public/` 是构建时的静态文件。函数运行时通常只能写 `/tmp`，而且下次请求可能换一台机器，`/tmp` 也不会被当成网站静态目录。所以运行中写进去的图片，刷新或换一次实例就没了。

这种环境把 `IMAGE_STORAGE` 设为 `s3`，把上面的变量配在平台的环境变量里，然后重新部署。Folio 的 CI 跑在 GitHub 托管机上，磁盘可写，所以工作流不用改，端到端仍走本地目录。

## 验证

| 命令 | 结果 |
| --- | --- |
| `npm test` | 96 / 96，退出码 0 |
| `npm run lint` | 无警告，退出码 0 |
| `npm run typecheck` | 退出码 0 |
| `npm run test:e2e` | 50 / 50，5.7 分钟。其中「uploads a local image and shows it」仍要求 `/uploads/.+\.png` |

新增单元测试 12 个。原来的 84 个都还在，`src/lib/image-source.test.ts` 的 3 个断言没有改。没有新增端到端，因为默认后端的上传路径没变。

`src/lib/image-storage.test.ts` 8 个：

| 测试 | 结果 |
| --- | --- |
| 本地上传把字节写进目录，地址是 `/uploads/<uuid>.jpg` | 通过 |
| 删除后文件不在，再删一次不报错 | 通过 |
| `../`、子目录、空串和非 uuid 的 key 不能读也不能删 | 通过 |
| 未设置、空串和 `local` 都写本地目录 | 通过 |
| `s3` 把桶、key、正文和 Content-Type 交给 mock，公开地址去掉末尾斜杠 | 通过 |
| `s3` 的删除把桶和 key 交给 mock | 通过 |
| 缺配置时列出 `S3_ENDPOINT`、`S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY`、`S3_PUBLIC_BASE_URL` | 通过 |
| `gcs` 被拒绝；`ftp` 公开地址被拒绝 | 通过 |

`src/lib/s3-client.test.ts` 4 个：

| 测试 | 结果 |
| --- | --- |
| `GET /test.txt` 的 Authorization 等于 AWS 文档里的 `Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41` | 通过 |
| `PUT` 发到 `{endpoint}/{prefix}/{bucket}/{key}`，带上正文和 `AWS4-HMAC-SHA256` | 通过 |
| `DELETE` 用空正文的哈希；204 成功，403 变成「对象存储返回 403」 | 通过 |
| 桶名或 key 含 `..` 时拒绝 | 通过 |

## 发现的问题

编辑器删掉图片块时没有调用 `delete`。接口上有删除，但页面不会清文件。本地和对象存储都会留下不再引用的对象。这和以前只写文件、不回收是一样的，这次没有顺手改保存逻辑。

`getUrl` 不做预签名。私有桶即使上传成功，浏览器也看不到图。要公开读，或者以后再加签名 URL。这次没有做。

客户端是 path-style，给 R2 和 MinIO 用。没有实现 Amazon S3 的 virtual-hosted 地址（`{bucket}.s3.{region}.amazonaws.com`）。也没有分片上传；应用本身就把单张限制在 2MB。

签名对照的是 AWS 公开示例，不是连上一个真实的桶。mock 能证明后端选择和请求形状，不能证明某家供应商的额外请求头。

分支头的 GitHub Actions 链接补在下一节。

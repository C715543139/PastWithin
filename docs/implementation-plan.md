# Chrome 历史/书签正文搜索插件初步实现文档

## 1. 目标与边界

本项目第一版目标是实现一个轻量、本地优先的 Chrome 插件，用于保存用户浏览过的普通网页正文，并支持通过正文关键词、连续片段、代码片段或短关键词找回页面。

第一版只做以下能力：

- 自动采集普通网页的标题、URL、正文、访问时间和书签状态。
- 使用 IndexedDB 在本地保存页面数据和分词索引。
- 提供 popup 搜索入口。
- 支持两种搜索模式：分词查询和全文查询。
- 展示搜索结果的标题、URL、访问时间、书签标记和匹配片段。
- 支持匹配高亮。
- 支持基础 URL/域名排除规则。
- 支持清空本地数据。
- 支持显示本地空间占用统计。

第一版不实现：

- 语义搜索、embedding、向量数据库、RAG 问答。
- GPT 总结或远程 API 同步。
- 搜索引擎结果页嵌入。
- 跨设备同步。
- 导入/导出数据。
- 书签同步。
- 复杂知识库管理。

## 2. 参考项目使用原则

参考项目位于 `fulltext-bookmark/`，只作为技术路线参考，不直接复制业务代码。

可参考的方向：

- Plasmo 扩展工程组织方式。
- content script 中使用 `@mozilla/readability` 提取正文。
- Readability 失败后退回 `document.body.innerText`。
- 使用 Dexie 操作 IndexedDB。
- 使用 `jieba-wasm` 建立中文分词索引。
- popup 作为主搜索入口。

不沿用的方向：

- GPT、embedding、远程 API。
- 搜索引擎页面嵌入。
- 微博等站点专项逻辑。
- 将大量逻辑集中在单个 `background.ts` 的结构。

## 3. 技术选型

建议第一版使用：

- Chrome Manifest V3
- Plasmo
- React
- TypeScript
- Dexie
- IndexedDB
- `@mozilla/readability`
- `jieba-wasm`

原因：

- Plasmo 可以减少 MV3、content script、popup、options 的样板配置。
- Dexie 能简化 IndexedDB schema、索引和事务操作。
- Readability 对文章类网页正文提取效果稳定。
- `jieba-wasm` 能满足中文关键词搜索的基础分词需求。
- 所有数据默认保存在本地，不上传到远端。

## 4. 建议目录结构

新插件工程建议放在仓库根目录，不继续在 `fulltext-bookmark/` 中开发。

```text
.
├── docs/
│   └── implementation-plan.md
├── assets/
│   └── icon.png
├── background/
│   ├── index.ts
│   ├── db.ts
│   ├── search.ts
│   ├── settings.ts
│   └── bookmarks.ts
├── contents/
│   └── capture.ts
├── popup/
│   ├── index.tsx
│   ├── SearchApp.tsx
│   └── popup.css
├── options/
│   ├── index.tsx
│   ├── OptionsApp.tsx
│   └── options.css
├── lib/
│   ├── extract.ts
│   ├── normalize.ts
│   ├── snippet.ts
│   ├── urlRules.ts
│   └── wordSplit.ts
├── package.json
└── tsconfig.json
```

后续如果工程规模较小，可以合并部分文件；但第一版不建议把数据库、搜索、设置和消息处理全部堆在一个 background 文件中。

## 5. 数据模型

IndexedDB 数据库名建议为 `PastWithinDB`。

### 5.1 pages 表

保存页面基础信息，面向搜索结果列表。

```ts
interface PageRecord {
  id?: number
  pageKey: string
  url: string
  normalizedUrl: string
  title: string
  visitTime: number
  updatedAt: number
  isBookmarked: boolean
  contentLength: number
}
```

建议索引：

```ts
pages: "++id,&pageKey,&normalizedUrl,visitTime,isBookmarked"
```

说明：

- `pageKey` 可使用 normalized URL 的 hash。
- `normalizedUrl` 第一版先移除 hash，保留 query；后续再决定是否做更激进归一化。
- 同一个 normalized URL 再次访问时更新记录，而不是重复插入。

### 5.2 pageContents 表

保存正文和分词索引。

```ts
interface PageContentRecord {
  pageId: number
  content?: string
  titleWords: string[]
  contentWords: string[]
}
```

建议索引：

```ts
pageContents: "&pageId,*titleWords,*contentWords"
```

说明：

- `content` 用于全文查询和生成匹配片段；当用户关闭“保存正文”时，该字段不写入或写入空字符串。
- `titleWords`、`contentWords` 用于分词查询。
- `contentWords` 可能很大，后续可考虑截断、去重或单独词表，但第一版先保持简单。
- 即使关闭“保存正文”，保存流程仍可在内存中临时使用本次提取到的正文生成 `contentWords`，然后丢弃原始正文。

### 5.3 settings 表或 chrome.storage.local

设置建议优先放在 `chrome.storage.local`，因为 content script 需要读取排除规则和保存开关。

```ts
interface AppSettings {
  autoSaveEnabled: boolean
  saveBookmarkedOnly: boolean
  saveContentEnabled: boolean
  tempPageRetentionDays: number
  maxResults: number
  excludedUrlPatterns: string[]
}
```

默认值：

```ts
const defaultSettings: AppSettings = {
  autoSaveEnabled: true,
  saveBookmarkedOnly: false,
  saveContentEnabled: true,
  tempPageRetentionDays: 60,
  maxResults: 50,
  excludedUrlPatterns: [
    "^chrome://",
    "^edge://",
    "^about:",
    "^file://",
    "^https://mail\\.google\\.com/",
    "^https://outlook\\.live\\.com/",
    "^https://.*\\.bank",
    "^https://.*\\.edu.*/(login|auth|jw|jiaowu)"
  ]
}
```

排除规则第一版使用正则字符串，但设置页需要提示“每行一个正则”。后续可以改成更友好的域名/通配符规则。

`saveContentEnabled` 控制是否保存原始正文：

- 开启时，保存 `content`，允许使用全文查询，并能生成更准确的正文匹配片段。
- 关闭时，不保存 `content`，全文查询在 UI 中不可选择；分词查询仍可使用已保存的 `titleWords` 和 `contentWords`。
- 如果用户关闭该选项后已有旧正文数据，第一版应在保存设置时提示“是否清理已保存正文”；实现上可先提供清理动作，避免用户误以为关闭开关会自动删除历史正文。

## 6. 页面采集流程

content script 运行在普通网页：

```text
页面加载完成
→ 读取设置
→ 检查 URL 是否应排除
→ 检查是否启用自动保存
→ 提取正文
→ 发送 capturePage 消息给 background
→ background 判断书签状态
→ background 分词并写入 IndexedDB
```

正文提取策略：

1. 克隆当前 `document`。
2. 如果 Readability 可解析，使用 `new Readability(clonedDocument).parse()?.textContent`。
3. 如果失败或正文过短，退回 `document.body.innerText`。
4. 对正文做基础清理：统一换行、合并过多空白、去掉首尾空白。
5. 如果正文为空或长度过短，可跳过保存。
6. 如果 `saveContentEnabled` 为关闭，正文只在本次保存流程中用于分词，不持久化保存。

建议第一版阈值：

- 标题为空不阻止保存。
- 正文少于 20 个字符时跳过保存。
- 单页正文上限先设为 1 MB 字符串，避免异常页面撑爆存储。

## 7. URL 排除策略

排除判断应尽早发生在 content script 中，避免敏感页面正文被发送到 background。

默认排除：

- `chrome://`、`edge://`、`about:`、`file://`
- 插件自身页面
- 邮箱
- 银行、支付类站点的常见域名模式
- 登录、认证、教务系统常见路径
- 用户自定义规则

需要注意：

- content script 的 `matches` 可以写 `<all_urls>`，但代码中必须二次检查。
- 排除规则应容错：单条非法正则不能导致整个采集流程崩溃。
- 第一版不做云同步，不上传正文。

## 8. 分词查询

分词查询是默认搜索模式。

流程：

```text
用户输入 query
→ normalize query
→ jieba 分词
→ 查询 titleWords 和 contentWords
→ 计算简单分数
→ bulkGet 页面基础信息
→ 读取必要 content 生成片段
→ 返回前 maxResults 条
```

建议评分规则：

```text
score =
  titleHitCount * 8
  + contentHitCount * 2
  + isBookmarkedBonus
  + recencyBonus
```

第一版可以采用简化实现：

- 标题命中优先。
- 正文命中其次。
- 命中词越多越靠前。
- 访问时间越近越靠前。
- 书签页面加少量权重。

Dexie 查询方式：

- 对每个分词分别查 `titleWords` 和 `contentWords`。
- 聚合 pageId 命中次数。
- 再根据 pages 表补充 `visitTime`、`isBookmarked` 等排序因素。

分词查询限制：

- 不保证连续片段匹配。
- 不保证英文/代码中间部分匹配。
- 对极短词可能返回较多结果。

这些限制应通过 UI 文案解释，并提供全文查询入口。

### 8.1 搜索策略设计

搜索实现建议采用轻量策略模式，统一搜索入口和结果结构，但不引入复杂类继承或插件注册系统。

原因：

- 第一版至少存在分词查询和全文查询两种模式。
- 两种模式的输入输出相似，但索引使用、性能特征、可用条件和片段生成方式不同。
- `saveContentEnabled` 关闭时，全文查询需要在 UI 和 background 两侧都变为不可用。
- 后续如果增加域名过滤、仅书签搜索、混合搜索或语义搜索，统一入口可以减少 `if mode === ...` 分支扩散。

建议接口：

```ts
interface SearchStrategy {
  mode: "token" | "fulltext"
  isAvailable(settings: AppSettings): boolean
  search(request: SearchRequest): Promise<SearchResult[]>
}
```

background 中只负责选择策略、校验可用性和返回统一结果：

```ts
const strategies: Record<SearchRequest["mode"], SearchStrategy> = {
  token: tokenSearchStrategy,
  fulltext: fulltextSearchStrategy
}

async function searchPages(request: SearchRequest) {
  const settings = await getSettings()
  const strategy = strategies[request.mode]

  if (!strategy || !strategy.isAvailable(settings)) {
    return {
      results: [],
      error: "search mode unavailable"
    }
  }

  return {
    results: await strategy.search(request)
  }
}
```

约束：

- 不需要 `AbstractSearchEngine`、`SearchStrategyFactory`、`SearchStrategyRegistry` 这类重型抽象。
- 不需要为了未来 AI 搜索提前设计插件系统。
- 第一版只保留 `tokenSearchStrategy`、`fulltextSearchStrategy` 和一个简单 dispatcher。
- 每个策略内部负责自己的命中计算、snippet 生成和 highlight token 选择。

## 9. 全文查询

全文查询由用户手动选择，不作为默认模式。

全文查询依赖已保存的原始正文 `content`。当设置中的 `saveContentEnabled` 为关闭时：

- popup 中的全文查询选项置灰或隐藏。
- 如果当前模式已经是全文查询，应自动切回分词查询。
- background 收到 `mode: "fulltext"` 请求时也要再次校验设置，禁用状态下返回明确错误或空结果，避免 UI 状态不同步导致误查。

流程：

```text
用户输入原始 query
→ normalize query，但不分词
→ 读取候选页面
→ 对 content 做 includes 查询
→ 找到匹配位置
→ 生成上下文片段
→ 返回前 maxResults 条
```

第一版可先在 background 中分批扫描，避免一次性阻塞：

```ts
const batchSize = 100
```

后续可升级：

- Web Worker
- 扫描进度事件
- 停止扫描按钮
- 先按时间/书签/域名过滤候选集合

短查询策略：

- 不禁止 `R2`、`tf`、`B7`、`.m` 等短查询。
- 当 query 长度小于等于 2 时，在 UI 中提示可能较慢或命中较多。
- 第一版可以直接搜索；后续再加确认对话框。

## 10. 匹配片段与高亮

结果需要解释“为什么匹配”。

全文查询片段：

- 找到 `content.indexOf(query)`。
- 取前后各 60 到 100 个字符。
- 查询词用高亮标记。

分词查询片段：

- 对分词结果逐个在 content 中查找。
- 使用最早或得分最高的命中位置生成片段。
- 如果正文中没有找到，退回标题或 URL。

高亮实现原则：

- 不直接拼接不可信 HTML。
- React 中将文本切片渲染为普通 text node 和 `<mark>`。
- query 或 token 需要按文本处理，不作为 HTML 注入。

## 11. popup 设计

第一版 popup 是主入口，建议宽度 420px，高度 560px 左右。

控件：

- 搜索输入框。
- 搜索模式切换：`分词查询` / `全文查询`。
- 当“保存正文”关闭时，`全文查询` 不可选择，并显示简短提示。
- 过滤器第一版可先放一个 `仅书签` 开关，时间/域名过滤后续补。
- 结果列表。
- 设置入口。

结果项展示：

- 标题。
- URL。
- 访问时间。
- 是否书签。
- 匹配片段。

交互：

- 输入防抖 300ms。
- 分词查询实时搜索，全文查询提示按 enter/搜索按钮 搜索。
- 点击结果打开新标签页。
- 查询中显示搜索中。
- 无结果显示明确状态。

## 12. options 设置页

第一版设置页至少包含：

- 是否自动保存访问页面。
- 是否只保存书签页面。
- 非书签页面保存天数。
- 最大搜索结果数。
- URL/域名排除规则。
- 是否保存正文。
- 本地空间占用统计。
- 清空本地数据。

清空数据需要二次确认。

空间占用统计第一版建议展示：

- IndexedDB 已用空间估算值。
- 浏览器分配给扩展存储的 quota 估算值。
- 已保存页面数量。
- 已保存正文数量。

实现方式：

- 优先使用 `navigator.storage.estimate()` 获取 `usage` 和 `quota`。
- 页面数量通过 `db.pages.count()` 获取。
- 正文数量通过统计 `pageContents` 中 `content` 非空的记录获取。
- 统计值只作为估算，不需要精确到每张表的字节数。

## 13. background 消息协议

建议统一定义消息类型，避免散落字符串。

```ts
type RuntimeMessage =
  | { type: "capturePage"; payload: CapturedPage }
  | { type: "search"; payload: SearchRequest }
  | { type: "clearData" }
  | { type: "clearSavedContent" }
  | { type: "getStats" }
  | { type: "getSettings" }
  | { type: "saveSettings"; payload: AppSettings }
```

```ts
interface CapturedPage {
  url: string
  title: string
  content: string
  visitTime: number
}
```

```ts
interface SearchRequest {
  query: string
  mode: "token" | "fulltext"
  onlyBookmarked?: boolean
  maxResults?: number
}
```

```ts
interface SearchResult {
  id: number
  url: string
  title: string
  visitTime: number
  isBookmarked: boolean
  snippet: string
  highlights: string[]
  score: number
}
```

```ts
interface StorageStats {
  usageBytes: number
  quotaBytes: number
  pageCount: number
  contentCount: number
}
```

## 14. 书签状态

第一版只需要保存 `isBookmarked` 字段，不做完整书签同步，也不在启动时批量导入书签。

保存页面时：

- background 使用 `chrome.bookmarks.search({ url })` 或 `chrome.bookmarks.search(url)` 判断是否已收藏。
- 写入 `isBookmarked`。

后续增强：

- 监听 `chrome.bookmarks.onCreated` / `onRemoved` 更新状态。
- 启动时扫描书签并补充记录。
- 支持“仅书签保存”和“仅书签搜索”。

## 15. 权限设计

Manifest 权限建议：

```json
{
  "permissions": ["storage", "bookmarks", "tabs"],
  "host_permissions": ["http://*/*", "https://*/*"]
}
```

说明：

- `storage` 用于设置。
- `bookmarks` 用于判断书签状态。
- `tabs` 用于读取当前标签信息或打开结果。
- `host_permissions` 用于普通网页 content script。

第一版不申请远程 API 相关权限。

## 16. 性能与存储策略

第一版先采用简单、可维护的实现。

性能保护：

- 正文长度上限。
- 全文查询分批扫描。
- 搜索结果数量上限。
- popup 输入防抖。
- 非书签页面过期清理。

存储保护：

- 非书签页面默认保存 60 天。
- 清理逻辑可在启动、保存新页面或打开 popup 时触发。
- options 页显示本地空间占用统计，帮助用户判断是否需要清理数据。
- 第一版不压缩正文；如果数据库增长过快，再考虑压缩或更细粒度索引。

## 17. 第一版验收标准

手动验收：

1. 打开一篇中文网页，插件自动保存正文。
2. 打开一篇包含代码片段的网页，插件自动保存正文。
3. 在 popup 使用分词查询中文术语，能找到相关页面。
4. 在 popup 使用全文查询连续片段，能找到真正包含该片段的页面。
5. 搜索结果显示标题、URL、访问时间和匹配片段。
6. 匹配内容被高亮。
7. 被排除 URL 不会保存。
8. 清空本地数据后搜索结果为空。
9. 短查询不会被禁止。
10. 关闭网络后，已有本地数据仍可搜索。
11. 关闭“保存正文”后，全文查询不可选择；重新开启后可以继续使用全文查询。
12. options 页能显示本地空间占用、quota、页面数量和正文数量。

构建验收：

```bash
pnpm install
pnpm build
```

浏览器验收：

- 在 Chrome 扩展页加载构建产物。
- popup、options、content script、background 均无明显控制台错误。

## 18. 推荐实现顺序

1. 初始化独立 Plasmo 工程。
2. 建立 Dexie 数据库和类型定义。
3. 实现设置默认值与 URL 排除规则。
4. 实现 content script 正文采集。
5. 实现 background 保存流程。
6. 接入 `jieba-wasm` 分词。
7. 实现分词查询。
8. 实现全文查询。
9. 实现 popup 搜索界面和结果展示。
10. 实现高亮片段。
11. 实现 options 设置页、空间占用统计和清空数据。
12. 构建并手动加载 Chrome 验收。

## 19. 后续增强方向

第一版稳定后再考虑：

- 仅书签搜索。
- 时间过滤。
- 域名过滤。
- omnibox 地址栏搜索。
- 导入/导出数据库。
- 书签同步。
- 手动保存当前页。
- 全文查询进度条与停止按钮。
- 搜索结果分页。
- 更精细的 URL 归一化。
- 更好的正文提取策略。

# PastWithin 架构文档

本文档描述 PastWithin 的架构与设计决策。验收标准见 `docs/manual-test.md`,测试契约见 `tests/README.md`。

## 1. 目标与边界

PastWithin 是一个轻量、本地优先的 Chrome 插件,用于保存用户浏览过的普通网页正文,并支持通过正文关键词、连续片段、代码片段或短关键词找回页面。

已实现能力:

- 自动采集普通网页的标题、URL、正文、访问时间和书签状态。
- 使用 IndexedDB 在本地保存页面数据和分词索引。
- 提供 popup 搜索入口。
- 支持两种搜索模式:分词查询和全文查询。
- 展示搜索结果的标题、URL、访问时间、书签标记和匹配片段。
- 支持匹配高亮。
- 支持基础 URL/域名排除规则。
- 支持清空本地数据。
- 支持显示本地空间占用统计。

不实现:

- 语义搜索、embedding、向量数据库、RAG 问答。
- GPT 总结或远程 API 同步。
- 搜索引擎结果页嵌入。
- 跨设备同步。
- 书签同步。
- 复杂知识库管理。

## 2. 技术选型

- Chrome Manifest V3
- Plasmo
- React
- TypeScript
- Dexie
- IndexedDB
- 内置正文提取 fallback
- 内置轻量分词 fallback

选型原因:

- Plasmo 减少 MV3、content script、popup、options 的样板配置。
- Dexie 简化 IndexedDB schema、索引和事务操作。
- 使用 `main`、`article`、`body` 可见文本提取正文,减少依赖和集成风险。
- 使用轻量分词 fallback 支持中文连续串、中文单字/二元片段和英文/代码 token。
- 所有数据默认保存在本地,不上传到远端。

## 3. 目录结构

插件工程位于仓库根目录。

```text
.
├── docs/
├── assets/
├── background/
├── contents/
├── popup/
├── options/
├── lib/
├── tests/
├── background.ts
├── env.d.ts
├── LICENSE
├── options.tsx
├── package.json
├── package-lock.json
├── popup.tsx
├── tsconfig.json
├── vitest.config.ts
└── vitest.setup.ts
```

说明:

- `background/`、`contents/`、`popup/`、`options/`、`lib/` 为源码目录,分别存放 background 服务、content script、popup 页面、options 页面和共享工具模块。
- `tests/` 为测试目录,按模块组织测试文件,`fixtures/` 存放测试数据,`README.md` 说明测试契约。
- `docs/` 存放项目文档。
- `assets/` 存放插件图标等静态资源。
- `background.ts`、`popup.tsx`、`options.tsx` 为 Plasmo 入口文件,分别注册 background service worker、popup 页面和 options 页面。
- `env.d.ts` 为 TypeScript 环境声明文件。
- `tsconfig.json` 为 TypeScript 配置。
- `vitest.config.ts`、`vitest.setup.ts` 为 Vitest 测试配置和全局设置。
- `package.json`、`package-lock.json` 为依赖管理文件。
- `LICENSE` 为开源协议文件。

数据库、搜索、设置和消息处理分散在独立模块中,不集中堆在单个 `background.ts`。

## 4. 数据模型

IndexedDB 数据库名为 `PastWithinDB`。

### 4.1 pages 表

保存页面基础信息,面向搜索结果列表。

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

索引:

```ts
pages: "++id,&pageKey,&normalizedUrl,visitTime,isBookmarked"
```

说明:

- `pageKey` 使用 normalized URL 的 hash。
- `normalizedUrl` 移除 hash,保留 query。
- 同一个 normalized URL 再次访问时更新记录,而不是重复插入。

### 4.2 pageContents 表

保存正文和分词索引。

```ts
interface PageContentRecord {
  pageId: number
  content?: string
  titleWords: string[]
  contentWords: string[]
}
```

索引:

```ts
pageContents: "&pageId,*titleWords,*contentWords"
```

说明:

- `content` 用于全文查询和生成匹配片段;当用户关闭"保存正文"时,该字段不写入或写入空字符串。
- `titleWords`、`contentWords` 用于分词查询。
- 即使关闭"保存正文",保存流程仍可在内存中临时使用本次提取到的正文生成 `contentWords`,然后丢弃原始正文。

### 4.3 settings 存储

设置放在 `chrome.storage.local`,因为 content script 需要读取排除规则和保存开关。

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

默认值:

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
    "^chrome-extension://",
    "^https://mail\\.google\\.com/",
    "^https://outlook\\.live\\.com/",
    "^https://.*\\.bank",
    "^https://.*\\.edu.*/(login|auth|jw|jiaowu)"
  ]
}
```

排除规则使用正则字符串,设置页提示"每行一个正则"。

`saveContentEnabled` 控制是否保存原始正文:

- 开启时,保存 `content`,允许使用全文查询,并能生成更准确的正文匹配片段。
- 关闭时,不保存 `content`,全文查询在 UI 中不可选择;分词查询仍可使用已保存的 `titleWords` 和 `contentWords`。
- 如果用户关闭该选项后已有旧正文数据,设置页提供独立的"清空已保存正文"动作,并做二次确认,避免用户误以为关闭开关会自动删除历史正文。

## 5. 页面采集模块

content script 运行在普通网页:

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

正文提取策略:

1. 优先读取 `main`、`article` 等正文容器的 `innerText`。
2. 如果正文容器不存在或内容过短,退回 `document.body.innerText`。
3. 对正文做基础清理:统一换行、合并过多空白、去掉首尾空白。
4. 如果正文为空或长度过短,跳过保存。
5. 如果 `saveContentEnabled` 为关闭,正文只在本次保存流程中用于分词,不持久化保存。

阈值:

- 标题为空不阻止保存。
- 正文少于 20 个字符时跳过保存。
- 单页正文上限设为 1 MB 字符串,避免异常页面撑爆存储。

## 6. URL 排除模块

排除判断尽早发生在 content script 中,避免敏感页面正文被发送到 background。

默认排除:

- `chrome://`、`edge://`、`about:`、`file://`
- 插件自身页面
- 邮箱
- 银行、支付类站点的常见域名模式
- 登录、认证、教务系统常见路径
- 用户自定义规则

约束:

- content script 的 `matches` 写 `<all_urls>`,但代码中二次检查。
- 排除规则容错:单条非法正则不导致整个采集流程崩溃。
- 不做云同步,不上传正文。

## 7. 分词查询模块

分词查询是默认搜索模式。

流程:

```text
用户输入 query
→ normalize query
→ 轻量分词 fallback
→ 查询 titleWords 和 contentWords
→ 计算简单分数
→ bulkGet 页面基础信息
→ 读取必要 content 生成片段
→ 返回前 maxResults 条
```

评分规则:

```text
score =
  titleHitCount * 8
  + contentHitCount * 2
  + isBookmarkedBonus
  + recencyBonus
```

简化实现:

- 标题命中优先。
- 正文命中其次。
- 命中词越多越靠前。
- 访问时间越近越靠前。
- 书签页面加少量权重。

Dexie 查询方式:

- 对每个分词分别查 `titleWords` 和 `contentWords`。
- 聚合 pageId 命中次数。
- 再根据 pages 表补充 `visitTime`、`isBookmarked` 等排序因素。

分词由 `lib/wordSplit.ts` 提供,覆盖:

- 中文连续串。
- 中文单字和二元片段。
- 英文、数字、代码符号附近的 token。

该实现不等价于正式中文分词。

分词查询限制:

- 不保证连续片段匹配。
- 不保证英文/代码中间部分匹配。
- 对极短词可能返回较多结果。

这些限制通过 UI 文案解释,并提供全文查询入口。

### 7.1 搜索策略设计

搜索实现采用轻量策略模式,统一搜索入口和结果结构,但不引入复杂类继承或插件注册系统。

接口:

```ts
interface SearchStrategy {
  mode: "token" | "fulltext"
  isAvailable(settings: AppSettings): boolean
  search(request: SearchRequest): Promise<SearchResult[]>
}
```

background 中只负责选择策略、校验可用性和返回统一结果:

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

约束:

- 不使用 `AbstractSearchEngine`、`SearchStrategyFactory`、`SearchStrategyRegistry` 这类重型抽象。
- 只保留 `tokenSearchStrategy`、`fulltextSearchStrategy` 和一个简单 dispatcher。
- 每个策略内部负责自己的命中计算、snippet 生成和 highlight token 选择。

## 8. 全文查询模块

全文查询由用户手动选择,不作为默认模式。

全文查询依赖已保存的原始正文 `content`。当设置中的 `saveContentEnabled` 为关闭时:

- popup 中的全文查询选项置灰或隐藏。
- 如果当前模式已经是全文查询,自动切回分词查询。
- background 收到 `mode: "fulltext"` 请求时再次校验设置,禁用状态下返回明确错误或空结果,避免 UI 状态不同步导致误查。

流程:

```text
用户输入原始 query
→ normalize query,但不分词
→ 读取候选页面
→ 对 content 做 includes 查询
→ 找到匹配位置
→ 生成上下文片段
→ 返回前 maxResults 条
```

在 background 中直接扫描已保存正文,配合 `maxResults` 控制返回数量。

短查询策略:

- 不禁止 `R2`、`tf`、`B7`、`.m` 等短查询。
- 当 query 长度小于等于 2 时,在 UI 中提示可能较慢或命中较多。
- 直接搜索。

## 9. 匹配片段与高亮模块

结果需要解释"为什么匹配"。

全文查询片段:

- 找到 `content.indexOf(query)`。
- 取前后各 60 到 100 个字符。
- 查询词用高亮标记。

分词查询片段:

- 对分词结果逐个在 content 中查找。
- 使用最早或得分最高的命中位置生成片段。
- 如果正文中没有找到,退回标题或 URL。

高亮实现原则:

- 不直接拼接不可信 HTML。
- React 中将文本切片渲染为普通 text node 和 `<mark>`。
- query 或 token 按文本处理,不作为 HTML 注入。

## 10. popup 模块

popup 是主入口,宽度 420px,高度 560px 左右。

控件:

- 搜索输入框。
- 搜索模式切换:`分词查询` / `全文查询`。
- 当"保存正文"关闭时,`全文查询` 不可选择,并显示简短提示。
- 结果列表。
- 设置入口。

结果项展示:

- 标题。
- URL。
- 访问时间。
- 是否书签。
- 匹配片段。

交互:

- 用户提交表单后发起搜索。
- 点击结果打开新标签页。
- 查询中显示搜索中。
- 无结果显示明确状态。

## 11. options 设置页模块

设置页包含:

- 是否自动保存访问页面。
- 是否只保存书签页面。
- 非书签页面保存天数。
- 最大搜索结果数。
- URL/域名排除规则。
- 是否保存正文。
- 本地空间占用统计。
- 清空本地数据。

清空数据需要二次确认。

空间占用统计展示:

- IndexedDB 已用空间估算值。
- 浏览器分配给扩展存储的 quota 估算值。
- 已保存页面数量。
- 已保存正文数量。

实现方式:

- 优先使用 `navigator.storage.estimate()` 获取 `usage` 和 `quota`。
- 页面数量通过 `db.pages.count()` 获取。
- 正文数量通过统计 `pageContents` 中 `content` 非空的记录获取。
- 统计值只作为估算,不需要精确到每张表的字节数。

## 12. background 消息协议

统一定义消息类型,避免散落字符串。

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

## 13. 书签状态模块

只保存 `isBookmarked` 字段,不做完整书签同步,也不在启动时批量导入书签。

保存页面时:

- background 使用 `chrome.bookmarks.search({ url })` 判断是否已收藏。
- 写入 `isBookmarked`。

## 14. 权限设计

Manifest 权限:

```json
{
  "permissions": ["storage", "bookmarks", "tabs"],
  "host_permissions": ["http://*/*", "https://*/*"]
}
```

说明:

- `storage` 用于设置。
- `bookmarks` 用于判断书签状态。
- `tabs` 用于读取当前标签信息或打开结果。
- `host_permissions` 用于普通网页 content script。

不申请远程 API 相关权限。

## 15. 性能与存储策略

采用简单、可维护的实现。

性能保护:

- 正文长度上限。
- 全文查询使用直接扫描。
- 搜索结果数量上限。
- popup 搜索提交时控制查询频率。
- 非书签页面过期清理。

存储保护:

- 非书签页面默认保存 60 天。
- 清理逻辑在启动、保存新页面或打开 popup 时触发。
- options 页显示本地空间占用统计,帮助用户判断是否需要清理数据。
- 不压缩正文。

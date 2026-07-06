# PastWithin 架构文档

本文档描述 PastWithin 的架构与设计决策。验收标准见 `docs/manual-test.md`,测试契约见 `tests/README.md`。

## 1. 目标与边界

PastWithin 是一个轻量、本地优先的 Chrome 插件,用于保存用户浏览过的历史网页全文,并支持通过全文关键词、连续片段、代码片段或短关键词找回页面。

已实现能力:

- 自动采集普通网页的标题、URL、全文、访问时间和书签状态。
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
- 内置完整文本采集工具
- `jieba-wasm` 中文分词
- `Intl.Segmenter` 英文分词

选型原因:

- Plasmo 减少 MV3、content script、popup、options 的样板配置。
- Dexie 简化 IndexedDB schema、索引和事务操作。
- 使用自研完整文本采集工具提取页面文本,策略偏召回,减少全文搜索漏页。
- 使用 `jieba-wasm` 的搜索模式进行中文分词,使用 `Intl.Segmenter` 处理英文词。
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

- `url` 保存用户最近一次访问的完整 URL,用于搜索结果点击打开。
- `normalizedUrl` 用于去重和覆盖更新,当前只移除 hash,保留 query。
- `pageKey` 当前等于 `normalizedUrl`,预留为后续稳定页面标识。
- 同一个 `normalizedUrl` 再次访问时更新记录,而不是重复插入。
- 不自动保存同一 URL 的历史快照;PastWithin 默认只保留页面的最新全文快照。

URL 存储原则:

- `#intro`、`#comment-3` 等 hash 通常只是页内定位,不视为不同页面。
- `?id=1`、`?page=2` 等 query 可能代表不同内容,第一版保持原样,不主动合并。
- 不默认移除 `utm_*`、`fbclid` 等跟踪参数,避免误合并真实依赖 query 的页面;后续可作为独立 URL 归一化增强评估。
- 动态内容流、聊天、搜索结果页等场景不做自动多快照兜底,避免存储膨胀和隐私风险。
- 如果未来需要记录某一时刻页面状态,优先考虑用户手动保存当前页快照,而不是默认按时间戳自动保存多份。

### 4.2 pageContents 表

保存全文和分词索引。

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

- `content` 用于全文查询和生成匹配片段;当用户关闭"保存全文"时,保存流程不新增或覆盖该字段。
- `titleWords`、`contentWords` 用于分词查询。
- 即使关闭"保存全文",保存流程仍可在内存中临时使用本次提取到的全文生成 `contentWords`,然后丢弃原始全文;如果该页面过去已经保存过全文,不会因为本次关闭开关而被清空。

### 4.3 settings 存储

设置放在 `chrome.storage.local`,因为 content script 需要读取排除规则和保存开关。

```ts
interface AppSettings {
  autoSaveEnabled: boolean
  saveBookmarkedOnly: boolean
  saveContentEnabled: boolean
  maxContentLength: number
  tempPageRetentionDays: number
  maxResults: number
  excludedUrlRules: UrlRule[]
}

interface UrlRule {
  id: string
  pattern: string
  enabled: boolean
  createdAt?: number
  updatedAt?: number
}
```

默认值:

```ts
const defaultSettings: AppSettings = {
  autoSaveEnabled: true,
  saveBookmarkedOnly: false,
  saveContentEnabled: true,
  maxContentLength: 1 * 1024 * 1024,
  tempPageRetentionDays: 60,
  maxResults: 50,
  excludedUrlRules: [
    { id: "default-1", pattern: "^chrome://", enabled: true },
    { id: "default-2", pattern: "^edge://", enabled: true },
    { id: "default-3", pattern: "^about:", enabled: true },
    { id: "default-4", pattern: "^file://", enabled: true },
    { id: "default-5", pattern: "^chrome-extension://", enabled: true },
    { id: "default-6", pattern: "^https://mail\\.google\\.com/", enabled: true },
    { id: "default-7", pattern: "^https://outlook\\.live\\.com/", enabled: true },
    { id: "default-8", pattern: "^https://.*\\.bank", enabled: true },
    { id: "default-9", pattern: "^https://.*\\.edu.*/(login|auth|jw|jiaowu)", enabled: true }
  ]
}
```

排除规则按条目保存。设置页中每条规则可单独编辑、保存、删除、启用或停用。URL 排除判断只使用 `enabled === true` 且正则合法的规则;新增或修改排除规则只影响之后的页面采集,不会自动删除已经保存的历史页面。

设置页普通设置即时保存:

- checkbox 切换后立即写入 `chrome.storage.local`。
- 数字输入在 blur 时校验正整数,合法才写入。
- 单页全文大小上限使用固定选项即时保存:512 KiB、1 MiB、2 MiB、5 MiB;默认 1 MiB。
- 保存成功使用右上角弹出后自动消失的轻量 toast,不占用页面布局空间。
- URL 规则编辑使用条目级保存,不被普通设置即时保存误提交。

`saveContentEnabled` 控制是否保存原始全文:

- 开启时,保存 `content`,允许使用全文查询,并能生成更准确的全文匹配片段。
- 关闭时,不新增或覆盖 `content`,全文查询在 UI 中不可选择;分词查询仍会更新 `titleWords` 和 `contentWords`。
- 如果用户关闭该选项后已有旧全文数据,保存流程会保留旧全文;设置页提供独立的"清空已保存全文"动作,并做二次确认,避免用户误以为关闭开关会自动删除历史全文。

## 5. 页面采集模块

content script 运行在普通网页:

```text
页面加载完成
→ 读取设置
→ 检查 URL 是否应排除
→ 检查是否启用自动保存
→ 提取全文
→ 发送 capturePage 消息给 background
→ background 判断书签状态
→ background 分词并写入 IndexedDB
```

全文提取策略:

1. 使用自研完整文本采集工具 `lib/extract.ts`,不使用 `@mozilla/readability`。
2. 策略偏召回:优先保留可见或近似可见的完整文本,服务全文搜索找回页面。
3. 只读遍历当前 DOM,不修改真实页面。
4. 跳过 `script`、`style`、`noscript`、`template`、`svg`、`canvas` 等无文本价值节点。
5. 跳过隐藏元素,包括 `hidden`、`aria-hidden="true"`、`display:none` 和 `visibility:hidden`。
6. 保留 `nav`、`header`、`footer`、`aside` 等区域的文本,因为 FAQ、课程目录、工具说明等内容可能出现在这些区域。
7. 递归遍历 DOM 树,按节点顺序收集文本节点内容,并对块级元素自动插入换行。
8. 采集 `input[value/placeholder]`、`textarea[value/placeholder]`、`img[alt]`、`button[value/aria-label/title]`、`[aria-label]`、`[title]` 等可见语义文本。
9. 对全文做基础清理:统一换行、合并过多空白、去掉空行和首尾空白。
10. 如果全文为空或长度过短,跳过保存。
11. 如果 `saveContentEnabled` 为关闭,全文只在本次保存流程中用于分词,不持久化保存。
12. `maxContentLength` 控制单页全文截断上限,由 content script 从设置读取后传入提取器。

阈值:

- 标题为空不阻止保存。
- 全文少于 20 个字符时跳过保存。
- 单页全文上限默认 1 MiB,可在设置页选择 512 KiB、1 MiB、2 MiB、5 MiB,避免异常页面过度占用 IndexedDB。

## 6. URL 排除模块

排除判断尽早发生在 content script 中,避免敏感页面全文被发送到 background。

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
- 不做云同步,不上传全文。

## 7. 分词查询模块

分词查询是默认搜索模式。

流程:

```text
用户输入 query
→ normalize query
→ `jieba-wasm` + `Intl.Segmenter` 分词
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
- 全文命中其次。
- 命中词越多越靠前。
- 访问时间越近越靠前。
- 书签页面加少量权重。

Dexie 查询方式:

- 对每个分词分别查 `titleWords` 和 `contentWords`。
- 聚合 pageId 命中次数。
- 再根据 pages 表补充 `visitTime`、`isBookmarked` 等排序因素。

分词由 `lib/wordSplit.ts` 提供:

- 中文使用 `jieba-wasm` 的 `cut_for_search` 搜索模式。
- 英文使用 `Intl.Segmenter("en", { granularity: "word" })`。
- 两者结果统一清洗、转小写、过滤空值并去重。
- `splitWords` 是异步函数,首次调用会初始化 WASM;初始化 Promise 会被缓存,失败后允许下次重试。

该实现不保留旧的中文单字/二元片段 fallback,也不引入 token 权重。

分词查询限制:

- 不保证连续片段匹配。
- 不保证英文/代码中间部分匹配。
- 对词中间片段和极短片段的召回弱于旧 fallback;这类场景应使用全文查询。

这些限制通过 UI 文案解释,并提供全文查询入口。

### 7.1 一次性搜索接口

`search` 是一次请求、一次响应的搜索接口,当前只用于分词查询。

```ts
interface SearchRequest {
  query: string
  mode: "token"
  onlyBookmarked?: boolean
  maxResults?: number
}
```

约束:

- 不保留同步全文查询路径,避免同一能力存在两套实现。
- `searchPages` 只负责分词查询、命中聚合、排序和片段生成。
- 全文查询统一走 `fulltextSearchStream` port 接口。

## 8. 全文查询模块

全文查询由用户手动选择,不作为默认模式。

全文查询依赖已保存的原始全文 `content`,统一使用 `chrome.runtime.connect({ name: "fulltextSearchStream" })` 建立流式搜索接口。当设置中的 `saveContentEnabled` 为关闭时:

- popup 中的全文查询选项置灰或隐藏。
- 如果当前模式已经是全文查询,自动切回分词查询。
- background 收到 `fulltextSearchStream` start 请求时再次校验设置,禁用状态下返回明确错误,避免 UI 状态不同步导致误查。

流程:

```text
用户输入原始 query
→ normalize query,但不分词
→ 建立 fulltextSearchStream port
→ 按 pageId 批量读取已保存全文
→ 对 content 做 includes 查询并累计进度
→ 找到匹配位置
→ 生成上下文片段
→ 完成或停止时返回前 maxResults 条
```

流式消息:

```ts
type FulltextSearchStreamRequest =
  | { type: "start"; payload: FulltextSearchStreamPayload }
  | { type: "stop" }

type FulltextSearchStreamResponse =
  | { type: "progress"; scannedCount: number; totalCount: number; matchedCount: number }
  | { type: "done"; scannedCount: number; totalCount: number; matchedCount: number; results: SearchResult[] }
  | { type: "stopped"; scannedCount: number; totalCount: number; matchedCount: number; results: SearchResult[] }
  | { type: "error"; error: string }
```

扫描规则:

- `totalCount` 只统计有已保存全文的页面。
- background 每批扫描后发送 `progress`,popup 显示 `搜索中 scannedCount / totalCount` 和 `已找到 matchedCount`。
- 点击"停止"发送 `{ type: "stop" }`,background 在当前批完成后返回 `stopped` 和已找到的部分结果。
- popup 收到 `stopped` 后不立即展示结果,而是显示 `已停止搜索,扫描 x / y,找到 n 条`;当 `n > 0` 时展示可点击的"显示已找到的结果"。
- popup 关闭或组件卸载时断开 port,background 停止扫描;不做后台持续任务。
- `maxResults` 只限制最终返回数量,不提前结束扫描。

短查询策略:

- 不禁止 `R2`、`tf`、`B7`、`.m` 等短查询。
- 短查询不再做二次确认;用户按 Enter 或点击搜索后直接发起全文查询。
- 全文查询期间可点击"停止"中断扫描,用于替代短查询确认带来的性能保护。

## 9. 匹配片段与高亮模块

结果需要解释"为什么匹配"。

全文查询片段:

- 找到 `content.indexOf(query)`。
- 取前后各 60 到 100 个字符。
- 查询词用高亮标记。

分词查询片段:

- 对分词结果逐个在 content 中查找。
- 使用最早或得分最高的命中位置生成片段。
- 如果全文中没有找到,退回标题或 URL。

高亮实现原则:

- 不直接拼接不可信 HTML。
- React 中将标题和片段切片渲染为普通 text node 和 `<mark>`。
- query 或 token 按文本处理,不作为 HTML 注入。
- 高亮匹配大小写不敏感,但展示原文大小写。
- 当分词查询只命中标题而全文片段无法解释命中时,片段回退为标题,保证结果能说明为什么匹配。

## 10. popup 模块

popup 是主入口,宽度 420px,高度 500px 左右。

控件:

- 搜索输入框、搜索方式菜单和搜索按钮同处一行,高度一致。
- 搜索方式菜单默认选择 `分词`,可切换 `全文`,不额外显示"搜索模式"字样。
- 顶部保留设置入口。
- 当"保存全文"关闭时,`全文查询` 不可选择,搜索框为空时使用 placeholder 显示 `保存全文关闭，全文查询不可用`。
- 当选择 `全文查询` 且搜索框为空时,使用 placeholder 显示 `按 Enter 或点击触发搜索`。
- 结果列表。
- 初始未搜索时,结果区域显示低不透明度应用图标、主标题和分词/全文模式提示。

结果项展示:

- 域名与访问时间位于结果顶部右侧两行展示。
- favicon 使用圆形浅灰背景,与域名和访问时间两行垂直居中组成结果顶部区域;图标获取失败时显示通用地球图标;书签页面在顶部区域右侧显示垂直居中的 `已收藏` 徽标。
- 标题独立一行展示,点击后打开完整 URL。
- 匹配片段,命中词高亮,过长时限制显示行数。

交互:

- `分词查询` 为默认模式,输入停止 300ms 后自动搜索。
- `全文查询` 不做实时搜索,用户需要按 Enter 或点击搜索后才发起查询;搜索期间输入框和模式选择锁定,搜索按钮变为"停止"。
- 用户提交表单时立即发起当前模式的搜索。
- 中文输入法组合输入期间不触发实时搜索,选词完成后再进入 300ms 防抖。
- 多次搜索并发返回时,只接受最新一次请求的结果,避免旧响应覆盖新结果。
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
- 是否保存全文。
- 本地空间占用统计。
- 清空本地数据。

清空数据需要二次确认。

空间占用统计展示:

- IndexedDB 已用空间估算值。
- 浏览器分配给扩展存储的 quota 估算值。
- 已保存页面数量。
- 已保存全文数量。

实现方式:

- 优先使用 `navigator.storage.estimate()` 获取 `usage` 和 `quota`。
- 页面数量通过 `db.pages.count()` 获取。
- 全文数量通过统计 `pageContents` 中 `content` 非空的记录获取。
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
  mode: "token"
  onlyBookmarked?: boolean
  maxResults?: number
}
```

全文查询使用 `fulltextSearchStream` port,不通过 `RuntimeMessage.search`。

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

只保存 `isBookmarked` 字段,不做完整书签内容同步,也不在启动时批量导入书签页面。

保存页面时:

- background 使用 `chrome.bookmarks.search({ url })` 判断是否已收藏。
- 写入 `isBookmarked`。

运行期监听:

- 注册 `chrome.bookmarks.onCreated` 监听:新书签创建时,通过 `updateBookmarkStatusByUrl` 更新已有页面 `isBookmarked = true`;只更新已采集过的页面,不创建新页面记录。
- 注册 `chrome.bookmarks.onRemoved` 监听:书签删除时,先用 `chrome.bookmarks.search({ url })` 确认是否仍有其他同 URL 书签;若没有,则更新已有页面 `isBookmarked = false`。
- 监听失败时 `console.warn`,不向外抛出异常,不阻塞 background 其他功能。
- `chrome.bookmarks` 不可用时安全跳过。

启动异步扫描:

- Service Worker 启动后延迟执行(默认 3s),使用 `chrome.storage.local` 记录上次成功同步时间,实现 24h 节流。
- 未到 24h 时跳过扫描。
- 到期时调用 `chrome.bookmarks.getTree()` 收集所有书签 URL,与当前 `pages` 表中所有页面的 `isBookmarked` 做校准:只更新状态发生变化的已有页面,不创建页面、不抓取全文、不修改 `visitTime`、不重建索引。
- 只有同步成功后写入 `pastWithinLastBookmarkStatusSyncAt` 时间戳。
- 同步失败时 `console.warn`,并把失败时间和错误信息记录到 `pastWithinLastBookmarkStatusSyncError`,不影响 background 启动;失败不会写入成功同步时间,也不会继续用空书签集合校准数据库。

约束:

- 不创建页面:如果某个书签 URL 从未被采集过,同步时不会为其创建 pages 记录。
- 不抓取全文:同步只更新 `isBookmarked` 字段,不触发页面采集、不访问网络。
- 不修改 `visitTime`:同步不改变访问时间。
- 状态没变化时不写入:避免无谓的 IndexedDB 事务。
- URL 通过 `normalizeUrl` 归一化匹配(移除 hash),确保 hash 差异不影响书签状态判断。

## 14. 权限设计

Manifest 权限:

```json
{
  "permissions": ["storage", "bookmarks", "tabs", "favicon"],
  "host_permissions": ["http://*/*", "https://*/*"]
}
```

说明:

- `storage` 用于设置。
- `bookmarks` 用于判断书签状态。
- `tabs` 用于读取当前标签信息或打开结果。
- `favicon` 用于通过 Chrome 内置 favicon URL 显示搜索结果图标。
- `host_permissions` 用于普通网页 content script。

不申请远程 API 相关权限。

## 15. 性能与存储策略

采用简单、可维护的实现。

性能保护:

- 全文长度上限。
- 全文查询使用 `fulltextSearchStream` 分批扫描并回传进度。
- 搜索结果数量上限。
- popup 中分词查询使用 300ms 输入防抖控制查询频率。
- popup 中全文查询保持手动触发,搜索期间锁定输入框和模式选择,支持停止扫描。
- 非书签页面过期清理。

存储保护:

- 非书签页面默认保存 60 天。
- 清理逻辑在启动、保存新页面或打开 popup 时触发。
- options 页显示本地空间占用统计,帮助用户判断是否需要清理数据。
- 不压缩全文。

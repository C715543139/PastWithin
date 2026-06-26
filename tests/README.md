# 测试契约

这些测试用于定义第一版能力的行为边界，并作为后续重构的回归保护。当前源码已经实现了测试所覆盖的核心模块，正常情况下 `npm test` 应通过。

## 运行方式

```bash
npm install
npm test
```

也可以进入监听模式：

```bash
npm run test:watch
```

## 依赖工具

测试使用：

- Vitest
- jsdom
- fake-indexeddb
- Testing Library
- React 测试工具链

## 模块约定

测试刻意面向小模块，而不是直接绑定浏览器全局对象：

- `lib/extract`
- `background/capturePipeline`
- `background/db`
- `background/search`
- `lib/urlRules`
- `lib/snippet`
- `popup/SearchApp`

实现时应保持这些模块可测试。`chrome.bookmarks`、`chrome.runtime` 等 Chrome API 应通过包装层或依赖注入传入，不要硬编码在纯逻辑函数内部。

## 当前预期状态

当前推荐的基础验收命令：

```bash
npm test
npx tsc --noEmit
```

如果后续改动导致测试失败，应优先确认失败是否来自接口行为变化，而不是直接放宽测试断言。确实需要调整行为契约时，应同步更新对应测试和实现文档。

## 已覆盖能力

- 页面标题、URL、正文、访问时间和书签状态采集。
- URL/域名排除规则。
- IndexedDB 页面数据、正文和分词索引保存。
- 分词查询和全文查询。
- 搜索结果字段、匹配片段和高亮。
- popup 搜索入口的基本交互。
- 清空本地数据。
- 本地空间占用统计。

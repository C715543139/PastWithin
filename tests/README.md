# 测试契约

这些测试用于先定义第一版能力的行为边界。当前根目录还没有正式插件源码，因此测试会先失败；后续实现源码模块时，应让这些测试逐步通过。

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

- `contents/capture`
- `background/capturePipeline`
- `background/db`
- `background/search`
- `lib/urlRules`
- `lib/snippet`
- `popup/SearchApp`

实现时应保持这些模块可测试。`chrome.bookmarks`、`chrome.runtime` 等 Chrome API 应通过包装层或依赖注入传入，不要硬编码在纯逻辑函数内部。

## 当前预期状态

在源码模块尚未实现前，`npm test` 会失败，常见失败原因包括：

- 找不到 `contents/capture`
- 找不到 `background/db`
- 找不到 `background/search`
- 找不到 `lib/urlRules`
- 找不到 `lib/snippet`
- 找不到 `popup/SearchApp`

这些失败是 TDD 阶段的正常状态，表示测试已经定义了后续实现需要满足的接口。

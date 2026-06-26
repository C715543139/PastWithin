# 手动安装与验收步骤

## 1. 安装依赖

```bash
npm install
```

## 2. 构建扩展

```bash
npm run build
```

构建产物输出到 `build/chrome-mv3-prod/`。

## 3. 在 Chrome 中加载扩展

1. 打开 `chrome://extensions/`。
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本仓库下的 `build/chrome-mv3-prod/` 目录。
5. 确认扩展卡片中出现 `PastWithin`。

## 4. Popup 验收

1. 点击 Chrome 工具栏中的 PastWithin 扩展图标。
2. 确认 popup 正常显示搜索框、搜索模式和设置按钮。
3. 输入关键词，确认能发起分词查询。
4. 切换全文查询，确认能搜索连续片段。
5. 关闭“保存正文”后，确认全文查询不可选择。

## 5. Options 验收

1. 在扩展详情页点击“扩展程序选项”，或从 popup 点击“设置”。
2. 确认可以修改自动保存、仅书签、保存正文、保存天数、最大结果数和 URL 排除规则。
3. 确认可以查看本地空间占用、页面数量和正文数量。
4. 确认清空正文和清空全部数据会二次确认。

## 6. Content Script 验收

1. 打开一个普通网页，例如 `https://example.com`。
2. 等页面加载完成后打开 popup 搜索网页中的词。
3. 确认被排除 URL 不会保存。

## 7. Background 验收

1. 在 `chrome://extensions/` 中打开 PastWithin 的 Service Worker 控制台。
2. 确认保存、搜索、设置、统计、清空数据时没有未处理错误。

## 8. 自动测试

```bash
npm test
npx tsc --noEmit
```


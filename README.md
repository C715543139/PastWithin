# PastWithin

一个轻量、本地优先的 Chrome 插件,用于保存用户浏览过的普通网页正文,并支持通过正文关键词、连续片段、代码片段或短关键词找回页面。

## 功能特性

- **自动采集**:自动保存访问网页的标题、URL、正文、访问时间和书签状态
- **本地存储**:使用 IndexedDB 在本地保存所有数据,不上传到远端
- **双模式搜索**:
  - **分词查询**:基于分词索引的快速搜索(默认模式)
  - **全文查询**:基于原始正文的精确匹配
- **智能高亮**:搜索结果展示匹配片段并高亮关键词
- **URL 排除**:支持正则表达式规则排除敏感页面
- **空间统计**:显示本地存储占用和页面数量
- **数据管理**:支持清空本地数据和已保存正文

## 技术栈

- Chrome Manifest V3
- Plasmo
- React + TypeScript
- Dexie (IndexedDB)
- Vitest (测试)

## 安装与构建

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建生产版本
npm run build
```

构建产物位于 `build/chrome-mv3-prod/`,在 Chrome 扩展管理页加载该目录即可使用。

## 测试

```bash
# 运行测试
npm test

# 监听模式
npm run test:watch

# 生成覆盖率报告
npx vitest run --coverage
```

测试契约和模块约定见 `tests/README.md`。

## 项目结构

```
.
├── background/          # background 服务(db、search、capturePipeline)
├── contents/            # content script (pageCapture)
├── popup/               # popup 搜索入口
├── options/             # options 设置页
├── lib/                 # 共享工具模块
├── tests/               # 测试文件
├── docs/                # 项目文档
└── assets/              # 静态资源
```

详细架构说明见 `docs/architecture.md`。

## 文档

- `docs/architecture.md` - 架构与设计决策
- `docs/implementation-plan.md` - 后续改进方向
- `docs/manual-test.md` - 手动验收标准
- `tests/README.md` - 测试契约与运行方式

## 权限说明

插件申请以下权限:

- `storage`:保存设置
- `bookmarks`:判断页面书签状态
- `tabs`:读取标签信息
- `host_permissions`:在普通网页运行 content script

所有数据默认保存在本地,不申请远程 API 相关权限。

## 许可证

见 `LICENSE` 文件。

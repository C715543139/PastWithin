export const VISIT_TIME = 1_780_000_000_000

export const ARTICLE_URL = "https://example.com/course/path-planning?week=3#section"
export const NORMALIZED_ARTICLE_URL = "https://example.com/course/path-planning?week=3"

export const ARTICLE_HTML = `
<!doctype html>
<html>
  <head>
    <title>路径规划课程笔记</title>
  </head>
  <body>
    <nav>首页 目录 登录</nav>
    <main>
      <article>
        <h1>路径规划课程笔记</h1>
        <p>人工智能课程讨论了路径规划、专家系统和知识图谱。</p>
        <p>老师发的基础换道控制器使用 DWA 和 CBS 作为示例。</p>
        <pre>Main.gd:328 total_len = Date.now() - tempPageExpireTime</pre>
      </article>
    </main>
  </body>
</html>
`

export const SIMPLE_PAGE_HTML = `
<!doctype html>
<html>
  <head>
    <title>调试记录</title>
  </head>
  <body>
    <div>torch.randint 报错发生在 PyTorch 张量生成逻辑中。</div>
    <div>另一个短关键词是 R2 和 Z轴。</div>
  </body>
</html>
`

export const capturedArticle = {
  url: ARTICLE_URL,
  title: "路径规划课程笔记",
  content:
    "人工智能课程讨论了路径规划、专家系统和知识图谱。\n老师发的基础换道控制器使用 DWA 和 CBS 作为示例。\nMain.gd:328 total_len = Date.now() - tempPageExpireTime",
  visitTime: VISIT_TIME
}

export const bookmarkedCapturedArticle = {
  ...capturedArticle,
  isBookmarked: true
}

export const defaultSettings = {
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

export function testSplitWords(input: string): string[] {
  if (!input) {
    return []
  }

  const dictionary = [
    "路径规划",
    "人工智能",
    "专家系统",
    "知识图谱",
    "基础换道控制器",
    "DWA",
    "CBS",
    "Main",
    "gd",
    "total",
    "len",
    "Date",
    "now",
    "tempPageExpireTime",
    "torch",
    "randint",
    "PyTorch",
    "R2",
    "Z轴"
  ]

  const normalized = input.toLowerCase()
  return dictionary
    .filter((word) => normalized.includes(word.toLowerCase()))
    .map((word) => word.toLowerCase())
}

export function uniqueDbName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}


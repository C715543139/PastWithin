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
    "首页 目录 登录\n路径规划课程笔记\n人工智能课程讨论了路径规划、专家系统和知识图谱。\n老师发的基础换道控制器使用 DWA 和 CBS 作为示例。\nMain.gd:328 total_len = Date.now() - tempPageExpireTime",
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

export const BIGJPG_HTML = `
<!doctype html>
<html>
  <head>
    <title>Bigjpg - AI Image Upscaler</title>
  </head>
  <body>
    <nav>首页 产品 定价</nav>
    <main>
      <h1>Bigjpg 图片无损放大</h1>
      <p>使用深度学习技术对图片进行无损放大。</p>
      <script>console.log("this should not appear in extraction")</script>
      <template><div>template content should not appear</div></template>
    </main>
    <aside>
      <h2>常见问题</h2>
      <dl>
        <dt>放大后会有毛刺吗？</dt>
        <dd>不会，图片边缘也不会有毛刺和重影。</dd>
        <dt>支持哪些格式？</dt>
        <dd>支持 PNG、JPG 和 WebP 格式。</dd>
      </dl>
      <div style="display:none">这段内容应该被隐藏，不会出现在正文中</div>
    </aside>
    <footer>Bigjpg 版权所有</footer>
    <canvas id="preview"></canvas>
    <svg><text>svg text should be removed</text></svg>
  </body>
</html>
`

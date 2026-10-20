# Vocabulary Review —— 数据驱动的模板

一个静态站点：`index.html` + `assets/` 是固定不变的 UI，内容全在 `books/` 下。
支持**多本书**，每本书下若干章；章节 id、标题都可以是任意文字，不要求数字顺序。
**加书、加章、改内容都不用改代码。**

## 目录结构

```
Quiz/                              ← 仓库根目录
  index.html                       ← 唯一页面
  package.json                     ← npm run data / npm run serve
  assets/
    quiz.css
    quiz.js                        ← 渲染 + 两级导航 + 交互（无内容）
  books/
    index.json                     ← 自动生成：所有书和章节的清单
    bundle.js                      ← 自动生成：file:// 双击打开时用
    spylark/
      book.json                    ← 这本书的元信息
      01.json                      ← 一章一个文件
      02.json
      03.json
    another-book/
      book.json
      prologue.json                ← id / 标题可以是任意文字
      the-storm.json
    _template/                     ← 新建书时整个复制（`_` 开头不进站点）
      book.json
      01.json
  tools/
    build-data.mjs                 ← 校验 JSON + 生成 index.json / bundle.js
    rebuild-data.cmd               ← 双击版
    serve.mjs                      ← 本地预览（等同 GitHub Pages）
  .github/workflows/pages.yml      ← push 到 main 就自动发布到 GitHub Pages
  .nojekyll                        ← 别让 GitHub 用 Jekyll 处理这个站点
  data/                            ← 原始笔记／书稿，整目录 .gitignore，不发布
  Spylark_Chapter_N_Review_Quiz.html   ← 旧链接，跳转到新页面
```

`data/` 和 `books/` 是刻意分开的：**`books/` 是站点内容，`data/` 是本地素材**。
`.gitignore` 只写 `data/`，所以原始笔记不会被推送，而 `books/**/*.json` 正常入库。

## 数据加载方式（自动选择）

| 打开方式 | 数据来源 | 改完 JSON 要做什么 |
| --- | --- | --- |
| GitHub Pages / `npm run serve` / 任意 http(s) | `fetch` 读 `books/index.json`，再按需取选中的章节文件 | **改内容：刷新即可**；**新书/新章：跑一次 rebuild**（push 后 CI 也会自动 rebuild） |
| 双击本地 `index.html`（`file://`） | 自动加载生成的 `books/bundle.js` | 需要 rebuild |

`index.json` 和 `bundle.js` 都是构建产物，**不要手改**。

## 加书 / 加章 / 改内容

**改内容**：直接编辑对应 `books/<书>/<章>.json`，刷新页面。

**加一章**（已有书）：

1. 复制 `books/<书>/` 里任意一章 → 改名（例如 `four.json`）；
2. 改 `id`（可留空，默认用文件名）、`title`、`order` 和内容；
3. 跑一次 `npm run data`（或双击 `tools/rebuild-data.cmd`）。

**加一本书**：

1. 复制整个 `books/_template/` → 改名成书的目录名（如 `books/dead-weather/`）；
2. 改 `book.json` 的 `title`（`id` 可留空，默认用目录名）和章节内容；
3. 跑一次 `npm run data`。

构建会校验所有数据，**有错就一个文件都不写**并列出全部问题：

```
Build failed — fix these first:

  ✗ books/dead-weather/prologue.json: quiz[2].prompt must contain exactly one {} placeholder
  ✗ books/dead-weather/prologue.json: words[1] "hull" needs at least one example sentence
  ✗ books/dead-weather/book.json: "id" must be lowercase letters, digits, dots, dashes or underscores
```

## 格式

`books/<书>/book.json`：

```json
{
  "id": "spylark",
  "title": "Spylark",
  "order": 1
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | | 默认取目录名；小写字母/数字/`.`/`-`/`_` |
| `title` | | 侧边栏和标题里显示的书名，默认取目录名 |
| `order` | | 书的排序，小的在前 |

`books/<书>/<章>.json`：

```json
{
  "id": "prologue",
  "title": "Prologue: The Wreck",
  "order": 1,
  "intro": "可选：整段替换 Learning Guide，可含 HTML",
  "words": [
    {
      "word": "return leg",
      "ipa": "/rɪˈtɜːn leɡ/",
      "examples": [
        "Tom Hopkins was beginning the return leg of his morning flight.",
        "例句可以有第二句"
      ]
    }
  ],
  "quiz": [
    {
      "prompt": "After a brief layover, the pilot prepared the aircraft for the {} of the journey.",
      "answer": "return leg",
      "hint": "返程段/第二回合",
      "key": "return leg"
    }
  ]
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | | 默认取文件名；任意文字（`prologue`、`the-storm`、`01` 都行） |
| `title` | | 显示名，任意文字；缺省时用 `Chapter <order>` 或 id |
| `order` | | 章节排序；缺省按文件名 |
| `intro` | | 整段替换 Learning Guide |
| `words[].word` | ✅ | 单词 / 词组 / idiom（保持原形，别拆开） |
| `words[].ipa` | | 音标，如 `rʌsɪt`、`/ˈrʌsɪt/`、`[ˈrʌsɪt]` 都行；渲染时统一显示成 `/ˈrʌsɪt/`，缺省就不显示 |
| `words[].examples` | ✅ | 至少一句，可多句 |
| `quiz[].prompt` | ✅ | 原句，用 **恰好一个 `{}`** 标出空位 |
| `quiz[].answer` | ✅ | 标准答案；判分忽略大小写、首尾空格、标点、弯引号 |
| `quiz[].hint` | ✅ | 中文提示（页面自动加 `(中文提示: …)`） |
| `quiz[].key` | | 答案附录里的写法，与 `answer` 不同时才需要（如 `take ... in`） |

`prompt` 按字面拼回原句，所以标点前后的空格很关键：
`"… in its left {} , causing…"` 会多出空格，正确是 `"… in its left {}, causing…"`。

## 选择 / 组合

侧边栏是**两级**的：书名（可折叠）→ 该书的章节（勾选）。每本书下面有 `select all` / `clear`。

- 勾一章 → 单章复习
- 勾多章（同一本书或跨书都行）→ 合并复习，每条前显示 `Ch 2` 或 `Spylark · Ch 2` 徽章，题号全局连续
- URL 可直接收藏/分享：
  - `index.html` — 上次的选择（记在 localStorage）
  - `index.html#book=dead-weather` — 该书第一章
  - `index.html#ch=spylark/01` — 单章
  - `index.html#ch=spylark/01,dead-weather/prologue` — 跨书合并
  - `index.html#ch=1` — 兼容旧写法，会在各书里找 id 为 `1` 的章节

## 本地预览

```
npm run serve          # 或 node tools/serve.mjs，默认 http://localhost:4173
```

这是和 GitHub Pages 完全一致的加载方式（读 JSON 原文，改完刷新即可）。
双击 `index.html` 也能用，走 `bundle.js`。

## 部署到 GitHub Pages（push 即发布）

仓库里已经放好了 [`.github/workflows/pages.yml`](.github/workflows/pages.yml)，只剩**一次**手工设置：

1. Settings → **Pages** → Build and deployment → Source 选 **GitHub Actions**
   （不是 *Deploy from a branch*）。
2. Done。之后每次 `git push` 到 `main` 都会自动跑一遍：
   1. `node tools/build-data.mjs` —— 校验 `books/**/*.json`，有错就整个 workflow 失败、线上保持旧版；
   2. 重新生成 `books/index.json` 和 `books/bundle.js`；
   3. 把 `index.html` + `assets/` + `books/` 发布上去（`data/`、`tools/`、`.git` 不上传）。

也可以在 Actions 页面点 **Run workflow**（`workflow_dispatch`）手动重发一次。站点形如
`https://<用户名>.github.io/<仓库名>/`，全部是相对路径，不需要改任何配置。

几点说明：

- 构建产物由 CI 重新生成，所以**本地忘了跑 `npm run data` 也能正确发布**；但为了双击 `index.html`
  离线能用，提交前跑一次、让 `index.json` / `bundle.js` 保持最新仍然是个好习惯。
- 分支名不是 `main`（比如 `master`）时，改 workflow 里的 `branches: [main]`。
- 私有仓库要发布 Pages 需要 GitHub Pro；公开仓库免费。
- 首次推送后去 Actions 看一次运行结果；`configure-pages` 报错通常就是第 1 步没做。

> `.gitignore` 里只有 `data/`，所以 `books/` 会正常入库；原始书稿不会。

## 交互

- **Check answers**：对的绿、错的红、没填的琥珀色，右侧显示得分。
- **Show answers**：填入全部答案（浅蓝、不锁定）。
- **Clear**：清空并去掉标记。
- **Print**：打印当前状态（侧边栏、工具条不打印）。
- `Enter` 跳到下一题；输入时自动清掉该题旧的对错色。
- 悬停（手机上点一下）中文提示，下方弹出答案气泡。
- 窄屏：左上角 `☰ 章节名` 打开抽屉式导航。

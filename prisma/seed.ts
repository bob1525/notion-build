import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import { DEMO_PASSWORD, DEMO_USERS } from "../src/lib/demo-accounts"
import { IDS, SEARCH_WORDS, TITLES, WORKSPACES } from "../src/lib/seed-ids"

const prisma = new PrismaClient()

type BlockSeed = {
  type: string
  content?: string
  checked?: boolean
  language?: string
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000)
}

function blocks(items: BlockSeed[]) {
  return items.map((item, position) => ({
    type: item.type,
    content: item.content ?? "",
    checked: item.checked ?? false,
    language: item.language ?? "",
    position,
  }))
}

async function makePage(input: {
  id: string
  title: string
  icon: string
  cover?: string
  visibility: "public" | "private"
  pinned?: boolean
  position?: number
  workspaceId: string
  parentId?: string | null
  authorId: string
  updatedAt: Date
  items: BlockSeed[]
}) {
  await prisma.page.create({
    data: {
      id: input.id,
      title: input.title,
      icon: input.icon,
      cover: input.cover ?? "",
      visibility: input.visibility,
      pinned: input.pinned ?? false,
      position: input.position ?? 0,
      workspaceId: input.workspaceId,
      parentId: input.parentId ?? null,
      authorId: input.authorId,
      createdAt: input.updatedAt,
      updatedAt: input.updatedAt,
      blocks: { create: blocks(input.items) },
    },
  })
}

async function main() {
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF")
  await prisma.$executeRawUnsafe('DELETE FROM "Favorite"')
  await prisma.$executeRawUnsafe('DELETE FROM "Block"')
  await prisma.$executeRawUnsafe('DELETE FROM "Page"')
  await prisma.$executeRawUnsafe('DELETE FROM "WorkspaceMember"')
  await prisma.$executeRawUnsafe('DELETE FROM "Workspace"')
  await prisma.$executeRawUnsafe('DELETE FROM "User"')
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON")

  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, 10)
  await prisma.user.createMany({
    data: [
      { id: IDS.nash, email: DEMO_USERS.nash.email, name: DEMO_USERS.nash.name, passwordHash },
      { id: IDS.mia, email: DEMO_USERS.mia.email, name: DEMO_USERS.mia.name, passwordHash },
    ],
  })

  await prisma.workspace.createMany({
    data: [
      {
        id: WORKSPACES.product.id,
        name: WORKSPACES.product.name,
        icon: WORKSPACES.product.icon,
        description: "路线、原则和会议都放在这里。公开页给全组看，草稿只留给作者。",
        createdAt: hoursAgo(240),
      },
      {
        id: WORKSPACES.research.id,
        name: WORKSPACES.research.name,
        icon: WORKSPACES.research.icon,
        description: "文献、实验和搜索笔记。页与页之间用子页面分层。",
        createdAt: hoursAgo(180),
      },
      {
        id: WORKSPACES.personal.id,
        name: WORKSPACES.personal.name,
        icon: WORKSPACES.personal.icon,
        description: "只属于 Nash 的阅读和周记。",
        createdAt: hoursAgo(120),
      },
    ],
  })

  await prisma.workspaceMember.createMany({
    data: [
      { userId: IDS.nash, workspaceId: IDS.product, role: "owner", createdAt: hoursAgo(240) },
      { userId: IDS.mia, workspaceId: IDS.product, role: "member", createdAt: hoursAgo(200) },
      { userId: IDS.nash, workspaceId: IDS.research, role: "owner", createdAt: hoursAgo(180) },
      { userId: IDS.mia, workspaceId: IDS.research, role: "member", createdAt: hoursAgo(160) },
      { userId: IDS.nash, workspaceId: IDS.personal, role: "owner", createdAt: hoursAgo(120) },
    ],
  })

  await makePage({
    id: IDS.welcome,
    title: TITLES.welcome,
    icon: "✨",
    cover: "warm",
    visibility: "public",
    pinned: true,
    position: 0,
    workspaceId: IDS.product,
    authorId: IDS.nash,
    updatedAt: hoursAgo(1),
    items: [
      { type: "paragraph", content: "Folio 是一个轻量的知识库。用页面把想法收好，用块把结构摆正。它看起来安静，写起来应该很快。" },
      { type: "heading2", content: "从这里开始" },
      { type: "bulleted", content: "左侧边栏切换工作区、收藏和页面树" },
      { type: "bulleted", content: "输入 / 插入标题、列表、待办、代码和分割线" },
      { type: "bulleted", content: "Markdown 模式可以整页改写，再切回可视化" },
      { type: "heading2", content: "写下来的顺序" },
      { type: "numbered", content: "先写一个能被搜索到的标题" },
      { type: "numbered", content: "把还没决定的事情收成待办" },
      { type: "numbered", content: "需要给同事看时，把页面改成公开" },
      { type: "heading2", content: "今天可以完成" },
      { type: "todo", content: "把路线图拆成嵌套子页面", checked: true },
      { type: "todo", content: "给设计原则补一条关于空状态的说明", checked: false },
      { type: "todo", content: "确认私有草稿不会出现在 Mia 的搜索里", checked: false },
      { type: "divider" },
      { type: "heading3", content: "搜索也会索引代码" },
      { type: "paragraph", content: "下面这个函数名可以被搜到。代码块保留语言，分割线只负责把段落隔开。" },
      {
        type: "code",
        language: "typescript",
        content: [
          "type Block = { id: string; type: string; content: string }",
          "",
          "export function wordCount(blocks: Block[]) {",
          "  return blocks",
          "    .map((block) => block.content.trim())",
          "    .filter(Boolean)",
          "    .join(\" \")",
          "    .split(/\\s+/).length",
          "}",
        ].join("\n"),
      },
    ],
  })

  await makePage({
    id: IDS.roadmap,
    title: TITLES.roadmap,
    icon: "🗺️",
    cover: "mist",
    visibility: "public",
    position: 0,
    parentId: IDS.welcome,
    workspaceId: IDS.product,
    authorId: IDS.nash,
    updatedAt: hoursAgo(20),
    items: [
      { type: "paragraph", content: "路线图挂在欢迎页下面。再往下还有季度和编辑器手感，用来演示三层嵌套。" },
      { type: "heading2", content: "现在在做" },
      { type: "bulleted", content: "块编辑器的键盘手感" },
      { type: "bulleted", content: "工作区内的公开 / 私有" },
      { type: "bulleted", content: "按标题和正文搜索" },
      { type: "heading3", content: "先不做" },
      { type: "paragraph", content: "实时协作、评论和文件上传都不在这一版里。页面仍然要能单独读完。" },
    ],
  })

  await makePage({
    id: IDS.q4,
    title: TITLES.q4,
    icon: "🎯",
    cover: "ink",
    visibility: "public",
    position: 0,
    parentId: IDS.roadmap,
    workspaceId: IDS.product,
    authorId: IDS.nash,
    updatedAt: hoursAgo(10),
    items: [
      { type: "paragraph", content: "Q4 只保留能被演示的里程碑。完成的打勾，没完成的留在列表里。" },
      { type: "todo", content: "嵌套页面在侧栏里能展开", checked: true },
      { type: "todo", content: "搜索「里程碑」能直接打开这一页", checked: true },
      { type: "todo", content: "切换到研究笔记后，这里不再出现", checked: false },
      { type: "divider" },
      { type: "numbered", content: "先稳定保存" },
      { type: "numbered", content: "再打磨空状态和加载" },
      { type: "numbered", content: "最后补公开链接" },
    ],
  })

  await makePage({
    id: IDS.editor,
    title: TITLES.editor,
    icon: "⌨️",
    cover: "moss",
    visibility: "public",
    position: 0,
    parentId: IDS.q4,
    workspaceId: IDS.product,
    authorId: IDS.mia,
    updatedAt: hoursAgo(8),
    items: [
      { type: "paragraph", content: `这是${SEARCH_WORDS.nested}的最深处。从欢迎页到路线图，再到 Q4，最后才到这里。` },
      { type: "heading2", content: "键盘" },
      { type: "bulleted", content: "Enter 把当前块拆开，列表会延续" },
      { type: "bulleted", content: "空的列表项再按 Enter，会退回普通段落" },
      { type: "bulleted", content: "在块的开头按 Backspace，标题会先变回文本" },
      { type: "heading3", content: "代码块" },
      { type: "paragraph", content: "代码块里的 Enter 是换行。Ctrl 或 ⌘ 加 Enter 才会到下一块。" },
      { type: "code", language: "bash", content: "npm test\nnpm run test:e2e" },
    ],
  })

  await makePage({
    id: IDS.meetings,
    title: TITLES.meetings,
    icon: "🗒️",
    cover: "",
    visibility: "public",
    position: 1,
    parentId: IDS.welcome,
    workspaceId: IDS.product,
    authorId: IDS.mia,
    updatedAt: hoursAgo(30),
    items: [
      { type: "heading2", content: "11 月 10 日" },
      { type: "paragraph", content: "决定把权限先做成两种：私有只给作者，公开给整个工作区，并带一条只读链接。" },
      { type: "todo", content: "Nash 整理欢迎页的示例块", checked: true },
      { type: "todo", content: "Mia 补一条编辑器手感", checked: true },
      { type: "todo", content: "下周再看要不要做拖拽排序", checked: false },
      { type: "bulleted", content: "收藏是每个人自己的" },
      { type: "bulleted", content: "置顶会改变同级页面的顺序，所有能看见它的人都会看到" },
    ],
  })

  await makePage({
    id: IDS.principles,
    title: TITLES.principles,
    icon: "🎨",
    cover: "rose",
    visibility: "public",
    pinned: true,
    position: 1,
    workspaceId: IDS.product,
    authorId: IDS.nash,
    updatedAt: hoursAgo(5),
    items: [
      { type: "heading1", content: "少，但是清楚" },
      { type: "paragraph", content: "界面只保留写字需要的东西。侧栏负责结构，页面负责内容，状态要告诉人系统有没有跟上。" },
      { type: "heading2", content: "编辑体验" },
      { type: "bulleted", content: "块与块之间不要抢焦点" },
      { type: "bulleted", content: "快捷输入应该能撤销回普通文本" },
      { type: "bulleted", content: "保存失败要留在原地，并且能重试" },
      { type: "heading3", content: "空状态也是界面" },
      { type: "paragraph", content: "没有页面的工作区不该是一片白。告诉人下一步可以新建，而不是让人猜按钮在哪。" },
      { type: "divider" },
      { type: "paragraph", content: "加载用骨架，错误给重试，没有权限就说明原因。" },
    ],
  })

  await makePage({
    id: IDS.draft,
    title: TITLES.draft,
    icon: "🔒",
    cover: "",
    visibility: "private",
    position: 2,
    workspaceId: IDS.product,
    authorId: IDS.nash,
    updatedAt: hoursAgo(3),
    items: [
      { type: "paragraph", content: `这是 Nash 的${SEARCH_WORDS.draft}。Mia 不应该在侧栏或搜索里看见它。` },
      { type: "heading2", content: "还没想清楚" },
      { type: "todo", content: "要不要给页面加封面图上传", checked: false },
      { type: "paragraph", content: "先留在私有里。等句子站得住，再改成公开。" },
    ],
  })

  await makePage({
    id: IDS.miaPrivate,
    title: TITLES.miaPrivate,
    icon: "💭",
    cover: "rose",
    visibility: "private",
    position: 3,
    workspaceId: IDS.product,
    authorId: IDS.mia,
    updatedAt: hoursAgo(6),
    items: [
      { type: "paragraph", content: `${SEARCH_WORDS.mia}只写给自己。Nash 即使是工作区所有者，也不该搜到这句。` },
      { type: "bulleted", content: "下一次评审前再决定要不要公开" },
      { type: "todo", content: "把含糊的句子删掉", checked: false },
    ],
  })

  await makePage({
    id: IDS.survey,
    title: TITLES.survey,
    icon: "📚",
    cover: "mist",
    visibility: "public",
    pinned: true,
    position: 0,
    workspaceId: IDS.research,
    authorId: IDS.nash,
    updatedAt: hoursAgo(15),
    items: [
      { type: "paragraph", content: "这一栏只记录读过的工具，不把产品工作台的会议混进来。" },
      { type: "heading2", content: "阅读顺序" },
      { type: "numbered", content: "先看信息架构" },
      { type: "numbered", content: "再看编辑器的键盘模型" },
      { type: "numbered", content: "最后才比较搜索" },
    ],
  })

  await makePage({
    id: IDS.compare,
    title: TITLES.compare,
    icon: "🧪",
    cover: "",
    visibility: "public",
    position: 0,
    parentId: IDS.survey,
    workspaceId: IDS.research,
    authorId: IDS.nash,
    updatedAt: hoursAgo(18),
    items: [
      { type: "heading2", content: "共同点" },
      { type: "bulleted", content: "页面是树，不是一叠平铺文档" },
      { type: "bulleted", content: "块比富文本选区更容易保存" },
      { type: "heading3", content: "差别" },
      { type: "paragraph", content: "有的产品把私有和空间分成两棵树。Folio 用同一棵树，并在私有页上放一把锁。" },
    ],
  })

  await makePage({
    id: IDS.blockux,
    title: TITLES.blockux,
    icon: "🧩",
    cover: "moss",
    visibility: "public",
    position: 1,
    parentId: IDS.survey,
    workspaceId: IDS.research,
    authorId: IDS.mia,
    updatedAt: hoursAgo(12),
    items: [
      { type: "paragraph", content: "斜杠菜单要能用中文过滤。待办、代码、分割线都应该在第一屏里找到。" },
      { type: "todo", content: "中文输入法组合期间不要拆块", checked: true },
      { type: "todo", content: "菜单靠近屏幕底部时向上展开", checked: true },
      { type: "code", language: "markdown", content: "# 标题\n\n- [ ] 待办\n\n---" },
    ],
  })

  await makePage({
    id: IDS.experiments,
    title: TITLES.experiments,
    icon: "🔬",
    cover: "ink",
    visibility: "public",
    position: 1,
    workspaceId: IDS.research,
    authorId: IDS.nash,
    updatedAt: hoursAgo(9),
    items: [
      { type: "paragraph", content: "实验记录和文献综述分开，避免一页里什么都有。" },
      { type: "bulleted", content: "样本都来自种子数据，方便重复跑测试" },
    ],
  })

  await makePage({
    id: IDS.searchlab,
    title: TITLES.searchlab,
    icon: "🔎",
    cover: "",
    visibility: "public",
    position: 0,
    parentId: IDS.experiments,
    workspaceId: IDS.research,
    authorId: IDS.nash,
    updatedAt: hoursAgo(4),
    items: [
      { type: "heading2", content: SEARCH_WORDS.lab },
      { type: "paragraph", content: "标题命中应该排在正文命中前面。完全相同的标题再排在部分匹配前面。" },
      { type: "numbered", content: "精确标题" },
      { type: "numbered", content: "标题包含" },
      { type: "numbered", content: "正文包含" },
      { type: "divider" },
      { type: "paragraph", content: "私有页面不能因为关键词独特，就被另一个成员搜出来。" },
    ],
  })

  await makePage({
    id: IDS.reading,
    title: TITLES.reading,
    icon: "📖",
    cover: "moss",
    visibility: "private",
    pinned: true,
    position: 0,
    workspaceId: IDS.personal,
    authorId: IDS.nash,
    updatedAt: hoursAgo(2),
    items: [
      { type: "paragraph", content: "个人空间里的阅读清单默认私有。它不该出现在产品工作台。" },
      { type: "todo", content: "重读关于空状态的那一章", checked: false },
      { type: "todo", content: "把搜索排序的例子摘到研究笔记", checked: true },
      { type: "bulleted", content: "界面要能在窄屏里完成搜索和新建" },
      { type: "bulleted", content: "种子数据要覆盖每一种块" },
    ],
  })

  await makePage({
    id: IDS.journal,
    title: TITLES.journal,
    icon: "🌿",
    cover: "warm",
    visibility: "private",
    position: 1,
    workspaceId: IDS.personal,
    authorId: IDS.nash,
    updatedAt: hoursAgo(28),
    items: [
      { type: "paragraph", content: "周记只是容器。真正的条目做成子页面，侧栏就能展开。" },
    ],
  })

  await makePage({
    id: IDS.week,
    title: TITLES.week,
    icon: "📅",
    cover: "",
    visibility: "private",
    position: 0,
    parentId: IDS.journal,
    workspaceId: IDS.personal,
    authorId: IDS.nash,
    updatedAt: hoursAgo(26),
    items: [
      { type: "heading2", content: "这周留下的" },
      { type: "numbered", content: "把欢迎页写成能直接演示的样子" },
      { type: "numbered", content: "给私有页一个明确的锁" },
      { type: "todo", content: "周末看一遍移动端侧栏", checked: false },
      { type: "divider" },
      { type: "code", language: "json", content: "{\n  \"workspace\": \"个人空间\",\n  \"visibility\": \"private\"\n}" },
    ],
  })

  await prisma.favorite.createMany({
    data: [
      { userId: IDS.nash, pageId: IDS.welcome },
      { userId: IDS.nash, pageId: IDS.principles },
      { userId: IDS.nash, pageId: IDS.reading },
      { userId: IDS.mia, pageId: IDS.meetings },
    ],
  })

  const counts = {
    users: await prisma.user.count(),
    workspaces: await prisma.workspace.count(),
    pages: await prisma.page.count(),
    blocks: await prisma.block.count(),
  }
  console.log("Seeded Folio", counts)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })

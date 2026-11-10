export const IDS = {
  nash: "user_nash",
  mia: "user_mia",
  product: "ws_product",
  research: "ws_research",
  personal: "ws_personal",
  welcome: "page_welcome",
  roadmap: "page_roadmap",
  q4: "page_q4",
  editor: "page_editor",
  meetings: "page_meetings",
  principles: "page_principles",
  draft: "page_draft",
  miaPrivate: "page_mia_private",
  survey: "page_survey",
  compare: "page_compare",
  blockux: "page_blockux",
  experiments: "page_experiments",
  searchlab: "page_searchlab",
  reading: "page_reading",
  journal: "page_journal",
  week: "page_week",
} as const

export const TITLES = {
  welcome: "欢迎来到 Folio",
  roadmap: "路线图",
  q4: "Q4 里程碑",
  editor: "编辑器手感",
  meetings: "会议纪要",
  principles: "设计原则",
  draft: "私人草稿",
  miaPrivate: "待定想法",
  survey: "文献综述",
  compare: "知识工具比较",
  blockux: "块编辑器交互",
  experiments: "实验记录",
  searchlab: "搜索相关性",
  reading: "阅读清单",
  journal: "周记",
  week: "十一月的一周",
} as const

export const WORKSPACES = {
  product: { id: IDS.product, name: "产品工作台", icon: "🚀" },
  research: { id: IDS.research, name: "研究笔记", icon: "🔬" },
  personal: { id: IDS.personal, name: "个人空间", icon: "🌿" },
} as const

export const SEARCH_WORDS = {
  draft: "夜航草稿",
  mia: "晚霞备忘",
  nested: "三层嵌套",
  code: "wordCount",
  lab: "相关性实验",
} as const

/**
 * kmaster-studio 简体中文语言包
 * V4：多语言骨架 — 核心文案 key-value 映射
 */
const zhCN: Record<string, string> = {
  // 导航
  'nav.chat': '聊天',
  'nav.memory': '记忆',
  'nav.jobs': '自动化',
  'nav.usage': '用量',
  'nav.queue': '队列',
  'nav.settings': '设置',

  // 聊天输入
  'chat.placeholder': '输入消息，Enter 发送，Shift+Enter 换行；运行中发送即「引导(steer)」；可拖入文件作为 @附件…',
  'chat.send': '发送 ▸',
  'chat.steer': '↪ 引导',
  'chat.stop': '⏹ 停止',
  'chat.resend': '重新发送 ▸',
  'chat.editing': '✎ 正在编辑消息',
  'chat.cancelEdit': '× 取消',
  'chat.editPlaceholder': '编辑消息…',
  'chat.connecting': '正在连接…',

  // 会话列表
  'session.title': '会话',
  'session.new': '+ 新会话',
  'session.search': '搜索会话…',
  'session.noMatch': '无匹配会话',
  'session.noSessions': '暂无会话',
  'session.rename': '✎ 重命名',
  'session.export': '📥 导出 Markdown',
  'session.bindWorkspace': '📁 绑定工作区',
  'session.delete': '🗑 删除',
  'session.deleteConfirm': '确认删除会话「{title}」？该操作不可恢复。',
  'session.exportSuccess': '导出成功',
  'session.exportFail': '导出失败',
  'session.workspaceTooltip': '工作区：{path}\n点击重新选择',

  // 侧边栏会话操作
  'sidebar.action.archive': '📦 归档',
  'sidebar.confirm.archive': '确认归档该会话？',

  // 消息
  'msg.copy': '📋 复制文本',
  'msg.copyCode': '📝 复制代码',
  'msg.regenerate': '🔄 重新生成',
  'msg.copied': '已复制',
  'msg.copyFailed': '复制失败',
  'msg.noCode': '消息中无代码块',

  // 空状态
  'empty.chat': '开始一段新对话吧 👋',
  'empty.artifact': '暂无产出物。发送消息后，agent 生成的文件会显示在这里。',
  'empty.files': '暂无文件。发送消息后，agent 生成的文件会显示在这里。',

  // 设置 — 通用
  'settings.theme': '主题',
  'settings.themeDark': '暗色',
  'settings.themeLight': '亮色',
  'settings.locale': '界面语言',
  'settings.localeHint': '当前版本仅提供简体中文与英文',
  'settings.cwd': '终端默认工作目录',
  'settings.cwdPlaceholder': '留空则使用用户主目录，例如 D:\\Projects',
  'settings.cwdHint': '内置终端新开会话时的起始目录；支持 ~ 展开，目录非法时终端会提示 bad_cwd',
  'settings.save': '保存',
  'settings.saved': '已保存终端默认工作目录',

  // 设置 — 语言选项
  'locale.zh-CN': '简体中文',
  'locale.en': 'English',
};

export default zhCN;

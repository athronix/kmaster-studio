/**
 * kmaster-studio English language pack
 * V4: i18n skeleton — core copy key-value mapping
 */
const en: Record<string, string> = {
  // Navigation
  'nav.chat': 'Chat',
  'nav.memory': 'Memory',
  'nav.jobs': 'Automation',
  'nav.usage': 'Usage',
  'nav.queue': 'Queue',
  'nav.settings': 'Settings',

  // Chat input
  'chat.placeholder': 'Type a message, Enter to send, Shift+Enter for new line; sending while running = steer; drag files as @attachments…',
  'chat.send': 'Send ▸',
  'chat.steer': '↪ Steer',
  'chat.stop': '⏹ Stop',
  'chat.resend': 'Resend ▸',
  'chat.editing': '✎ Editing message',
  'chat.cancelEdit': '× Cancel',
  'chat.editPlaceholder': 'Edit message…',
  'chat.connecting': 'Connecting…',

  // Session list
  'session.title': 'Sessions',
  'session.new': '+ New',
  'session.search': 'Search sessions…',
  'session.noMatch': 'No matching sessions',
  'session.noSessions': 'No sessions',
  'session.rename': '✎ Rename',
  'session.export': '📥 Export Markdown',
  'session.bindWorkspace': '📁 Bind Workspace',
  'session.delete': '🗑 Delete',
  'session.deleteConfirm': 'Delete session "{title}"? This cannot be undone.',
  'session.exportSuccess': 'Exported successfully',
  'session.exportFail': 'Export failed',
  'session.workspaceTooltip': 'Workspace: {path}\nClick to change',

  // Sidebar session actions
  'sidebar.action.archive': '📦 Archive',
  'sidebar.confirm.archive': 'Archive this session?',

  // Messages
  'msg.copy': '📋 Copy Text',
  'msg.copyCode': '📝 Copy Code',
  'msg.regenerate': '🔄 Regenerate',
  'msg.copied': 'Copied',
  'msg.copyFailed': 'Copy failed',
  'msg.noCode': 'No code blocks in message',

  // Empty states
  'empty.chat': 'Start a new conversation 👋',
  'empty.artifact': 'No artifacts yet. Send a message and agent-generated files will appear here.',
  'empty.files': 'No files yet. Send a message and agent-generated files will appear here.',

  // Settings — General
  'settings.theme': 'Theme',
  'settings.themeDark': 'Dark',
  'settings.themeLight': 'Light',
  'settings.locale': 'Language',
  'settings.localeHint': 'Currently supports Simplified Chinese and English',
  'settings.cwd': 'Default terminal working directory',
  'settings.cwdPlaceholder': 'Leave empty to use home directory, e.g. D:\\Projects',
  'settings.cwdHint': 'Starting directory for new terminal sessions; supports ~ expansion. Invalid directories will trigger a bad_cwd notice.',
  'settings.save': 'Save',
  'settings.saved': 'Terminal default working directory saved',

  // Settings — locale options
  'locale.zh-CN': '简体中文',
  'locale.en': 'English',
};

export default en;

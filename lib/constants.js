export const COLORS = [
  '\x1b[36m',  // cyan
  '\x1b[33m',  // yellow
  '\x1b[35m',  // magenta
  '\x1b[32m',  // green
  '\x1b[34m',  // blue
  '\x1b[91m',  // bright-red
  '\x1b[96m',  // bright-cyan
]

export const DIM = '\x1b[2m'
export const RESET = '\x1b[0m'
export const BOLD = '\x1b[1m'
export const RED = '\x1b[31m'

export const PANE_STATE = { HIDDEN: 'hidden', NORMAL: 'normal', EXPANDED: 'expanded' }
export const MAX_BUFFER_LINES = 500

// Shift+number on US keyboard → expand toggle
export const EXPAND_KEYS = { '!': 0, '@': 1, '#': 2, '$': 3, '%': 4, '^': 5, '&': 6 }

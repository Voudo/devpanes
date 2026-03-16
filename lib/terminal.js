import { RESET } from './constants.js'

export const write = s => process.stdout.write(s)
export const cols = () => process.stdout.columns || 80
export const rows = () => process.stdout.rows || 24
export const moveTo = (row, col) => write(`\x1b[${row};${col}H`)
export const clearLine = () => write('\x1b[2K')
export const clearScreen = () => write('\x1b[2J\x1b[H')
export const resetScrollRegion = () => write('\x1b[r')
export const enterAltScreen = () => write('\x1b[?1049h')
export const exitAltScreen = () => write('\x1b[?1049l')
export const hideCursor = () => write('\x1b[?25l')
export const showCursor = () => write('\x1b[?25h')

export const truncateToWidth = (text, maxWidth) => {
  let visible = 0
  let result = ''
  let index = 0
  while (index < text.length && visible < maxWidth) {
    if (text[index] === '\x1b' && index + 1 < text.length && text[index + 1] === '[') {
      result += '\x1b['
      index += 2
      while (index < text.length && !/[A-Za-z]/.test(text[index])) {
        result += text[index]
        index++
      }
      if (index < text.length) {
        result += text[index]
        index++
      }
    } else {
      result += text[index]
      visible++
      index++
    }
  }
  if (visible < maxWidth) result += ' '.repeat(maxWidth - visible)
  result += RESET
  return result
}

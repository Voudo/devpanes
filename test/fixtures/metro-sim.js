// Simulates Metro/Expo output patterns: clear screen, cursor movement, progress bars, colors
const ESC = '\x1b['

// Expo's Log.clear()
process.stdout.write(`${ESC}2J${ESC}3J${ESC}H`)

// Metro logo (colored)
console.log(`${ESC}34m  Welcome to Metro v0.80.0${ESC}0m`)
console.log(`${ESC}2m  Fast · Scalable · Integrated${ESC}0m\n`)

// Simulated bundle progress with cursor movement
let progress = 0
const interval = setInterval(() => {
  progress += 20
  // Metro overwrites the previous line with cursor-up + clear-line
  process.stdout.write(`${ESC}1A${ESC}2K`)
  const filled = '█'.repeat(progress / 5)
  const empty = '░'.repeat(20 - progress / 5)
  console.log(`${ESC}33mBUNDLE${ESC}0m ${filled}${empty} ${progress}%`)

  if (progress >= 100) {
    clearInterval(interval)
    console.log(`${ESC}32m✓${ESC}0m Bundle complete in 1.2s`)
    console.log(`\n${ESC}36mMetro:${ESC}0m http://localhost:8081`)
    console.log(`${ESC}2mPress r to reload, d for dev menu${ESC}0m`)
  }
}, 300)

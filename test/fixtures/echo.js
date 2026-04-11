import * as readline from 'node:readline'

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

console.log('Ready! Type something and press Enter.')

rl.on('line', line => {
  console.log(`You said: ${line}`)
})

rl.on('close', () => {
  console.log('Goodbye!')
})

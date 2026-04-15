import * as readline from 'node:readline'

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

const questions = [
  { prompt: 'What is the capital of France? ', answer: 'paris' },
  { prompt: 'What color is the sky? ', answer: 'blue' },
  { prompt: 'What language does Node.js run? ', answer: 'javascript' },
]

let current = 0
let score = 0

const ask = () => {
  if (current >= questions.length) {
    console.log(`\nDone! You scored ${score}/${questions.length}.`)
    rl.close()
    return
  }
  process.stdout.write(questions[current].prompt)
}

rl.on('line', line => {
  const correct = line.trim().toLowerCase() === questions[current].answer
  console.log(correct ? '✓ Correct!' : `✗ Nope — it's "${questions[current].answer}"`)
  if (correct) score++
  current++
  ask()
})

ask()

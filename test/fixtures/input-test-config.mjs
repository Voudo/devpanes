export default {
  name: 'Input Test',
  apps: [
    { key: 'quiz', label: 'Quiz', cwd: '.', cmd: 'node', args: ['quiz.js'] },
    { key: 'echo', label: 'Echo', cwd: '.', cmd: 'node', args: ['echo.js'] },
    { key: 'clock', label: 'Clock', cwd: '.', cmd: 'node', args: ['-e', 'setInterval(() => console.log(new Date().toLocaleTimeString()), 2000)'] },
  ],
}

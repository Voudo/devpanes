export default {
  name: 'Metro Sim',
  apps: [
    { key: 'metro', label: 'Metro', cwd: '.', cmd: 'node', args: ['metro-sim.js'] },
    { key: 'echo', label: 'Echo', cwd: '.', cmd: 'node', args: ['echo.js'] },
    { key: 'clock', label: 'Clock', cwd: '.', cmd: 'node', args: ['-e', 'setInterval(() => console.log(new Date().toLocaleTimeString()), 2000)'] },
  ],
}

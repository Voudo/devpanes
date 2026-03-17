export default {
  name: 'Test Project',
  apps: [
    { key: 'web', label: 'Web', cwd: '.', cmd: 'node', args: ['server.js'], port: 3000 },
    { key: 'api', label: 'API', cwd: 'packages/api', cmd: 'npm', args: ['start'], port: 8080 },
  ],
}

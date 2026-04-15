export default {
  apps: [
    {
      key: 'api',
      label: 'API',
      cwd: '.',
      cmd: 'node',
      args: ['index.js'],
      port: 3001,
      infra: { cmd: 'docker', args: ['compose', 'up', '-d'], label: 'docker' },
    },
  ],
}

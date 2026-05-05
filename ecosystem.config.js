module.exports = {
  apps: [
    {
      name: 'sabiostore-bot',
      script: 'index.js',
      cwd: '/opt/sabiostore',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'sabiostore-panel',
      script: 'panel/server.js',
      cwd: '/opt/sabiostore',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};

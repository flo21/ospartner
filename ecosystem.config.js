export default {
  apps: [
    {
      name: 'partner-os',
      cwd: './server',
      script: 'src/server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      },
      time: true,
      max_memory_restart: '300M'
    }
  ]
};

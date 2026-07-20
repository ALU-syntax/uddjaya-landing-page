module.exports = {
  apps: [
    {
      name: 'uddjaya-membership',
      script: 'src/app.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: 3000,
      },
      max_memory_restart: '300M',
      time: true,
    },
  ],
};

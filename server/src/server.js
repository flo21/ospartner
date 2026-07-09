import { app } from './app.js';
import { env } from './config/env.js';
import { initializeDatabase } from './db/init.js';

initializeDatabase()
  .then(() => {
    app.listen(env.port, () => {
      console.log(`Partner OS API listening on http://localhost:${env.port}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database');
    console.error(error);
    process.exit(1);
  });

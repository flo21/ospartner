import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

if (process.env.NODE_ENV === 'production') {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.production'), override: true });
  dotenv.config({ path: path.resolve(process.cwd(), '../.env.production'), override: true });
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  uploadDir: process.env.UPLOAD_DIR || 'uploads/contracts',
  databasePath: process.env.DATABASE_PATH || 'server/data/partner-os.sqlite'
};

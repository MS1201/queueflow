import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/queueflow',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  timezone: process.env.TIMEZONE || 'Asia/Kolkata',
  isProd: process.env.NODE_ENV === 'production',
};

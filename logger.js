/**
 * logger.js — Winston logger مشترك بين كل الملفات
 */
import winston from 'winston';

const { combine, timestamp, colorize, printf, json } = winston.format;

const isProduction = process.env.NODE_ENV === 'production';

export const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  format: isProduction
    ? combine(timestamp(), json())
    : combine(
        colorize(),
        timestamp({ format: 'HH:mm:ss' }),
        printf(({ level, message, timestamp, ...meta }) => {
          const extras = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
          return `${timestamp} ${level}: ${message}${extras}`;
        })
      ),
  transports: [new winston.transports.Console()],
});

export default logger;

// Entry for the Vercel serverless function: Express apps are request handlers.
import app from '../server';
(module as unknown as { exports: unknown }).exports = app;

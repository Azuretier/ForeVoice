import dotenv from 'dotenv';
dotenv.config();
const { DISCORD_TOKEN, DISCORD_CLIENT_ID, GEMINI_API_KEY } = process.env;

const red = "\x1b[31m";
const reset = "\x1b[0m";

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID || !GEMINI_API_KEY) {
  console.log(`${red}Error: ${reset}Missing required environment variables. Please check your .env file.`);
  process.exit(1);
}
export const config = {
  DISCORD_TOKEN,
  DISCORD_CLIENT_ID,
  GEMINI_API_KEY,
};
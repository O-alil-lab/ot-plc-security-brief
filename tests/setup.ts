import { config } from "dotenv";
config({ quiet: true });
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.APP_SECRET = "test-secret-0123456789abcdef0123456789abcdef";
process.env.APP_BASE_URL = "http://localhost:3000";
process.env.EMAIL_PROVIDER = "console";
process.env.AI_PROVIDER = "none";
// Tests never go through the egress proxy.
process.env.FETCH_PROXY_URL = "";

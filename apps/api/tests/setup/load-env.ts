import { config } from "dotenv";
import { resolve } from "node:path";

process.env.NODE_ENV = "test";
config({ path: resolve(import.meta.dirname, "../../.env.test") });

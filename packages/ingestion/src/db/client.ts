import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://smartos:smartos@localhost:54320/smartos";

export const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema });

export type Database = typeof db;

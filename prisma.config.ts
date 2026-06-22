// Prisma 7 config. Connection now lives here (driver-adapter model) rather than
// in schema.prisma. Uses the local better-sqlite3 adapter against ./data/app.db.
import path from "node:path";
import { defineConfig } from "prisma/config";

const dbPath = path.join(process.cwd(), "data", "app.db");

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  // Used by the Prisma CLI (migrate/studio). The app runtime builds its own
  // adapter in src/lib/db.ts.
  datasource: {
    url: `file:${dbPath}`,
  },
});

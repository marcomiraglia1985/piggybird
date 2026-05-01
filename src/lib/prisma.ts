import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "node:path";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient() {
  // Risolve l'URL del DB:
  //   1. DATABASE_URL env var (es. "file:/Users/x/Library/Application Support/.../piggybird.db")
  //      — usata in production .app dove Tauri lo setta runtime con app_data_dir
  //   2. Fallback: dev.db relativo a process.cwd() — utile in dev
  const envUrl = process.env.DATABASE_URL;
  const url = envUrl && envUrl.trim()
    ? envUrl.trim()
    : `file:${path.resolve(process.cwd(), "dev.db")}`;
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

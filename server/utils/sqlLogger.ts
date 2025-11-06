import { sql } from "drizzle-orm";
import { db } from "../db";

export async function logQuery(label: string, q: string) {
  console.log(`[SQL_PROBE:${label}]`, q);
  const res = await db.execute(sql.raw(q));
  console.log(`[SQL_RESULT:${label}]`, JSON.stringify(res).slice(0, 500));
  return res;
}

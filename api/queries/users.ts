import { eq } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./connection";

export async function findUserByUnionId(unionId: string) {
  const rows = await getDb().select().from(schema.users).where(eq(schema.users.unionId, unionId)).limit(1);
  return rows.at(0);
}

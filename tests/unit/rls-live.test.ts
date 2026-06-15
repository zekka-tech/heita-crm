import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const ownerUrl = process.env.DATABASE_URL;
const appUrl = process.env.APP_DATABASE_URL;
const describeIfDbConfigured = ownerUrl && appUrl ? describe : describe.skip;

describeIfDbConfigured("live RLS enforcement", () => {
  let owner: Client;
  let app: Client;
  let userId: string;
  let businessAId: string;
  let businessBId: string;

  beforeAll(async () => {
    owner = new Client({ connectionString: ownerUrl });
    app = new Client({ connectionString: appUrl });

    await owner.connect();
    await app.connect();

    userId = randomUUID();
    businessAId = randomUUID();
    businessBId = randomUUID();

    await owner.query(
      `INSERT INTO "User" ("id", "email") VALUES ($1, $2)`,
      [userId, `rls-live-${userId}@example.com`]
    );

    await owner.query(
      `INSERT INTO "Business" ("id", "slug", "name", "category", "province")
       VALUES ($1, $2, $3, 'GROCERY', 'GAUTENG'),
              ($4, $5, $6, 'GROCERY', 'GAUTENG')`,
      [
        businessAId,
        `rls-live-${businessAId}`,
        "RLS Live A",
        businessBId,
        `rls-live-${businessBId}`,
        "RLS Live B"
      ]
    );

    await owner.query(
      `INSERT INTO "Membership" ("id", "businessId", "userId", "joinChannel")
       VALUES ($1, $2, $3, 'QR_CODE'),
              ($4, $5, $3, 'QR_CODE')`,
      [randomUUID(), businessAId, userId, randomUUID(), businessBId]
    );
  });

  afterAll(async () => {
    await owner.query(`DELETE FROM "Business" WHERE "id" = ANY($1::text[])`, [[businessAId, businessBId]]);
    await owner.query(`DELETE FROM "User" WHERE "id" = $1`, [userId]);
    await app.end();
    await owner.end();
  });

  it("fails closed when the app role does not set app.current_business_id", async () => {
    const result = await app.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM "Membership"`
    );

    expect(result.rows[0]?.count).toBe(0);
  });

  it("returns only the scoped tenant rows after setting the transaction-local GUC", async () => {
    await app.query("BEGIN");

    try {
      await app.query(
        `SELECT set_config('app.current_business_id', $1, true)`,
        [businessAId]
      );

      const result = await app.query<{ businessId: string }>(
        `SELECT "businessId" FROM "Membership" ORDER BY "businessId" ASC`
      );

      expect(result.rows).toEqual([{ businessId: businessAId }]);
    } finally {
      await app.query("ROLLBACK");
    }
  });
});

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");

function readAllMigrationSql(): string {
  const migrationsDir = resolve(process.cwd(), "prisma/migrations");
  const dirs = readdirSync(migrationsDir, { withFileTypes: true });
  let sql = "";
  for (const entry of dirs) {
    if (entry.isDirectory()) {
      const sqlPath = join(migrationsDir, entry.name, "migration.sql");
      try {
        sql += readFileSync(sqlPath, "utf8") + "\n";
      } catch {
        // skip
      }
    }
  }
  return sql;
}

const allMigrations = readAllMigrationSql();

function businessScopedModels() {
  const models = new Set<string>(["Business"]);
  const modelBlocks = schema.matchAll(/model\s+(\w+)\s+\{([\s\S]*?)\n\}/g);

  for (const [, modelName, body] of modelBlocks) {
    if (/^\s*businessId\s+String(?:\s|$)/m.test(body ?? "")) {
      models.add(modelName ?? "");
    }
  }

  return [...models].filter(Boolean).sort();
}

describe("business RLS migration", () => {
  it("covers every required business-scoped model across all migrations", () => {
    const missing = businessScopedModels().filter((model) => {
      return !allMigrations.includes(`ALTER TABLE "${model}" ENABLE ROW LEVEL SECURITY;`);
    });

    expect(missing).toEqual([]);
  });

  it("forces RLS and uses the transaction-local business scope for each covered table", () => {
    for (const model of businessScopedModels()) {
      expect(allMigrations).toContain(`ALTER TABLE "${model}" FORCE ROW LEVEL SECURITY;`);
      expect(allMigrations).toContain(`DROP POLICY IF EXISTS "${model}_business_scope" ON "${model}";`);
      expect(allMigrations).toContain("current_setting('app.current_business_id', true)::text");
    }
  });

  it("does not accidentally scope nullable businessId records", () => {
    expect(businessScopedModels()).not.toContain("UserConsent");
  });

  it("allows explicit public reads for active, non-deleted business identities", () => {
    const migration0040 = readFileSync(
      resolve(process.cwd(), "prisma/migrations/0040_enable_business_rls/migration.sql"),
      "utf8"
    );
    expect(migration0040).toContain('DROP POLICY IF EXISTS "Business_public_active_read" ON "Business";');
    expect(migration0040).toContain('CREATE POLICY "Business_public_active_read" ON "Business"');
    expect(migration0040).toContain('FOR SELECT');
    expect(migration0040).toContain('USING ("deletedAt" IS NULL AND "isActive" = true)');
  });
});

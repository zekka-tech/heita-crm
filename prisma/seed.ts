// Valid plan IDs matching the canonical 4-tier pricing ladder in src/lib/billing.ts.
// FREE=R0 | STARTER=R499/mo | GROWTH=R1499/mo | SCALE=R4999/mo
const VALID_PLAN_IDS = ["FREE", "STARTER", "GROWTH", "SCALE"] as const;

async function main() {
  // TODO: seed demo businesses, tiers, rewards, and staff users for local dev
  // All seed businesses must use one of the canonical plan IDs above.
  process.stdout.write(
    `Seed placeholder: implement seeding in prisma/seed.ts\nValid plan IDs: ${VALID_PLAN_IDS.join(", ")}\n`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});


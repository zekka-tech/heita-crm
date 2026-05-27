import { parse } from "csv-parse/sync";
import { ImportStatus, JoinChannel, Prisma, TransactionType } from "@prisma/client";

import { normalizeZaPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { recordStaffAuditLog } from "@/server/services/staff-audit.service";

type ImportRow = {
  name?: string;
  phone?: string;
  openingPoints?: string;
  tier?: string;
};

const MAX_IMPORT_ROWS = 2000;
const MAX_CSV_BYTES = 10 * 1024 * 1024; // 10 MB
const CUSTOMER_IMPORT_TRANSACTION_OPTIONS = {
  maxWait: 5_000,
  timeout: 30_000
};

function parseImportRows(sourceCsv: string): ImportRow[] {
  if (Buffer.byteLength(sourceCsv, "utf8") > MAX_CSV_BYTES) {
    throw new Error(
      "CSV file exceeds the 10 MB limit. Split the file into smaller chunks and re-import."
    );
  }

  const records = parse(sourceCsv, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }) as Record<string, string>[];

  return records.map((record) => ({
    name: sanitizeCsvField(record.name ?? record.Name ?? ""),
    phone: record.phone ?? record.Phone ?? record.msisdn ?? "",
    openingPoints:
      record.openingPoints ??
      record.opening_points ??
      record.points ??
      record.balance ??
      "0",
    tier: sanitizeCsvField(record.tier ?? record.Tier ?? "")
  }));
}

// Prefix formula-injection characters to prevent spreadsheet formula execution
// when staff export customer data to Excel/Google Sheets.
const CSV_FORMULA_CHARS = /^[=+\-@\t\r]/;
function sanitizeCsvField(value: string): string {
  return CSV_FORMULA_CHARS.test(value) ? `'${value}` : value;
}

function parseOpeningPoints(raw: string | undefined) {
  if (!raw?.trim()) {
    return 0;
  }

  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : NaN;
}

export async function createCustomerImportRun(input: {
  businessId: string;
  actorUserId: string;
  fileName: string;
  sourceCsv: string;
}) {
  const rows = parseImportRows(input.sourceCsv);

  if (rows.length === 0) {
    throw new Error("The CSV file does not contain any customer rows.");
  }

  if (rows.length > MAX_IMPORT_ROWS) {
    throw new Error(`Imports are limited to ${MAX_IMPORT_ROWS} rows at a time.`);
  }

  return prisma.customerImportRun.create({
    data: {
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      fileName: input.fileName,
      sourceCsv: input.sourceCsv,
      totalRows: rows.length
    }
  });
}

export async function processCustomerImportRun(importRunId: string) {
  return prisma.$transaction(async (tx) => {
    const importRun = await tx.customerImportRun.update({
      where: { id: importRunId },
      data: { status: ImportStatus.PROCESSING }
    });

    const business = await tx.business.findUniqueOrThrow({
      where: { id: importRun.businessId },
      include: {
        loyaltyTiers: {
          orderBy: { minPoints: "asc" }
        }
      }
    });

    const rows = parseImportRows(importRun.sourceCsv ?? "");
    let importedRows = 0;
    let skippedRows = 0;
    const errors: Array<{ row: number; error: string }> = [];

    for (const [index, row] of rows.entries()) {
      try {
        const phone = normalizeZaPhone(row.phone ?? "");
        if (!phone) {
          throw new Error("Invalid South African phone number.");
        }

        const openingPoints = parseOpeningPoints(row.openingPoints);
        if (!Number.isFinite(openingPoints)) {
          throw new Error("Opening points must be a positive whole number.");
        }

        const user =
          (await tx.user.findUnique({
            where: { phone }
          })) ??
          (await tx.user.create({
            data: {
              phone,
              name: row.name?.trim() || null
            }
          }));

        const existingMembership = await tx.membership.findUnique({
          where: {
            businessId_userId: {
              businessId: business.id,
              userId: user.id
            }
          }
        });

        if (existingMembership) {
          skippedRows += 1;
          continue;
        }

        const resolvedTier = row.tier?.trim()
          ? business.loyaltyTiers.find(
              (tier) => tier.name.toLowerCase() === row.tier?.trim().toLowerCase()
            ) ?? null
          : [...business.loyaltyTiers]
              .reverse()
              .find((tier) => openingPoints >= tier.minPoints) ?? null;

        const membership = await tx.membership.create({
          data: {
            businessId: business.id,
            userId: user.id,
            joinChannel: JoinChannel.CSV_IMPORT,
            pointsBalance: openingPoints,
            tierId: resolvedTier?.id ?? null
          }
        });

        if (openingPoints > 0) {
          await tx.loyaltyTransaction.create({
            data: {
              businessId: business.id,
              membershipId: membership.id,
              userId: importRun.actorUserId,
              type: TransactionType.ADJUSTMENT,
              pointsDelta: openingPoints,
              description: "Imported opening balance",
              metadata: {
                importRunId: importRun.id
              }
            }
          });
        }

        importedRows += 1;
      } catch (error) {
        errors.push({
          row: index + 2,
          error: error instanceof Error ? error.message : "Import failed."
        });
      }
    }

    const status = errors.length > 0 ? ImportStatus.FAILED : ImportStatus.COMPLETED;
    const updatedRun = await tx.customerImportRun.update({
      where: { id: importRun.id },
      data: {
        status,
        importedRows,
        skippedRows,
        failedRows: errors.length,
        errorSummary: errors.length
          ? ({ rows: errors } as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        finishedAt: new Date(),
        sourceCsv: null
      }
    });

    await recordStaffAuditLog(
      {
        businessId: business.id,
        actorUserId: importRun.actorUserId,
        action: "CUSTOMER_IMPORT_RUN",
        targetType: "CustomerImportRun",
        targetId: importRun.id,
        metadata: {
          fileName: importRun.fileName,
          importedRows,
          skippedRows,
          failedRows: errors.length
        }
      },
      tx
    );

    return updatedRun;
  }, CUSTOMER_IMPORT_TRANSACTION_OPTIONS);
}

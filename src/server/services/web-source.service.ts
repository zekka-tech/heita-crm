import { WebSourceStatus, type WebSource } from "@prisma/client";

import { enqueueWebCrawlJob } from "@/lib/ai/web-crawl-queue";
import { MAX_CRAWL_DEPTH, MAX_CRAWL_PAGES } from "@/lib/ai/web-crawler";
import { prisma } from "@/lib/prisma";
import { assertPublicHttpUrl } from "@/lib/security";
import {
  AiWorkspaceServiceError,
  isAiWorkspaceServiceError
} from "@/server/services/ai-workspace.service";
import { recordStaffAuditLog } from "@/server/services/staff-audit.service";

export { isAiWorkspaceServiceError };

const MAX_WEB_SOURCES_PER_BUSINESS = 10;
const ALLOWED_REFRESH_DAYS = new Set([0, 7, 30, 90]);

type CreateWebSourceInput = {
  businessId: string;
  actorUserId?: string | null;
  rootUrl: string;
  maxDepth: number;
  maxPages: number;
  refreshIntervalDays: number;
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(Math.trunc(value), max));
}

export async function createWebSource(input: CreateWebSourceInput): Promise<WebSource> {
  // Up-front SSRF + format check for fast user feedback; the crawler re-checks
  // every fetched URL and redirect hop.
  let domain: string;
  try {
    await assertPublicHttpUrl(input.rootUrl);
    domain = new URL(input.rootUrl).hostname;
  } catch (error) {
    throw new AiWorkspaceServiceError(
      error instanceof Error && error.message.startsWith("assertPublicHttpUrl")
        ? "Enter a valid, publicly reachable http(s) URL."
        : "Enter a valid URL.",
      400,
      "INVALID_URL"
    );
  }

  const workspace = await prisma.aiWorkspace.findUnique({
    where: { businessId: input.businessId },
    select: { id: true }
  });
  if (!workspace) {
    throw new AiWorkspaceServiceError("AI workspace not found.", 404, "AI_WORKSPACE_NOT_FOUND");
  }

  const existingCount = await prisma.webSource.count({ where: { businessId: input.businessId } });
  if (existingCount >= MAX_WEB_SOURCES_PER_BUSINESS) {
    throw new AiWorkspaceServiceError(
      `You can add up to ${MAX_WEB_SOURCES_PER_BUSINESS} web sources. Delete one to add another.`,
      429,
      "WEB_SOURCE_LIMIT"
    );
  }

  const refreshIntervalDays = ALLOWED_REFRESH_DAYS.has(input.refreshIntervalDays)
    ? input.refreshIntervalDays
    : 0;

  const source = await prisma.webSource.create({
    data: {
      workspaceId: workspace.id,
      businessId: input.businessId,
      rootUrl: input.rootUrl,
      domain,
      maxDepth: clamp(input.maxDepth, 0, MAX_CRAWL_DEPTH),
      maxPages: clamp(input.maxPages, 1, MAX_CRAWL_PAGES),
      refreshIntervalDays,
      status: WebSourceStatus.PENDING
    }
  });

  if (input.actorUserId) {
    await recordStaffAuditLog({
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      action: "AI_WEB_SOURCE_CREATE",
      targetType: "WebSource",
      targetId: source.id,
      metadata: { rootUrl: source.rootUrl, maxDepth: source.maxDepth, maxPages: source.maxPages }
    });
  }

  await enqueueWebCrawlJob(source.id);

  return source;
}

export async function listWebSources(businessId: string): Promise<WebSource[]> {
  return prisma.webSource.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" }
  });
}

async function requireOwnedSource(id: string, businessId: string): Promise<WebSource> {
  const source = await prisma.webSource.findUnique({ where: { id } });
  if (!source || source.businessId !== businessId) {
    throw new AiWorkspaceServiceError("Web source not found.", 404, "WEB_SOURCE_NOT_FOUND");
  }
  return source;
}

export async function deleteWebSource(input: {
  id: string;
  businessId: string;
  actorUserId?: string | null;
}): Promise<void> {
  await requireOwnedSource(input.id, input.businessId);
  // businessId in the where clause is defense-in-depth on top of the ownership
  // check above — the mutation can never touch another tenant's row, even under
  // a TOCTOU race.
  await prisma.webSource.delete({ where: { id: input.id, businessId: input.businessId } });

  if (input.actorUserId) {
    await recordStaffAuditLog({
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      action: "AI_WEB_SOURCE_DELETE",
      targetType: "WebSource",
      targetId: input.id
    });
  }
}

export async function refreshWebSource(input: {
  id: string;
  businessId: string;
}): Promise<WebSource> {
  const source = await requireOwnedSource(input.id, input.businessId);
  // businessId in the where clause is defense-in-depth on top of the ownership
  // check above (see deleteWebSource).
  const updated = await prisma.webSource.update({
    where: { id: source.id, businessId: input.businessId },
    data: { status: WebSourceStatus.PENDING, errorMessage: null }
  });
  await enqueueWebCrawlJob(source.id);
  return updated;
}

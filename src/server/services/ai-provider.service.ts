import {
  AiProvider,
  AiProviderConnectionStatus,
  StaffRole,
  type AiProviderConnection
} from "@prisma/client";

import {
  probeByokConnection,
  resolveProviderBaseUrl,
  type ByokRuntime
} from "@/lib/ai/providers";
import { getProviderDefinition } from "@/lib/ai/providers/registry";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/secret-crypto";
import { assertPublicHttpUrl } from "@/lib/security";
import { requireRole } from "@/lib/staff";
import { recordStaffAuditLog } from "@/server/services/staff-audit.service";

/**
 * Bring-your-own-model provider connections.
 *
 * Businesses store their own LLM API key (encrypted at rest) and pick the
 * model that powers their AI co-worker. One connection per workspace can be
 * "active"; the RAG pipeline tries it first and falls back to the platform
 * runtimes (Ollama → platform Anthropic) when absent or failing.
 *
 * Plaintext keys never leave this module: list/read paths expose only
 * keyLast4, and the decrypted key is handed exclusively to the streaming
 * adapters via resolveActiveByokRuntime.
 */

const MANAGE_ROLES = [StaffRole.OWNER, StaffRole.MANAGER] as const;
const MAX_CONNECTIONS_PER_BUSINESS = 10;
const MAX_KEY_LENGTH = 4096;
const MAX_MODEL_LENGTH = 200;
const MAX_LABEL_LENGTH = 100;

export class AiProviderServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = "AiProviderServiceError";
  }
}

/** Connection shape safe to return to the UI — no key material. */
export type AiProviderConnectionView = {
  id: string;
  provider: AiProvider;
  label: string | null;
  baseUrl: string | null;
  keyLast4: string;
  chatModel: string;
  status: AiProviderConnectionStatus;
  lastValidatedAt: Date | null;
  lastError: string | null;
  isActive: boolean;
  createdAt: Date;
};

function toView(
  connection: AiProviderConnection,
  activeConnectionId: string | null
): AiProviderConnectionView {
  return {
    id: connection.id,
    provider: connection.provider,
    label: connection.label,
    baseUrl: connection.baseUrl,
    keyLast4: connection.keyLast4,
    chatModel: connection.chatModel,
    status: connection.status,
    lastValidatedAt: connection.lastValidatedAt,
    lastError: connection.lastError,
    isActive: connection.id === activeConnectionId,
    createdAt: connection.createdAt
  };
}

async function getWorkspace(businessId: string) {
  return prisma.aiWorkspace.upsert({
    where: { businessId },
    create: { businessId },
    update: {},
    select: { id: true, activeConnectionId: true }
  });
}

export async function listProviderConnections(input: {
  businessId: string;
  userId: string;
}): Promise<AiProviderConnectionView[]> {
  await requireRole({
    businessId: input.businessId,
    userId: input.userId,
    allowedRoles: [...MANAGE_ROLES]
  });

  const [workspace, connections] = await Promise.all([
    getWorkspace(input.businessId),
    prisma.aiProviderConnection.findMany({
      where: { businessId: input.businessId },
      orderBy: { createdAt: "asc" }
    })
  ]);

  return connections.map((connection) =>
    toView(connection, workspace.activeConnectionId)
  );
}

export async function createProviderConnection(input: {
  businessId: string;
  userId: string;
  provider: AiProvider;
  apiKey: string;
  chatModel?: string | null;
  label?: string | null;
  baseUrl?: string | null;
}): Promise<AiProviderConnectionView> {
  await requireRole({
    businessId: input.businessId,
    userId: input.userId,
    allowedRoles: [...MANAGE_ROLES]
  });

  const definition = getProviderDefinition(input.provider);
  const apiKey = input.apiKey.trim();
  const chatModel = (input.chatModel?.trim() || definition.defaultModel) ?? "";
  const label = input.label?.trim() || null;
  const baseUrl = input.baseUrl?.trim() || null;

  if (!apiKey || apiKey.length > MAX_KEY_LENGTH) {
    throw new AiProviderServiceError("A valid API key is required.", 400, "INVALID_KEY");
  }
  if (!chatModel || chatModel.length > MAX_MODEL_LENGTH) {
    throw new AiProviderServiceError("A model identifier is required.", 400, "INVALID_MODEL");
  }
  if (label && label.length > MAX_LABEL_LENGTH) {
    throw new AiProviderServiceError("Label is too long.", 400, "INVALID_LABEL");
  }

  if (definition.allowsCustomBaseUrl) {
    if (!baseUrl) {
      throw new AiProviderServiceError(
        "This provider requires a base URL.",
        400,
        "BASE_URL_REQUIRED"
      );
    }
    try {
      await assertPublicHttpUrl(baseUrl);
    } catch (error) {
      throw new AiProviderServiceError(
        error instanceof Error ? error.message : "Base URL rejected.",
        400,
        "BASE_URL_REJECTED"
      );
    }
  } else if (baseUrl) {
    throw new AiProviderServiceError(
      "This provider does not accept a custom base URL.",
      400,
      "BASE_URL_NOT_ALLOWED"
    );
  }

  const existingCount = await prisma.aiProviderConnection.count({
    where: { businessId: input.businessId }
  });
  if (existingCount >= MAX_CONNECTIONS_PER_BUSINESS) {
    throw new AiProviderServiceError(
      "Connection limit reached for this business.",
      400,
      "CONNECTION_LIMIT"
    );
  }

  const workspace = await getWorkspace(input.businessId);

  const connection = await prisma.$transaction(async (tx) => {
    const created = await tx.aiProviderConnection.create({
      data: {
        businessId: input.businessId,
        provider: input.provider,
        label,
        baseUrl,
        encryptedApiKey: encryptSecret(apiKey),
        keyLast4: apiKey.slice(-4),
        chatModel,
        createdByUserId: input.userId
      }
    });

    await recordStaffAuditLog(
      {
        businessId: input.businessId,
        actorUserId: input.userId,
        action: "AI_PROVIDER_CONNECTION_CREATE",
        targetType: "AiProviderConnection",
        targetId: created.id,
        metadata: { provider: created.provider, chatModel: created.chatModel }
      },
      tx
    );

    return created;
  }, { maxWait: 5000, timeout: 10000 });

  return toView(connection, workspace.activeConnectionId);
}

async function findOwnedConnection(businessId: string, connectionId: string) {
  const connection = await prisma.aiProviderConnection.findFirst({
    where: { id: connectionId, businessId }
  });
  if (!connection) {
    throw new AiProviderServiceError("Connection not found.", 404, "NOT_FOUND");
  }
  return connection;
}

/**
 * Probe the stored credentials with a single-token request and persist the
 * outcome (ACTIVE or INVALID + error message).
 */
export async function validateProviderConnection(input: {
  businessId: string;
  userId: string;
  connectionId: string;
}): Promise<AiProviderConnectionView> {
  await requireRole({
    businessId: input.businessId,
    userId: input.userId,
    allowedRoles: [...MANAGE_ROLES]
  });

  const connection = await findOwnedConnection(input.businessId, input.connectionId);
  const baseUrl = await resolveProviderBaseUrl(connection.provider, connection.baseUrl);

  const error = await probeByokConnection({
    provider: connection.provider,
    baseUrl,
    apiKey: decryptSecret(connection.encryptedApiKey),
    model: connection.chatModel
  });

  const [workspace, updated] = await Promise.all([
    getWorkspace(input.businessId),
    prisma.aiProviderConnection.update({
      where: { id: connection.id },
      data: error
        ? { status: AiProviderConnectionStatus.INVALID, lastError: error.slice(0, 500) }
        : {
            status: AiProviderConnectionStatus.ACTIVE,
            lastError: null,
            lastValidatedAt: new Date()
          }
    })
  ]);

  await recordStaffAuditLog({
    businessId: input.businessId,
    actorUserId: input.userId,
    action: "AI_PROVIDER_CONNECTION_VALIDATE",
    targetType: "AiProviderConnection",
    targetId: connection.id,
    metadata: { ok: !error }
  });

  return toView(updated, workspace.activeConnectionId);
}

/** Make a connection the workspace brain (or clear it with connectionId null). */
export async function setActiveProviderConnection(input: {
  businessId: string;
  userId: string;
  connectionId: string | null;
}): Promise<void> {
  await requireRole({
    businessId: input.businessId,
    userId: input.userId,
    allowedRoles: [...MANAGE_ROLES]
  });

  if (input.connectionId) {
    await findOwnedConnection(input.businessId, input.connectionId);
  }

  await prisma.$transaction(async (tx) => {
    await tx.aiWorkspace.upsert({
      where: { businessId: input.businessId },
      create: { businessId: input.businessId, activeConnectionId: input.connectionId },
      update: { activeConnectionId: input.connectionId }
    });

    await recordStaffAuditLog(
      {
        businessId: input.businessId,
        actorUserId: input.userId,
        action: input.connectionId
          ? "AI_PROVIDER_CONNECTION_ACTIVATE"
          : "AI_PROVIDER_CONNECTION_DEACTIVATE",
        targetType: "AiProviderConnection",
        targetId: input.connectionId
      },
      tx
    );
  }, { maxWait: 5000, timeout: 10000 });
}

export async function deleteProviderConnection(input: {
  businessId: string;
  userId: string;
  connectionId: string;
}): Promise<void> {
  await requireRole({
    businessId: input.businessId,
    userId: input.userId,
    allowedRoles: [...MANAGE_ROLES]
  });

  const connection = await findOwnedConnection(input.businessId, input.connectionId);

  await prisma.$transaction(async (tx) => {
    // The FK is SetNull, but clear explicitly so the workspace never points
    // at a deleted brain even momentarily.
    await tx.aiWorkspace.updateMany({
      where: { businessId: input.businessId, activeConnectionId: connection.id },
      data: { activeConnectionId: null }
    });
    await tx.aiProviderConnection.delete({ where: { id: connection.id } });
    await recordStaffAuditLog(
      {
        businessId: input.businessId,
        actorUserId: input.userId,
        action: "AI_PROVIDER_CONNECTION_DELETE",
        targetType: "AiProviderConnection",
        targetId: connection.id,
        metadata: { provider: connection.provider }
      },
      tx
    );
  }, { maxWait: 5000, timeout: 10000 });
}

/**
 * Resolve the decrypted runtime config for a business's active BYOK
 * connection, or null when none is configured/usable. Called on the chat
 * hot path — failures degrade to platform runtimes rather than throwing.
 */
export async function resolveActiveByokRuntime(
  businessId: string
): Promise<ByokRuntime | null> {
  try {
    const workspace = await prisma.aiWorkspace.findUnique({
      where: { businessId },
      select: { activeConnection: true }
    });
    const connection = workspace?.activeConnection;
    if (!connection) return null;
    if (connection.status === AiProviderConnectionStatus.DISABLED) return null;

    return {
      connectionId: connection.id,
      provider: connection.provider,
      baseUrl: await resolveProviderBaseUrl(connection.provider, connection.baseUrl),
      apiKey: decryptSecret(connection.encryptedApiKey),
      model: connection.chatModel
    };
  } catch (error) {
    logger.warn({ err: error, businessId }, "ai.byok.resolve_failed");
    return null;
  }
}

/**
 * Record a runtime failure against a connection so the dashboard can surface
 * it. Fire-and-forget from the chat path.
 */
export async function recordByokRuntimeError(
  connectionId: string,
  message: string
): Promise<void> {
  try {
    await prisma.aiProviderConnection.update({
      where: { id: connectionId },
      data: { lastError: message.slice(0, 500) }
    });
  } catch (error) {
    logger.warn({ err: error, connectionId }, "ai.byok.record_error_failed");
  }
}

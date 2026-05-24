import { StaffRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { enqueueDocumentIngestion } from "@/lib/ai/document-processor";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/staff";

type CompleteUploadRouteProps = {
  params: Promise<{ documentId: string }>;
};

export async function POST(
  _request: Request,
  { params }: CompleteUploadRouteProps
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { documentId } = await params;
  const document = await prisma.businessDocument.findUnique({
    where: { id: documentId }
  });

  if (!document) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  await requireRole({
    businessId: document.businessId,
    userId: session.user.id,
    allowedRoles: [StaffRole.AI_TRAINER, StaffRole.MANAGER]
  });

  const result = await enqueueDocumentIngestion(documentId);

  return NextResponse.json({
    status: "accepted",
    documentId,
    ingestion: result
  });
}

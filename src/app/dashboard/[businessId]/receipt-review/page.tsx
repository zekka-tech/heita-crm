import { redirect } from "next/navigation";
import Image from "next/image";
import { CheckCircle, Clock, Receipt } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/badge";
import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/staff";
import { listPendingOcrReceipts } from "@/server/services/ocr-receipt.service";
import { ReceiptReviewActions } from "./receipt-review-actions";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ businessId: string }>;
};

export default async function ReceiptReviewPage({ params }: PageProps) {
  const { businessId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/sign-in?callbackUrl=/dashboard/${businessId}/receipt-review`);
  }

  await requireRole({
    businessId,
    userId: session.user.id,
    allowedRoles: ["OWNER", "MANAGER"]
  });

  const receipts = await listPendingOcrReceipts(businessId);

  return (
    <main className="px-4 pb-24 pt-6 sm:px-8 space-y-6">
      <div className="flex items-center gap-3">
        <Receipt className="h-6 w-6 text-primary-action" />
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">
            Receipt approvals
          </h1>
          <p className="text-sm text-ink-muted">
            Review customer-submitted receipts and approve or reject point awards.
          </p>
        </div>
        <Chip variant="warning" size="sm" className="ml-auto">
          <Clock className="h-3 w-3" />
          {receipts.length} pending
        </Chip>
      </div>

      {receipts.length === 0 ? (
        <Card variant="outline">
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CheckCircle className="h-8 w-8 text-green-500" />
            <p className="font-semibold text-ink">All caught up!</p>
            <p className="text-sm text-ink-muted">No receipt submissions are awaiting review.</p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {receipts.map((receipt) => (
            <Card key={receipt.id} variant="surface" className="space-y-4">
              <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl bg-surface-elevated">
                <Image
                  src={receipt.imageUrl}
                  alt={`Receipt from ${receipt.parsedBusiness ?? "unknown business"}`}
                  fill
                  className="object-contain"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
              </div>

              <div className="space-y-1 text-sm">
                {receipt.parsedBusiness && (
                  <p className="font-semibold text-ink">{receipt.parsedBusiness}</p>
                )}
                {receipt.parsedTotal !== null && (
                  <p className="text-ink-muted">
                    Total:{" "}
                    <span className="font-medium text-ink">
                      R{receipt.parsedTotal.toFixed(2)}
                    </span>
                  </p>
                )}
                {receipt.pointsToAward !== null && (
                  <p className="text-ink-muted">
                    Points to award:{" "}
                    <span className="font-medium text-green-600">
                      {receipt.pointsToAward} pts
                    </span>
                  </p>
                )}
                <p className="text-xs text-ink-subtle">
                  Submitted {receipt.createdAt.toLocaleDateString("en-ZA")}
                </p>
              </div>

              <ReceiptReviewActions
                receiptId={receipt.id}
                businessId={businessId}
                suggestedPoints={receipt.pointsToAward ?? 0}
              />
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}

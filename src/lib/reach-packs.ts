import type { MessagePackGroup } from "@prisma/client";

/**
 * Reach-pack catalog — purchasable bundles of extra outbound-message volume that
 * stack on top of a plan's monthly quota (Tier-1 advertising monetization).
 * Prices are whole Rand; `validDays` scopes a pack's `expiresAt` window.
 */
export type ReachPackSku = {
  id: string;
  label: string;
  group: MessagePackGroup;
  units: number;
  priceZar: number;
  validDays: number;
};

export const REACH_PACK_SKUS: ReachPackSku[] = [
  { id: "wa_500", label: "500 WhatsApp messages", group: "WHATSAPP", units: 500, priceZar: 149, validDays: 30 },
  { id: "wa_2000", label: "2,000 WhatsApp messages", group: "WHATSAPP", units: 2000, priceZar: 499, validDays: 30 },
  { id: "inapp_2000", label: "2,000 in-app messages", group: "IN_APP", units: 2000, priceZar: 99, validDays: 30 },
  { id: "inapp_10000", label: "10,000 in-app messages", group: "IN_APP", units: 10000, priceZar: 349, validDays: 30 }
];

export function getReachPackSku(id: string): ReachPackSku | undefined {
  return REACH_PACK_SKUS.find((sku) => sku.id === id);
}

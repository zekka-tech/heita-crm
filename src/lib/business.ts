import { randomBytes } from "node:crypto";

import { BusinessCategory, Province } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export function slugifyBusinessName(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function createUniqueBusinessSlug(name: string) {
  const base = slugifyBusinessName(name) || "heita-business";
  let slug = base;
  let suffix = 2;

  while (await prisma.business.findUnique({ where: { slug } })) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

export function createJoinToken(prefix: "qr" | "join") {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

export const businessCategories = Object.values(BusinessCategory);
export const provinces = Object.values(Province);

export function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

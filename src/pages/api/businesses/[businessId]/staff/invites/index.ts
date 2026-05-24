import type { NextApiRequest, NextApiResponse } from "next";

import {
  handleCreateStaffInviteRequest,
  handleListStaffInvitesRequest
} from "@/server/http/staff-invite-handler";
import {
  nextApiRequestToRequest,
  writeFetchResponseToNextApi
} from "@/server/http/next-api-adapter";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const businessId = Array.isArray(req.query.businessId)
    ? req.query.businessId[0]
    : req.query.businessId;

  if (!businessId) {
    return res.status(400).json({ error: "Missing business id." });
  }

  const method = req.method ?? "GET";
  if (method !== "GET" && method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const request = await nextApiRequestToRequest(req);
  const response =
    method === "POST"
      ? await handleCreateStaffInviteRequest(request, businessId)
      : await handleListStaffInvitesRequest(request, businessId);

  await writeFetchResponseToNextApi(res, response);
}

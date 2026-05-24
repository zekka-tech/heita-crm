import type { NextApiRequest, NextApiResponse } from "next";

import { handleRevokeStaffInviteRequest } from "@/server/http/staff-invite-handler";
import {
  nextApiRequestToRequest,
  writeFetchResponseToNextApi
} from "@/server/http/next-api-adapter";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const inviteId = Array.isArray(req.query.inviteId)
    ? req.query.inviteId[0]
    : req.query.inviteId;
  if (!inviteId) {
    return res.status(400).json({ error: "Missing invite id." });
  }

  const request = await nextApiRequestToRequest(req);
  const response = await handleRevokeStaffInviteRequest(request, inviteId);
  await writeFetchResponseToNextApi(res, response);
}

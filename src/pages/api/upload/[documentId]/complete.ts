import type { NextApiRequest, NextApiResponse } from "next";

import { handleCompleteUpload } from "@/server/http/upload-handler";
import {
  nextApiRequestToRequest,
  writeFetchResponseToNextApi
} from "@/server/http/next-api-adapter";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const documentId = Array.isArray(req.query.documentId)
    ? req.query.documentId[0]
    : req.query.documentId;
  if (!documentId) {
    return res.status(400).json({ error: "Missing document id." });
  }

  const request = await nextApiRequestToRequest(req);
  const response = await handleCompleteUpload(request, documentId);
  await writeFetchResponseToNextApi(res, response);
}

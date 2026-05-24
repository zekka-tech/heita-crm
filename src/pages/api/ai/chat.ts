import type { NextApiRequest, NextApiResponse } from "next";

import { handleAiChatRequest } from "@/server/http/ai-chat-handler";
import {
  nextApiRequestToRequest,
  writeFetchResponseToNextApi
} from "@/server/http/next-api-adapter";

export const config = {
  api: {
    responseLimit: false
  }
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const request = await nextApiRequestToRequest(req);
  const response = await handleAiChatRequest(request);
  await writeFetchResponseToNextApi(res, response);
}

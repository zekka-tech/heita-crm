import type { NextApiRequest, NextApiResponse } from "next";

import { handleRedeemPromotionCodeRequest } from "@/server/http/promotions-redeem-handler";
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

  const request = await nextApiRequestToRequest(req);
  const response = await handleRedeemPromotionCodeRequest(request);

  await writeFetchResponseToNextApi(res, response);
}

export async function sendOtpSms(input: { to: string; code: string }) {
  if (!process.env.AT_API_KEY) {
    return {
      provider: "development",
      to: input.to,
      body: `Your Heita verification code is ${input.code}.`
    };
  }

  return {
    provider: "africas-talking",
    to: input.to,
    body: `Your Heita verification code is ${input.code}.`
  };
}

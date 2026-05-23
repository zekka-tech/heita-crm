export const requestOtpSchema = {
  parse(input: { phone: string }) {
    if (input.phone.length < 10 || input.phone.length > 20) {
      throw new Error("Phone number must be between 10 and 20 characters");
    }

    return input;
  }
};

export const verifyOtpSchema = {
  parse(input: { phone: string; code: string }) {
    requestOtpSchema.parse({ phone: input.phone });

    if (input.code.length !== 6) {
      throw new Error("Code must be 6 characters");
    }

    return input;
  }
};

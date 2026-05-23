export const businessOnboardingSchema = {
  parse(input: { name: string; category: string; province: string }) {
    if (input.name.length < 2 || input.category.length < 2 || input.province.length < 2) {
      throw new Error("Business onboarding fields are incomplete");
    }

    return input;
  }
};

const ZA_COUNTRY_CODE = "27";
const E164_PATTERN = /^\+\d{8,15}$/;

export function normalizeZaPhone(raw: string): string | null {
  if (!raw) return null;

  const cleaned = raw.replace(/[^\d+]/g, "");
  if (!cleaned) return null;

  let digits = cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    digits = `${ZA_COUNTRY_CODE}${digits.slice(1)}`;
  }

  if (digits.length < 8 || digits.length > 15) {
    return null;
  }

  const candidate = `+${digits}`;
  return E164_PATTERN.test(candidate) ? candidate : null;
}

export function isE164(value: string): boolean {
  return E164_PATTERN.test(value);
}

export function maskPhone(value: string): string {
  if (value.length <= 6) return value;
  return `${value.slice(0, 4)}***${value.slice(-2)}`;
}

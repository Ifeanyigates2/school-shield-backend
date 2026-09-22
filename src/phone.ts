import { HttpError } from "./errors";

export function normalizePhone(input: string) {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("234") && digits.length === 13) {
    // already in international form without the plus
  } else if (digits.startsWith("0") && digits.length === 11) {
    digits = `234${digits.slice(1)}`;
  } else if (digits.length === 10) {
    digits = `234${digits}`;
  } else {
    throw new HttpError(400, "Enter a valid Nigerian phone number.");
  }

  if (!/^234[789]\d{9}$/.test(digits)) {
    throw new HttpError(400, "Enter a valid Nigerian phone number.");
  }

  return `+${digits}`;
}

export function toDisplay(e164: string) {
  const local = e164.replace(/\D/g, "").replace(/^234/, "");
  return local.replace(/(\d{3})(\d{3})(\d+)/, "$1 $2 $3");
}

export function isEmail(value: string) {
  return value.includes("@");
}

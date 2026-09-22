import crypto from "crypto";

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

export function newNumericCode(length: number) {
  const max = 10 ** length;
  return String(crypto.randomInt(0, max)).padStart(length, "0");
}

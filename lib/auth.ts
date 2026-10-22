import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Anyone with the link can VIEW the desk (it's a class demo). Changing anything (run, approve, edit rules,
 * upload, enter losses) needs the operator passcode. Server actions are public POST endpoints, so every
 * action calls requireOperator() first.
 */
const COOKIE = "rd_op";
const token = () => createHash("sha256").update(`reorder-desk:${process.env.OPERATOR_PASSCODE ?? ""}`).digest("hex");

export function passcodeMatches(input: string): boolean {
  const want = process.env.OPERATOR_PASSCODE ?? "";
  if (!want) return false;
  const a = Buffer.from(createHash("sha256").update(input).digest("hex"));
  const b = Buffer.from(createHash("sha256").update(want).digest("hex"));
  return timingSafeEqual(a, b);
}

export async function setOperatorCookie() {
  (await cookies()).set(COOKIE, token(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 12, path: "/" });
}

export async function clearOperatorCookie() {
  (await cookies()).delete(COOKIE);
}

export async function isOperator(): Promise<boolean> {
  if (!process.env.OPERATOR_PASSCODE) return false;
  return (await cookies()).get(COOKIE)?.value === token();
}

export async function requireOperator() {
  if (!(await isOperator())) throw new Error("Operator passcode required. Unlock the desk first.");
}

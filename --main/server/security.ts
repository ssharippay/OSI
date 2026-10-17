import {
  randomBytes,
  createHash,
  scrypt as rawScrypt,
  timingSafeEqual,
} from "node:crypto";
export const scrypt = (
  password: string,
  salt: string,
  size: number,
  options: import("node:crypto").ScryptOptions,
) =>
  new Promise<Buffer>((resolve, reject) =>
    rawScrypt(password, salt, size, options, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
export const token = () => randomBytes(32).toString("base64url");
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64, {
    N: 131072,
    r: 8,
    p: 1,
    maxmem: 256 * 1024 * 1024,
  })) as Buffer;
  return `scrypt$131072$8$1$${salt}$${key.toString("hex")}`;
}
export async function passwordMatches(password: string, stored: string) {
  const [name, n, r, p, salt, key] = stored.split("$");
  if (name !== "scrypt" || n !== "131072" || r !== "8" || p !== "1")
    return false;
  const actual = (await scrypt(password, salt, 64, {
    N: 131072,
    r: 8,
    p: 1,
    maxmem: 256 * 1024 * 1024,
  })) as Buffer;
  const expected = Buffer.from(key, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export const deny = () => {
  throw new HttpError(404, "Запись недоступна.");
};

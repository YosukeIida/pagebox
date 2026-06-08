const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export function nanoid(size = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function generateSlug(): string {
  return nanoid(12);
}

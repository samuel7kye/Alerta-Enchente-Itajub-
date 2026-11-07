export function sanitizeText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function generateId(): string {
  return crypto.randomUUID();
}
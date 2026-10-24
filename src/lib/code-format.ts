/**
 * Canonical formatting shared by the join flows and server routes.
 * Stored codes keep their existing field names and ECOLE-/P- prefixes.
 */
function compactCode(value: string | null | undefined): string {
  return (value ?? '').toUpperCase().replace(/[\s-]+/g, '');
}

export function normalizeInviteCode(value: string | null | undefined): string {
  const compact = compactCode(value);
  const suffix = compact.startsWith('ECOLE') ? compact.slice(5) : compact;
  return suffix ? `ECOLE-${suffix}` : '';
}

export function normalizeStudentCode(value: string | null | undefined): string {
  const compact = compactCode(value);
  const suffix = compact.startsWith('P') ? compact.slice(1) : compact;
  return suffix ? `P-${suffix}` : '';
}

export function isInviteCodeWellFormed(value: string): boolean {
  return /^ECOLE-[A-Z0-9]{6}$/.test(value);
}

export function isStudentCodeWellFormed(value: string): boolean {
  return /^P-[A-Z0-9]{6}$/.test(value);
}

/** Username fijo del superadmin (seed). Sin nuevo Role — es un admin con capacidades extra. */
export const SUPERADMIN_USERNAME = "superadmin";

export function isSuperadminUsername(username: string | null | undefined): boolean {
  return (username ?? "").trim().toLowerCase() === SUPERADMIN_USERNAME;
}

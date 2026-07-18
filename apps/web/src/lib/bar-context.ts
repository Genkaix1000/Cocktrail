export const ACTIVE_BAR_STORAGE_KEY = "cocktrail_active_bar_id";

export function setActiveBarContext(barId: string | null): void {
  if (typeof window === "undefined") return;
  if (barId) {
    localStorage.setItem(ACTIVE_BAR_STORAGE_KEY, barId);
  } else {
    localStorage.removeItem(ACTIVE_BAR_STORAGE_KEY);
  }
}

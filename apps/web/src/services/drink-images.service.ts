import { apiFetch } from "./api-client";

export type UploadedDrinkImage = {
  id: string;
  path: string;
  url: string;
  createdAt: string;
  deletable: true;
};

export const drinkImagesService = {
  list() {
    return apiFetch<UploadedDrinkImage[]>("/api/drink-images");
  },
  uploadWebp(webpBase64: string) {
    return apiFetch<UploadedDrinkImage>("/api/drink-images", {
      method: "POST",
      body: { webpBase64 },
    });
  },
  delete(id: string) {
    return apiFetch<{ ok: true }>(`/api/drink-images/${id}`, { method: "DELETE" });
  },
};

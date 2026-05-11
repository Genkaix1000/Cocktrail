import { handleErrors } from "@/server/http";
import { updateOrderStatus } from "@/server/store";
import { asEnum, asObject } from "@/server/validation";

const ORDER_STATUSES = [
  "pagado",
  "preparando",
  "listo",
  "entregado",
  "cancelado",
] as const;

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleErrors(async () => {
    const { id } = await params;
    const body = asObject(await request.json(), "body");
    const status = asEnum(body.status, ORDER_STATUSES, "status");
    const order = updateOrderStatus(id, status);
    return Response.json(order);
  });
}

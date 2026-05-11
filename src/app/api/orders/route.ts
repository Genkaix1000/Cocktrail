import { handleErrors } from "@/server/http";
import { createOrder } from "@/server/store";
import {
  asArray,
  asEnum,
  asObject,
  asPositiveInt,
} from "@/server/validation";

const PAYMENT_METHODS = ["transferencia", "efectivo"] as const;

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleErrors(async () => {
    const body = asObject(await request.json(), "body");

    const items = asArray(body.items, "items", (raw, i) => {
      const it = asObject(raw, `items[${i}]`);
      return {
        drinkId: asPositiveInt(it.drinkId, `items[${i}].drinkId`),
        qty: asPositiveInt(it.qty, `items[${i}].qty`),
      };
    });

    const paymentMethod = asEnum(
      body.paymentMethod,
      PAYMENT_METHODS,
      "paymentMethod",
    );

    const order = createOrder({ items, paymentMethod });
    return Response.json(order, { status: 201 });
  });
}

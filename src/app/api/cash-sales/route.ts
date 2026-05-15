import { handleErrors } from "@/server/http";
import { addCashSale } from "@/server/store";
import {
  asObject,
  asPositiveNumber,
  asString,
} from "@/server/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleErrors(async () => {
    const body = asObject(await request.json(), "body");
    const amount = asPositiveNumber(body.amount, "amount");
    const description = asString(body.description, "description");
    const sale = addCashSale({ amount, description });
    return Response.json(sale, { status: 201 });
  });
}

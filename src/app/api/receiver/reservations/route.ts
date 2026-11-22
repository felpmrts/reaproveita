import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { handleAuthorizationError, requireRole } from '@/lib/rbac';
import { createFoodBatchReservation, FoodBatchUnavailableForReservationError } from '@/repositories/food-batch.repository';

const schema = z.object({
  batchId: z.string().uuid(),
  quantity: z.number().int().positive().max(2147483647),
  requestId: z.string().uuid(),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const receiver = await requireRole(['RECEIVER']);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: { message: 'Informe o lote e uma quantidade inteira maior que zero.' } }, { status: 400 });
    }
    const reservation = await createFoodBatchReservation(receiver.id, parsed.data);
    return NextResponse.json({ success: true, data: reservation }, { status: 201 });
  } catch (error) {
    const auth = handleAuthorizationError(error);
    if (auth) return auth;
    if (error instanceof FoodBatchUnavailableForReservationError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: { message: 'Não foi possível confirmar a reserva. Tente novamente.' } }, { status: 500 });
  }
}

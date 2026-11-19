import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { handleAuthorizationError, requireRole } from '@/lib/rbac';
import { runFoodBatchExpirationSweep } from '@/services/food-batch.service';

export const dynamic = 'force-dynamic';

function hasValidCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const authorization = request.headers.get('authorization');
  if (!authorization || !authorization.startsWith('Bearer ')) return false;

  const token = authorization.slice('Bearer '.length).trim();
  const expectedBuffer = Buffer.from(cronSecret, 'utf8');
  const providedBuffer = Buffer.from(token, 'utf8');
  if (expectedBuffer.length !== providedBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

/**
 * POST /api/food-batches/expire
 * Dispara a rotina de expiração automática de lotes vencidos para uso administrativo ou fallback de cron.
 */
export async function POST(request: NextRequest) {
  try {
    if (!hasValidCronSecret(request)) {
      await requireRole(['ADMIN']);
    }

    const result = await runFoodBatchExpirationSweep();
    return NextResponse.json(
      { success: true, data: result },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const authorization = handleAuthorizationError(error);
    if (authorization) return authorization;

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Não foi possível executar a rotina de expiração de ofertas.',
        },
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { handleAuthorizationError, requireRole } from '@/lib/rbac';
import {
  DuplicateCnpjError,
  getEstablishmentRepository,
} from '@/repositories/establishment.repository';
import {
  createEstablishment,
  EstablishmentValidationError,
} from '@/services/establishment.service';

export async function GET() {
  try {
    const donor = await requireRole(['DONOR']);
    const establishments = await getEstablishmentRepository().findByOwner(donor.id);
    return NextResponse.json({ success: true, data: establishments });
  } catch (error) {
    const authorizationResponse = handleAuthorizationError(error);
    if (authorizationResponse) return authorizationResponse;
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Não foi possível listar os estabelecimentos.' } },
      { status: 500 }
    );
  }
}
export async function POST(request: NextRequest) {
  try {
    const donor = await requireRole(['DONOR']);
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_JSON', message: 'O corpo da requisição deve ser um JSON válido.' } },
        { status: 400 }
      );
    }

    const establishment = await createEstablishment(donor.id, payload);
    return NextResponse.json(
      { success: true, message: 'Estabelecimento enviado para análise.', data: establishment },
      { status: 201 }
    );
  } catch (error) {
    const authorizationResponse = handleAuthorizationError(error);
    if (authorizationResponse) return authorizationResponse;

    if (error instanceof EstablishmentValidationError) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: error.message, details: error.details } },
        { status: 400 }
      );
    }

    if (error instanceof DuplicateCnpjError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Não foi possível cadastrar o estabelecimento.' } },
      { status: 500 }
    );
  }
}

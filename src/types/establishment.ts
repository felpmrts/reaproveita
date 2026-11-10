export const ESTABLISHMENT_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const;
export type EstablishmentStatus = (typeof ESTABLISHMENT_STATUSES)[number];

export interface EstablishmentEntity {
  id: string;
  ownerId: string;
  name: string;
  cnpj: string;
  email: string;
  phone: string;
  zipCode: string;
  street: string;
  number: string;
  complement?: string | null;
  neighborhood: string;
  city: string;
  state: string;
  latitude?: number | null;
  longitude?: number | null;
  status: EstablishmentStatus;
  createdAt: string;
  updatedAt: string;
}

export type PublicEstablishment = EstablishmentEntity;

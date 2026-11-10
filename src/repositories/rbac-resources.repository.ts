import { randomUUID } from 'crypto';

export interface EstablishmentResource {
  id: string;
  name: string;
  ownerId: string;
  address: string;
  isApproved: boolean;
  updatedAt: string;
}

export interface ReservationResource {
  id: string;
  batchTitle: string;
  receiverId: string;
  quantity: number;
  status: 'ACTIVE' | 'CANCELLED' | 'COMPLETED';
  updatedAt: string;
}

/**
 * Repositório em memória para validar permissões de propriedade/vínculo de recursos no RBAC (RN03 e RN14):
 * - Doador pode gerenciar apenas estabelecimentos aos quais está vinculado (ownerId === user.id)
 * - Receptor pode gerenciar apenas suas próprias reservas (receiverId === user.id)
 * - Administrador pode auditar e aprovar estabelecimentos e consultar métricas administrativas
 */
export class InMemoryRbacResourceRepository {
  private establishments = new Map<string, EstablishmentResource>();
  private reservations = new Map<string, ReservationResource>();

  async createEstablishment(input: {
    id?: string;
    name: string;
    ownerId: string;
    address?: string;
    isApproved?: boolean;
  }): Promise<EstablishmentResource> {
    const establishment: EstablishmentResource = {
      id: input.id ?? randomUUID(),
      name: input.name.trim(),
      ownerId: input.ownerId,
      address: input.address ?? 'Uberlândia - MG',
      isApproved: input.isApproved ?? true,
      updatedAt: new Date().toISOString(),
    };
    this.establishments.set(establishment.id, establishment);
    return establishment;
  }

  async findEstablishmentById(id: string): Promise<EstablishmentResource | null> {
    return this.establishments.get(id) ?? null;
  }

  async findEstablishmentsByOwner(ownerId: string): Promise<EstablishmentResource[]> {
    return Array.from(this.establishments.values()).filter((est) => est.ownerId === ownerId);
  }

  async listAllEstablishments(): Promise<EstablishmentResource[]> {
    return Array.from(this.establishments.values());
  }

  async updateEstablishment(
    id: string,
    patch: { name?: string; address?: string; isApproved?: boolean }
  ): Promise<EstablishmentResource | null> {
    const existing = this.establishments.get(id);
    if (!existing) return null;

    const updated: EstablishmentResource = {
      ...existing,
      ...(patch.name !== undefined && { name: patch.name.trim() }),
      ...(patch.address !== undefined && { address: patch.address.trim() }),
      ...(patch.isApproved !== undefined && { isApproved: patch.isApproved }),
      updatedAt: new Date().toISOString(),
    };

    this.establishments.set(id, updated);
    return updated;
  }

  async createReservation(input: {
    id?: string;
    batchTitle: string;
    receiverId: string;
    quantity: number;
    status?: 'ACTIVE' | 'CANCELLED' | 'COMPLETED';
  }): Promise<ReservationResource> {
    const reservation: ReservationResource = {
      id: input.id ?? randomUUID(),
      batchTitle: input.batchTitle.trim(),
      receiverId: input.receiverId,
      quantity: input.quantity,
      status: input.status ?? 'ACTIVE',
      updatedAt: new Date().toISOString(),
    };
    this.reservations.set(reservation.id, reservation);
    return reservation;
  }

  async findReservationById(id: string): Promise<ReservationResource | null> {
    return this.reservations.get(id) ?? null;
  }

  async findReservationsByReceiver(receiverId: string): Promise<ReservationResource[]> {
    return Array.from(this.reservations.values()).filter((res) => res.receiverId === receiverId);
  }

  async updateReservationStatus(
    id: string,
    status: 'ACTIVE' | 'CANCELLED' | 'COMPLETED'
  ): Promise<ReservationResource | null> {
    const existing = this.reservations.get(id);
    if (!existing) return null;

    const updated: ReservationResource = {
      ...existing,
      status,
      updatedAt: new Date().toISOString(),
    };

    this.reservations.set(id, updated);
    return updated;
  }

  async clear(): Promise<void> {
    this.establishments.clear();
    this.reservations.clear();
  }
}

const globalForRbacResources = globalThis as unknown as {
  rbacResourceRepository?: InMemoryRbacResourceRepository;
};

export function getRbacResourceRepository(): InMemoryRbacResourceRepository {
  if (!globalForRbacResources.rbacResourceRepository) {
    globalForRbacResources.rbacResourceRepository = new InMemoryRbacResourceRepository();
  }
  return globalForRbacResources.rbacResourceRepository;
}

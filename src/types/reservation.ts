export interface ReceiverReservationDetails {
  id: string;
  batchId?: string;
  batchTitle: string;
  quantity: number;
  status: 'ACTIVE' | 'CANCELLED' | 'COMPLETED';
  createdAt?: string;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  pickupStartsAt?: string | null;
  pickupEndsAt?: string | null;
  establishment?: { id: string; name: string; address: string } | null;
}


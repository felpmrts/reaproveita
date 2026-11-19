import { AlertTriangle, Ban, CheckCircle2, Clock } from 'lucide-react';
import type { FoodBatchUrgency, UrgencyLevel } from '@/services/food-batch.service';

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeStyle: 'medium',
  timeZone: 'America/Sao_Paulo',
});

export const URGENCY_STYLES: Record<UrgencyLevel, { badge: string; icon: typeof Clock }> = {
  CRITICAL: {
    badge: 'border-rose-200 bg-rose-50 text-rose-800',
    icon: AlertTriangle,
  },
  HIGH: {
    badge: 'border-amber-200 bg-amber-50 text-amber-800',
    icon: AlertTriangle,
  },
  MEDIUM: {
    badge: 'border-yellow-200 bg-yellow-50 text-yellow-800',
    icon: Clock,
  },
  LOW: {
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    icon: CheckCircle2,
  },
  EXPIRED: {
    badge: 'border-slate-300 bg-slate-100 text-slate-700',
    icon: Ban,
  },
};

export function formatDateTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return 'Data indisponível';
  return dateTimeFormatter.format(parsed);
}

export function formatTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '--:--:--';
  return timeFormatter.format(parsed);
}

export function formatUrgencyDescription(urgency: FoodBatchUrgency): string {
  return urgency.level === 'EXPIRED'
    ? urgency.label
    : `${urgency.label} · ~${urgency.hoursRemaining}h restante(s)`;
}

export function formatAvailableQuantity(quantity: number): string {
  return quantity === 1 ? '1 unidade' : `${quantity} unidades`;
}

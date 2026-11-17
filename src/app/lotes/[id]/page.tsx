import { notFound } from 'next/navigation';
import { z } from 'zod';
import { FoodBatchDetailsView } from '@/components/food-batches/FoodBatchDetailsView';
import { getFoodBatchDetails } from '@/services/food-batch.service';

export const dynamic = 'force-dynamic';

export default async function FoodBatchDetailsPage({ params }: { params: { id: string } }) {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) notFound();

  const details = await getFoodBatchDetails(id.data);
  if (!details) notFound();

  return <FoodBatchDetailsView details={details} />;
}

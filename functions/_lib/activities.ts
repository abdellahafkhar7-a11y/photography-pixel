import type { DeliveryActivityType } from './db-types'
import type { Db } from './supabase'

export async function recordActivity(
  service: Db,
  deliveryId: string,
  type: DeliveryActivityType,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await service
    .from('delivery_activity')
    .insert({ delivery_id: deliveryId, type, metadata: metadata ?? null })
}
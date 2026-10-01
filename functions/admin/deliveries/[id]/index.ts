import type { PagesFunction } from '@cloudflare/workers-types'
import { requireOwner, requireSession } from '../../_lib/auth'
import type { DeliveryEnv } from '../../../_lib/env'
import { siteUrl } from '../../../_lib/env'
import type { AppUserRow } from '../../_lib/types'
import { sameOrigin } from '../../_lib/security'
import { generatePrivateToken, hashPrivateToken } from '../../../_lib/tokens'
import { recordActivity } from '../../../_lib/activities'
import { listCommunications, recordCommunication } from '../../../_lib/communications'
import { renderDeliveryDetail, type DetailPageOptions } from '../../_lib/delivery-views'
import type { CommunicationsRow } from '../../../_lib/db-types'
import {
  adminHtml,
  deliveryReleasable,
  formString,
  isValidUuid,
  loadDeliveryDetail,
  loadPortfolioCatalog,
  resolveClient,
  serviceFrom,
  type DeliveryDetail,
} from '../_helpers'

type Route = PagesFunction<DeliveryEnv, never, Record<string, unknown>>

export function renderDetailPage(
  appUser: AppUserRow,
  base: string,
  detail: DeliveryDetail | null,
  options: DetailPageOptions = {},
): string {
  return renderDeliveryDetail(appUser, base, detail, options)
}

function loadId(context: { params: unknown }): string {
  const params = context.params as { id?: string }
  return params.id ?? ''
}

// Render the detail page with the delivery-scoped communication ledger loaded,
// so the timeline card is fresh on GET and after every POST.
async function deliveryPage(
  service: ReturnType<typeof serviceFrom>,
  appUser: AppUserRow,
  base: string,
  detail: DeliveryDetail | null,
  options: DetailPageOptions = {},
) {
  const communications =
    detail && service ? await listCommunications(service, 'delivery', [detail.id], 30) : []
  return renderDetailPage(appUser, base, detail, { ...options, communications })
}

export const onRequestGet: Route = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const base = siteUrl(context.env, context.request)

  const service = serviceFrom(context)
  if (!service) return adminHtml(await deliveryPage(service, appUser, base, null, { error: 'النظام غير مهيأ.' }))
  const id = loadId(context)
  if (!isValidUuid(id)) return adminHtml(await deliveryPage(service, appUser, base, null, { error: 'معرّف غير صالح.' }))
  const detail = await loadDeliveryDetail(service, id)
  if (!detail) return adminHtml(await deliveryPage(service, appUser, base, null, { error: 'التوصيل غير موجود.' }))

  const portfolioOptions =
    detail.source_type === 'portfolio' ? await loadPortfolioCatalog(context) : undefined
  return adminHtml(await deliveryPage(service, appUser, base, detail, { portfolio: portfolioOptions }))
}

export const onRequestPost: Route = async (context) => {
  if (!sameOrigin(context.request)) return adminHtml('<p>طلب غير صالح.</p>', 403)
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const forbidden = requireOwner(appUser)
  if (forbidden) return forbidden
  const base = siteUrl(context.env, context.request)

  const id = loadId(context)
  if (!isValidUuid(id)) return adminHtml('<p>معرّف غير صالح.</p>', 400)

  const service = serviceFrom(context)
  if (!service) return adminHtml('<p>النظام غير مهيأ.</p>', 500)

  const form = await context.request.formData()
  const action = formString(form.get('action'))
  const detail = await loadDeliveryDetail(service, id)
  if (!detail) return adminHtml(await deliveryPage(service, appUser, base, null, { error: 'التوصيل غير موجود.' }))

  if (detail.archived_at && action !== 'unarchive_delivery') {
    return adminHtml(await deliveryPage(service, appUser, base, detail, {
        error: 'التوصيل مؤرشف — أعد تفعيله أولاً لاستخدام الروابط أو الإجراءات.',
      }),
    )
  }

  if (action === 'regenerate') {
    if (detail.status === 'expired') {
      return adminHtml(await deliveryPage(service, appUser, base, detail, {
          error: 'التوصيل منتهي — لا يمكن إنشاء رابط جديد له. أعد رفعه لتفعيله.',
        }),
      )
    }
    const token = generatePrivateToken()
    const hash = await hashPrivateToken(token)
    const { error } = await service
      .from('deliveries')
      .update({ private_token_hash: hash, token_created_at: new Date().toISOString(), token_expires_at: null })
      .eq('id', detail.id)
    if (error) {
      return adminHtml(await deliveryPage(service, appUser, base, detail, { error: 'تعذّر إنشاء رابط جديد.' }))
    }
    const updated = await loadDeliveryDetail(service, detail.id)
    await recordCommunication(service, {
      channel: 'internal',
      direction: 'outbound',
      entity_type: 'delivery',
      entity_id: detail.id,
      message: 'أُنشئ رابط جديد للتوصيل.',
      user_id: appUser.id,
    })
    return adminHtml(await deliveryPage(service, appUser, base, updated ?? detail, {
        freshToken: token,
        identifier: updated?.client_visible_id ?? detail.client_visible_id ?? undefined,
      }),
    )
  }

  if (action === 'revoke') {
    const { error } = await service
      .from('deliveries')
      .update({ token_expires_at: new Date().toISOString() })
      .eq('id', detail.id)
    if (error) {
      return adminHtml(await deliveryPage(service, appUser, base, detail, { error: 'تعذّر إلغاء الرابط.' }))
    }
    const updated = await loadDeliveryDetail(service, detail.id)
    await recordCommunication(service, {
      channel: 'internal',
      direction: 'outbound',
      entity_type: 'delivery',
      entity_id: detail.id,
      message: 'أُلغي الرابط الحالي للتوصيل.',
      user_id: appUser.id,
    })
    return adminHtml(await deliveryPage(service, appUser, base, updated ?? detail, { notice: 'تم إلغاء الرابط الحالي.' }))
  }

  if (action === 'release') {
    // The videos stay locked until the owner explicitly releases them.
    // Releasing only moves the status; it does NOT touch the download window
    // (the 3-day countdown still starts on the client's FIRST download inside
    // gateDownload). VIEW_ONLY deliveries never release an original. Releasing
    // unlocks every active video item in the delivery together.
    //
    // The client confirmation handshake was removed from the /p page, so a
    // delivery awaiting release sits in `pending` (link never opened) or
    // `preview_viewed` (client opened it). `deliveryReleasable` is the single
    // source of truth shared with the admin button, so the UI can never offer a
    // release the server would refuse (or hide one it would accept).
    if (detail.delivery_mode !== 'VIEW_AND_DOWNLOAD') {
      return adminHtml(await deliveryPage(service, appUser, base, detail, {
          error: 'هذا التوصيل بوضع «عرض فقط» — لا يتوفر تحميل للأصل.',
        }),
      )
    }
    if (!deliveryReleasable(detail.status)) {
      return adminHtml(await deliveryPage(service, appUser, base, detail, {
          error: 'لا يمكن إطلاق التحميل في هذه الحالة.',
        }),
      )
    }
    const { error } = await service
      .from('deliveries')
      .update({ status: 'download_available' })
      .eq('id', detail.id)
    if (error) {
      return adminHtml(await deliveryPage(service, appUser, base, detail, { error: 'تعذّر إطلاق التحميل.' }))
    }
    const releasedAt = new Date().toISOString()
    const updatedActive = await service
      .from('delivery_videos')
      .update({ download_released_at: releasedAt })
      .eq('delivery_id', detail.id)
      .eq('is_active', true)
      .select('id')
    const activeItems = (await loadDeliveryDetail(service, detail.id))?.delivery_videos ?? []
    const releasedAtMs = new Date(releasedAt).getTime()
    const releasedCount = new Set(
      activeItems.filter(
        (video) => video.is_active && new Date(video.download_released_at ?? 0).getTime() === releasedAtMs,
      ).map((video) => video.item_pos),
    ).size
    if (updatedActive.error) {
      return adminHtml(await deliveryPage(service, appUser, base, detail, { error: 'تعذّر إطلاق التحميل.' }))
    }
    await recordActivity(service, detail.id, 'delivery_released', { items: releasedCount })
    await recordCommunication(service, {
      channel: 'system',
      direction: 'outbound',
      entity_type: 'delivery',
      entity_id: detail.id,
      message: `تم إطلاق التحميل للعميل (${releasedCount} فيديو).`,
      user_id: appUser.id,
    })
    const updated = await loadDeliveryDetail(service, detail.id)
    return adminHtml(await deliveryPage(service, appUser, base, updated ?? detail, {
        notice: 'تم إطلاق التحميل — أصبح الرابط متاحاً للعميل لكل الفيديوهات. يبدأ العد التنازلي (3 أيام) عند أول تحميل.',
      }),
    )
  }

  if (action === 'set_mode') {
    const mode = formString(form.get('delivery_mode'))
    const next: 'VIEW_ONLY' | 'VIEW_AND_DOWNLOAD' = mode === 'VIEW_ONLY' ? 'VIEW_ONLY' : 'VIEW_AND_DOWNLOAD'
    if (detail.downloaded_at) {
      return adminHtml(await deliveryPage(service, appUser, base, detail, {
          error: 'لا يمكن تغيير وضع التوصيل بعد بدء التحميل.',
        }),
      )
    }
    const { error } = await service
      .from('deliveries')
      .update({ delivery_mode: next })
      .eq('id', detail.id)
    if (error) {
      return adminHtml(await deliveryPage(service, appUser, base, detail, { error: 'تعذّر حفظ الوضع.' }))
    }
    await recordActivity(service, detail.id, 'delivery_mode_changed', {
      from: detail.delivery_mode,
      to: next,
    })
    await recordCommunication(service, {
      channel: 'system',
      direction: 'outbound',
      entity_type: 'delivery',
      entity_id: detail.id,
      message: next === 'VIEW_ONLY' ? 'تغيّر وضع التوصيل إلى «عرض فقط».' : 'تغيّر وضع التوصيل إلى «عرض وتحميل».',
      user_id: appUser.id,
    })
    const updated = await loadDeliveryDetail(service, detail.id)
    return adminHtml(await deliveryPage(service, appUser, base, updated ?? detail, {
        notice: next === 'VIEW_ONLY' ? 'تم الحفظ — التوصيل الآن «عرض فقط» ومنع التحميل.' : 'تم الحفظ — التوصيل الآن «عرض وتحميل».',
      }),
    )
  }

  if (action === 'archive_version' || action === 'delete_version') {
    const versionId = formString(form.get('version_id'))
    const target = (detail.delivery_videos ?? []).find((video) => video.id === versionId)
    if (!target) {
      return adminHtml(await deliveryPage(service, appUser, base, detail, { error: 'النسخة غير موجودة.' }))
    }
    if (target.is_active) {
      return adminHtml(await deliveryPage(service, appUser, base, detail, {
          error: 'لا يمكن أرشفة أو حذف النسخة النشطة — ارفع نسخة جديدة أولاً لإنهاء هذه النسخة.',
        }),
      )
    }
    if (action === 'archive_version') {
      const { error } = await service
        .from('delivery_videos')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', versionId)
        .is('archived_at', null)
      if (error) return adminHtml(await deliveryPage(service, appUser, base, detail, { error: 'تعذّر أرشفة النسخة.' }))
      await recordActivity(service, detail.id, 'version_archived', { version: target.version })
    } else {
      // Delete another release's file permanently (not the active version).
      if (target.r2_original_key && !target.original_deleted_at) {
        if (!context.env.BUCKET) {
          return adminHtml(await deliveryPage(service, appUser, base, detail, { error: 'مخزن R2 غير مهيأ — لا يمكن حذف الملف.' }),
          )
        }
        try {
          await context.env.BUCKET.delete(target.r2_original_key)
        } catch {
          return adminHtml(await deliveryPage(service, appUser, base, detail, { error: 'تعذّر حذف الملف من المخزن.' }))
        }
        await service
          .from('delivery_videos')
          .update({ original_deleted_at: new Date().toISOString(), archived_at: new Date().toISOString() })
          .eq('id', versionId)
          .is('original_deleted_at', null)
      } else {
        // Nothing to delete (already gone or portfolio) — just archive the row.
        await service
          .from('delivery_videos')
          .update({ archived_at: new Date().toISOString() })
          .eq('id', versionId)
          .is('archived_at', null)
      }
      await recordActivity(service, detail.id, 'version_deleted', { version: target.version })
    }
    const updated = await loadDeliveryDetail(service, detail.id)
    return adminHtml(await deliveryPage(service, appUser, base, updated ?? detail, {
        notice: action === 'archive_version' ? 'تمت أرشفة النسخة.' : 'تم حذف الملف الأصلي للنسخة وأرشفتها.',
      }),
    )
  }

  if (action === 'archive_delivery') {
    const { error } = await service
      .from('deliveries')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', detail.id)
      .is('archived_at', null)
    if (error) return adminHtml(await deliveryPage(service, appUser, base, detail, { error: 'تعذّر أرشفة التوصيل.' }))
    await recordActivity(service, detail.id, 'delivery_archived')
    await recordCommunication(service, {
      channel: 'internal',
      direction: 'outbound',
      entity_type: 'delivery',
      entity_id: detail.id,
      message: 'أُرشف التوصيل.',
      user_id: appUser.id,
    })
    const updated = await loadDeliveryDetail(service, detail.id)
    return adminHtml(await deliveryPage(service, appUser, base, updated ?? detail, { notice: 'تمت أرشفة التوصيل — أُخفِي من القوائم الرئيسية.' }),
    )
  }

  if (action === 'unarchive_delivery') {
    const { error } = await service
      .from('deliveries')
      .update({ archived_at: null })
      .eq('id', detail.id)
      .not('archived_at', 'is', null)
    if (error) return adminHtml(await deliveryPage(service, appUser, base, detail, { error: 'تعذّر إلغاء الأرشفة.' }))
    await recordActivity(service, detail.id, 'delivery_unarchived')
    await recordCommunication(service, {
      channel: 'internal',
      direction: 'outbound',
      entity_type: 'delivery',
      entity_id: detail.id,
      message: 'أُعيد التوصيل إلى القوائم الرئيسية.',
      user_id: appUser.id,
    })
    const updated = await loadDeliveryDetail(service, detail.id)
    return adminHtml(await deliveryPage(service, appUser, base, updated ?? detail, { notice: 'أُعيد التوصيل إلى القوائم الرئيسية.' }),
    )
  }

  if (action === 'set_client') {
    // Phase 4L — attach client name/WhatsApp to a delivery after the link was
    // created without a client form (portfolio immediate links). Creates or
    // reuses a client row; never creates fake data.
    const name = formString(form.get('name'))
    const whatsapp = formString(form.get('whatsapp'))
    const clientResult = await resolveClient(service, appUser.id, null, name, whatsapp)
    if (!clientResult.ok) {
      return adminHtml(await deliveryPage(service, appUser, base, detail, { error: clientResult.error }))
    }
    const { error } = await service
      .from('deliveries')
      .update({ client_id: clientResult.client.id })
      .eq('id', detail.id)
    if (error) {
      return adminHtml(await deliveryPage(service, appUser, base, detail, { error: 'تعذّر حفظ بيانات العميل.' }))
    }
    const updated = await loadDeliveryDetail(service, detail.id)
    return adminHtml(await deliveryPage(service, appUser, base, updated ?? detail, {
        notice: 'تم حفظ بيانات العميل وربطها بالتوصيل.',
      }),
    )
  }

  if (action === 'add_video') {
    // Phase 4M — grow a delivery with another portfolio video. The new item is
    // added (item_pos = max+1, version 1) and the delivery lifecycle resets to
    // pending so the client confirms again with the full set.
    if (detail.status === 'downloaded' || detail.status === 'expired') {
      return adminHtml(await deliveryPage(service, appUser, base, detail, {
          error: 'لا يمكن إضافة فيديو بعد بدء التحميل أو انتهاء التوصيل.',
        }),
      )
    }
    const portfolioUrl = formString(form.get('portfolio_url'))
    if (!portfolioUrl) {
      return adminHtml(await deliveryPage(service, appUser, base, detail, { error: 'اختر فيديو من المعرض العام.' }))
    }
    const catalog = await loadPortfolioCatalog(context)
    if (!catalog.some((option) => option.url === portfolioUrl)) {
      return adminHtml(await deliveryPage(service, appUser, base, detail, {
          error: 'الفيديو المحدد غير موجود في المعرض العام.',
        }),
      )
    }
    const activeUrls = new Set(
      (detail.delivery_videos ?? [])
        .filter((video) => video.is_active && video.source_type === 'portfolio' && video.portfolio_url)
        .map((video) => video.portfolio_url),
    )
    if (activeUrls.has(portfolioUrl)) {
      return adminHtml(await deliveryPage(service, appUser, base, detail, {
          error: 'هذا الفيديو مضاف بالفعل إلى التوصيل.',
        }),
      )
    }
    const positions = (detail.delivery_videos ?? []).map((video) => video.item_pos)
    const nextItem = positions.length > 0 ? Math.max(...positions) + 1 : 1
    const { error: insertError } = await service.from('delivery_videos').insert({
      delivery_id: detail.id,
      item_pos: nextItem,
      version: 1,
      source_type: 'portfolio',
      portfolio_url: portfolioUrl,
      created_by: appUser.id,
    })
    if (insertError) {
      return adminHtml(await deliveryPage(service, appUser, base, detail, { error: 'تعذّر إضافة الفيديو.' }))
    }
    // Reset the delivery lifecycle so the client re-confirms the full set.
    await service
      .from('deliveries')
      .update({
        status: 'pending',
        confirmed_at: null,
        downloaded_at: null,
        download_expires_at: null,
        expired_at: null,
      })
      .eq('id', detail.id)
    await service
      .from('delivery_videos')
      .update({ confirmed_at: null, download_released_at: null })
      .eq('delivery_id', detail.id)
      .eq('is_active', true)
    await recordActivity(service, detail.id, 'reuploaded', { item: nextItem, version: 1 })
    await recordCommunication(service, {
      channel: 'internal',
      direction: 'outbound',
      entity_type: 'delivery',
      entity_id: detail.id,
      message: `أُضيف فيديو جديد إلى التوصيل (موقع ${nextItem}).`,
      user_id: appUser.id,
    })
    const updated = await loadDeliveryDetail(service, detail.id)
    return adminHtml(await deliveryPage(service, appUser, base, updated ?? detail, {
        notice: 'تمت إضافة الفيديو إلى التوصيل وترقيم الموقع حديثاً. أُعيدت الحالة إلى «بانتظار التأكيد» ليعاود العميل التأكيد على كل الفيديوهات.',
      }),
    )
  }

  if (action === 'delete_video') {
    // Phase 4M — remove one video item entirely: the active R2 original (if any)
    // is deleted from the private bucket, and every row of that item is
    // archived so the item disappears from the delivery.
    const rawItem = Number(form.get('item_pos'))
    if (!Number.isInteger(rawItem) || rawItem < 1) {
      return adminHtml(await deliveryPage(service, appUser, base, detail, { error: 'عنصر الفيديو غير صالح.' }))
    }
    const itemRows = (detail.delivery_videos ?? []).filter((video) => video.item_pos === rawItem)
    if (itemRows.length === 0) {
      return adminHtml(await deliveryPage(service, appUser, base, detail, { error: 'الفيديو غير موجود.' }))
    }
    const activeRow = itemRows.find((video) => video.is_active)
    if (activeRow?.r2_original_key && !activeRow.original_deleted_at) {
      if (!context.env.BUCKET) {
        return adminHtml(await deliveryPage(service, appUser, base, detail, { error: 'مخزن R2 غير مهيأ — لا يمكن حذف الملف.' }))
      }
      try {
        await context.env.BUCKET.delete(activeRow.r2_original_key)
      } catch {
        return adminHtml(await deliveryPage(service, appUser, base, detail, { error: 'تعذّر حذف الملف من المخزن.' }))
      }
      await service
        .from('delivery_videos')
        .update({ original_deleted_at: new Date().toISOString() })
        .eq('id', activeRow.id)
        .is('original_deleted_at', null)
    }
    const { error: archiveError } = await service
      .from('delivery_videos')
      .update({ is_active: false, archived_at: new Date().toISOString() })
      .eq('delivery_id', detail.id)
      .eq('item_pos', rawItem)
    if (archiveError) {
      return adminHtml(await deliveryPage(service, appUser, base, detail, { error: 'تعذّر حذف الفيديو.' }))
    }
    await recordActivity(service, detail.id, 'version_deleted', { item: rawItem })
    const updated = await loadDeliveryDetail(service, detail.id)
    return adminHtml(await deliveryPage(service, appUser, base, updated ?? detail, {
        notice: 'تم حذف الفيديو من التوصيل (وحذف ملفه الأصلي إن وجد) وأرشفة نسخه.',
      }),
    )
  }

  if (action === 'add_note') {
    // Phase 4R — logs a manual communication entry (WhatsApp / email / internal
    // note) against the delivery, tied to the owner who recorded it.
    const note = formString(form.get('note')).trim()
    const direction = formString(form.get('direction')) as CommunicationsRow['direction']
    const channel = formString(form.get('channel')) as CommunicationsRow['channel']
    if (note.length < 2 || note.length > 500) {
      return adminHtml(await deliveryPage(service, appUser, base, detail, { error: 'اكتب نص الرسالة (2–500 حرف).' }))
    }
    if (!['outbound', 'inbound'].includes(direction)) {
      return adminHtml(await deliveryPage(service, appUser, base, detail, { error: 'الاتجاه غير صالح.' }))
    }
    if (!['whatsapp', 'email', 'internal'].includes(channel)) {
      return adminHtml(await deliveryPage(service, appUser, base, detail, { error: 'القناة غير صالحة.' }))
    }
    const { error } = await service.from('communications').insert({
      entity_type: 'delivery',
      entity_id: detail.id,
      channel,
      direction,
      message: note,
      user_id: appUser.id,
    })
    if (error) {
      return adminHtml(await deliveryPage(service, appUser, base, detail, { error: 'تعذّر تسجيل رسالة التواصل.' }))
    }
    const updated = await loadDeliveryDetail(service, detail.id)
    return adminHtml(await deliveryPage(service, appUser, base, updated ?? detail, { notice: 'تم تسجيل رسالة التواصل.' }))
  }

  return adminHtml(await deliveryPage(service, appUser, base, detail, { error: 'إجراء غير معروف.' }))
}

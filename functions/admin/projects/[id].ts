import type { PagesFunction } from '@cloudflare/workers-types'
import { createServiceClient } from '../../_lib/supabase'
import { siteUrl } from '../../_lib/env'
import { html, requireOwner, requireSession } from '../_lib/auth'
import { sameOrigin } from '../_lib/security'
import type { Env } from '../_lib/env'
import {
  adminHtml,
  formString,
  isValidUuid,
  loadDeliveryDetail,
  parseIntOr,
} from '../deliveries/_helpers'
import { renderDetailPage } from '../deliveries/[id]/index'
import { renderProjectWorkspace, renderCardDetailPartial, renderProjects, type ProjectTabKey } from '../_lib/projects-views'
import { createSlotDelivery } from '../_lib/clients-data'
import {
  addSlot,
  createTask,
  deleteTask,
  emptyWorkbench,
  loadCardDetail,
  loadProjectDetail,
  moveSlot,
  recordProjectActivity,
  setProjectProfile,
  setProjectStatus,
  setTaskStatus,
  updateSlot,
  updateTask,
  type ProjectProfileInput,
} from '../_lib/projects-data'
import type {
  KanbanStatus,
  PaymentStatus,
  ProjectStatus,
  TaskPriority,
  TaskStatus,
} from '../../_lib/db-types'

type AdminFunction = PagesFunction<Env, never, Record<string, unknown>>

function workspaceError(appUser: Parameters<typeof renderProjects>[0], message: string, status = 404): Response {
  return html(renderProjects(appUser, emptyWorkbench(''), { models: [], clients: [], error: message }), status)
}

function tabFrom(value: string): ProjectTabKey {
  if (value === 'board' || value === 'details' || value === 'activity') return value
  if (value === 'videos') return 'board'
  if (value === 'overview' || value === 'tasks' || value === 'delivery') return 'details'
  return 'board'
}

export const onRequestGet: AdminFunction = async (context) => {
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const forbidden = requireOwner(appUser)
  if (forbidden) return forbidden

  const id = (context.params as { id?: string }).id ?? ''
  if (!isValidUuid(id)) return workspaceError(appUser, 'معرّف غير صالح.')

  const service = createServiceClient(context.env)
  if (!service) return workspaceError(appUser, 'النظام غير مهيأ.', 500)

  const detail = await loadProjectDetail(service, id)
  if (!detail) return workspaceError(appUser, 'المشروع غير موجود.')

  const params = new URL(context.request.url).searchParams

  // Card-detail fragment (Trello-style modal body) — owner-only, no-store.
  const cardId = params.get('cd_card') ?? ''
  if (cardId) {
    if (!isValidUuid(cardId)) return html('<p>معرّف البطاقة غير صالح.</p>', 400)
    const card = await loadCardDetail(service, id, cardId)
    const response = html(card ? renderCardDetailPartial(card) : '<p>البطاقة غير موجودة.</p>', card ? 200 : 404)
    response.headers.set('Cache-Control', 'private, no-store')
    response.headers.set('X-Robots-Tag', 'noindex')
    return response
  }

  const tab = tabFrom(params.get('tab') ?? '')
  const response = html(
    renderProjectWorkspace(appUser, detail, { tab, openAddTask: params.get('open') === 'add-task', openAddCard: params.get('focus') === 'add' }),
  )
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('X-Robots-Tag', 'noindex')
  return response
}

function profileFromForm(form: FormData, current: ProjectStatus): ProjectProfileInput {
  const priceOrNull = (value: string): number | null => {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number.parseFloat(trimmed)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
  }
  const rawPayment = formString(form.get('payment_status'))
  const paymentStatus: PaymentStatus =
    rawPayment === 'partial' || rawPayment === 'paid' ? rawPayment : 'unpaid'
  return {
    name: formString(form.get('name')),
    status: current,
    modelId: formString(form.get('model_id')) || null,
    count: parseIntOr(formString(form.get('video_count')), 0, 50),
    shootDate: formString(form.get('shoot_date')) || null,
    shootTime: formString(form.get('shoot_time')) || null,
    location: formString(form.get('location')) || null,
    script: formString(form.get('script')) || null,
    notes: formString(form.get('notes')) || null,
    totalPrice: priceOrNull(formString(form.get('total_price'))),
    advance: priceOrNull(formString(form.get('advance'))),
    paymentStatus,
  }
}

export const onRequestPost: AdminFunction = async (context) => {
  if (!sameOrigin(context.request)) return html('<p>طلب غير صالح.</p>', 403)
  const appUser = await requireSession(context)
  if (appUser instanceof Response) return appUser
  const forbidden = requireOwner(appUser)
  if (forbidden) return forbidden

  const id = (context.params as { id?: string }).id ?? ''
  if (!isValidUuid(id)) return workspaceError(appUser, 'معرّف غير صالح.')

  const service = createServiceClient(context.env)
  if (!service) return workspaceError(appUser, 'النظام غير مهيأ.', 500)

  const detail = await loadProjectDetail(service, id)
  if (!detail) return workspaceError(appUser, 'المشروع غير موجود.')

  const form = await context.request.formData()
  const action = formString(form.get('action'))
  const tab = tabFrom(formString(form.get('tab')))

  const renderWorkspace = async (notice = '', error = '', forcedTab: ProjectTabKey = tab, status = 200) => {
    const fresh = await loadProjectDetail(service, id)
    const payload = fresh ?? detail
    return html(renderProjectWorkspace(appUser, payload, { notice, error, tab: forcedTab }), status)
  }
  const isFetchPost = context.request.headers.get('X-Requested-With') === 'fetch'
  const allStatuses: ProjectStatus[] = ['new', 'contacted', 'booked', 'shooting', 'editing', 'review', 'delivery', 'completed', 'archived']

  if (action === 'set_status' || action === 'archive' || action === 'unarchive') {
    if (action === 'archive') {
      const result = await setProjectStatus(service, id, 'archived')
      if (!result.ok) return renderWorkspace('', result.error)
      return renderWorkspace('تمت أرشفة المشروع — تبقى اللقطات والتوصيلات وروابطها كما هي.')
    }
    if (action === 'unarchive') {
      const prior: ProjectStatus =
        detail.project.status_prior && allStatuses.includes(detail.project.status_prior) && detail.project.status_prior !== 'archived'
          ? detail.project.status_prior
          : 'booked'
      const result = await setProjectStatus(service, id, prior)
      if (!result.ok) return renderWorkspace('', result.error)
      return renderWorkspace('أُعيد تفعيل المشروع.')
    }
    const raw = formString(form.get('status'))
    if (!allStatuses.includes(raw as ProjectStatus) || raw === 'archived') {
      return renderWorkspace('', 'حالة غير معروفة.')
    }
    const result = await setProjectStatus(service, id, raw as ProjectStatus)
    if (!result.ok) return renderWorkspace('', result.error)
    return renderWorkspace('تم تحديث حالة المشروع.')
  }

  if (action === 'set_profile') {
    const result = await setProjectProfile(service, id, profileFromForm(form, detail.project.status))
    if (!result.ok) return renderWorkspace('', result.error, 'details')
    return renderWorkspace('تم حفظ بيانات المشروع — عُدّلت اللقطات حسب العدد المخطط دون حذف أي فيديو مرفوع.', '', 'details')
  }

  if (action === 'record_sent') {
    await recordProjectActivity(service, id, 'message_sent', { channel: 'whatsapp' })
    return renderWorkspace('تم تسجيل إرسال رسالة واتساب.', '', 'details')
  }

  if (action === 'move_slot') {
    const slotId = formString(form.get('slot_id'))
    if (!isValidUuid(slotId)) return renderWorkspace('', 'اللقطة غير معروفة.', 'board')
    const status = formString(form.get('status')) as KanbanStatus
    const rawOrder = formString(form.get('order'))
    const order = rawOrder ? rawOrder.split(',').filter((s) => isValidUuid(s)) : undefined
    const result = await moveSlot(service, { projectId: id, slotId, status, order })
    if (!result.ok) return renderWorkspace('', result.error ?? 'تعذّر نقل الفيديو.', 'board', isFetchPost ? 400 : 200)
    return renderWorkspace('تم نقل الفيديو.', '', 'board')
  }

  if (action === 'add_slot') {
    const rawStatus = formString(form.get('status')) as KanbanStatus
    const result = await addSlot(service, {
      projectId: id,
      status: rawStatus,
      title: formString(form.get('title')),
      notes: formString(form.get('notes')),
      label: formString(form.get('label')),
      deadline: formString(form.get('deadline')) || null,
    })
    if (!result.ok) return renderWorkspace('', result.error ?? 'تعذّر إضافة البطاقة.', 'board')
    return renderWorkspace('تمت إضافة البطاقة إلى اللوحة.', '', 'board')
  }

  if (action === 'update_slot') {
    const slotId = formString(form.get('slot_id'))
    if (!isValidUuid(slotId)) return renderWorkspace('', 'البطاقة غير معروفة.', 'board')
    const result = await updateSlot(service, {
      projectId: id,
      slotId,
      title: formString(form.get('title')),
      notes: formString(form.get('notes')),
      label: formString(form.get('label')),
      deadline: formString(form.get('deadline')) || null,
    })
    if (!result.ok) return renderWorkspace('', result.error ?? 'تعذّر حفظ البطاقة.', 'board')
    return renderWorkspace('تم حفظ بيانات البطاقة.', '', 'board')
  }

  if (action === 'prepare_slot') {
    const slotId = formString(form.get('slot_id'))
    if (!isValidUuid(slotId)) return renderWorkspace('', 'اللقطة غير معروفة.', tab)
    const slot = detail.slots.find((item) => item.slot.id === slotId)
    if (!slot) return renderWorkspace('', 'اللقطة غير موجودة في هذا المشروع.', tab)

    const result = await createSlotDelivery(service, {
      clientId: detail.project.client_id,
      slotId,
      userId: appUser.id,
      whatsapp: detail.client?.whatsapp_number ?? '',
    })
    if (!result.ok) return renderWorkspace('', result.error, tab)
    if ('existing' in result) {
      return renderWorkspace('اللقطة جاهزة مسبقاً — ارفع فيديوها من صفحة التوصيل.', '', tab)
    }

    // Same flow as the delivery creation page: render the detail once with the
    // fresh private link so the owner can copy/share it exactly once.
    const base = siteUrl(context.env, context.request)
    const updatedDetail = await loadDeliveryDetail(service, result.deliveryId)
    return adminHtml(
      renderDetailPage(appUser, base, updatedDetail ?? null, {
        freshToken: result.token,
        identifier: result.identifier,
        notice: 'تم تجهيز الفيديو الخاص لهذه اللقطة — ارفع الملف ثم أرسل الرابط للعميل.',
      }),
    )
  }

  if (action === 'add_task') {
    const priorityRaw = formString(form.get('priority'))
    const priority: TaskPriority = priorityRaw === 'low' || priorityRaw === 'high' ? priorityRaw : 'medium'
    const result = await createTask(service, {
      projectId: id,
      title: formString(form.get('title')),
      priority,
      assigneeId: formString(form.get('assignee_id')) || null,
      dueDate: formString(form.get('due_date')) || null,
      slotId: formString(form.get('slot_id')) || null,
      userId: appUser.id,
    })
    if (!result.ok) return renderWorkspace('', result.error ?? 'تعذّر إضافة المهمة.', tab)
    return renderWorkspace('تمت إضافة المهمة.', '', tab)
  }

  if (action === 'edit_task') {
    const taskId = formString(form.get('task_id'))
    if (!isValidUuid(taskId)) return renderWorkspace('', 'المهمة غير معروفة.', 'details')
    const priorityRaw = formString(form.get('priority'))
    const priority: TaskPriority = priorityRaw === 'low' || priorityRaw === 'high' ? priorityRaw : 'medium'
    const result = await updateTask(service, {
      projectId: id,
      taskId,
      title: formString(form.get('title')),
      priority,
      assigneeId: formString(form.get('assignee_id')) || null,
      dueDate: formString(form.get('due_date')) || null,
    })
    if (!result.ok) return renderWorkspace('', result.error ?? 'تعذّر تعديل المهمة.', tab)
    return renderWorkspace('تم تعديل المهمة.', '', tab)
  }

  if (action === 'set_task') {
    const taskId = formString(form.get('task_id'))
    if (!isValidUuid(taskId)) return renderWorkspace('', 'المهمة غير معروفة.', tab)
    const status = formString(form.get('status')) as TaskStatus
    if (status !== 'todo' && status !== 'in_progress' && status !== 'done') {
      return renderWorkspace('', 'حالة غير معروفة.', tab)
    }
    const result = await setTaskStatus(service, { projectId: id, taskId, status })
    if (!result.ok) return renderWorkspace('', result.error ?? 'تعذّر تحديث المهمة.', tab)
    return renderWorkspace('تم تحديث حالة المهمة.', '', tab)
  }

  if (action === 'delete_task') {
    const taskId = formString(form.get('task_id'))
    if (!isValidUuid(taskId)) return renderWorkspace('', 'المهمة غير معروفة.', tab)
    const result = await deleteTask(service, { projectId: id, taskId })
    if (!result.ok) return renderWorkspace('', result.error ?? 'تعذّر حذف المهمة.', tab)
    return renderWorkspace('تم حذف المهمة.', '', tab)
  }

  return renderWorkspace('', 'إجراء غير معروف.', tab)
}
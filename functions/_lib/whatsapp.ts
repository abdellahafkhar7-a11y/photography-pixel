// WhatsApp is intentionally NOT the Business API. We never send anything
// automatically: we only build a normal https://wa.me/<number>?text=... link
// that opens WhatsApp Web/App  with a prefilled Arabic message. The staff
// member presses Send themselves.

export function normalizeWhatsapp(input: string): string {
  const digits = input.replace(/\D/g, '')
  // Local Moroccan-style numbers (0663493003) -> international (212663493003).
  if (digits.length === 10 && digits.startsWith('0')) {
    return `212${digits.slice(1)}`
  }
  return digits
}

export function isValidWhatsapp(input: string): input is string {
  const digits = normalizeWhatsapp(input)
  return digits.length >= 10 && digits.length <= 15
}

export function buildWaLink(number: string, text: string): string {
  return `https://wa.me/${encodeURIComponent(number)}?text=${encodeURIComponent(text)}`
}

export function ownerContactWaLink(number: string): string {
  return buildWaLink(
    number,
    `السلام عليكم، هذا هو الرابط الخاص بالفيديو ديالك من Photography Pixel:

<PRIVATE_LINK>

يمكنك مشاهدة الفيديو وتأكيده من خلال الرابط.`,
  )
}

export function deliveryShareWaLink(number: string, privateLink: string): string {
  return buildWaLink(
    number,
    `السلام عليكم، هذا هو الرابط الخاص بالفيديو ديالك من Photography Pixel:

${privateLink}

يمكنك مشاهدة الفيديو وتأكيده من خلال الرابط.`,
  )
}

export function clientContactWaLink(number: string): string {
  return buildWaLink(
    number,
    'السلام عليكم، أود التواصل معكم بخصوص الفيديو من Photography Pixel.',
  )
}

// Phase 4N — model booking notification. The script section is only included
// when present, and the video count always reflects the CURRENT planned count.
export function modelBookingWaLink(
  number: string,
  opts: { modelName: string; clientName: string; videoCount: number; script?: string | null },
): string {
  const lines = [
    `السلام عليكم ${opts.modelName}،`,
    `تم تسجيل طلب تصوير جديد من العميل ${opts.clientName}.`,
    `عدد الفيديوهات المطلوبة: ${opts.videoCount}.`,
  ]
  if (opts.script?.trim()) lines.push('', opts.script.trim())
  lines.push('', 'شكراً لتعاونك مع Photography Pixel.')
  return buildWaLink(number, lines.join('\n'))
}

// Phase 4O — project WhatsApp message. The text is built from the CURRENT
// project state and only the sections that actually have a value are included
// (script is omitted entirely when empty), matching the spec's "skip empty
// sections" rule. No Business API: the staff member sends it from WhatsApp.
export type ProjectMessageParts = {
  modelName?: string | null
  clientName: string
  projectName?: string | null
  videoCount: number
  shootDate?: string | null
  shootTime?: string | null
  location?: string | null
  script?: string | null
}

function formatShootDate(value: string): string {
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return new Intl.DateTimeFormat('ar-MA', { day: 'numeric', month: 'long', year: 'numeric' }).format(d)
}

export function projectMessageText(parts: ProjectMessageParts): string {
  const lines: string[] = [
    `السلام عليكم ${parts.clientName}،`,
  ]
  if (parts.projectName?.trim()) {
    lines.push(`مشروع: ${parts.projectName.trim()}`)
  }
  const details: string[] = []
  if (parts.videoCount > 0) details.push(`عدد الفيديوهات: ${parts.videoCount}`)
  if (parts.shootDate?.trim()) details.push(`تاريخ التصوير: ${formatShootDate(parts.shootDate.trim())}`)
  if (parts.shootTime?.trim()) details.push(`الساعة: ${parts.shootTime.trim()}`)
  if (parts.location?.trim()) details.push(`المكان: ${parts.location.trim()}`)
  if (details.length > 0) lines.push(details.join('، '))
  if (parts.modelName?.trim()) lines.push(`الموديل: ${parts.modelName.trim()}`)
  if (parts.script?.trim()) lines.push('', parts.script.trim())
  lines.push('', 'بالتوفيق وشكراً لثقتكم في Photography Pixel.')
  return lines.join('\n')
}

export function projectWaLink(number: string, parts: ProjectMessageParts): string {
  return buildWaLink(number, projectMessageText(parts))
}
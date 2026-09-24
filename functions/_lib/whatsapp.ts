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
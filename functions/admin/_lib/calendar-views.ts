import type { AppUserRow } from './types'
import type { CalendarData, CalendarEvent, CalendarEventType } from './calendar-data'
import { eventsOn } from './calendar-data'
import { escapeHtml, panel, shell, shellIcon } from './shell'

const TYPE_LABEL: Record<CalendarEventType, string> = {
  shoot: 'جلسة تصوير',
  deadline: 'موعد فيديو',
  task: 'مهمة',
  delivery: 'انتهاء تحميل',
}

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function formatDateLabel(dateKey: string): string {
  const formatter = new Intl.DateTimeFormat('ar-MA', {
    day: 'numeric',
    month: 'long',
    numberingSystem: 'latn',
    timeZone: 'Africa/Casablanca',
  })
  const date = new Date(`${dateKey}T12:00:00Z`)
  return Number.isNaN(date.getTime()) ? dateKey : formatter.format(date)
}

function chipHtml(event: CalendarEvent): string {
  const time = event.time ? `<span class="cal-time">${escapeHtml(event.time)}</span>` : ''
  return `<a class="cal-chip cal-${event.type}" href="${escapeHtml(event.href)}"><span class="cal-dot"></span>${time}${escapeHtml(event.title)}</a>`
}

function monthGridHtml(data: CalendarData): string {
  const [yStr, mStr] = data.ym.split('-')
  const year = Number(yStr ?? '2026')
  const month = Number(mStr ?? '01')
  const first = new Date(Date.UTC(year, month - 1, 1))
  const startDow = first.getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()

  const header = WEEKDAYS.map((d) => `<th scope="col" class="cal-wd">${d}</th>`).join('')

  let body = ''
  let day = 1 - startDow
  const rows = Math.ceil((startDow + daysInMonth) / 7)
  for (let r = 0; r < rows; r += 1) {
    let cells = ''
    for (let c = 0; c < 7; c += 1) {
      if (day < 1 || day > daysInMonth) {
        cells += `<td class="cal-empty"></td>`
      } else {
        const dateKey = `${data.ym}-${pad(day)}`
        const isToday = dateKey === data.todayKey
        const evs = eventsOn(data.events, dateKey)
        const shown = evs.slice(0, 3)
        const more = evs.length - shown.length
        const chips = shown.map(chipHtml).join('')
        const moreHtml = more > 0 ? `<div class="cal-more">+${more} أخرى</div>` : ''
        cells += `<td class="cal-cell"><div class="cal-day${isToday ? ' cal-today' : ''}">${day}</div><div class="cal-chips">${chips}${moreHtml}</div></td>`
      }
      day += 1
    }
    body += `<tr>${cells}</tr>`
  }
  return `<table class="cal-grid"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`
}

function agendaHtml(events: CalendarEvent[]): string {
  if (events.length === 0) {
    return `<p class="muted">لا توجد مواعيد ضمن هذا الشهر.</p>`
  }
  const rows = events
    .map((event) => {
      const time = event.time ? `<span class="pill">${escapeHtml(event.time)}</span>` : ''
      return `<a class="cal-agenda-row" href="${escapeHtml(event.href)}">
        <span class="cal-agenda-date"><b>${escapeHtml(formatDateLabel(event.dateKey))}</b></span>
        <span class="cal-chip cal-${event.type} cal-chip-static">${escapeHtml(TYPE_LABEL[event.type])}</span>
        <span class="cal-agenda-title">${escapeHtml(event.title)}</span>
        ${time}
        <span class="cal-agenda-meta">${escapeHtml(event.meta)}</span>
        <span class="cal-go">${shellIcon('arrowLeft', 16)}</span>
      </a>`
    })
    .join('')
  return `<div class="cal-agenda">${rows}</div>`
}

export function renderCalendar(appUser: AppUserRow, data: CalendarData): string {
  const overview = (Object.keys(TYPE_LABEL) as CalendarEventType[])
    .map((type) => {
      const count = data.events.filter((e) => e.type === type).length
      if (count === 0) return ''
      return `<span class="stat"><span class="k">${shellIcon('calendar', 14)}<span>${TYPE_LABEL[type]}</span></span><span class="v">${count}</span></span>`
    })
    .filter(Boolean)
    .join('')

  const legend = (Object.keys(TYPE_LABEL) as CalendarEventType[])
    .map((type) => `<span class="cal-chip cal-${type} cal-chip-static">${TYPE_LABEL[type]}</span>`)
    .join('')

  const nav =
    `<div class="between cal-nav">
       <a class="btn btn-subtle" href="?month=${escapeHtml(data.prevYm)}" aria-label="الشهر السابق">${shellIcon('arrow', 16)} السابق</a>
       <div class="cal-title"><h1>التقويم</h1><div class="muted">${escapeHtml(data.label)}</div></div>
       <div class="row">
         <a class="btn btn-subtle" href="?month=${escapeHtml(data.todayKey.slice(0, 7))}">اليوم</a>
         <a class="btn btn-subtle" href="?month=${escapeHtml(data.nextYm)}" aria-label="الشهر التالي">التالي ${shellIcon('arrow', 16)}</a>
       </div>
     </div>`

  const overviewHtml = overview ? `<div class="stat-grid cal-stats">${overview}</div>` : ''

  const content = `
    <style>
      .cal-nav{flex-wrap:wrap}
      .cal-title h1{font-size:1.25rem}
      .cal-stats{margin-bottom:1rem;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr))}
      .cal-grid{width:100%;border-collapse:separate;border-spacing:.35rem;direction:rtl}
      .cal-grid th.cal-wd{font-size:.74rem;font-weight:650;color:var(--muted,#6F6A5F);padding:.3rem 0;text-align:center}
      .cal-empty{background:transparent}
      .cal-cell{background:#fff;border:1px solid #E6E0D4;border-radius:.8rem;vertical-align:top;min-height:6.5rem;width:14.28%;padding:.45rem}
      .cal-day{font-weight:700;font-size:.9rem;color:#201F1C;display:inline-flex;align-items:center;justify-content:center;min-width:1.7rem;height:1.7rem;border-radius:999px}
      .cal-day.cal-today{background:#362477;color:#fff}
      .cal-chips{display:flex;flex-direction:column;gap:.3rem;margin-top:.35rem}
      .cal-chip{display:flex;align-items:center;gap:.35rem;font-size:.72rem;font-weight:650;color:#201F1C;text-decoration:none!important;padding:.22rem .45rem;border-radius:.5rem;border:1px solid transparent;overflow:hidden;white-space:nowrap}
      .cal-chip:hover{filter:brightness(.97)}
      .cal-chip .cal-dot{flex:none;width:.5rem;height:.5rem;border-radius:999px;background:currentColor;opacity:.85}
      .cal-chip.cal-time-prefix{}
      .cal-time{font-size:.68rem;font-weight:750;color:#6F6A5F}
      .cal-shoot{background:rgba(54,36,119,.09);border-color:rgba(54,36,119,.28);color:#362477}
      .cal-deadline{background:rgba(154,107,0,.1);border-color:rgba(154,107,0,.32);color:#8a6a1f}
      .cal-task{background:rgba(38,120,187,.1);border-color:rgba(38,120,187,.3);color:#1f5a8b}
      .cal-delivery{background:rgba(179,71,63,.09);border-color:rgba(179,71,63,.3);color:#9c3c36}
      .cal-more{font-size:.7rem;color:#6F6A5F;padding:.1rem .3rem}
      .cal-agenda{display:flex;flex-direction:column;gap:.45rem}
      .cal-agenda-row{display:flex;align-items:center;gap:.7rem;flex-wrap:wrap;text-decoration:none!important;color:#201F1C;background:#fff;border:1px solid #E6E0D4;border-radius:.8rem;padding:.6rem .8rem}
      .cal-agenda-row:hover{border-color:#362477}
      .cal-agenda-date{min-width:6.4rem}
      .cal-agenda-date b{font-weight:700;font-size:.86rem;display:block}
      .cal-agenda-title{font-weight:650;font-size:.9rem}
      .cal-agenda-meta{color:#6F6A5F;font-size:.8rem}
      .cal-go{margin-inline-start:auto;color:#362477}
      .cal-chip-static{cursor:default}
      @media (max-width:760px){
        .cal-cell{min-height:4rem;padding:.3rem;border-radius:.5rem}
        .cal-grid th.cal-wd{font-size:.66rem}
        .cal-chips{display:none}
        .cal-agenda-date{min-width:5.2rem}
      }
    </style>

    ${nav}
    <div class="between" style="margin:.25rem 0 1rem"><div class="row">${legend}</div></div>
    ${overviewHtml}
    ${panel('أجندة الشهر', 'calendar', agendaHtml(data.events), {
      action: `<span class="pill">${data.events.length} موعد</span>`,
    })}
    <section class="panel">
      <div class="panel-head"><span class="ico-chip">${shellIcon('calendar', 18)}</span><h2>التقويم الشهري</h2></div>
      <div class="panel-body">${monthGridHtml(data)}</div>
    </section>`

  return shell('التقويم', content, { active: 'calendar', user: appUser, bodyClass: 'cal' })
}
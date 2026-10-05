// Renders metrics.stats.svg (all-time stats, contribution streak, languages and the last year's calendar),
// including private repositories.
// lowlighter/metrics only counts the last year of activity, so PRs and reviews come out far too low,
// and the public streak service is too slow for GitHub's image proxy and only sees public contributions.
import { writeFile } from "node:fs/promises"

const token = process.env.METRICS_TOKEN
const login = process.env.LOGIN ?? "TgMrP"
if (!token) throw new Error("METRICS_TOKEN is not set")

async function gh(path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { authorization: `bearer ${token}`, accept: "application/vnd.github+json", ...init.headers },
  })
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`)
  return res.json()
}

const graphql = async (query, variables) => {
  const { data, errors } = await gh("/graphql", { method: "POST", body: JSON.stringify({ query, variables }) })
  if (errors) throw new Error(JSON.stringify(errors))
  return data
}

const searchCount = async (q, type = "issues") =>
  (await gh(`/search/${type}?per_page=1&q=${encodeURIComponent(q)}`)).total_count

async function contributionDays(createdAt) {
  const days = []
  for (let year = new Date(createdAt).getUTCFullYear(); year <= new Date().getUTCFullYear(); year++) {
    const { user } = await graphql(
      `query($login: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $login) { contributionsCollection(from: $from, to: $to) {
          contributionCalendar { weeks { contributionDays { date contributionCount } } }
        } }
      }`,
      { login, from: `${year}-01-01T00:00:00Z`, to: `${year}-12-31T23:59:59Z` },
    )
    for (const week of user.contributionsCollection.contributionCalendar.weeks) days.push(...week.contributionDays)
  }
  const today = new Date().toISOString().slice(0, 10)
  return days.filter(({ date }) => date <= today)
}

// A streak that has not been extended yet today still counts as current.
function streaks(days) {
  let longest = { length: 0 }
  let run = { length: 0 }
  for (const { date, contributionCount } of days) {
    if (contributionCount === 0) {
      run = { length: 0 }
      continue
    }
    run = run.length ? { ...run, length: run.length + 1, end: date } : { length: 1, start: date, end: date }
    if (run.length > longest.length) longest = run
  }
  const last = days.at(-1)
  const yesterday = days.at(-2)
  const current = run.length && (run.end === last?.date || run.end === yesterday?.date) ? run : { length: 0 }
  return { current, longest }
}

const { user } = await graphql(
  `query($login: String!) { user(login: $login) {
    createdAt
    repositories(ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]) { totalCount }
  } }`,
  { login },
)

const days = await contributionDays(user.createdAt)
const totalContributions = days.reduce((sum, { contributionCount }) => sum + contributionCount, 0)

const stats = [
  ["Contributions (all time)", totalContributions],
  ["Commits", await searchCount(`author:${login}`, "commits")],
  ["Pull requests opened", await searchCount(`author:${login} is:pr`)],
  ["Pull requests merged", await searchCount(`author:${login} is:pr is:merged`)],
  ["Pull requests reviewed", await searchCount(`reviewed-by:${login} is:pr -author:${login}`)],
  ["Issues opened", await searchCount(`author:${login} is:issue`)],
  ["Repositories", user.repositories.totalCount],
]

console.log(Object.fromEntries(stats))

const { current, longest } = streaks(days)
console.log({ current, longest })

// Languages by bytes across owned, collaborator and organization repositories.
const ignoredLanguages = new Set(["HTML", "CSS", "SCSS", "Sass", "Shell", "Dockerfile", "Makefile", "PowerShell"])
const bytes = new Map()
let cursor = null
do {
  const { user: page } = await graphql(
    `query($login: String!, $cursor: String) { user(login: $login) {
      repositories(first: 100, after: $cursor, isFork: false, ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]) {
        pageInfo { hasNextPage endCursor }
        nodes { languages(first: 20) { edges { size node { name color } } } }
      }
    } }`,
    { login, cursor },
  )
  for (const repo of page.repositories.nodes) {
    for (const { size, node } of repo.languages.edges) {
      if (ignoredLanguages.has(node.name)) continue
      const entry = bytes.get(node.name) ?? { size: 0, color: node.color ?? "#8b949e" }
      entry.size += size
      bytes.set(node.name, entry)
    }
  }
  cursor = page.repositories.pageInfo.hasNextPage ? page.repositories.pageInfo.endCursor : null
} while (cursor)

const top = [...bytes].sort(([, a], [, b]) => b.size - a.size).slice(0, stats.length)
const topTotal = top.reduce((sum, [, { size }]) => sum + size, 0)
console.log(Object.fromEntries(top.map(([name, { size }]) => [name, size])))

// Closed-form springs (same presets as motion-reel-kit's lib/motion.js), sampled into CSS linear() easings
// so the cards animate with real spring curves instead of stock ease-out.
const springPresets = {
  snappy: { response: 0.22, damping: 0.8 },
  default: { response: 0.4, damping: 0.86 },
  heavy: { response: 0.5, damping: 1 },
}
function springStep(tau, { response, damping: z }) {
  const w = (2 * Math.PI) / response
  if (z >= 1) return 1 - Math.exp(-w * tau) * (1 + w * tau)
  const wd = w * Math.sqrt(1 - z * z)
  return 1 - Math.exp(-z * w * tau) * (Math.cos(wd * tau) + ((z * w) / wd) * Math.sin(wd * tau))
}
function springEasing(preset) {
  let duration = 0
  for (let tau = 0; tau < 20 * preset.response; tau += 0.001) {
    if (Math.abs(1 - springStep(tau, preset)) >= 0.002) duration = tau
  }
  const samples = Array.from({ length: 41 }, (_, i) => (i === 40 ? 1 : springStep((duration * i) / 40, preset)).toFixed(4))
  return { duration: duration.toFixed(3), easing: `linear(${samples.join(", ")})` }
}
const motion = Object.fromEntries(Object.entries(springPresets).map(([name, preset]) => [name, springEasing(preset)]))
const animate = (name, preset) => `animation: ${name} ${motion[preset].duration}s ${motion[preset].easing} both;`
const delay = (seconds) => `style="animation-delay: ${seconds.toFixed(2)}s"`

// One SVG for all cards, so they line up exactly instead of relying on how GitHub wraps side-by-side images.
const width = 960
const gap = 16
const half = (width - gap) / 2
const rowHeight = 30
const lowerHeight = 48 + stats.length * rowHeight
const streakHeight = 184

// Position with the transform attribute on the outer group; the CSS animation transforms the inner one.
const panel = ({ x, y, width, height, title, body, at }) => `<g transform="translate(${x} ${y})"><g class="rise" ${delay(at)}>
    <rect class="card" x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="8" />
    <text class="title" x="24" y="32">${title}</text>
    ${body}
  </g></g>`

const formatDate = (date) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
const range = (streak) => (streak.length ? `${formatDate(streak.start)} - ${formatDate(streak.end)}` : "No active streak")
const streakColumns = [
  ["Total contributions", totalContributions.toLocaleString("en-US"), `Since ${formatDate(user.createdAt.slice(0, 10))}`],
  ["Current streak", `${current.length} days`, range(current), "accent"],
  ["Longest streak", `${longest.length} days`, range(longest)],
]
const columnWidth = width / streakColumns.length
const streakColumnsSvg = streakColumns
  .map(([label, value, detail, extra = ""], i) => {
    const x = columnWidth * i + columnWidth / 2
    const divider = i ? `<line class="divider" x1="${columnWidth * i}" y1="52" x2="${columnWidth * i}" y2="128" />` : ""
    return `${divider}<g class="type" ${delay(0.2 + i * 0.1)}><text class="big ${extra}" x="${x}" y="86" text-anchor="middle">${value}</text><text x="${x}" y="110" text-anchor="middle">${label}</text><text class="muted" x="${x}" y="128" text-anchor="middle">${detail}</text></g>`
  })
  .join("\n    ")

// The last weeks of the contribution calendar as a strip under the streak numbers, shaded like GitHub's graph.
const recent = days.slice(-63)
const active = recent.map(({ contributionCount }) => contributionCount).filter(Boolean).sort((a, b) => a - b)
const quartile = (q) => active[Math.floor((active.length - 1) * q)] ?? 0
const level = (count) => (count === 0 ? 0 : count <= quartile(0.25) ? 1 : count <= quartile(0.5) ? 2 : count <= quartile(0.75) ? 3 : 4)
const cellStep = (width - 48) / recent.length
const strip = recent
  .map(({ date, contributionCount }, i) => {
    const x = (24 + i * cellStep).toFixed(2)
    return `<rect class="cell l${level(contributionCount)}" x="${x}" y="150" width="${(cellStep - 3).toFixed(2)}" height="14" rx="3" ${delay(0.45 + i * 0.012)}><title>${date}: ${contributionCount}</title></rect>`
  })
  .join("")

const row = (label, value, y, inner, labelX = 24) =>
  `<text x="${labelX}" y="${y}">${label}</text><text class="value" x="${inner - 24}" y="${y}" text-anchor="end">${value}</text>`

const statsBody = stats
  .map(([label, value], i) => `<g class="slide" ${delay(0.45 + i * 0.06)}>${row(label, value.toLocaleString("en-US"), 64 + i * rowHeight, half)}</g>`)
  .join("\n    ")

// The bar takes the first row's slot, so the legend rows line up with the stats rows next to it.
const barWidth = half - 48
let barX = 24
const segments = top
  .map(([, { size, color }]) => {
    const w = (size / topTotal) * barWidth
    const rect = `<rect x="${barX.toFixed(2)}" y="50" width="${w.toFixed(2)}" height="10" fill="${color}" />`
    barX += w
    return rect
  })
  .join("")
const legendStep = (lowerHeight - 14 - 86) / (top.length - 1)
const legend = top
  .map(([name, { size, color }], i) => {
    const y = Math.round(86 + i * legendStep)
    const percent = `${((size / topTotal) * 100).toFixed(1)}%`
    return `<circle class="pop" cx="29" cy="${y - 5}" r="5" fill="${color}" ${delay(0.6 + i * 0.06)} /><g class="slide" ${delay(0.5 + i * 0.06)}>${row(name, percent, y, half, 42)}</g>`
  })
  .join("\n    ")

// The last year as an isometric calendar: one prism per day, height by contributions, rising week by week.
const lastYear = days.slice(-371)
const yearDays = lastYear.slice(lastYear.findIndex(({ date }) => new Date(`${date}T00:00:00Z`).getUTCDay() === 0))
const peak = Math.max(...yearDays.map(({ contributionCount }) => contributionCount))
const activeDays = yearDays.filter(({ contributionCount }) => contributionCount > 0)
const weekdayTotals = [0, 0, 0, 0, 0, 0, 0]
for (const { date, contributionCount } of yearDays) weekdayTotals[new Date(`${date}T00:00:00Z`).getUTCDay()] += contributionCount
const busiestWeekday = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"][
  weekdayTotals.indexOf(Math.max(...weekdayTotals))
]
const yearFacts = [
  `Highest in a day ${peak}`,
  `Average ${(activeDays.reduce((sum, { contributionCount }) => sum + contributionCount, 0) / Math.max(activeDays.length, 1)).toFixed(1)} per active day`,
  `Busiest on ${busiestWeekday}`,
].join("  ·  ")

const weekAxis = [15, 3]
const dayAxis = [-8, 5]
const cellScale = 0.82
const maxPrism = 56
const weeks = Math.ceil(yearDays.length / 7)
const isoHeight = 48 + 6 * dayAxis[1] + weeks * weekAxis[1] + maxPrism + 16
// Centre the grid horizontally: it spans from the last weekday's far corner to the last week's near corner.
const isoSpan = 7 * -dayAxis[0] * cellScale + 6 * -dayAxis[0] + (weeks - 1) * weekAxis[0] + weekAxis[0] * cellScale
const isoOrigin = [(width - isoSpan) / 2 + 6 * -dayAxis[0] + -dayAxis[0] * cellScale, 48 + maxPrism - 4]
const point = ([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`
const prisms = yearDays
  .map(({ date, contributionCount }, i) => {
    const week = Math.floor(i / 7)
    const day = i % 7
    const l = level(contributionCount)
    const h = contributionCount ? 4 + Math.sqrt(contributionCount / peak) * (maxPrism - 4) : 1.5
    const ox = isoOrigin[0] + week * weekAxis[0] + day * dayAxis[0]
    const oy = isoOrigin[1] + week * weekAxis[1] + day * dayAxis[1]
    const u = [weekAxis[0] * cellScale, weekAxis[1] * cellScale]
    const v = [dayAxis[0] * cellScale, dayAxis[1] * cellScale]
    const base = [[ox, oy], [ox + u[0], oy + u[1]], [ox + u[0] + v[0], oy + u[1] + v[1]], [ox + v[0], oy + v[1]]]
    const top = base.map(([x, y]) => [x, y - h])
    const face = (a, b) => [top[a], top[b], base[b], base[a]].map(point).join(" ")
    return `<g class="prism" ${delay(0.35 + week * 0.018)}><title>${date}: ${contributionCount}</title><polygon class="s${l}" points="${face(1, 2)}" /><polygon class="f${l}" points="${face(2, 3)}" /><polygon class="l${l}" points="${top.map(point).join(" ")}" /></g>`
  })
  .join("")

const height = streakHeight + gap + lowerHeight + gap + isoHeight
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="GitHub stats, contribution streak, most used languages and contribution calendar for ${login}">
  <style>
    text { font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; fill: #57606a; }
    .title { font-size: 18px; font-weight: 600; fill: #0969da; }
    .value { font-weight: 600; fill: #1f2328; }
    .big { font-size: 30px; font-weight: 700; fill: #1f2328; }
    .accent { fill: #1a7f37; }
    .muted { font-size: 12px; fill: #8c959f; }
    .card { fill: #ffffff; stroke: #d0d7de; }
    .divider { stroke: #d0d7de; }
    .l0 { fill: #ebedf0; } .l1 { fill: #9be9a8; } .l2 { fill: #40c463; } .l3 { fill: #30a14e; } .l4 { fill: #216e39; }
    .f0 { fill: #d0d7de; } .f1 { fill: #7bc98a; } .f2 { fill: #34a352; } .f3 { fill: #26833f; } .f4 { fill: #1a582e; }
    .s0 { fill: #c4ccd4; } .s1 { fill: #6cb37a; } .s2 { fill: #2d8f48; } .s3 { fill: #217237; } .s4 { fill: #164b27; }
    @media (prefers-color-scheme: dark) {
      .card { fill: #0d1117; stroke: #30363d; }
      .divider { stroke: #30363d; }
      text { fill: #9198a1; }
      .title { fill: #4493f8; }
      .value, .big { fill: #f0f6fc; }
      .accent { fill: #3fb950; }
      .muted { fill: #6e7681; }
      .l0 { fill: #161b22; } .l1 { fill: #0e4429; } .l2 { fill: #006d32; } .l3 { fill: #26a641; } .l4 { fill: #39d353; }
      .f0 { fill: #10141a; } .f1 { fill: #0a3320; } .f2 { fill: #005226; } .f3 { fill: #1d7d31; } .f4 { fill: #2b9e3e; }
      .s0 { fill: #0b0e13; } .s1 { fill: #072617; } .s2 { fill: #003d1c; } .s3 { fill: #165e25; } .s4 { fill: #20772f; }
    }
    .rise, .type, .slide, .cell, .grow, .pop, .prism { transform-box: fill-box; }
    .rise { ${animate("rise", "default")} }
    .type { ${animate("type", "heavy")} }
    .slide { ${animate("slide", "default")} }
    .cell, .pop { transform-origin: center; ${animate("pop", "snappy")} }
    .grow { transform-origin: left center; ${animate("grow", "default")} }
    .prism { transform-origin: center bottom; ${animate("lift", "default")} }
    @keyframes rise { from { transform: translateY(16px); opacity: 0; } }
    @keyframes type { from { transform: translateY(10px); opacity: 0; } }
    @keyframes slide { from { transform: translateX(-10px); opacity: 0; } }
    @keyframes pop { from { transform: scale(0); } }
    @keyframes grow { from { transform: scaleX(0); } }
    @keyframes lift { from { transform: scaleY(0); } }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
  </style>
  ${panel({ x: 0, y: 0, width, height: streakHeight, title: "Contribution streak", at: 0, body: `${streakColumnsSvg}\n    ${strip}` })}
  ${panel({ x: 0, y: streakHeight + gap, width: half, height: lowerHeight, title: "GitHub stats", at: 0.15, body: statsBody })}
  ${panel({
    x: half + gap,
    y: streakHeight + gap,
    width: half,
    height: lowerHeight,
    title: "Most used languages",
    at: 0.25,
    body: `<clipPath id="bar"><rect x="24" y="50" width="${barWidth}" height="10" rx="5" /></clipPath>
    <g class="grow" ${delay(0.5)}><g clip-path="url(#bar)">${segments}</g></g>
    ${legend}`,
  })}
  ${panel({
    x: 0,
    y: streakHeight + gap + lowerHeight + gap,
    width,
    height: isoHeight,
    title: "Contributions in the last year",
    at: 0.3,
    body: `<text class="muted" x="${width - 24}" y="31" text-anchor="end">${yearFacts}</text>
    ${prisms}`,
  })}
</svg>
`

await writeFile("metrics.stats.svg", svg)

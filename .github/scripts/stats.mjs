// Renders metrics.stats.svg, metrics.streak.svg and metrics.languages.svg, including private repositories.
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

const width = 480
const card = ({ width, height, label, title, body }) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">
  <style>
    text { font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; fill: #57606a; }
    .title { font-size: 18px; font-weight: 600; fill: #0969da; }
    .value { font-weight: 600; fill: #1f2328; }
    .big { font-size: 30px; font-weight: 700; fill: #1f2328; }
    .accent { fill: #1a7f37; }
    .muted { font-size: 12px; fill: #8c959f; }
    .card { fill: #ffffff; stroke: #d0d7de; }
    .divider { stroke: #d0d7de; }
    @media (prefers-color-scheme: dark) {
      .card { fill: #0d1117; stroke: #30363d; }
      .divider { stroke: #30363d; }
      text { fill: #9198a1; }
      .title { fill: #4493f8; }
      .value, .big { fill: #f0f6fc; }
      .accent { fill: #3fb950; }
      .muted { fill: #6e7681; }
    }
  </style>
  <rect class="card" x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="8" />
  <text class="title" x="24" y="32">${title}</text>
  ${body}
</svg>
`

const rowHeight = 30
const rows = stats
  .map(([label, value], i) => {
    const y = 64 + i * rowHeight
    return `<text class="label" x="24" y="${y}">${label}</text><text class="value" x="${width - 24}" y="${y}" text-anchor="end">${value.toLocaleString("en-US")}</text>`
  })
  .join("\n  ")

const svg = card({
  width,
  height: 48 + stats.length * rowHeight,
  label: `GitHub stats for ${login}`,
  title: "GitHub stats",
  body: rows,
})
await writeFile("metrics.stats.svg", svg)
console.log(Object.fromEntries(stats))

const { current, longest } = streaks(days)
const formatDate = (date) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
const range = (streak) => (streak.length ? `${formatDate(streak.start)} - ${formatDate(streak.end)}` : "No active streak")
const streakColumns = [
  ["Total contributions", totalContributions.toLocaleString("en-US"), `Since ${formatDate(user.createdAt.slice(0, 10))}`],
  ["Current streak", `${current.length} days`, range(current), "accent"],
  ["Longest streak", `${longest.length} days`, range(longest)],
]
const columnWidth = width / streakColumns.length
const streakBody = streakColumns
  .map(([label, value, detail, extra = ""], i) => {
    const x = columnWidth * i + columnWidth / 2
    const divider = i ? `<line class="divider" x1="${columnWidth * i}" y1="56" x2="${columnWidth * i}" y2="136" />` : ""
    return `${divider}<text class="big ${extra}" x="${x}" y="92" text-anchor="middle">${value}</text><text x="${x}" y="116" text-anchor="middle">${label}</text><text class="muted" x="${x}" y="134" text-anchor="middle">${detail}</text>`
  })
  .join("\n  ")

await writeFile(
  "metrics.streak.svg",
  card({ width, height: 156, label: `Contribution streak for ${login}`, title: "Contribution streak", body: streakBody }),
)
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

const top = [...bytes].sort(([, a], [, b]) => b.size - a.size).slice(0, 8)
const topTotal = top.reduce((sum, [, { size }]) => sum + size, 0)
const barWidth = width - 48
let barX = 24
const segments = top
  .map(([, { size, color }]) => {
    const w = (size / topTotal) * barWidth
    const rect = `<rect x="${barX.toFixed(2)}" y="48" width="${w.toFixed(2)}" height="10" fill="${color}" />`
    barX += w
    return rect
  })
  .join("")
const legend = top
  .map(([name, { size, color }], i) => {
    const x = 24 + (i % 2) * (barWidth / 2)
    const y = 88 + Math.floor(i / 2) * 26
    const percent = ((size / topTotal) * 100).toFixed(1)
    return `<circle cx="${x + 5}" cy="${y - 5}" r="5" fill="${color}" /><text x="${x + 16}" y="${y}">${name} <tspan class="value">${percent}%</tspan></text>`
  })
  .join("\n  ")

const languagesSvg = card({
  width,
  height: 80 + Math.ceil(top.length / 2) * 26,
  label: `Most used languages for ${login}`,
  title: "Most used languages",
  body: `<clipPath id="bar"><rect x="24" y="48" width="${barWidth}" height="10" rx="5" /></clipPath>
  <g clip-path="url(#bar)">${segments}</g>
  ${legend}`,
})

await writeFile("metrics.languages.svg", languagesSvg)
console.log(Object.fromEntries(top.map(([name, { size }]) => [name, size])))

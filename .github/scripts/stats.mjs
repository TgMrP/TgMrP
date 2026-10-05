// Renders metrics.stats.svg with all-time totals, including private repositories.
// lowlighter/metrics only counts the last year of activity, so PRs and reviews come out far too low.
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

async function allTimeContributions(createdAt) {
  let total = 0
  for (let year = new Date(createdAt).getUTCFullYear(); year <= new Date().getUTCFullYear(); year++) {
    const { user } = await graphql(
      `query($login: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $login) { contributionsCollection(from: $from, to: $to) {
          contributionCalendar { totalContributions }
        } }
      }`,
      { login, from: `${year}-01-01T00:00:00Z`, to: `${year}-12-31T23:59:59Z` },
    )
    total += user.contributionsCollection.contributionCalendar.totalContributions
  }
  return total
}

const { user } = await graphql(
  `query($login: String!) { user(login: $login) {
    createdAt
    repositories(ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]) { totalCount }
  } }`,
  { login },
)

const stats = [
  ["Contributions (all time)", await allTimeContributions(user.createdAt)],
  ["Commits", await searchCount(`author:${login}`, "commits")],
  ["Pull requests opened", await searchCount(`author:${login} is:pr`)],
  ["Pull requests merged", await searchCount(`author:${login} is:pr is:merged`)],
  ["Pull requests reviewed", await searchCount(`reviewed-by:${login} is:pr -author:${login}`)],
  ["Issues opened", await searchCount(`author:${login} is:issue`)],
  ["Repositories", user.repositories.totalCount],
]

const rowHeight = 30
const width = 480
const height = 48 + stats.length * rowHeight
const rows = stats
  .map(([label, value], i) => {
    const y = 64 + i * rowHeight
    return `<text class="label" x="24" y="${y}">${label}</text><text class="value" x="${width - 24}" y="${y}" text-anchor="end">${value.toLocaleString("en-US")}</text>`
  })
  .join("\n  ")

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="GitHub stats for ${login}">
  <style>
    text { font: 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; fill: #57606a; }
    .title { font-size: 18px; font-weight: 600; fill: #0969da; }
    .value { font-weight: 600; fill: #1f2328; }
    .card { fill: #ffffff; stroke: #d0d7de; }
    @media (prefers-color-scheme: dark) {
      .card { fill: #0d1117; stroke: #30363d; }
      text { fill: #9198a1; }
      .title { fill: #4493f8; }
      .value { fill: #f0f6fc; }
    }
  </style>
  <rect class="card" x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="8" />
  <text class="title" x="24" y="32">GitHub stats</text>
  ${rows}
</svg>
`

await writeFile("metrics.stats.svg", svg)
console.log(Object.fromEntries(stats))

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
const langHeight = 80 + Math.ceil(top.length / 2) * 26

const languagesSvg = svg
  .replace(/height="\d+" viewBox="0 0 (\d+) \d+"/, `height="${langHeight}" viewBox="0 0 $1 ${langHeight}"`)
  .replace(/aria-label="[^"]*"/, `aria-label="Most used languages for ${login}"`)
  .replace(/<rect class="card"[\s\S]*<\/svg>/, `<rect class="card" x="0.5" y="0.5" width="${width - 1}" height="${langHeight - 1}" rx="8" />
  <text class="title" x="24" y="32">Most used languages</text>
  <clipPath id="bar"><rect x="24" y="48" width="${barWidth}" height="10" rx="5" /></clipPath>
  <g clip-path="url(#bar)">${segments}</g>
  ${legend}
</svg>`)

await writeFile("metrics.languages.svg", languagesSvg)
console.log(Object.fromEntries(top.map(([name, { size }]) => [name, size])))

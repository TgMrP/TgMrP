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
const height = 56 + stats.length * rowHeight
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
    @media (prefers-color-scheme: dark) {
      text { fill: #9198a1; }
      .title { fill: #4493f8; }
      .value { fill: #f0f6fc; }
    }
  </style>
  <text class="title" x="24" y="32">GitHub stats</text>
  ${rows}
</svg>
`

await writeFile("metrics.stats.svg", svg)
console.log(Object.fromEntries(stats))

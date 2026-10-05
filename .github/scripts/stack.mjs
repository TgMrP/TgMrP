// Renders metrics.stack.svg: the tech stack as cards of chips with each tool's logo embedded, so the README needs
// no badge URLs (long data-URI logos break behind GitHub's image proxy).
// Logos come from Simple Icons; tools without one get a lettered tile in their brand colour.
import { writeFile } from "node:fs/promises"
import { animate, delay } from "./motion.mjs"

// [name, Simple Icons slug or null, brand colour]. Without a colour the tool takes its Simple Icons colour.
const stack = [
  ["Languages", [
    ["TypeScript", "typescript", "#3178C6"],
    ["JavaScript", "javascript", "#F7DF1E"],
    ["PHP", "php", "#777BB4"],
    ["Python", "python", "#3776AB"],
    ["Rust", "rust", "#000000"],
    ["SQL", "postgresql", "#4169E1"],
    ["HTML5", "html5", "#E34F26"],
    ["CSS", "css", "#663399"],
    ["Bash", "gnubash", "#4EAA25"],
    ["C#", "dotnet", "#512BD4"],
    ["Lua", "lua", "#2C2D72"],
  ]],
  ["Frontend", [
    ["Vue.js", "vuedotjs", "#4FC08D"],
    ["Nuxt", "nuxt", "#00DC82"],
    ["Nuxt UI", "nuxt", "#00DC82"],
    ["Nuxt Content", "nuxt", "#00DC82"],
    ["Pinia", "pinia", "#FFD859"],
    ["Vue Router", "vuedotjs", "#4FC08D"],
    ["VueUse", "vueuse", "#41B883"],
    ["React", "react", "#61DAFB"],
    ["Next.js", "nextdotjs", "#000000"],
    ["Svelte", "svelte", "#FF3E00"],
    ["Astro", "astro", "#BC52EE"],
    ["Alpine.js", "alpinedotjs", "#8BC0D0"],
    ["Tailwind CSS", "tailwindcss", "#06B6D4"],
    ["shadcn/ui", "shadcnui", "#000000"],
    ["Reka UI", null, "#42B883"],
    ["Headless UI", "headlessui"],
    ["Lucide", "lucide"],
    ["Sass", "sass", "#CC6699"],
    ["Bootstrap", "bootstrap", "#7952B3"],
    ["jQuery", "jquery", "#0769AD"],
    ["GSAP", "greensock", "#0AE448"],
    ["Three.js", "threedotjs"],
    ["Lottie", "lottiefiles"],
    ["Swiper", "swiper"],
    ["Chart.js", "chartdotjs", "#FF6384"],
    ["Leaflet", "leaflet", "#199900"],
    ["Vite", "vite", "#646CFF"],
    ["PWA", "pwa", "#5A0FC8"],
  ]],
  ["Backend & CMS", [
    ["Node.js", "nodedotjs", "#5FA04E"],
    ["Express", "express", "#000000"],
    ["Fastify", "fastify", "#000000"],
    ["Socket.io", "socketdotio", "#010101"],
    ["Axios", "axios"],
    ["Better Auth", "betterauth", "#000000"],
    ["BullMQ", null, "#E0234E"],
    ["Nodemailer", null, "#22B573"],
    ["MJML", null, "#F45E43"],
    ["Handlebars", "handlebarsdotjs"],
    ["Sharp", "sharp"],
    ["FFmpeg", "ffmpeg"],
    ["Laravel", "laravel", "#FF2D20"],
    ["Livewire", "livewire", "#FB70A9"],
    ["Inertia", "inertia", "#9553E9"],
    ["Filament", "filament"],
    ["Horizon", "laravelhorizon"],
    ["WordPress", "wordpress", "#21759B"],
    ["WooCommerce", "woocommerce", "#96588A"],
    ["Roots Sage", "roots", "#525DDC"],
    ["ACF", null, "#00D3AE"],
    ["Zod", "zod", "#3E67B1"],
  ]],
  ["Databases & ORMs", [
    ["PostgreSQL", "postgresql", "#4169E1"],
    ["MySQL", "mysql", "#4479A1"],
    ["MongoDB", "mongodb", "#47A248"],
    ["Redis", "redis", "#FF4438"],
    ["Prisma", "prisma", "#2D3748"],
    ["Drizzle", "drizzle", "#C5F74F"],
    ["Mongoose", "mongoose", "#880000"],
    ["Upstash", "upstash", "#00E9A3"],
  ]],
  ["Testing & quality", [
    ["Vitest", "vitest", "#6E9F18"],
    ["Jest", "jest", "#C21325"],
    ["Playwright", "playwright", "#2EAD33"],
    ["Puppeteer", "puppeteer", "#40B5A4"],
    ["Pest", null, "#F28D1A"],
    ["PHPStan", null, "#1E3A8A"],
    ["Larastan", null, "#FF2D20"],
    ["Rector", null, "#2A6DB0"],
    ["ESLint", "eslint", "#4B32C3"],
    ["Prettier", "prettier", "#F7B93E"],
    ["Husky", null, "#6E5494"],
  ]],
  ["AI & automation", [
    ["Claude", "claude", "#D97757"],
    ["Claude Code", "claude", "#D97757"],
    ["Anthropic", "anthropic", "#191919"],
    ["OpenAI", "openai", "#412991"],
    ["Gemini", "googlegemini", "#8E75B2"],
    ["MCP", "modelcontextprotocol", "#000000"],
    ["Cursor", "cursor", "#000000"],
    ["GitHub Copilot", "githubcopilot"],
    ["Ollama", "ollama"],
    ["Hugging Face", "huggingface"],
    ["LangChain", "langchain"],
    ["Firecrawl", null, "#FF4500"],
    ["n8n", "n8n", "#EA4B71"],
    ["Remotion", null, "#0B84F3"],
    ["Pandas", "pandas", "#150458"],
    ["NumPy", "numpy", "#013243"],
  ]],
  ["Integrations & payments", [
    ["Stripe", "stripe", "#635BFF"],
    ["PayPlus", null, "#0066FF"],
    ["Cardcom", null, "#1E4D9B"],
    ["Tranzila", null, "#E2231A"],
    ["Green Invoice", null, "#2EB872"],
    ["Shopify", "shopify", "#7AB55C"],
    ["Twilio", "twilio", "#F22F46"],
    ["Telegram", "telegram", "#26A5E4"],
    ["WhatsApp", "whatsapp", "#25D366"],
    ["Slack", "slack"],
    ["Monday.com", null, "#FF3D57"],
    ["Resend", "resend", "#000000"],
    ["Google Maps", "googlemaps", "#4285F4"],
    ["Google Cloud", "googlecloud", "#4285F4"],
    ["Pusher", "pusher", "#300D4F"],
  ]],
  ["Hosting & infrastructure", [
    ["Docker", "docker", "#2496ED"],
    ["Coolify", "coolify", "#6B16ED"],
    ["RunCloud", null, "#2F6CF6"],
    ["AWS", "amazonwebservices", "#232F3E"],
    ["Cloudflare", "cloudflare", "#F38020"],
    ["Vercel", "vercel", "#000000"],
    ["Hetzner", "hetzner"],
    ["DigitalOcean", "digitalocean"],
    ["Cloudways", "cloudways"],
    ["cPanel", "cpanel"],
    ["Plesk", "plesk"],
    ["Nginx", "nginx"],
    ["Ubuntu", "ubuntu"],
    ["Linux", "linux", "#FCC624"],
    ["Portainer", "portainer"],
    ["PM2", "pm2"],
    ["Let's Encrypt", "letsencrypt"],
    ["Tailscale", "tailscale"],
    ["UniFi", "ubiquiti"],
  ]],
  ["Monitoring & analytics", [
    ["Sentry", "sentry", "#362D59"],
    ["GlitchTip", null, "#E5484D"],
    ["Grafana", "grafana"],
    ["Uptime Kuma", "uptimekuma"],
    ["Google Analytics", "googleanalytics"],
    ["Tag Manager", "googletagmanager"],
  ]],
  ["Tools & workflow", [
    ["Git", "git", "#F05032"],
    ["GitHub Actions", "githubactions", "#2088FF"],
    ["pnpm", "pnpm"],
    ["Turborepo", "turborepo"],
    ["Webpack", "webpack", "#8DD6F9"],
    ["esbuild", "esbuild", "#FFCF00"],
    ["Electron", "electron"],
    ["Figma", "figma", "#F24E1E"],
    ["Postman", "postman", "#FF6C37"],
    ["Insomnia", "insomnia"],
    ["Bruno", "bruno"],
    ["PhpStorm", "phpstorm"],
    ["WebStorm", "webstorm"],
    ["Neovim", "neovim"],
    ["Notion", "notion"],
    ["ClickUp", "clickup"],
    ["Jira", "jira"],
    ["Linear", "linear"],
    ["Obsidian", "obsidian"],
  ]],
]

// Simple Icons' own slug rule, to look up brand colours by slug.
const simpleIconsSlug = (title) =>
  title.replace(/\+/g, "plus").replace(/\./g, "dot").replace(/&/g, "and").normalize("NFD").toLowerCase().replace(/[^a-z0-9]/g, "")
const brandColors = new Map(
  (await (await fetch("https://cdn.jsdelivr.net/npm/simple-icons@latest/data/simple-icons.json")).json()).map((icon) => [
    icon.slug ?? simpleIconsSlug(icon.title),
    `#${icon.hex}`,
  ]),
)
for (const [, tools] of stack) {
  for (const tool of tools) tool[2] ??= brandColors.get(tool[1]) ?? "#8b949e"
}

async function iconPath(slug) {
  if (!slug) return null
  for (const version of ["latest", "9"]) {
    const res = await fetch(`https://cdn.jsdelivr.net/npm/simple-icons@${version}/icons/${slug}.svg`)
    if (res.ok) return (await res.text()).match(/ d="([^"]+)"/)[1]
  }
  console.warn(`No Simple Icons logo for ${slug}`)
  return null
}
const paths = new Map(
  await Promise.all([...new Set(stack.flatMap(([, tools]) => tools.map(([, slug]) => slug)))].map(async (slug) => [slug, await iconPath(slug)])),
)

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const textWidth = (text) => [...text].reduce((sum, char) => sum + (/[A-Z]/.test(char) ? 8.6 : /[ijl.,]/.test(char) ? 3.6 : char === " " ? 3.8 : 6.9), 0)

const width = 960
const gap = 16
const columnWidth = (width - gap) / 2
const chipHeight = 30
const chipGap = 8
const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;")

function chip([name, slug, color], x, y, at) {
  const path = paths.get(slug)
  // Near-black logos follow the text colour everywhere; dark ones only on the dark theme, pale ones only on the light.
  const l = luminance(color)
  const fill = l < 0.12 ? `class="mono"` : l < 0.32 ? `class="on-light" style="--brand: ${color}"` : l > 0.88 ? `class="on-dark" style="--brand: ${color}"` : `fill="${color}"`
  const icon = path
    ? `<svg x="10" y="7" width="16" height="16" viewBox="0 0 24 24"><path ${fill} d="${path}" /></svg>`
    : `<rect x="10" y="7" width="16" height="16" rx="4" fill="${color}" /><text class="initials" x="18" y="19" text-anchor="middle">${escape(name.replace(/[^A-Z]/g, "").slice(0, 2) || name[0].toUpperCase())}</text>`
  const w = 34 + textWidth(name) + 12
  return {
    w,
    svg: `<g transform="translate(${x.toFixed(1)} ${y})"><g class="pop" ${delay(at)}><rect class="chip" x="0.5" y="0.5" width="${(w - 1).toFixed(1)}" height="${chipHeight - 1}" rx="7" />${icon}<text x="34" y="20">${escape(name)}</text></g></g>`,
  }
}

// Lay the chips of each category out in rows.
const categories = stack.map(([title, tools], order) => {
  const at = 0.1 + order * 0.08
  let x = 24
  let y = 48
  const chips = tools.map((tool, i) => {
    const { w } = chip(tool, 0, 0, 0)
    if (x + w > columnWidth - 24) {
      x = 24
      y += chipHeight + chipGap
    }
    const placed = chip(tool, x, y, at + 0.2 + i * 0.03)
    x += w + chipGap
    return placed.svg
  })
  return { title, chips, height: y + chipHeight + 22, at }
})

// Split the categories over two columns, keeping their order, so the taller column is as short as possible.
let best
// Even masks only: the first category always opens the left column.
for (let mask = 0; mask < 2 ** categories.length; mask += 2) {
  const heights = [0, 0]
  categories.forEach(({ height }, i) => (heights[(mask >> i) & 1] += height + gap))
  if (!best || Math.max(...heights) < best.tallest) best = { mask, tallest: Math.max(...heights) }
}
const columns = [{ y: 0, cards: [] }, { y: 0, cards: [] }]
categories.forEach((category, i) => {
  const column = columns[(best.mask >> i) & 1]
  column.cards.push({ ...category, y: column.y })
  column.y += category.height + gap
})
const height = best.tallest - gap

const cards = columns
  .flatMap(({ cards }, c) =>
    cards.map(
      ({ title, chips, height, at, y }) => `<g transform="translate(${c * (columnWidth + gap)} ${y})"><g class="rise" ${delay(at)}>
    <rect class="card" x="0.5" y="0.5" width="${columnWidth - 1}" height="${height - 1}" rx="8" />
    <text class="title" x="24" y="32">${escape(title)}</text>
    ${chips.join("\n    ")}
  </g></g>`,
    ),
  )
  .join("\n  ")

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Tech stack: ${escape(stack.flatMap(([, tools]) => tools.map(([name]) => name)).join(", "))}">
  <style>
    text { font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; fill: #1f2328; }
    .title { font-size: 18px; font-weight: 600; fill: #0969da; }
    .initials { font-size: 8px; font-weight: 700; fill: #ffffff; }
    .card { fill: #ffffff; stroke: #d0d7de; }
    .chip { fill: #f6f8fa; stroke: #d0d7de; }
    .mono, .on-dark { fill: #1f2328; }
    .on-light { fill: var(--brand); }
    @media (prefers-color-scheme: dark) {
      text { fill: #e6edf3; }
      .title { fill: #4493f8; }
      .initials { fill: #ffffff; }
      .card { fill: #0d1117; stroke: #30363d; }
      .chip { fill: #161b22; stroke: #30363d; }
      .mono, .on-light { fill: #f0f6fc; }
      .on-dark { fill: var(--brand); }
    }
    .rise, .pop { transform-box: fill-box; }
    .rise { ${animate("rise", "default")} }
    .pop { transform-origin: center; ${animate("pop", "snappy")} }
    @keyframes rise { from { transform: translateY(16px); opacity: 0; } }
    @keyframes pop { from { transform: scale(0.6); opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
  </style>
  ${cards}
</svg>
`

await writeFile("metrics.stack.svg", svg)
console.log(`${stack.flatMap(([, tools]) => tools).length} tools, ${height}px`)

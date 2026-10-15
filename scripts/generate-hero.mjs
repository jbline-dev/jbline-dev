// Generates hero.svg: the jb.line mark always unfolds into the real wings logo;
// recent GitHub activity sets how hard it snaps open (overshoot, trails, impact pulse).
// Run locally:  COMMITS=31 node scripts/generate-hero.mjs
// In CI:        GH_TOKEN is provided by the workflow and activity is fetched live.
import { writeFileSync } from "node:fs"

const LOGIN = process.env.LOGIN || process.env.GITHUB_REPOSITORY_OWNER || "jbline-dev"
const WINDOW_DAYS = 14 // how far back "recent" reaches
const SATURATE = 40 // contributions in the window that fully open the wings
const FLOOR = 0.15 // wings never look dead, even in a quiet fortnight
const OUT = process.env.OUT || "hero.svg"

// ---- logo geometry (from logo-mark.tsx) ------------------------------------------------
const CLOSED = [[981, 653], [826, 812], [828, 1153], [782, 1171], [781, 860], [630, 1017], [631, 1349], [981, 1211]]
const [CX, CY] = [762.918, 1061.76]
const TURN = -68.681
const AXIS2 = 1999
const LIMIT = 985
const PATH = "M" + CLOSED.map((p) => p.join(" ")).join(" L") + " Z"
const rot = ([x, y], deg) => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  return [(x - CX) * c - (y - CY) * s + CX, (x - CX) * s + (y - CY) * c + CY]
}
const delta = (deg) => Math.max(0, Math.max(...CLOSED.map((p) => rot(p, deg)[0])) - LIMIT)

// ---- activity -> openness --------------------------------------------------------------
async function getContributions() {
  if (process.env.COMMITS) return Number(process.env.COMMITS)
  const token = process.env.GH_TOKEN
  if (!token) { console.warn("No GH_TOKEN or COMMITS set; using 0"); return 0 }
  const to = new Date(), from = new Date(to.getTime() - WINDOW_DAYS * 864e5)
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){contributionsCollection(from:$from,to:$to){contributionCalendar{totalContributions}}}}`,
      variables: { login: LOGIN, from: from.toISOString(), to: to.toISOString() },
    }),
  })
  const json = await res.json()
  const n = json?.data?.user?.contributionsCollection?.contributionCalendar?.totalContributions
  if (typeof n !== "number") throw new Error("GraphQL failed: " + JSON.stringify(json).slice(0, 300))
  return n
}

const count = await getContributions()
const open = Math.min(1, Math.max(FLOOR, count / SATURATE))
const pct = Math.round(open * 100)

// ---- choreography (same beats as LogoMorph; activity only changes the snap's energy) ------
const T = { hold: 950, antEnd: 1200, swingEnd: 1750, settleEnd: 2100 }
const END = TURN, ANT = 6, OVER = END - (2 + 7 * open) // always lands on the true wings
const clamp = (u) => Math.min(1, Math.max(0, u))
const eo = (u) => 1 - (1 - u) ** 3
const es = (u) => -(Math.cos(Math.PI * u) - 1) / 2
const theta = (ms) =>
  ms < T.hold ? 0
  : ms < T.antEnd ? ANT * es((ms - T.hold) / (T.antEnd - T.hold))
  : ms < T.swingEnd ? ANT + (OVER - ANT) * eo((ms - T.antEnd) / (T.swingEnd - T.antEnd))
  : ms < T.settleEnd ? OVER + (END - OVER) * es((ms - T.swingEnd) / (T.settleEnd - T.swingEnd))
  : END

const CYCLE = 6000, FADE = 5400, STEP = 40
const times = []; for (let t = 0; t <= CYCLE; t += STEP) times.push(t)
const kt = times.map((t) => (t / CYCLE).toFixed(4)).join(";")
const fade = (ms) => 1 - clamp((ms - FADE) / (CYCLE - FADE))
const SIZE = 340, SW = (1.5 * 1400) / SIZE
const A = (attr, vals, extra = "") =>
  `<animate${extra} attributeName="${attr}" dur="${CYCLE}ms" repeatCount="indefinite" calcMode="linear" keyTimes="${kt}" values="${vals.join(";")}"/>`
const AT = (type, vals) =>
  `<animateTransform attributeName="transform" type="${type}" additive="sum" dur="${CYCLE}ms" repeatCount="indefinite" calcMode="linear" keyTimes="${kt}" values="${vals.join(";")}"/>`

const layers = [[90, 0.07], [45, 0.2], [0, 1]].map(([lag, alpha]) => {
  const main = lag === 0
  const Lt = [], Lr = [], Rt = [], Rr = [], op = []
  for (const ms of times) {
    const th = theta(ms - lag), dl = delta(th), vis = Math.min(1, Math.abs(theta(ms) - th) / 3)
    Lt.push(`${(-dl).toFixed(2)} 0`); Lr.push(`${th.toFixed(3)} ${CX} ${CY}`)
    Rt.push(`${dl.toFixed(2)} 0`); Rr.push(`${(-th).toFixed(3)} ${(AXIS2 - CX).toFixed(3)} ${CY}`)
    op.push((main ? fade(ms) : alpha * (0.4 + 0.6 * open) * vis * fade(ms)).toFixed(3))
  }
  const path = (k) => {
    if (!main) return `<path d="${PATH}" stroke-width="${(SW * 0.85).toFixed(2)}"/>`
    const d = times.map((ms) => (1 - eo(clamp((ms - (k ? 140 : 0) ) / 800))).toFixed(3))
    const sw = times.map((ms) => (SW * (ms >= T.swingEnd && ms < 2700 ? 1 + (0.4 + 1.6 * open) * Math.exp(-(ms - T.swingEnd) / 110) : 1)).toFixed(2))
    return `<path d="${PATH}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" stroke-width="${SW.toFixed(2)}">${A("stroke-dashoffset", d)}${A("stroke-width", sw)}</path>`
  }
  return `<g opacity="${main ? 1 : 0}">${A("opacity", op)}<g>${AT("translate", Lt)}${AT("rotate", Lr)}${path(0)}</g><g>${AT("translate", Rt)}${AT("rotate", Rr)}<g transform="matrix(-1 0 0 1 ${AXIS2} 0)">${path(1)}</g></g></g>`
}).join("")

const today = new Date().toISOString().slice(0, 10)
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="400" viewBox="0 0 900 400" role="img" aria-label="jb.line wings unfolding, snap energy ${pct}%. John Robert Gaufo, developer and designer.">
<style>
:root{--fg:#0d1117;--mut:#57606a;--acc:#0969da;--bg:#ffffff;--rule:#d0d7de}
@media (prefers-color-scheme:dark){:root{--fg:#f0f6fc;--mut:#8b949e;--acc:#58a6ff;--bg:#0d1117;--rule:#30363d}}
.bg{fill:var(--bg)} .rule{stroke:var(--rule);stroke-width:1}
.h{font:700 46px ui-sans-serif,system-ui,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;fill:var(--fg);letter-spacing:-1.5px}
.t{font:400 16px ui-sans-serif,system-ui,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;fill:var(--mut)}
.m{font:500 13px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;fill:var(--mut)}
.a{fill:var(--acc)}
.bar{fill:var(--fg)} .track{fill:var(--rule)}
</style>
<rect class="bg" width="900" height="400" rx="14"/>
<svg x="30" y="30" width="${SIZE}" height="${SIZE}" viewBox="300 300 1400 1400" fill="none" stroke="var(--fg)" stroke-linejoin="miter" stroke-miterlimit="10">${layers}</svg>
<line class="rule" x1="405" y1="50" x2="405" y2="350"/>
<text class="m a" x="440" y="88">jb.line</text>
<text class="h" x="438" y="170">Interfaces that</text>
<text class="h" x="438" y="222">feel intentional.</text>
<text class="t" x="440" y="262">John Robert Gaufo. Developer and designer, Philippines.</text>
<text class="m" x="440" y="318">snap energy ${pct}%</text>
<rect class="track" x="440" y="328" width="220" height="3" rx="1.5"/>
<rect class="bar" x="440" y="328" width="${(220 * open).toFixed(1)}" height="3" rx="1.5"/>
<text class="m" x="440" y="352">${count} contributions in the last ${WINDOW_DAYS} days · redrawn daily · ${today}</text>
</svg>`
writeFileSync(OUT, svg)
console.log(`${LOGIN}: ${count} contributions -> snap energy ${pct}% -> ${OUT} (${(svg.length / 1024).toFixed(0)} KB)`)

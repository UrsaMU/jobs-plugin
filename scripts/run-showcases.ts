// Reads every JSON file in showcases/ and prints a formatted walkthrough.
// Usage: deno task showcase

interface ShowcaseStep {
  actor: string;
  input?: string;
  method?: string;
  path?: string;
  body?: unknown;
  expect?: string;
  expect_status?: number;
  expect_body?: unknown;
  note?: string;
}

interface Showcase {
  name: string;
  description: string;
  actors?: Record<string, { name: string; flags: string[] }>;
  steps: ShowcaseStep[];
}

const RESET = "\x1b[0m";
const BOLD  = "\x1b[1m";
const CYAN  = "\x1b[36m";
const GREEN = "\x1b[32m";
const GRAY  = "\x1b[90m";
const YELLOW = "\x1b[33m";

function label(actor: string, actors?: Showcase["actors"]): string {
  const name = actors?.[actor]?.name ?? actor;
  const flags = actors?.[actor]?.flags ?? [];
  const role = flags.includes("superuser") ? "superuser"
    : flags.includes("admin") || flags.includes("wizard") ? "staff"
    : "player";
  return `${CYAN}[${name} / ${role}]${RESET}`;
}

const dir = new URL("../showcases", import.meta.url).pathname;
const files = [...Deno.readDirSync(dir)]
  .filter((e) => e.isFile && e.name.endsWith(".json"))
  .map((e) => e.name)
  .sort();

let totalSteps = 0;

for (const file of files) {
  const raw = Deno.readTextFileSync(`${dir}/${file}`);
  const showcase: Showcase = JSON.parse(raw);

  console.log(`\n${BOLD}${showcase.name}${RESET}`);
  console.log(`${GRAY}${showcase.description}${RESET}`);
  console.log("─".repeat(70));

  for (const [i, step] of showcase.steps.entries()) {
    const who = label(step.actor, showcase.actors);
    if (step.input) {
      console.log(`  ${GRAY}${i + 1}.${RESET} ${who} ${GREEN}${step.input}${RESET}`);
    } else if (step.method && step.path) {
      const body = step.body ? `  ${GRAY}body: ${JSON.stringify(step.body)}${RESET}` : "";
      console.log(`  ${GRAY}${i + 1}.${RESET} ${who} ${GREEN}${step.method} ${step.path}${RESET}${body}`);
    }
    if (step.expect)        console.log(`     ${YELLOW}→ ${step.expect}${RESET}`);
    if (step.expect_status) console.log(`     ${YELLOW}→ HTTP ${step.expect_status}${RESET}`);
    if (step.note)          console.log(`     ${GRAY}  ${step.note}${RESET}`);
    totalSteps++;
  }

  console.log(`${GRAY}${"─".repeat(70)}${RESET}`);
}

console.log(`\n${BOLD}${files.length} showcases, ${totalSteps} steps.${RESET}\n`);

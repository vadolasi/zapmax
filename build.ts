import { $ } from "bun";

await $`bun run --bun build:tsc`.cwd("node_modules/baileys").nothrow();
await $`cp -r src/* lib/`.cwd("node_modules/baileys");

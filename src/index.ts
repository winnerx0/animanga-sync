#!/usr/bin/env bun
import { Command } from 'commander';
import { loginCommand } from './commands/login.ts';
import { syncCommand } from './commands/sync.ts';
import { resolveCommand } from './commands/resolve.ts';
import { importCommand } from './commands/import.ts';
import { statusCommand } from './commands/status.ts';
import type { MediaKind, Status } from './providers/types.ts';

const program = new Command();

program
  .name('animanga-sync')
  .description('Sync anime/manga lists across AniList, MAL, and other providers')
  .version('0.1.0');

program
  .command('login')
  .argument('<provider>', 'provider name (anilist | mal)')
  .description('Run OAuth flow and persist token')
  .action(async (provider: string) => {
    await loginCommand(provider);
  });

program
  .command('status')
  .description('Show auth state and pending match counts')
  .action(async () => {
    await statusCommand();
  });

program
  .command('sync')
  .description('Walk lists row-by-row and sync the lagging side to the more current state')
  .option('--kind <kind>', 'anime | manga | all', 'all')
  .option('--dry-run', 'show planned updates without applying', false)
  .option('--provider-a <name>', 'first provider', 'anilist')
  .option('--provider-b <name>', 'second provider', 'mal')
  .action(async (opts: { kind: 'anime' | 'manga' | 'all'; dryRun: boolean; providerA: string; providerB: string }) => {
    await syncCommand(opts);
  });

program
  .command('resolve')
  .description('Interactively resolve pending matches in match.json')
  .action(async () => {
    await resolveCommand();
  });

program
  .command('import')
  .argument('<file>', 'path to newline-delimited title list')
  .option('--kind <kind>', 'anime | manga', 'anime')
  .option('--target <providers>', 'comma-separated list of providers', 'anilist,mal')
  .option('--status <status>', 'list status to assign (planning | current | completed | paused | dropped | repeating)', 'planning')
  .action(async (file: string, opts: { kind: MediaKind; target: string; status: Status }) => {
    await importCommand({
      file,
      kind: opts.kind,
      targets: opts.target.split(',').map((s) => s.trim()).filter(Boolean),
      status: opts.status,
    });
  });

program.parseAsync(process.argv);

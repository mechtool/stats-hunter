#!/usr/bin/env node
/**
 * Переименовывает шаблон app-template под новое приложение.
 *
 * Использование:
 *   node tools/rename.mjs "My App"                          # dry-run
 *   node tools/rename.mjs "My App" --slug my-app --prefix my --apply
 *
 * Параметры:
 *   --name "My App"      отображаемое имя (можно передать позиционно)
 *   --slug my-app        kebab-case идентификатор (по умолчанию выводится из имени)
 *   --prefix my          Angular-селекторный префикс (по умолчанию "app")
 *   --domain example.com заменить example.com в конфигах/nginx
 *   --auth-host auth.example.com  заменить auth.example.com
 *   --apply              применить изменения (без него — только показать)
 *
 * Заменяемые токены (по всему репозиторию, кроме node_modules/.git/dist/.nx):
 *   "App Template"  -> имя
 *   "AppTemplate"   -> PascalCase(имя)
 *   "app-template"  -> slug
 *   "app_template"  -> snake_case(slug)
 *   "app-root"/"app-home"/... и "prefix": "app" -> выбранный префикс
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', '.nx', '.idea', '.angular', '.codewhale', 'coverage',
]);

function parseArgs(argv) {
  const args = { name: null, slug: null, prefix: 'app', apply: false, domain: null, authHost: null };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--slug') args.slug = argv[++i];
    else if (a === '--prefix') args.prefix = argv[++i];
    else if (a === '--domain') args.domain = argv[++i];
    else if (a === '--auth-host') args.authHost = argv[++i];
    else if (a === '--name') args.name = argv[++i];
    else if (!a.startsWith('--')) positional.push(a);
  }
  if (!args.name && positional.length) args.name = positional.join(' ');
  return args;
}

const kebab = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const snake = (s) => kebab(s).replace(/-/g, '_');
const pascal = (s) =>
  s.split(/[^a-zA-Z0-9]+/).filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1)).join('');
const initials = (s) =>
  s.split(/[^a-zA-Z0-9]+/).filter(Boolean)
    .map((w) => w[0].toUpperCase()).slice(0, 2).join('');

function buildRules(args) {
  const name = args.name;
  const slug = args.slug || kebab(name);
  const prefix = args.prefix || 'app';

  const rules = [
    ['App Template', name],
    ['AppTemplate', pascal(name)],
    ['>AT</div>', `>${initials(name)}</div>`],
    ['app-template', slug],
    ['app_template', snake(slug)],
    ['app-root', `${prefix}-root`],
    ['app-home', `${prefix}-home`],
    ['app-login', `${prefix}-login`],
    ['app-register', `${prefix}-register`],
    ['app-check-email', `${prefix}-check-email`],
    ['app-forgot-password', `${prefix}-forgot-password`],
    ['app-reset-password', `${prefix}-reset-password`],
    ['app-verify-email', `${prefix}-verify-email`],
    ['"prefix": "app"', `"prefix": "${prefix}"`],
  ];

  const authHost = args.authHost || (args.domain ? `auth.${args.domain}` : null);
  if (authHost) rules.push(['auth.example.com', authHost]);
  if (args.domain) rules.push(['example.com', args.domain]);

  return rules;
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function isBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i += 1) if (buf[i] === 0) return true;
  return false;
}

const args = parseArgs(process.argv.slice(2));
if (!args.name) {
  console.error('Укажите имя приложения: node tools/rename.mjs "My App"');
  process.exit(1);
}

const rules = buildRules(args);
const files = walk(ROOT).filter((f) => f !== SELF);

let changed = 0;
for (const file of files) {
  const buf = readFileSync(file);
  if (isBinary(buf)) continue;
  let text = buf.toString('utf8');
  const before = text;
  for (const [from, to] of rules) text = text.split(from).join(to);
  if (text === before) continue;
  changed += 1;
  const rel = relative(ROOT, file);
  if (args.apply) writeFileSync(file, text, 'utf8');
  console.log(`${args.apply ? 'UPDATED' : 'WOULD UPDATE'} ${rel}`);
}

console.log(
  `\n${args.apply ? 'Изменено' : 'Будет изменено'} файлов: ${changed}` +
  `${args.apply ? '' : ' (dry-run; добавьте --apply для применения)'}`,
);

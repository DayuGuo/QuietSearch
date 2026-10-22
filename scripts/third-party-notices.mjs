import { readFileSync, writeFileSync } from 'node:fs';

const licenses = [
  ['React', 'node_modules/react/LICENSE'],
  ['React DOM', 'node_modules/react-dom/LICENSE'],
  ['Lucide React (including Feather attribution)', 'node_modules/lucide-react/LICENSE'],
  ['jose', 'node_modules/jose/LICENSE.md'],
  ['React scheduler', 'node_modules/scheduler/LICENSE'],
];
const notice =
  '# Third-party notices\n\nRuntime dependency notices from the installed, locked packages. Build/test dependencies retain their licenses in their packages. No Kagi or DeepSeek brand assets are distributed.\n\n';
writeFileSync(
  'THIRD_PARTY_NOTICES.md',
  notice +
    licenses
      .map(([name, path]) => `## ${name}\n\n${readFileSync(path, 'utf8').trim()}\n`)
      .join('\n'),
);

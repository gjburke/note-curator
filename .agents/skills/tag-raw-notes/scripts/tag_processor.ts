import * as fs from 'fs';
import * as path from 'path';

interface Frontmatter {
  [key: string]: any;
}

interface Tag {
  name: string;
  description: string;
  reasoning: string;
}

interface Payload {
  file_updates?: { [path: string]: string[] };
  new_tags?: Tag[];
}

function parseFrontmatter(content: string): { data: Frontmatter; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { data: {}, body: content };
  }

  const yamlText = match[1];
  const body = match[2];

  const data: Frontmatter = {};
  const lines = yamlText.split(/\r?\n/);
  let currentKey: string | null = null;
  let currentList: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if line is a list item
    if (trimmed.startsWith('-') && currentKey) {
      const item = trimmed.substring(1).trim().replace(/^["']|["']$/g, '');
      currentList.push(item);
      data[currentKey] = currentList;
      continue;
    }

    // Check if line is a key-value pair
    const kvMatch = trimmed.match(/^([^:]+):\s*(.*)$/);
    if (kvMatch) {
      currentKey = kvMatch[1].trim();
      const val = kvMatch[2].trim();
      if (val.startsWith('[') && val.endsWith(']')) {
        const items = val
          .substring(1, val.length - 1)
          .split(',')
          .map(x => x.trim().replace(/^["']|["']$/g, ''))
          .filter(x => x);
        data[currentKey] = items;
        currentKey = null;
      } else if (!val) {
        currentList = [];
        data[currentKey] = currentList;
      } else {
        data[currentKey] = val.replace(/^["']|["']$/g, '');
        currentKey = null;
      }
    }
  }

  return { data, body };
}

function dumpFrontmatter(data: Frontmatter, body: string): string {
  const lines = ['---'];
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) {
      if (v.length === 0) {
        lines.push(`${k}: []`);
      } else {
        lines.push(`${k}:`);
        for (const item of v) {
          lines.push(`  - ${item}`);
        }
      }
    } else {
      lines.push(`${k}: "${v}"`);
    }
  }
  lines.push('---');
  return lines.join('\n') + '\n' + body;
}

function loadTagsYaml(filePath: string): Tag[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const tags: Tag[] = [];
  let currentTag: Partial<Tag> | null = null;
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const stripped = line.trim();
    if (!stripped || stripped.startsWith('#') || stripped === 'tags:') {
      continue;
    }
    if (stripped.startsWith('- name:')) {
      if (currentTag && currentTag.name) {
        tags.push(currentTag as Tag);
      }
      const name = stripped.substring(7).trim().replace(/^["']|["']$/g, '');
      currentTag = { name, description: '', reasoning: '' };
    } else if (stripped.startsWith('name:')) {
      if (currentTag && currentTag.name) {
        tags.push(currentTag as Tag);
      }
      const name = stripped.substring(5).trim().replace(/^["']|["']$/g, '');
      currentTag = { name, description: '', reasoning: '' };
    } else if (currentTag) {
      if (stripped.startsWith('description:')) {
        currentTag.description = stripped.substring(12).trim().replace(/^["']|["']$/g, '');
      } else if (stripped.startsWith('reasoning:')) {
        currentTag.reasoning = stripped.substring(10).trim().replace(/^["']|["']$/g, '');
      }
    }
  }
  if (currentTag && currentTag.name) {
    tags.push(currentTag as Tag);
  }
  return tags;
}

function dumpTagsYaml(tags: Tag[], filePath: string): void {
  const lines = ['tags:'];
  for (const tag of tags) {
    lines.push(`  - name: ${tag.name}`);
    lines.push(`    description: "${tag.description || ''}"`);
    lines.push(`    reasoning: "${tag.reasoning || ''}"`);
  }
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
}

function getWorkspaceRoot(): string {
  return process.cwd();
}

function runAnalyze(rawDir: string, tagsPath: string): void {
  if (!fs.existsSync(rawDir)) {
    console.log(JSON.stringify({ error: `Raw directory '${rawDir}' does not exist.`, untagged_notes: [] }));
    return;
  }

  const untaggedNotes: any[] = [];
  const files = fs.readdirSync(rawDir);

  for (const filename of files) {
    if (!filename.endsWith('.md')) {
      continue;
    }
    const filePath = path.join(rawDir, filename);
    const content = fs.readFileSync(filePath, 'utf-8');
    const { data } = parseFrontmatter(content);

    // Consider file untagged if "tags" key is missing or empty
    if (!data.tags || !Array.isArray(data.tags) || data.tags.length === 0) {
      untaggedNotes.push({
        path: path.relative(getWorkspaceRoot(), filePath).replace(/\\/g, '/'),
        content: content,
        user_tags: data.user_tags || []
      });
    }
  }

  console.log(JSON.stringify({ untagged_notes: untaggedNotes }, null, 2));
}

function runApply(payloadData: string, rawDir: string, tagsPath: string): void {
  let payload: Payload;
  if (fs.existsSync(payloadData)) {
    payload = JSON.parse(fs.readFileSync(payloadData, 'utf-8'));
  } else {
    payload = JSON.parse(payloadData);
  }

  const fileUpdates = payload.file_updates || {};
  const newTags = payload.new_tags || [];

  // 1. Update tags.yaml
  if (newTags.length > 0) {
    const existingTags = loadTagsYaml(tagsPath);
    const existingNames = new Set(existingTags.map(t => t.name));
    let updated = false;

    for (const nt of newTags) {
      if (!existingNames.has(nt.name)) {
        existingTags.push(nt);
        existingNames.add(nt.name);
        updated = true;
      }
    }

    if (updated) {
      dumpTagsYaml(existingTags, tagsPath);
    }
  }

  // 2. Update each note's frontmatter
  const workspaceRoot = getWorkspaceRoot();
  for (const [relPath, tags] of Object.entries(fileUpdates)) {
    const absPath = path.join(workspaceRoot, relPath);
    if (!fs.existsSync(absPath)) {
      console.error(`Warning: File ${relPath} not found.`);
      continue;
    }

    const content = fs.readFileSync(absPath, 'utf-8');
    const { data, body } = parseFrontmatter(content);
    data.tags = tags;

    const updatedContent = dumpFrontmatter(data, body);
    fs.writeFileSync(absPath, updatedContent, 'utf-8');
  }

  console.log(JSON.stringify({ status: 'success', updated_files: Object.keys(fileUpdates) }));
}

function main(): void {
  const args = process.argv.slice(2);
  const analyze = args.includes('--analyze');
  const applyIndex = args.indexOf('--apply');
  const applyValue = applyIndex !== -1 ? args[applyIndex + 1] : null;

  const rawDirIndex = args.indexOf('--raw-dir');
  const rawDirParam = rawDirIndex !== -1 ? args[rawDirIndex + 1] : 'raw';

  const tagsFileIndex = args.indexOf('--tags-file');
  const tagsFileParam = tagsFileIndex !== -1 ? args[tagsFileIndex + 1] : 'tags.yaml';

  const workspaceRoot = getWorkspaceRoot();
  const rawDir = path.resolve(workspaceRoot, rawDirParam);
  const tagsPath = path.resolve(workspaceRoot, tagsFileParam);

  if (analyze) {
    runAnalyze(rawDir, tagsPath);
  } else if (applyValue !== null) {
    runApply(applyValue, rawDir, tagsPath);
  } else {
    console.log('Usage: npx tsx <script> --analyze | --apply <payload> [--raw-dir <dir>] [--tags-file <file>]');
  }
}

main();

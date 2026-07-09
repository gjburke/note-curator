import * as fs from 'fs';
import * as path from 'path';

interface Tag {
  name: string;
  description: string;
  reasoning: string;
}

interface TagUpdate {
  name: string;
  description?: string;
  reasoning?: string;
  delete?: boolean;
}

interface UpdatePayload {
  tag_updates?: TagUpdate[];
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

function main(): void {
  const args = process.argv.slice(2);
  const updateIndex = args.indexOf('--update-tags');
  const updateValue = updateIndex !== -1 ? args[updateIndex + 1] : null;

  const tagsFileIndex = args.indexOf('--tags-file');
  const tagsFileParam = tagsFileIndex !== -1 ? args[tagsFileIndex + 1] : 'tags.yaml';

  if (!updateValue) {
    console.error('Usage: npx tsx <script> --update-tags <payload_or_file> [--tags-file <file>]');
    process.exit(1);
  }

  const workspaceRoot = process.cwd();
  const tagsPath = path.resolve(workspaceRoot, tagsFileParam);

  let payload: UpdatePayload;
  let isFilePath = false;

  if (fs.existsSync(updateValue)) {
    try {
      payload = JSON.parse(fs.readFileSync(updateValue, 'utf-8'));
      isFilePath = true;
    } catch (e) {
      console.error(`Error: Failed to parse file '${updateValue}' as JSON.`);
      process.exit(1);
    }
  } else {
    try {
      payload = JSON.parse(updateValue);
    } catch (e) {
      console.error('Error: Invalid JSON payload or file not found.');
      process.exit(1);
    }
  }

  // Delete the JSON file if it exists to keep the repository clean
  if (isFilePath) {
    try {
      fs.unlinkSync(updateValue);
    } catch (e) {
      console.warn(`Warning: Could not delete temporary file '${updateValue}':`, e);
    }
  }

  const existingTags = loadTagsYaml(tagsPath);
  const tagUpdates = payload.tag_updates || [];

  let addedCount = 0;
  let updatedCount = 0;
  let deletedCount = 0;

  for (const update of tagUpdates) {
    if (!update.name) continue;

    const existingIndex = existingTags.findIndex(t => t.name === update.name);

    if (update.delete === true) {
      if (existingIndex !== -1) {
        existingTags.splice(existingIndex, 1);
        deletedCount++;
      }
    } else {
      if (existingIndex !== -1) {
        const tag = existingTags[existingIndex];
        if (update.description !== undefined) {
          tag.description = update.description;
        }
        if (update.reasoning !== undefined) {
          tag.reasoning = update.reasoning;
        }
        updatedCount++;
      } else {
        existingTags.push({
          name: update.name,
          description: update.description || '',
          reasoning: update.reasoning || ''
        });
        addedCount++;
      }
    }
  }

  // Ensure directory for tagsPath exists before writing
  const tagsDir = path.dirname(tagsPath);
  if (!fs.existsSync(tagsDir)) {
    fs.mkdirSync(tagsDir, { recursive: true });
  }

  dumpTagsYaml(existingTags, tagsPath);

  console.log(JSON.stringify({
    status: 'success',
    added: addedCount,
    updated: updatedCount,
    deleted: deletedCount
  }));
}

main();

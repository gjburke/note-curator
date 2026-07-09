import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const WORKSPACE_ROOT = process.cwd();
const SCRIPT_PATH = path.resolve(WORKSPACE_ROOT, '.agents/skills/tag-raw-notes/scripts/tag_processor.ts');
const SANDBOX_DIR = path.resolve(WORKSPACE_ROOT, 'tests/sandbox_processor');
const SANDBOX_RAW_DIR = path.resolve(SANDBOX_DIR, 'raw');
const SANDBOX_TAGS_FILE = path.resolve(SANDBOX_DIR, 'tags.yaml');

// Helper to run the tag processor CLI
async function runCLI(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const cmd = `npx tsx "${SCRIPT_PATH}" ${args.join(' ')}`;
  const { stdout, stderr } = await execAsync(cmd, { cwd: WORKSPACE_ROOT });
  return { stdout, stderr };
}

function cleanSandbox() {
  if (fs.existsSync(SANDBOX_DIR)) {
    fs.rmSync(SANDBOX_DIR, { recursive: true, force: true });
  }
}

function setupSandbox() {
  cleanSandbox();
  fs.mkdirSync(SANDBOX_RAW_DIR, { recursive: true });
}

describe('Tag Processor Integration Tests', () => {
  beforeEach(() => {
    setupSandbox();
  });

  afterEach(() => {
    cleanSandbox();
  });

  describe('--analyze option', () => {
    it('handles non-existent raw directory gracefully', async () => {
      const nonExistentRaw = path.join(SANDBOX_DIR, 'does-not-exist');
      const { stdout } = await runCLI([
        '--analyze',
        '--raw-dir',
        `"${nonExistentRaw}"`,
        '--tags-file',
        `"${SANDBOX_TAGS_FILE}"`
      ]);

      const result = JSON.parse(stdout.trim());
      assert.ok(result.error);
      assert.strictEqual(result.error, `Raw directory '${nonExistentRaw}' does not exist.`);
      assert.deepStrictEqual(result.untagged_notes, []);
    });

    it('returns empty untagged list when raw directory is empty', async () => {
      const { stdout } = await runCLI([
        '--analyze',
        '--raw-dir',
        `"${SANDBOX_RAW_DIR}"`,
        '--tags-file',
        `"${SANDBOX_TAGS_FILE}"`
      ]);

      const result = JSON.parse(stdout.trim());
      assert.deepStrictEqual(result.untagged_notes, []);
    });

    it('identifies untagged notes and includes frontmatter data', async () => {
      // 1. Note with missing tags property but has user_tags
      const note1Content = `---
title: "Note One"
user_tags:
  - self-improvement
  - reading
---
Hello world.`;
      fs.writeFileSync(path.join(SANDBOX_RAW_DIR, 'note1.md'), note1Content, 'utf-8');

      // 2. Note with tags property as empty list
      const note2Content = `---
title: "Note Two"
tags: []
---
Hello world 2.`;
      fs.writeFileSync(path.join(SANDBOX_RAW_DIR, 'note2.md'), note2Content, 'utf-8');

      // 3. Note with no frontmatter at all
      const note3Content = `Just a plain note text.`;
      fs.writeFileSync(path.join(SANDBOX_RAW_DIR, 'note3.md'), note3Content, 'utf-8');

      const { stdout } = await runCLI([
        '--analyze',
        '--raw-dir',
        `"${SANDBOX_RAW_DIR}"`,
        '--tags-file',
        `"${SANDBOX_TAGS_FILE}"`
      ]);

      const result = JSON.parse(stdout.trim());
      assert.ok(result.untagged_notes);
      assert.strictEqual(result.untagged_notes.length, 3);

      const note1Res = result.untagged_notes.find((n: any) => n.path.endsWith('note1.md'));
      assert.ok(note1Res);
      assert.deepStrictEqual(note1Res.user_tags, ['self-improvement', 'reading']);
      assert.strictEqual(note1Res.content, note1Content);

      const note2Res = result.untagged_notes.find((n: any) => n.path.endsWith('note2.md'));
      assert.ok(note2Res);
      assert.deepStrictEqual(note2Res.user_tags, []);

      const note3Res = result.untagged_notes.find((n: any) => n.path.endsWith('note3.md'));
      assert.ok(note3Res);
    });

    it('excludes already tagged notes', async () => {
      const note1Content = `---
tags:
  - fitness
---
Workout routine`;
      fs.writeFileSync(path.join(SANDBOX_RAW_DIR, 'note1.md'), note1Content, 'utf-8');

      const note2Content = `---
title: "Untagged Note"
---
No tags here`;
      fs.writeFileSync(path.join(SANDBOX_RAW_DIR, 'note2.md'), note2Content, 'utf-8');

      const { stdout } = await runCLI([
        '--analyze',
        '--raw-dir',
        `"${SANDBOX_RAW_DIR}"`,
        '--tags-file',
        `"${SANDBOX_TAGS_FILE}"`
      ]);

      const result = JSON.parse(stdout.trim());
      assert.strictEqual(result.untagged_notes.length, 1);
      assert.ok(result.untagged_notes[0].path.endsWith('note2.md'));
    });
  });

  describe('--apply option', () => {
    it('registers new tags in tags.yaml', async () => {
      const initialTagsContent = `tags:
  - name: existing-tag
    description: "Existing tag description"
    reasoning: "Needed for structure"`;
      fs.writeFileSync(SANDBOX_TAGS_FILE, initialTagsContent, 'utf-8');

      const payload = {
        file_updates: {},
        new_tags: [
          {
            name: 'new-cool-tag',
            description: 'A newly added tag description',
            reasoning: 'Needed for testing functionality'
          }
        ]
      };

      const payloadString = JSON.stringify(payload);
      // Escape double quotes for Windows cmd shell
      const escapedPayload = payloadString.replace(/"/g, '\\"');

      const { stdout } = await runCLI([
        '--apply',
        `"${escapedPayload}"`,
        '--raw-dir',
        `"${SANDBOX_RAW_DIR}"`,
        '--tags-file',
        `"${SANDBOX_TAGS_FILE}"`
      ]);

      const result = JSON.parse(stdout.trim());
      assert.strictEqual(result.status, 'success');

      // Verify tags.yaml was updated
      const updatedTagsContent = fs.readFileSync(SANDBOX_TAGS_FILE, 'utf-8');
      assert.ok(updatedTagsContent.includes('name: new-cool-tag'));
      assert.ok(updatedTagsContent.includes('description: "A newly added tag description"'));
      assert.ok(updatedTagsContent.includes('reasoning: "Needed for testing functionality"'));
      assert.ok(updatedTagsContent.includes('name: existing-tag')); // existing tags should persist
    });

    it('updates file frontmatter tags and preserves other headers', async () => {
      const notePath = path.join(SANDBOX_RAW_DIR, 'note.md');
      const relativeNotePath = path.relative(WORKSPACE_ROOT, notePath).replace(/\\/g, '/');

      const noteContent = `---
title: "Keep this title"
other_field: "Keep this too"
tags: []
---
My important notes.`;
      fs.writeFileSync(notePath, noteContent, 'utf-8');

      const payload = {
        file_updates: {
          [relativeNotePath]: ['finance', 'personal']
        },
        new_tags: []
      };

      const payloadFile = path.join(SANDBOX_DIR, 'payload.json');
      fs.writeFileSync(payloadFile, JSON.stringify(payload), 'utf-8');

      const { stdout } = await runCLI([
        '--apply',
        `"${payloadFile}"`,
        '--raw-dir',
        `"${SANDBOX_RAW_DIR}"`,
        '--tags-file',
        `"${SANDBOX_TAGS_FILE}"`
      ]);

      const result = JSON.parse(stdout.trim());
      assert.strictEqual(result.status, 'success');
      assert.deepStrictEqual(result.updated_files, [relativeNotePath]);

      // Verify file content
      const updatedContent = fs.readFileSync(notePath, 'utf-8');
      assert.ok(updatedContent.includes('title: "Keep this title"'));
      assert.ok(updatedContent.includes('other_field: "Keep this too"'));
      assert.ok(updatedContent.includes('tags:'));
      assert.ok(updatedContent.includes('- finance'));
      assert.ok(updatedContent.includes('- personal'));
      assert.ok(updatedContent.endsWith('My important notes.'));
    });
  });
});

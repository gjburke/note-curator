import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const WORKSPACE_ROOT = process.cwd();
const SCRIPT_PATH = path.resolve(WORKSPACE_ROOT, '.agents/skills/tag-raw-notes/scripts/tag_updater.ts');
const SANDBOX_DIR = path.resolve(WORKSPACE_ROOT, 'tests/sandbox_updater');
const SANDBOX_TAGS_FILE = path.resolve(SANDBOX_DIR, 'tags.yaml');

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
  fs.mkdirSync(SANDBOX_DIR, { recursive: true });
}

describe('Tag Updater Integration Tests', () => {
  beforeEach(() => {
    setupSandbox();
  });

  afterEach(() => {
    cleanSandbox();
  });

  it('updates an existing tag and adds a new tag if not found', async () => {
    const initialTagsContent = `tags:
  - name: test-tag
    description: "Old description"
    reasoning: "Old reasoning"`;
    fs.writeFileSync(SANDBOX_TAGS_FILE, initialTagsContent, 'utf-8');

    const payload = {
      tag_updates: [
        {
          name: 'test-tag',
          description: 'New description',
          reasoning: 'New reasoning'
        },
        {
          name: 'brand-new-tag',
          description: 'A completely new tag',
          reasoning: 'Why not'
        }
      ]
    };

    const payloadFile = path.join(SANDBOX_DIR, 'payload.json');
    fs.writeFileSync(payloadFile, JSON.stringify(payload), 'utf-8');

    const { stdout } = await runCLI([
      '--update-tags',
      `"${payloadFile}"`,
      '--tags-file',
      `"${SANDBOX_TAGS_FILE}"`
    ]);

    const result = JSON.parse(stdout.trim());
    assert.strictEqual(result.status, 'success');
    assert.strictEqual(result.updated, 1);
    assert.strictEqual(result.added, 1);
    assert.strictEqual(result.deleted, 0);

    // Verify tag file updates
    const updatedTagsContent = fs.readFileSync(SANDBOX_TAGS_FILE, 'utf-8');
    assert.ok(updatedTagsContent.includes('name: test-tag'));
    assert.ok(updatedTagsContent.includes('description: "New description"'));
    assert.ok(updatedTagsContent.includes('reasoning: "New reasoning"'));
    assert.ok(updatedTagsContent.includes('name: brand-new-tag'));
    assert.ok(updatedTagsContent.includes('description: "A completely new tag"'));

    // Verify payload file was deleted automatically
    assert.strictEqual(fs.existsSync(payloadFile), false);
  });

  it('deletes an existing tag', async () => {
    const initialTagsContent = `tags:
  - name: keep-tag
    description: "Should stay"
    reasoning: "Reason"
  - name: delete-tag
    description: "Should go"
    reasoning: "Reason"`;
    fs.writeFileSync(SANDBOX_TAGS_FILE, initialTagsContent, 'utf-8');

    const payload = {
      tag_updates: [
        {
          name: 'delete-tag',
          delete: true
        }
      ]
    };

    const payloadFile = path.join(SANDBOX_DIR, 'payload.json');
    fs.writeFileSync(payloadFile, JSON.stringify(payload), 'utf-8');

    const { stdout } = await runCLI([
      '--update-tags',
      `"${payloadFile}"`,
      '--tags-file',
      `"${SANDBOX_TAGS_FILE}"`
    ]);

    const result = JSON.parse(stdout.trim());
    assert.strictEqual(result.status, 'success');
    assert.strictEqual(result.updated, 0);
    assert.strictEqual(result.added, 0);
    assert.strictEqual(result.deleted, 1);

    const updatedTagsContent = fs.readFileSync(SANDBOX_TAGS_FILE, 'utf-8');
    assert.ok(updatedTagsContent.includes('name: keep-tag'));
    assert.strictEqual(updatedTagsContent.includes('name: delete-tag'), false);
    assert.strictEqual(fs.existsSync(payloadFile), false);
  });

  it('handles inline JSON payloads correctly', async () => {
    const initialTagsContent = `tags:
  - name: test-tag
    description: "Old description"
    reasoning: "Old reasoning"`;
    fs.writeFileSync(SANDBOX_TAGS_FILE, initialTagsContent, 'utf-8');

    const payload = {
      tag_updates: [
        {
          name: 'test-tag',
          description: 'Inline description'
        }
      ]
    };

    const payloadString = JSON.stringify(payload);
    // Escape double quotes for Windows cmd shell execution
    const escapedPayload = payloadString.replace(/"/g, '\\"');

    const { stdout } = await runCLI([
      '--update-tags',
      `"${escapedPayload}"`,
      '--tags-file',
      `"${SANDBOX_TAGS_FILE}"`
    ]);

    const result = JSON.parse(stdout.trim());
    assert.strictEqual(result.status, 'success');
    assert.strictEqual(result.updated, 1);
    assert.strictEqual(result.added, 0);
    assert.strictEqual(result.deleted, 0);

    const updatedTagsContent = fs.readFileSync(SANDBOX_TAGS_FILE, 'utf-8');
    assert.ok(updatedTagsContent.includes('name: test-tag'));
    assert.ok(updatedTagsContent.includes('description: "Inline description"'));
    assert.ok(updatedTagsContent.includes('reasoning: "Old reasoning"')); // unchanged fields should remain
  });
});

---
name: tag-raw-notes
description: Captures the workflow for processing raw notes. It runs tag_processor.ts to scan the raw/ directory, matches and applies tags from tags.yaml (incorporating user_tags), registers any new tags, and updates the Obsidian-style YAML headers.
---

# Playbook: Tagging Raw Notes

Use this skill when processing raw notes in the `raw/` folder of the workspace.

## Step-by-Step Workflow

### Step 1: Scan for Untagged Notes
Run the analyze command to list files lacking the `tags:` header in their YAML frontmatter:
```powershell
npx tsx .agents/skills/tag-raw-notes/scripts/tag_processor.ts --analyze
```
*Note: If the `raw/` directory does not exist, create it first.*

### Step 2: Read the Tag Registry
Read the current taxonomy definitions from `tags.yaml` at the project root.

### Step 3: Analyze and Map Tags
For each note listed in the output of the `--analyze` command:
1. Review the note content and any user-specified `user_tags`.
2. Map the note to the most relevant tags defined in `tags.yaml`.
3. If the note covers a topic not well-represented in the current registry, design a **new tag**:
   - `name`: kebab-case string
   - `description`: what kinds of notes fall under this tag
   - `reasoning`: why the existing tags were insufficient and why this new one is needed

### Step 4: Construct the Payload
Prepare a JSON payload containing the file updates and any new tag definitions. 

**Example Payload Structure:**
```json
{
  "file_updates": {
    "raw/note-name.md": ["existing-tag", "new-tag"]
  },
  "new_tags": [
    {
      "name": "new-tag",
      "description": "Description of the new tag.",
      "reasoning": "Why it was created."
    }
  ]
}
```
Save this payload as a temporary JSON file at `.agents/skills/tag-raw-notes/temp_decisions.json`.

### Step 5: Apply Updates
Run the apply command, passing the path to the temporary JSON payload:
```powershell
npx tsx .agents/skills/tag-raw-notes/scripts/tag_processor.ts --apply .agents/skills/tag-raw-notes/temp_decisions.json
```

### Step 6: Clean Up and Report
1. Delete the temporary JSON file (`.agents/skills/tag-raw-notes/temp_decisions.json`).
2. Summarize the changes:
   - Which notes were successfully tagged.
   - What new tags were added to `tags.yaml`.

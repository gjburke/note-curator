---
name: tag-raw-notes
description: Captures the workflow for processing raw notes and managing the tag taxonomy. It includes scanning untagged notes, registering new tags, updating existing tags, and deleting unused tags in tags.yaml.
---

# Playbook: Tagging Raw Notes & Taxonomy Maintenance

Use this skill when processing raw notes in the `raw/` folder or maintaining the `tags.yaml` taxonomy definitions.

## Step-by-Step Workflow

### Step 1: Scan for Untagged Notes
Run the analyze command to list files lacking the `tags:` header in their YAML frontmatter:
```powershell
npx tsx .agents/skills/tag-raw-notes/scripts/tag_processor.ts --analyze
```
*Note: If the `raw/` directory does not exist, create it first.*

### Step 2: Read and Understand the Tag Registry
Read the current taxonomy definitions from `tags.yaml` at the project root.

**`tags.yaml` Schema Specification:**
The tag registry file must be formatted precisely as follows:
```yaml
tags:
  - name: kebab-case-tag-name
    description: "Brief description of the tag"
    reasoning: "Explanation of when to apply this tag"
```
*Note: Due to a simplified YAML parser, entries must strictly use 2-space indentation, keep fields in this exact order (`name`, `description`, `reasoning`), and avoid multi-line formatting or comments within tag blocks.*

### Step 3: Analyze and Map Tags
For each note listed in the output of the `--analyze` command:
1. Review the note content and any user-specified `user_tags`.
2. Map the note to the most relevant tags defined in `tags.yaml`.
3. If the note covers a topic not well-represented in the current registry, design a **new tag**:
   - `name`: kebab-case string
   - `description`: what kinds of notes fall under this tag
   - `reasoning`: why the existing tags were insufficient and why this new one is needed

### Step 4: Construct the Payload for Tagging Notes
Prepare a JSON payload containing the file updates and any new tag definitions. 

**Payload Structure (`temp_decisions.json`):**
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

### Step 5: Apply Tagging Updates
Run the apply command, passing the path to the temporary JSON payload:
```powershell
npx tsx .agents/skills/tag-raw-notes/scripts/tag_processor.ts --apply .agents/skills/tag-raw-notes/temp_decisions.json
```

### Step 6: Clean Up and Report (Ingestion)
1. Delete the temporary JSON file (`.agents/skills/tag-raw-notes/temp_decisions.json`).
2. Summarize the changes:
   - Which notes were successfully tagged.
   - What new tags were added to `tags.yaml`.

---

## Taxonomy Maintenance (Updating or Deleting Tags)

When you need to perform structural linting or update/delete tag definitions in the registry, use the tag updater tool.

### Step 7: Construct the Maintenance Payload
Prepare a JSON payload or inline string detailing the updates and deletions.

**Payload Structure:**
```json
{
  "tag_updates": [
    {
      "name": "existing-tag",
      "description": "Updated description",
      "reasoning": "Updated reasoning"
    },
    {
      "name": "unneeded-tag",
      "delete": true
    }
  ]
}
```
*Note: Set `"delete": true` to completely remove a tag from the registry.*

### Step 8: Apply Maintenance Updates
Run the `tag_updater.ts` script by passing either a path to a temporary JSON file or an inline JSON string:

```powershell
# Using a temporary payload file:
npx tsx .agents/skills/tag-raw-notes/scripts/tag_updater.ts --update-tags .agents/skills/tag-raw-notes/temp_updates.json

# Using inline JSON string:
npx tsx .agents/skills/tag-raw-notes/scripts/tag_updater.ts --update-tags '{"tag_updates": [{"name": "tag-to-delete", "delete": true}]}'
```

*Important: If a temporary JSON payload file was used, delete it immediately after running the script to avoid leaving temporary files in the repository.*

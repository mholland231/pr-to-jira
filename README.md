# PR to JIRA

A Chrome extension that adds a "Create JIRA Ticket" button to GitHub Pull Request pages. Click the button, adjust the pre-filled fields, and create a JIRA ticket — with a comment automatically posted back on the PR.

## Features

- One-click JIRA ticket creation from any GitHub PR
- Modal pre-filled with PR title, description, and saved defaults
- Team dropdown fetched live from your JIRA instance
- Automatic GitHub comment with the ticket link
- Markdown-to-ADF conversion for PR descriptions
- Handles GitHub's SPA navigation (works across page transitions)
- Configurable defaults for project, issue type, labels, and custom fields

## Installation

1. Clone this repo:
   ```
   git clone https://github.com/mholland231/pr-to-jira.git
   ```
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked** and select the cloned `pr-to-jira` directory

## Setup

Open the extension options page (click the extension icon > "Options", or right-click > "Options"):

### JIRA Configuration
- **Organization Domain**: Your Atlassian subdomain (e.g. `mycompany` from `mycompany.atlassian.net`)
- **Email**: Your Atlassian account email
- **API Token**: Generate one at [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)

### GitHub Configuration
- **Personal Access Token**: A GitHub PAT with `repo` scope
  - Generate at [github.com/settings/tokens](https://github.com/settings/tokens)
  - For organization repos with SSO, you must authorize the token for the org (click "Configure SSO" next to the token)

### Default Values (optional)
- **Project Key**: Default JIRA project (e.g. `PROJ`)
- **Issue Type**: Default issue type (e.g. `Task`, `Story`, `Bug`)
- **Priority**: Must match a priority name in your JIRA instance — leave blank to use the project default
- **Labels**: Comma-separated default labels

### Custom Fields (optional)
Add JIRA custom field mappings as key-value pairs. Values that are valid JSON will be parsed automatically (e.g. `{"id": "123"}`).

## Usage

1. Navigate to any GitHub Pull Request page
2. Click the **Create JIRA Ticket** button in the PR header (next to Edit/Code)
3. Adjust the pre-filled fields as needed:
   - Summary (from PR title)
   - Description (from PR body)
   - Project Key, Issue Type, Priority
   - Labels, Components
   - Team (fetched from your JIRA project)
4. Click **Create Ticket**
5. The extension will:
   - Create the JIRA ticket
   - Post a comment on the PR with a link to the ticket
   - Show the ticket link in the modal

## Permissions

The extension requests these permissions:
- `storage` — to save your configuration
- `activeTab` — to interact with the current GitHub PR page
- `https://*.atlassian.net/*` — to call the JIRA REST API
- `https://api.github.com/*` — to post comments on PRs

Credentials are stored in `chrome.storage.sync` (encrypted at rest by Chrome) and are only used in the service worker to construct API requests.

## Troubleshooting

| Problem | Solution |
|---|---|
| Button doesn't appear | Reload the extension on `chrome://extensions`. Make sure you're on a `/pull/` page. |
| "JIRA credentials not configured" | Open the extension options and fill in your JIRA org, email, and API token. |
| JIRA 401 error | Check your JIRA email and API token are correct. |
| JIRA 404 error | Check your project key and issue type name match your JIRA instance. |
| GitHub comment 404 | Your PAT needs `repo` scope. For org repos with SSO, authorize the token for the org. |
| Priority error | Leave the priority field blank, or use a priority name that exists in your JIRA instance. |
| Team dropdown empty | The extension queries recent issues to find teams. If no issues in the project have a team set, the dropdown will be empty. |

## License

MIT

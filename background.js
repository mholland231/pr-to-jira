chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'createJiraTicket') {
    handleCreateTicket(msg.payload).then(sendResponse);
    return true;
  }
  if (msg.action === 'fetchTeamOptions') {
    fetchTeamOptions(msg.payload).then(sendResponse);
    return true;
  }
});

async function fetchTeamOptions(payload) {
  const { jiraOrg, jiraEmail, jiraToken, projectKey } = payload;
  if (!jiraOrg || !jiraEmail || !jiraToken || !projectKey) {
    return { success: false, error: 'Missing JIRA config or project key.' };
  }

  try {
    // Jira's native Team field doesn't expose options via the standard APIs.
    // Instead, query recent issues to discover the distinct team values in use.
    const jql = `project = ${projectKey} AND "Team" is not EMPTY ORDER BY created DESC`;
    const res = await jiraRequest(
      `https://${jiraOrg}.atlassian.net/rest/api/3/search/jql`,
      {
        method: 'POST',
        body: JSON.stringify({ jql, maxResults: 100, fields: ['customfield_10001'] }),
      },
      jiraEmail,
      jiraToken
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, error: `Failed to fetch teams (${res.status}): ${err.errorMessages?.[0] || ''}` };
    }

    const data = await res.json();
    const teams = new Map();
    for (const issue of data.issues || []) {
      const t = issue.fields?.customfield_10001;
      if (t && t.id) teams.set(t.id, t.name || t.title || t.id);
    }

    if (teams.size === 0) {
      return { success: false, error: 'No teams found in recent issues for this project.' };
    }

    const options = [...teams.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { success: true, options };
  } catch (err) {
    return { success: false, error: `Failed to fetch teams: ${err.message}` };
  }
}

async function handleCreateTicket(payload) {
  const { jiraOrg, jiraEmail, jiraToken, githubToken } = payload.config;

  // Validate credentials
  if (!jiraOrg || !jiraEmail || !jiraToken) {
    return { success: false, error: 'JIRA credentials not configured. Please open the extension options.' };
  }
  if (!githubToken) {
    return { success: false, error: 'GitHub token not configured. Please open the extension options.' };
  }

  // Build JIRA issue body
  const fields = {
    project: { key: payload.projectKey },
    summary: payload.summary,
    issuetype: { name: payload.issueType },
    description: payload.description, // already ADF
  };

  if (payload.priority) {
    fields.priority = { name: payload.priority };
  }
  if (payload.teamId) {
    fields.customfield_10001 = payload.teamId;
  }
  if (payload.labels && payload.labels.length > 0) {
    fields.labels = payload.labels;
  }
  if (payload.components && payload.components.length > 0) {
    fields.components = payload.components.map(name => ({ name }));
  }
  if (Array.isArray(payload.customFields)) {
    for (const cf of payload.customFields) {
      if (cf.key && cf.value) {
        // Support JSON values for structured fields (e.g. {"id": "123"})
        try {
          fields[cf.key] = JSON.parse(cf.value);
        } catch {
          fields[cf.key] = cf.value;
        }
      }
    }
  }

  // Create JIRA ticket
  let ticketKey, ticketUrl;
  try {
    const jiraResult = await jiraRequest(
      `https://${jiraOrg}.atlassian.net/rest/api/3/issue`,
      {
        method: 'POST',
        body: JSON.stringify({ fields }),
      },
      jiraEmail,
      jiraToken
    );

    if (!jiraResult.ok) {
      const errBody = await jiraResult.json().catch(() => ({}));
      const detail = formatJiraError(jiraResult.status, errBody);
      return { success: false, error: detail };
    }

    const data = await jiraResult.json();
    ticketKey = data.key;
    ticketUrl = `https://${jiraOrg}.atlassian.net/browse/${ticketKey}`;
  } catch (err) {
    return { success: false, error: `JIRA request failed: ${err.message}` };
  }

  // Post comment on GitHub PR
  let commentError = null;
  try {
    const commentBody = `JIRA ticket created: [${ticketKey}](${ticketUrl})`;
    const ghResult = await githubRequest(
      `https://api.github.com/repos/${payload.owner}/${payload.repo}/issues/${payload.prNumber}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ body: commentBody }),
      },
      githubToken
    );

    if (!ghResult.ok) {
      const errBody = await ghResult.json().catch(() => ({}));
      commentError = `GitHub comment failed (${ghResult.status}): ${errBody.message || 'Unknown error'}`;
    }
  } catch (err) {
    commentError = `GitHub comment failed: ${err.message}`;
  }

  return {
    success: true,
    ticketKey,
    ticketUrl,
    commentError,
  };
}

async function jiraRequest(url, options, email, token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Authorization': 'Basic ' + btoa(email + ':' + token),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function githubRequest(url, options, token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json',
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function formatJiraError(status, body) {
  const msgs = [];
  if (status === 401) msgs.push('Authentication failed. Check your JIRA email and API token.');
  else if (status === 403) msgs.push('Permission denied. Your JIRA account may lack access to this project.');
  else if (status === 404) msgs.push('Project or issue type not found. Check your project key and issue type.');
  else if (status === 429) msgs.push('Rate limited by JIRA. Please wait a moment and try again.');
  else msgs.push(`JIRA returned status ${status}.`);

  if (Array.isArray(body.errorMessages)) {
    for (const m of body.errorMessages) msgs.push(m);
  }
  if (body.errors && typeof body.errors === 'object') {
    for (const [field, message] of Object.entries(body.errors)) {
      msgs.push(`${field}: ${message}`);
    }
  }
  return msgs.join(' ');
}
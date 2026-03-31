const FIELDS = ['jiraOrg', 'jiraEmail', 'jiraToken', 'githubToken',
  'defaultProject', 'defaultIssueType', 'defaultPriority', 'defaultLabels'];

document.addEventListener('DOMContentLoaded', loadSettings);
document.getElementById('settings-form').addEventListener('submit', saveSettings);
document.getElementById('add-custom-field').addEventListener('click', () => addCustomFieldRow('', ''));
document.getElementById('test-jira-token').addEventListener('click', testJiraToken);

function loadSettings() {
  chrome.storage.sync.get([...FIELDS, 'customFields'], (data) => {
    for (const id of FIELDS) {
      if (data[id]) {
        document.getElementById(id).value =
          id === 'jiraOrg' ? normalizeJiraOrg(data[id]) : data[id];
      }
    }
    if (Array.isArray(data.customFields)) {
      for (const cf of data.customFields) {
        addCustomFieldRow(cf.key, cf.value);
      }
    }
  });
}

function saveSettings(e) {
  e.preventDefault();
  const data = {};
  for (const id of FIELDS) {
    let v = document.getElementById(id).value.trim();
    if (id === 'jiraOrg') v = normalizeJiraOrg(v);
    data[id] = v;
  }
  data.customFields = getCustomFields();
  chrome.storage.sync.set(data, () => {
    const msg = document.getElementById('status-msg');
    msg.textContent = 'Settings saved!';
    setTimeout(() => { msg.textContent = ''; }, 2000);
  });
}

async function testJiraToken() {
  const button = document.getElementById('test-jira-token');
  const status = document.getElementById('jira-test-status');
  const jiraOrg = normalizeJiraOrg(document.getElementById('jiraOrg').value.trim());
  const jiraEmail = document.getElementById('jiraEmail').value.trim();
  const jiraToken = document.getElementById('jiraToken').value.trim();

  if (!jiraOrg || !jiraEmail || !jiraToken) {
    setInlineStatus(status, 'Enter organization domain, email, and API token first.', 'error');
    return;
  }

  button.disabled = true;
  setInlineStatus(status, 'Testing Jira credentials...', 'loading');

  try {
    const result = await chrome.runtime.sendMessage({
      action: 'testJiraCredentials',
      payload: { jiraOrg, jiraEmail, jiraToken },
    });

    if (result && result.success) {
      const displayName = result.displayName ? ` for ${result.displayName}` : '';
      setInlineStatus(status, `API token is valid${displayName}.`, 'success');
    } else {
      const message = result && result.error ? result.error : 'Jira validation failed.';
      setInlineStatus(status, message, 'error');
    }
  } catch (err) {
    setInlineStatus(status, 'Validation request failed: ' + (err.message || String(err)), 'error');
  } finally {
    button.disabled = false;
  }
}

function setInlineStatus(el, message, type) {
  el.textContent = message;
  el.className = 'status-inline' + (type ? ' is-' + type : '');
}

function addCustomFieldRow(key, value) {
  const list = document.getElementById('custom-fields-list');
  const row = document.createElement('div');
  row.className = 'custom-field-row';
  row.innerHTML =
    '<input type="text" class="cf-key" placeholder="customfield_10001" value="' + escapeAttr(key) + '">' +
    '<input type="text" class="cf-value" placeholder="Value" value="' + escapeAttr(value) + '">' +
    '<button type="button" class="btn-remove" title="Remove">&times;</button>';
  row.querySelector('.btn-remove').addEventListener('click', () => row.remove());
  list.appendChild(row);
}

function getCustomFields() {
  const rows = document.querySelectorAll('.custom-field-row');
  const fields = [];
  for (const row of rows) {
    const key = row.querySelector('.cf-key').value.trim();
    const value = row.querySelector('.cf-value').value.trim();
    if (key) fields.push({ key, value });
  }
  return fields;
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

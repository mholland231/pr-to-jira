(() => {
  'use strict';

  const BUTTON_ID = 'pr-to-jira-btn';
  const OVERLAY_ID = 'pr-to-jira-overlay';
  const JIRA_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 12l10 10 10-10L12 2z"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>';

  // ---- Utility ----

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---- Button Injection ----

  function injectButton() {
    if (document.getElementById(BUTTON_ID)) return;
    if (!window.location.pathname.match(/\/[^/]+\/[^/]+\/pull\/\d+/)) return;

    const btn = createButton();

    // 1. Primer React PageHeader Actions area (current GitHub UI as of 2026)
    //    Structure: div[PH_Actions] contains Edit + Code buttons inside a "d-flex gap-2" div.
    //    Insert our button at the start of that inner flex container, left of Edit.
    const actionsArea = document.querySelector('[data-component="PH_Actions"]');
    if (actionsArea) {
      const btnGroup = actionsArea.querySelector('.d-flex.gap-2');
      if (btnGroup) {
        btnGroup.prepend(btn);
      } else {
        actionsArea.prepend(btn);
      }
      return;
    }

    // 2. Legacy: PR header actions area
    const headerActions = document.querySelector('.gh-header-actions');
    if (headerActions) {
      headerActions.prepend(btn);
      return;
    }

    // 3. Legacy: discussion header container
    const discussionHeader = document.querySelector('#partial-discussion-header');
    if (discussionHeader) {
      btn.style.float = 'right';
      btn.style.marginTop = '8px';
      discussionHeader.prepend(btn);
      return;
    }
  }

  function createButton() {
    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.innerHTML = JIRA_ICON + ' Create JIRA Ticket';
    btn.addEventListener('click', onButtonClick);
    return btn;
  }

  // ---- Modal ----

  async function onButtonClick() {
    const pr = window.PRParser.parse();
    if (!pr) {
      alert('Could not parse PR data from this page.');
      return;
    }

    const config = await loadConfig();
    showModal(pr, config);
  }

  function loadConfig() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(
        ['jiraOrg', 'jiraEmail', 'jiraToken', 'githubToken',
         'defaultProject', 'defaultIssueType', 'defaultPriority', 'defaultLabels', 'customFields'],
        resolve
      );
    });
  }

  function showModal(pr, config) {
    // Remove existing
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    const issueTypes = ['Task', 'Story', 'Bug', 'Sub-task', 'Epic'];
    const issueOpts = issueTypes.map(t =>
      '<option value="' + escapeAttr(t) + '"' + (t === (config.defaultIssueType || 'Task') ? ' selected' : '') + '>' + escapeHtml(t) + '</option>'
    ).join('');

    // Filter out Team field — it has its own dedicated dropdown
    const customFieldsHtml = (config.customFields || [])
      .filter(cf => cf.key !== 'customfield_10001')
      .map((cf, i) =>
        '<div class="ptj-row">' +
          '<div class="ptj-field"><label>Field Key</label><input type="text" class="ptj-cf-key" value="' + escapeAttr(cf.key) + '"></div>' +
          '<div class="ptj-field"><label>Value</label><input type="text" class="ptj-cf-value" value="' + escapeAttr(cf.value) + '"></div>' +
        '</div>'
      ).join('');

    overlay.innerHTML =
      '<div id="pr-to-jira-modal">' +
        '<div class="ptj-header">' +
          '<h2>Create JIRA Ticket</h2>' +
          '<button class="ptj-close" title="Close">&times;</button>' +
        '</div>' +
        '<div class="ptj-body">' +
          '<div class="ptj-field">' +
            '<label>Summary</label>' +
            '<input type="text" id="ptj-summary" value="' + escapeAttr(pr.title) + '">' +
          '</div>' +
          '<div class="ptj-field">' +
            '<label>Description</label>' +
            '<textarea id="ptj-description">' + escapeHtml(pr.body) + '</textarea>' +
          '</div>' +
          '<div class="ptj-row">' +
            '<div class="ptj-field">' +
              '<label>Project Key</label>' +
              '<input type="text" id="ptj-project" value="' + escapeAttr(config.defaultProject || '') + '">' +
            '</div>' +
            '<div class="ptj-field">' +
              '<label>Issue Type</label>' +
              '<select id="ptj-issue-type">' + issueOpts + '</select>' +
            '</div>' +
          '</div>' +
          '<div class="ptj-row">' +
            '<div class="ptj-field">' +
              '<label>Priority</label>' +
              '<input type="text" id="ptj-priority" value="' + escapeAttr(config.defaultPriority || '') + '" placeholder="e.g. High, Medium (leave blank for default)">' +
            '</div>' +
            '<div class="ptj-field">' +
              '<label>Labels</label>' +
              '<input type="text" id="ptj-labels" value="' + escapeAttr(config.defaultLabels || '') + '" placeholder="label1, label2">' +
            '</div>' +
          '</div>' +
          '<div class="ptj-row">' +
            '<div class="ptj-field">' +
              '<label>Components</label>' +
              '<input type="text" id="ptj-components" placeholder="comp1, comp2">' +
            '</div>' +
            '<div class="ptj-field">' +
              '<label>Team</label>' +
              '<select id="ptj-team"><option value="">Loading teams...</option></select>' +
            '</div>' +
          '</div>' +
          (customFieldsHtml ? '<div id="ptj-custom-fields">' + customFieldsHtml + '</div>' : '') +
        '</div>' +
        '<div class="ptj-footer">' +
          '<span class="ptj-status" id="ptj-status"></span>' +
          '<button class="ptj-btn-cancel" id="ptj-cancel">Cancel</button>' +
          '<button class="ptj-btn-submit" id="ptj-submit">Create Ticket</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    // Event listeners
    overlay.querySelector('.ptj-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#ptj-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#ptj-submit').addEventListener('click', () => onSubmit(pr, config, overlay));

    // Fetch Team options from JIRA
    fetchTeamOptions(config, overlay);

    // Close on Escape
    const onKey = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
      }
    };
    document.addEventListener('keydown', onKey);
  }

  // ---- Team Dropdown ----

  async function fetchTeamOptions(config, overlay) {
    const teamSelect = overlay.querySelector('#ptj-team');
    if (!teamSelect) return;

    const projectKey = overlay.querySelector('#ptj-project').value.trim();
    const issueTypeName = overlay.querySelector('#ptj-issue-type').value;

    if (!config.jiraOrg || !config.jiraEmail || !config.jiraToken || !projectKey) {
      teamSelect.removeAttribute('title');
      teamSelect.innerHTML = '<option value="">Configure JIRA settings first</option>';
      return;
    }

    try {
      const result = await chrome.runtime.sendMessage({
        action: 'fetchTeamOptions',
        payload: {
          jiraOrg: config.jiraOrg,
          jiraEmail: config.jiraEmail,
          jiraToken: config.jiraToken,
          projectKey,
          issueTypeName,
        },
      });

      if (result && result.success && result.options.length > 0) {
        teamSelect.removeAttribute('title');
        teamSelect.innerHTML = '<option value="">-- Select Team --</option>' +
          result.options.map(o =>
            '<option value="' + escapeAttr(o.id) + '">' + escapeHtml(o.name) + '</option>'
          ).join('');
      } else {
        const errMsg = result?.error || 'No teams found';
        const errDetail = result?.errorDetail || errMsg;
        teamSelect.innerHTML = '<option value="">' + escapeHtml(errMsg) + '</option>';
        teamSelect.title = errDetail;
      }
    } catch (err) {
      const errMsg = 'Failed to load teams: ' + (err.message || String(err));
      teamSelect.innerHTML = '<option value="">Failed to load teams</option>';
      teamSelect.title = errMsg;
    }
  }

  // ---- Submit ----

  async function onSubmit(pr, config, overlay) {
    const statusEl = overlay.querySelector('#ptj-status');
    const submitBtn = overlay.querySelector('#ptj-submit');

    // Gather form values
    const summary = overlay.querySelector('#ptj-summary').value.trim();
    const descriptionText = overlay.querySelector('#ptj-description').value.trim();
    const projectKey = overlay.querySelector('#ptj-project').value.trim();
    const issueType = overlay.querySelector('#ptj-issue-type').value;
    const priority = overlay.querySelector('#ptj-priority').value.trim();
    const labelsRaw = overlay.querySelector('#ptj-labels').value.trim();
    const componentsRaw = overlay.querySelector('#ptj-components').value.trim();
    const teamId = overlay.querySelector('#ptj-team').value;

    // Gather custom fields from modal
    const cfKeys = overlay.querySelectorAll('.ptj-cf-key');
    const cfValues = overlay.querySelectorAll('.ptj-cf-value');
    const customFields = [];
    for (let i = 0; i < cfKeys.length; i++) {
      const key = cfKeys[i].value.trim();
      const value = cfValues[i].value.trim();
      if (key) customFields.push({ key, value });
    }

    // Validate
    if (!summary) { showStatus(statusEl, 'error', 'Summary is required.', { fullText: 'Summary is required.' }); return; }
    if (!projectKey) { showStatus(statusEl, 'error', 'Project Key is required.', { fullText: 'Project Key is required.' }); return; }
    if (!config.jiraOrg || !config.jiraEmail || !config.jiraToken) {
      showStatus(statusEl, 'error', 'JIRA credentials not configured. <a href="#" id="ptj-open-options">Open settings</a>', {
        fullText: 'JIRA credentials not configured. Open settings.',
      });
      const link = statusEl.querySelector('#ptj-open-options');
      if (link) link.addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.sendMessage({ action: 'openOptions' }); });
      return;
    }

    const labels = labelsRaw ? labelsRaw.split(',').map(l => l.trim()).filter(Boolean) : [];
    const components = componentsRaw ? componentsRaw.split(',').map(c => c.trim()).filter(Boolean) : [];

    // Convert description to ADF
    const description = markdownToAdf(descriptionText, pr.url);

    submitBtn.disabled = true;
    showStatus(statusEl, '', '<span class="ptj-spinner"></span> Creating ticket...');

    const payload = {
      config: {
        jiraOrg: config.jiraOrg,
        jiraEmail: config.jiraEmail,
        jiraToken: config.jiraToken,
        githubToken: config.githubToken,
      },
      summary,
      description,
      projectKey,
      issueType,
      priority,
      labels,
      components,
      customFields,
      teamId,
      owner: pr.owner,
      repo: pr.repo,
      prNumber: pr.prNumber,
    };

    try {
      const result = await chrome.runtime.sendMessage({ action: 'createJiraTicket', payload });
      if (!result) {
        showStatus(statusEl, 'error', 'No response from extension. Try reloading the page.', {
          fullText: 'No response from extension. Try reloading the page.',
        });
        submitBtn.disabled = false;
        return;
      }
      if (result.success) {
        let msg = 'Ticket created: <a href="' + escapeAttr(result.ticketUrl) + '" target="_blank">' + escapeHtml(result.ticketKey) + '</a>';
        if (result.commentError) {
          msg += '<br><span class="ptj-warning">' + escapeHtml(result.commentError) + '</span>';
          showStatus(statusEl, 'success', msg);
        } else {
          showStatus(statusEl, 'success', msg);
        }
        // Change submit to "Close"
        submitBtn.textContent = 'Close';
        submitBtn.disabled = false;
        submitBtn.onclick = () => overlay.remove();
      } else {
        const errLine = result.error != null ? String(result.error) : 'Unknown error';
        const errDetail = result.errorDetail != null ? String(result.errorDetail) : errLine;
        showStatus(statusEl, 'error', escapeHtml(errLine), { fullText: errDetail });
        submitBtn.disabled = false;
      }
    } catch (err) {
      const extErr = 'Extension error: ' + (err.message || String(err));
      showStatus(statusEl, 'error', escapeHtml(extErr), { fullText: extErr });
      submitBtn.disabled = false;
    }
  }

  function showStatus(el, type, html, opts) {
    el.className = 'ptj-status' + (type ? ' ptj-' + type : '');
    const fullText = opts && opts.fullText;
    if (type === 'error' && fullText) {
      el.innerHTML =
        '<span class="ptj-status-inner">' + html + '</span>' +
        '<span class="ptj-error-hint" role="img" aria-label="Full error" title="' + escapeAttr(fullText) + '">\u2139</span>';
    } else {
      el.innerHTML = html;
    }
  }

  // ---- Markdown to ADF (Atlassian Document Format) ----

  function markdownToAdf(text, prUrl) {
    const content = [];

    // Add a link to the PR at the top
    if (prUrl) {
      content.push({
        type: 'paragraph',
        content: [
          { type: 'text', text: 'GitHub PR: ' },
          {
            type: 'text',
            text: prUrl,
            marks: [{ type: 'link', attrs: { href: prUrl } }],
          },
        ],
      });
    }

    if (!text) {
      return { type: 'doc', version: 1, content: content.length ? content : [{ type: 'paragraph', content: [] }] };
    }

    const lines = text.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Headings
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch) {
        content.push({
          type: 'heading',
          attrs: { level: headingMatch[1].length },
          content: parseInline(headingMatch[2]),
        });
        i++;
        continue;
      }

      // Unordered list items
      if (line.match(/^[\s]*[-*]\s+/)) {
        const items = [];
        while (i < lines.length && lines[i].match(/^[\s]*[-*]\s+/)) {
          const itemText = lines[i].replace(/^[\s]*[-*]\s+/, '');
          items.push({
            type: 'listItem',
            content: [{ type: 'paragraph', content: parseInline(itemText) }],
          });
          i++;
        }
        content.push({ type: 'bulletList', content: items });
        continue;
      }

      // Ordered list items
      if (line.match(/^[\s]*\d+\.\s+/)) {
        const items = [];
        while (i < lines.length && lines[i].match(/^[\s]*\d+\.\s+/)) {
          const itemText = lines[i].replace(/^[\s]*\d+\.\s+/, '');
          items.push({
            type: 'listItem',
            content: [{ type: 'paragraph', content: parseInline(itemText) }],
          });
          i++;
        }
        content.push({ type: 'orderedList', content: items });
        continue;
      }

      // Code block (fenced)
      if (line.match(/^```/)) {
        const lang = line.replace(/^```/, '').trim();
        const codeLines = [];
        i++;
        while (i < lines.length && !lines[i].match(/^```/)) {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // skip closing ```
        content.push({
          type: 'codeBlock',
          attrs: lang ? { language: lang } : {},
          content: [{ type: 'text', text: codeLines.join('\n') }],
        });
        continue;
      }

      // Blank line
      if (line.trim() === '') {
        i++;
        continue;
      }

      // Regular paragraph
      content.push({
        type: 'paragraph',
        content: parseInline(line),
      });
      i++;
    }

    if (content.length === 0) {
      content.push({ type: 'paragraph', content: [] });
    }

    return { type: 'doc', version: 1, content };
  }

  function parseInline(text) {
    const nodes = [];
    // Simple inline parsing: bold, italic, code, links
    const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(\[(.+?)\]\((.+?)\))/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // Text before match
      if (match.index > lastIndex) {
        nodes.push({ type: 'text', text: text.slice(lastIndex, match.index) });
      }

      if (match[1]) {
        // Bold
        nodes.push({ type: 'text', text: match[2], marks: [{ type: 'strong' }] });
      } else if (match[3]) {
        // Italic
        nodes.push({ type: 'text', text: match[4], marks: [{ type: 'em' }] });
      } else if (match[5]) {
        // Inline code
        nodes.push({ type: 'text', text: match[6], marks: [{ type: 'code' }] });
      } else if (match[7]) {
        // Link
        nodes.push({ type: 'text', text: match[8], marks: [{ type: 'link', attrs: { href: match[9] } }] });
      }

      lastIndex = match.index + match[0].length;
    }

    // Remaining text
    if (lastIndex < text.length) {
      nodes.push({ type: 'text', text: text.slice(lastIndex) });
    }

    if (nodes.length === 0) {
      nodes.push({ type: 'text', text: text || '' });
    }

    return nodes;
  }

  // ---- SPA Navigation Handling ----

  function observeNavigation() {
    // GitHub uses Turbo for client-side navigation.
    // turbo:render fires after new page content is rendered (covers forward nav + back/forward).
    document.addEventListener('turbo:render', () => {
      // Small delay to let the DOM settle after Turbo swaps content
      setTimeout(injectButton, 100);
    });

    // Cleanup overlay on navigation away
    document.addEventListener('turbo:before-fetch-request', () => {
      const overlay = document.getElementById(OVERLAY_ID);
      if (overlay) overlay.remove();
    });
    document.addEventListener('turbo:visit', () => {
      const overlay = document.getElementById(OVERLAY_ID);
      if (overlay) overlay.remove();
    });

    // MutationObserver as a safety net for dynamic content loading within a page
    // (e.g., deferred header rendering). Debounced to avoid excessive calls.
    let debounceTimer;
    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (window.location.pathname.match(/\/[^/]+\/[^/]+\/pull\/\d+/)) {
          injectButton();
        }
      }, 250);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ---- Init ----

  injectButton();
  observeNavigation();
})();

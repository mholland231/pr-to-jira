/**
 * Extracts PR metadata from the GitHub DOM and URL.
 * Exposed as window.PRParser for use by content.js.
 *
 * Selectors target current Primer React GitHub UI (2026) first,
 * then legacy selectors as fallbacks.
 */
window.PRParser = {
  parse() {
    const url = window.location.href;
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!match) return null;

    const [, owner, repo, prNumber] = match;

    return {
      owner,
      repo,
      prNumber: parseInt(prNumber, 10),
      url,
      title: this.getTitle(),
      body: this.getBody(),
      branch: this.getBranch(),
      author: this.getAuthor(),
    };
  },

  /** Try multiple selectors in order, return first non-empty textContent */
  _textFrom(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent.trim();
        if (text) return text;
      }
    }
    return '';
  },

  getTitle() {
    // The PR title h1 in Primer React UI has class like "prc-PageHeader-Title-XXXXX"
    // Its child span contains the actual title text.
    const titleH1 = document.querySelector('h1[class*="PageHeader-Title"]');
    if (titleH1) {
      // Get the first meaningful span (the title, not the PR number)
      const span = titleH1.querySelector('span');
      if (span) return span.textContent.trim();
      return titleH1.textContent.trim();
    }

    return this._textFrom([
      '.gh-header-title .js-issue-title',
      'h1 > .js-issue-title',
      '[data-testid="issue-title"]',
      'h1 bdi',
    ]);
  },

  getBody() {
    // First .js-comment-body is the PR description (still present in React UI)
    const selectors = [
      '.js-comment-body',
      '.comment-body',
      '[data-testid="comment-body"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.innerText.trim();
        if (text) return text;
      }
    }
    return '';
  },

  getBranch() {
    return this._textFrom([
      // Primer React: branch name link with module class
      'a[class*="PullRequestBranchName-module"]',
      'a[class*="BranchName-BranchName"]',
      // Legacy
      '.head-ref a',
      '.head-ref .css-truncate-target',
    ]);
  },

  getAuthor() {
    // In Primer React UI, author is a link inside the subtitle area under h2
    // with classes like "fgColor-muted text-bold"
    const subtitleAuthor = document.querySelector('[class*="PageHeader-Title"] a.text-bold[class*="fgColor-muted"]');
    if (subtitleAuthor) return subtitleAuthor.textContent.trim();

    return this._textFrom([
      '.gh-header-meta .author',
      '[data-testid="issue-body-header-author"]',
      '.js-discussion .author',
    ]);
  },
};

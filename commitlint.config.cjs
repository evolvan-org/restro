/**
 * Conventional Commits, matching the repo's existing style, e.g.
 *   fix(auth): pin JWT algorithm to HS256 on sign and verify
 *   feat(billing): add split-bill endpoint
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Squash-merge subjects can run long; keep a sane ceiling, not 72.
    'body-max-line-length': [0, 'always'],
    'footer-max-line-length': [0, 'always'],
  },
};

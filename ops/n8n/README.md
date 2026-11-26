# Deployment notifications (n8n → Google Chat)

Every production deploy (`.github/workflows/deploy.yml`) ends with a `notify` job that
POSTs the outcome to n8n. n8n fetches the Jira tickets shipped in the release and posts a
Card v2 message to the **Restro Deployments** Google Chat space.

```
deploy.yml ─ deploy job (VPS) ─► notify job (always) ──POST + X-Webhook-Secret──► n8n webhook
                                                                                     │
                                                                          Normalize payload
                                                                                     │
                                                                       Deployment succeeded?
                                              ┌───────────── yes ────────────────────┴──── no ─────────┐
                                     Has Jira tickets?                                        Format failure card
                              yes ┌──────────┴──────────┐ no                                          │
                    Fetch Jira ticket (one per key)     │                                             │
                                  └──► Format release notes card                                      │
                                                        └──────────────► Post to Google Chat ◄────────┘
```

- **Success 🟢**: environment, commit, who deployed, then one row per Jira ticket (title link,
  status, type, assignee, fix version; titles only, no description). Commits with no Jira key in
  their title (chores, hotfixes) are listed briefly under **Untracked**; merge commits are skipped.
  Tickets Jira can't return are listed as "Not found" instead of breaking the card.
- **Failure 🔴**: the failed step, links to the failed job log and the run, the tickets that
  didn't ship, and an `@all` mention. **Cancelled ⚪**: same card, no mention.

## Payload (GitHub → n8n)

```jsonc
{
  "status": "success", // success | failure | cancelled
  "environment": "production",
  "repository": "evolvan-org/restro",
  "ref": "main",
  "commit_sha": "…",
  "commit_message": "…",
  "commit_url": "…",
  "compare_url": "…",
  "author": "…",
  "triggered_by": "…",
  "jira_ticket_id": "REST-93", // first key, kept for simple consumers
  "jira_ticket_ids": ["REST-93", "REST-81"], // every key in the release
  "commits": [{ "sha": "…", "title": "REST-93 …", "author": "…" }],
  "run_url": "…",
  "job_url": "…",
  "run_attempt": 1,
  "failed_step": "Build and restart", // empty on success
}
```

Jira keys are collected from the ref name and **every commit in the push** (`before...sha`),
not just the head commit: a release to `main` is a merge commit whose message is only
"Merge pull request #N from …/development", while the squashed `REST-123 …` commits sit
underneath it. Only `REST-<n>` matches (`JIRA_KEY_PATTERN` in the workflow), so strings like
`UTF-8` are not mistaken for tickets.

## One-time setup

### 1. n8n

1. **Import** `deploy-notifications.workflow.json` (Workflows → Import from file).
2. **Create credentials** (Credentials → New), then select them on the matching nodes:

   | Node                  | Credential type   | Value                                                                                                      |
   | --------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------- |
   | GitHub deploy webhook | Header Auth       | Name `X-Webhook-Secret`, Value = a long random string (`openssl rand -hex 32`)                             |
   | Fetch Jira ticket     | Jira SW Cloud API | Email + [API token](https://id.atlassian.com/manage-profile/security/api-tokens) of a bot user (read-only) |
   | Post to Google Chat   | Custom Auth       | `{"qs": {"key": "<key>", "token": "<token>"}}` from the space's incoming-webhook URL                       |

   In Google Chat: **Restro Deployments** → Apps & integrations → Webhooks → Add. The URL is
   `https://chat.googleapis.com/v1/spaces/<SPACE_ID>/messages?key=<key>&token=<token>`.

3. **Edit `CONFIG`** at the top of the _Normalize payload_ node: `jiraBaseUrl`,
   and `googleChatUrl` (the URL above **without** `?key=…&token=…`).
4. **Activate** the workflow and copy the **Production** webhook URL
   (`https://<n8n-host>/webhook/restro-deploy`).

Secrets live only in n8n credentials; the workflow JSON in git holds none.

### 2. GitHub

Repo → Settings → Secrets and variables → Actions → **Repository secrets** (not the
`production` environment — the `notify` job doesn't run in it):

| Secret                   | Value                                        |
| ------------------------ | -------------------------------------------- |
| `N8N_DEPLOY_WEBHOOK_URL` | the n8n Production webhook URL               |
| `N8N_WEBHOOK_SECRET`     | the same value as the Header Auth credential |

If either is missing the job logs a warning and skips. If n8n is unreachable the job also only
warns: a notification outage never turns a good deploy red.

## Testing

Send a fake event straight to n8n (use the **Test** URL while the workflow editor is listening):

```bash
curl -fsS -X POST "$N8N_URL" -H 'Content-Type: application/json' \
  -H "X-Webhook-Secret: $N8N_SECRET" \
  -d '{"status":"failure","repository":"evolvan-org/restro","ref":"main","commit_sha":"6652801","commit_message":"test","jira_ticket_ids":["REST-95"],"commits":[],"run_url":"https://github.com/evolvan-org/restro/actions","failed_step":"Build and restart"}'
```

A request without the right `X-Webhook-Secret` must get `403`. End-to-end, Actions → Deploy →
_Run workflow_ on `main` redeploys and posts a real card.

## Changing the workflow

The JSON is the exported workflow. After editing in n8n, re-export it over this file
(Workflow → Download) and strip any credential ids if you want to keep it environment-neutral.

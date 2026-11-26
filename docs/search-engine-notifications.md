# Search engine notifications

After each deploy of the docs site, `deploy-pages` tells search engines which pages the deploy changed, so they need not wait for a crawl to find out. Sitemap submission alone has been unreliable for a project site on `github.io`: Search Console fails to fetch the sitemap again and again, although the site serves it correctly.

## How it works

1. **Every page in the sitemap has a `<lastmod>`.** It is the last commit date of the page's source, from `apps/landing/scripts/page-lastmod.mjs`. A shallow clone has no real dates, so its sitemap leaves out every `<lastmod>` rather than stating one wrong date for all pages.
2. **The build job lists what changed, before it deploys** (`notify-search-engines.mjs prepare`).
   - At that point the live sitemap is still the previous one, so comparing the two gives the pages that are new, redated or removed.
   - **At most 100 changes per run,** newest first. The rest are named in the log as skipped.
   - **If the live sitemap cannot be read,** only pages dated in the last 7 days are listed.
3. **After a successful deploy of `main`, the `notify-search-engines` job sends the list** (`notify-search-engines.mjs submit`):
   - **IndexNow,** always. That reaches Bing, Yandex, Naver, Seznam and others, not Google.
   - **Google's Indexing API,** once it is set up as below. Until then the job logs `not configured, skipped`.

Nothing in this can fail a deploy. Every problem is a workflow warning.

**The first deploy after this lands sends every page once,** because the live sitemap has no dates yet. That is 84 pages, under the per-run limit.

## Safety in a public repository

- **There are no secrets.**
  - The IndexNow key, `apps/landing/public/<key>.txt`, is public by design: the file on the site is what proves the site owns the key. Someone who copies it can only ask for this site's own URLs to be crawled.
  - Google is reached with a token that lives for 10 minutes. GitHub's OIDC issues it through workload identity federation, so no JSON key exists in the repository's secrets or anywhere else.
- **Only `main` can get a Google token.**
  - The provider below accepts tokens for this repository's id on `refs/heads/main` and nothing else.
  - The workflow has no `pull_request` trigger, so a fork's pull request never runs it, and the job also checks the ref.
  - `id-token: write` is granted to the notification job alone.
- **The service account has no Google Cloud roles.**
  - It can call the Indexing API and nothing else in the project.
  - In Search Console it is an owner of the property, because the Indexing API requires that.
  - To turn Google off, delete the two repository variables. To revoke it completely, remove the service account from Search Console.
- **The Google auth action is pinned by commit,** because it handles the OIDC token.

**What Google's Indexing API is for:** Google documents it for pages with job posting or livestream data. For other pages it may ignore the request or withdraw access. That would stop the notifications and nothing else: the site and its ranking are untouched.

## Setting up Google (once, by the site's owner)

You need `gcloud`, signed in as someone who can create a project, and owner access to the site's Search Console property.

### 1. A project, the APIs, and a service account with no roles

```sh
PROJECT_ID=hozo-indexing        # any free project id
gcloud projects create "$PROJECT_ID"
gcloud services enable indexing.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  --project "$PROJECT_ID"
gcloud iam service-accounts create docs-indexing --project "$PROJECT_ID" \
  --display-name "Hozo docs indexing"
```

### 2. Trust GitHub's tokens for this repository's `main`, and nothing else

`1331722309` is `iray-tno/hozo`'s repository id (`gh api repos/iray-tno/hozo -q .id`). Matching the id rather than the name means a repository created later under the same name is not trusted.

```sh
gcloud iam workload-identity-pools create github --project "$PROJECT_ID" \
  --location global --display-name "GitHub Actions"
gcloud iam workload-identity-pools providers create-oidc hozo-main --project "$PROJECT_ID" \
  --location global --workload-identity-pool github \
  --issuer-uri https://token.actions.githubusercontent.com \
  --attribute-mapping "google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.ref=assertion.ref" \
  --attribute-condition "assertion.repository_id == '1331722309' && assertion.ref == 'refs/heads/main'"
POOL=$(gcloud iam workload-identity-pools describe github --project "$PROJECT_ID" \
  --location global --format 'value(name)')
gcloud iam service-accounts add-iam-policy-binding \
  "docs-indexing@$PROJECT_ID.iam.gserviceaccount.com" --project "$PROJECT_ID" \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/$POOL/attribute.repository_id/1331722309"
```

### 3. Make the service account an owner in Search Console

1. In Search Console, open the property for `https://iray-tno.github.io/hozo/`.
2. Go to **Settings → Users and permissions → Add user**.
3. Enter `docs-indexing@<PROJECT_ID>.iam.gserviceaccount.com` with permission **Owner**.

### 4. Tell the workflow where to authenticate

These are repository *variables*, not secrets: neither value grants anything by itself.

```sh
gh variable set GOOGLE_WORKLOAD_IDENTITY_PROVIDER --repo iray-tno/hozo --body \
  "$(gcloud iam workload-identity-pools providers describe hozo-main --project "$PROJECT_ID" \
     --location global --workload-identity-pool github --format 'value(name)')"
gh variable set GOOGLE_INDEXING_SERVICE_ACCOUNT --repo iray-tno/hozo \
  --body "docs-indexing@$PROJECT_ID.iam.gserviceaccount.com"
```

### 5. Check it

The next deploy of `main` that changes a page logs `Google Indexing API: N URL(s) sent` in the **Notify search engines** step of `notify-search-engines`. Common answers when it doesn't:

- **`403`:** the service account is not an owner of the property (step 3).
- **`::warning::... quota reached`:** the day's 200 calls are spent. The remaining pages are sent with the next deploy that changes them.

## IndexNow

There is nothing to set up. To see what it received, add the site in Bing Webmaster Tools; the **IndexNow** page lists the submitted URLs. To stop it, delete `apps/landing/public/<key>.txt`. To change the key, replace that file with one whose name and content are a new 32-character hex key.

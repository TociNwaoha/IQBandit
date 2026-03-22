/**
 * lib/twitter.ts
 * Twitter API v2 client using OAuth 1.0a.
 * No external dependencies — uses Node.js built-in crypto module.
 * SERVER-SIDE ONLY — never import in "use client" components.
 *
 * OAuth 1.0a signature method: HMAC-SHA1 (Twitter's required method)
 * Signing key: percent_encode(consumer_secret) + "&" + percent_encode(token_secret)
 */

import crypto from "crypto";

// ─── types ────────────────────────────────────────────────────────────────────

export interface TwitterCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

// ─── OAuth 1.0a helpers ───────────────────────────────────────────────────────

/** RFC 3986 percent-encoding — stricter than encodeURIComponent. */
function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

/**
 * Generates an OAuth 1.0a Authorization header.
 *
 * @param method  HTTP method (GET, POST, etc.)
 * @param url     Request URL without query string
 * @param params  Additional parameters to include in the signature base string
 *                (URL query params for GET; empty for JSON POST)
 * @param credentials  Twitter API keys and tokens
 */
export function generateOAuthHeader(
  method: string,
  url: string,
  params: Record<string, string>,
  credentials: TwitterCredentials
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key:     credentials.apiKey,
    oauth_nonce:            crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp:        Math.floor(Date.now() / 1000).toString(),
    oauth_token:            credentials.accessToken,
    oauth_version:          "1.0",
  };

  // Combine request params + OAuth params for signature computation
  const allParams: Record<string, string> = { ...params, ...oauthParams };

  // Sort keys and build the parameter string
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join("&");

  // Build the signature base string
  const signatureBase = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(paramString),
  ].join("&");

  // Signing key: consumer_secret + "&" + token_secret (both percent-encoded)
  const signingKey =
    `${percentEncode(credentials.apiSecret)}&${percentEncode(credentials.accessSecret)}`;

  const signature = crypto
    .createHmac("sha1", signingKey)
    .update(signatureBase)
    .digest("base64");

  // Build Authorization header — only OAuth params (no request params)
  const headerParams: Record<string, string> = { ...oauthParams, oauth_signature: signature };
  const headerStr = Object.keys(headerParams)
    .sort()
    .map((k) => `${k}="${percentEncode(headerParams[k])}"`)
    .join(", ");

  return `OAuth ${headerStr}`;
}

// ─── API calls ────────────────────────────────────────────────────────────────

/**
 * Tests credentials by calling GET /2/users/me.
 * Returns the user's handle and display name on success.
 * Never throws — returns { success: false } on any failure.
 */
export async function testConnection(
  credentials: TwitterCredentials
): Promise<{ success: boolean; handle: string; name: string }> {
  const baseUrl = "https://api.twitter.com/2/users/me";
  // query params go into the signature
  const queryParams = { "user.fields": "username,name" };
  const authHeader = generateOAuthHeader("GET", baseUrl, queryParams, credentials);

  console.log("[twitter] Testing connection...");
  try {
    const res = await fetch(`${baseUrl}?user.fields=username%2Cname`, {
      headers: { Authorization: authHeader },
    });
    if (!res.ok) {
      const text = await res.text();
      console.log(`[twitter] Test failed: ${res.status} ${text}`);
      return { success: false, handle: "", name: "" };
    }
    const data = (await res.json()) as { data: { username: string; name: string } };
    const username = data.data?.username ?? "";
    const name = data.data?.name ?? "";
    console.log(`[twitter] Connected as @${username}`);
    return { success: true, handle: `@${username}`, name };
  } catch (err) {
    console.log("[twitter] Test connection error:", err);
    return { success: false, handle: "", name: "" };
  }
}

/**
 * Posts a single tweet.
 * Returns the tweet ID and URL.
 * Throws on API error.
 */
export async function postTweet(
  credentials: TwitterCredentials,
  text: string
): Promise<{ id: string; url: string }> {
  const url = "https://api.twitter.com/2/tweets";
  // JSON body is NOT included in OAuth signature params
  const authHeader = generateOAuthHeader("POST", url, {}, credentials);

  console.log("[twitter] Posting tweet...");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization:  authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[twitter] postTweet failed: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as { data: { id: string } };
  const id = data.data.id;
  const tweetUrl = `https://x.com/i/web/status/${id}`;
  console.log(`[twitter] Tweet posted: ${tweetUrl}`);
  return { id, url: tweetUrl };
}

/**
 * Posts a thread of tweets in sequence.
 * Each tweet after the first replies to the previous.
 * Returns arrays of IDs and URLs in order.
 * Throws on any API error (partial threads may have posted).
 */
export async function postThread(
  credentials: TwitterCredentials,
  tweets: string[]
): Promise<{ ids: string[]; urls: string[] }> {
  if (tweets.length === 0) {
    throw new Error("[twitter] postThread requires at least one tweet");
  }

  console.log(`[twitter] Posting thread of ${tweets.length} tweets...`);
  const ids: string[] = [];
  const urls: string[] = [];

  for (let i = 0; i < tweets.length; i++) {
    const url = "https://api.twitter.com/2/tweets";
    const authHeader = generateOAuthHeader("POST", url, {}, credentials);

    const body: Record<string, unknown> = { text: tweets[i] };
    if (ids.length > 0) {
      body.reply = { in_reply_to_tweet_id: ids[ids.length - 1] };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization:  authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `[twitter] postThread tweet ${i + 1}/${tweets.length} failed: ${res.status} ${errText}`
      );
    }

    const data = (await res.json()) as { data: { id: string } };
    const id = data.data.id;
    const tweetUrl = `https://x.com/i/web/status/${id}`;
    ids.push(id);
    urls.push(tweetUrl);
    console.log(`[twitter] Thread tweet ${i + 1}/${tweets.length} posted: ${tweetUrl}`);
  }

  return { ids, urls };
}

/**
 * Schedules a tweet by storing it as a draft with scheduled_for set.
 *
 * NOTE: X API free tier does not support native scheduling.
 * This stores the tweet in SQLite as a draft. A cron job should call
 * getScheduledPosts() from lib/posts.ts and post due entries.
 *
 * TODO: Implement cron-based scheduler in Phase 4
 *
 * @returns The created draft post ID
 */
export async function scheduleTweet(
  credentials: TwitterCredentials,
  userId: string,
  text: string,
  scheduledFor: Date
): Promise<number> {
  // TODO: Implement cron-based scheduler in Phase 4
  // Twitter API free tier doesn't support native scheduling.
  // Draft stored in SQLite; cron job runs getScheduledPosts() and calls postTweet().
  const { createDraft } = await import("@/lib/posts");
  return createDraft(userId, "twitter", text, undefined, scheduledFor.toISOString());
}

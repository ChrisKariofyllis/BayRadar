import { prisma } from "@/db/prisma";
import { getGixenRuntimeConfig } from "@/services/config";

const GIXEN_ORIGIN = "https://www.gixen.com";
const GIXEN_LOGIN_URL = `${GIXEN_ORIGIN}/main/home_1.php`;
const GIXEN_HOME_URL = `${GIXEN_ORIGIN}/main/home_2.php`;
const GIXEN_TIMEOUT_MS = 20_000;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export interface GixenScheduleResult {
  success: boolean;
  snipeId?: string;
  error?: string;
}

export interface GixenConnectionResult {
  success: boolean;
  message: string;
  handshakeOk: boolean;
  mirrorActive: boolean;
}

interface GixenSession {
  jar: CookieJar;
  sessionId: string;
  html: string;
  mirrorActive: boolean;
}

export async function scheduleSnipe(itemId: string, maxBid: number): Promise<GixenScheduleResult> {
  const item = normalizeEbayItemId(itemId);
  if (!item) {
    return { success: false, error: "A numeric eBay item ID is required." };
  }
  if (!Number.isFinite(maxBid) || maxBid <= 0) {
    return { success: false, error: "maxBid must be a positive number." };
  }

  const credentials = await requireGixenCredentials();
  if (!credentials.ok) {
    return { success: false, error: credentials.error };
  }

  const bid = formatGixenBid(maxBid);

  try {
    const session = await openGixenSession(credentials.username, credentials.password);
    if (isSnipeListed(session.html, item)) {
      await persistHandshake({
        ok: true,
        mirrorActive: session.mirrorActive,
        cookie: session.jar.header(),
        sessionId: session.sessionId,
      });
      return { success: true, snipeId: item };
    }

    const form = findAddSnipeForm(session.html, session.sessionId);
    if (!form) {
      return { success: false, error: "Could not find Gixen's add-snipe form. The site layout may have changed." };
    }

    const payload = { ...form.fields };
    payload[form.itemField] = item;
    payload[form.bidField] = bid;
    if (form.usernameField && credentials.username) {
      payload[form.usernameField] = credentials.username;
    }
    if (form.offsetField && !payload[form.offsetField]) {
      payload[form.offsetField] = "6";
    }
    if (form.offsetMirrorField && !payload[form.offsetMirrorField]) {
      payload[form.offsetMirrorField] = "6";
    }

    const submitted = await gixenRequest(form.action, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: GIXEN_ORIGIN,
        Referer: GIXEN_HOME_URL,
      },
      body: toFormBody(payload),
    }, session.jar);

    await persistHandshake({
      ok: true,
      mirrorActive: session.mirrorActive,
      cookie: session.jar.header(),
      sessionId: session.sessionId,
    });

    if (isSnipeListed(submitted.html, item)) {
      return { success: true, snipeId: item };
    }

    const explicit = firstExplicitError(submitted.html);
    if (explicit) {
      return { success: false, error: explicit };
    }

    return {
      success: false,
      error: "Gixen accepted the session but did not confirm the snipe in the list. Check gixen.com.",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export type GixenOutcomeStatus = "WON" | "OUTBID" | "FAILED";

export interface GixenSnipeOutcome {
  status: GixenOutcomeStatus;
  finalPrice?: number;
  rawStatus?: string;
}

export async function syncSnipeOutcomes(
  itemIds?: string[],
): Promise<Record<string, GixenSnipeOutcome>> {
  const credentials = await requireGixenCredentials();
  if (!credentials.ok) {
    throw new Error(credentials.error);
  }

  const session = await openGixenSession(credentials.username, credentials.password);
  await persistHandshake({
    ok: true,
    mirrorActive: session.mirrorActive,
    cookie: session.jar.header(),
    sessionId: session.sessionId,
  });

  const parsed = parseSnipeOutcomes(session.html);
  if (itemIds == null) return parsed;

  const wanted = new Set(
    itemIds.map((id) => normalizeEbayItemId(id)).filter((id): id is string => Boolean(id)),
  );
  const filtered: Record<string, GixenSnipeOutcome> = {};
  for (const id of wanted) {
    if (parsed[id]) filtered[id] = parsed[id];
  }
  return filtered;
}

export async function cancelSnipe(itemId: string): Promise<GixenScheduleResult> {
  const item = normalizeEbayItemId(itemId);
  if (!item) {
    return { success: false, error: "A numeric eBay item ID is required." };
  }

  const credentials = await requireGixenCredentials();
  if (!credentials.ok) {
    return { success: false, error: credentials.error };
  }

  try {
    const session = await openGixenSession(credentials.username, credentials.password);
    if (!isSnipeListed(session.html, item)) {
      await persistHandshake({
        ok: true,
        mirrorActive: session.mirrorActive,
        cookie: session.jar.header(),
        sessionId: session.sessionId,
      });
      return { success: true, snipeId: item };
    }

    const form = findDeleteSnipe(session.html, item, session.sessionId, credentials.username);
    if (!form) {
      return { success: false, error: "Could not find Gixen's delete action for this item." };
    }

    const submitted = await gixenRequest(form.action, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: GIXEN_ORIGIN,
        Referer: GIXEN_HOME_URL,
      },
      body: toFormBody(form.fields),
    }, session.jar);

    await persistHandshake({
      ok: true,
      mirrorActive: session.mirrorActive,
      cookie: session.jar.header(),
      sessionId: session.sessionId,
    });

    if (!isSnipeListed(submitted.html, item)) {
      return { success: true, snipeId: item };
    }

    const explicit = firstExplicitError(submitted.html);
    return {
      success: false,
      error: explicit || "Gixen did not remove the snipe. Check gixen.com.",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function testGixenConnection(): Promise<GixenConnectionResult> {
  const credentials = await requireGixenCredentials();
  if (!credentials.ok) {
    await persistHandshake({ ok: false, mirrorActive: false, cookie: "", sessionId: "" });
    return {
      success: false,
      message: credentials.error,
      handshakeOk: false,
      mirrorActive: false,
    };
  }

  try {
    const session = await openGixenSession(credentials.username, credentials.password, { forceLogin: true });
    await persistHandshake({
      ok: true,
      mirrorActive: session.mirrorActive,
      cookie: session.jar.header(),
      sessionId: session.sessionId,
    });

    const mirrorNote = session.mirrorActive
      ? "Gixen Mirror is active on this account."
      : "Logged in, but Mirror status was not confirmed on the dashboard.";

    return {
      success: true,
      handshakeOk: true,
      mirrorActive: session.mirrorActive,
      message: `Gixen web session is valid. ${mirrorNote}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await persistHandshake({ ok: false, mirrorActive: false, cookie: "", sessionId: "" });
    return { success: false, message, handshakeOk: false, mirrorActive: false };
  }
}

export function normalizeEbayItemId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const restShape = trimmed.match(/^v\d+\|(\d+)\|/i);
  if (restShape?.[1]) return restShape[1];

  const digits = trimmed.match(/(\d{9,})/);
  if (digits?.[1]) return digits[1];

  return /^\d+$/.test(trimmed) ? trimmed : "";
}

function formatGixenBid(maxBid: number): string {
  return (Math.round(maxBid * 100) / 100).toFixed(2);
}

async function requireGixenCredentials(): Promise<
  { ok: true; username: string; password: string } | { ok: false; error: string }
> {
  const config = await getGixenRuntimeConfig();
  if (!config.enabled) {
    return { ok: false, error: "Gixen sniping is disabled. Enable it in Settings." };
  }
  if (!config.username || !config.password) {
    return { ok: false, error: "Gixen username and password are required." };
  }
  return { ok: true, username: config.username, password: config.password };
}

async function openGixenSession(
  username: string,
  password: string,
  options?: { forceLogin?: boolean },
): Promise<GixenSession> {
  const config = await getGixenRuntimeConfig();
  const jar = new CookieJar();

  if (!options?.forceLogin && config.sessionCookie) {
    jar.load(config.sessionCookie);
    const reused = await fetchHome(jar, config.sessionId);
    if (looksLoggedIn(reused.html)) {
      return {
        jar,
        sessionId: extractSessionId(reused.html) || config.sessionId,
        html: reused.html,
        mirrorActive: detectMirror(reused.html),
      };
    }
    jar.clear();
  }

  const login = await gixenRequest(GIXEN_LOGIN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: GIXEN_ORIGIN,
      Referer: `${GIXEN_ORIGIN}/`,
    },
    body: toFormBody({
      username,
      password,
      signin: "signin",
      Submit: "Log in Now",
    }),
  }, jar);

  if (looksLoginFailure(login.html)) {
    throw new Error(loginFailureMessage(login.html));
  }

  if (!jar.hasAuthCookie()) {
    throw new Error("Gixen did not set a session cookie. Login was rejected.");
  }

  const refresh = extractMetaRefresh(login.html);
  const homeUrl = refresh && isTrustedGixenUrl(refresh) ? refresh : withSessionQuery(GIXEN_HOME_URL, extractSessionId(login.html));
  const home = await gixenRequest(homeUrl, { method: "GET", headers: { Referer: GIXEN_LOGIN_URL } }, jar);

  if (looksLoginFailure(home.html) || !looksLoggedIn(home.html)) {
    throw new Error(loginFailureMessage(home.html) || "Gixen did not accept the login. Check the username and password.");
  }

  return {
    jar,
    sessionId: extractSessionId(home.html),
    html: home.html,
    mirrorActive: detectMirror(home.html),
  };
}

async function fetchHome(jar: CookieJar, sessionId?: string) {
  return gixenRequest(withSessionQuery(GIXEN_HOME_URL, sessionId), {
    method: "GET",
    headers: { Referer: GIXEN_ORIGIN },
  }, jar);
}

async function persistHandshake(input: {
  ok: boolean;
  mirrorActive: boolean;
  cookie: string;
  sessionId: string;
}): Promise<void> {
  const current = await getGixenRuntimeConfig();
  const data = {
    handshakeOk: input.ok,
    handshakeAt: new Date(),
    mirrorActive: input.mirrorActive,
    sessionCookie: input.cookie || null,
    sessionId: input.sessionId || null,
  };

  await prisma.gixenSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      username: current.username,
      password: current.password || null,
      enabled: current.enabled,
      ...data,
    },
    update: data,
  });
}

async function gixenRequest(
  url: string,
  init: RequestInit,
  jar: CookieJar,
  hops = 0,
): Promise<{ status: number; html: string; url: string }> {
  if (hops > 6) {
    throw new Error("Too many redirects while talking to Gixen.");
  }
  if (!isTrustedGixenUrl(url)) {
    throw new Error("Refusing to follow a URL outside gixen.com.");
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(GIXEN_TIMEOUT_MS),
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": BROWSER_UA,
        ...(init.headers ?? {}),
        ...(jar.header() ? { Cookie: jar.header() } : {}),
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not reach Gixen: ${reason}`);
  }

  jar.absorb(readSetCookies(response.headers));

  const location = response.headers.get("location");
  if (location && [301, 302, 303, 307, 308].includes(response.status)) {
    const next = new URL(location, url).toString();
    return gixenRequest(next, { method: "GET", headers: { Referer: url } }, jar, hops + 1);
  }

  const html = await response.text();
  if (response.status >= 500) {
    throw new Error(`Gixen returned HTTP ${response.status}. The session may have expired.`);
  }
  return { status: response.status, html, url };
}

class CookieJar {
  private readonly cookies = new Map<string, string>();

  load(header: string) {
    for (const part of header.split(";")) {
      const trimmed = part.trim();
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      this.cookies.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim());
    }
  }

  absorb(setCookies: string[]) {
    for (const header of setCookies) {
      const pair = header.split(";")[0] ?? "";
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (name) this.cookies.set(name, value);
    }
  }

  header(): string {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  hasAuthCookie(): boolean {
    return this.cookies.has("PHPSESSID") || this.cookies.has("sessionid") || this.cookies.size > 0;
  }

  clear() {
    this.cookies.clear();
  }
}

interface AddSnipeForm {
  action: string;
  itemField: string;
  bidField: string;
  usernameField?: string;
  offsetField?: string;
  offsetMirrorField?: string;
  fields: Record<string, string>;
}

function findAddSnipeForm(html: string, sessionId: string): AddSnipeForm | null {
  const named = html.match(/<form\b[^>]*\bname=["']addsnipe["'][^>]*>[\s\S]*?<\/form>/i)?.[0];
  const candidates = named ? [named] : html.match(/<form\b[^>]*>[\s\S]*?<\/form>/gi) ?? [];

  for (const block of candidates) {
    const fields = extractFormFields(block);
    const itemField = pickField(Object.keys(fields), ["newitemid", "itemid"], /item/i, /edit/i);
    const bidField = pickField(Object.keys(fields), ["newmaxbid", "maxbid"], /max|bid/i, /offset|group|edit/i);
    if (!itemField || !bidField) continue;

    const actionAttr = block.match(/<form\b[^>]*\baction=["']([^"']*)["']/i)?.[1]?.trim() ?? "";
    const action = resolveGixenAction(actionAttr, sessionId);
    if (!action) continue;

    return {
      action,
      itemField,
      bidField,
      usernameField: pickField(Object.keys(fields), ["username"], /^username$/i),
      offsetField: pickField(Object.keys(fields), ["newbidoffset"], /offset/i, /mirror/i),
      offsetMirrorField: pickField(Object.keys(fields), ["newbidoffsetmirror"], /offsetmirror/i),
      fields,
    };
  }

  return null;
}

function extractFormFields(formHtml: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const inputRe = /<(input|select|textarea)\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = inputRe.exec(formHtml))) {
    const attrs = match[2] ?? "";
    const name = attr(attrs, "name");
    if (!name) continue;
    const type = (attr(attrs, "type") || "text").toLowerCase();
    if (type === "submit" || type === "button" || type === "image") continue;
    fields[name] = attr(attrs, "value");
  }

  const selectRe = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
  while ((match = selectRe.exec(formHtml))) {
    const name = attr(match[1] ?? "", "name");
    if (!name) continue;
    const selected = match[2]?.match(/<option\b([^>]*)\bselected\b[^>]*>(?:[^<]*)/i);
    const first = match[2]?.match(/<option\b([^>]*)>/i);
    fields[name] = attr(selected?.[1] ?? first?.[1] ?? "", "value");
  }

  return fields;
}

function pickField(
  names: string[],
  preferred: string[],
  include: RegExp,
  exclude?: RegExp,
): string | undefined {
  const lowerPreferred = preferred.map((name) => name.toLowerCase());
  const exact = names.find((name) => lowerPreferred.includes(name.toLowerCase()));
  if (exact) return exact;
  return names.find((name) => include.test(name) && !exclude?.test(name));
}

function attr(source: string, name: string): string {
  return source.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1]?.trim() ?? "";
}

function resolveGixenAction(action: string, sessionId: string): string | null {
  const fallback = withSessionQuery(GIXEN_HOME_URL, sessionId);
  if (!action) return fallback;
  const resolved = new URL(action, GIXEN_HOME_URL).toString();
  return isTrustedGixenUrl(resolved) ? resolved : null;
}

function withSessionQuery(url: string, sessionId?: string): string {
  if (!sessionId) return url;
  const next = new URL(url);
  if (!next.searchParams.get("sessionid")) {
    next.searchParams.set("sessionid", sessionId);
  }
  return next.toString();
}

function extractSessionId(html: string): string {
  return html.match(/[?&]sessionid=(\d+)/i)?.[1] ?? "";
}

function extractMetaRefresh(html: string): string | null {
  const content = html.match(/http-equiv=["']refresh["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const url = content?.match(/url=(.+)$/i)?.[1]?.trim();
  return url ? new URL(url, GIXEN_HOME_URL).toString() : null;
}

function looksLoggedIn(html: string): boolean {
  if (!html || looksLoginFailure(html)) return false;
  const low = html.toLowerCase();
  if (low.includes("logout") || low.includes("log out") || low.includes("logmeout")) return true;
  return Boolean(findAddSnipeForm(html, extractSessionId(html)));
}

function looksLoginFailure(html: string): boolean {
  return /could not log (you )?in|password is not a match|incorrect|invalid login/i.test(html);
}

function loginFailureMessage(html: string): string {
  if (/\(33\)/.test(html) || /password is not a match/i.test(html)) {
    return "Gixen refused the password. Check GIXEN_USERNAME / GIXEN_PASSWORD.";
  }
  const line = firstExplicitError(html);
  return line || "Gixen did not accept the login.";
}

function detectMirror(html: string): boolean {
  const low = html.toLowerCase();
  if (/subscribe to (gixen )?mirror|upgrade to mirror|mirror is an optional/i.test(low)) {
    return false;
  }
  if (/newbidoffsetmirror|gixen mirror|mirror subscriber|mirror expires|mirror until/i.test(low)) {
    return true;
  }
  return /mirror/i.test(low) && /unlimited/i.test(low);
}

function findDeleteSnipe(
  html: string,
  itemId: string,
  sessionId: string,
  username: string,
): { action: string; fields: Record<string, string> } | null {
  const escaped = itemId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const edit = html.match(new RegExp(`name=["']edititemid_(${escaped}|\\d+)["'][^>]*value=["']${escaped}["']`, "i"))
    ?? html.match(new RegExp(`name=["']edititemid_${escaped}["']`, "i"))
    ?? html.match(new RegExp(`name=["']edit_${escaped}["']`, "i"));

  const start = edit ? html.indexOf(edit[0]) : html.indexOf(itemId);
  const region = start >= 0 ? html.slice(Math.max(0, start - 200), start + 5000) : html;
  const deleteName =
    region.match(/name=["'](delete_\d+)["'][^>]*(?:value=["']Delete["']|type=["']submit["'])/i)?.[1]
    ?? region.match(/name=["'](delete_\d+)["']/i)?.[1]
    ?? (html.includes(`delete_${itemId}`) ? `delete_${itemId}` : null);

  if (!deleteName) return null;

  const action = resolveGixenAction("", sessionId);
  if (!action) return null;

  return {
    action,
    fields: {
      username,
      [deleteName]: "Delete",
    },
  };
}

function parseSnipeOutcomes(html: string): Record<string, GixenSnipeOutcome> {
  const outcomes: Record<string, GixenSnipeOutcome> = {};
  const itemRe = /name=["']edititemid_(\d+)["'][^>]*value=["'](\d+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(html))) {
    const itemId = match[2] || match[1];
    if (!itemId) continue;
    const start = Math.max(0, match.index - 80);
    const chunk = decodeHtml(html.slice(start, match.index + 2800));
    const main = extractLabeledStatus(chunk, "main") ?? extractBareStatus(chunk);
    const mirror = extractLabeledStatus(chunk, "mirror");
    const mapped = mapGixenOutcome(main, mirror);
    if (!mapped) continue;
    outcomes[itemId] = {
      status: mapped,
      rawStatus: [main, mirror].filter(Boolean).join(" / ") || undefined,
      finalPrice: extractCurrentBid(chunk),
    };
  }
  return outcomes;
}

function extractLabeledStatus(chunk: string, which: "main" | "mirror"): string | undefined {
  const labeled = chunk.match(
    new RegExp(`Status\\s*\\(${which}\\)\\s*:\\s*(?:</t[dh]>\\s*<t[dh][^>]*>)?\\s*([^<\\n]{1,40})`, "i"),
  )?.[1]?.trim();
  if (labeled) return labeled.replace(/&nbsp;/gi, " ").trim();
  return undefined;
}

function extractBareStatus(chunk: string): string | undefined {
  return chunk.match(/\b(WON|WIN|OUTBID|OUT\s*BID|FAILED|ERROR|SNIPED|SCHEDULED|HIGH\s*BIDDER|TOO\s*LATE)\b/i)?.[1];
}

function mapGixenOutcome(main?: string, mirror?: string): GixenOutcomeStatus | null {
  const ranks = [main, mirror].map(classifyGixenStatus);
  if (ranks.includes("WON")) return "WON";
  if (ranks.includes("OUTBID")) return "OUTBID";
  if (ranks.includes("FAILED")) return "FAILED";
  return null;
}

function classifyGixenStatus(raw?: string): GixenOutcomeStatus | null {
  if (!raw) return null;
  const text = raw.toUpperCase().replace(/\s+/g, " ").trim();
  if (/\bWON\b|\bWIN\b|YOU WON|SUCCESS/.test(text)) return "WON";
  if (/\bOUTBID\b|OUT BID|\bLOST\b/.test(text)) return "OUTBID";
  if (/\bFAIL|\bERROR\b|TOO LATE|COULD NOT|\bAUTH\b|NOT MET/.test(text)) return "FAILED";
  return null;
}

function extractCurrentBid(chunk: string): number | undefined {
  const labeled = chunk.match(
    /Current(?:\s*bid)?(?:\s*\([^)]*\))?\s*:?\s*<\/t[dh]>\s*<t[dh][^>]*>\s*([\d.,]+)/i,
  )?.[1];
  const loose = chunk.match(/([\d]+[.,]\d{2})\s*(?:EUR|USD|GBP|€|\$)/i)?.[1];
  return parseMoney(labeled ?? loose);
}

function parseMoney(raw?: string): number | undefined {
  if (!raw) return undefined;
  const normalized = raw.replace(/\s/g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : undefined;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

function isSnipeListed(html: string, itemId: string): boolean {
  if (html.includes(`edit_${itemId}`) || html.includes(`edititemid_${itemId}`)) {
    return true;
  }
  const editValue = new RegExp(`name=["']edititemid["'][^>]*value=["']${itemId}["']`, "i");
  return editValue.test(html);
}

function firstExplicitError(html: string): string | undefined {
  for (const chunk of html.split(/<[^>]+>|\n/)) {
    const line = chunk.replace(/&nbsp;/g, " ").trim();
    if (!line || line.length > 200) continue;
    if (/error|could not|cannot|invalid|not added|has ended|already|refused/i.test(line)) {
      return line;
    }
  }
  return undefined;
}

function isTrustedGixenUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return parsed.protocol === "https:" && (host === "gixen.com" || host.endsWith(".gixen.com"));
  } catch {
    return false;
  }
}

function toFormBody(fields: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    params.set(key, value);
  }
  return params.toString();
}

function readSetCookies(headers: Headers): string[] {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

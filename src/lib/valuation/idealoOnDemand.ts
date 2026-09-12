import { existsSync } from "node:fs";

import type { Browser, Page } from "puppeteer-core";
import puppeteer from "puppeteer-core";

const IDEALO_ORIGIN = "https://www.idealo.de";
const SEARCH_PATH = "/preisvergleich/MainSearchProductCategory.html";
const TIMEOUT_MS = 25_000;
const VARIANT_VISIT_LIMIT = 5;
const CHROME_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-extensions",
  "--hide-scrollbars",
  "--mute-audio",
  "--no-first-run",
  "--no-default-browser-check",
  "--lang=de-DE",
  "--window-size=1366,900",
];

const GENERIC_TOKENS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "und",
  "der",
  "die",
  "das",
  "mit",
  "fuer",
  "fur",
  "von",
  "zum",
  "zur",
  "ein",
  "eine",
  "neu",
  "new",
  "used",
  "ovp",
  "gb",
  "tb",
  "edition",
  "console",
  "konsole",
]);

const STORAGE_TOKENS = new Set(["16", "32", "64", "128", "256", "512", "1024", "2048", "825"]);
const KIT_RE = /\b(kit|objektiv|lens|bundle)\b|\d{2,3}\s*-\s*\d{2,3}(?:\s*mm)?|\+\s*\d{2,3}\s*mm/;
const BODY_RE = /\b(gehause|body|bodyonly|ohne objektiv|nur gehause|ilce)\b/;

export interface IdealoReferencePrice {
  referencePrice: number;
  title: string;
  shop: string;
  url: string;
}

export class IdealoLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdealoLookupError";
  }
}

interface ScrapedOffer {
  title: string;
  total: number;
  shop: string;
  url: string;
}

interface ProductCard {
  title: string;
  href: string;
  sponsored: boolean;
  usedAb: number | null;
}

interface ProductVariant {
  title: string;
  href: string;
}

interface ConditionSnapshot {
  neuAb: number | null;
  usedAb: number | null;
  hasBWareTab: boolean;
  heading: string;
}

let scrapeTail: Promise<void> = Promise.resolve();

export function fetchIdealoReferencePrice(query: string): Promise<IdealoReferencePrice> {
  const run = scrapeTail.then(() => scrapeIdealoReferencePrice(query));
  scrapeTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function scrapeIdealoReferencePrice(query: string): Promise<IdealoReferencePrice> {
  const q = query.trim();
  if (!q) {
    throw new IdealoLookupError("Enter a search query before fetching Idealo prices.");
  }

  const executablePath = resolveChromiumPath();
  if (!executablePath) {
    throw new IdealoLookupError("Chromium is not installed in this environment.");
  }

  const searchUrl = `${IDEALO_ORIGIN}${SEARCH_PATH}?q=${encodeURIComponent(q)}`;
  let browser: Browser | null = null;
  let debugPage: Page | null = null;

  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: CHROME_ARGS,
      defaultViewport: { width: 1366, height: 900 },
      timeout: TIMEOUT_MS,
      env: {
        ...process.env,
        HOME: process.env.HOME && process.env.HOME !== "/nonexistent" ? process.env.HOME : "/tmp",
        LANG: "de_DE.UTF-8",
      },
    });

    const page = await browser.newPage();
    debugPage = page;
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    );
    await page.setExtraHTTPHeaders({ "Accept-Language": "de-DE,de;q=0.9,en;q=0.8" });
    page.setDefaultTimeout(TIMEOUT_MS);
    page.setDefaultNavigationTimeout(TIMEOUT_MS);

    console.log(`[IdealoDebug] Search URL: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
    await sleep(1_000);
    await dismissConsent(page);

    let searchCardBaseline: ScrapedOffer | null = null;
    if (!isProductPage(page.url())) {
      const products = await collectProductLinks(page);
      console.log(
        `[IdealoDebug] Search cards: ${products
          .slice(0, 8)
          .map((item) => `${item.title.slice(0, 60)}${item.usedAb != null ? ` usedAb=${item.usedAb}` : ""}`)
          .join(" | ")}`,
      );
      const bestProduct = pickRelevantProduct(products, q);
      if (!bestProduct) {
        await dumpDebugContext(page, "no matching search product");
        throw new IdealoLookupError("No matching Idealo product found for this query.");
      }
      if (bestProduct.usedAb != null) {
        searchCardBaseline = {
          title: bestProduct.title,
          total: bestProduct.usedAb,
          shop: "Idealo",
          url: bestProduct.href,
        };
      }
      console.log(`[IdealoDebug] Opening search hit ${bestProduct.title} -> ${bestProduct.href}`);
      await page.goto(bestProduct.href, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
      await sleep(900);
      await dismissConsent(page);
    }

    await page.waitForSelector("h1", { timeout: 8_000 }).catch(() => undefined);
    console.log(`[IdealoDebug] Landed Product URL: ${page.url()}`);

    const heading = await pageTitle(page);
    if (heading && hasUnspecifiedVariant(q, heading, page.url())) {
      await dumpDebugContext(page, `wrong sub-model "${heading}"`);
      throw new IdealoLookupError(
        `Idealo landed on "${heading}", which is a different sub-model than "${q}".`,
      );
    }

    const filters = await applyVariantFilters(page, q);
    await clickLabeledControl(page, /alle varianten/i, 40);
    await sleep(500);

    const variants = (await collectVariants(page)).filter((variant) => variantMatchesQuery(variant, q));
    console.log(
      `[IdealoDebug] Available Variants/Tabs detected: [${variants.map((item) => item.title || item.href).join(" | ")}]`,
    );

    const offers: ScrapedOffer[] = [];
    const current = await scrapeActiveProductOffers(page, q, filters.clickedStorage);
    offers.push(...current.offers);

    const extra = variants
      .filter((variant) => canonicalUrl(variant.href) !== canonicalUrl(page.url()))
      .sort((a, b) => b.href.length - a.href.length)
      .slice(0, VARIANT_VISIT_LIMIT);
    for (const variant of extra) {
      console.log(`[IdealoDebug] Checking variant ${variant.title} -> ${variant.href}`);
      try {
        await page.goto(variant.href, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
        await sleep(700);
        await dismissConsent(page);
        const scraped = await scrapeActiveProductOffers(page, q, false);
        offers.push(...scraped.offers);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[IdealoDebug] Variant navigation failed ${variant.href}: ${message}`);
      }
    }

    const cleaned = offers.map((offer) => ({ ...offer, shop: cleanShopName(offer.shop) }));
    let valid = dropPriceOutliers(cleaned.filter((offer) => isValidOffer(offer, q)));
    valid.sort((a, b) => a.total - b.total);
    if (searchCardBaseline && isValidOffer(searchCardBaseline, q)) {
      valid.push(searchCardBaseline);
      valid.sort((a, b) => a.total - b.total);
    }

    const picked = valid[0] ?? null;
    console.log(
      `[IdealoDebug] Offers parsed: raw=${offers.length} matched=${valid.length}` +
        (picked ? ` lowest=€${picked.total} shop=${picked.shop} title="${picked.title}"` : " lowest=none"),
    );

    if (!picked) {
      await dumpDebugContext(page, "no B-Ware offers after variant walk");
      throw new IdealoLookupError("This Idealo product has no matching B-Ware & Gebraucht offers.");
    }

    return {
      referencePrice: Number(picked.total.toFixed(2)),
      title: picked.title.slice(0, 180),
      shop: picked.shop.slice(0, 80) || "Idealo",
      url: picked.url || page.url(),
    };
  } catch (error) {
    if (error instanceof IdealoLookupError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[IdealoDebug] scrape failed: ${message}`);
    if (debugPage) {
      await dumpDebugContext(debugPage, `uncaught ${message}`).catch(() => undefined);
    }
    throw new IdealoLookupError("Could not load Idealo B-Ware prices right now. Try again in a moment.");
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}

async function scrapeActiveProductOffers(
  page: Page,
  query: string,
  storageFilterApplied: boolean,
): Promise<{ offers: ScrapedOffer[] }> {
  const before = await readConditionSnapshot(page);
  const tabState = await activateBWareTab(page);
  await page.waitForSelector('[class*="productOffers"], [class*="OfferList"], h1', { timeout: 4_000 }).catch(() => undefined);
  await page
    .waitForFunction(
      () => /preisvergleich\s+b-ware|b-ware\s*&\s*gebraucht/i.test(document.body.innerText || ""),
      { timeout: 6_000 },
    )
    .catch(() => undefined);
  await sleep(700);

  const after = await readConditionSnapshot(page);
  const raw = await extractBWareOffers(page);
  const neuAb = after.neuAb ?? before.neuAb;
  const usedAb = after.usedAb ?? before.usedAb;
  let offers = stampStorage(rejectNewPrices(raw, neuAb, usedAb), query, storageFilterApplied);

  if (usedAb != null && !offers.some((offer) => Math.abs(offer.total - usedAb) < 0.5)) {
    offers.push(
      ...stampStorage(
        [
          {
            title: after.heading || (await pageTitle(page)) || query,
            total: usedAb,
            shop: "Idealo",
            url: page.url(),
          },
        ],
        query,
        storageFilterApplied,
      ),
    );
  }

  console.log(
    `[IdealoDebug] Product ${after.heading || page.url()} tab=${tabState} neuAb=${neuAb ?? "-"} usedAb=${usedAb ?? "-"} rows=${raw.length}`,
  );
  return { offers };
}

export function isValidOffer(offer: { title: string; total: number; url?: string }, query: string): boolean {
  if (!Number.isFinite(offer.total) || offer.total <= 0 || offer.total >= 100_000) return false;
  const title = normalizeText(offer.title);
  if (!title) return false;
  if (hasCrossBrandConflict(normalizeText(query), title)) return false;
  if (isAccessoryText(title) && !isAccessoryText(normalizeText(query))) return false;
  if (!queryWantsKit(query) && isKitText(title)) return false;
  if (hasUnspecifiedVariant(query, offer.title, offer.url)) return false;
  if (/\bneu\b/.test(title) && !/\b(b-ware|gebraucht|refurbished|used)\b/.test(title)) return false;

  const haystack = `${title} ${normalizeText(offer.url || "")}`;
  const required = mandatoryTokens(query).filter((token) => !STORAGE_TOKENS.has(token));
  if (required.length > 0 && !required.every((token) => titleHasToken(haystack, token))) return false;

  const storage = mandatoryTokens(query).filter((token) => STORAGE_TOKENS.has(token));
  if (storage.length > 0 && !storage.every((token) => titleHasToken(haystack, token))) {
    return false;
  }
  return true;
}

export function mandatoryTokens(query: string): string[] {
  return normalizeText(query)
    .split(/\s+/)
    .filter((token) => token.length > 0 && !GENERIC_TOKENS.has(token));
}

export function pickRelevantProduct(products: ProductCard[], query: string): ProductCard | null {
  const scored = products
    .filter((product) => !product.sponsored)
    .map((product) => ({ product, score: scoreProduct(product, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.product ?? null;
}

function scoreProduct(product: ProductCard, query: string): number {
  const title = product.title || fallbackTitleFromHref(product.href);
  const haystack = `${title} ${fallbackTitleFromHref(product.href)}`;
  const normalized = normalizeText(haystack);
  if (hasCrossBrandConflict(normalizeText(query), normalized)) return -1;
  if (isAccessoryText(normalized) && !isAccessoryText(normalizeText(query))) return -1;
  if (hasUnspecifiedVariant(query, haystack, product.href)) return -1;
  if (!queryWantsKit(query) && isKitText(normalized)) return -1;

  const required = mandatoryTokens(query).filter((token) => !STORAGE_TOKENS.has(token));
  if (required.length > 0 && !required.every((token) => titleHasToken(normalized, token))) {
    return -1;
  }

  let score = 80;
  if (isBodyText(normalized)) score += 45;
  if (product.usedAb != null) score += 18;
  const storage = mandatoryTokens(query).filter((token) => STORAGE_TOKENS.has(token));
  if (storage.length > 0) {
    const matchedStorage = storage.filter((token) => titleHasToken(normalized, token)).length;
    score += matchedStorage * 25;
    const otherStorage = [...STORAGE_TOKENS].some(
      (token) => !storage.includes(token) && titleHasToken(normalized, token),
    );
    if (otherStorage && matchedStorage === 0) score -= 20;
  }
  score -= Math.min(title.length, 90) * 0.08;
  return score;
}

function variantMatchesQuery(variant: ProductVariant, query: string): boolean {
  const haystack = `${variant.title} ${fallbackTitleFromHref(variant.href)}`;
  const normalized = normalizeText(haystack);
  if (!queryWantsKit(query) && isKitText(normalized)) return false;
  if (hasUnspecifiedVariant(query, haystack, variant.href)) return false;
  const required = mandatoryTokens(query).filter((token) => !STORAGE_TOKENS.has(token));
  if (required.length > 0 && !required.every((token) => titleHasToken(normalized, token))) return false;
  const storage = mandatoryTokens(query).filter((token) => STORAGE_TOKENS.has(token));
  if (storage.length === 0) return true;
  const mentionsStorage = [...STORAGE_TOKENS].some((token) => titleHasToken(normalized, token));
  if (!mentionsStorage) return true;
  return storage.every((token) => titleHasToken(normalized, token));
}

function stampStorage(offers: ScrapedOffer[], query: string, storageFilterApplied: boolean): ScrapedOffer[] {
  const storage = mandatoryTokens(query).filter((token) => STORAGE_TOKENS.has(token));
  if (!storageFilterApplied || storage.length === 0) return offers;
  return offers.map((offer) => {
    const haystack = normalizeText(`${offer.title} ${offer.url}`);
    if (storage.every((token) => titleHasToken(haystack, token))) return offer;
    const otherStorage = [...STORAGE_TOKENS].some(
      (token) => !storage.includes(token) && titleHasToken(haystack, token),
    );
    if (otherStorage) return offer;
    return { ...offer, title: `${offer.title} ${storage.join(" ")} GB` };
  });
}

function hasUnspecifiedVariant(query: string, title: string, href = ""): boolean {
  const q = new Set(normalizeText(query).split(/\s+/).filter(Boolean));
  const haystack = `${normalizeText(title)} ${fallbackTitleFromHref(href)}`;
  const slug = href.toLowerCase();
  for (const variant of variantTokensFor(query)) {
    if (q.has(variant)) continue;
    if (new RegExp(`\\b${variant}\\b`).test(haystack)) return true;
    if (slug.includes(`-${variant}-`) || slug.includes(`_${variant}-`) || slug.includes(`-${variant}.`)) {
      return true;
    }
  }
  return false;
}

function variantTokensFor(query: string): string[] {
  const q = normalizeText(query);
  if (hasAny(q, ["iphone", "ipad", "galaxy", "pixel"])) {
    return ["pro", "max", "mini", "plus", "air", "ultra", "fe"];
  }
  if (hasAny(q, ["ps5", "playstation", "xbox"])) {
    return ["pro"];
  }
  return ["pro", "mini", "ultra"];
}

function rejectNewPrices(offers: ScrapedOffer[], neuAb: number | null, usedAb: number | null): ScrapedOffer[] {
  if (offers.length === 0) return offers;
  if (neuAb == null || usedAb == null || usedAb >= neuAb * 0.95) return offers;
  return offers.filter((offer) => Math.abs(offer.total - neuAb) > 0.5 && offer.total <= neuAb * 0.97);
}

function dropPriceOutliers(offers: ScrapedOffer[]): ScrapedOffer[] {
  if (offers.length < 4) return offers;
  const sorted = [...offers].sort((a, b) => a.total - b.total);
  const median = sorted[Math.floor(sorted.length / 2)]?.total ?? 0;
  if (median <= 0) return offers;
  return offers.filter((offer) => offer.total >= median * 0.5);
}

function cleanShopName(shop: string): string {
  const text = shop.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!text || /img |class=|noborder|productoffers/i.test(text)) return "Idealo";
  return text.slice(0, 80);
}

function isAccessoryText(text: string): boolean {
  return /\b(huelle|hulle|case|cover|folie|panzerglas|kabel|charger|ladegerat|airpods|ersatzteil|schachtel|dummy|sticker|schutzglas|silikon|bumper)\b/.test(
    text,
  );
}

function queryWantsKit(query: string): boolean {
  return KIT_RE.test(normalizeText(query));
}

function isKitText(text: string): boolean {
  return KIT_RE.test(text);
}

function isBodyText(text: string): boolean {
  return BODY_RE.test(text);
}

function hasCrossBrandConflict(query: string, title: string): boolean {
  if (hasAny(query, ["iphone", "apple"]) && hasAny(title, ["galaxy", "samsung", "pixel", "xiaomi"])) {
    return true;
  }
  if (hasAny(query, ["ps5", "playstation"]) && hasAny(title, ["xbox", "nintendo", "switch"])) {
    return true;
  }
  return false;
}

function titleHasToken(title: string, token: string): boolean {
  if (title.includes(token)) return true;
  if (token === "ps5") return /\bplaystation\b/.test(title) && /\b5\b/.test(title);
  if (token === "ps4") return /\bplaystation\b/.test(title) && /\b4\b/.test(title);
  if (token === "iphone") return /\biphone\b/.test(title);
  if (/^a\d{4}$/.test(token)) return title.includes(token.slice(1));
  if (token === "r6") return /\br6\b/.test(title);
  if (token === "r5") return /\br5\b/.test(title);
  if (token === "6700") return /\ba6700\b/.test(title) || /\bilce\s*6700\b/.test(title);
  return false;
}

function hasAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function isProductPage(url: string): boolean {
  return /\/OffersOfProduct\//i.test(url);
}

function canonicalUrl(url: string): string {
  return url.split("#")[0]?.split("?")[0] ?? url;
}

function fallbackTitleFromHref(href: string): string {
  const slug = href.split("/").pop()?.replace(/\.html.*$/i, "") ?? "";
  return slug
    .replace(/^\d+_?-?/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

async function pageTitle(page: Page): Promise<string> {
  try {
    return await page.evaluate(
      () => document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() || "",
    );
  } catch {
    return "";
  }
}

async function dumpDebugContext(page: Page, reason: string): Promise<void> {
  try {
    const title = (await page.title().catch(() => "")) || (await pageTitle(page));
    const url = page.url();
    const text = await page.evaluate(() => (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 1_600));
    console.warn(`[IdealoDebug] FAIL ${reason}`);
    console.warn(`[IdealoDebug] title="${title}" url=${url}`);
    console.warn(`[IdealoDebug] Page text: ${text}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[IdealoDebug] Could not dump page context: ${message}`);
  }
}

async function dismissConsent(page: Page): Promise<void> {
  const clickAccept = async () => {
    await page.evaluate(() => {
      const match = (re: RegExp) =>
        [...document.querySelectorAll("button, a, [role='button']")].find((node) =>
          re.test((node.textContent || "").replace(/\s+/g, " ").trim()),
        ) as HTMLElement | undefined;
      match(/alle akzeptieren|accept all|zustimmen|einverstanden|akzeptieren/i)?.click();
      const accept = document.querySelector(
        'button[id*="accept"], button[id*="Accept"], button[title*="akzeptieren" i], button[aria-label*="akzeptieren" i]',
      ) as HTMLElement | null;
      accept?.click();
    });
  };

  try {
    await page.waitForSelector("#sp_message_container, iframe[id*='sp_message'], #usercentrics-root", {
      timeout: 2_500,
    });
  } catch {
    // banner may already be gone
  }

  try {
    await clickAccept();
  } catch {
    // cookie banner is optional
  }

  for (const frame of page.frames()) {
    const url = frame.url();
    if (!/sp_message|sourcepoint|consent|usercentrics|privacy/i.test(url)) continue;
    try {
      await frame.evaluate(() => {
        const button = [...document.querySelectorAll("button, a")].find((node) =>
          /alle akzeptieren|accept all|zustimmen|akzeptieren/i.test(node.textContent || ""),
        ) as HTMLElement | undefined;
        button?.click();
      });
    } catch {
      // iframe may be detached
    }
  }

  try {
    const root = await page.$("#usercentrics-root");
    if (!root) return;
    await page.evaluate((host) => {
      const shadow = host.shadowRoot;
      if (!shadow) return;
      const button = [...shadow.querySelectorAll("button")].find((el) =>
        /alle akzeptieren|accept all|zustimmen/i.test(el.textContent || ""),
      );
      button?.click();
    }, root);
  } catch {
    // ignore
  }
}

async function applyVariantFilters(page: Page, query: string): Promise<{ clickedBody: boolean; clickedStorage: boolean }> {
  let clickedBody = false;
  let clickedStorage = false;

  if (!queryWantsKit(query)) {
    clickedBody =
      (await clickLabeledControl(page, /^(body|gehäuse|nur gehäuse)\b/i, 28)) ||
      (await clickLabeledControl(page, /ohne objektiv/i, 28));
    if (clickedBody) {
      console.log("[IdealoDebug] Clicked Body / Gehäuse / ohne Objektiv filter");
      await sleep(600);
    }
  }

  const storage = mandatoryTokens(query).find((token) => STORAGE_TOKENS.has(token));
  if (storage) {
    clickedStorage = await clickLabeledControl(page, new RegExp(`^${storage}\\s*gb$`, "i"), 18);
    if (clickedStorage) {
      console.log(`[IdealoDebug] Clicked storage filter ${storage} GB`);
      await sleep(500);
    }
  }

  return { clickedBody, clickedStorage };
}

async function clickLabeledControl(page: Page, pattern: RegExp, maxLength: number): Promise<boolean> {
  try {
    return await page.evaluate(
      (source, flags, limit) => {
        const re = new RegExp(source, flags);
        const compact = (node: Element) => (node.textContent || "").replace(/\s+/g, " ").trim();
        const nodes = [
          ...document.querySelectorAll(
            "a, button, label, span, div, li, [role='tab'], [role='radio'], [role='button']",
          ),
        ];
        const match = nodes
          .filter((node) => {
            const text = compact(node);
            return re.test(text) && text.length <= limit;
          })
          .sort((a, b) => compact(a).length - compact(b).length)[0];
        if (!match) return false;
        ((match.closest("a, button, [role='tab'], [role='button'], [role='radio']") ?? match) as HTMLElement).click();
        return true;
      },
      pattern.source,
      pattern.flags,
      maxLength,
    );
  } catch {
    return false;
  }
}

async function activateBWareTab(page: Page): Promise<"clicked" | "navigated" | "missing"> {
  try {
    await page.locator("::-p-text(B-Ware & Gebraucht)").setTimeout(3_500).click();
    console.log("[IdealoDebug] Clicked B-Ware & Gebraucht tab");
    return "clicked";
  } catch {
    // fall through to DOM search
  }

  try {
    const target = await page.evaluate(() => {
      const compact = (node: Element) => (node.textContent || "").replace(/\s+/g, " ").trim();
      const h1Top = (document.querySelector("h1") as HTMLElement | null)?.offsetTop ?? 0;
      const nodes = [
        ...document.querySelectorAll(
          "a, button, label, span, div, li, [role='tab'], [role='radio'], [role='button'], [class*='condition'], [class*='Condition'], [class*='used']",
        ),
      ];
      const matches = nodes
        .filter((node) => {
          const text = compact(node);
          return /b-ware/i.test(text) && /gebraucht/i.test(text) && text.length < 80;
        })
        .sort((a, b) => {
          const textDelta = compact(a).length - compact(b).length;
          if (textDelta !== 0) return textDelta;
          return Math.abs((a as HTMLElement).offsetTop - h1Top) - Math.abs((b as HTMLElement).offsetTop - h1Top);
        });
      const match = matches[0];
      if (!match) return { kind: "missing" as const, href: "" };
      const clickable = (match.closest("a, button, [role='tab'], [role='button'], [role='radio']") ??
        match) as HTMLElement;
      const href = clickable instanceof HTMLAnchorElement ? clickable.href : clickable.closest("a")?.href ?? "";
      const current = location.href.split("#")[0];
      const next = href.split("#")[0];
      if (next && /idealo\.de/i.test(next) && next !== current) {
        return { kind: "href" as const, href };
      }
      clickable.click();
      return { kind: "clicked" as const, href };
    });

    if (!target || target.kind === "missing") {
      console.log("[IdealoDebug] B-Ware tab not found on this product");
      return "missing";
    }

    if (target.kind === "href" && target.href) {
      await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
      await sleep(700);
      console.log("[IdealoDebug] Navigated to B-Ware & Gebraucht");
      return "navigated";
    }

    console.log("[IdealoDebug] Clicked B-Ware & Gebraucht tab");
    return "clicked";
  } catch {
    return "missing";
  }
}

async function readConditionSnapshot(page: Page): Promise<ConditionSnapshot> {
  try {
    return await page.evaluate(() => {
      const parseGermanPrice = (raw: string): number | null => {
        const match = raw.replace(/\s/g, "").match(/(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})/);
        if (!match) return null;
        const value = Number(`${match[1].replace(/\./g, "")}.${match[2]}`);
        return Number.isFinite(value) && value > 0 && value < 100_000 ? value : null;
      };
      const heading = document.querySelector("h1");
      const stage =
        (heading?.closest("main, article, [class*='Stage'], [class*='stage']") as HTMLElement | null)?.innerText ||
        heading?.parentElement?.parentElement?.innerText ||
        heading?.parentElement?.innerText ||
        document.body.innerText ||
        "";
      const body = stage.replace(/\s+/g, " ").slice(0, 5_000);
      const neuAb = parseGermanPrice(body.match(/\bNeu\s+ab\s*((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s*€/i)?.[1] ?? "");
      const usedAb = parseGermanPrice(
        body.match(/B-Ware\s*&\s*Gebraucht\s+ab\s*((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s*€/i)?.[1] ??
          body.match(/B-Ware\s*&\s*Gebraucht[\s\S]{0,40}?ab\s*((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s*€/i)?.[1] ??
          "",
      );
      return {
        neuAb,
        usedAb,
        hasBWareTab: /b-ware/i.test(body),
        heading: document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() || "",
      };
    });
  } catch {
    return { neuAb: null, usedAb: null, hasBWareTab: false, heading: "" };
  }
}

async function collectProductLinks(page: Page): Promise<ProductCard[]> {
  try {
    return await page.evaluate(() => {
      const parseGermanPrice = (raw: string): number | null => {
        const match = raw.replace(/\s/g, "").match(/(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})/);
        if (!match) return null;
        const value = Number(`${match[1].replace(/\./g, "")}.${match[2]}`);
        return Number.isFinite(value) && value > 0 && value < 100_000 ? value : null;
      };
      const seen = new Set<string>();
      const products: Array<{ title: string; href: string; sponsored: boolean; usedAb: number | null }> = [];
      for (const anchor of document.querySelectorAll('a[href*="OffersOfProduct"]')) {
        const href = (anchor as HTMLAnchorElement).href?.split("#")[0];
        if (!href || seen.has(href) || /clickout|redirect/i.test(href)) continue;
        seen.add(href);
        const card = anchor.closest("article, li, section, [class*='result'], [class*='Offer'], [class*='product']");
        const cardText = ((card as HTMLElement | null)?.innerText || "").replace(/\s+/g, " ");
        const title = (
          anchor.getAttribute("title") ||
          anchor.getAttribute("aria-label") ||
          card?.querySelector("h2, h3, [class*='title'], [class*='Title']")?.textContent ||
          (anchor as HTMLElement).innerText ||
          ""
        )
          .replace(/\s+/g, " ")
          .trim();
        const usedAb = parseGermanPrice(
          cardText.match(/B-Ware[\s\S]{0,40}?((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s*€/i)?.[1] ??
            cardText.match(/Gebraucht[\s\S]{0,40}?((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s*€/i)?.[1] ??
            cardText.match(/ab\s*((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s*€[^.]{0,24}(B-Ware|Gebraucht)/i)?.[1] ??
            "",
        );
        products.push({
          title: title.slice(0, 180),
          href,
          sponsored: /anzeige|sponsored|advert/i.test(cardText),
          usedAb,
        });
      }
      return products;
    });
  } catch {
    return [];
  }
}

async function collectVariants(page: Page): Promise<ProductVariant[]> {
  try {
    return await page.evaluate(() => {
      const compact = (node: Element) => (node.textContent || "").replace(/\s+/g, " ").trim();
      const seen = new Set<string>();
      const variants: Array<{ title: string; href: string }> = [];
      const label = [...document.querySelectorAll("h1, h2, h3, h4, legend, span, button, p, div")].find((node) => {
        const text = compact(node);
        return text.length > 0 && text.length < 80 && /varianten/i.test(text);
      });
      const labeledRoot =
        label?.closest("section, article, [class*='variant'], [class*='Variant'], [class*='filter']") ??
        label?.parentElement ??
        null;
      const scoped =
        labeledRoot && labeledRoot.querySelectorAll('a[href*="OffersOfProduct"]').length > 0
          ? labeledRoot
          : document;
      for (const anchor of scoped.querySelectorAll('a[href*="OffersOfProduct"]')) {
        const href = (anchor as HTMLAnchorElement).href?.split("#")[0];
        if (!href || seen.has(href) || /clickout|redirect/i.test(href)) continue;
        seen.add(href);
        const title = (anchor.getAttribute("title") || (anchor as HTMLElement).innerText || "")
          .replace(/\s+/g, " ")
          .trim();
        variants.push({ title: title.slice(0, 120), href });
      }
      return variants;
    });
  } catch {
    return [];
  }
}

async function extractBWareOffers(page: Page): Promise<ScrapedOffer[]> {
  try {
    const fromDom = await page.evaluate(() => {
      const parseGermanPrice = (raw: string): number | null => {
        const match = raw.replace(/\s/g, "").match(/(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})/);
        if (!match) return null;
        const value = Number(`${match[1].replace(/\./g, "")}.${match[2]}`);
        return Number.isFinite(value) && value > 0 && value < 100_000 ? value : null;
      };

      const heading =
        document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() ||
        document.title.replace(/\s+\|.*/, "").trim();
      const pageUrl = location.href;
      const offers: Array<{ title: string; total: number; shop: string; url: string }> = [];

      const headingNodes = [...document.querySelectorAll("h1, h2, h3, h4, legend, [class*='title']")];
      const bwareHeading = headingNodes.find(
        (node) => /b-ware/i.test(node.textContent || "") && /gebraucht|preisvergleich/i.test(node.textContent || ""),
      );
      const scopedRoot =
        bwareHeading?.closest("section, article, [class*='productOffers'], [class*='Offer']") ??
        document.querySelector('[class*="productOffers-list"], [id*="used"], [class*="Used"]') ??
        document.body;

      const rows = scopedRoot.querySelectorAll(
        '[class*="productOffers-listItem"], [class*="OfferList-item"], [data-testid*="offer"]',
      );

      for (const row of rows) {
        const text = ((row as HTMLElement).innerText || "").replace(/\s+/g, " ").trim();
        if (!text.includes("€") || text.length < 10 || text.length > 900) continue;
        if (/\bneu\b/i.test(text) && !/b-ware|gebraucht|refurbished/i.test(text)) continue;

        const totalMatch =
          text.match(/gesamtpreis[^0-9]{0,24}((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s*€/i) ||
          text.match(/inkl\.?\s*versand[^0-9]{0,12}((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s*€/i) ||
          text.match(/((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s*€/);
        const itemPrice = parseGermanPrice(totalMatch?.[1] ?? totalMatch?.[0] ?? "");
        if (itemPrice == null) continue;

        let shipping = 0;
        const shipMatch = text.match(/versand[^0-9]{0,16}((\d{1,3}(?:\.\d{3})*|\d+),\d{2})/i);
        if (/zzgl/i.test(text) && shipMatch && !/gesamtpreis|inkl\.?\s*versand/i.test(text)) {
          shipping = parseGermanPrice(shipMatch[1] ?? "") ?? 0;
        }

        const shopAttr =
          row.querySelector("[data-shop-name]")?.getAttribute("data-shop-name") ||
          row.querySelector("img[class*='Shop'], img[class*='shop']")?.getAttribute("alt") ||
          row.querySelector("[class*='shopName'], [class*='ShopName']")?.textContent?.trim() ||
          text.match(/bei\s+([A-Za-z0-9][\w.&+ -]{1,40})/i)?.[1]?.trim() ||
          "Idealo";
        const shop = shopAttr.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const localTitle = (
          row.querySelector("h2, h3, [class*='title'], [class*='Title']")?.textContent || heading
        )
          .replace(/\s+/g, " ")
          .trim();
        if (/\b(hülle|huelle|case|cover|folie|panzerglas|kabel|ladegerät)\b/i.test(`${localTitle} ${text}`)) {
          continue;
        }

        offers.push({
          title: localTitle || text.slice(0, 140),
          total: itemPrice + Math.max(0, shipping),
          shop: shop.slice(0, 80),
          url: pageUrl,
        });
      }

      const body = (document.body.innerText || "").replace(/\s+/g, " ");
      const usedBlock =
        body.split(/Preisvergleich\s+B-Ware\s*&\s*Gebraucht/i)[1]?.slice(0, 2_500) ??
        body.split(/B-Ware\s*&\s*Gebraucht/i)[1]?.slice(0, 2_500) ??
        "";
      const abMatch = usedBlock.match(/ab\s*((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s*€/i);
      const abPrice = parseGermanPrice(abMatch?.[1] ?? "");
      if (abPrice != null && offers.length === 0) {
        offers.push({ title: heading, total: abPrice, shop: "Idealo", url: pageUrl });
      }

      return offers;
    });
    return fromDom.filter((offer) => Number.isFinite(offer.total));
  } catch {
    return [];
  }
}

function resolveChromiumPath(): string | null {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROMIUM_PATH,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

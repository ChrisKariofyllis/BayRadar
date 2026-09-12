import { existsSync } from "node:fs";

import type { Browser, Page } from "puppeteer-core";
import puppeteer from "puppeteer-core";

const IDEALO_ORIGIN = "https://www.idealo.de";
const SEARCH_PATH = "/preisvergleich/MainSearchProductCategory.html";
const TIMEOUT_MS = 25_000;
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
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    );
    await page.setExtraHTTPHeaders({ "Accept-Language": "de-DE,de;q=0.9,en;q=0.8" });
    page.setDefaultTimeout(TIMEOUT_MS);
    page.setDefaultNavigationTimeout(TIMEOUT_MS);

    console.log(`[idealo-ondemand] Opening ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
    await sleep(800);
    await dismissConsent(page);

    if (!isProductPage(page.url())) {
      const products = await collectProductLinks(page);
      const bestProduct = pickRelevantProduct(products, q);
      if (!bestProduct) {
        throw new IdealoLookupError("No matching Idealo product found for this query.");
      }
      console.log(`[idealo-ondemand] Opening product ${bestProduct.title} -> ${bestProduct.href}`);
      await page.goto(bestProduct.href, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
      await sleep(800);
      await dismissConsent(page);
    }

    const heading = await pageTitle(page);
    if (heading && hasUnspecifiedVariant(q, heading, page.url())) {
      throw new IdealoLookupError(
        `Idealo landed on "${heading}", which is a different sub-model than "${q}".`,
      );
    }

    const before = await readConditionSnapshot(page);
    const tabState = await activateBWareTab(page);
    if (tabState === "missing" && !before.hasBWareTab) {
      throw new IdealoLookupError("This Idealo product has no B-Ware & Gebraucht tab.");
    }

    await page.waitForFunction(
      () => /preisvergleich\s+b-ware|b-ware\s*&\s*gebraucht/i.test(document.body.innerText || ""),
      { timeout: 8_000 },
    ).catch(() => undefined);
    await sleep(900);

    const after = await readConditionSnapshot(page);
    const rawOffers = await extractBWareOffers(page);
    const cleaned = rawOffers.map((offer) => ({ ...offer, shop: cleanShopName(offer.shop) }));
    let valid = dropPriceOutliers(cleaned.filter((offer) => isValidOffer(offer, q)));
    valid.sort((a, b) => a.total - b.total);

    const neuAb = after.neuAb ?? before.neuAb;
    const usedAb = after.usedAb ?? before.usedAb;
    valid = rejectNewPrices(valid, neuAb, usedAb);

    let picked = valid[0] ?? null;
    if (!picked && usedAb != null) {
      picked = {
        title: after.heading || heading || q,
        total: usedAb,
        shop: "Idealo",
        url: page.url(),
      };
    }

    console.log(
      `[idealo-ondemand] query="${q}" product="${after.heading || heading}" tab=${tabState}` +
        ` neuAb=${neuAb ?? "-"} usedAb=${usedAb ?? "-"} raw=${rawOffers.length} matched=${valid.length}` +
        (picked ? ` picked=€${picked.total} shop=${picked.shop}` : " picked=none"),
    );

    if (!picked) {
      throw new IdealoLookupError("B-Ware & Gebraucht is available, but no matching used offers were listed.");
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
    console.warn(`[idealo-ondemand] scrape failed: ${message}`);
    throw new IdealoLookupError("Could not load Idealo B-Ware prices right now. Try again in a moment.");
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}

export function isValidOffer(offer: { title: string; total: number }, query: string): boolean {
  if (!Number.isFinite(offer.total) || offer.total <= 0 || offer.total >= 100_000) return false;
  const title = normalizeText(offer.title);
  if (!title) return false;
  if (hasCrossBrandConflict(normalizeText(query), title)) return false;
  if (isAccessoryText(title) && !isAccessoryText(normalizeText(query))) return false;
  if (hasUnspecifiedVariant(query, offer.title)) return false;
  if (/\bneu\b/.test(title) && !/\b(b-ware|gebraucht|refurbished|used)\b/.test(title)) return false;

  const required = mandatoryTokens(query).filter((token) => !STORAGE_TOKENS.has(token));
  if (required.length > 0 && !required.every((token) => titleHasToken(title, token))) return false;

  const storage = mandatoryTokens(query).filter((token) => STORAGE_TOKENS.has(token));
  const titleHasAnyStorage = [...STORAGE_TOKENS].some((token) => titleHasToken(title, token));
  if (storage.length > 0 && titleHasAnyStorage && !storage.every((token) => titleHasToken(title, token))) {
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
  if (hasCrossBrandConflict(normalizeText(query), normalizeText(haystack))) return -1;
  if (isAccessoryText(normalizeText(haystack)) && !isAccessoryText(normalizeText(query))) return -1;
  if (hasUnspecifiedVariant(query, haystack, product.href)) return -1;

  const required = mandatoryTokens(query).filter((token) => !STORAGE_TOKENS.has(token));
  if (required.length > 0 && !required.every((token) => titleHasToken(normalizeText(haystack), token))) {
    return -1;
  }

  let score = 80;
  const storage = mandatoryTokens(query).filter((token) => STORAGE_TOKENS.has(token));
  const normalizedTitle = normalizeText(haystack);
  if (storage.length > 0) {
    const matchedStorage = storage.filter((token) => titleHasToken(normalizedTitle, token)).length;
    score += matchedStorage * 25;
    const otherStorage = [...STORAGE_TOKENS].some(
      (token) => !storage.includes(token) && titleHasToken(normalizedTitle, token),
    );
    if (otherStorage && matchedStorage === 0) score -= 20;
  }
  score -= Math.min(title.length, 90) * 0.08;
  return score;
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
  if (token === "ps5") {
    return /\bplaystation\b/.test(title) && /\b5\b/.test(title);
  }
  if (token === "ps4") {
    return /\bplaystation\b/.test(title) && /\b4\b/.test(title);
  }
  if (token === "iphone") {
    return /\biphone\b/.test(title);
  }
  return false;
}

function hasAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function isProductPage(url: string): boolean {
  return /\/OffersOfProduct\//i.test(url);
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

async function dismissConsent(page: Page): Promise<void> {
  try {
    await page.evaluate(() => {
      const match = (re: RegExp) =>
        [...document.querySelectorAll("button, a, [role='button']")].find((node) =>
          re.test((node.textContent || "").replace(/\s+/g, " ").trim()),
        ) as HTMLElement | undefined;
      match(/alle akzeptieren|accept all|zustimmen|einverstanden/i)?.click();
    });
  } catch {
    // cookie banner is optional
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

async function activateBWareTab(page: Page): Promise<"clicked" | "navigated" | "missing"> {
  try {
    await page.locator("::-p-text(B-Ware & Gebraucht)").setTimeout(2_500).click();
    console.log("[idealo-ondemand] Clicked B-Ware & Gebraucht tab");
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
          "a, button, label, span, div, li, [role='tab'], [role='radio'], [role='button'], [class*='condition'], [class*='Condition']",
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
      const clickable = (match.closest("a, button, [role='tab'], [role='button'], [role='radio']") ?? match) as HTMLElement;
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
      console.log("[idealo-ondemand] B-Ware tab not found");
      return "missing";
    }

    if (target.kind === "href" && target.href) {
      await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
      await sleep(700);
      console.log("[idealo-ondemand] Navigated to B-Ware & Gebraucht");
      return "navigated";
    }

    console.log("[idealo-ondemand] Clicked B-Ware & Gebraucht tab");
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
      const body = stage.replace(/\s+/g, " ").slice(0, 5000);
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
      const seen = new Set<string>();
      const products: Array<{ title: string; href: string; sponsored: boolean }> = [];
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
        products.push({
          title: title.slice(0, 180),
          href,
          sponsored: /anzeige|sponsored|advert/i.test(cardText),
        });
      }
      return products;
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
      const bwareHeading = headingNodes.find((node) =>
        /b-ware/i.test(node.textContent || "") && /gebraucht|preisvergleich/i.test(node.textContent || ""),
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
      const usedBlock = body.split(/Preisvergleich\s+B-Ware\s*&\s*Gebraucht/i)[1]?.slice(0, 2500)
        ?? body.split(/B-Ware\s*&\s*Gebraucht/i)[1]?.slice(0, 2500)
        ?? "";
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

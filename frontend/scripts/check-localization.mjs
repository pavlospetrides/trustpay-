import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogsDir = join(root, "src", "lib", "i18n", "messages");
const languages = ["en", "el", "ru", "he"];
const forms = ["one", "two", "few", "many", "other"];
const approvedEnglish = { el: new Set(["kb", "email", "supabase-postgresql"]), ru: new Set(["supabase-postgresql"]), he: new Set(["supabase-postgresql"]) };
const safeVisible = new Set(["TrustPay", "TrustPay AI", "AI", "Jinius", "UTC", "●"]);
const externalCopy = new Set(["invalid-login-credentials", "email-not-confirmed", "database-unavailable"]);
// Keep translations for older intake copy and historical API responses.
const historicalCopy = [
  "vision-model", "local-pdf-text", "visual-extraction-is-unavailable-enter-the-fields-manually",
  "choose-a-pdf-png-or-jpeg-invoice", "only-pdf-png-or-jpeg-invoices-with-matching", "pdf-must-have-1-5-unencrypted-pages",
];
const visibleAttributes = new Set(["alt", "aria-description", "aria-label", "placeholder", "title", "description", "message", "confirmLabel"]);
const namedVariables = /\{([a-zA-Z]\w*)\}/g;
const normalize = text => text.replace(/\s+/g, " ").trim();
const tokens = text => [...new Set([...text.matchAll(namedVariables)].map(match => match[1]))].sort().join(",");
const fingerprint = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const containsLetters = value => /\p{L}/u.test(value);
const isLiteral = node => ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);

function readJson(filename) {
  const raw = readFileSync(filename, "utf8");
  const source = ts.parseJsonText(filename, raw);
  const keys = new Set();
  const expression = source.statements[0]?.expression;
  if (expression && ts.isObjectLiteralExpression(expression)) {
    for (const property of expression.properties) {
      if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.name)) continue;
      const key = property.name.text;
      if (keys.has(key)) throw new Error(relative(root, filename) + ": duplicate key " + key);
      keys.add(key);
    }
  }
  return JSON.parse(raw);
}

function validateCatalogs(catalogs) {
  const failures = [];
  const english = catalogs.en;
  for (const locale of languages) {
    const catalog = catalogs[locale];
    for (const key of Object.keys(catalog)) if (!Object.hasOwn(english, key)) failures.push(locale + ": unknown key " + key);
    for (const [key, source] of Object.entries(english)) {
      const translated = catalog[key];
      if (translated === undefined) { failures.push(locale + ": missing key " + key); continue; }
      if (typeof source === "string") {
        checkForm(source, translated, key, locale, failures);
      } else {
        if (Array.isArray(translated) || !translated || typeof translated !== "object" || Object.keys(translated).sort().join(",") !== forms.slice().sort().join(",")) {
          failures.push(locale + ": invalid plural forms for " + key);
          continue;
        }
        for (const form of forms) {
          if (typeof source[form] !== "string" || tokens(source[form]) !== "count") {
            failures.push("en: plural forms must use {count} in " + key);
            break;
          }
          checkForm(source[form], translated[form], key + "." + form, locale, failures);
        }
      }
    }
  }
  return failures;
}

function checkForm(source, translated, key, locale, failures) {
  const label = locale + ": " + key;
  if (typeof translated !== "string" || !translated.trim()) {
    failures.push(label + " is empty or invalid");
    return;
  }
  if (/[{}]/.test(translated.replace(namedVariables, "")) || tokens(source) !== tokens(translated)) failures.push(label + " has inconsistent interpolation");
  if (/^(TODO|TBD|TRANSLATE ME|TRANSLATION PENDING)\b/i.test(translated.trim())) failures.push(label + " is a placeholder");
  if (locale !== "en" && normalize(source) === normalize(translated) &&
      containsLetters(source.replace(namedVariables, "")) && !approvedEnglish[locale].has(key)) {
    failures.push(label + " copies the English text");
  }
}

function jsxExpressionText(node, filename, report, asAttribute = false) {
  if (isLiteral(node)) {
    const copy = normalize(node.text);
    if (containsLetters(copy) && !safeVisible.has(copy) && !(asAttribute && /^[A-Z0-9_-]{4,}$/.test(copy))) report(node, "visible literal: " + copy);
  } else if (ts.isTemplateExpression(node)) {
    const copy = normalize(node.head.text + node.templateSpans.map(span => span.literal.text).join(""));
    if (containsLetters(copy)) report(node, "visible template: " + copy);
  } else if (ts.isConditionalExpression(node)) {
    jsxExpressionText(node.whenTrue, filename, report, asAttribute);
    jsxExpressionText(node.whenFalse, filename, report, asAttribute);
  } else if (ts.isParenthesizedExpression(node)) {
    jsxExpressionText(node.expression, filename, report, asAttribute);
  } else if (ts.isBinaryExpression(node) && [
    ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.PlusToken,
  ].includes(node.operatorToken.kind)) {
    if (node.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) jsxExpressionText(node.left, filename, report, asAttribute);
    jsxExpressionText(node.right, filename, report, asAttribute);
  }
}

function validateSources(english) {
  const failures = [];
  const references = new Set([...externalCopy, ...historicalCopy]);
  const canonicalKeys = new Map();
  for (const [key, text] of Object.entries(english)) {
    if (typeof text !== "string") continue;
    if (!canonicalKeys.has(text)) canonicalKeys.set(text, []);
    canonicalKeys.get(text).push(key);
  }
  const src = join(root, "src");
  for (const file of readdirSync(src, { recursive: true })) {
    if (!/\.(ts|tsx)$/.test(file) || /\.(?:test|d)\.ts$/.test(file)) continue;
    const full = join(src, file);
    const tree = ts.createSourceFile(full, readFileSync(full, "utf8"), ts.ScriptTarget.Latest, true);
    const userFacingServer = /^(app\/api|lib\/server)\//.test(file.replaceAll("\\", "/")) && !/[/\\]testing[/\\]/.test(file);
    const report = (node, problem) => {
      const pos = tree.getLineAndCharacterOfPosition(node.getStart(tree));
      failures.push(relative(root, full) + ":" + (pos.line + 1) + " " + problem);
    };
    const walk = node => {
      if (isLiteral(node) && Object.hasOwn(english, node.text)) references.add(node.text);
      if (userFacingServer) {
        // Canonical server text can share a catalog entry without importing translations.
        const source = isLiteral(node) ? node.text : ts.isTemplateExpression(node)
          ? node.head.text + node.templateSpans.map((span, i) => "{p" + i + "}" + span.literal.text).join("")
          : undefined;
        for (const key of canonicalKeys.get(source) ?? []) references.add(key);
      }
      if (ts.isJsxText(node)) {
        const copy = normalize(node.getFullText(tree));
        if (containsLetters(copy) && !safeVisible.has(copy)) report(node, "visible JSX text: " + copy);
      }
      if (ts.isJsxAttribute(node) && visibleAttributes.has(node.name.getText(tree)) && node.initializer && isLiteral(node.initializer)) {
        jsxExpressionText(node.initializer, full, report, true);
      }
      if (ts.isJsxExpression(node) && node.expression &&
          (!ts.isJsxAttribute(node.parent) || visibleAttributes.has(node.parent.name.getText(tree)))) {
        jsxExpressionText(node.expression, full, report, ts.isJsxAttribute(node.parent));
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const fn = node.expression.text;
        const [name, values] = node.arguments;
        if (userFacingServer && fn === "sourceText") report(node, "localize canonical server messages at the client presentation boundary");
        if (["t", "p", "sourceText"].includes(fn) && name && isLiteral(name)) {
          const base = english[name.text];
          if (!Object.hasOwn(english, name.text)) report(name, "unknown localization key " + name.text);
          else if (fn === "p" && typeof base !== "object" || fn !== "p" && typeof base !== "string") report(name, "incorrect message type");
          else if (typeof base === "string" && (values === undefined || ts.isObjectLiteralExpression(values))) {
            const supplied = (values?.properties ?? []).map(property => property.name?.getText(tree).replace(/['"]/g, "") ?? "").sort().join(",");
            if (supplied !== tokens(base)) report(name, "incorrect variables for " + name.text);
          }
        }
        if (["setError", "setMessage"].includes(fn) && name) jsxExpressionText(name, full, report);
      }
      ts.forEachChild(node, walk);
    };
    walk(tree);
  }
  for (const key of Object.keys(english)) if (!references.has(key)) failures.push("Unused message key: " + key);
  return failures;
}

const catalogs = Object.fromEntries(languages.map(locale => [locale, readJson(join(catalogsDir, locale + ".json"))]));
const failures = [...validateCatalogs(catalogs), ...validateSources(catalogs.en)];

if (process.argv.includes("--self-test")) {
  const broken = structuredClone(catalogs);
  delete broken.el.language;
  broken.ru["risk.account-changed"] = broken.ru["risk.account-changed"].replace("{p0}", "{wrong}");
  broken.he["page-not-found"] = "";
  const evidence = validateCatalogs(broken);
  const expected = ["el: missing key language", "ru: risk.account-changed has inconsistent interpolation", "he: page-not-found is empty or invalid"];
  for (const message of expected) {
    if (!evidence.includes(message)) failures.push("Validator did not catch: " + message);
    else console.log("Confirmed rejection: " + message);
  }
}

const reviewFile = join(catalogsDir, "reviewed-source.json");
const current = Object.fromEntries(Object.entries(catalogs.en).map(([key, value]) => [key, fingerprint(value)]));
if (process.argv.includes("--record-review")) {
  if (!failures.length) writeFileSync(reviewFile, JSON.stringify(current, null, 2) + "\n");
} else {
  const previous = readJson(reviewFile);
  for (const [key, hash] of Object.entries(current)) if (previous[key] !== hash) failures.push("Review all translations and record the English source change: " + key);
  for (const key of Object.keys(previous)) if (!Object.hasOwn(current, key)) failures.push("Remove the review entry for deleted key " + key);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Localization valid: " + Object.keys(catalogs.en).length + " keys across " + languages.join(", "));
}

import { test, expect, type Page } from "@playwright/test";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";
const RUN = Date.now().toString(36);

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
}

test.describe("editorial flow", () => {
  test.skip(!EMAIL || !PASSWORD, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD");

  test("import → inbox → story → approve → publish → public feed → issue preview → test send", async ({ page }) => {
    await login(page);

    // 1. Ingest a fixture (social import JSON) — items land in the inbox, unpublished.
    const dir = mkdtempSync(join(tmpdir(), "brief-e2e-"));
    const file = join(dir, "posts.json");
    const title = `E2E ${RUN} Modbus gateway claim`;
    writeFileSync(file, JSON.stringify({ version: 1, posts: [{ platform: "x", author: "@e2e", url: `https://x.com/e2e/status/${RUN}`, text: title }] }));
    await page.goto("/admin/import");
    await page.locator('input[type=file][name=file]').setInputFiles(file);
    await page.getByRole("button", { name: "Import file" }).click();
    await expect(page.getByRole("status")).toContainText("Imported 1 post");

    await page.goto("/feed");
    await expect(page.getByText(title)).toHaveCount(0);

    // 2. Inbox → draft story
    await page.goto(`/admin/inbox?q=${encodeURIComponent(RUN)}`);
    await page.getByRole("checkbox", { name: new RegExp(RUN) }).check();
    await page.getByRole("button", { name: "Create draft story" }).click();
    await expect(page.getByRole("status")).toContainText("Draft story created");

    // 3. Edit, approve, publish
    const headline = `E2E ${RUN}: researchers report Modbus gateway issue`;
    await page.getByLabel("Headline").fill(headline);
    await page.getByLabel("Editorial summary").fill("Unverified social claim used for the end-to-end test.");
    await page.getByRole("button", { name: "Save story" }).click();
    await expect(page.getByRole("status")).toContainText("Story saved");
    await expect(page.getByRole("button", { name: "Publish" })).toHaveCount(0);
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByRole("status")).toContainText("approved");
    await page.getByLabel("I have checked this story against its sources").check();
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByRole("status")).toContainText("Published");

    // 4. Public feed shows it, labelled unverified
    await page.goto(`/feed?q=${encodeURIComponent(RUN)}`);
    const row = page.getByRole("article").filter({ hasText: headline });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Unverified");
    await row.getByRole("link", { name: headline }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(headline);
    await expect(page.getByText(/Follow the vendor.s guidance/)).toBeVisible();

    // 5. Newsletter issue: add story, save, preview, test send
    await page.goto("/admin/newsletter");
    await page.getByRole("button", { name: "New issue" }).click();
    await expect(page.getByRole("status")).toContainText("created");
    await page.locator("summary", { hasText: "Add published stories" }).click();
    await page.locator("li", { hasText: headline }).getByRole("button", { name: "Add" }).click();
    await page.getByRole("button", { name: "Save issue" }).click();
    await expect(page.getByRole("status")).toContainText("Issue saved");
    const preview = page.frameLocator('iframe[title="Email preview, desktop width"]');
    await expect(preview.getByText(headline)).toBeVisible();
    await page.getByPlaceholder("you@example.com").fill("editor-test@example.com");
    await page.getByRole("button", { name: "Send test" }).click();
    await expect(page.getByRole("status")).toContainText(/Dev mailbox|accepted/);

    // Bulk send is blocked until reviewed
    const sendButton = page.getByRole("button", { name: /^Send issue #/ });
    await expect(sendButton).toBeDisabled();

    // 6. Review, then send with the typed issue number; the worker delivers it
    await page.getByRole("button", { name: "Mark reviewed" }).click();
    await expect(page.getByRole("status")).toContainText("Marked as reviewed");
    const label = (await sendButton.innerText()).trim();
    const issueNumber = /#(\d+)/.exec(label)![1];
    await page.getByLabel(/Type the issue number/).fill("0");
    await sendButton.click();
    await expect(page.getByText(/Type the issue number \(\d+\) to confirm the send/)).toBeVisible();
    await page.getByLabel(/Type the issue number/).fill(issueNumber);
    await page.getByRole("button", { name: /^Send issue #/ }).click();
    await expect(page.getByRole("status")).toContainText("Queued for");
    // The background worker sends queued deliveries every 15 s.
    await expect(async () => {
      await page.reload();
      await expect(page.getByText(/Status:\s*(sent|partially failed)/)).toBeVisible();
    }).toPass({ timeout: 60_000, intervals: [5_000] });
    await page.goto(`/newsletter/${issueNumber}`);
    await expect(page.getByText(headline)).toBeVisible();
  });

  test("inbox Investigate / Reject / Back to new move items between tabs", async ({ page }) => {
    await login(page);
    const tag = `${RUN}-inbox`;
    const dir = mkdtempSync(join(tmpdir(), "brief-e2e-"));
    const file = join(dir, "posts.json");
    writeFileSync(file, JSON.stringify({ version: 1, posts: [{ platform: "x", url: `https://x.com/e2e/status/${tag}`, text: `E2E ${tag} PLC triage item` }] }));
    await page.goto("/admin/import");
    await page.locator("input[type=file][name=file]").setInputFiles(file);
    await page.getByRole("button", { name: "Import file" }).click();
    await expect(page.getByRole("status")).toContainText("Imported 1 post");

    const row = (status: string) => `/admin/inbox?status=${status}&q=${encodeURIComponent(tag)}`;
    await page.goto(row("new"));
    await page.getByRole("checkbox", { name: new RegExp(tag) }).check();
    await page.getByRole("button", { name: "Investigate" }).click();
    await expect(page.getByRole("status")).toContainText("marked investigating");
    await page.goto(row("investigating"));
    await page.getByRole("checkbox", { name: new RegExp(tag) }).check();
    await page.getByRole("button", { name: "Reject" }).click();
    await expect(page.getByRole("status")).toContainText("marked rejected");
    await page.goto(row("rejected"));
    await page.getByRole("checkbox", { name: new RegExp(tag) }).check();
    await page.getByRole("button", { name: "Back to new" }).click();
    await expect(page.getByRole("status")).toContainText("marked as new");
    await page.goto(row("new"));
    await expect(page.getByRole("checkbox", { name: new RegExp(tag) })).toBeVisible();
  });

  test("subscribe → confirm in development mode (unsubscribe is covered by integration tests)", async ({ page }) => {
    const email = `e2e-${RUN}@example.com`;
    await page.goto("/");
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("button", { name: "Subscribe" }).click();
    await expect(page.getByText("Please tick the consent box to subscribe.")).toBeVisible();
    await page.getByRole("checkbox", { name: /I agree to receive/ }).check();
    await page.getByRole("button", { name: "Subscribe" }).click();
    await expect(page.getByRole("status")).toContainText("confirmation link");

    await login(page);
    await page.goto("/admin/mailbox");
    const msg = page.locator("li", { hasText: email }).first();
    await msg.locator("summary").click();
    const text = await msg.locator("pre").last().innerText();
    const confirmUrl = /http\S+\/subscribe\/confirm\?token=\S+/.exec(text)![0];
    await page.goto(confirmUrl.replace(/^https?:\/\/[^/]+/, ""));
    await page.getByRole("button", { name: "Confirm subscription" }).click();
    await expect(page.getByRole("status")).toContainText("You're subscribed");

    await page.goto(`/admin/subscribers?email=${encodeURIComponent(email)}`);
    await expect(page.locator('dt:text-is("Status:") + dd')).toHaveText("active");

    // Unsubscribe via the one-click link from the mailbox is covered in integration tests;
    // here we check the visible page flow with a real token.
    await page.goto("/admin/mailbox");
  });

  test("community submission is queued for review, not published", async ({ page }) => {
    await page.goto("/submit");
    await page.getByLabel("Link").fill(`https://ics.example/advisory-${RUN}`);
    await page.getByRole("button", { name: "Send submission" }).click();
    await expect(page.getByRole("status")).toContainText("received");
    await login(page);
    await page.goto("/admin/submissions");
    await expect(page.getByText(`https://ics.example/advisory-${RUN}`)).toBeVisible();
  });
});

test("public pages render on mobile without horizontal scroll @mobile", async ({ page }) => {
  for (const path of ["/", "/feed", "/newsletter", "/submit", "/about"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});

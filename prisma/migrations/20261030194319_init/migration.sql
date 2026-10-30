-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('rss', 'atom', 'json', 'social_import', 'submission');

-- CreateEnum
CREATE TYPE "TrustLevel" AS ENUM ('primary_vendor', 'government_cert', 'research', 'news', 'social', 'community');

-- CreateEnum
CREATE TYPE "FetchStatus" AS ENUM ('ok', 'http_error', 'timeout', 'parse_error', 'blocked', 'ssrf_rejected', 'too_large', 'network_error');

-- CreateEnum
CREATE TYPE "InboxStatus" AS ENUM ('new', 'investigating', 'rejected', 'used');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('unverified', 'partially_verified', 'verified_primary');

-- CreateEnum
CREATE TYPE "EditorialStatus" AS ENUM ('draft', 'approved', 'published', 'rejected');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('draft', 'reviewed', 'sending', 'sent', 'partially_failed');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'accepted', 'failed');

-- CreateEnum
CREATE TYPE "SubscriberStatus" AS ENUM ('pending', 'active', 'unsubscribed', 'bounced');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('pending', 'promoted', 'rejected', 'spam');

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfSecret" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SourceType" NOT NULL DEFAULT 'rss',
    "url" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "category" TEXT NOT NULL DEFAULT 'general',
    "trustLevel" "TrustLevel" NOT NULL DEFAULT 'news',
    "pollIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastStatus" "FetchStatus",
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "etag" TEXT,
    "lastModified" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FetchRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "FetchStatus" NOT NULL,
    "httpStatus" INTEGER,
    "itemsSeen" INTEGER NOT NULL DEFAULT 0,
    "itemsNew" INTEGER NOT NULL DEFAULT 0,
    "itemsUpdated" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "trigger" TEXT NOT NULL DEFAULT 'schedule',

    CONSTRAINT "FetchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DuplicateGroup" (
    "id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuplicateGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectedItem" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "guid" TEXT NOT NULL,
    "url" TEXT,
    "canonicalUrl" TEXT,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "author" TEXT,
    "publishedAt" TIMESTAMP(3),
    "sourceUpdatedAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contentHash" TEXT NOT NULL,
    "extractedIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "relevanceScore" INTEGER NOT NULL DEFAULT 0,
    "relevanceBreakdown" JSONB,
    "inboxStatus" "InboxStatus" NOT NULL DEFAULT 'new',
    "duplicateGroupId" TEXT,
    "suggestedGroupIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "socialMeta" JSONB,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CollectedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemRevision" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "previousTitle" TEXT NOT NULL,
    "previousExcerpt" TEXT,
    "previousHash" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "whyItMatters" TEXT NOT NULL DEFAULT '',
    "defensiveGuidance" TEXT NOT NULL DEFAULT '',
    "guidanceSource" TEXT NOT NULL DEFAULT '',
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "vendors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "products" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "affectedVersions" TEXT,
    "cveIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "advisoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'unverified',
    "editorialStatus" "EditorialStatus" NOT NULL DEFAULT 'draft',
    "aiAssisted" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorySource" (
    "storyId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,

    CONSTRAINT "StorySource_pkey" PRIMARY KEY ("storyId","itemId")
);

-- CreateTable
CREATE TABLE "NewsletterIssue" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "previewText" TEXT NOT NULL DEFAULT '',
    "intro" TEXT NOT NULL DEFAULT '',
    "footer" TEXT NOT NULL DEFAULT '',
    "status" "IssueStatus" NOT NULL DEFAULT 'draft',
    "sendIdempotencyKey" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "sendStartedAt" TIMESTAMP(3),
    "sendFinishedAt" TIMESTAMP(3),

    CONSTRAINT "NewsletterIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueStory" (
    "issueId" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "IssueStory_pkey" PRIMARY KEY ("issueId","storyId")
);

-- CreateTable
CREATE TABLE "NewsletterDelivery" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "providerMessageId" TEXT,
    "error" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "SubscriberStatus" NOT NULL DEFAULT 'pending',
    "signupSource" TEXT NOT NULL DEFAULT 'website',
    "consentAt" TIMESTAMP(3) NOT NULL,
    "consentTextVersion" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "confirmTokenHash" TEXT,
    "confirmTokenExpires" TIMESTAMP(3),
    "unsubscribeTokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "note" TEXT,
    "contactEmail" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'pending',
    "ipHash" TEXT,
    "itemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevOutboxMessage" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "headers" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevOutboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KevEntry" (
    "cveId" TEXT NOT NULL,
    "vendor" TEXT,
    "product" TEXT,
    "dateAdded" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KevEntry_pkey" PRIMARY KEY ("cveId")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_adminId_idx" ON "Session"("adminId");

-- CreateIndex
CREATE UNIQUE INDEX "Source_url_key" ON "Source"("url");

-- CreateIndex
CREATE INDEX "FetchRun_sourceId_startedAt_idx" ON "FetchRun"("sourceId", "startedAt");

-- CreateIndex
CREATE INDEX "CollectedItem_canonicalUrl_idx" ON "CollectedItem"("canonicalUrl");

-- CreateIndex
CREATE INDEX "CollectedItem_inboxStatus_collectedAt_idx" ON "CollectedItem"("inboxStatus", "collectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CollectedItem_sourceId_guid_key" ON "CollectedItem"("sourceId", "guid");

-- CreateIndex
CREATE UNIQUE INDEX "Story_slug_key" ON "Story"("slug");

-- CreateIndex
CREATE INDEX "Story_editorialStatus_publishedAt_idx" ON "Story"("editorialStatus", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterIssue_number_key" ON "NewsletterIssue"("number");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterIssue_sendIdempotencyKey_key" ON "NewsletterIssue"("sendIdempotencyKey");

-- CreateIndex
CREATE INDEX "NewsletterDelivery_issueId_status_idx" ON "NewsletterDelivery"("issueId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterDelivery_issueId_subscriberId_key" ON "NewsletterDelivery"("issueId", "subscriberId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscriber_email_key" ON "Subscriber"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Subscriber_confirmTokenHash_key" ON "Subscriber"("confirmTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Subscriber_unsubscribeTokenHash_key" ON "Subscriber"("unsubscribeTokenHash");

-- CreateIndex
CREATE INDEX "AuditEvent_objectType_objectId_idx" ON "AuditEvent"("objectType", "objectId");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FetchRun" ADD CONSTRAINT "FetchRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectedItem" ADD CONSTRAINT "CollectedItem_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectedItem" ADD CONSTRAINT "CollectedItem_duplicateGroupId_fkey" FOREIGN KEY ("duplicateGroupId") REFERENCES "DuplicateGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRevision" ADD CONSTRAINT "ItemRevision_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CollectedItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorySource" ADD CONSTRAINT "StorySource_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorySource" ADD CONSTRAINT "StorySource_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CollectedItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueStory" ADD CONSTRAINT "IssueStory_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "NewsletterIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueStory" ADD CONSTRAINT "IssueStory_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsletterDelivery" ADD CONSTRAINT "NewsletterDelivery_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "NewsletterIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsletterDelivery" ADD CONSTRAINT "NewsletterDelivery_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

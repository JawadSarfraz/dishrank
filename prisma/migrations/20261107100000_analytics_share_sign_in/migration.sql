-- Share clicks and sign-ins, counted per day with no user (docs/06 POST /api/v1/events).
-- AlterEnum
ALTER TYPE "AnalyticsEventName" ADD VALUE 'SHARE_CLICK';
ALTER TYPE "AnalyticsEventName" ADD VALUE 'SIGN_IN_STARTED';
ALTER TYPE "AnalyticsEventName" ADD VALUE 'SIGN_IN_COMPLETED';
ALTER TYPE "AnalyticsEventName" ADD VALUE 'IN_APP_SIGN_IN_STARTED';
ALTER TYPE "AnalyticsEventName" ADD VALUE 'IN_APP_LEFT_BROWSER';
ALTER TYPE "AnalyticsEventName" ADD VALUE 'IN_APP_SIGN_IN_COMPLETED';

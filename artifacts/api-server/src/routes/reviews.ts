import { Router, type IRouter, type Request, type Response } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { requireAdmin } from "../adminAuth";
import {
  isPublishedReviewProduct, listModerationReviews, listProductReviews, moderateReview,
  moderationInput, reviewInput, reviewUpdateInput, ReviewConflictError, saveProductReview,
  getOwnProductReview, OwnReviewNotFoundError, ReviewPurchaseError,
} from "../productReviews";
import { hasQualifyingReviewPurchase } from "../reviewEligibility";

const router: IRouter = Router();
router.use(["/products/:productId/reviews", "/products/:productId/review-access", "/admin/reviews"], (_request, response, next) => {
  response.set("Cache-Control", "no-store");
  next();
});
const positiveInt = (value: unknown) => typeof value === "string" && /^[1-9]\d{0,8}$/.test(value) ? Number(value) : null;
const pageValue = (value: unknown) => value === undefined ? 1 : positiveInt(value);
const windows = new Map<string, { count: number; expires: number }>();

router.get("/products/:productId/reviews", async (request, response) => {
  const productId = positiveInt(request.params.productId);
  const page = pageValue(request.query.page);
  if (!productId || !page) return response.status(400).json({ error: "Choose a valid product and page." });
  try {
    if (!await isPublishedReviewProduct(productId)) return response.status(404).json({ error: "Product not found." });
    return response.json(await listProductReviews(productId, page));
  } catch {
    request.log?.error("Product reviews could not be loaded");
    return response.status(503).json({ error: "Reviews could not be loaded. Please try again." });
  }
});

router.get("/products/:productId/review-access", async (request, response) => {
  response.set("Cache-Control", "private, no-store");
  const { userId } = getAuth(request);
  if (!userId) return response.status(401).json({ error: "Sign in to review this product." });
  const productId = positiveInt(request.params.productId);
  if (!productId) return response.status(400).json({ error: "Choose a valid product." });
  try {
    if (!await isPublishedReviewProduct(productId)) return response.status(404).json({ error: "Product not found." });
    return response.json(await getOwnProductReview(userId, productId));
  } catch (error) {
    if (error instanceof ReviewPurchaseError) return response.status(403).json({ error: error.message });
    request.log?.error("Review eligibility could not be checked");
    return response.status(503).json({ error: "We could not check your review eligibility. Please try again." });
  }
});

async function submitReview(request: Request, response: Response, editing: boolean) {
  response.set("Cache-Control", "private, no-store");
  const { userId } = getAuth(request);
  if (!userId) return response.status(401).json({ error: "Sign in to review this product." });
  const productId = positiveInt(request.params.productId);
  if (!productId) return response.status(400).json({ error: "Choose a valid product." });
  const now = Date.now();
  // Bounded, transient abuse guard. DB unique keys remain the authoritative
  // duplicate protection across processes and restarts.
  for (const [key, entry] of windows) if (entry.expires <= now) windows.delete(key);
  const key = userId;
  const window = windows.get(key);
  if (window && window.count >= 15) return response.status(429).json({ error: "Too many reviews were submitted. Please wait 15 minutes and try again." });
  if (windows.size >= 10000 && !window) return response.status(429).json({ error: "Please try again in a few minutes." });
  windows.set(key, { count: (window?.count ?? 0) + 1, expires: window?.expires ?? now + 15 * 60 * 1000 });
  try {
    if (!await isPublishedReviewProduct(productId)) return response.status(404).json({ error: "Product not found." });
    if (!await hasQualifyingReviewPurchase(userId, productId)) return response.status(403).json({ error: "Only customers with a qualifying purchase can review this product." });
    const parsed = (editing ? reviewUpdateInput : reviewInput).safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: "Choose 1–5 stars and enter a review title, review text, and a valid display name." });
    let displayName = parsed.data.displayName;
    const account = await clerkClient.users.getUser(userId);
    // First name or public username only. Never derive a name from email.
    displayName = (account.firstName?.trim() || account.username?.trim() || displayName)?.slice(0, 80);
    if (!displayName?.trim()) return response.status(400).json({ error: "Enter the name you would like displayed with your review." });
    await saveProductReview(userId, productId, { ...parsed.data, displayName: displayName.trim() }, editing);
    return response.status(202).json({ message: editing
      ? "Your edited review has been saved and is pending approval. It is not public until approved again."
      : "Thank you. Your review has been received and will appear after approval." });
  } catch (error) {
    if (error instanceof ReviewConflictError) return response.status(409).json({ error: error.message });
    if (error instanceof ReviewPurchaseError) return response.status(403).json({ error: error.message });
    if (error instanceof OwnReviewNotFoundError) return response.status(404).json({ error: error.message });
    request.log?.error("Product review could not be saved");
    return response.status(503).json({ error: "We could not confirm your review was saved. Your details are still in the form; please retry." });
  }
}
router.post("/products/:productId/reviews", (request, response) => submitReview(request, response, false));
router.patch("/products/:productId/reviews/mine", (request, response) => submitReview(request, response, true));

router.get("/admin/reviews", requireAdmin, async (request, response) => {
  const status = moderationInput.shape.status.safeParse(request.query.status ?? "pending");
  const page = pageValue(request.query.page);
  if (!status.success || !page) return response.status(400).json({ error: "Choose a valid review status and page." });
  try { return response.json(await listModerationReviews(status.data, page)); }
  catch {
    request.log?.error("Review moderation queue could not be loaded");
    return response.status(503).json({ error: "The review queue could not be loaded. Please try again." });
  }
});
router.patch("/admin/reviews/:reviewId", requireAdmin, async (request, response) => {
  response.set("Cache-Control", "no-store");
  const id = positiveInt(request.params.reviewId);
  const status = moderationInput.safeParse(request.body);
  if (!id || !status.success) return response.status(400).json({ error: "Choose a valid review and moderation status." });
  try {
    if (!await moderateReview(id, status.data.status)) return response.status(404).json({ error: "Review not found." });
    return response.json({ message: `Review ${status.data.status === "pending" ? "returned to pending" : status.data.status}.` });
  } catch (error) {
    if (error instanceof ReviewPurchaseError) return response.status(403).json({ error: error.message });
    request.log?.error("Review moderation could not be saved");
    return response.status(503).json({ error: "The moderation decision could not be saved. Please try again." });
  }
});

export default router;

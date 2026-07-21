import { Request, Response } from "express";
import { UploadApiResponse } from "cloudinary";
import { prisma } from "../lib/prisma";
import { cloudinary } from "../lib/cloudinary";
import { AppError } from "../utils/AppError";

// Cloudinary's upload_stream is callback-based — wrap it in a Promise so
// the controller can `await` it like every other async call in this
// codebase, instead of mixing callback and async/await styles.
function uploadBufferToCloudinary(buffer: Buffer, folder: string): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder, resource_type: "image" }, (error, result) => {
      if (error || !result) return reject(error ?? new Error("Cloudinary upload failed"));
      resolve(result);
    });
    stream.end(buffer);
  });
}

export async function uploadPlaceImage(req: Request, res: Response) {
  const { placeId } = req.params;

  // multer populates req.file for a single-file upload (upload.single()).
  // If this is missing, the client sent the request without a file field
  // named "image", or sent the wrong field name.
  if (!req.file) {
    throw new AppError("No image file was uploaded (expected field name 'image')", 400);
  }

  const place = await prisma.place.findUnique({
    where: { id: placeId },
    select: { id: true, ownerId: true },
  });
  if (!place) throw new AppError("Place not found", 404);

  // requireRole already confirmed the caller is an OWNER or ADMIN in
  // general — this confirms they own THIS specific place. An OWNER
  // account shouldn't be able to upload images to someone else's listing
  // just because both accounts share the OWNER role.
  const isAdmin = ["ADMIN", "OWNER"].includes(req.user!.role);
  if (!isAdmin && place.ownerId !== req.user!.userId) {
    throw new AppError("You don't have permission to modify this place", 403);
  }

  const result = await uploadBufferToCloudinary(req.file.buffer, `huye-finds/places/${placeId}`);
  console.log(result);

  // The first image uploaded for a place becomes its cover automatically.
  // After that, isCover has to be set explicitly — a "set as cover"
  // endpoint would be the natural next piece of work here, not built yet.
  const existingCount = await prisma.placeImage.count({ where: { placeId } });

  const image = await prisma.placeImage.create({
    data: {
      placeId,
      url: result.secure_url,
      altText: typeof req.body.altText === "string" ? req.body.altText : "",
      isCover: existingCount === 0,
      sortOrder: existingCount,
    },
  });

  res.status(201).json(image);
}

export async function deletePlaceImage(req: Request, res: Response) {
  const { placeId, imageId } = req.params;

  const image = await prisma.placeImage.findUnique({
    where: { id: imageId },
    include: { place: { select: { ownerId: true } } },
  });
  if (!image || image.placeId !== placeId) throw new AppError("Image not found", 404);

  const isAdmin = req.user!.role === "ADMIN";
  if (!isAdmin && image.place.ownerId !== req.user!.userId) {
    throw new AppError("You don't have permission to modify this place", 403);
  }

  // Cloudinary needs the public_id, not the full URL, to delete an asset.
  // It's the folder path + filename without extension — derived from the
  // URL rather than stored separately, since we control the folder
  // structure and it's deterministic.
  const publicId = image.url.split("/upload/")[1]?.replace(/^v\d+\//, "").replace(/\.[^/.]+$/, "");
  if (publicId) {
    await cloudinary.uploader.destroy(publicId).catch((err) => {
      // Don't let a Cloudinary hiccup block deleting the DB record — an
      // orphaned Cloudinary asset costs nothing but disk space on their
      // side; a stuck "can't delete this image" UI is worse for the user.
      console.error("Cloudinary delete failed (continuing anyway):", err);
    });
  }

  await prisma.placeImage.delete({ where: { id: imageId } });
  res.json({ success: true });
}

// Uploads a single image with no placeId attached yet — used while a place
// is still being drafted in the create form, before it exists as a DB
// row. The frontend collects these URLs client-side and sends them along
// with the createPlace request, which attaches them to the new place in
// one atomic write. Nothing is written to the DB here at all; if the
// person abandons the form after uploading, the asset is orphaned in
// Cloudinary — acceptable for now, a scheduled cleanup job (delete
// anything in huye-finds/staging/ older than 24h with no matching
// PlaceImage.url) would be the real fix if this becomes a problem.
export async function uploadStagingImage(req: Request, res: Response) {
  if (!req.file) {
    throw new AppError("No image file was uploaded (expected field name 'image')", 400);
  }

  const result = await uploadBufferToCloudinary(req.file.buffer, `huye-finds/staging/${req.user!.userId}`);

  res.status(201).json({ url: result.secure_url });
}
import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

const SITE_URL = (process.env.SITE_URL ?? "http://localhost:5173").replace(
  /\/$/,
  "",
);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}…`;
}

function ogHtml({
  title,
  description,
  image,
  canonicalUrl,
}: {
  title: string;
  description: string;
  image?: string;
  canonicalUrl: string;
}) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeUrl = escapeHtml(canonicalUrl);
  const imageTag = image
    ? `
  <meta property="og:image" content="${escapeHtml(image)}" />
  <meta property="og:image:secure_url" content="${escapeHtml(image)}" />
  <meta property="og:image:alt" content="${safeTitle}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:image" content="${escapeHtml(image)}" />
  <meta name="twitter:image:alt" content="${safeTitle}" />`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDescription}" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDescription}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${safeUrl}" />
  ${imageTag}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDescription}" />
  <meta http-equiv="refresh" content="0;url=${safeUrl}" />
</head>
<body>
  <p><a href="${safeUrl}">Open on Huye Finds</a></p>
</body>
</html>`;
}

function cldOg(url: string): string {
  const marker = "/upload/";
  const idx = url.indexOf(marker);
  if (idx === -1) return url;

  const insertAt = idx + marker.length;
  return `${url.slice(0, insertAt)}w_1200,h_630,c_fill,q_auto,f_auto/${url.slice(insertAt)}`;
}

export async function ogPlace(req: Request, res: Response) {
  const { slug } = req.params;

  const place = await prisma.place.findUnique({
    where: { slug },
    include: {
      subcategory: { select: { name: true } },
      images: { where: { isCover: true }, take: 1 },
    },
  });

  if (!place || !place.isActive || place.verificationStatus === "SUSPENDED") {
    res.status(404).send("Not found");
    return;
  }

  const canonicalUrl = `${SITE_URL}/places/${slug}`;
  const description = truncate(
    place.description ||
      `${place.subcategory.name} near ${place.landmark} on Huye Finds`,
    200,
  );
  const image = place.images[0]?.url
    ? cldOg(place.images[0].url)
    : undefined;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(
    ogHtml({
      title: `${place.name} — Huye Finds`,
      description,
      image,
      canonicalUrl,
    }),
  );
}

export async function ogHubPost(req: Request, res: Response) {
  const { id } = req.params;

  const post = await prisma.hubPost.findUnique({
    where: { id },
    include: {
      images: { where: { isCover: true }, take: 1 },
    },
  });

  if (!post || post.status !== "APPROVED") {
    res.status(404).send("Not found");
    return;
  }

  const canonicalUrl = `${SITE_URL}/students-hub/${id}`;
  const priceSuffix =
    post.price != null ? ` · ${post.price.toLocaleString("en-RW")} RWF` : "";
  const description = truncate(`${post.description}${priceSuffix}`, 200);
  const image = post.images[0]?.url ? cldOg(post.images[0].url) : undefined;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(
    ogHtml({
      title: `${post.title} — Students Hub`,
      description,
      image,
      canonicalUrl,
    }),
  );
}

export async function ogStudentsHub(_req: Request, res: Response) {
  const canonicalUrl = `${SITE_URL}/students-hub`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(
    ogHtml({
      title: "Students Hub — Huye Finds",
      description:
        "Find deals, side hustles, events, lost items, and campus announcements shared by students.",
      canonicalUrl,
    }),
  );
}

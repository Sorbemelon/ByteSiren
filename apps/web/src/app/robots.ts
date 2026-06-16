import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/debug/"],
    },
    sitemap: "https://bytesiren.pages.dev/sitemap.xml",
  };
}

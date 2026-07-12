import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const categories = await Promise.all(
    [
      { name: "Restaurants", slug: "restaurants", icon: "plate", sortOrder: 1 },
      { name: "Grocery Stores", slug: "grocery", icon: "basket", sortOrder: 2 },
      { name: "Pharmacies", slug: "pharmacies", icon: "cross", sortOrder: 3 },
      { name: "Printing Shops", slug: "printing", icon: "printer", sortOrder: 4 },
    ].map((c) =>
      prisma.category.upsert({ where: { slug: c.slug }, create: c, update: c })
    )
  );

  const restaurants = categories.find((c) => c.slug === "restaurants")!;

  const amahoro = await prisma.place.upsert({
    where: { slug: "amahoro-canteen" },
    update: {},
    create: {
      name: "Amahoro Canteen",
      slug: "amahoro-canteen",
      description:
        "A student-favorite canteen two minutes from the Huye main gate, known for generous rice-and-beans plates and fast service between lectures.",
      categoryId: restaurants.id,
      priceMin: 500,
      priceMax: 2000,
      contactPhone: "+250788214903",
      landmark: "Near UR Huye main gate",
      isFeatured: true,
      images: {
        create: [
          { url: "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=800&q=80", altText: "Amahoro Canteen dining area", isCover: true, sortOrder: 0 },
          { url: "https://images.unsplash.com/photo-1541833602-79b7dc98ffe4?w=800&q=80", altText: "Rice and beans plate", sortOrder: 1 },
        ],
      },
      menuItems: {
        create: [
          { name: "Rice, beans & vegetables", price: 800, note: "Most ordered · takeaway available", sortOrder: 0 },
          { name: "Ugali with isombe", price: 600, note: "Vegetarian", sortOrder: 1 },
          { name: "Chicken brochette & chips", price: 2000, note: "Weekend special", sortOrder: 2 },
        ],
      },
      hours: {
        create: [
          { dayOfWeek: "MONDAY", openTime: "07:00", closeTime: "21:00" },
          { dayOfWeek: "TUESDAY", openTime: "07:00", closeTime: "21:00" },
          { dayOfWeek: "WEDNESDAY", openTime: "07:00", closeTime: "21:00" },
          { dayOfWeek: "THURSDAY", openTime: "07:00", closeTime: "21:00" },
          { dayOfWeek: "FRIDAY", openTime: "07:00", closeTime: "21:00" },
          { dayOfWeek: "SATURDAY", openTime: "08:00", closeTime: "21:00" },
          { dayOfWeek: "SUNDAY", openTime: "09:00", closeTime: "18:00" },
        ],
      },
    },
  });

  console.log("Seeded categories:", categories.map((c) => c.slug).join(", "));
  console.log("Seeded place:", amahoro.slug);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

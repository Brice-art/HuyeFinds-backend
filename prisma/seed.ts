import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Students Hub is deliberately NOT in this taxonomy — it's a different
// content type (posts/classifieds, not places with prices and hours) and
// gets its own future model. See the schema comment on Subcategory.
const TAXONOMY = [
  {
    name: "Food & Drinks",
    slug: "food-drinks",
    icon: "food",
    sortOrder: 1,
    subcategories: [
      { name: "Restaurants", slug: "restaurants", icon: "plate", sortOrder: 1 },
      { name: "Bars", slug: "bars", icon: "drink", sortOrder: 2 },
      { name: "Cafes", slug: "cafes", icon: "cup", sortOrder: 3 },
    ],
  },
  {
    name: "Shopping",
    slug: "shopping",
    icon: "bag",
    sortOrder: 2,
    subcategories: [
      { name: "Electronics", slug: "electronics", icon: "device", sortOrder: 1 },
      { name: "Clothing", slug: "clothing", icon: "shirt", sortOrder: 2 },
      { name: "Boutique", slug: "boutique", icon: "bag", sortOrder: 3 },
      { name: "Vegetables & Fruits", slug: "vegetables-fruits", icon: "basket", sortOrder: 4 },
      { name: "Second Hand", slug: "second-hand", icon: "recycle", sortOrder: 5 },
    ],
  },
  {
    name: "Services",
    slug: "services",
    icon: "tools",
    sortOrder: 3,
    subcategories: [
      { name: "Gas Filling", slug: "gas-filling", icon: "fuel", sortOrder: 1 },
      { name: "Salons", slug: "salons", icon: "scissors", sortOrder: 2 },
      { name: "Printing", slug: "printing", icon: "printer", sortOrder: 3 },
      { name: "Laundry", slug: "laundry", icon: "washer", sortOrder: 4 },
      { name: "Repairs", slug: "repairs", icon: "wrench", sortOrder: 5 },
      { name: "Photography", slug: "photography", icon: "camera", sortOrder: 6 },
    ],
  },
  {
    name: "Accommodation",
    slug: "accommodation",
    icon: "building",
    sortOrder: 4,
    subcategories: [
      { name: "Ghetto", slug: "ghetto", icon: "home", sortOrder: 1 },
      { name: "Hotels & Motels", slug: "hotels-motels", icon: "building", sortOrder: 2 },
      { name: "Hostels", slug: "hostels", icon: "bunk", sortOrder: 3 },
      { name: "Apartments", slug: "apartments", icon: "building", sortOrder: 4 },
    ],
  },
];

async function main() {
  const seededSubcategorySlugs: string[] = [];

  for (const cat of TAXONOMY) {
    const { subcategories, ...catFields } = cat;
    const category = await prisma.category.upsert({
      where: { slug: catFields.slug },
      create: catFields,
      update: catFields,
    });

    for (const sub of subcategories) {
      await prisma.subcategory.upsert({
        where: { slug: sub.slug },
        create: { ...sub, categoryId: category.id },
        update: { ...sub, categoryId: category.id },
      });
      seededSubcategorySlugs.push(sub.slug);
    }
  }

  const restaurants = await prisma.subcategory.findUniqueOrThrow({ where: { slug: "restaurants" } });

  const amahoro = await prisma.place.upsert({
    where: { slug: "amahoro-canteen" },
    update: {},
    create: {
      name: "Amahoro Canteen",
      slug: "amahoro-canteen",
      description:
        "A student-favorite canteen two minutes from the Huye main gate, known for generous rice-and-beans plates and fast service between lectures.",
      subcategoryId: restaurants.id,
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

  console.log("Seeded categories:", TAXONOMY.map((c) => c.slug).join(", "));
  console.log("Seeded subcategories:", seededSubcategorySlugs.join(", "));
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
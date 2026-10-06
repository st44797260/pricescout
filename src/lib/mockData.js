/**
 * 模拟产品数据生成器。
 * 生成结构与 Edge Function 真实抓取结果一致的 RawProduct，
 * 供本地模拟后端在未配置 Supabase 时使用。
 */

const PRODUCT_NAMES = [
  'Insulated Stainless Steel Water Bottle',
  'Wireless Noise-Cancelling Earbuds',
  'Memory Foam Contour Pillow',
  'LED Strip Lights with Remote',
  'Portable USB Mini Blender',
  'Aluminum Ergonomic Laptop Stand',
  'Mulberry Silk Pillowcase',
  'Resistance Bands Set (5-Pack)',
  '1080p Mini Projector',
  'Rechargeable Heated Eyelash Curler',
  'Cordless Electric Spin Scrubber',
  'Sunset Projection Lamp',
  'Magnetic Wireless Power Bank',
  'Hydrocolloid Acne Patches (36 ct)',
  'Dog Chew Rope Toys (5-Pack)',
  'High-Waist Yoga Leggings',
  'Cold Brew Coffee Maker',
  'Non-Stick Silicone Baking Mats',
  'Smart Sleep Tracking Ring',
  'Chunky Knit Throw Blanket',
  'Magnetic Car Vent Phone Mount',
  'UV Resin Jewelry Kit',
  'Adjustable Posture Corrector',
  'Facial Ice Roller',
  'Under-Desk Walking Pad',
  'Collapsible Storage Bins (3-Pack)',
  'Ceramic Nonstick Frying Pan',
  'Aromatherapy Essential Oil Diffuser',
]

const MODIFIERS = [
  'Pro',
  '2026 New',
  'Premium',
  'Classic',
  'Upgraded',
  'Travel Size',
  'Pack of 2',
  '- Black',
  '- White',
  '- 16oz',
]

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

/**
 * 生成 count 条模拟产品，结构与真实抓取一致：
 * { title, price, rating, review_count, image_url, product_url }
 */
export function generateMockProducts(count = 20, baseUrl = '') {
  const used = new Set()
  const products = []
  let i = 0
  while (products.length < count && i < count * 5) {
    i += 1
    const name = pick(PRODUCT_NAMES)
    const title = Math.random() > 0.4 ? `${name} ${pick(MODIFIERS)}` : name
    if (used.has(title)) continue
    used.add(title)
    const slug = slugify(title)
    products.push({
      title,
      price: Number((4.99 + Math.random() * 75).toFixed(2)),
      rating: Number((3.6 + Math.random() * 1.4).toFixed(1)),
      review_count: Math.floor(Math.random() * 5200),
      image_url: `https://picsum.photos/seed/${slug}-${i}/400/400`,
      product_url: baseUrl ? `${baseUrl}/products/${slug}` : null,
    })
  }
  return products
}

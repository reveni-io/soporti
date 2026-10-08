export async function mapWithConcurrency(items, limit, mapItem) {
  const results = new Array(items.length)
  let next = 0

  async function work() {
    while (next < items.length) {
      const index = next++
      results[index] = await mapItem(items[index])
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, work))

  return results
}

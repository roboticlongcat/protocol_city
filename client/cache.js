const CACHE_KEY = "protocol_city_cached_zones";

export function cacheNearby(zones, playerPosition, percent = 0.1) {
  if (!zones.length) return [];

  const sorted = zones
    .map((zone) => ({
      zone,
      dist: Math.hypot(
        zone.x - playerPosition.x,
        zone.z - playerPosition.z
      ),
    }))
    .sort((a, b) => a.dist - b.dist);

  const count = Math.max(1, Math.ceil(zones.length * percent));
  const cached = sorted.slice(0, count).map((item) => item.zone.slug);

  localStorage.setItem(CACHE_KEY, JSON.stringify(cached));

  console.log(`Кэшировано ${count} зон(ы):`, cached);

  return cached;
}

export function getCachedZones() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
  } catch {
    return [];
  }
}
function parsePagination(query = {}) {
  const rawLimit = query.limit === undefined ? 50 : Number(query.limit);
  const rawOffset = query.offset === undefined ? 0 : Number(query.offset);

  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100) {
    throw new Error("limit must be an integer between 1 and 100");
  }
  if (!Number.isInteger(rawOffset) || rawOffset < 0) {
    throw new Error("offset must be a non-negative integer");
  }

  return { limit: rawLimit, offset: rawOffset };
}

module.exports = { parsePagination };
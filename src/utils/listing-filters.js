// IDs support Home links; readable category names also support shared URLs.
export function categorySlug(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function readListingFilters(search) {
  const params = new URLSearchParams(search);
  const sort = params.get('sort');
  return {
    search: (params.get('search') ?? params.get('q') ?? '').trim(),
    category: params.get('category') || '',
    sort: ['price-asc', 'price-desc'].includes(sort) ? sort : 'newest',
  };
}

export function resolveCategory(value, categories) {
  return categories.find((category) => category.id === value)
    || categories.find((category) => categorySlug(category.name) === value.toLowerCase());
}

export function filterListings(listings, categories, filters) {
  const category = resolveCategory(filters.category, categories);
  const term = filters.search.toLowerCase();
  const newest = (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id.localeCompare(a.id);
  return listings.filter((listing) => listing.title.toLowerCase().includes(term)
    && (!filters.category || listing.category_id === (category?.id ?? filters.category)))
    .sort((a, b) => {
      const price = Number(a.price) - Number(b.price);
      return (filters.sort === 'price-asc' ? price : filters.sort === 'price-desc' ? -price : 0) || newest(a, b);
    });
}

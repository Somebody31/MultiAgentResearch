// Search seam: research asks for hits; adapters provide them.

export type SearchHit = {
  title: string;
  url: string;
  content: string;
  /** Which adapter produced this hit. */
  source: "web" | "document";
};

/** Anything that can answer: query → hits. */
export type SearchAdapter = {
  name: string;
  search(query: string): Promise<SearchHit[]>;
};

/**
 * Run every adapter and concat hits (adapter order preserved).
 * This is the only function research should call for "search".
 */
export async function searchAll(
  query: string,
  adapters: SearchAdapter[],
): Promise<SearchHit[]> {
  const batches = await Promise.all(
    adapters.map(async (adapter) => adapter.search(query)),
  );
  return batches.flat();
}

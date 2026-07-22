// Document search adapter — stub for now.
// Same seam as web; swap body later for real files / index / vector DB.

import type { SearchAdapter, SearchHit } from "./search.ts";

/**
 * Stub: no real corpus yet.
 * Returns [] so research still works on web hits alone.
 * Replace this implementation when document search exists.
 */
export const docSearch: SearchAdapter = {
  name: "document",

  async search(_query: string): Promise<SearchHit[]> {
    return [];
  },
};

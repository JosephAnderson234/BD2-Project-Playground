import {
  executeDb2QueryEndpoint,
  fetchDb2TablesEndpoint,
  resetDb2MockState,
} from "@src/services/db2-endpoints";
import type { Db2ExecuteQueryResponse, Db2QueryOutcome, Db2Table } from "@src/types/db2";

function cloneCatalog(catalog: Db2Table[]): Db2Table[] {
  return catalog.map((table) => ({
    ...table,
    columns: table.columns.map((column) => ({ ...column })),
    rows: table.rows.map((row) => ({ ...row })),
  }));
}

export async function getInitialCatalog(): Promise<Db2Table[]> {
  const response = await fetchDb2TablesEndpoint();
  return cloneCatalog(response.tables);
}

export async function refreshDb2Catalog(): Promise<Db2Table[]> {
  const response = await fetchDb2TablesEndpoint();
  return cloneCatalog(response.tables);
}

export async function runDb2Query(query: string): Promise<Db2QueryOutcome> {
  const response: Db2ExecuteQueryResponse = await executeDb2QueryEndpoint({ query });
  return {
    catalog: cloneCatalog(response.tables),
    response,
  };
}

export function resetDb2Catalog(): void {
  resetDb2MockState();
}
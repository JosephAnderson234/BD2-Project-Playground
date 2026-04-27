import { db2Catalog } from "@src/lib/db2/catalog";
import { executeDb2Program } from "@src/lib/db2/executor";
import { parseDb2Program } from "@src/lib/db2/parser";
import type {
  Db2ExecuteQueryRequest,
  Db2ExecuteQueryResponse,
  Db2TablesEndpointResponse,
  Db2Table,
} from "@src/types/db2";

let mockCatalog: Db2Table[] = db2Catalog.map((table) => ({
  ...table,
  columns: table.columns.map((column) => ({ ...column })),
  rows: table.rows.map((row) => ({ ...row })),
}));

function cloneCatalog(catalog: Db2Table[]): Db2Table[] {
  return catalog.map((table) => ({
    ...table,
    columns: table.columns.map((column) => ({ ...column })),
    rows: table.rows.map((row) => ({ ...row })),
  }));
}

function delay<T>(value: T): Promise<T> {
  return Promise.resolve(value);
}

export async function fetchDb2TablesEndpoint(): Promise<Db2TablesEndpointResponse> {
  return delay({ source: "mock", tables: cloneCatalog(mockCatalog) });
}

export async function executeDb2QueryEndpoint(request: Db2ExecuteQueryRequest): Promise<Db2ExecuteQueryResponse> {
  const program = parseDb2Program(request.query);
  const execution = executeDb2Program(program, mockCatalog);
  mockCatalog = execution.tables;
  return delay(execution);
}

export function resetDb2MockState(): void {
  mockCatalog = cloneCatalog(db2Catalog);
}
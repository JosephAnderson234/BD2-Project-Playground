import type { Metadata } from "next";

import { Db2Playground } from "@src/components/db2-playground";
import { getInitialCatalog } from "@src/services/db2.service";

export const metadata: Metadata = {
  title: "DB2 Playground",
  description:
    "A focused DB2 query playground for exploring tables, schemas, and query results.",
};

export default async function Home() {
  const initialCatalog = await getInitialCatalog();

  return <Db2Playground initialCatalog={initialCatalog} />;
}
